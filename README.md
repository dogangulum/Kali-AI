# Kali Beauty AI

Kali Beauty Center için geliştirilen AI destekli pazarlama, mesajlaşma, satış ve randevu otomasyonu projesi. Hedef akış: **Reel veya reklam → DM → nitelikli müşteri adayı → randevu → müşteri**.

Proje ileride farklı işletmelerde de kullanılacak şekilde tasarlanıyor. Hizmetler, fiyatlar, çalışma saatleri ve iletişim tonu gibi işletmeye özel bilgiler kod yerine veritabanındaki yapılandırmada tutulacak.

## Mevcut durum

Proje başlangıç aşamasında; henüz uçtan uca çalışan bir AI asistanı veya kullanıcı arayüzü yok. Mevcut dosyalar şunları içeriyor:

- WhatsApp ve Instagram için Deno/TypeScript webhook alıcıları: GET doğrulaması, POST imza kontrolü, JSON okuma ve bellekte istek sınırlama.
- Çoklu işletme yapısını hedefleyen Supabase/PostgreSQL başlangıç şeması ve RLS politikaları.
- Referans için tutulan, kullanılmayan eski Node.js WhatsApp webhook taslağı.
- Node.js webhook davranış testleri, npm test komutu ve Deno görevleri.
- Yerel Supabase yapılandırması ve hayali bir işletme için açıklamalı ayar örneği.
- Proje hedefleri ve geliştirme kuralları.

Webhook'lar kabul ettikleri veriyi konsola yazar ve yanıt döner; veritabanına kaydetmez, AI çağrısı yapmaz ve müşteriye mesaj göndermez. AI yanıtları, model seçimi, içerik üretimi, insan onay ekranı, reklam yönetimi, randevu iş akışı ve analitik henüz uygulanmış değildir. SQL tablolarının bulunması bu işlevlerin çalıştığı anlamına gelmez. Canlı servislerin veya Meta entegrasyonlarının durumu yalnızca bu dosyalardan doğrulanamaz.

## Dosya yapısı

```text
api/
  whatsapp-webhook.js             # Kullanılmayan eski Node.js handler taslağı
config/
  business-config.example.md      # Hayali işletme için açıklamalı ayar kaydı
supabase/
  config.toml                     # Yerel Supabase geliştirme ayarları
  functions/
    instagram-webhook/index.ts    # Instagram webhook alıcısı
    whatsapp-webhook/index.ts     # WhatsApp webhook alıcısı
  migrations/
    20260921120000_core_schema.sql # Başlangıç veritabanı şeması
docs/
  PROJECT_HANDOFF.md               # Vizyon, geçmiş ve planlanan işler
tests/
  helpers/webhook-suite.cjs        # Ortak webhook test senaryoları
  instagram-webhook.test.cjs       # Instagram davranış testleri
  whatsapp-webhook.test.cjs        # WhatsApp davranış testleri
  README.md                       # Test kapsamı ve çalıştırma yönergeleri
.env.example                      # Ortam değişkenleri örneği
.github/workflows/test.yml         # GitHub Actions test iş akışı
package.json                      # npm test komutu ve Node.js gereksinimi
deno.json                         # Deno görevleri, derleyici ve biçim ayarları
LICENSE                           # MIT lisansı
AGENTS.md                         # AI ajanlarına görev yönlendirme kuralları
CLAUDE.md                         # Mimari ilkeler ve kritik proje kuralları
CONTRIBUTING.md                    # Katkı ve görev yönlendirme rehberi
README.md
```

`package.json`, Node.js **22.13 veya üzerini** belirtir ve `npm test` komutunu tanımlar; npm bağımlılığı içermez. Webhook sunucuları Deno ile, mevcut davranış testleri Node.js ile çalışır. Yerel veritabanı ayarları `supabase/config.toml` içindedir.

## Yerelde çalıştırma

Aşağıdaki adımlar yalnızca mevcut webhook alıcısını çalıştırır. Bu deneme için Meta hesabı, Supabase bağlantısı veya gerçek müşteri verisi gerekmez.

### 1. Gereksinimler

[Resmî kurulum yönergesinden](https://docs.deno.com/runtime/getting_started/installation/) Deno 2 kurun ve terminalde `deno --version` ile erişilebilir olduğunu doğrulayın. Projede belirli bir Deno sürümü sabitlenmemiştir. Webhook dosyalarında harici paket bağımlılığı yoktur; `npm install` gerekmez.

### 2. Test ortamını hazırlayın

PowerShell'de proje köküne geçin. Projeyi farklı konuma indirdiyseniz yolu uyarlayın:

```powershell
Set-Location "D:\Kali Beauty\Kali-AI"
$env:META_WHATSAPP_VERIFY_TOKEN = "local-whatsapp-test"
$env:META_INSTAGRAM_VERIFY_TOKEN = "local-instagram-test"
$env:META_APP_SECRET = "local-only-test-secret"
```

Bunlar yalnızca yerel deneme değerleridir. Kodun kullandığı değişkenler:

| Değişken | Kullanım |
| --- | --- |
| `META_WHATSAPP_VERIFY_TOKEN` | WhatsApp GET doğrulamasında beklenen token |
| `META_INSTAGRAM_VERIFY_TOKEN` | Instagram GET doğrulamasında beklenen token |
| `META_APP_SECRET` | POST gövdesinin HMAC-SHA256 imzasını doğrulayan uygulama sırrı |

Gerçek değerleri Git'e veya sohbetlere yazmayın. `.env.local` gibi dosyalar `.gitignore` kapsamındadır ve kendiliğinden yüklenmez. Dosyadan yüklemek isterseniz aşağıdaki `deno run` komutuna TypeScript dosya yolundan önce `--env-file=.env.local` ekleyin; mevcut süreç ortamındaki değerler önceliklidir. Ayrıntılar: [Deno çalıştırma ve ortam dosyası seçenekleri](https://docs.deno.com/runtime/reference/cli/run/).

### 3. Bir webhook başlatın

WhatsApp için aynı terminalde:

```powershell
deno run --allow-net --allow-env=META_WHATSAPP_VERIFY_TOKEN,META_APP_SECRET supabase/functions/whatsapp-webhook/index.ts
```

Instagram'ı denemek için önce `Ctrl+C` ile bu süreci durdurup şunu çalıştırın:

```powershell
deno run --allow-net --allow-env=META_INSTAGRAM_VERIFY_TOKEN,META_APP_SECRET supabase/functions/instagram-webhook/index.ts
```

`deno.json` ayrıca `deno task dev` kısayolunu tanımlar. Bu görev WhatsApp webhook'unu `--watch` ile başlatır; dosya değişikliklerinde yeniden yükler ve yukarıdaki komuttan daha geniş `--allow-env` izni kullanır. Ortam değişkenlerini yine önceden hazırlamanız gerekir; görev `.env.local` dosyasını kendiliğinden yüklemez.

Her iki dosya da varsayılan `Deno.serve` ayarlarını kullanır; yerel istek adresi `http://localhost:8000/` olur. Aynı portu kullandıkları için bu komutlarla ikisini aynı anda başlatmayın. Sunucu varsayılan olarak tüm ağ arayüzlerinde dinler; denemede sahte değerleri kullanın. Bu adımlar doğrudan Deno ile çalıştırma içindir; Supabase gateway veya dağıtım ortamını test etmez.

`api/whatsapp-webhook.js`, dosya başlığında kullanılmayan eski taslak olarak işaretlidir. Bağımsız HTTP sunucusu başlatmaz; dışarıdan `req`/`res` sağlayan bir çalıştırıcı bekler. Depoda bu çalıştırıcı için yapılandırma yoktur; `package.json` da bir sunucu başlatma komutu tanımlamaz. Ayrıca bu taslakta POST imza doğrulaması ve istek sınırlama bulunmaz; proje kurallarındaki canlı webhook gereksinimlerini karşılamaz.

### 4. Yanıtı kontrol edin

Sunucu açıkken ikinci bir PowerShell terminalinde, WhatsApp için:

```powershell
curl.exe -i "http://localhost:8000/?hub.mode=subscribe&hub.verify_token=local-whatsapp-test&hub.challenge=12345"
```

Beklenen sonuç: HTTP `200`, gövdede `12345`. Instagram dosyası çalışıyorsa URL'deki token değerini `local-instagram-test` yapın. Yanlış token ile `403` döner.

İmzasız POST kontrolü:

```powershell
curl.exe -i -X POST "http://localhost:8000/" -H "Content-Type: application/json" --data-raw "{}"
```

Beklenen sonuç: HTTP `401`. Başarılı POST için gönderilen gövdenin birebir baytları üzerinden `META_APP_SECRET` ile HMAC-SHA256 hesaplanmalı ve `X-Hub-Signature-256: sha256=<hex-imza>` başlığı gönderilmelidir.

| Koşul | Yanıt |
| --- | --- |
| Doğru GET doğrulaması | `200`, challenge değeri |
| Yanlış GET doğrulaması | `403 Forbidden` |
| Eksik/geçersiz POST imzası | `401 Unauthorized` |
| Geçerli imza, geçersiz JSON | `400 Bad Request` |
| Geçerli imza ve JSON | `200`, `{"received":true}` |
| Aynı IP kovasında 60 saniyede 30 isteğin aşılması | `429 Too Many Requests` |
| GET/POST dışındaki metotlar | `405 Method Not Allowed` |

İstek sınırı diğer kontrollerden önce uygulanır. Sayaç süreç belleğindedir, yeniden başlatmada sıfırlanır ve sunucular arasında paylaşılmaz. IP, `x-forwarded-for` başlığından okunur; başlık yoksa istekler ortak `unknown` kovasına girer. Geçerli POST gövdesinin tamamı konsola yazıldığı için denemelerde gerçek müşteri verisi kullanmayın.

## Otomatik testler

Node.js **22.13 veya üzeri** ve npm ile proje kökünden:

```powershell
npm test
```

`package.json` içindeki komut `node --test tests/**/*.test.cjs` şeklindedir. Harici paket kurulumu gerekmez. Test dosyalarını açıkça belirterek npm olmadan da çalıştırabilirsiniz:

```powershell
node --test tests/whatsapp-webhook.test.cjs tests/instagram-webhook.test.cjs
```

Mevcut testler gerçek TypeScript handler'larını bir VM içinde çağırır; HTTP sunucusu başlatmaz, ağ isteği göndermez ve gerçek ortam dosyalarını okumaz. Supabase veya Meta bağlantısı gerekmez. Kapsam ve sınırlamalar: [tests/README.md](tests/README.md).

`.github/workflows/test.yml`, `main` dalına push ve bu dala yönelik pull request olayları için Node.js test iş akışı tanımlar. Dosyanın bulunması CI çalışmasının başarılı olduğunu göstermez; bu incelemede GitHub çalışma sonuçları kontrol edilmedi.

`deno.json` içindeki `deno task test`, `deno test --allow-net --allow-env` çalıştırır. Mevcut `.test.cjs` dosyaları Node.js test çalıştırıcısı için yazılmıştır; bunlar için yukarıdaki Node.js/npm komutlarını kullanın. Depoda ayrıca Deno test dosyası bulunmuyor.

## Veritabanı

[Başlangıç migration dosyası](supabase/migrations/20260921120000_core_schema.sql) şu tabloları tanımlar:

| Alan | Tablolar |
| --- | --- |
| İşletme ve yapılandırma | `businesses`, `business_config` |
| Mesajlaşma ve satış | `conversations`, `messages`, `leads`, `appointments` |
| İçerik ve reklam | `ad_campaigns`, `content_items`, `content_layers`, `approvals` |
| İzleme ve insan desteği | `audit_log`, `escalations`, `model_routing_log`, `funnel_events` |

Şema RLS'yi etkinleştirir; politikalar çoğunlukla JWT içindeki `business_id` alanını kullanır. Bu claim'i üreten kimlik doğrulama akışı depoda yoktur. Supabase service role RLS'yi aşar; şemanın varlığı tek başına tamamlanmış işletme izolasyonu anlamına gelmez.

Hizmetler, fiyatlar, haftalık çalışma saatleri ve konuşma tonu için [hayali işletme ayar örneği](config/business-config.example.md) bulunur. Dosya, `businesses` ile `business_config.config` ilişkisini açıklar; otomatik yüklenen seed değildir. Ayar giriş ekranı ve webhook'ların bu ayarları okuması henüz uygulanmamıştır.

Webhook denemesi için migration gerekmez; mevcut alıcılar veritabanına bağlanmıyor. SQL dosyası Supabase'in `auth.jwt()` fonksiyonuna bağlıdır, düz PostgreSQL üzerinde ek hazırlık olmadan çalışması beklenmemelidir. Tekrar uygulanabilir bir kurulum betiği değildir; mevcut tablolara elle yeniden çalıştırılmamalıdır.

### Yerel Supabase veritabanı

`supabase/config.toml`, `kali-ai-local` adıyla ayrı bir yerel geliştirme ortamı tanımlar. Bu ad bir bulut proje kimliği değildir. Yerel PostgreSQL ana sürümü 17 olarak ayarlanmıştır; canlı veritabanının sürümü kontrol edilmemiştir. Seed dosyası bulunmadığı için seed yükleme kapalıdır. Bu yapılandırmada Edge Runtime ve analitik kapalıdır; webhook denemeleri yukarıdaki Deno adımlarıyla yapılır.

Daha sonra denemek için Supabase CLI ve çalışan Docker Desktop (Linux container modu) gerekir. Proje kökünden aşağıdaki komutları kullanabilirsiniz; yapılandırma zaten mevcut olduğundan `supabase init` gerekmez:

```powershell
supabase start
supabase status
```

İlk başlatmada Docker imajlarının indirilmesi için internet gerekebilir. CLI yerel ortamı oluştururken `supabase/migrations/` altındaki migration dosyalarını uygular. Supabase hesabı, `supabase login`, `supabase link` veya `supabase db push` gerekmez.

| Yerel servis | Adres / port |
| --- | --- |
| API | `http://127.0.0.1:54321` |
| PostgreSQL | `127.0.0.1:54322`, veritabanı: `postgres` |
| Studio | `http://127.0.0.1:54323` |
| Migration karşılaştırması için shadow veritabanı | `54320` |

Yalnızca sahte deneme verileri kullanın. Yerel şemayı baştan kurmak gerektiğinde `supabase db reset --local` kullanılabilir: **yerel verileri siler**, migration dosyalarını yeniden uygular ve seed kapalı olduğu için örnek veri eklemez. İşiniz bittiğinde `supabase stop` yerel servisleri durdurur; varsayılan olarak verileri korur.

Bu yapılandırma hazırlanırken hiçbir servis başlatılmadı, bağlantı kurulmadı veya yükleme yapılmadı. CLI ile başlatma ve migration uygulaması doğrulanmadı.

## Geliştirmeye devam ederken

Önce [proje devir belgesini](docs/PROJECT_HANDOFF.md), [proje kurallarını](CLAUDE.md) ve [ajan yönlendirmesini](AGENTS.md) okuyun. Devir belgesindeki hedeflerle kodun mevcut durumunu ayrı değerlendirin. Oracle Cloud VPS, Anthropic model yönlendirmesi ve tam otomasyon proje planında yer alır; burada bunların çalışan uygulaması veya dağıtım betikleri bulunmuyor.

Mevcut Meta reklam hesapları, kampanyalar ve WhatsApp müşteri geçmişi korunmalıdır. Meta'ya webhook adresi tanımlamadan önce gerçek public HTTPS endpoint hazır olmalıdır. Mimari ve güvenlik açısından kritik geliştirmeler, `AGENTS.md` uyarınca Claude'a yönlendirilir.

Bu README güncellemesinde komutlar ve açıklamalar mevcut dosyalarla karşılaştırıldı; testler, webhook sunucuları ve Supabase ortamı çalıştırılmadı. Çalıştırma adımları için bu inceleme kapsamında uçtan uca doğrulama yapılmadı.

## Lisans

Projenin lisansı [MIT](LICENSE) olarak belirtilmiştir; `package.json` içindeki lisans alanı da MIT'dir.
