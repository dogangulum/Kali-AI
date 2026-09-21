# Kali Beauty AI — Başlangıç Rehberi

Bu belge, projeye yeni başlayan biri için tek referans noktasıdır. Amacı, projeye bakınca önce hangi dosyaları okumaları gerektiğini, mevcut durumun gerçek olarak ne olduğunu, hangi parçaların hazır olduğunu ve hangi parçaların henüz yapılmadığını net şekilde anlatmaktır.

Bu rehber, mevcut repo içindeki dosyaları ve belgeleri dikkate alır. Yeni bir mimari tasarım eklenmez; mevcut kod, migration, testler ve dokümanlar bir araya getirilerek gerçek durum özetlenir.

## 1) Proje ne yapmaya çalışıyor?

Kali Beauty Center için tasarlanan sistemin hedefi basitçe şudur:

- Instagram/WhatsApp üzerinden gelen müşteri mesajlarını yakalamak
- Mesajı doğrulamak, tanımak ve kaydetmek
- Potansiyel müşteriyi (lead) tespit etmek
- Gerekirse randevu akışına yönlendirmek
- Sonrasında AI destekli cevap, içerik üretimi ve reklam akışı planlamak
- İnsan onayı ile üretim ve yayın kontrolü sağlamak

Temel funnel:

- Reel / reklam
- DM (WhatsApp veya Instagram)
- Nitelikli lead
- Randevu
- Müşteri

Bu hedef, `docs/PROJECT_HANDOFF.md` içinde detaylandırılmıştır. Proje büyük ölçüde başlangıç/temel altyapı aşamasındadır; tam operasyonel funnel ve AI akışı henüz tamamlanmış değil.

## 2) Projenin şu anki gerçek durumu

Bu bölüm, repo içindeki mevcut durumun en net özetidir.

### 2.1. Hazır / var olan şeyler

Aşağıdakiler gerçekten mevcut dosyalardır:

- WhatsApp webhook alıcısı: `supabase/functions/whatsapp-webhook/index.ts`
- Instagram webhook alıcısı: `supabase/functions/instagram-webhook/index.ts`
- Veritabanı şeması: `supabase/migrations/20260921120000_core_schema.sql`
- Tek-tenant işletme bootstrap: `supabase/migrations/20260921130000_seed_kali_business.sql`
- Yerel testler: `tests/whatsapp-webhook.test.cjs`, `tests/instagram-webhook.test.cjs`
- Test yardımcıları: `tests/helpers/webhook-suite.cjs`
- Gerçekçi örnek payload'lar: `tests/fixtures/*.json`
- Ortam örneği: `.env.example`
- Yerel Supabase yapılandırması: `supabase/config.toml`
- Belgeler: `docs/` klasöründeki rehberler ve planlar

### 2.2. Gerçek olarak çalışan temel akış

Repo içindeki mevcut dosyalara göre en güvenilir açıklama şudur:

- Webhook'lar GET doğrulaması yapar
- POST isteklerinde `X-Hub-Signature-256` HMAC-SHA256 imzasını kontrol eder
- Rate limiting uygular
- JSON payload'ı ayrıştırır
- Gelen, doğrulanmış mesajı veritabanına kaydeder

Bu kayıt, `conversations` ve `messages` tablolarına düşer. Yani sistem artık "yalnızca konsola yazan taslak" değil; gerçek inbound mesajları saklayabiliyor.

Bu bilginin doğrulayıcısı:

- `docs/SYSTEM_FLOW.md`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/instagram-webhook/index.ts`
- `supabase/migrations/20260921120000_core_schema.sql`

### 2.3. Henüz tamamlanmamış / eksik olan şeyler

Aşağıdaki alanlar projede planlanmış ama uygulama tarafı tam değildir:

- AI model çağrısı ve model routing
- Outbound mesaj üretimi ve gönderimi
- Lead qualification akışı
- Randevu oluşturma ve yönetimi
- İnsan onay ekranı / Onayla-Değiştir-Reddet akışı
- Tam multi-tenant (çoklu işletme) yapılandırma
- JWT / auth akışı ve tam RLS uygulaması
- Reklam üretim pipeline'i (görsel, video, seslendirme, altyazı, kampanya)
- Oracle Cloud deployment için tamamlanmış production dağıtımı
- Gerçek Meta ve Supabase prod ortamı bağlantıları

Bu durumun en net anlatımı:

- `docs/PROJECT_HANDOFF.md`
- `docs/SYSTEM_FLOW.md`
- `docs/HUMAN_APPROVAL_REQUIREMENTS.md`
- `docs/CONTENT_AD_PREP.md`
- `docs/ORACLE_CLOUD_DEPLOYMENT_PREP.md`

## 3) Proje ne durumda? Kısacası

Yeni biri için en doğru kısa özet şu olmalı:

- “Temel webhook güvenliği ve kayıt akışı var.”
- “Mesajlar gerçekten veritabanına yazılıyor.”
- “Ama tam AI asistan, satış, randevu, içerik üretimi ve onay akışı henüz uygulanmadı.”
- “Bu repo daha çok temel altyapı + tasarım/plan seviyesi bir başlatma paketidir.”

Yani proje henüz “tam çalışan canlı sistem” değil; temel bağlam ve veri modeli oluşturulmuş, ama üretime hazırlık ve otomasyon daha sonra gelecek.

## 4) Hangi dosyayı ne zaman okumalısınız?

Bu sırayla okunursa en doğru öğrenme akışı oluşur.

### Adım 1: Proje fikrini ve kuralları anlamak

- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `CLAUDE.md`

Bu adımda şunu öğrenirsiniz:

- proje ne için kurulmuş
- hangi işler hangi AI/araçlara verilecek
- proje kuralları ve kritik uyarılar
- güvenlik ve arka plan ilkeleri

### Adım 2: Mevcut gerçek işleyişi görmek

- `docs/PROJECT_HANDOFF.md`
- `docs/SYSTEM_FLOW.md`
- `docs/README.md`

Bu adımda şunu öğrenirsiniz:

- hedefler ve geçmiş
- gerçek akış
- hangi kısmın hazır olduğunu, hangisinin henüz planlandığını

### Adım 3: Yerel deneme ve doğrulama

- `docs/LOCAL_TESTS.md`
- `docs/SCRIPTS.md`
- `docs/TEST_SENARYOLARI.md`
- `tests/fixtures/README.md`

Bu adımda şunu öğrenirsiniz:

- webhook nasıl test edilir
- hangi komutlar kullanılır
- örnek senaryolar ve beklenen çıktılar
- yerel deneme için hangi veriler kullanılır

### Adım 4: İşletme bilgilerini doldurmak

- `docs/KALI_BUSINESS_INFO_TEMPLATE.md`
- `config/business-config.example.md`

Bu adım özel olarak önemlidir. Çünkü sistemin gerçekten çalışması için işletme bilgileri gereklidir.

Bu formda eksik olanlar:

- hizmetler
- fiyatlar
- çalışma saatleri
- iletişim tonu
- karşılama mesajı
- randevu politikaları

Bu ögeler henüz sistemde standart bir “işletme profili” olarak tamamen doldurulmuş değil; bu form onun için hazırlık amaçlıdır.

### Adım 5: İnsan onayı ve içerik üretimi için hazırlanmış planlar

- `docs/HUMAN_APPROVAL_REQUIREMENTS.md`
- `docs/CONTENT_AD_PREP.md`
- `docs/PROJECT_HANDOFF.md` içindeki hedefler

Bu adımda şunu öğrenirsiniz:

- içerik üretim akışı nasıl düşünüldü
- onay adımları nasıl tanımlandı
- hangi tabloların buna göre hazırlandığı
- içerik katmanları (visual / voiceover / subtitle) nasıl organize edilecek

### Adım 6: Taşıma ve paylaşım hazırlığı

- `docs/ORACLE_CLOUD_DEPLOYMENT_PREP.md`
- `docs/SHARE_CHECKLIST.md`
- `docs/SOZLUK.md`

Bu adımda şunu öğrenirsiniz:

- Oracle Cloud’a taşıma için ne gerekiyor
- paylaşım öncesi hassas dosyaları nasıl koruyacaksınız
- teknik terimlerin sade anlamları

## 5) Hangi belgeyi gerçekten ne zaman okumak gerekir?

Kısa karar rehberi:

- “Bu proje neden böyle kuruldu?” → `docs/PROJECT_HANDOFF.md`
- “Bir mesaj geldiğinde sistem ne yapıyor?” → `docs/SYSTEM_FLOW.md`
- “Lokal test nasıl çalışır?” → `docs/LOCAL_TESTS.md`
- “Hangi script ne işe yarar?” → `docs/SCRIPTS.md`
- “İşletme bilgileri nasıl doldurulur?” → `docs/KALI_BUSINESS_INFO_TEMPLATE.md`
- “İçerik ve reklam üretimi nasıl planlandı?” → `docs/CONTENT_AD_PREP.md`
- “Onay akışı ne olmalı?” → `docs/HUMAN_APPROVAL_REQUIREMENTS.md`
- “Oracle Cloud’a taşınır mı?” → `docs/ORACLE_CLOUD_DEPLOYMENT_PREP.md`
- “Gizli bilgileri paylaşmadan önce ne kontrol edilir?” → `docs/SHARE_CHECKLIST.md`
- “Teknik kelimeler ne anlama geliyor?” → `docs/SOZLUK.md`

## 6) Projeye başlarken yapılacak ilk 3 iş

Yeni bir kişi için en pratik başlangıç şudur:

1. `README.md` ve `docs/PROJECT_HANDOFF.md` okuyup hedefi ve kuralları anlamak
2. `docs/SYSTEM_FLOW.md` okuyup mevcut işleyişi öğrenmek
3. `docs/KALI_BUSINESS_INFO_TEMPLATE.md` ile işletme bilgilerini hazırlamaya başlamak

Böylece hem proje mantığını anlar hem de uygulamanın hangi veriye ihtiyaç duyduğunu görür.

## 7) Yapılandırma ve veri alanları neden önemli?

Projede şu temel gerçekler var:

- İşletme özel bilgileri kod içine gömülmez
- `business_config` alanı / yapılandırma mantığı beklenir
- Randevu, fiyat, hizmet ve çalışma saatleri bu veriden gelir
- Webhook sadece “mesaja kaydetme” ve güvenlik işini yapar
- Gerçek müşteri iletişimi için bu işletme verisi gerekir

Bu yüzden, `config/business-config.example.md` ve `docs/KALI_BUSINESS_INFO_TEMPLATE.md` dosyaları çok kritiktir. Bunlar, daha sonra sistemin AI ve satış akışının doğru çalışması için gerekli ön şartlardan biridir.

## 8) Güvenlik notu

Yeni bir kişi için en önemli kural şu olmalıdır:

- gerçek Meta hesabı bilgileri
- gerçek WhatsApp hattı
- production reklam hesabı
- müşteri geçmişi
- API key / secret
- Supabase anahtarları

bunları repo içine koymamak veya ekranda paylaşmamak.

Bu kurala ait detaylar:

- `CLAUDE.md`
- `docs/SHARE_CHECKLIST.md`

## 9) Son söz

Bu repo, şu anda iki şeyin karışımıdır:

- “temel altyapı hazır”
- “tam otomasyon için plan ve tasarım hazırlanmış”

Yani gerçek kullanım için, ilk önce: güvenlik, veri modelini, işletme bilgilerini ve webhook akışını doğru anlamak gerekir. Sonra AI, onay, içerik ve reklam akışı gelecek.

Yeni başlayan biri için doğru yaklaşım budur:

- önce mevcut gerçekliği öğren
- sonra iş bilgilerini doldur
- sonra test et
- sonra üretim ve yayın adımlarını planla

Bu belge, bu öğrenme sürecinin ana giriş noktasıdır.
