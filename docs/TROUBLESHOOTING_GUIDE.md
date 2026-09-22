# Canlıya Geçiş — Sorun Giderme Rehberi

Tarih: 2026-09-21T19:38:03+03:00
Not: Bu rehber, ACILIS_HAZIRLIK.md içeriği göz önünde bulundurularak hazırlandı. Canlı açılış öncesi ve canlı test sırasında en sık karşılaşılabilecek hatalar, tanılama adımları, geçici çözümler, kalıcı düzeltme önerileri ve eskalasyon akışı adım adım verilir.

Ön Hazırlık (mutlaka yapılmalı)
- check-readiness çalıştırın: `npm run check:readiness` veya `node scripts/check-readiness.cjs`. Çıktıda EKSİK/HATA varsa düzeltin.
- Ortam değişkenlerini doğrulayın: `.env.local` yoksa ACILIS_HAZIRLIK.md'deki gerekli değişkenleri ayarlayın. Gizli anahtarları asla paylaşmayın.
- Dry-run senaryolarını çalıştırın: `node scripts/dry-run.cjs` (veya ilgili npm task). Tüm fixture'ların 2xx ile tamamlandığını ve exit kodunun 0 olduğunu doğrulayın; herhangi bir hata varsa düzeltin.
- Test senaryolarını uygulayın: docs/TEST_SENARYOLARI.md içeriklerine göre birkaç gerçekçi senaryo çalıştırın.
- Snapshot/backup alın: canlıya geçmeden önce veritabanı ve konfigürasyon dosyalarının yedeğini alın (Supabase snapshot veya DB dump).
- Görev sorumluları ve iletişim kanalları net olsun (Ayşe, ops, geliştirici). ACILIS_HAZIRLIK.md'deki "Müdahale sorumlusu" alanını doldurduğunuzdan emin olun.

Genel ilkeler
- Önce gözlemle, sonra müdahale et: canlıya alınan sistemi önce 5–15 dakika gözlemleyin (log, health checks, error rate) ardından gerekliyse müdahale edin.
- Veri koruma: hata düzeltirken müşteri verisini dışarı vermeyin. Logs içinde müşteri verisi varsa maskelenmiş bir kopyasını alın.
- Hızlı geri alma (rollback) planı hazır olsun: webhooks kapatma veya önceki sürüme dönme adımları elinizde olsun.

Önemli erişim noktaları
- Sunucu/Deno süreç çıktıları: Deno process stdout/stderr (deno run çıktısı)
- Supabase: Studio / SQL Editor / Migration history
- Test çıktı dosyaları: `tests/` ve `tests/fixtures/`
- Yerel araçlar: `scripts/check-env.cjs`, `scripts/check-readiness.cjs`, `scripts/dry-run.cjs`, `scripts/simulate-webhook.cjs`

Hızlı Acil Durdurma (Kill switch)
1. Geçici: Meta (Business/WhatsApp/Instagram) webhook URL'ini geçici olarak devre dışı bırakın (Meta Business Settings). Bu, canlı trafiği durdurur.
2. Sunucu: Deno sürecini güvenli biçimde durdurun (Ctrl+C veya PID ile Stop-Process). Windows: `Stop-Process -Id <PID>`.
3. Supabase yerel ise: `supabase stop`.
Not: ACILIS_HAZIRLIK.md içindeki geri alma kartını takip edin.

Olası Sorunlar ve Adım Adım Çözümleri

1) Yapay zeka cevap vermiyor (AI çağrısı başarısız / zaman aşımı / boş cevap)
Önem: Yüksek (müşteri etkileşimi kilitli)
Semptomlar:
- Outbound taslakları oluşmuyor
- dry-run veya üretimde AI çağrıları 4xx/5xx, boş yanıt veya timeout

Adımlar:
1. Logs incelemesi: reply-agent loglarını ve servis stdout/stderr'ini kontrol edin. Hata kodu/mesaj kaydedin.
2. Model API durumu: sağlayıcı (Anthropic) status sayfasını kontrol edin. 401 ise anahtar, 429 ise rate limit, 5xx ise sağlayıcı tarafı.
3. Hata türüne göre:
   - 401 Unauthorized: Ortamda doğru API anahtarının yüklü olduğundan emin olun (`META_` değil, `ANTHROPIC_API_KEY` gibi). `check-env` ile değişken adlarını doğrulayın.
   - 429 Rate limit: kısa süreli retry (exponential backoff) uygulayın; kritik ise model yönlendirmesini düşük maliyetli/yerel fallback (kural tabanlı cevap) ile değiştirin.
   - 5xx veya timeout: retry/queue mekanizması yoksa çağrıyı kuyruğa atın, kullanıcıya gecikme mesajı gösterin ve ops'u bilgilendirin.
   - Boş cevap veya malformed JSON: çağrı gövdesini, headers ve provider response'u (raw) saklayın; sağlayıcıya ticket oluşturun.
4. Geçici çözüm: kural tabanlı canned response (ör. "Talebinizi aldık, kısa süre içinde dönüş yapacağız") gösterin; insan devri gerekliliğini tetikleyin.
5. Kalıcı düzeltme: retry stratejisi, timeout limitleri, provider fallback ve daha iyi hata logging ekleyin.

İlgili araçlar / komutlar:
- `node scripts/dry-run.cjs` - fixture ile tekrarlama
- Logları topla: Deno stdout, supabase function logs (varsa)


2) Yanlış işletme bilgisi gösteriyor (fiyat, saat, hizmet hatalı)
Önem: Yüksek (müşteriye yanlış bilgi)
Semptomlar:
- AI/otomatik yanıtlar hatalı fiyat/süre/saat bilgisi içeriyor

Adımlar:
1. Kaynak kontrolü: `business_config` verisini kontrol edin (Supabase `business_config` tablosu veya `config/business-config.example.md`). Yanlış veri varsa derhal düzeltin.
2. Sürüm ve cache: Eğer prompt caching veya local cache varsa cache temizlenmeli/yenilenmeli; rolling summary veya prompt cache TTL kısa tutulmalı.
3. Test: Dry-run ile aynı input'u test edin; doğru config ile davranışı doğrulayın.
4. Geçici çözüm: Hızlı düzeltme olarak default bir "bilgi eksik" mesajı gönder (ör. "Fiyat bilgisini doğruluyoruz, lütfen bekleyin"). İnsan onayına yönlendir.
5. Kalıcı düzeltme: İşletme profilinin edit ekranı veya seed/CI sürecinde doğrulama adımları ekleyin; config versiyonlama ve audit log tutun.

Sorgu örnekleri (Supabase SQL):
- SELECT * FROM business_config WHERE business_id = '<business-id>' LIMIT 1;


3) Mesaj iki kere kaydediliyor (duplicate messages)
Önem: Orta/Yüksek (kayıt sprawl, aynı mesaj için birden fazla AI çağrısı)
Semptomlar:
- conversations/messages tablosunda aynı message_id ile 2 kayıt

Adımlar:
1. İdempotency kaynağına bakın: webhook payload içinde Meta message_id veya webhook event id var mı? Kod idempotency için doğru alanı kontrol ediyor mu? (supabase/functions/*-webhook/index.ts)
2. Log: webhook alıcısının giriş loglarını inceleyin; aynı payload-incoming dört gözle görüldü mü?
3. Race condition: birden fazla worker/aynı payload tekrar iletilmiş olabilir. Eğer Supabase function tekil çalışıyorsa check veya unique constraint ekleyin: e.g., `UNIQUE (provider_id, provider_message_id)`.
4. Geçici çözüm: Duplicate'ları temizlemek için SQL kullanın ve aynı ID'ler için tek kayıt bırakın.
5. Kalıcı düzeltme: DB seviyesinde unique constraint + webhook handler'da find-or-create atomik işlem veya transaction kullanın.

Örnek SQL (tekrar eden kayıtları tespit):
- SELECT provider_message_id, COUNT(*) FROM messages GROUP BY provider_message_id HAVING COUNT(*) > 1;


4) Webhook 500 hata veriyor (POST işlenirken exception)
Önem: Yüksek
Semptomlar:
- Meta tarafında sürekli 500 dönen webhook testleri

Adımlar:
1. Hemen logs'ı kontrol et (Deno stderr / function logs). Hata stacktrace'i kaydet.
2. Common root causes:
   - JSON parse hatası (geçersiz gövde)
   - İmza doğrulama kodunda exception (null/undefined secret)
   - Veritabanı bağlantı hatası (çökme, credential yanlış)
   - Timeout veya uncaught exception
3. Geçici müdahale:
   - Eğer hata config/secret eksikliğinden kaynaklanıyorsa (ör. META_APP_SECRET boş) webhook'u kısa süreli devre dışı bırak (Meta tarafında) ve canlı testi durdur.
   - Eğer DB hatasıysa read-only moda alma / veya sunucuyu durdurup rollback yap.
4. Kalıcı düzeltme:
   - Hata yakalama (try/catch) ekleyip, hata durumunda 4xx/5xx yerine kontrollü 5xx ve hata detayının maskelenmiş logunu sakla.
   - Input validation ekle (payload schema validate).


5) İmza doğrulama hataları (401, imza mismatch)
Önem: Orta
Semptomlar:
- POST istekleri 401 dönüyor; imza hatası log'lanıyor

Adımlar:
1. Secret doğrula: `META_APP_SECRET` aynı mı (Meta uygulamasıyla) ve doğru biçimde kullanılıyor mu (gönderilen gövde ile aynı raw byte'lara uygulanıyor mu?). Deno/Node tarafında gövde string vs Buffer farkı imza hatasına yol açar.
2. Test: sample payload ile HMAC hesaplayıp `X-Hub-Signature-256` header'ı oluşturup local POST yapın.
3. Geçici çözüm: Eğer canlı test gerekiyorsa Meta'daki doğrulama token'ı (GET challenge) ile manual doğrulamayı kullanın veya Meta tarafında test moduna al.
4. Kalıcı düzeltme: İmza hesaplama fonksiyonunu gözden geçir, raw body kullanıldığından emin ol, test fixture'larını güncelle.


6) Rate limiting (429) — ise çok sayıda test isteği veya canlı trafik
Önem: Orta
Semptomlar:
- 429 dönen isteklere bağlı azalan işleme oranı

Adımlar:
1. Rate limit kaynaklarını kontrol et (daha çok Deno process memory sayaçları veya küresel rate-limiter redis/ölçüm?).
2. Geçici: test trafik hızını düşürün; retry-backoff uygulayın.
3. Kalıcı: dağıtık rate limit store (Redis veya Supabase row-based token bucket), veya provider tarafında hız sınırı varsa buna göre task queue implementasyonu.


7) Mesaj veritabanına kaydedilmiyor
Önem: Yüksek
Semptomlar:
- 200 dönüyor ama messages tablosunda kayıt yok

Adımlar:
1. Handler akışını izleyin: persistInboundMessages çağrılıyor mu? Loglarda hangi adımda duruyor?
2. DB transaction hata veriyor olabilir. Supabase client hatalarını yakala ve stdout/stderr'e yaz.
3. Permission/RLS: RLS politikaları yanlışsa insert reddediliyor; Supabase Studio'da session rolünü ve RLS policy'lerini kontrol et.
4. Geçici: Logla gelen payload'ı disk'e yaz (temporary) ve manuel insert ile doğrula.
5. Kalıcı: insert hatalarını ayrıntılı logla, RLS testlerini CI'ye ekle.


8) Randevu çakışmaları
Önem: Orta/Yüksek
Semptomlar:
- Aynı saat diliminde iki farklı randevu onayı

Adımlar:
1. İş akışı: randevu yaratma işleminde bir "reservation" phase'i ve optimistic locking ya da DB transaction kullanıldığından emin olun.
2. Geçici: çakışan randevuları tespit edip Ayşe'ye bildirin, müşterileri manuel onay için sıraya alın.
3. Kalıcı: DB üzerinde constraint veya transaction-based check; randevu creation endpoint'ine pessimistic lock veya unique constraint ekleyin.


9) Outbound mesaj gönderilemiyor (Meta API hata)
Önem: Yüksek
Semptomlar:
- Outbound API çağrıları 4xx/5xx dönüyor; mesaj gönderilmedi

Adımlar:
1. API anahtar ve izinleri kontrol et (Business / WhatsApp API token)
2. Hata koduna göre:
   - 401: token hatası
   - 403: yetki hatası (phone number veya business asset bağlanmamış)
   - 429: hız limiti
   - 5xx: sağlayıcı sorunu
3. Geçici: gönderimi durdur, logla ve kullanıcılara güvenlik mesajı gönderin (manually or via Ayşe).  
4. Kalıcı: retry, outbox queue, ve delivery status takibi ekle.


10) Performans / yüksek gecikme
Önem: Orta
Semptomlar:
- AI çağrıları yavaş, webhook işlem süresi artmış

Adımlar:
1. Profil: hangi adım uzun sürüyor (DB insert, model call, summary update)
2. Geçici: low-cost fallback ve kullanıcıya gecikme mesajı, insan devri önceliklendirme
3. Kalıcı: async processing (kuyruk), worker scaling, provider bölge seçimi, request batching


Toplama ve Kanıt Adımları (Önemli)
- Tüm olay için timestamp, request-id, conversation_id, provider_message_id, raw payload, headers (özellikle X-Hub-Signature-256), ve uygulama logunu saklayın.
- Hataları tekrar ettirilebilir şekilde dry-run fixture ile yeniden çalıştırın.
- Hata raporunu oluştururken kişisel verileri maskalayın.

Eskalasyon / İletişim
- Seviyeye göre: 1) Operasyon (Ayşe) 2) Geliştirici/Ops 3) Yönetici/Patron
- Kritik durum: Canlı trafiği durdurma yetkisi kimde net olsun (ACILIS_HAZIRLIK.md'deki "Müdahale sorumlusu").

Rollback ve Sonrası
- Rollback adımları:
  1. Webhook'u Meta Dashboard üzerinden disable et
  2. Deno sürecini durdur
  3. Gerekirse Git'te tagged bir önceki sürüme checkout ve deploy
  4. Eğer DB migration yeni ise geri alma prosedürünü uygulamadan önce veri kaybını değerlendir
- Canlıya tekrar alma: tüm düzeltmeler test edildikten sonra, kontrollü bir % ölçekte (canary) trafiği açın.

Önerilen İzleme ve Dashboard (canlıda olmalı)
- Health check endpoint ve uptime monitörü
- Error rate, 5xx/4xx oranları, AI failure rate metric
- Queue length ve retry counts
- Model usage / cost per request dashboard

Son söz
Bu rehber ACILIS_HAZIRLIK.md ile uyumlu olacak şekilde hazırlandı. Canlı açılış öncesinde:
- check-readiness çalıştırın ve tüm EKSİK/HATA'ları giderin
- dry-run ile tüm fixture'ları çalıştırıp sonuçları doğrulayın
- rollback planını ve müdahale sorumlularını teyit edin

GÖREV TAMAMLANDI, YENİ GÖREV İSTİYORUM
