# Proje geneli test kapsam raporu

İnceleme tarihi: 21 Eylül 2026. Bu rapor çalışma ağacındaki dosyaları esas alır; canlı kurulumun durumu hakkında bir doğrulama değildir.

## Sonuç ve çalıştırma kanıtı

İnceleme başlangıcında `npm test`: **121 test geçti**. Bu çalışmada **54 test eklendi**. Son `npm test` sonucu: **175 test, 173 geçen, 2 TODO, 0 normal başarısız test, 0 atlanan test**.

**2 TODO başarı değildir.** Bunlar çalışan ve mevcut davranışın beklenen koşulu karşılamadığını gösteren test gövdeleridir; boş taslak veya skip değildir. Node, TODO olarak işaretli başarısızlıkları komutun çıkış koduna yansıtmaz. Dolayısıyla `npm test` çıkış kodunun 0 olması aşağıdaki bilinen açıkların kapandığını göstermez. Bu görev kapsamında üretim kodu, migration'lar, araçların davranışı ve mevcut fixture içerikleri tarafımdan değiştirilmedi. İnceleme sırasında başka bir işlem Instagram fixture'larını, Türkçe hizmet adı normalizasyonunu ve dry-run hata çıkışlarını düzeltti; değişiklikler korunup ilgili testler normal teste dönüştürüldü. Menüde `shell: false` değişikliği de son kaynak kontrolünde görüldü. Diğer düzeltmelerden sonra da ilgili TODO işareti kaldırılarak test zorunlu hale getirilmelidir.

Ek olarak `node scripts/dry-run.cjs` çalıştırıldı. İlk çalıştırmada iki Instagram mesaj örneğinde HTTP 200 alınmasına rağmen hiç mesaj kaydedilmedi. Eşzamanlı fixture düzeltmesinden sonra tekrar çalıştırmada dokuz fixture'ın sekiz mesaj örneği için sahte taslak üretildi; yalnız WhatsApp okundu örneğinde kayıt oluşmadı. Dry-run çıkış kodu 0'dı.

Gerçek Anthropic, Meta, Supabase, Deno HTTP sunucusu veya migration çalıştırılmadı. Deno PATH üzerinde bulunamadı. Ortam dosyaları/gerçek anahtarlar bu incelemede okunmadı. Testlerde sağlayıcı, veritabanı ve CLI dosya sistemi sahte karşılıklarla çalışır; mevcut yerel araç testleri alt süreç ve dolu yerel port kontrolü de yapar.

Satır/dal kapsam yüzdesi ölçülmedi. TypeScript kodu VM içine dönüştürülerek yüklendiği için salt Node kapsam yüzdesi zaten gerçek Deno ve SQL kapsamını temsil etmez. Aşağıdaki değerlendirme davranış ve test kanıtına dayanır.

## İncelenen envanter

- Üretim kaynakları: iki `supabase/functions/*-webhook/index.ts`, `_shared/reply-agent.ts`, eski `api/whatsapp-webhook.js`.
- Araçlar: `check-env`, `check-webhooks`, `check-readiness`, `simulate-webhook`, `run-local-tests`, `dry-run`, inceleme sırasında eklenen `dev-tools` — tamamı `scripts/*.cjs`.
- Veritabanı: core schema ve işletme seed migration'ı.
- Testler: bütün `tests/*.test.cjs`, iki `tests/helpers/*.cjs` yardımcısı, dokuz JSON fixture.
- Yapılandırma: `package.json`, `deno.json`, `supabase/config.toml`, `.github/workflows/test.yml`; işletme ayarı örneği ve proje yönergeleri bağlam olarak incelendi.
- `src/` içinde uygulama kaynak dosyası bulunmadı. Yerel ajan/eklenti ayarları, gizli dosyalar ve bağımlılık kaynakları ürün kodu kapsamına alınmadı.

## Test dosyaları: önce ve sonra

| Test dosyası | Önce | Sonra | Bu tur eklenen kapsam |
|---|---:|---:|---|
| `whatsapp-webhook.test.cjs` | 39 | 39 | Değiştirilmedi |
| `instagram-webhook.test.cjs` | 38 | 38 | Değiştirilmedi |
| `reply-agent.test.cjs` | 16 | 16 | Değiştirilmedi |
| `reply-agent-boundaries.test.cjs` | 0 | 14 | Saf yönlendirme, prompt, konuşma metni ve maliyet aritmetiği |
| `check-env.test.cjs` | 6 | 7 | Yinelenen değişken bildirimleri |
| `check-webhooks.test.cjs` | 13 | 16 | Yanıt okuma hatası, boş yerel değerin ortamdan tamamlanması, eksik günlük argümanı; 1 TODO |
| `check-readiness.test.cjs` | 4 | 8 | Boş dosya/dizin, alt süreç istisnası, yanlış Deno ana sürümü |
| `run-local-tests.test.cjs` | 5 | 7 | Birden fazla HTTP yanıtı, boş gövde ve boolean olmayan başarı alanı |
| `simulate-webhook.test.cjs` | 0 | 8 | CLI kullanımı, eksik dosya, byte koruma, yanıt gösterimi ve bağlantı hatası |
| `dry-run.test.cjs` | 0 | 6 | Girdi seçimi, sıralama, rapor, hatadan sonra devam ve başarısız çıkış |
| `dev-tools.test.cjs` | 0 | 7 | Menü, seçim, dosya yokluğu, alt süreç sonucu, fixture seçimi; 1 TODO |
| `fixtures.test.cjs` | 0 | 9 | Fixture'ların uygulamanın tükettiği veri şekliyle uyumu; tamamı normal test |
| **Toplam** | **121** | **175** | **52 ek geçen test, 2 çalıştırılmış açık test** |

## 1. Webhook alımı ve veri kaydı

Kaynaklar: [WhatsApp](../supabase/functions/whatsapp-webhook/index.ts), [Instagram](../supabase/functions/instagram-webhook/index.ts), [ortak test yardımcısı](../tests/helpers/webhook-suite.cjs).

### Mevcut kanıt

- İki kanalda 28'er ortak senaryo: doğru/yanlış/eksik/boş token, yanlış/eksik mode; doğru challenge; yapılandırılmamış token.
- UTF-8 POST, eksik/boş/sahte imza, farklı anahtar, yanlış algoritma, eksik önek, boş/kısa/hex olmayan hash, imzadan sonra değiştirilen gövde, eksik uygulama sırrı.
- Geçersiz JSON için 400, imza kontrolünün JSON ayrıştırmadan önce gelmesi, PUT için 405.
- 30/31 istek sınırı, 59.999/60.000 ms sınırı, GET/POST ortak sayacı, farklı IP'ler, çoklu/eksik forwarded başlığı.
- Metin kaydı, aynı gönderenin konuşmasının tekrar kullanılması, farklı gönderenler, görselin JSON olarak saklanması, durum/okundu olayının kayıt oluşturmaması.
- WhatsApp'ta konuşma arama/mesaj ekleme hatası; Instagram'da konuşma ekleme hatası; hatada 200 ve log.
- Her iki kanalda sahte AI taslağının kaydı, Anthropic 500 hatasında inbound kaydın korunması, AI anahtarı yokken taslak üretilmemesi.

### Önemli açıklar

- Aynı Meta mesaj kimliğinin tekrar tesliminde tek kayıt/tek AI çağrısı garanti edilmiyor. Mevcut “ikinci mesaj” testleri aynı varsayılan harici kimlikle iki kayıt bekliyor; idempotency testi değildir.
- Eşzamanlı find-or-create ve summary güncellemeleri test edilmiyor. Aynı konuşmayı iki kez açma veya yeni özeti eski veriyle ezme ihtimali ölçülmemiş.
- Çoklu entry, çoklu mesaj, aynı pakette birden fazla gönderen ve paketin ortasında hata test edilmiyor. Kod incelemesine göre N'inci kayıt hata verirse daha önce yazılan mesajlar kalabilir, ancak `persistInboundMessages` sonuç listesini döndüremediğinden onlar için de taslak üretimi atlanabilir.
- `null`, boş nesne, yanlış türde alanlar, eksik/boş sender, boş metin, ses/video/konum/interaktif içerik, Instagram echo ve teslim sırası testleri yok.
- Eksik Supabase URL, anahtar ve işletme kimliği ayrı ayrı sınanmıyor; gerçek istemci başlatma hataları yok.
- Hata matrisi iki kanalda simetrik değil: WhatsApp conversation-insert; Instagram select/message-insert hataları açık.
- Gerçek HTTP gövde boyutu, bağlantı kesilmesi, proxy güvenilirliği, dağıtık limit, sayaç belleği, soğuk başlangıç ve paralel yük testleri yok.
- İmza ayrıştırmada ek `=` parçaları, yinelenen başlıklar ve boş yapılandırma gibi ek sınır durumları yok. Güvenlik düzeltme/test tasarımı Claude kapsamındadır.

## 2. Yapay zeka taslağı ve model yönlendirme

Kaynak: [reply-agent.ts](../supabase/functions/_shared/reply-agent.ts).

Bu bileşen artık **mevcut**: işletme ayarını ve konuşma özetini okuyor, model seçiyor, Anthropic üzerinden taslak istiyor, `outbound` mesaj satırı ve yönlendirme logu yazıyor, özeti güncelliyor. Meta'ya cevap gönderme kodu yok; `outbound` satırının varlığı gönderildiği anlamına gelmiyor.

| Davranış | Önceki kapsam | Bu tur eklenen / kalan açık |
|---|---|---|
| `classifyComplexity` | Basit fiyat, itiraz, hizmet adı, belirsiz ve uzun mesaj | 220/221 sınırı, birden fazla soru, kural önceliği, yalnız hizmet adı, boş girdi/config, İngilizce refund eklendi. Türkçe büyük harf açığı testle gösterildi ve eşzamanlı düzeltmeden sonra ilgili test geçti. |
| `buildSystemPrompt` | İşletme alanları, farklı ayarlar, pasif hizmet | Eksik config, sıfır/eksik fiyat, süre/açıklama, kapalı gün/mola, tüm ton alanları eklendi. Yanlış türde config ve prompt enjeksiyonu açık. |
| `buildUserTurn` | Doğrudan testi yoktu | Eski özetin yeni mesajdan önce gelmesi ve özet yokken alanın atlanması eklendi. Çok büyük/çelişkili geçmiş açık. |
| `computeCostUsd` | Yalnız kaydedilen değerin sayı olması | Kodda tanımlı oranlarla kesin sonuç, sıfır token, bilinmeyen model eklendi. Negatif/NaN token, gerçek tarife ve özetleme maliyeti açık. |
| `callAnthropicMessages` | Sahte başarı ve 500, üst katman üzerinden | İstek URL/header/gövde/max_tokens sözleşmesi, 401/429/503, ağ kesintisi, bozuk JSON, çoklu içerik blokları, boş cevap ve eksik usage doğrudan sınanmıyor. |
| `foldConversationSummary` | Kısa özet, uzun özetin sıkıştırılması, çağrı hatasında kesme | Tam 1200/1201 sınırı, boş/çok uzun sıkıştırma cevabı, anahtarsız uzun özet, bilgi kaybı ve eşzamanlı güncelleme açık. |
| `generateAndStoreReply` | Başarılı kayıt/log/özet, eksik anahtar/config, log insert hatası, API 500 | Config select, summary select/update, outbound insert hataları; boş cevap; eksik konuşma; kısmi başarının etkileri açık. |

### Test sayısının göstermediği riskler

- Sahte model sabit cevap verir. Fiyat doğruluğu, ton, itiraz yönetimi, alakasız sorular, gerçek dil kalitesi, uydurma bilgi ve randevu vaadi otomatik olarak ölçülmüyor. [Müşteri senaryoları](TEST_SENARYOLARI.md) hâlâ gerekli.
- Sınıflandırma son mesaja bakıyor; geçmişteki itiraz/bağlamın model seçimine etkisi test edilmiyor. Pasif hizmet adları sınıflandırıcıda filtrelenmiyor; prompt'ta filtreleniyor.
- `services` yanlış tipteyse `.map` başarısız olabilir. Çalışma saati aralıklarının yanlış tipleri ve geçersiz fiyatlar da doğrulanmıyor.
- Prompt fiyatın `unit` ve `tax_included` alanlarını taşımıyor; işletme saat dilimi ve güncel tarih de prompt'a eklenmiyor. Paket/seans, vergi ve “yarın” gibi ifadelerin doğru yorumlanması ölçülmemiştir.
- Başarılı ama boş model cevabı için içerik doğrulaması yok; kod boş outbound satırı yazabilir. `stop_reason` ve cevabın kesilmesi ele alınmıyor.
- Anthropic çağrısında timeout/iptal ve retry politikası yok. Webhook cevap vermeden AI çağrısını bekliyor; gecikmenin yeniden teslimata etkisi test edilmemiş.
- Özetleme çağrısının token maliyeti yönlendirme kaydına eklenmiyor. Mevcut maliyet testi yalnız kod aritmetiğini doğrular; sağlayıcı model kimlikleri, erişilebilirlik ve tarifeler dışarıdan doğrulanmadı.
- Summary okumak/güncellemek için yalnız conversation ID filtresi var. Yanlış işletmeye ait ID kullanımı ve yetkilendirme sınırları için sahte tek işletmeli test yeterli değil; Claude incelemesi gerekir.
- Yönlendirme logu outbound mesajından önce yazılıyor. Yorumdaki “cevap güvenle saklandıktan sonra bookkeeping” sırası fiili sırayla uyuşmuyor; outbound insert hatasında yalnız maliyet logu kalması test edilmiyor.

## 3. Yardımcı araçların tamamı

### check-env

Eksik dosyalar, eksik adların listelenmesi, tam ortam, fazla ad, yorum/boş satır/CRLF, değerde `=` ve boş değer davranışı mevcut testlerde var. Yinelenen bildirimlerin eksik listesinde tekrar oluşturmaması eklendi.

Sınır: değişken adlarını denetler; boş, örnek, geçersiz veya yanlış hedefe ait değerleri doğrulamaz. `export KEY=...`, çok satırlı değer ve genel dotenv uyumu garanti edilmiyor. Okuma izni/IO hatası ve bozuk şablon için kullanıcı dostu hata testi yok.

### check-webhooks

Her kanalda doğru token, yanlış/eksik token ve yanlış mode olmak üzere dört GET kontrolü; eksik ayarlar, challenge uyuşmazlığı, HTTP 500, bağlantı hatası, bir kanalın başarısızlığı, yerel ayar önceliği ve iki log seçeneği kapsanıyor. Yanıt gövdesi okunamaması ve boş ayarın process ortamından tamamlanması eklendi. Eksik `--log-file` için kontrolsüz istisna TODO testinde gösterildi.

Hâlâ açık: geçersiz URL, log dizininin yokluğu/yazma izni, sonsuza kadar bekleyen sunucu, HTTP redirect ve dotenv alıntılama. Araç HTTP timeout tanımlamıyor. Testleri sahte fetch kullanıyor; gerçek uzak sağlık kontrolü bu çalışmada yapılmadı.

### check-readiness

Dosya/JSON/sürüm/ayar-adı kontrollerinin başarı ve eksik yolları mevcut. Boş dosya, dosya yerine dizin, alt süreç istisnası ve yanlış Deno ana sürümü eklendi.

Sınır: gerçek TOML anlamı, runtime importları, bağlantı, AI erişimi ve canlı hazırlık denetlenmiyor. Gerekli dosya listesinde yeni `_shared/reply-agent.ts` bulunmuyor; shared modül eksikken yerel envanter başarılı görünebilir. JSON'un ayrıştırılabilmesi şema uygunluğu değildir. CLI özetinin/çıkışının tam süreç testi ve güncel bütün kaynak bağımlılıklarının envanteri açık.

### simulate-webhook

Daha önce bağımsız test yoktu. Kullanım/yardım, eksik fixture, yerel hedefe POST, UTF-8 gövdenin değiştirilmeden aktarılması, yanıt gösterimi ve bağlantı hatası eklendi. HTTP 500'ün yalnız gösterilip çıkış kodunun 0 kalması mevcut davranış olarak açıkça test edildi; otomatik kabul kararı için bu araç tek başına kullanılmamalı.

İmza algoritması değiştirilmedi; bu tur kriptografik test eklenmedi. Dosya okuma izni, geçersiz/çok büyük girdi, bilinmeyen seçenek, redirect ve bağımsız timeout açık. İmza denetimi mevcut webhook testlerinde bulunuyor; bu CLI ile gerçek sunucu arasındaki entegrasyon ayrıca doğrulanmalı.

### run-local-tests

Mevcut beş test yanıt kontrolü, ortam filtreleme, alt süreç başarı/hatası, süre aşımı ve dolu portu kapsıyordu. Birden fazla HTTP yanıtını ve boş/yanlış tipte başarı gövdesini reddetme eklendi.

Önemli açıklar:

- Gerçek Deno ile tam başarı, geç başlama, başlangıç/işlem ortasında çökme, Ctrl+C/SIGTERM temizliği ve port yarışı test edilmiyor.
- Webhook kaynakları artık `ANTHROPIC_API_KEY` okuyor; runner'ın sınırlı `--allow-env` listesinde bu ad yok. Kaynak karşılaştırmasına göre Deno ortam izni hatası beklenir. Deno yokluğunda gerçek runtime hatası yeniden üretilemedi; henüz çalışan HTTP paketi diye değerlendirilmemeli.
- Runner yalnız WhatsApp/Instagram test dosyalarını çağırır. Ayrı reply-agent ve araç testleri çağrılmaz; sabit fixture listesi sonradan eklenen dört müşteri senaryosunu kapsamaz.
- Veritabanı ve Anthropic değişkenleri aktarılmadığından HTTP denemeleri kayıt/AI taslak davranışını zaten doğrulamaz.

### dry-run

Yeni testler boş klasör, JSON seçimi/sıralaması, rapor çıktısı, kayıt olmayan olay ve bozuk girdiden sonra devamı kapsar. CLI testlerinde DB/handler yardımcısı sahte olduğundan bunlar **araç kontrol akışı** kanıtıdır. Buna ek olarak gerçek `dry-run` mevcut VM tabanlı handler yardımcısıyla çalıştırılarak fixture uyuşmazlığı gözlendi.

Hata ve HTTP 500 için başarısız çıkış bekleyen iki test başlangıçta sorunu gösterdi. Eşzamanlı kaynak değişikliği `hadFailure` takibi ekledi; iki test artık normal test olarak geçiyor. Bozuk girdinin hatası stderr üzerinden bildiriliyor, sonraki fixture işleniyor ve genel sonuç 1 oluyor. Bilinmeyen dosya öneki, klasör okuma hatası, beklenen inbound/outbound sayıları ve tüm fixture'ların gerçekten işlenmesi için zorunlu kabul ölçütü yok. Her fixture yeni mock konuşma açtığından çok turlu sohbetin devamlılığı test edilmiyor. Sabit sahte cevap, gerçek AI kalitesini ölçmez.

### dev-tools

İnceleme sırasında gelen menü de kapsama alındı. Çıkış, geçersiz seçim, araç yolu/çalışma dizini, eksik script, sıralı fixture seçimi/bozuk-imza seçeneği ve çocuk süreç başarısızlığını gösterme eklendi. Boşluklu tırnaklı günlük yolu TODO testinde parçalanıyor.

Gerçek terminal EOF/Ctrl+C, boş/geçersiz fixture seçimi, eksik Node ve spawn hatası, çalışma alanı yolunda boşluklar ayrıca sınanmalı. İlk incelemede `spawnSync` kullanıcıdan alınan ek argümanlarla `shell: true` kullanıyordu; eşzamanlı değişiklik bunu `shell: false` yaptı. Gerçek işletim sistemi davranışı test edilmedi. Yeni testler gerçek shell veya uzak webhook çalıştırmaz. Menüdeki “npm test + ...” açıklaması da runner'ın yalnız iki test dosyası çağırdığı gerçeğiyle uyuşmuyor.

## 4. Veritabanı, fixture ve test altyapısı

### SQL

İki migration için gerçek SQL testi yok. Tablo/enum/check/FK/default davranışı, silme zincirleri, işletme izolasyonu, eksik/geçersiz JWT claim'i, service-role ve istemci rollerinin ayrımı doğrulanmıyor. `content_layers` üst kayda bağlı RLS de test edilmemiş.

Mesajın business ID'si ile conversation'ın business ID'sinin uyumu ayrı FK'lerle garanti edilmiyor; çapraz işletme ilişkileri için gerçek DB testi gerekir. Conversation için `(business_id, platform, customer_identifier)` benzersiz kısıtı bulunmuyor; mock Map bu tür çoğalmayı gerçek DB gibi modellemiyor. Seed'in tekrar ve paralel uygulanması, migration sırası ve geri dönüş uyumluluğu doğrulanmadı. Bunlar Claude kapsamındaki veri/izolasyon işleridir.

### Fixture'lar

Dokuz fixture için veri şekli kontrolü eklendi; son durumda tamamı geçiyor. İlk incelemede Instagram fixture'ları `entry[].changes[].value.messages[]`, gerçek handler ve webhook testleri ise `entry[].messaging[]` kullanıyordu. Eşzamanlı düzenleme iki fixture'ı `messaging` yapısına taşıdı; KAPSAM-04 kapandı ve iki test zorunlu normal regresyon testi oldu. Bu bulgu, handler içindeki elle hazırlanmış test verilerinin geçmesinin disk üzerindeki fixture'ların doğru olduğunu kanıtlamadığını gösterdi.

Fixture zamanı sabit, mesajları tek olaylık ve örnek konuşma geçmişi yok. Genel senaryo testi olarak takvim tarihi/mesai durumu/AI yanıt kalitesi doğrulanmıyor.

### Test yardımcılarının sınırları

- `webhook-suite.cjs`, TS tiplerini ve import/export satırlarını değiştirerek VM'de çalıştırır; Deno modül çözümleme, tip kontrolü, env/ağ izinleri sınanmaz.
- Supabase mock'u tablo kısıtlarını, RLS'yi, transaction'ları, zaman aşımını ve eşzamanlılığı uygulamaz. `business_config` mock'u filtre değerinden bağımsız tek config döndürür; işletme izolasyonunu kanıtlayamaz.
- Handler testlerinde sanal saat sabittir; latency alanının sayı olması gerçek gecikme ölçümünün doğruluğunu kanıtlamaz.
- `run-check-script.cjs` gerçek araç kaynaklarını VM'de çalıştırır; fs/fetch/process çıkışı sahtedir. Bu tur dry-run ve menü testleri için modül/IO enjeksiyonu ve exitCode desteği genişletildi. Bilinmeyen importlar reddedilir; gerçek env dosyaları/ağ kullanılmaz.
- CLI mock testlerinin geçmesi gerçek işletim sistemi izinleri, terminal, shell quoting ve DNS davranışının kanıtı değildir.

## 5. Eski kod, CI ve henüz bulunmayan işlevler

`api/whatsapp-webhook.js` kullanılmayan eski handler: doğrudan test yok; POST imza/rate-limit içermiyor. Aktif üretim yolu olarak test kapsamına dahil edilmemeli; gelecekte yanlışlıkla kullanılmasını önleyecek kontrol de yok.

CI yalnız Ubuntu/Node 22 üzerinde `npm test` tanımlıyor. Deno check/lint/HTTP, SQL/RLS, gerçek provider sözleşmesi ve Windows terminal entegrasyonu yok. `setup-node` npm cache istiyor fakat çalışma ağacında `package-lock.json` yok; cache hazırlığının lockfile gereksinimi ayrıca doğrulanmalı. CI çalıştırma geçmişi bu incelemede açılmadı. `deno task test` mevcut Node test paketinin eşdeğeri değildir.

Şu alanlarda uygulama akışı bulunmuyor; dolayısıyla bunları yalnız “test eksikliği” diye sınıflandırmak yanlış olur:

- Gerçek WhatsApp/Instagram outbound gönderimi ve teslim/okundu takibi.
- Lead qualification, takvim uygunluğu, randevu oluşturma/değiştirme/iptal.
- İnsan onay ekranı, onay öncesi gönderim engeli ve insan devralma iş akışı.
- İçerik/reklam üretimi ve yayınlama, katman bazında tekrar üretim.
- Genel çoklu işletme yönlendirmesi, kullanıcı/JWT kimlik akışı.
- Tam analytics/funnel, operasyonel maliyet raporu, sağlayıcı değişimi ve prompt-cache entegrasyonu.

Bu özellikler için tablolar veya belgeler olması çalışan kod/test bulunduğu anlamına gelmez.

## 6. Açıkların önceliği ve takip

| Öncelik | Konu | Kanıt / sonraki kabul ölçütü |
|---|---|---|
| Kapandı | Instagram fixture şekli | KAPSAM-04: eşzamanlı düzeltme korunup iki zorunlu regresyon testi etkinleştirildi; tekrar kuru denemede kayıt ve sahte taslak görüldü. Otomatik kayıt/taslak sayısı kabul testi ayrıca eklenebilir. |
| Yüksek | Deno runner izin uyumsuzluğu | Kaynak karşılaştırması; gerçek Deno altında iki handler'ın başlatılması doğrulanmalı. |
| Yüksek | Tekrar teslimat, eşzamanlılık, RLS | Henüz entegrasyon testi yok. Aynı mesaj tek kayıt/tek taslak; çapraz işletme okuma/yazma reddi gerçek test DB'sinde kanıtlanmalı. |
| Yüksek | AI boş/hatalı/geciken cevap ve kısmi DB başarısı | Anahtar/provider/PII akışlarını Claude incelemeli; gerçek ağa çıkmadan kontrollü hata matrisi, ardından ayrı provider doğrulaması gerekir. |
| Kısmen kapandı | Başarılı görünen kuru deneme | KAPSAM-02/03 hata/HTTP çıkışları düzeltildi ve testler geçti. Genel sonuç beklenen mesaj/taslak sayılarıyla da ilişkilendirilmeli. |
| Takip | Menüde shell argümanları | Eşzamanlı `shell: false` değişikliği görüldü; gerçek terminal/yol uyumluluğu ve güvenlik değerlendirmesi ayrıca gerekli. |
| Kapandı | Türkçe yönlendirme | KAPSAM-01: eşzamanlı Türkçe locale normalizasyonu sonrasında CİLT BAKIMI testi geçti. |
| Orta | CLI argümanları | KAPSAM-05/06: eksik log değeri ve tırnaklı yol. Kontrollü hata ve doğru tek argüman iletimi gerekli. |
| Orta | Hazırlık/CI envanteri | Shared AI modülü, tüm test dosyaları, Deno izinleri ve fixture listesi güncel kaynaklarla karşılaştırılmalı. |
| Orta | Gerçek cevap kalitesi | Sahte fetch yeterli değil; hayali işletme verisiyle fiyat/ton/itiraz/uygunluk değerlendirmesi yapılmalı. |

Bu görevde güvenlik/secret/PII/işletmeler arası izolasyonla ilgili üretim değişikliği yapılmadı. [AGENTS.md](../AGENTS.md), bu işleri Claude'a ayırır. Eklenen AI testleri saf yönlendirme, metin oluşturma ve aritmetik davranışlarıyla sınırlıdır. Sağlayıcı/DB güvenlik sınırları için eksik testler yukarıda açıkça listelenmiştir; tamamlanmış sayılmamalıdır.

## Yeniden çalıştırma

```powershell
npm test
node scripts/dry-run.cjs
```

`npm test` çıktısında **pass ve todo sayılarını birlikte** değerlendirin. TODO kanıtları düzeltilmeden “bütün senaryolar başarılı” sonucu çıkarılmamalıdır. `dry-run` da şu haliyle bir kabul kapısı değil, açıklamalı sahte akış gösterimidir.
