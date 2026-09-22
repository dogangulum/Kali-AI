// Shared by the WhatsApp and Instagram webhook Edge Functions: given an
// inbound message that has already been persisted (and, by the time this
// runs, already had an AI reply drafted by reply-agent.ts), decide whether
// this conversation now looks like a real lead and, if it clearly names a
// future date/time, record a pending appointment for it.
//
// Deliberately scoped to the CORE case only -- see
// docs/LEAD_QUALIFICATION_AND_BOOKING_REQUIREMENTS.md for the full design
// and its own section 17 review of open/contradictory decisions. This file
// implements only: (a) a config-driven 0-100 lead score used to decide
// `qualified` vs. nothing written, and (b) a minimal Turkish date/time parse
// that only ever produces a `pending` appointment on an unambiguous future
// match. Escalation handling (`conversations.status`, `escalations` rows),
// `audit_log`/`funnel_events` writes, conflict/capacity detection, working
// hours validation, confirm/reschedule/cancel flows, and every other
// R01-R26 edge case in tests/scenarios/booking-cases.json are explicitly
// NOT implemented here -- deferred, not forgotten.
//
// Deliberately Deno-free, same reasoning as reply-agent.ts: no `Deno.*`
// reference anywhere, all environment primitives (the Supabase client,
// `nowMs`) are passed in as plain arguments, so this loads and unit-tests in
// a plain Node vm sandbox via tests/helpers/webhook-suite.cjs the same way
// reply-agent.ts already does.

import type { BusinessConfig } from "./reply-agent.ts";

// ---------------------------------------------------------------------------
// Lead scoring
//
// Adapted from the requirements doc's section 4 point table, trimmed to the
// signals cheaply computable from one message + minimal context (an
// existing-lead lookup this module already needs to do anyway). Score is
// recomputed fresh from the *current* message's own content each time, with
// only a flat, non-cumulative bonus for "this conversation already has a
// lead" -- never a running total -- so repeating the same message does not
// unboundedly inflate the score (see requirements doc R03).
// ---------------------------------------------------------------------------

const PRICE_OR_DURATION_PATTERN = /\bfiyat|\b[uü]cret|ka[cç]\s*(tl|₺|lira|para)|ne\s*kadar|dakika|\bs[uü]re\b|\bprice\b|\bcost\b/i;

const BOOKING_WORD_PATTERN = /randevu|uygun|ne\s*zaman|bo[sş]\s*(saat|yer)|gelebilir\s*miy|u[gğ]rayabilir\s*miy/i;

const INTENT_PHRASE_PATTERN = /istiyorum|istiyom|almak\s*istiyor|yaptırmak\s*istiyor|alaca[gğ][ıi]m|onaylıyorum|randevu\s*al/i;

const SHORT_MESSAGE_LENGTH = 12;

export function matchServiceName(content: string, config: BusinessConfig | null | undefined): string | null {
  const services = Array.isArray(config?.services) ? config!.services! : [];
  // Turkish "İ"/"I" don't lowercase correctly under the default (root)
  // locale -- same caveat and fix (toLocaleLowerCase("tr")) already used in
  // reply-agent.ts's classifyComplexity, applied here for consistency.
  const lowerText = (content ?? "").toLocaleLowerCase("tr");
  for (const service of services) {
    const name = service?.name;
    if (typeof name === "string" && name.length > 0 && lowerText.includes(name.toLocaleLowerCase("tr"))) {
      return name;
    }
  }
  return null;
}

export interface LeadScoreResult {
  score: number;
  reasons: string[];
}

export function scoreLead(
  content: string,
  config: BusinessConfig | null | undefined,
  context: { hasExistingLead: boolean },
): LeadScoreResult {
  const text = content ?? "";
  const reasons: string[] = [];
  let raw = 0;

  const serviceName = matchServiceName(text, config);
  if (serviceName) {
    raw += 20;
    reasons.push(`service-name:${serviceName}`);
  }

  const hasPriceOrDuration = PRICE_OR_DURATION_PATTERN.test(text);
  if (hasPriceOrDuration) {
    raw += 10;
    reasons.push("price-or-duration-question");
  }

  const hasBookingSignal = BOOKING_WORD_PATTERN.test(text);
  if (hasBookingSignal) {
    raw += 25;
    reasons.push("booking-time-signal");
  }

  const hasIntentPhrase = INTENT_PHRASE_PATTERN.test(text);
  if (hasIntentPhrase) {
    raw += 20;
    reasons.push("intent-phrase");
  }

  if (context.hasExistingLead) {
    raw += 15;
    reasons.push("existing-lead-in-conversation");
  }

  if (text.trim().length < SHORT_MESSAGE_LENGTH) {
    raw -= 15;
    reasons.push("very-short-message");
  }

  if (hasPriceOrDuration && !hasBookingSignal && !hasIntentPhrase) {
    raw -= 20;
    reasons.push("price-question-with-no-intent");
  }

  const score = Math.max(0, Math.min(100, raw));
  return { score, reasons };
}

export const QUALIFIED_SCORE_THRESHOLD = 60;

export type LeadClassification = "qualified" | "informational";

export function classifyLead(score: number): LeadClassification {
  return score >= QUALIFIED_SCORE_THRESHOLD ? "qualified" : "informational";
}

// Explicit human-handoff phrases. Detected only so this module doesn't
// mis-score an "I want a human" message as a qualified sales lead -- it is
// NOT acted on any further here (no escalations row, no conversations.status
// change). That's real follow-up work, intentionally deferred per the
// requirements doc's own escalation section.
const HUMAN_HANDOFF_PATTERN = /yetkili|temsilci|bir\s*insan|canl[ıi]\s*destek|operat[oö]r|human\s*agent|representative/i;

export function isHumanHandoffRequest(content: string): boolean {
  return HUMAN_HANDOFF_PATTERN.test(content ?? "");
}

// ---------------------------------------------------------------------------
// Date/time parsing -- deliberately narrow. Only two shapes are recognized,
// both requiring an explicit time; anything else (bare weekday names,
// relative phrases with no time, missing year, timezone-missing statements)
// returns null rather than guessing. See this module's header comment and
// the plan for the full list of deferred edge cases (R15-R16 in the
// requirements doc).
// ---------------------------------------------------------------------------

const TURKISH_MONTHS: Record<string, number> = {
  "ocak": 1, "şubat": 2, "subat": 2, "mart": 3, "nisan": 4, "mayıs": 5, "mayis": 5,
  "haziran": 6, "temmuz": 7, "ağustos": 8, "agustos": 8, "eylül": 9, "eylul": 9,
  "ekim": 10, "kasım": 11, "kasim": 11, "aralık": 12, "aralik": 12,
};

const TIME_PATTERN = /(\d{1,2})[:.](\d{2})|saat\s*(\d{1,2})\b|(\d{1,2})\s*'?\s*(?:te|ta|da|de)\b/i;

function extractTime(content: string): { hour: number; minute: number } | null {
  const match = TIME_PATTERN.exec(content);
  if (!match) return null;

  let hour: number;
  let minute = 0;
  if (match[1] !== undefined) {
    hour = Number(match[1]);
    minute = Number(match[2]);
  } else if (match[3] !== undefined) {
    hour = Number(match[3]);
  } else {
    hour = Number(match[4]);
  }

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function getLocalYmd(nowMs: number, timeZone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(nowMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// Standard "format-and-adjust" technique: build a naive UTC guess from the
// requested local wall-clock time, then correct it by however far that
// guess's own rendering in the target timezone differs from what was asked
// for. Accurate for fixed-offset zones and the common (non-DST-transition)
// case; not guaranteed correct exactly at a DST transition instant -- an
// explicitly deferred edge case (requirements doc R15/R16), acceptable here
// because Europe/Istanbul (the only timezone this project currently uses)
// has observed a fixed UTC+3 offset with no DST since 2016. Kept generic
// (reads `timeZone` as a parameter) rather than hardcoding that offset, to
// stay usable for a future tenant in a different timezone.
function zonedTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(naiveUtcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const renderedAsUtcMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMs = renderedAsUtcMs - naiveUtcMs;
  return naiveUtcMs - offsetMs;
}

function addDaysToYmd(ymd: { year: number; month: number; day: number }, days: number) {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function parseRequestedDateTime(
  content: string,
  params: { timezone: string; nowMs: number },
): number | null {
  const { timezone, nowMs } = params;
  const text = content ?? "";
  const lowerText = text.toLocaleLowerCase("tr");

  const time = extractTime(text);
  if (!time) return null;

  const today = getLocalYmd(nowMs, timezone);
  let ymd: { year: number; month: number; day: number } | null = null;

  if (/\byar[ıi]n\b/i.test(lowerText)) {
    ymd = addDaysToYmd(today, 1);
  } else if (/\bbug[uü]n\b/i.test(lowerText)) {
    ymd = today;
  } else {
    const monthPattern = new RegExp(
      `(\\d{1,2})\\s+(${Object.keys(TURKISH_MONTHS).join("|")})(?:\\s+(\\d{4}))?`,
      "i",
    );
    const monthMatch = monthPattern.exec(lowerText);
    if (monthMatch) {
      const day = Number(monthMatch[1]);
      const month = TURKISH_MONTHS[monthMatch[2].toLowerCase()];
      const year = monthMatch[3] ? Number(monthMatch[3]) : today.year;
      if (day >= 1 && day <= 31 && month) {
        ymd = { year, month, day };
      }
    }
  }

  if (!ymd) return null;

  // Reject calendar-invalid dates (e.g. 31 Şubat) rather than silently
  // rolling them into the next month -- requirements doc R15.
  const candidateUtcMs = Date.UTC(ymd.year, ymd.month - 1, ymd.day);
  const roundTrip = new Date(candidateUtcMs);
  if (
    roundTrip.getUTCFullYear() !== ymd.year ||
    roundTrip.getUTCMonth() !== ymd.month - 1 ||
    roundTrip.getUTCDate() !== ymd.day
  ) {
    return null;
  }

  const resolvedMs = zonedTimeToUtcMs(ymd.year, ymd.month, ymd.day, time.hour, time.minute, timezone);

  // A resolvable but past instant is treated the same as "couldn't parse":
  // no appointment is fabricated either way (requirements doc R15's
  // past-date case).
  if (resolvedMs <= nowMs) return null;

  return resolvedMs;
}

// ---------------------------------------------------------------------------
// Orchestrator
//
// Mirrors generateAndStoreReply's shape and error-handling convention: throw
// on a failure that means nothing useful happened (propagates to the
// caller's own try/catch, logged, webhook response unaffected); swallow
// internally only where a secondary step failing shouldn't undo a primary
// one already committed. Here the two steps (lead upsert, appointment
// insert) are independent enough that a booking failure should not be
// hidden behind a successful lead upsert, so both are allowed to throw and
// the *caller* (the webhook) wraps this whole function in one try/catch per
// message, same as it already does for generateAndStoreReply.
// ---------------------------------------------------------------------------

export interface SupabaseLike {
  from(table: string): any;
}

const DEFAULT_TIMEZONE = "Europe/Istanbul";

async function resolveBusinessTimezone(supabase: SupabaseLike, businessId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("businesses")
      .select("timezone")
      .eq("id", businessId)
      .maybeSingle();
    if (error) throw error;
    return data?.timezone ?? DEFAULT_TIMEZONE;
  } catch (error) {
    console.error("lead-agent: failed to read business timezone, defaulting to Europe/Istanbul", error);
    return DEFAULT_TIMEZONE;
  }
}

async function findExistingLead(
  supabase: SupabaseLike,
  conversationId: string,
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, status")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// Takes the already-fetched `existing` row (from findExistingLead, called
// once up front in processLeadAndBooking both to score "hasExistingLead"
// and here) rather than re-querying it a second time.
async function upsertQualifiedLead(params: {
  supabase: SupabaseLike;
  businessId: string;
  conversationId: string;
  score: number;
  existing: { id: string; status: string } | null;
}): Promise<string> {
  const { supabase, businessId, conversationId, score, existing } = params;

  // Never overwrite a manually/previously finalized lead. The requirements
  // doc (R12) explicitly leaves `converted` reactivation policy open; the
  // safe default until that's decided is to leave it untouched. Same for a
  // `disqualified` row, which this module never sets automatically -- if one
  // exists, a human set it, and this pass shouldn't override that.
  if (existing && (existing.status === "converted" || existing.status === "disqualified")) {
    return existing.id;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("leads")
      .update({ status: "qualified", qualification_score: score })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data: created, error: insertError } = await supabase
    .from("leads")
    .insert({
      business_id: businessId,
      conversation_id: conversationId,
      status: "qualified",
      qualification_score: score,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id;
}

async function maybeCreateAppointment(params: {
  supabase: SupabaseLike;
  businessId: string;
  leadId: string;
  scheduledAtMs: number;
}): Promise<void> {
  const { supabase, businessId, leadId, scheduledAtMs } = params;
  const scheduledAtIso = new Date(scheduledAtMs).toISOString();

  const { data: existingAppointment, error: selectError } = await supabase
    .from("appointments")
    .select("id")
    .eq("lead_id", leadId)
    .eq("scheduled_at", scheduledAtIso)
    .maybeSingle();
  if (selectError) throw selectError;
  // Exact-timestamp dedupe only: a retried/duplicate webhook delivery for
  // the same resolved instant is a no-op rather than a second appointment
  // row. Fuzzy/near-time conflict detection against *other* customers'
  // appointments is explicitly out of scope for this pass (requirements doc
  // R09/R10).
  if (existingAppointment) return;

  const { error: insertError } = await supabase.from("appointments").insert({
    business_id: businessId,
    lead_id: leadId,
    scheduled_at: scheduledAtIso,
    status: "pending",
  });
  if (insertError) throw insertError;
}

export async function processLeadAndBooking(params: {
  supabase: SupabaseLike;
  businessId: string;
  conversationId: string;
  content: string;
  nowMs: number;
}): Promise<void> {
  const { supabase, businessId, conversationId, content, nowMs } = params;

  const { data: configRow, error: configError } = await supabase
    .from("business_config")
    .select("config")
    .eq("business_id", businessId)
    .maybeSingle();
  if (configError) throw configError;
  const config: BusinessConfig = configRow?.config ?? {};

  const existingLead = await findExistingLead(supabase, conversationId);
  const { score, reasons } = scoreLead(content, config, { hasExistingLead: Boolean(existingLead) });
  const classification = classifyLead(score);

  if (isHumanHandoffRequest(content)) {
    // Logged only -- see isHumanHandoffRequest's own comment. No table
    // write happens because of this flag alone.
    console.log(`lead-agent: human-handoff phrase detected in conversation ${conversationId} (not acted on in this pass)`);
  }

  console.log(
    `lead-agent: conversation ${conversationId} scored ${score} (${classification}) -- ${reasons.join(", ") || "no signals"}`,
  );

  let leadId: string | null = null;
  if (classification === "qualified") {
    leadId = await upsertQualifiedLead({ supabase, businessId, conversationId, score, existing: existingLead });
  } else if (existingLead && (existingLead.status === "qualified" || existingLead.status === "converted")) {
    // A conversation that already has a qualified/converted lead can still
    // book again even if this particular message's own score dips below the
    // threshold (e.g. a short "yarın 15:00 olur mu?" follow-up).
    leadId = existingLead.id;
  }

  if (!leadId) return;

  const timezone = await resolveBusinessTimezone(supabase, businessId);
  const scheduledAtMs = parseRequestedDateTime(content, { timezone, nowMs });
  if (scheduledAtMs === null) return;

  // Rxx checks: use business config to validate service, hours, breaks, holidays
  // and avoid creating appointments on ambiguous or explicitly human-handled
  // messages. These are conservative: prefer asking for clarification over
  // inventing a booking.

  // 1) If a human handoff was explicitly requested, do not auto-book.
  if (isHumanHandoffRequest(content)) {
    console.log(`lead-agent: human handoff requested in ${conversationId}, skipping auto-book`);
    return;
  }

  // 2) If config missing or incomplete, don't fabricate an appointment.
  if (!config || !Array.isArray(config.services) || config.services.length === 0) {
    console.log(`lead-agent: business config missing or services empty for ${businessId}, skipping appointment creation`);
    return;
  }

  // 3) If message appears to indicate the customer is in another timezone or
  // otherwise explicitly uncertain about local clock, avoid booking.
  const abroadPattern = /yurt\s*d[iı]s|yurtd[iı]s|şu an yurt|yurt dışındayım|yurt\-dış/i;
  if (abroadPattern.test(content ?? "")) {
    console.log(`lead-agent: timezone-ambiguous phrase found in conversation ${conversationId}, skipping appointment creation`);
    return;
  }

  // 4) Require the message to mention a known service name before creating an
  // appointment; otherwise ask clarifying question (no DB action here beyond
  // the lead upsert already done above).
  const serviceName = matchServiceName(content, config);
  if (!serviceName) {
    console.log(`lead-agent: no matching service name in message for ${conversationId}, not creating appointment`);
    return;
  }

  const service = config.services.find((s: any) => (s?.name || '').toLocaleLowerCase('tr') === serviceName.toLocaleLowerCase('tr'));
  if (!service) {
    console.log(`lead-agent: matched service name not present in config for ${businessId}, skipping appointment`);
    return;
  }

  // 5) Working hours / closed days / breaks validation.
  const durationMinutes = Number(service.duration_minutes) || 0;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    console.log(`lead-agent: invalid duration for service ${serviceName}, skipping appointment`);
    return;
  }

  // Helper: get local YMD for an arbitrary instant
  function getLocalYmdFromMs(ms: number, tz: string) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  // Helper: parse HH:MM string
  function parseHm(s: string) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return null;
    return { h: Number(m[1]), m: Number(m[2]) };
  }

  const ymd = getLocalYmdFromMs(scheduledAtMs, timezone);
  const workingHours = (config as any).working_hours ?? null;
  // If working_hours is present, enforce it; if absent, be permissive and
  // allow booking (but still conservative on other checks).
  if (workingHours) {
    const weekdayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const localWeekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(new Date(scheduledAtMs)).toLowerCase();
    // If the config does not explicitly include this weekday, treat it as
    // unspecified and permissive (legacy configs may list only a few days).
    if (!Object.prototype.hasOwnProperty.call(workingHours, localWeekday)) {
      // permissive: do not block booking when the weekday is not defined
      console.log(`lead-agent: working_hours does not include ${localWeekday}, treating as unspecified (permissive)`);
    } else {
      const slots = workingHours[localWeekday] ?? [];
      if (!Array.isArray(slots) || slots.length === 0) {
        console.log(`lead-agent: business explicitly closed on ${localWeekday} (${businessId}), skipping appointment`);
        return;
      }

      // Build UTC intervals for the day's working slots
      const intervals: Array<{start:number,end:number}> = [];
      for (const slot of slots) {
        const opens = parseHm(slot.opens);
        const closes = parseHm(slot.closes);
        if (!opens || !closes) continue;
        const startUtc = zonedTimeToUtcMs(ymd.year, ymd.month, ymd.day, opens.h, opens.m, timezone);
        const endUtc = zonedTimeToUtcMs(ymd.year, ymd.month, ymd.day, closes.h, closes.m, timezone);
        intervals.push({ start: startUtc, end: endUtc });
      }
      if (intervals.length === 0) {
        console.log(`lead-agent: no valid working intervals for ${localWeekday}, skipping appointment`);
        return;
      }

      const appointmentEndMs = scheduledAtMs + durationMinutes * 60_000;
      // Appointment must fit entirely inside one working slot (no spanning a
      // lunch break or closing boundary). Conservative approach.
      const fits = intervals.some((iv) => scheduledAtMs >= iv.start && appointmentEndMs <= iv.end);
      if (!fits) {
        console.log(`lead-agent: appointment ${new Date(scheduledAtMs).toISOString()}-${new Date(appointmentEndMs).toISOString()} does not fit working intervals for ${localWeekday}`);
        return;
      }
    }

  }

  // 6) Special closed dates and holiday exceptions (config.closed_dates or
  // config.special_closed) prevent booking.
  const closedDates = (config as any).closed_dates || (config as any).special_closed || null;
  if (Array.isArray(closedDates) && closedDates.length > 0) {
    const scheduledLocal = new Date(scheduledAtMs);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(scheduledLocal);
    const y = parts.find(p=>p.type==='year')?.value;
    const m = parts.find(p=>p.type==='month')?.value;
    const d = parts.find(p=>p.type==='day')?.value;
    const isoDate = `${y}-${m}-${d}`;
    if (closedDates.includes(isoDate) || closedDates.includes(isoDate.replace(/-0?/,'-'))) {
      console.log(`lead-agent: scheduled date ${isoDate} is a closed date per business config, skipping appointment`);
      return;
    }
  }

  // 7) Check for overlapping appointments in the same business (conservative
  // conflict detection). If any existing appointment overlaps this interval,
  // prefer to not create it and let human operator resolve.
  try {
    const apptQuery = await supabase.from('appointments').select();
    const appts = (apptQuery && apptQuery.data) || [];
    const appointmentStart = scheduledAtMs;
    const appointmentEnd = scheduledAtMs + durationMinutes * 60_000;
    const overlapping = appts.find((a: any) => {
      // Only consider same business and non-cancelled statuses if those
      // fields exist.
      if (a.business_id && a.business_id !== businessId) return false;
      const aStart = Date.parse(a.scheduled_at);
      const aDuration = Number(a.duration_minutes) || (a.service_duration_minutes || 0);
      const aEnd = aStart + (Number(a.duration_minutes) || 0) * 60_000 || aStart + 60 * 60_000;
      // Overlap test
      return aStart < appointmentEnd && aEnd > appointmentStart;
    });
    if (overlapping) {
      console.log(`lead-agent: detected overlapping appointment (${overlapping.id || 'unknown'}) for business ${businessId}, skipping auto-create`);
      return;
    }
  } catch (err) {
    console.log('lead-agent: appointment overlap check failed, skipping appointment creation', err);
    return;
  }

  await maybeCreateAppointment({ supabase, businessId, leadId, scheduledAtMs });
}
