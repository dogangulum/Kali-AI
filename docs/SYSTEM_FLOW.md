# Sistem Çalışma Akışı (Mevcut Durum)

Bu belge, bir müşteri WhatsApp veya Instagram'dan mesaj attığında sistemde şu anda adım adım ne olduğunun tam, dosyalara dayalı açıklamasıdır. Bilgi doğrudan repodaki gerçek dosyalardan (supabase/functions/*, README.md, migrations, tests vb.) derlenmiştir — uydurma bilgi yoktur.

Özet
- Webhook alıcıları: `supabase/functions/whatsapp-webhook/index.ts` ve `supabase/functions/instagram-webhook/index.ts`.
- Her iki alıcı da Deno ile çalışan HTTP handler'ları (Deno.serve).
- GET ile doğrulama, POST ile HMAC-SHA256 imza doğrulama, isteğe göre JSON ayrıştırma, konsola yazma, veritabanına inbound mesaj kaydı ve 200/4xx yanıtları döndürme işlevleri mevcut.
- Bu repo şu anda gerçek inbound mesajları kaydediyor: webhook doğrulanan mesajları `conversations` ve `messages` tablosuna ekliyor.
- Veritabanı şeması (migration) konuşmalar, mesajlar, lead, randevu, onay vs. için hazır tablolar tanımlar: `supabase/migrations/20260921120000_core_schema.sql`.
- Tek-tenant bootstrap için `KALI_BUSINESS_ID` env değeri ve `supabase/migrations/20260921130000_seed_kali_business.sql` seed dosyası kullanılıyor.

1) Ortak ön koşullar
- Ortam değişkenleri:
  - `META_WHATSAPP_VERIFY_TOKEN` (WhatsApp GET doğrulaması)
  - `META_INSTAGRAM_VERIFY_TOKEN` (Instagram GET doğrulaması)
  - `META_APP_SECRET` (POST gövdesinin HMAC-SHA256 imzası için)
  Bu değişkenler kodda `Deno.env.get(...)` veya Node taslağında `process.env` üzerinden okunur.

2) HTTP GET (doğrulama) akışı
- Endpoint: aynı Deno handler (aynı dosya içinde `if (req.method === "GET")`).
- Kodun yaptığı:
  - URL sorgu parametrelerinden `hub.mode`, `hub.verify_token`, `hub.challenge` okunur (`index.ts` içinde `url.searchParams.get(...)`).
  - Eğer `hub.mode === 'subscribe'` ve `hub.verify_token` ortam değişkeni ile eşleşiyorsa, `200` ile `challenge` değeri döndürülür.
  - Aksi durumda `403 Forbidden` döner.
- Dosyalar: `supabase/functions/whatsapp-webhook/index.ts` ve `supabase/functions/instagram-webhook/index.ts`.

3) HTTP POST (mesaj teslimi) akışı
- Ortak adımlar (her iki webhook dosyasında da benzer):
  1. İstek IP'si belirlenir: `x-forwarded-for` başlığından ilk IP alınır; yoksa `unknown`.
  2. Rate limiting kontrolü: `isRateLimited(ip)` fonksiyonu çalışır.
     - Uygulanan politika: 60.000 ms pencere (60s) ve pencere başına 30 istek. Bu sayaç process belleğinde (`rateLimitBuckets` Map) tutulur.
     - Sonuç: aşılırsa HTTP 429 döndürülür.
     - Not: sayaç bellekte tutulduğundan sunucu yeniden başlarsa sıfırlanır ve dağıtık/çoklu instance ortamında paylaşılmaz.
  3. POST gövdesi ham olarak okunur: `await req.text()`.
  4. `x-hub-signature-256` başlığı okunur ve `verifySignature(rawBody, signatureHeader)` ile imza doğrulanır.
     - `verifySignature` şu kurala göre çalışır:
       - Başlık `sha256=<hex>` formatında beklenir.
       - `META_APP_SECRET` kullanılarak HMAC-SHA256 hesaplanır (`crypto.subtle.importKey` + `crypto.subtle.sign` ile Web Crypto API kullanılıyor).
       - Hesaplanan hex imza ile gelen imza `timingSafeEqual` ile sabit zamanlı karşılaştırma yapılarak doğrulanır.
     - Başarısızsa `401 Unauthorized` döner.
  5. JSON ayrıştırma denenir (`JSON.parse(rawBody)`); hatalı JSON ise `400 Bad Request` döner.
  6. Veritabanı yazımı çalıştırılır:
     - `persistInboundMessages(payload)` çağrılır.
     - WhatsApp'ta `extractWhatsAppMessages(payload)` ile `from` değerini müşteri kimliği, `text.body` (ya da JSON fallback) değerini içerik olarak çıkarır.
     - Instagram'da `extractInstagramMessages(payload)` ile `sender.id` ve `message.text`/JSON fallback çıkarır.
     - `findOrCreateConversation(platform, customerIdentifier)` ile `conversations` tablosunda business + platform + customer_identifier eşleşmesi bulunur/oluşturulur.
     - Daha sonra `messages` tablosuna `direction: 'inbound'` satırı eklenir.
     - Bu işlemin ortamı `KALI_BUSINESS_ID` ve Supabase service-role key ile ayarlanır.
  7. Veritabanı yazımı başarısız olsa bile webhook 200 yanıtı geri döner; hata sadece loglanır. Bu tasarım, Meta'nın retry davranışına güvenmeden geçici DB sorunlarını fark etmesini amaçlar.
  8. Başarılı durumda 200 ve `{ "received": true }` içeren JSON yanıtı döndürülüyor.
- Dosyalar: `supabase/functions/whatsapp-webhook/index.ts`, `supabase/functions/instagram-webhook/index.ts`.

4) Node.js taslak dosyası
- Repoda ayrıca `api/whatsapp-webhook.js` bulunuyor; bu dosya bir Node.js handler taslağıdır.
  - Bu dosyaya üst kısımda (daha önce eklendi) bir not kondu: aktif implementasyon `supabase/functions/whatsapp-webhook/index.ts` altında.
  - Bu Node taslağı GET doğrulama ve basit POST kabulü içerir, ancak POST için imza doğrulama ve rate limiting yoktur (dolayısıyla prod kullanımına uygun değildir).

5) Veritabanı ve kalıcı saklama (mevcut durum)
- Repoda kapsamlı bir migration dosyası var: `supabase/migrations/20260921120000_core_schema.sql`.
  - Bu migration, şu tabloları tanımlar (ve RLS politikalarını etkinleştirir):
    - businesses, business_config
    - conversations, messages
    - leads, appointments
    - audit_log, ad_campaigns
    - content_items, content_layers, approvals, escalations
    - model_routing_log, funnel_events
  - RLS (Row Level Security) politikaları migration içinde yer alır; politikalar JWT içindeki `business_id` claim'ine dayanır (`auth.jwt() ->> 'business_id'`).
- Bu repo artık inbound WhatsApp ve Instagram mesajlarını gerçekten kaydediyor. `supabase/functions/whatsapp-webhook/index.ts` ve `supabase/functions/instagram-webhook/index.ts` içinde `persistInboundMessages(payload)` çalıştırılır; bu fonksiyon `conversations` tablosunda kullanıcı başına conversation bulur/oluşturur ve ardından `messages` tablosuna `direction: 'inbound'` satırı ekler.
- Tek-tenant bootstrap için `supabase/migrations/20260921130000_seed_kali_business.sql` migration dosyası ile `businesses` tablosuna tek bir `Kali Beauty Center` kaydı oluşturuluyor. Edge Function'lar bunun `KALI_BUSINESS_ID` olarak env değişkeninden okuduğu `business_id` değerini kullanıyor.
- Bu sayede gelen mesajlar artık durumun gerçek uygulamasına göre DB'ye yazılır. Ancak bu kayıt akışı henüz lead qualification, appointment creation, AI message generation, outbound response ve human approval adımlarını içermiyor.

6) AI, model routing ve onay iş akışı
- Migration içinde `model_routing_log`, `approvals`, `content_*` tabloları gibi AI ve onay sürecine yönelik altyapı tabloları tanımlı; fakat kodda model çağıran, yönlendiren veya insan onay ekranı gösteren bir implementasyon bulunmuyor.
- `CLAUDE.md` ve `AGENTS.md` proje kuralları ve ajan yönlendirme politikalarını tanımlar; bunlar politika/doküman seviyesinde ve kod tarafından otomatik olarak uygulanmıyor.

7) Kimlik / yetkilendirme
- Migration RLS için `auth.jwt()` kullanımını varsayıyor: JWT içinde `business_id` claim'i gerekecek.
- Repoda bu JWT'yi üreten veya doğrulayan bir auth akışı ya da kullanıcı yönetimi kodu yok. Bu nedenle doğrudan tabloları istemci tarafından korumak için ek yapı/servis gerekir.

8) Test altyapısı ve örnek veriler
- `tests/` klasörü içinde webhook davranışını test etmeyi amaçlayan test dosyaları mevcut (`tests/whatsapp-webhook.test.cjs`, `tests/instagram-webhook.test.cjs`) ve yardımcılar (`tests/helpers/webhook-suite.cjs`).
- Ayrıca `tests/fixtures/` altında gerçekçi, sahte webhook payload örnekleri sağlanmış (ör. `whatsapp-text-message.json`, `instagram-image-message.json` vb.). Bu dosyalar test/deneme amaçlı kullanılabilir.

9) Önemli sınırlamalar / eksikler (özet)
- Gelen inbound mesajlar DB'ye yazılıyor; ancak yazım akışı tek-tenant (`KALI_BUSINESS_ID`) ve tek işlevli bir bootstrap üzerinden çalışıyor. Çoklu işletme eşlemesi henüz genel bir çözüm değil.
- Business eşlemesi / config okunması yok: `business_config` içeriği ile mesajları eşleyecek kod bulunmuyor; mesajlar yalnızca tek `business_id` altında yazılıyor.
- AI çağrısı / model routing yok: `model_routing_log` tablosu olsa da actual model çağrısı ve maliyet/latency ölçümü yapılmıyor.
- Lead qualification, appointment oluşturma, outbound response ve human approval akışı henüz uygulanmamış.
- JWT / auth mekanizması yok; RLS politikalarını çalıştıracak client-side auth ve tam yetkilendirme akışı eksik.
- Rate limit sayaçları process-local: dağıtık ortamda paylaşılmıyor.
- `api/whatsapp-webhook.js` Node taslağı imza doğrulama ve rate limiting eksikliği nedeniyle prod için uygunsuz.

10) Nerede veri saklanır / saklanabilir (mevcut şema)
- Şu an gerçekten kaydedilen veri akışı:
  - Her gelen doğrulanmış WhatsApp/Instagram mesajı, `conversations` içinde `(business_id, platform, customer_identifier)` eşleşmesi bulunarak veya oluşturularak bir conversation kaydı açar.
  - Aynı mesaj `messages` tablosuna `direction = 'inbound'` olarak eklenir.
  - Kod bunu `persistInboundMessages(payload)` içinde yapar.
- Gelecek adımlara dair planlanan veri akışı:
  - Lead ve appointment süreçleri için `leads` ve `appointments` tabloları kullanılacaktır.
  - İnsan onayları `approvals`, model kullanım kayıtları `model_routing_log` ve funnel KPI'ları `funnel_events` içinde tutulur.
- Bu planlanan ek adımlar bugüne kadar kodlanmadı; mevcut repo sadece inbound mesaj akışını gerçekleştiriyor.

11) Dosya/konum referansları
- Webhook handler'ları:
  - `supabase/functions/whatsapp-webhook/index.ts`
  - `supabase/functions/instagram-webhook/index.ts`
- Node taslak:
  - `api/whatsapp-webhook.js` (eski / referans amaçlı)
- Migration / veritabanı:
  - `supabase/migrations/20260921120000_core_schema.sql`
- Testler ve fixture'lar:
  - `tests/` ve `tests/fixtures/` (örnek payloadlar burada)
- Proje politika/dokümanları:
  - `CLAUDE.md`, `AGENTS.md`, `docs/PROJECT_HANDOFF.md`, `README.md`

12) Kısa öneriler (kod eklemeye gerek olmadan yapılabilecek takipler)
- Eğer amacınız gelen mesajları saklamaksa, webhook handler içine (imza doğrulandıktan sonra) aşağıdaki adımlar eklenmelidir:
  - Gelen payload'tan `business_id` eşlemesi için bir yol (ör. phone number -> business lookup) oluşturun.
  - `conversations` tablosunda uygun kaydı bulup/oluşturun ve `messages` tablosuna bir satır ekleyin (service role veya güvenli sunucu side connection ile).
  - (Opsiyonel) `audit_log` veya `model_routing_log` ile izleme ekleyin.
- Dağıtık rate limiting gerekiyorsa Redis gibi paylaşılabilir bir sayaç katmanı ekleyin.
- RLS politikalarını çalıştırmak için projeye bir auth katmanı (JWT issuer/validator) ekleyin veya service role ile sunucudan erişim sağlayın.

Sonuç
Mevcut durumda webhook alıcıları güvenli doğrulama (GET token, POST HMAC imza) ve temel rate limiting ile gelen istekleri kabul ediyor, doğruluyor, JSON ayrıştırıyor, veritabanına inbound mesaj olarak kaydediyor ve ardından 200 yanıt veriyor. Bu, daha önceki yalnızca konsola yazma durumundan farklıdır. Ancak model çağrısı, outbound mesaj üretimi, lead qualification, randevu akışı, human approval ve tam auth/multi-tenant entegrasyonu henüz kodlanmamıştır; bu bileşenler migration ve tasarım düzeyinde planlanmıştır ama uygulama tarafı tamamlanmamıştır.

--
Bu belge repodaki gerçek dosyalar ince alınarak oluşturulmuştur (özellikle `supabase/functions/*`, `supabase/migrations/*`, `README.md`, `tests/*`). Uydurma veya doğrulanmamış bilgiler eklenmemiştir.