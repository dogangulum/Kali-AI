# İçerik & Reklam Üretimi — Kapsamlı Hazırlık ve İş Akışı Rehberi

Bu belge, içerik fikrinden kampanya yayınına kadar geçen akışın nasıl çalışması gerektiğini açıklar: hangi bilgilerin toplanması gerektiği, her katmanın (görsel, seslendirme, altyazı, metin) nasıl üretileceği, insan onayının nerede devreye gireceği ve hangi hatalarda nasıl durdurulması gerektiği. Okuyucu burada hem iş akışını hem de güvenlik / kalite kontrol kurallarını birlikte görür.

Kısacası bu belge, bir içerik parçasını "güzel görsel üretimi" olarak değil, doğru bilgi taşıyan, onaylanmış ve ölçülebilir bir reklam üretim süreci olarak düşünmek için gerekli tüm temelleri verir.

Bu belge, aşağıdaki alanları bir arada ele alır:

- fikir / brief / kampanya hedefi
- içerik üretiminin ayrı katmanları: görsel, video, seslendirme, altyazı, metin
- hangi bilgilerin toplanması gerektiği
- hangi adımda hangi veri kaydedileceği
- insan onayının nerede ve nasıl devreye gireceği
- yayın / reklam kampanyası / ölçüm takibi
- sistemin "doğru içerik" üretmesini sağlayacak kontrol noktaları

Bu belge, mevcut repo içindeki gerçek veri modeliyle uyumlu yazılmıştır. Yeni mimari karar eklenmez; sadece mevcut `content_items`, `content_layers`, `ad_campaigns`, `approvals`, `audit_log`, `funnel_events` yapısı ve proje yönergeleri düzenli bir şekilde açıklanır.

Kritik uyumluluk ve güvenlik notları (özet):
- Her içerik ve her içerik katmanı mutlaka `business_id` ile izlenmelidir; hiçbir içerik başka bir işletmenin scope'u altında çalışmayacak şekilde tasarlanmalıdır.
- `approvals.action` yalnızca şema ile uyumlu değerleri kullanır: `approve`, `change`, `reject`. "request_review" gibi yeni actionlar şema değiştirmeden önce kullanılmamalıdır; bunun yerine `approvals.action = 'change'` ve açıklayıcı `notes` kullanılır.
- Onay sonrası otomatik olarak "publish" / "campaign start" yapılmaz. Yayın ve kampanya başlatma, ayrı bir operasyonel adım ve `ad_campaigns` onayı gerektirir.
- Müşteri kişisel verileri (farklı platformlara ait ham video içindeki konuşma, telefon numaraları görüntüsü vb.) üretim sırasında ve QC ekranlarında maskelenmeli veya özetlenmelidir. Destek ve hata raporlarında PII gösterilmemelidir.
- `funnel_events` sadece migration ile tanımlanmış event tiplerini kullanır; `lead_score_updated` gibi operasyonel değişiklikler `audit_log` içinde izlenmelidir.
- Asset (video/image/audio) yüklemeleri sırasında format, boyut veya telif ihlali gibi hatalar oluşabilir; bu hatalar QC aşamasında engellenmeli ve `audit_log` ile kaydedilmelidir.


---

## 1) Amaç ve hedeflenen final akışı

İçerik üretimi ve reklam akışının nihai hedefi şu olmalıdır:

- bir içerik fikri doğar
- gerekli bilgiler toplanır
- içerik katmanları ayrı ayrı üretilir
- her katman insan onayı için sunulur
- onay sonrası kampanya ve yayın adımına geçilir
- yayın sonrası dönüşüm, lead ve randevu takibi yapılır
- bu veriler analize açılır

Temel akış şudur:

Fikir / brief → araştırma → teklifler ve hedeflere göre içerik taslağı → görsel/video üretimi → seslendirme → altyazı/metin → QC → onay → kampanya / yayın → izleme → yeniden üretim veya yeni sürüm

Bu akış, CLAUDE.md ve PROJECT_HANDOFF.md’de tanımlanan “reklam üretim akışı” ve “içerik üretimi” maddelerinin işlevsel karşılığıdır.

---

## 2) İçerik üretiminin temel amacı

İçerik üretimi yalnızca “güzel görsel yapma” değildir. Bu sistemde içerik üretimi ile hedeflenen şey şudur:

- müşteri ilgisini çekmek
- açılımı artırmak
- DM başlatma oranını artırmak
- nitelikli lead sayısını yükseltmek
- randevu talebini artırmak
- yapılan reklamın maliyet/etki dengesini iyileştirmek

Dolayısıyla her içerik üretim adımının, müşteri davranışına ve funnel’a katkısı olmalıdır.

Bu nedenle bir içerik parçası yalnızca yaratıldığında değil; şu sorulara cevap veren şekilde üretilmelidir:

- Bu içerik kim için?
- Bu içerik ne hedefliyor?
- Hangi mesajı taşıyor?
- Hangi platformda yayınlanacak?
- Hangi katmanlar gerekli?
- İnsan onayı hangi aşamada gerekli?
- Bu içerik hangi KPI’ya katkı sağlayacak?

---

## 3) İçerik üretim akışının temel kapıları

İçerik üretim hattı, aşağıdaki temel parçalardan oluşur.

### 3.1. Brief / fikir / hedef belirleme

İçerik üretimine başlamak için en az şu bilgiler gerekir:

- İşletme kim olduğu
- Marka tonu nasıl olmalı
- Hedef müşteri kim
- Hangi hizmet öne çıkarılacak
- Bu içeriğin amacı ne olacak (brand awareness, lead generation, randevu)
- Kullanılacak platform neresi (Instagram Reels, Story, static post, ad copy vs.)
- İçeriğin dili ve style nasıl olmalı

Bu bilgiler, `business_config` içindeki marka ve işletme bilgileriyle birlikte kullanılır. `content_items` içindeki `topic` ve `content_type` alanları buna göre doldurulur.

### 3.2. Kitle tanımı

İçerik, sadece genel “güzel görünür” diye üretilmemelidir. Hedef kitle şunları belirlemelidir:

- coğrafya (ör. Mersin, Yenişehir, Mezitli)
- yaş grubunun yaklaşımı
- premium / masrafsız / genç / bridal / kadın / özel bakım bakımı gibi segmentler
- hangi hizmetin öne çıkartılması gerektiği

Bu bilgiler `ad_campaigns` ve `content_items` ile ilişkilendirilebilir.

### 3.3. Hedef ve KPI tanımı

Her içerik için şu soruların cevaplanması gerekir:

- Bu içerik DM oluşturacak mı?
- Randevu talebini artıracak mı?
- Satışa mı yöneltecek?
- Kızılötesi ilgili ölçüm ne olacak?

Bunun için başlıca ölçümler şunlardır:

- görüşme / DM sayısı
- lead sayısı
- randevu sayısı
- fırsat takibi
- dönüşüm oranı
- maliyet / lead oranı

Bu metrikler `funnel_events` ve daha yüksek seviyede analiz için kullanılmalıdır.

---

## 4) İçerik türleri ve katmanları

Projede `content_items` ve `content_layers` yapısı hazırdır. Bu yüzden üretim, katman katman düşünülmelidir.

### 4.1. `content_items`

`content_items`, master içerik kaydını temsil eder. Bu kayıtta şunlar yer almalıdır:

- `business_id`
- `topic`
- `content_type` (`reel`, `image`, `text`)
- `status` (`draft`, `researching`, `generating`, `ready_for_review`, `approved`, `published`)
- `ad_campaign_id` (varsa)
- `created_at`

Bu kayıt, tek bir içeriğin ana kaydıdır. Örneğin “Bikini çizgisi için yeni reklam” tek bir content_item olabilir.

### 4.2. `content_layers`

`content_layers`, aynı içeriğin farklı parçalarını temsil eder:

- `visual` : görsel / video / frame / poster
- `voiceover` : seslendirme
- `subtitle` : altyazı/metin

Bu yapı çok önemlidir, çünkü proje kuralları açıkça şunu söylüyor: “Değiştir” seçildiğinde sadece ilgili katman yeniden üretilir, tüm içerik yeniden üretilmez.

Dolayısıyla üretim adımları şu şekilde ayrılır:

- bir görsel katmanı oluştur
- bir seslendirme katmanı üret
- altyazı katmanı hazırla
- her katman ayrı farklı onay sürecinden geçsin

---

## 5) İçerik üretim adım adım akışı

### 5.1. Büyük fikir / brief oluşturma

Her içerik üretim süreci şu bilgilerle başlar:

- hangi hizmet öne çıkarılacak
- müşteriye ne anlatılacak
- hangi çağrıya dönüşecek
- hangi tona uygun olmalı
- hangi platforma uygun olmalı
- hangi hedefe hizmet edecek

Detaylı örnek brief şablonu:

- konu / tema: “Özel bakım paketinin anlaşılırlığı”
- hedef kitle: kadın müşteriler, premium segment
- içerik tipi: Reels / 15 sn / eğlenceli ama profesyonel
- ana mesaj: “Sakin ve güvenli bakım, profesyonel ekibimizle”
- CTA: “DM gönderin, uygun saati konuşalım”
- renk tonu: sıcak, beyaz, feminen ama temiz
- ana hedef: DM başlatma oranı artırmak

Bu brief, `content_items.topic` ve `content_layers` ayrıntılarının temelini oluşturur.

### 5.2. Araştırma ve ürün bilgisi toplanması

İçerik üretmeden önce, işletme verisi net olmalıdır.

Gerekli bilgiler:

- hangi hizmetler mevcut
- fiyatlar ve süreler ne
- markanın tonu nasıl
- hangi gün/saatler çalışılıyor
- hangi hizmetler öncelikli
- müşteri için hangi mesajlar doğru

Bu bilgi, `business_config` içinden alınmalı. Eğer eksikse, içerik üretimi yanlış veya güvenriski yaratabilir.

Bu aşamada temel kontrol noktaları:

- fiyat yanlış yazılmamalı
- çalışma saatleri hatalı olmamalı
- marka tonu yanlışlaşmamalı
- gereksiz sözler, güvence, çarpıtma vb. kullanılmamalı

### 5.3. Storyboard / kompozisyon planlaması

İçerik, hangi akışla anlatılacaksa o plan oluşturulmalıdır.

Örnek yapı:

1. Başlangıç: dikkat çekici slogan veya soruyla başla
2. Orta: hizmeti kısa anlat
3. Üst: avantajı göster
4. Son: CTA ver

Örnek video içeriği için temel sorular:

- Ne gösterilecek?
- Bu hizmet neden önemli?
- Müşteri ne hissedecek?
- CTA ne olmalı?
- Görsellerde hangi renk / yazı / kurgu kullanılacak?

### 5.4. Görsel / video üretilmesi

Görsel katmanı (`visual`) için gerekli şartlar:

- marka uyumlu olmalı
- görsel net ve okunabilir olmalı
- fiyat/saat/iletişim bilgisi yanlış olmamalı
- arka plan ve metin düzeni temiz olmalı

İçerik üretim sisteminin hedefi burada şudur:

- özgünlük
- dikkat çekicilik
- anlaşılabilirlik
- doğru bilgi taşıma
- CTA netliği

#### Görsel için kontrol noktaları

- yazı okunaklı mı?
- fiyatı doğru gösteriyor mu?
- hizmet adı doğru yazıldı mı?
- logo ve marka tonu uyumlu mu?
- sayfa / profil ek açıklamasına uygun mu?
- mobilde okunabilir mi?

### 5.5. Seslendirme / voiceover üretimi

Seslendirme katmanı, içerik için çok önemli bir katmandır çünkü müşteri duygusal olarak bağ kurmaya başlar.

Gerekli bilgiler:

- konuşma tonu nasıl olmalı?
- metin kısa mı, uzun mu?
- ne kadar hızda konuşulmalı?
- vurgulanacak kelimeler ne olmalı?
- müşteri için güven ve sıcaklık hissi verilirse iyi olur

Seslendirme katmanı için kontrol noktaları:

- marka tonu uygun mu?
- yavaş / çok hızlı değil mi?
- çok fazla teknik jargon yok mu?
- CTA anlaşılır mı?
- “güven verme” var mı?

### 5.6. Altyazı / subtitle üretimi

Altyazı katmanı, özellikle Reels ve kısa video için çok kritik bir katmandır.

Gerekli bilgiler:

- video ne anlatıyor?
- ana cümleler ne olmalı?
- hangi metin sunucuya öne çıkacak?
- maks. kaç saniye / kelime?

Kontrol noktaları:

- okunabilir font?
- yazı uzun değil mi?
- mavi / siyah / beyaz gibi kontrast uygun mu?
- slogan / fiyat / CTA net mi?
- kısa ve temiz mi?

### 5.7. Metin/CTA üretimi

Metin katmanı, `content_items` içinde `text` içeriğidir. Bu katman, artık sadece “başlık” değil, müşterinin ne yapması gerektiğini net belirten CTA metnidir.

Gerekli bilgiler:

- CTA ne olmalı? (ör. “DM gönderin”, “Uygun saati mesaj atın”, “İletişime geçin”)
- metin hangi tone uygun?
- hangi hizmet vurgulanıyor?
- slogan ve arka plan eşleşiyor mu?

Kontrol noktaları:

- doğrudan anlaşılır mı?
- gerçeği yansıtan bir dil mi?
- başarı vaatleri yanlış değil mi?
- fiyat ve çalışma saatleri doğru mu?

---

## 6) İçerik üretiminde insan onayı ne zaman gerekir?

Proje kuralları ve `approvals` tablosu buna göre tasarlanmıştır. Bu nedenle her katman için insan onayı ayrı ayrı düşünülmelidir.

### 6.1. Neredeyse her üretim katmanı için onay gerekli

Gösterilen akış:

- fikir ve brief oluşturma
- görsel üretilir
- seslendirme üretilir
- altyazı üretilir
- metin/CTA üretilir
- tüm katmanlar bir araya gelir
- `ready_for_review` aşamasına geçer
- Ayşe veya atanan onaycı, `approvals` tablosuna uygun eylem verir

### 6.2. Onayı tetikleyen durumlar

Aşağıdakiler onay tetikleyicisi olabilir:

- bir `content_layer` `status = 'ready'` olduğu anda
- bir `content_item` `ready_for_review` aşamasına geldiğinde
- yeni bir sürüm üretildiğinde
- değişiklik isteği geldiğinde
- bir kampanya için içerik canlıya alınmadan önce

### 6.3. Onay ekranı ne göstermeli?

Onay ekranında şu bilgiler olmalıdır:

- içerik konusu / topic
- `content_type`
- business_id
- kampanya bilgisi (varsa)
- ilgili katman (`visual`, `voiceover`, `subtitle`)
- version
- asset_url / önizleme linki
- üretim zamanı
- önceki onay geçmişi
- kısa notlar
- “Onayla / Değiştir / Reddet” butonları

Bu, `approvals` tablosu ve `audit_log` için gerekli temel bilgidir.

### 6.4. Onay akışı adım adım

1. İçerik katmanı üretildiğinde `content_layers.status = 'ready'`
2. `content_item` veya `content_layer` `ready_for_review` olarak işaretlenir
3. `approvals` tablosuna review request kaydı eklenir
4. Ayşe bilgilendirilir
5. Onay ekranını izler
6. Seçeneklerden biri:
   - Approve
   - Change
   - Reject
7. Sistem bu eylemi `approvals` tablosuna kayıt eder
8. `audit_log` içine event yazılır
9. `content_layers.status` veya `content_items.status` güncellenir
10. Gerekirse yeni versiyon / yeniden üretim başlatılır

### 6.5. “Değiştir” seçeneği ne anlama gelir?

Değiştir ancak tek katman için yeniden üretim demektir. Proje kuralları bunu net şekilde vurgular.

Örnek:

- görsel a yetersiz -> görsel katmanı yeniden üretilir
- seslendirme çok hızlı -> sadece voiceover katmanı düzenlenir
- altyazı okunamıyor -> subtitle katmanı yeniden hazırlanır

Bu durum `content_layers.version` artırılmalıdır.

---

## 7) Reklam kampanyası üretimi ve yayın planı

İçerik üretimi bir içerik parçası üretirken, reklam kampanyası ayrı bir seviyedir. Bu iki şey birbirinin yerine geçmez.

### 7.1. Reklam kampanyası için gerekli bilgiler

Bir kampanya başlatmadan önce şunlar gerekli olmalıdır:

- işletme kimliği
- hedef kitle
- kampanya hedefi
- bütçe
- yayın aralığı
- içerik basıncı / video tipleri
- hedef eylem (DM, lead, randevu)

`ad_campaigns` tablosunda bu bilgiler tutulur.

### 7.2. Kampanya yaşam evresi

`ad_campaigns.status` şu değerleri taşıyabilir:

- `draft`
- `active`
- `paused`
- `completed`

Kampanya akışında adım adım ilerlemek gerekir:

1. kampanya için fikir belirlenir
2. hedef çok netleşir
3. içeriğin yaratılması için `content_items` ve `content_layers` kullanılır
4. onay çıkar
5. `ad_campaigns` içinde giriş yapılır
6. yayın başlatılır
7. performans izlenir
8. gerekirse güncellenir / yeniden üretim yapılır

### 7.3. Kampanyanın içerik ile bağlantısı

`content_items` ile `ad_campaigns` arasındaki bağlantı şu şekilde kurulmalıdır:

- bir kampanya için bir veya çok içerik üretilir
- her içerik, `ad_campaign_id` ile bağlanır
- `content_items` status `published` ya da `approved` durumuna geldiğinde kampanya için kullanılabilir

### 7.4. Reklam dağıtımında güvenlik kısıtları

Proje kuralları netleştiriyor:

- üretim reklam kampanyalarına doğrudan gömülü erişim yapılmaz
- canlı reklam hesaplarına zarar verici eylem yapılmaz
- gerçek Meta hesabı ve canlı WhatsApp hattı ile çalışmaya geçmeden önce tüm onaylar ve güvenlik adımları tamamlanır

---

## 8) Müşteri etkileşimi ve CTA tasarımı

İçerik tek başına üretilemez; içeriğin son hedefi müşteri davranışını tetiklemektir.

### 8.1. CTA ne olmalı?

CTA şu olmalıdır:

- net
- kolay anlaşılır
- kısacık ama anlamlı
- yanlış vaat içermemeli
- müşteri için kaç adım gerektirmemeli

Örnek CTA’lar:

- “DM gönderin, uygun saati konuşalım.”
- “Hizmetlerimiz ve fiyatlarımız için mesaj atın.”
- “WhatsApp’tan uygun gününüzü yazın.”

### 8.2. CTA'nın içinde ne söylenmemeli?

- yanlış fiyatlar
- uygun olmayan çalışma saatleri
- “kesin sonuç garantisi” gibi iddialar
- gereksiz vaatler
- gerçek olmayan kampanya sözü

### 8.3. CTA ile lead qualification bağı

CTA, doğrudan DM akışını tetiklemelidir. Bu nedenle içerik şu dışa dönük hedefleri taşımalıdır:

- müşteri DM başlatmalı
- müşteri hizmetle ilgili soru sormalı
- müşteri uygun günü / saati belirtmeli
- lead qualification akışı başlamalı

---

## 9) İçerik üretimi için gerekli veriler ve hangi amaçla kullanılır?

Aşağıdaki veri listesi, içerik üretimini doğru yapabilmek için gereklidir.

### 9.1. İşletme bilgileri

- işletme adı
- konum
- hizmetler
- fiyatlar
- çalışma saatleri
- iletişim tonu
- marka yaklaşımı

Amaç: içeriği doğru ve güvenilir şekilde üretmek.

### 9.2. Hizmet bilgileri

- her hizmetin açıklaması
- fiyatı
- süresi
- avantajı
- hangi müşteriye uygun olduğu

Amaç: hangi hizmet öne çıkarılacak, ne anlatılacak, müşterini ilgisini en çok çekecek unsur hangisi.

### 9.3. Kampanya hedefi

- reklam için hedefledikleri niyet nedir
- hangi eylem isteniyor
- hedef kitle ne

Amaç: televizyondan farklı olarak daha odaklı, gerçek eyleme dönük içerik üretmek.

### 9.4. Yaratıcılık ve metin için style guide

- ton (samimi / premium / düzenli)
- emoji kullanımı
- slogan
- başlık türleri
- renkler

Amaç: içerik tüm katmanlarda aynı dil ve tonla konuşsun.

### 9.5. Kullanım ve yayın platformu

- Reels mi?
- Static image mı?
- Story mi?
- izlenme süresi nerede?

Amaç: platforme uygun format ve tasarım.

---

## 10) İçerik üretiminde QC (quality control) ne olmalı?

İçerik hazırlandıktan sonra kalite kontrolü yapılmalıdır. Burada üretimin üç düzeyli kontrolü vardır ve her düzey hem otomatik kontrolleri hem insan QC adımlarını içermelidir.

### 10.1. Teknik kalite kontrolü (otomatik + manuel)

- video oynatılabiliyor mu? (otomatik oynatma testi)
- görsel bozulmuş mu? (hash/byte-check ve görsel meta kontrolü)
- altyazı gözüktü mü? (subtitle burn-in simulasyonu)
- ses net mi? (ortalama SNR ve sessiz bölge tespiti)
- video boyutu ve codec platforma uygun mu? (limit ve format kontrolleri)
- asset URL erişilebilir mi?
- CDN ve hosting metadata doğrulaması

Teknik hatalarda `content_layers.status` `error_upload` veya `needs_fix` ile işaretlenmeli ve `audit_log` içinde `technical_qc_failed` event'i üretilmelidir.

### 10.2. İçerik doğruluk kontrolü

- fiyat doğru mu? (`business_config` ile çapraz kontrol)
- hizmet adları doğru mu? (`services` katalogu ile karşılaştırma)
- saat ve gün bilgileri doğru mu? (`business_config.work_hours` ile doğrulama)
- iletişim bilgileri doğru mu? (masked preview, telefon/URL kontrolü)
- hiçbir “gereksiz, yanlış, uydurma” bilgi yok mu?

Bu kontroller mümkünse otomatikleştirilmeli; otomatik tutarsızlık tespitinde insan onayı (Ayşe) gerekecek şekilde işaretleme yapılmalıdır.

### 10.3. Etik, marka ve PII kontrolü

- marka tonu uygun mu?
- güvenli ve profesyonel mi?
- reklama uygun değerler taşıyor mu?
- kullanıcıları yanıltmıyor mu?
- içerikte kişisel veri (adres, telefon, yüz görüntüsü vb.) var mı? Varsa gizlilik izinleri ve maskelenmiş mi?

PII içeren asset'ler için QC şu adımları izlemelidir:
- Eğer asset içinde tanımlanabilir yüz/numara/kimlik varsa, yayına çıkmadan önce izin doğrulaması yapılmalı.
- Hata veya izin eksikliği durumunda içerik derhal `rejected` veya `quarantine` statüsüne alınmalı ve `audit_log` içine `pii_issue` kaydı düşürülmelidir.

Yalnızca “gözü güzel” değil; “doğru, güvenilir, yasal ve niyetli” içerik üretimi gerekir. QC adımları ile ilgili tüm insan kararları `approvals` tablosuna, teknik olaylar `audit_log` ve `model_routing_log`'a kaydedilmelidir.

---

## 11) İçerik üretiminde veri kaydı ve izlenebilirlik

Her adımın kayıt altına alınması gerekir.

### 11.1. `content_items`

- içerik ana referansı
- kampanya ile bağ kurma
- üretim durumu

### 11.2. `content_layers`

- hangi katman ne zaman üretildi
- hangi sürüm
- hangi asset_url var
- hangi katman onaylandı / reddedildi

### 11.3. `approvals`

- kim onay verdi
- hangi katman ve versiyon
- neye göre onaylandı / değiştirildi / reddedildi

### 11.4. `audit_log`

- içerik üretim adımları
- onay kararları
- yeniden üretim
- hata veya güvenlik uyarıları

### 11.5. `funnel_events`

- içerik yayınlandı mı?
- çıkan DM'ler arttı mı?
- randevu talebi geldi mi?
- dönüşüm elde edildi mi?

---

## 12) Reklam üretim sırası önerisi (MVP önerisi)

En küçük ama sorumlu plan şu şekilde olmalıdır:

### Adım 1: 3 içerik fikri üret

- 1 reel
- 1 görsel reklam
- 1 kısa video / metin içerik

### Adım 2: Her biri için brief yaz

- amaç
- ana mesaj
- CTA
- hedef kitle

### Adım 3: Her içerik için katmanlar oluştur

- visual
- voiceover
- subtitle
- text/CTA

### Adım 4: Her katmanın status'ini tanımla

- draft → generating → ready → ready_for_review → approved

### Adım 5: approvals aç

- Ayşe onayı
- her katman için uygun eylem

### Adım 6: kampanya oluştur

- `ad_campaigns` alanı doldurulur
- içerik ona bağlanır

### Adım 7: performans izle

- `funnel_events` ile DM, lead, randevu takibi
- randevu ve dönüşüm raporu hazırlanır

### Adım 8: başarısız olan katman yeniden üretim için geri dönsün

- sadece ilgili katman ve versiyon değişsin
- tüm içerik baştan üretilmesin

---

## 13) Özellikle dikkat edilmesi gereken riskler

### 13.1. Hatalı fiyat / yanlış hizmet bilgisi

İçerik üretiminde en ciddi güvenlik riski budur. Fiyat ve hizmet bilgisi yanlış yazılırsa müşteri güveni zedelenir.

### 13.2. Doğru olmayan CTA

“Önceki hizmet bilgileri” ve “güvenli iletişim tonu” dışına çıkan CTA’lar, müşteriyle yanlış anlaşılmaya neden olur.

### 13.3. Çok fazla üretim ve az kontrol

Görsel ve video çok hızlı üretilirse, kalite kontrol ve onay süreci kaçırılabilir. Oysa onay katmanı burada gereklidir.

### 13.4. Metin ve ses uyumsuzluğu

Metin ile seslendirme aynı anda tutarsızsa, marka güveni düşer. Aynı brief’e göre both should match.

### 13.5. İnsan onayı atlanırsa

Eğer review adımı atlanırsa üretim, yanlış veya uygunsuz içerikle yayınlanabilir. Bu nedenle `approvals` tablosuyla onay zorunlu olmalı.

---

## 14) İçeriğin başarılı olmasının ölçüsü

Bir içerik parçası başarılı kabul edilebilmesi için en az şunları sağlaması gerekir:

- doğru bilgi taşıyor
- marka tonuna uygun
- uygun platforma uygun
- CTA net
- insan onayı geçmiş
- reklam amacıyla dönüşüm potansiyeli taşıyor
- ölçüm verisi ile takip edilebiliyor

Başarı ölçerleri:

- DM sayısı
- lead sayısı
- randevu talebi
- kampanya dönüşümü
- maliyet / lead oranı

---

## 15) Kısa karar listesi

İçerik ve reklam üretimi için kodlamaya başlarken şu başlıklar net olmalıdır:

- `content_items` nasıl oluşturulacak?
- `content_layers` nasıl ayrılacak?
- `visual`, `voiceover`, `subtitle` katmanları hangi sürüm/versiyon mantığıyla gelecektir?
- `approvals` hangi eylem türleri ile açılacak?
- `ad_campaigns` içindeki kampanya hedefi ne olacak?
- `funnel_events` hangi event'leri taşıyacak?
- yayın sonrası performansın nasıl izleneceği netleşecek mi?

Bu sorular netleştikçe, içerik üretim akışı kodlanabilir ve ölçülebilir bir makine haline gelir.

---

## 16) Sonuç

Bu belge, içerik üretimi ve reklam üretim akışını tek bir sistem çerçevesinde anlatır. Esas fikir şudur:

- içerik üretimi modüler yapılmalı
- her katman ayrı üretilmeli
- her katman ayrı kontrol edilmeli
- insan onayı gerekli olmalı
- kampanya ve yayın akışı bundan sonra başlamalı
- her adım kayıt altına alınmalı
- ölçüm, kanıt ve performans için `funnel_events`, `approvals`, `audit_log` kullanılmalı

Bu, projedeki mevcut veritabanı yapısıyla tam uyumlu ve kodlanabilir bir çalışma mantığıdır.
