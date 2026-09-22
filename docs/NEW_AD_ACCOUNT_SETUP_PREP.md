# Yeni Reklam Hesabı / Portföy Kurulum Hazırlığı

Bu belge, mevcut proje kurallarına (CLAUDE.md, ORACLE_CLOUD_DEPLOYMENT_PREP.md) ve dosyalara dayalı olarak, **tamamen yeni, ayrı bir reklam hesabı/portföy** kurulumu için gerekli hazırlık ve adımları özetler. **Eski reklam hesabına asla dokunulmaz** (CLAUDE.md kuralı). Yeni bir mimari karar eklenmez; sadece hazırlık/yol haritası olarak düzenlenir.

---

## 1) Temel İlkeler ve Kısıtlar

### 1.1. Kesin Kural: Eski Hesaba Dokunma
> **CLAUDE.md kuralı:** "Mevcut Meta reklam hesapları, kampanyalar ve WhatsApp müşteri geçmişi korunmalıdır."
- Yeni hesap **bağımsız** oluşturulur; mevcut hesap/portföy/kampanyalarla **hiçbir bağlantısı olmaz**
- Mevcut hesap ID'si, pixel ID'leri, kataloglar, ödeme yöntemleri, izinler **kopyalanmaz/taşınmaz**
- Test amaçlı bile olsa eski hesap üzerinden **hiçbir işlem yapılamaz**

### 1.2. Ayrıştırma (Isolation)
| Unsur | Eski Hesap | Yeni Hesap |
|-------|------------|------------|
| Business Manager | Korunur | Yeni/ayrı BM |
| Ad Account ID | Korunur | Yeni ad account |
| Pixel / CAPI | Korunur | Yeni pixel |
| Katalog / Mağaza | Korunur | Yeni katalog |
| Ödeme Yöntemi | Korunur | Yeni ödeme yöntemi |
| İzinler / Roller | Korunur | Yeni atamalar |
| Kampanya Geçmişi | Korunur | Sıfırdan başlar |
| Müşteri Listeleri / Özel Kitleler | Korunur | Yeni kitleler |

### 1.3. Naming Convention (İsimlendirme)
Yeni hesap/portföy isimlendirmesinde proje/kod adından **farklı**, işletmeye özgü bir isim kullanılmalıdır:
- Business Manager: `Kali Beauty Center - Yeni Portföy`
- Ad Account: `Kali Beauty Center - Reklamlar`
- Pixel: `Kali Beauty Center - Web Pixel`
- Katalog: `Kali Beauty Center - Hizmetler`

---

## 2) Gereksinimler (Ne Olmalı?)

### 2.1. Meta Business Manager (BM) Yapısı
- [ ] **Yeni Business Manager** oluşturulmuş olmalı (veya var olan BM içinde yeni "Business Portfolio" oluşturulmalı)
- [ ] BM sahipliği/izinleri net olmalı: en az bir **Admin** (sorumlu kişi), geliştirici erişimi için **Developer** rolü
- [ ] İki faktörlü kimlik doğrulama (2FA) aktif olmalı

### 2.2. Reklam Hesabı (Ad Account)
- [ ] Yeni **Ad Account** oluşturulmuş olmalı (BM içinden "Add Ad Account" → "Create a new ad account")
- [ ] Para birimi: **TRY** (İşletme config'indeki `currency: "TRY"` ile uyumlu)
- [ ] Saat dilimi: **Europe/Istanbul** (`timezone: "Europe/Istanbul"` ile uyumlu)
- [ ] Faturalandırma/Ödeme yöntemi eklenmiş olmalı (kredi kartı, PayPal, fatura vb.)
- [ ] Hesap kimliği (Ad Account ID) not alınmalı: `act_XXXXXXXXXXXX`

### 2.3. Pixel ve Conversions API (CAPI)
- [ ] Yeni **Web Pixel** oluşturulmuş olmalı (Events Manager → Pixels → Add)
- [ ] Pixel ID not alınmalı: `XXXXXXXXXXXXXXXX`
- [ ] **Conversions API** (CAPI) ayarlanmalı:
  - Access Token oluşturulmalı (Pixel Settings → Conversions API → Generate Access Token)
  - Token güvenli saklanmalı (env: `META_CAPI_ACCESS_TOKEN` veya benzeri)
  - Test event kodu (`test_event_code`) geliştirme/test için not alınmalı

### 2.4. Katalog / Mağaza (Commerce)
- [ ] Yeni **Catalog** oluşturulmuş olmalı (Commerce Manager → Catalogs → Create)
- [ ] Catalog tipi: **Services** (hizmet tabanlı işletme için) veya **Products**
- [ ] Catalog ID not alınmalı
- [ ] Örnek hizmet öğeleri (feed) hazırlanmalı: `id`, `title`, `description`, `price`, `currency`, `image_url`, `availability`
- [ ] Katalog-İşletme ilişkilendirmesi: Ad Account → Catalog bağlantısı

### 2.5. WhatsApp Business Account (WABA)
- [ ] Yeni **WhatsApp Business Account** oluşturulmuş olmalı (veya mevcut BM'ye bağlanmış olmalı)
- [ ] Telefon numarası kaydedilmiş/doğrulanmış olmalı
- [ ] **Verify Token** üretildi: `META_WHATSAPP_VERIFY_TOKEN` (rastgele, güvenli string)
- [ ] Webhook Callback URL hazır olmalı: `https://<domain>/functions/v1/whatsapp-webhook`
- [ ] App Secret: `META_APP_SECRET` (Meta App Dashboard → Settings → Basic → App Secret)

### 2.6. Instagram Professional Account
- [ ] Instagram hesabı **Professional Account** (Business/Creator) olmalı
- [ ] Facebook Sayfası ile bağlı olmalı
- [ ] **Verify Token** üretildi: `META_INSTAGRAM_VERIFY_TOKEN`
- [ ] Webhook Callback URL: `https://<domain>/functions/v1/instagram-webhook`
- [ ] Mesajlaşma izinleri: `instagram_manage_messages`, `instagram_manage_comments`, `pages_messaging`

### 2.6. Uygulama (Meta App) — Geliştirici/CAPI için
- [ ] Meta Developer Console'da **yeni App** oluşturulmuş olmalı (Type: Business)
- [ ] App ID ve App Secret not alınmalı
- [ ] Gerekli izinler: `whatsapp_business_messaging`, `instagram_manage_messages`, `ads_management`, `ads_read`, `business_management`
- [ ] Geliştirici rolleri atanmalı (Admin, Developer, Tester)

### 2.7. Erişim ve İzinler (People & Permissions)
| Rol | Kime | Kapsam |
|-----|------|--------|
| Business Admin | İşletme sahibi / sorumlu | BM, Ad Account, Pixel, Catalog, WABA |
| Developer | Geliştirici ekibi | App, CAPI token, Webhook ayarları |
| Advertiser | Reklam yöneticisi | Kampanya oluşturma/düzenleme |
| Analyst | Analitik ekibi | Raporlama, Events Manager |
| Finance | Mali ekip | Faturalandırma, ödeme yöntemleri |

---

## 3) Kurulum Adımları (Yol Haritası)

### Adım 0: Ön Hazırlık (1-2 gün)
1. İşletme resmi belgelerini topla (ticaret sicil, vergi levhası, yetkili imza çevresi) — Meta incelemesi için
2. Ödemeler için kredi kartı / fatura bilgilerini hazırla
3. Domain/alt domain karar ver (webhook, pixel, CAPI için): `reklam.kalibuty.com` veya benzeri
4. DNS yönetimi erişimi sağla (CAPI doğrulaması, domain verification için)

### Adım 1: Business Manager ve Ad Account (1 gün)
1. business.facebook.com → "Create Business" veya mevcut BM içinde "Business Portfolio" oluştur
2. Ad Account oluştur: Settings → Ad Accounts → Add → Create New
   - Name, Timezone (Europe/Istanbul), Currency (TRY)
3. Faturalandırma → Payment Methods → ekle
4. Ad Account ID (`act_...`) kaydet

### Adım 2: Pixel ve CAPI (1 gün)
1. Events Manager → Pixels → Add → "Meta Pixel" → Name → Website URL
2. Pixel ID kaydet
3. Conversions API → Set up manually → Access Token oluştur → **güvenli kaydet**
4. Test Event Code oluştur (geliştirme için)
5. Pixel'i Ad Account'a bağla: Data Sources → Assign to Ad Account

### Adım 3: Katalog (1 gün)
1. Commerce Manager → Catalogs → Create Catalog → Services (veya Products)
2. Catalog ID kaydet
3. Data Feed hazırla (CSV/XML/JSON):
   - `id`: benzersiz (örn. `svc_el_bakimi`)
   - `title`: "El Bakımı"
   - `description`: Hizmet açıklaması
   - `price`: "450.00"
   - `currency`: "TRY"
   - `image_url`: HTTPS görsel linki
   - `availability`: "in stock"
4. Feed'i yükle / zamanla (daily/hourly)
4. Ad Account'a katalog bağla: Catalog Settings → Ad Accounts → Assign

### Adım 4: WhatsApp Business Account (1 gün)
1. Meta Business Manager → WhatsApp Manager → Get Started
2. Business Profile doldur: isim, açıklama, adres, website, email, kategori
3. Telefon numarası ekle → SMS/Call ile doğrula
3. Verify Token üret: `openssl rand -hex 32` → `META_WHATSAPP_VERIFY_TOKEN`
4. Webhook ayarla: Callback URL + Verify Token → "Verify and Save"
5. App Secret not al: `META_APP_SECRET`
6. Mesaj şablonları (Template) oluştur: karşılama, randevu onayı, hatırlatma, iptal

### Adım 5: Instagram Professional Account (0.5 gün)
1. Instagram → Settings → Account Type → Switch to Professional → Business
2. Facebook Sayfası seç/oluştur → Bağla
3. Verify Token üret: `META_INSTAGRAM_VERIFY_TOKEN`
4. Webhook ayarla: Callback URL + Verify Token → Verify
5. Messaging permissions: `instagram_manage_messages`, `pages_messaging`

### Adım 6: Meta App (Geliştirici) (0.5 gün)
1. developers.facebook.com → My Apps → Create App → Business
2. App Name: `Kali Beauty Center - AI Agent`
3. Settings → Basic → App Secret → Show → `META_APP_SECRET` kaydet
4. Add Products: WhatsApp, Instagram, Marketing API
5. App Review → izinler için inceleme başlat (production için gerekli)

### Adım 7: İzinler ve Roller (0.5 gün)
1. BM → People → Add People → roller ata (Admin, Developer, Advertiser, Analyst)
2. Ad Account → Ad Account Roles → atamalar
3. Pixel/Catalog/WABA → Assign Partners / People

### Adım 8: Entegrasyon Testleri (1-2 gün)
1. **Webhook GET doğrulama** → `curl` ile test (checklist: `docs/LIVE_MESSAGE_TEST_CHECKLIST.md`)
2. **Pixel/CAPI test event** → Events Manager → Test Events → test_event_code ile doğrula
3. **Catalog feed** → Commerce Manager → Diagnostics → hata yok mu?
4. **WhatsApp test mesajı** → Test numarasından mesaj → Function logları kontrol
5. **Instagram DM test** → Test hesabından DM → Function logları kontrol
6. **Reklam oluşturma testi** → Campaign → Ad Set → Ad → "Draft" olarak kaydet → hata yok mu?

### Adım 9: Environment Variables (Oracle Cloud / Supabase)
Yeni hesap değerlerini **güvenli** şekilde ekle:
```bash
# Supabase Edge Functions env vars (Dashboard → Settings → Edge Functions)
META_WHATSAPP_VERIFY_TOKEN=<yeni_token>
META_INSTAGRAM_VERIFY_TOKEN=<yeni_token>
META_APP_SECRET=<yeni_app_secret>
META_AD_ACCOUNT_ID=act_XXXXXXXXXXXX
META_PIXEL_ID=XXXXXXXXXXXXXXXX
META_CATALOG_ID=XXXXXXXXXXXXXXXX
META_CAPI_ACCESS_TOKEN=<capi_token>
META_WABA_ID=<waba_id>
META_PHONE_NUMBER_ID=<phone_number_id>
```

### Adım 9: İşletme Config Güncelleme
`config/business-config.example.md` şablonunu doldur → `business_config` tablosuna yaz:
- `services[]`: Hizmetler, fiyatlar, süreler
- `working_hours`: Çalışma saatleri
- `conversation_style`: Ton, hitap, karşılama
- `currency`: "TRY"
- `language`: "tr-TR"

---

## 4) Doğrulama Kontrol Listesi (Go/No-Go)

Kurulum tamamlandıktan, canlı reklam verme **ÖNCE** hepsi ✅ olmalı:

| # | Kontrol | Nasıl Test Edilir | ✅ |
|---|---------|-------------------|----|
| 1 | BM ve Ad Account erişilebilir | Business Manager → Ad Accounts listesi | |
| 2 | Para birimi TRY, TZ Europe/Istanbul | Ad Account Settings | |
| 3 | Ödeme yöntemi aktif | Billing → Payment Methods | |
| 4 | Pixel ID var, CAPI token var | Events Manager → Settings | |
| 5 | CAPI test event başarıyla alındı | Test Event Code ile gönder → Test Events | |
| 6 | Catalog yüklendi, hata yok | Commerce Manager → Diagnostics | |
| 7 | Catalog-Ad Account bağlı | Catalog Settings → Ad Accounts | |
| 8 | WABA telefon doğrulandı | WhatsApp Manager → Phone Numbers | |
| 9 | WhatsApp webhook Verify başarılı | Verify and Save → 200 | |
| 10 | Instagram Professional + Page bağlı | Instagram Settings → Accounts Center | |
| 11 | Instagram webhook Verify başarılı | Verify and Save → 200 | |
| 12 | Meta App izinleri onaylandı / dev modunda test edilebilir | App Review status | |
| 13 | Tüm env vars Oracle/Supabase'de set edildi | Function logs → env okunuyor mu? | |
| 14 | Canlı mesaj testi başarılı | `docs/LIVE_MESSAGE_TEST_CHECKLIST.md` | |
| 15 | Test reklam taslağı oluşturulabiliyor | Ads Manager → Create → Draft | |
| 16 | Eski hesapla **hiçbir bağlantı yok** | ID'ler, pixel, katalog, ödeme yöntemi ayrı mı? | |

---

## 5) Riskler ve Önlemler

| Risk | Etki | Önlem |
|------|------|-------|
| Meta incelemesi uzun sürer (App Review, WABA) | Geçikme | Erken başla; geliştirme modunda test et |
| Ödeme yöntemi reddedilir | Hesap askıya alınır | Yedek ödeme yöntemi hazır bulundur |
| Pixel/CAPI veri gelmiyor | Raporlama bozuk | Test Event Code ile günlük doğrulama |
| Webhook 401/403 döner | Mesaj alınamaz | `check-webhooks.cjs` ile düzenli kontrol |
| Yanlış hesapta para harcanır | Mali kayıp | Ad Account ID'leri **her seferinde** doğrula |
| Eski hesapla karıştırma | Veri bozulması | Naming convention + ayrı BM |

---

## 6) Tahmini Süreler

| Faz | Süre |
|-----|------|
| Ön hazırlık (belgeler, domain, ödeme) | 1-2 gün |
| BM + Ad Account + Billing | 1 gün |
| Pixel + CAPI + Catalog | 1-2 gün |
| WABA + Instagram + Webhook | 1-2 gün |
| Meta App + İzinler | 0.5-1 gün |
| Entegrasyon testleri | 1-2 gün |
| **Toplam (paralel işler dahil)** | **5-7 iş günü** |

---

## 7) Kısıtlar ve Notlar

- **Bu belge yeni mimari tasarımı DEĞİLDİR**; mevcut proje dosyaları (`supabase/functions/...`, `config/...`, `docs/...`) ve kuralları (`CLAUDE.md`, `ORACLE_CLOUD_DEPLOYMENT_PREP.md`) referans alındı.
- **Eski reklam hesabına, pixeline, kataloğuna, kampanyalarına, müşteri listelerine DOKUNMUYORUZ.**
- Production reklam verme **sadece** yukarıdaki "Doğrulama Kontrol Listesi" %100 ✅ olduktan sonra başlar.
- Geliştirme/test sırasında Meta **Developer Mode** / **Test Events** / **Test Numbers** kullanılır.
- Tüm secret/token/env değerleri **git commit edilmez**, sohbetlerde paylaşılmaz; secrets manager / Supabase Dashboard env vars kullanılır.

---

## 8) İlgili Belgeler

- `docs/CLAUDE.md` — Proje kuralları (eski hesap koruma kuralı dahil)
- `docs/ORACLE_CLOUD_DEPLOYMENT_PREP.md` — Sunucu/HTTPS/Supabase hazırlığı
- `docs/LIVE_MESSAGE_TEST_CHECKLIST.md` — Canlı mesaj testi prosedürü
- `docs/TEST_SENARYOLARI.md` — Müşteri senaryoları (reklam kaynağı dahil)
- `docs/CONTENT_AD_PREP.md` — İçerik/reklam üretim akışı
- `config/business-config.example.md` — İşletme config şablonu

---

## 9) İmza

| Hazırlayan | Tarih | Durum |
|------------|-------|-------|
| | | Taslak / İnceleniyor / Onaylandı |