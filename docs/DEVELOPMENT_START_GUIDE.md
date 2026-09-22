# Geliştirme Başlangıç Kılavuzu

Bu belge, mevcut repo içindeki tüm iş akışlarını ve gereksinim belgelerini tek bir bakışta anlayan, kodlamaya başlayacak bir geliştirici için hazırlanmıştır. Amacı, hangi dosyayı hangi sırayla okuyacağını, hangi veritabanı tablosunu hangi akışta kullanacağını, hangi fonksiyonları yazması gerektiğini ve hangi testlerin zaten hazır olduğunu net şekilde göstermektir.

Bu kılavuz, yeni mimari kurmaktan çok, mevcut repo içindeki gerçek durum ve veri modeli üzerine kuruludur. Yani sistemin bugün için hazır olduğu şeyler ile henüz uygulanmamış parçalar birlikte ele alınır; geliştirici önce temel yapı, sonra akışlar, sonra üretim katmanı mantığına göre ilerler.

---

## 1) Önce ne okumalı?

Aşağıdaki sıralama, en az hata ve en az yeniden başlangıç ile ilerleyebilmek için uygundur.

### Adım 1 — bağlam ve gerçek durum

- `README.md`
- `docs/START_HERE.md`
- `docs/PROJECT_HANDOFF.md`
- `docs/SYSTEM_FLOW.md`

Bu bölümde şunları öğrenirsin:
- proje neden kuruldu
- temel hedef ve funnel
- mevcut durum ne kadar hazır
- hangi alanlar henüz plan aşamasında
- güvenlik ve tenant izolasyon kuralları

### Adım 2 — veri modeli ve gerçek şema

- `supabase/migrations/20260921120000_core_schema.sql`
- `docs/README.md`
- `docs/SOZLUK.md`

Bu bölümde şunları öğrenirsin:
- hangi tablolar var
- `business_id` neden kritik
- `conversations`, `messages`, `leads`, `appointments`, `approvals`, `audit_log`, `escalations`, `model_routing_log`, `funnel_events` ne işe yarıyor
- hangi event tipleri mevcut ve hangileri `audit_log` içine yazılmalı

### Adım 3 — işletme bilgisi ve yapılandırma

- `docs/KALI_BUSINESS_INFO_TEMPLATE.md`
- `config/business-config.example.md` (varsa)
- `docs/SHARE_CHECKLIST.md`

Bu bölümde şunları öğrenirsin:
- gerçek sistem için hangi veriler gerekir
- fiyatlar, çalışma saatleri, hizmetler, ton, karşılama mesajı, randevu politikası ne kadar kritik
- hangi veriler `business_config` altında saklanmalı
- güvenlik ve gizlilik kuralları

### Adım 4 — müşteri akışı ve lead/randevu

- `docs/LEAD_QUALIFICATION_AND_BOOKING_REQUIREMENTS.md`
- `docs/IMPLEMENTATION_PRIORITY_PLAN.md`

Bu bölümde şunları öğrenirsin:
- lead qualification nasıl yapılacak
- randevu nasıl anlaşılacak
- hangi koşullar insan devrine götürüyor
- hangi sıralamayla kodlanmalı

### Adım 5 — insan devri, izleme ve maliyet kontrolü

- `docs/HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md`
- `docs/HUMAN_APPROVAL_ESCALATION_EDGE_CASES.md`
- `docs/HUMAN_APPROVAL_ESCALATION_UI_DRAFT.md`

Bu bölümde şunları öğrenirsin:
- ince hesap/konuşma / escalation mantığı
- hangi olayların `audit_log` ya da `funnel_events` içine geçtiği
- model seçimi ve maliyet kontrolü nasıl çalışacak
- oluşturulacak arayüz ve bildirim akışı

### Adım 6 — insan onayı ve içerik/reklam üretimi

- `docs/HUMAN_APPROVAL_REQUIREMENTS.md`
- `docs/CONTENT_AD_PREP.md`
- `docs/CONTENT_AD_PREP_EDGE_CASES.md`
- `docs/CONTENT_AD_UI_DRAFT.md`

Bu bölümde şunları öğrenirsin:
- approval akışı nasıl olacak
- `approve / change / reject` ne anlama gelecek
- içerik ve reklam üretimi modüler mi, katman bazlı mı olacak
- hangi katmanlar ayrı ayrı üretilecek
- yayın öncesi güvenlik ve kalite kontrol noktaları

---

## 2) Her akış için hangi tablo kullanılır?

Aşağıdaki eşleme, kodlayıcının veri modelini doğru bir şekilde bağlamasını sağlar.

### 2.1. Webhook ve mesaj yakalama

Kullanılan tablolar:
- `conversations`
- `messages`
- `audit_log`
- `model_routing_log`

Temel amaç:
- META webhook'larından gelen mesajları doğrulamak
- `business_id` ve `conversation_id` ile bağlamak
- ilgili mesajı kaydetmek
- model routing bilgisini tutmak

Önerilen fonksiyon isimleri:
- `verifyWebhookSignature(payload, signature, secret)`
- `findOrCreateConversation(platform, customerIdentifier, businessId)`
- `persistInboundMessage(messagePayload, conversationId, businessId)`
- `recordAuditEvent(eventType, payload, businessId)`
- `logModelRouting(messageId, businessId, provider, model, costUsd, latencyMs)`

---

### 2.2. İşletme bilgisi / business config

Kullanılan tablolar:
- `businesses`
- `business_config`

Temel amaç:
- işletmenin hizmetleri, fiyatları, çalışma saatleri, tonu, iletişim kuralları
- tüm bunları kod yerine veritabanında tutmak

Önerilen fonksiyon isimleri:
- `loadBusinessConfig(businessId)`
- `getServiceCatalog(businessConfig)`
- `getWorkingHours(businessConfig)`
- `getBrandTone(businessConfig)`
- `validateBusinessConfig(config)`

Ciddi kural:
- Bu katman, tüm sistemin herkes için ortak olmayan gerçek verilerini taşır.
- `business_id` olmadan hiçbir lead qualification, randevu veya içerik üretimi güvenli şekilde çalışmaz.

---

### 2.3. Lead qualification

Kullanılan tablolar:
- `messages`
- `conversations`
- `leads`
- `audit_log`
- `funnel_events`
- `escalations`

Temel amaç:
- mesajın net lead mi, bilgi sorgusu mu, insan müdahalesi mi gerektiğini anlamak
- `qualification_score` üretmek
- uygun `status` (new / qualified / disqualified / converted) belirlemek

Önerilen fonksiyon isimleri:
- `classifyIncomingMessage(messageText, history, businessConfig)`
- `scoreLeadIntent(messageText, history, businessConfig)`
- `createOrUpdateLead(conversationId, businessId, score, status)`
- `detectAppointmentIntent(messageText, businessConfig)`
- `shouldEscalateConversation(conversation, leadScore, context)`
- `recordFunnelEvent(businessId, conversationId, leadId, eventType)`

Karar mantığı:
- Mesaj yalnızca fiyat sorusu değil, niyet ve eylem çağrısı taşıdığında lead olarak düşünülür.
- Belirsizlik ve çelişki varsa escalation devreye girer.

---

### 2.4. Randevu akışı

Kullanılan tablolar:
- `appointments`
- `leads`
- `conversations`
- `audit_log`
- `escalations`

Temel amaç:
- suggested time / desired date / hizmet / uygunluk bilgisini çıkarıp randevu kaydı oluşturmak
- çakışma ve uygunluk kontrolü yapmak
- eşzamanlı randevu çakışmalarını yönetmek

Önerilen fonksiyon isimleri:
- `extractAppointmentRequest(messageText, history)`
- `checkAvailability(service, requestedSlot, businessConfig)`
- `createAppointment(leadId, businessId, scheduledAt, status)`
- `detectAppointmentConflict(leadId, scheduledAt)`
- `confirmAppointment(appointmentId, actor)`
- `cancelAppointment(appointmentId, reason)`

Önemli kural:
- `appointments.status` sadece `pending`, `confirmed`, `cancelled`, `completed` olabilir.
- Her randevu kaydı bir `lead_id` ile ilişkilidir.
- Çakışma veya eksik bilgi varsa insan devri gerekir.

---

### 2.5. İnsan devri (escalation)

Kullanılan tablolar:
- `escalations`
- `conversations`
- `audit_log`
- `leads`

Temel amaç:
- sistemin güvenli karar veremediği durumda konuşmayı Ayşe'ye ve/veya başka insan temsilcisine devretmek
- nedenin ve çözümün izlenebilir olmasını sağlamak

Önerilen fonksiyon isimleri:
- `createEscalation(conversationId, businessId, reason, assignedTo)`
- `resolveEscalation(escalationId, resolutionSummary)`
- `summarizeConversationForHuman(conversationId)`
- `assignEscalationToHuman(conversationId, assignee)`
- `updateConversationStatus(conversationId, 'escalated')`

Önemli kural:
- Bir escalation, otomatik `approved` veya `published` anlamına gelmez.
- `conversations.status = 'escalated'`, `escalations.status = 'open'` veya `in_progress` şeklinde izlenir.

---

### 2.6. Model routing ve maliyet kontrolü

Kullanılan tablolar:
- `model_routing_log`
- `audit_log`
- `messages`

Temel amaç:
- hangi model hangi durumda kullanıldı
- maliyet, latans ve karar nedenleri izlenebilsin
- belirli eşik aşımı durumunda alarm üretilebilsin

Önerilen fonksiyon isimleri:
- `chooseModelForMessage(messageType, businessConfig, context)`
- `routeModelRequest(messageId, businessId, provider, model, costUsd, latencyMs)`
- `checkCostThreshold(businessId, runningCostUsd)`
- `recordRoutingDecision(...)`

Önemli kural:
- `funnel_events` ile karıştırılmamalı: `model_routing_log`, operasyonel model kararı ve maliyeti kaydeder; `funnel_events` yalnız müşteri funnel sırasında oluşan olayları taşır.

---

### 2.7. İnsan onayı (approval)

Kullanılan tablolar:
- `content_items`
- `content_layers`
- `approvals`
- `audit_log`
- `ad_campaigns`

Temel amaç:
- görsel/video/seslendirme/altyazı gibi katmanların human review'e gönderilmesi
- `approve`, `change`, `reject` eylemleri ile iş akışını kontrol etmek
- değiştirilen katmanın sadece o katmanı geri üretmek

Önerilen fonksiyon isimleri:
- `requestApproval(targetType, targetId, businessId, notes)`
- `applyApprovalDecision(approvalId, action, actor, notes)`
- `updateContentLayerStatus(layerId, status)`
- `rebuildLayerOnly(layerId, newVersion)`
- `markContentReadyForReview(contentItemId)`
- `publishCampaignIfApproved(campaignId)`

Önemli kural:
- `approvals.action` sadece `approve`, `change`, `reject` olabilir.
- `değiştir` denince tüm içerik yeniden üretim değil, sadece ilgili `content_layer` yeniden üretilir.

---

### 2.8. İçerik ve reklam üretimi

Kullanılan tablolar:
- `content_items`
- `content_layers`
- `ad_campaigns`
- `approvals`
- `audit_log`
- `funnel_events`

Temel amaç:
- brief ve hedef belirleme
- ayrı üretim katmanları
- QC / review / revision
- kampanya oluşturma ve publish akışı

Önerilen fonksiyon isimleri:
- `createContentItem(businessId, topic, contentType, campaignId)`
- `createContentLayer(contentItemId, layerType, version, assetUrl)`
- `generateVisualLayer(contentItemId, brief)`
- `generateVoiceoverLayer(contentItemId, brief)`
- `generateSubtitleLayer(contentItemId, brief)`
- `runContentQualityCheck(contentItemId)`
- `createAdCampaign(businessId, name, objective, budget, status)`
- `attachContentToCampaign(contentItemId, campaignId)`
- `publishCampaign(campaignId)`

Önemli kural:
- İçerik üretimi, kampanya oluşturma ve yayına alma ayrı adımlardır.
- İnsan onayı sonrası başka bir adım olarak yayın yapılır.

---

## 3) Hangi iş akışları önce kodlanmalı?

Resmi karar sırası, `docs/IMPLEMENTATION_PRIORITY_PLAN.md` ile tutarlıdır:

1. `business_config` ve gerçek işletme bilgisi
2. lead qualification + booking flow
3. human escalation flow
4. model routing + cost control
5. funnel tracking + analytics
6. human approval flow
7. content/ad production pipeline

Bu sırayı bozma. En kritik neden şu:
- lead qualification olmadan customer intent doğru anlaşılmaz
- escalation olmadan yanlış lead / yanlış randevu yönlendirme riski artar
- approval olmadan içerik üretimi güvenli olmaz
- content production ise en son, temel akışın üzerine kurulur

---

## 4) Geliştirici için önerilen fonksiyon seti (özet)

Aşağıdaki listede, kodlamaya başlarken en sık ihtiyaç duyulacak mantık grupları vardır.

### 4.1. Orta seviye iş mantığı

- `loadBusinessConfig(businessId)`
- `safeGetBusinessConfig()`
- `normalizeConversationContext(conversationId)`
- `buildMessageSummary(messages)`
- `extractServiceAndIntent(messageText)`
- `extractTimeAndDateRequest(messageText)`
- `checkBusinessHours(targetDate, businessConfig)`

### 4.2. Lead / randevu

- `scoreLeadIntent(...)`
- `classifyIncomingMessage(...)`
- `createOrUpdateLead(...)`
- `createAppointment(...)`
- `detectAppointmentConflict(...)`
- `checkAvailability(...)`

### 4.3. Escalation / approval

- `shouldEscalateConversation(...)`
- `createEscalation(...)`
- `requestApproval(...)`
- `applyApprovalDecision(...)`
- `rebuildLayerOnly(...)`

### 4.4. Cost / routing / analytics

- `chooseModelForMessage(...)`
- `recordFunnelEvent(...)`
- `recordAuditEvent(...)`
- `checkCostThreshold(...)`
- `summarizeCampaignPerformance(...)`

Not: Bu isimler öneridir; isimler kod içinde daha sonra refactor edilse bile mantıksal ayrım aynı kalmalıdır.

---

## 5) Hangi testler hazır?

Aşağıdaki testler repo içinde mevcut ve geliştirme sırasında başvuru niteliği taşır.

### 5.1. Temel webhook ve güvenlik testi

- `tests/whatsapp-webhook.test.cjs`
- `tests/instagram-webhook.test.cjs`
- `tests/fixtures.test.cjs`
- `tests/check-webhooks.test.cjs`

Bu testler şunları kontrol eder:
- GET doğrulama
- POST imza kontrolü
- `X-Hub-Signature-256` davranışı
- rate limiting
- fixture doğrulaması

### 5.2. Çevresel/yerel hazır olma testleri

- `tests/check-env.test.cjs`
- `tests/check-readiness.test.cjs`
- `tests/run-local-tests.test.cjs`
- `tests/simulate-webhook.test.cjs`

Bu testler şunları kontrol eder:
- `.env` eksikliği
- Node/Deno sürüm kontrolü
- lokal ortam hazır mı
- webhook simulate komutları doğru çalışıyor mu

### 5.3. Dry-run ve deneme akışı

- `tests/dry-run.test.cjs`
- `scripts/dry-run.cjs`

Bu araç, örnek fixture'lar üzerinden sistemin gerçek akışını sahte modda çalıştırır. Başarı kriterleri:
- hata oluşursa exit code 1 olmalı
- beklenmeyen HTTP durumunda program başarısız olmalı
- fixture'lar uçtan uca işlenmeli

### 5.4. Senaryo / davranış testi

- `tests/booking-scenarios.test.cjs`
- `tests/reply-agent.test.cjs`
- `tests/reply-agent-boundaries.test.cjs`
- `tests/report-logs.test.cjs`

Bu testler daha çok davranış ve senaryo bazlı kontrol sağlar.

---

## 6) Komutlar nasıl çalıştırılır?

### Yerel testler

```powershell
npm test
```

### Yerel webhook testi

```powershell
npm run test:local
```

### Hazırlık kontrolü

```powershell
npm run check:readiness
```

### Tek fixture manuel test

```powershell
node scripts/simulate-webhook.cjs tests/fixtures/whatsapp-text-message.json
```

### Dry run

```powershell
node scripts/dry-run.cjs
```

### Ortam kontrolü

```powershell
node scripts/check-env.cjs
```

---

## 7) Kodlamaya başlamak için önerilen ilk 30 dakika planı

### 0-10 dakika
- `README.md` ve `docs/START_HERE.md` oku
- `supabase/migrations/20260921120000_core_schema.sql` oku
- `business_id` ve tenant izolasyon mantığını zihnine yerleştir

### 10-20 dakika
- `docs/KALI_BUSINESS_INFO_TEMPLATE.md` oku
- `business_config` içinde ne tür verinin geleceğini netleştir
- temsil edilen örnek hedef işletme bilgilerini tanımla

### 20-30 dakika
- `docs/LEAD_QUALIFICATION_AND_BOOKING_REQUIREMENTS.md` oku
- lead scoring ve booking işleri için temel kararlar listelenecek
- `classifyIncomingMessage` + `createOrUpdateLead` mantığına odaklan

Bu adım sonunda geliştirici şunlara sahip olmalıdır:
- repo gerçek durumunu anlama
- veri modelini anlama
- müşteri akışı için başlangıç fonksiyonlarını belirleme
- tests ve local validation araçlarını kullanmaya başlama

---

## 8) En kritik pratik kurallar

1. `business_id` her zaman kullanılır; cross-business lookup yapılmaz.
2. `messages` ve `conversations` kayıtları, her bir müşteri başına tüm konuşma zincirini tutar; "tek kişilik