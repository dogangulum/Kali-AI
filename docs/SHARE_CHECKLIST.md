# Paylaşım Öncesi Kontrol Listesi

Bu belge, proje GitHub veya başka bir paylaşım ortamına yüklenecekse nelere dikkat edilmesi gerektiğini özetler. Amaç, gerçek secret, canlı müşteri verisi, Meta hesabı bilgileri ve yerel geliştirme ayarları gibi şeylerin dışarı çıkmasını engellemektir.

## 1) Paylaşım öncesinde kesinlikle kontrol edilmesi gerekenler

### A. Secret ve token'lar
- `.env`, `.env.*`, `.env.local` dosyaları paylaşılmamalı.
- `META_WHATSAPP_VERIFY_TOKEN`, `META_INSTAGRAM_VERIFY_TOKEN`, `META_APP_SECRET`, `KALI_BUSINESS_ID` gibi değerler hiçbir yere yazılmamalı.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` gibi erişim anahtarları da paylaşılmamalı.
- Git'e commit yapılırken bu değerler asla eklenmemeli.

### B. Canlı üretim veri ve müşteri bilgisi
- Gerçek WhatsApp hattı, müşteriler, mesaj geçmişi ve kişisel veriler paylaşılmamalı.
- Meta reklam hesabı, ad account ID, business portfolio, page ve müşteri verileri paylaşılmamalı.
- `.claude` ve benzeri yerel AI/tool ayarları da paylaşılmamalı.

### C. Canlı hesap / platform erişimi
- Meta reklam hesabı ve ad account ID'ler, canlı kampanyalar, gerçek page bilgileri, production ortam bilgileri dışarıya çıkmamalı.
- Gerçek WhatsApp hattı **+90 532 610 22 44** ve müşteri geçmişi paylaşılmamalı.
- Production reklam kampanyaları veya canlı hesaplar ile test amaçlı karıştırılmamalı.

### D. Yerel geliştirme ve bilgisayar özel dosyaları
- `.claude/`, `.kilo/`, `.vscode/` gibi yerel ortam dosyaları paylaşılmamalı.
- Bu repo içinde `.gitignore`’te yer alan makine özel dosyalar korunur; ancak yine de paylaşım öncesi bir kontrol yapılmalı.
- `notify.js` gibi yerel komutlar ve Claude local ayarları da dahil edilmemeli.

## 2) Paylaşımda en sık sorun çıkaran dosyalar

Aşağıdaki dosya türleri ve klasörler mutlaka kontrol edilmeli:
- `.env` ve `.env.*`
- `.env.local`
- `.claude/`
- `.kilo/`
- `node_modules/`
- build logları ve üretim artefact'ları
- lock dosyaları (örnek: `package-lock.json`, `yarn.lock`) - proje kurallarında zaten gereksiz büyük veri ve bağımlılık dosyaları olarak listeleniyor
- `*.log`
- `*.pem`, `*.key`
- `*credentials*`, `*secret*`
- `supabase/.temp/` ve benzeri lokal/çalıştırma dosyaları
- yerel test logları / geçici dosyalar

## 3) Git kontrol listesi

Paylaşım öncesinde şu adımlar yapılmalıdır:
- [ ] `git status` ile değişen dosyalar kontrol edilmeli.
- [ ] `.env` ve benzeri gizli dosyalar staging alanına eklenmemeli.
- [ ] `.gitignore` doğru çalışıyor mu kontrol edilmeli.
- [ ] `.claude/` ve makine özel yapılandırma klasörleri dahil değil mi kontrol edilmeli.
- [ ] `node_modules`, gereksiz build çıktıları ve loglar temizlenmiş mi?
- [ ] Telegram, e-posta veya sohbet içeriğine secret ve token yazılmamış mı?
- [ ] Meta/WhatsApp/production hesap bilgileri içerik içinde geçiyor mu kontrol edilmeli.
- [ ] Geçici test payload, local-only değerler ve deneme verileri kaldırılmış mı?

## 4) Paylaşım metoduna göre dikkat

### GitHub / public repo
- Repo public ise özellikle secret, API key, business ID ve müşteri/çağrı bilgileri hiç bir şekilde eklenmemeli.
- Her dosya tek tek gözden geçirilmeli.
- Public olarak açılacak repo için “gizli veriyi dışarı çıkarmamaya” odaklı bir paketleme yapılmalı.

### Private repo / şirket içi paylaşım
- Yine aynı kurallar geçerli; sadece erişim yetkisi olan kişilere açılmalıdır.
- Yetki dışındaki kullanıcılar için `.env`, Meta bağlantı bilgileri ve müşteri geçmişi çıkarılmamalı.

## 5) Kısa güvenlik kuralı

Proje için temel prensip şudur:
- Secret'ler hiç bir zaman Git’e yazılmaz.
- Test ve dev değerleri de gerçek değer gibi görünmeyecek şekilde tutulur.
- Canlı reklam hesabı, gerçek WhatsApp hattı ve müşteri geçmişi paylaşılmaz.
- Yerel çalışma dosyaları, AI ayarları ve makine özel state’ler repo dışında tutulur.

## 6) Son kontrol öncesi tek cümlelik kural

“Paylaşmadan önce, repo içinde gerçek secret, canlı Meta/WhatsApp bilgisi veya müşteri verisi bırakılmadığından emin ol.”

Bu dosya, proje kurallarında yazılan güvenlik ve secret yönetimi gerekliliklerini özetler; yeni bir mimari karar eklenmez.
