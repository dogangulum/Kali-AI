// Unit tests for supabase/functions/_shared/lead-agent.ts -- loaded and
// evaluated directly (see loadLeadAgentModule in tests/helpers/webhook-suite.cjs),
// independent of any webhook payload. Covers the core lead-scoring heuristic,
// the minimal Turkish date/time parser, and the processLeadAndBooking
// orchestrator (storage only -- no network, no real Postgres). This is the
// CORE MVP scope only: see docs/LEAD_QUALIFICATION_AND_BOOKING_REQUIREMENTS.md
// and the plan for everything deliberately deferred (escalation handling,
// audit_log/funnel_events, conflict/capacity detection, confirm/reschedule/
// cancel flows, etc.).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadLeadAgentModule, createMockSupabase } = require('./helpers/webhook-suite.cjs');

// A representative config with distinctive service names (mirrors the
// synthetic setup in tests/scenarios/booking-cases.json: "el bakımı" 60 dk /
// 500 TRY, "manikür" 30 dk / 300 TRY) so service-name matching can be
// exercised without relying on the generic DEFAULT_BUSINESS_CONFIG's single
// "Test Hizmeti" entry.
const SALON_CONFIG = {
  language: 'tr-TR',
  currency: 'TRY',
  services: [
    { id: 'el-bakimi', name: 'El Bakımı', duration_minutes: 60, price: { amount: 500 }, active: true },
    { id: 'manikur', name: 'Manikür', duration_minutes: 30, price: { amount: 300 }, active: true },
  ],
};

// Fixed reference instant matching tests/scenarios/booking-cases.json's own
// synthetic clock ("2026-09-22T10:00:00+03:00" == this UTC instant), so
// dates parsed in these tests line up with the same "today" the real
// fixtures assume.
const NOW_MS = Date.UTC(2026, 8, 22, 7, 0, 0); // 2026-09-22T07:00:00Z == 10:00 Europe/Istanbul

// --- scoreLead / classifyLead -----------------------------------------------

test('lead-agent: service name + intent + time scores qualified (>= 60)', () => {
  const { scoreLead, classifyLead } = loadLeadAgentModule();
  const { score, reasons } = scoreLead(
    "El bakımı yaptırmak istiyorum, yarın saat 15:00'te gelebilir miyim?",
    SALON_CONFIG,
    { hasExistingLead: false },
  );
  assert.ok(score >= 60, `expected score >= 60, got ${score}`);
  assert.equal(classifyLead(score), 'qualified');
  assert.ok(reasons.includes('service-name:El Bakımı'));
  assert.ok(reasons.includes('booking-time-signal'));
  assert.ok(reasons.includes('intent-phrase'));
});

test('lead-agent: a bare price question is informational, not qualified', () => {
  const { scoreLead, classifyLead } = loadLeadAgentModule();
  const { score } = scoreLead('Fiyatlarınız ne kadar?', SALON_CONFIG, { hasExistingLead: false });
  assert.equal(classifyLead(score), 'informational');
});

test('lead-agent: a bare greeting is informational, not qualified', () => {
  const { scoreLead, classifyLead } = loadLeadAgentModule();
  const { score } = scoreLead('Merhaba', SALON_CONFIG, { hasExistingLead: false });
  assert.equal(classifyLead(score), 'informational');
});

test('lead-agent: score is clipped to [0, 100] even for a maximal-signal message', () => {
  const { scoreLead } = loadLeadAgentModule();
  const { score } = scoreLead(
    'El bakımı ve manikür için randevu almak istiyorum, ne zaman uygun olur, fiyatı ve dakikası ne kadar?',
    SALON_CONFIG,
    { hasExistingLead: true },
  );
  assert.ok(score <= 100);
  assert.ok(score >= 0);
});

test('lead-agent: an already-qualified conversation gets a repeat-visit bonus', () => {
  const { scoreLead } = loadLeadAgentModule();
  const withoutExisting = scoreLead('Yarın 15:00 uygun mu?', SALON_CONFIG, { hasExistingLead: false });
  const withExisting = scoreLead('Yarın 15:00 uygun mu?', SALON_CONFIG, { hasExistingLead: true });
  assert.ok(withExisting.score > withoutExisting.score);
});

test('lead-agent: matchServiceName finds the business\'s own service name in the message', () => {
  const { matchServiceName } = loadLeadAgentModule();
  assert.equal(matchServiceName('El bakımı ne kadar sürüyor?', SALON_CONFIG), 'El Bakımı');
  assert.equal(matchServiceName('Saç ekimi yapıyor musunuz?', SALON_CONFIG), null);
});

test('lead-agent: isHumanHandoffRequest recognizes an explicit handoff phrase', () => {
  const { isHumanHandoffRequest } = loadLeadAgentModule();
  assert.equal(isHumanHandoffRequest('Lütfen beni bir yetkiliye aktarın.'), true);
  assert.equal(isHumanHandoffRequest('El bakımı ne kadar sürüyor?'), false);
});

// --- parseRequestedDateTime --------------------------------------------------

test('lead-agent: "yarın <time>" resolves to the correct future UTC instant', () => {
  const { parseRequestedDateTime } = loadLeadAgentModule();
  const resolved = parseRequestedDateTime(
    "Yarın 15:00'te el bakımı için gelebilir miyim?",
    { timezone: 'Europe/Istanbul', nowMs: NOW_MS },
  );
  assert.equal(resolved, Date.UTC(2026, 8, 23, 12, 0, 0));
  assert.equal(new Date(resolved).toISOString(), '2026-09-23T12:00:00.000Z');
});

test('lead-agent: an absolute "DD <Turkish month> saat H" resolves the same way', () => {
  const { parseRequestedDateTime } = loadLeadAgentModule();
  const resolved = parseRequestedDateTime(
    '23 Eylül saat 15 el bakımı teklifinizi onaylıyorum.',
    { timezone: 'Europe/Istanbul', nowMs: NOW_MS },
  );
  assert.equal(resolved, Date.UTC(2026, 8, 23, 12, 0, 0));
});

test('lead-agent: a message with no time returns null (no fabricated booking)', () => {
  const { parseRequestedDateTime } = loadLeadAgentModule();
  const resolved = parseRequestedDateTime(
    'Şey için yazmıştım, yarın olur mu?',
    { timezone: 'Europe/Istanbul', nowMs: NOW_MS },
  );
  assert.equal(resolved, null);
});

test('lead-agent: a resolvable but past date returns null (requirements doc past-date case)', () => {
  const { parseRequestedDateTime } = loadLeadAgentModule();
  const resolved = parseRequestedDateTime(
    '21 Eylül 2026 saat 15 için el bakımı randevusu istiyorum.',
    { timezone: 'Europe/Istanbul', nowMs: NOW_MS },
  );
  assert.equal(resolved, null);
});

test('lead-agent: an invalid calendar date (31 Şubat) returns null instead of silently rolling over', () => {
  const { parseRequestedDateTime } = loadLeadAgentModule();
  const resolved = parseRequestedDateTime(
    '31 Şubat 2027 saat 14 için el bakımı istiyorum.',
    { timezone: 'Europe/Istanbul', nowMs: NOW_MS },
  );
  assert.equal(resolved, null);
});

// --- processLeadAndBooking ---------------------------------------------------

test('lead-agent: a clear qualified+booking message creates one lead and one pending appointment', async () => {
  const { processLeadAndBooking } = loadLeadAgentModule();
  const mock = createMockSupabase({ businessConfig: SALON_CONFIG });

  await processLeadAndBooking({
    supabase: mock.module.createClient(),
    businessId: 'biz-1',
    conversationId: 'conv-1',
    content: "El bakımı yaptırmak istiyorum, yarın saat 15:00'te gelebilir miyim?",
    nowMs: NOW_MS,
  });

  assert.equal(mock.leads.length, 1);
  assert.equal(mock.leads[0].status, 'qualified');
  assert.equal(mock.leads[0].conversation_id, 'conv-1');

  assert.equal(mock.appointments.length, 1);
  assert.equal(mock.appointments[0].status, 'pending');
  assert.equal(mock.appointments[0].lead_id, mock.leads[0].id);
  assert.equal(mock.appointments[0].scheduled_at, '2026-09-23T12:00:00.000Z');
});

test('lead-agent: an informational message creates no lead and no appointment', async () => {
  const { processLeadAndBooking } = loadLeadAgentModule();
  const mock = createMockSupabase({ businessConfig: SALON_CONFIG });

  await processLeadAndBooking({
    supabase: mock.module.createClient(),
    businessId: 'biz-1',
    conversationId: 'conv-2',
    content: 'Fiyatlarınız ne kadar?',
    nowMs: NOW_MS,
  });

  assert.equal(mock.leads.length, 0);
  assert.equal(mock.appointments.length, 0);
});

test('lead-agent: a qualified message with an ambiguous time creates a lead but no appointment', async () => {
  const { processLeadAndBooking } = loadLeadAgentModule();
  const mock = createMockSupabase({ businessConfig: SALON_CONFIG });

  await processLeadAndBooking({
    supabase: mock.module.createClient(),
    businessId: 'biz-1',
    conversationId: 'conv-3',
    content: 'El bakımı yaptırmak istiyorum, ne zaman uygun?',
    nowMs: NOW_MS,
  });

  assert.equal(mock.leads.length, 1);
  assert.equal(mock.leads[0].status, 'qualified');
  assert.equal(mock.appointments.length, 0);
});

test('lead-agent: processing the identical resolved booking twice is idempotent', async () => {
  const { processLeadAndBooking } = loadLeadAgentModule();
  const mock = createMockSupabase({ businessConfig: SALON_CONFIG });
  const args = {
    supabase: mock.module.createClient(),
    businessId: 'biz-1',
    conversationId: 'conv-4',
    content: "El bakımı yaptırmak istiyorum, yarın saat 15:00'te gelebilir miyim?",
    nowMs: NOW_MS,
  };

  await processLeadAndBooking(args);
  await processLeadAndBooking(args);

  assert.equal(mock.leads.length, 1, 'still exactly one lead row, updated not duplicated');
  assert.equal(mock.appointments.length, 1, 'still exactly one appointment row, deduped by exact scheduled_at');
});

test('lead-agent: an existing converted lead is left untouched by a new message', async () => {
  const { processLeadAndBooking } = loadLeadAgentModule();
  const mock = createMockSupabase({ businessConfig: SALON_CONFIG });
  const supabase = mock.module.createClient();

  await supabase.from('leads').insert({
    business_id: 'biz-1',
    conversation_id: 'conv-5',
    status: 'converted',
    qualification_score: 90,
  }).select('id').single();

  await processLeadAndBooking({
    supabase,
    businessId: 'biz-1',
    conversationId: 'conv-5',
    content: "El bakımı yaptırmak istiyorum, yarın saat 15:00'te gelebilir miyim?",
    nowMs: NOW_MS,
  });

  assert.equal(mock.leads.length, 1);
  assert.equal(mock.leads[0].status, 'converted', 'status must not be downgraded/overwritten automatically');
});

test('lead-agent: a leads select failure throws (caller is responsible for the 200-response guarantee)', async () => {
  const { processLeadAndBooking } = loadLeadAgentModule();
  const mock = createMockSupabase({ businessConfig: SALON_CONFIG, failLeadSelect: true });

  await assert.rejects(() =>
    processLeadAndBooking({
      supabase: mock.module.createClient(),
      businessId: 'biz-1',
      conversationId: 'conv-6',
      content: "El bakımı yaptırmak istiyorum, yarın saat 15:00'te gelebilir miyim?",
      nowMs: NOW_MS,
    }),
  );
});

test('lead-agent: a businesses timezone select failure falls back to Europe/Istanbul instead of throwing', async () => {
  const { processLeadAndBooking } = loadLeadAgentModule();
  const mock = createMockSupabase({ businessConfig: SALON_CONFIG, failBusinessSelect: true });

  await processLeadAndBooking({
    supabase: mock.module.createClient(),
    businessId: 'biz-1',
    conversationId: 'conv-7',
    content: "El bakımı yaptırmak istiyorum, yarın saat 15:00'te gelebilir miyim?",
    nowMs: NOW_MS,
  });

  assert.equal(mock.leads.length, 1);
  assert.equal(mock.appointments.length, 1);
  assert.equal(mock.appointments[0].scheduled_at, '2026-09-23T12:00:00.000Z');
});
