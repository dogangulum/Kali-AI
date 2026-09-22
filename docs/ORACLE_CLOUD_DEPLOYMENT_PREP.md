# Oracle Cloud Taşıma Hazırlık ve Yol Haritası

Bu belge, mevcut projedeki yazılı kurallara ve dosyalara dayalı olarak, sistemi Oracle Cloud VPS üzerine taşıma için gerekli hazırlık ve sırayı özetler. Yeni bir mimari karar eklenmez; projede zaten bildirilen bilgiler düzenli şekilde bir araya getirilir.

## 1) Mevcut hedef mimari

Proje kurallarına göre mevcut yapı:
- Backend: Oracle Cloud VPS
- CRM/DB: Supabase / PostgreSQL (proje adı: "Kali Beauty AI", eu-west-1)
- DM agent: Claude / Anthropic API
- Webhook güvenliği: her webhook için `X-Hub-Signature-256` doğrulama ve rate limiting zorunlu
- Reklam üretim akışı: görsel/video, seslendirme ve altyazı ayrı katmanlar halinde üretilir

Ayrıca proje README ve CLAUDE.md'ye göre şu durum geçerli:
- Webhook handler'ları Deno/TypeScript üzerinden çalışır.
- Supabase üzerinde başlangıç şeması ve RLS politikaları vardır.
- Webhook'lar gerçek inbound mesajları `conversations` ve `messages` tablosuna yazabilir; bu işlem tek-tenant `KALI_BUSINESS_ID` ile çalışır.
- Still, AI yanıtı, lead qualification, randevu akışı, outbound mesaj gönderimi ve tam operasyonel deployment için ek çalışma gereklidir.

## 2) Taşıma öncesi beklenen hazırlık maddeleri

### 2.1. Ortam ve gizli bilgiler

Projede açıkça belirtilen gereklilikler:
- Tüm secret/token/API key'ler Git'e commit edilmez; `.env` veya secrets manager içinde tutulur.
- `META_WHATSAPP_VERIFY_TOKEN`
- `META_INSTAGRAM_VERIFY_TOKEN`
- `META_APP_SECRET`
- `KALI_BUSINESS_ID`
- Supabase bağlantı bilgileri (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- Gerekirse Anthropic model erişim bilgileri

Bu değerler Oracle Cloud makinesine güvenli şekilde aktarılmalı; repo içine yazılmamalı ve sohbetlerde paylaşılmamalı.

### 2.2. Public HTTPS ve webhook erişimi

Proje kurallarında net olarak yazıldığı gibi:
- Meta webhook alanlarına, endpoint gerçek public HTTPS üzerinden cevap vermeden sahte/test URL girilmez.
- Webhook adresi gerçek üretim/ücretsiz test URL değil, erişilebilir HTTPS endpoint olmalıdır.

Bu kapsamda Oracle Cloud sunucusunda aşağıdaki hazırlanmalıdır:
- güvenli HTTPS erişimi
- doğru DNS / domain veya public IP yönlendirmesi
- firewall ve güvenlik grup ayarı
- webhook için uygun reverse proxy veya HTTP sunucusu

### 2.3. Sunucu ve runtime hazırlığı

Mevcut repo dosyaları şunu gösterir:
- Deno ile çalışan webhook fonksiyonları (`supabase/functions/.../index.ts`)
- Node testleri mevcut (`npm test`)
- `deno.json` ve `package.json` mevcut

Yani Oracle Cloud tarafında hazırlanacak temel unsurlar:
- Deno runtime kurulumu
- Node.js runtime kurulumu (testler ve gerekli araçlar için)
- Supabase Edge Function benzeri çalıştırma/dağıtım ortamı veya uygulama sunucusu
- sistem servisleri / process manager (ör. systemd / pm2 / başka uygun yönetim)
- log toplama ve hata izleme

## 3) Taşınacak bileşenler

### 3.1. Webhook alıcıları

Şu dosyalar mevcut ve taşıma hedefinde anlamlıdır:
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/instagram-webhook/index.ts`

Bu fonksiyonlar şunu yapar:
- GET doğrulama
- POST imza kontrolü (`X-Hub-Signature-256`)
- JSON okuma
- rate limiting
- başarı durumunda `200` yanıtı
- inbound mesajı veritabanına kaydetme

Bu dosyalar Oracle Cloud'ta uygun bir çalıştırma ortamında hayata geçirilecek şekilde dağıtılmalı.

### 3.2. Veritabanı ve Supabase

Proje şeması açıkça tanımlanmıştır:
- `supabase/migrations/20260921120000_core_schema.sql`
- tek-tenant bootstrap: `supabase/migrations/20260921130000_seed_kali_business.sql`

Bu demektir ki taşıma sırasında aşağıları planlamak gerekir:
- Supabase project doğru şekilde erişilebilir olmalı
- `KALI_BUSINESS_ID` değeri doğru şekilde tanımlanmalı
- yetkiler/keys doğru şekilde Oracle Cloud ortamına aktarılmalı
- webhook'ların `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` ile çalışması için gerekli env değeri ayarlanmalı

### 3.3. Dışarıdan gelen istek akışı

Gelen istekler şu akışa göre ilerler:
1. Meta'dan webhook çağrısı gelir
2. Oracle Cloud sunucusu public HTTPS endpoint'i dinler
3. Deno handler'ı request'i alır
4. GET/POST doğrulama yapılır
5. Rate limiting kontrol edilir
6. İmza doğrulanır
7. JSON parse edilir
8. `conversations` / `messages` tablosuna inbound kayıt yazılır
9. 200 yanıt döner

Bu akış, taşıma sırasında canlı test edildiğinde kontrol edilecek temel akıştır.

## 4) Taşıma adımları (yol haritası)

### Adım 1: Sunucu hazırlığı
- Oracle Cloud VPS oluşturulmalı
- temel güvenlik kurulumu tamamlanmalı
- systemd veya uygun process supervisor kurulmalı
- Deno ve gerekli araçlar kurulumdan sonra çalışır hale getirilmeli
- Node.js için gerekli sürüm ve temel araçlar kontrol edilmeli

### Adım 2: Proje dosyalarının sunucuya aktarılması
- repo içeriği sunucuya taşınmalı
- yalnızca gerekli dosyalar ve ortam dosyaları aktarılmalı
- `node_modules`, build artefact'ları, gereksiz büyük dosyalar taşınmamalı
- `.env` ve secret'lar git dışında tutulmalı

### Adım 3: Ortam değişkenleri tanımlanması
- `META_WHATSAPP_VERIFY_TOKEN`
- `META_INSTAGRAM_VERIFY_TOKEN`
- `META_APP_SECRET`
- `KALI_BUSINESS_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- gerekirse başka runtime env'

Tüm değerler sunucuya güvenli şekilde aktarılmalı; repo içinde kaydedilmemeli.

### Adım 4: HTTPS ve webhook erişimi
- public HTTPS endpoint kurulmalı
- nginx / Caddy / benzeri reverse proxy kurulabilir
- Meta webhook URL'si doğrudan sunucunun public adresine işaret etmeli
- kullanıma hazır olana kadar test URL'leri eklenmemeli

### Adım 5: Webhook testleri
- GET doğrulama testleri yapılmalı
- POST imza doğrulama testi yapılmalı
- rate limiting testi yapılmalı
- ikisi aynı anda çalıştırılmamalı; port çakışması giderilmeli
- örnek payload'lar ve testler kullanılarak aşağıdaki davranış doğrulanmalı:
  - doğru token => 200
  - yanlış token => 403
  - imza eksik => 401
  - geçersiz JSON => 400
  - rate limit => 429

### Adım 6: Supabase bağlantısı
- Supabase project erişimi kontrol edilmeli
- `KALI_BUSINESS_ID` doğru bir şekilde set edilmeli
- `conversations` ve `messages` tablolarına islemler yazılıp yazılmadığı kontrol edilmeli
- RLS ve auth politikaları için gerekli ileriki adımlar planlanmalı

### Adım 7: Güvenlik ve production kuralları

Projede kritik uyarılar açıkça yazılmış durumda:
- mevcut reklam hesabına dokunma
- gerçek WhatsApp hattı üzerinde destructive migration yapma
- üretim reklam kampanyalarına dokunma
- gerçek müşteri geçmişini bozacak işlemler yapmama
- secret'ları konuşmaya yazmama

Yani taşıma sırasında da bu kurallar geçerli kalır. Özellikle:
- canlı Meta account / page / reklam hesapları ile deneme amacı dışında bağlantı kurulmaz
- müşteri geçmişi / gerçek hat üzerindeki veri değiştirilemez
- test ortamı ile production ortamı ayrılır

## 5) Doğrulama öncesi kontrol listesi

Taşımadan önce aşağılardan her biri kontrol edilmelidir:
- [x] Oracle Cloud VPS kurulumu yapılmış (bkz. bölüm 9)
- [x] Deno çalışıyor
- [x] Node.js çalışıyor
- [ ] HTTPS erişimi hazır (şu an sadece HTTP; TLS sertifikası henüz kurulmadı)
- [ ] webhook public URL doğru şekilde atanmış (domain henüz yok, IP üzerinden erişim test ediliyor)
- [ ] secret'lar güvenli saklama alanına yerleştirilmiş
- [ ] `META_*` ve `KALI_BUSINESS_ID` set edilmiş
- [ ] Supabase bağlantısı doğrulanmış
- [ ] `conversations` ve `messages` insert testleri başarılı
- [ ] loglar ve hata yakalama izleniyor
- [ ] production ad account / canlı WhatsApp hattı ile deneme yapılmıyor

## 6) Taşıma sonrası ilk kontrol hedefleri

Taşımadan hemen sonra yapılacak ilk doğrulamalar:
- GET doğrulama çağrısı `200` döndürüyor mu?
- POST imza doğrulaması çalışıyor mu?
- doğru payload ile `messages` / `conversations` tablosuna kayıt düşüyor mu?
- hatalı imza `401` veriyor mu?
- rate limit `429` döndürüyor mu?
- loglar ve hata çıktıları kontrol ediliyor mu?

## 7) Kısıtlar ve bilinçli notlar

Bu belge, mevcut repo içeriğine dayanır. Şu hususlar kesin olarak bilinmelidir:
- Taşıma işlemi burada planlandığı kadar tamamen “hazır” değildir; daha önce de belirtildiği gibi, tam otomasyon, AI yanıtı, randevu iş akışı ve human approval akışı henüz eksik olan parçalar olarak duruyor.
- Bu belge, yeni bir mimari tasarım sunmaz; sadece mevcut bilgilere göre hazırlanmış yol haritasıdır.
- İşlem, production reklam hesabı veya gerçek WhatsApp hattı üzerinde test edilmeden yapılmalıdır.

## 8) Kısa özet

Oracle Cloud taşıma hazırlığı, mevcut repo içindeki çalışma mantığına göre şu sırayla yapılmalıdır:
1. sunucu ve runtime hazırlığı
2. secrets ve env yönetimi
3. HTTPS ve webhook erişimi
4. Deno handler'larının çalıştırılması
5. Supabase bağlantısı ve `KALI_BUSINESS_ID`
6. veri kaydı doğrulaması
7. güvenlik kurallarına sadık kalma
8. production canlı sistemlere dokunmadan canlı/üretim benzeri kontrol

Bu, proje kurallarına göre en güvenli ve gerçekçi geçiş planıdır.

## 9) Gerçekleşen İlerleme (Canlı Kayıt)

Bu bölüm, yukarıdaki planın hangi adımlarının fiilen tamamlandığını tarih sırasıyla kaydeder. Yeni bir karar eklemez, sadece yapılanı not eder.

### 2026-09-22 — Sunucu oluşturuldu ve temel kurulum tamamlandı

- **Instance adı:** `kali-ai-server`
- **Makine tipi:** `VM.Standard.E2.1.Micro` (Always Free, x86) — ilk denenen ARM tipi (`VM.Standard.A1.Flex`, 4 OCPU/24GB) o an bölgede kapasite yetersizliği yüzünden alınamadı, küçük x86 tipiyle devam edildi. İleride ihtiyaç olursa ayrı bir ikinci sunucu olarak ARM tipi ek olarak açılabilir (ücretsiz kotada ikisi birlikte kullanılabiliyor).
- **İşletim sistemi:** Ubuntu 22.04.5 LTS
- **Public IPv4:** `130.210.25.28` (ephemeral — sunucu yeniden başlatılırsa/durup kalkarsa değişebilir, sabitlenmesi gerekiyorsa ileride "reserved public IP"ye çevrilmeli)
- **Giriş anahtarı:** yerelde `Oracle Key/ssh-key-2026-09-22.key` altında tutuluyor, repoya girmiyor (`.gitignore`'da `*.key` deseni zaten kapsıyor)
- **Kurulan yazılımlar:**
  - Node.js 20 (NodeSource) — `node -v` → v20.20.2
  - Deno 2.9.7 (resmi kurulum betiği ile, `~/.deno/bin`)
  - nginx (apt) — çalışıyor, `systemctl status nginx` aktif
  - `ufw` ile temel güvenlik duvarı: 22/80/443 açık
  - Oracle'ın Ubuntu imajında hazır gelen ek iptables kuralı (80/443'ü ufw'den önce reddeden bir satır) tespit edilip düzeltildi, `netfilter-persistent` ile kalıcı hale getirildi
- **Ağ erişimi doğrulandı:** Security List'e 80/443 ingress kuralları eklendi; `http://130.210.25.28/` dışarıdan test edildi, nginx varsayılan sayfası `200` dönüyor. Sunucu artık genel internetten erişilebilir durumda.
- **Henüz yapılmadı:** HTTPS/TLS sertifikası, webhook kodunun sunucuya aktarılması, ortam değişkenlerinin (`META_*`, `SUPABASE_*`, `KALI_BUSINESS_ID`) tanımlanması, systemd servis dosyası.
