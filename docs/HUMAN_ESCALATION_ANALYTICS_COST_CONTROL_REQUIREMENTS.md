# İnsan Devri, Analiz/Takip ve Maliyet Kontrolü Gereksinimleri

Bu belge, projede henüz detaylandırılmamış üç ana alanı kapsamlı ve kodlanabilir şekilde açıklar:

1. Bir konuşmanın ne zaman ve nasıl Ayşe'ye (veya başka bir insan temsilciye) devredileceği (human escalation)
2. Hangi olayların kaydedileceği, funnel'ın nasıl izleneceği ve analiz/raporlama yapılandırmasının nasıl olacağı (analysis and tracking)
3. Hangi yapay zeka modelinin ne zaman kullanılacağına dair kararların nasıl günlendiği, hangi verilerle izlendiği ve maliyet kontrolünün nasıl yapıldığı (cost control and model routing)

Amaç, bu üç alanı aynı derinlikte ve aynı titizlikle tanımlamak, böylece bir başka geliştirici ya da başka yapay zeka bu planı alıp doğrudan uygulamaya geçebilmelidir.

Bu belge, mevcut veritabanı modeli (`conversations`, `messages`, `leads`, `appointments`, `audit_log`, `escalations`, `model_routing_log`, `funnel_events`, `business_config`, `approvals`) ve proje kurallarına göre yazılmıştır. Yeni mimari karar eklenmez; mevcut şema ve planlama çerçevesi içinde net, uygulanabilir bir gereksinim seti sunulur.

---

## 1) Genel amaç ve temel prensipler

### 1.1. Üç sistemin ortak amacı

Bu üç alanın ortak hedefi şudur:

- müşteriye özel, doğru ve güvenli bir insan müdahalesi akışı kurmak
- sistem davranışlarını geriye dönük izlenebilir hale getirmek
- yatırımın/AI kullanımının maliyetini tanımlamak ve kontrol etmek
- her kararın neden verildiğini kayıt altında tutmak

### 1.2. Temel prensipler

1. İnsan devri, otomasyonun güvenli sınırlarını korumak içindir; insan müdahalesi gerektiren bir durum otomatik cevapla kapatılmaz.
2. Her olay kaydedilir; kayıtlar izlenebilir ve tartışılabilir olmalıdır.
3. Funnel izleme, sadece birkaç sayım değil, gerçekten bir müşteri akışının adım adım ilerlemesini takip etmeyi amaçlamalıdır.
4. Maliyet kontrolü, "her mesajı güç modelle işleme" mantığına değil; doğru modelin doğru durumda seçilmesine dayanmalıdır.
5. Kimse, neyi neden yaptığını açıklayamayan bir sistemle üretime geçmemelidir. Her karar için açıklama ve kayıt gerekir.

---

## 2) İnsan devri (Escalation) gereksinimleri

### 2.1. İnsan devri niçin gerekir?

Otomatik sistem bazı durumlarda güvenli ve doğru karar alamaz. Aşağıdakiler, insan müdahalesi gerektiren tanımlı durumlardır:

- müşteri net bir niyeti ifade etmemiş fakat çok önemli görünmektedir
- müşteri arasındaki bilgiler çelişkili ve net değil
- fiyat, ürün, rakip karşılaştırma veya kampanya talebi insan yorumunu gerektiriyor
- müşterinin davranışı agresif, şikâyetçi veya manipülatif ise
- fiyat ve hizmet uyumu doğrudan insan onayı gerektiriyorsa
- müşteri için özel düzenleme, özel paket, premium plan veya özel durum söz konusuysa
- iletişimde birden fazla konu bir arada sürüyorsa ve sistemin hata yapma riski yüksekse
- sistemin yanlış işleyişi ya da teknik sorun nedeniyle güvenilir bir cevap üretilemiyorsa
- müşterinin güvenlik, privacy, yasal risk veya üretimle ilgili kapsam dışında bir istekleri varsa

### 2.2. İnsan devri zamanlaması

Bir konuşma farklı aşamalarda Ayşe'ye devredilebilir:

- doğrudan girişte (işleme başlamadan önce)
- lead qualification sonrası, fakat randevu belirlenmeden önce
- müşteri şartlarını netleştirme aşamasında
- randevu çakışması veya sistem kararıyla ilgili belirsizlikte
- müşterinin şikâyeti ya da karşı çıkarak engel oluşturması durumunda
- otomatik cevap oluşturulamadığında

### 2.3. Devredilecek konuşmanın belirleyici göstergeleri

Aşağıdaki sinyaller, konuşmanın insana devredilmesi gerektiğini işaret eder:

- müşteri tek bir cümleyle değil, uzunca konuşma yapıyor ve ana amacını net ifade etmiyor
- bir randevu talebi var fakat istemiş olduğu saat, gün ve hizmet bilgisi eksik
- müşteri önceki mesaja göre tutarsız davranıyor
- fiyat, indirim, jest, özel koşul veya buna benzer talepler var
- müşteri aynı anda biriyle konuşuluyormuş gibi farklı hedefler veya farklı hizmetler söylüyor
- konuşma daha önce bir lead qualification sonucuyle çakışıyor ve işin netleşmesini insanın yapması gerekiyor
- otomatik sistem mesajı hazırlamakla kalmayıp gerçek bir müşteri temsilcisinin devreye girmesi gerektiği açıkça görülüyor

### 2.4. Devri tetikleyen senaryolar

#### Senaryo A: yüksek olasılıkla lead ama net bilgi eksik

Mesaj:

"Aslında biraz düşünüyordum, bir de telefonla konuşmak isterim. Uygun zamanı nasıl seçiyorum?"

Bu durumda:

- lead potansiyeli var
- ama sistemin tek başına karar verdiği ve randevu verdiği durum uygun değil
- insan devri uygundur

#### Senaryo B: müşteri agresif / şikâyetçi / itirazlı

Mesaj:

"Bu kadar pahalıya geliyorsunuz, başka yerde daha ucuz. Siz ne yapıyorsunuz?"

Bu durumda:

- fiyat anlaşmazlığı var
- indirim / özel fiyat isteme ihtimali var
- müşteri baskı kuruyor
- insan müdahalesi gerekir

#### Senaryo C: birden fazla niyet bir arada

Mesaj:

"Önce fiyatı öğrenmek istiyorum ama sonra salı günü uğramak için randevu ayarlayalım. Fakat da hafta sonu da olabilir."

Bu durumda:

- birden fazla niyet aynı anda var
- uygunluk kontrolü ve müşteri kez seviyeleri insan tarafından yönetilebilir

#### Senaryo D: teknik veya veri sorunu

Aşağıdakiler insan devrine işaret eder:

- webhook mesajı bozuk ama müşteri yine de anlamlı bir durumdan bahsediyor
- veritabanı write hatası ortaya çıkıyor
- `business_config` okunamıyor veya özel bir hata var
- mesajın içeriği birden fazla platformdan gelmiş ve birbiriyle çelişiyor

### 2.5. `escalations` tablosu ile veri modeli

`escalations` tablosu şu alanlara sahip olmalıdır:

- `id`
- `business_id`
- `conversation_id`
- `reason`
- `status` (`open`, `in_progress`, `resolved`)
- `assigned_to`
- `created_at`
- `resolved_at`

Bu tablonun hedefi şudur:

- konuşma neden insan devrine gittiğini kaydetmek
- devri kimin üstlendiğini görmek
- hangi devrin çözülüp çözülmediğini takip etmek
- konuşmanın tarihsel akışını süreklilik içinde izlemek

### 2.6. İnsan devri akışı (tam adım adım)

Tek tip bir human escalation pipeline oluşturulmalıdır:

1. İnbound mesaj alınır ve ilgili `conversation_id` bulunur.
2. `lead qualification` ve `randevu` kontrolleri yapılır.
3. Sistem, devreye girip girmeyeceğine karar verir.
4. Devreye girecekse `escalations` tablosuna kayıt oluşturur.
5. `status = 'open'`, `assigned_to = 'Ayşe'` veya atanan temsilci.
6. `audit_log` içine `escalation_created` event'i yazılır.
7. İnsan tarafına kısa, net ve bağlamlı bir özet iletilir.
8. İnsan müdahalesi sonrası sonuç ne olursa olsun `status` güncellenir.
9. `resolved_at` yazılır ve konuşma `conversations.status` uygun şekilde güncellenir.
10. Gerekirse yeni bir lead veya appointment kaydı oluşturulur.

### 2.7. İnsan devri için gerekli bağlam bilgisi

İnsan tarafına iletilecek özet aşağıdakileri içermelidir:

- müşteri kimliği / kanal / conversation_id
- konuşmanın son 5-15 mesajı (özetlenmiş)
- lead qualification skoru ve altta yatan nedenler
- mevcut `appointment` durumu (varsa)
- istenen hizmet / gün / saat / fiyat bilgisi
- çakışma veya riskler varsa bunlar net olarak belirtilmeli
- otomatik sistemin neye karar verdiği, hangi kuralın devreye girdiği anlatılmalı

Bu, Ayşe'nin gerekli bilgileri hızlıca anlaması için çok önemlidir.

### 2.8. Devri kapatma ve durum güncellemesi

Bir escalation şu üç şekilde kapatılabilir:

- çözülmüş ve müşteriyle iletişim tamamlandı
- randevu oluşturuldu ve müşteri takip altında
- sistemin otomatik devri çözemediği, buton / takip gerektiren bir durum olarak kapandı

Kapatıldığında şu işlemler yapılmalı:

- `escalations.status = 'resolved'`
- `resolved_at = now()`
- gerekli `audit_log` kaydı
- gerekirse yeni `funnel_event` veya `lead` güncellemesi

### 2.9. İnsan devri için güvenlik ve etik kurallar

- konuşma, müşteri özel verileri ve gizlilik gerekliliklerine uygun çalıştırılmalı
- kullanıcının başka bir müşterinin verisini görmek için erişim yetkisi olmamalı
- insan devri, promosyon/indirim dayatmasına dönüştürülmemeli
- bir lead'i insan devri ile kapatmak, otomatik onay anlamına gelmez

---

## 3) Analiz / takip (tracking and analysis) gereksinimleri

### 3.1. Neden takip gerekir?

Sistemin amacı yalnızca cevap üretmek değil, müşteri akışını ölçmek ve geliştirmek olmalıdır. Bu nedenle hangi olayların kaydedileceği net tanımlanmalıdır.

`funnel_events` tablosu, bu tür olayların tamamı için temel bir yerdir. `audit_log` daha geniş sistem olaylarını tutarken, `funnel_events` daha çok müşteri akışının iş/performans tarafını izler.

### 3.2. Aşağıdaki olaylar kaydedilmeli

#### 3.2.1. Toplama / trafik olayları

- `dm_started` : müşterinin ilk DM / ilk mesajı attığı tarih ve kanal
- `reel_view` : reklam/örnek içerik görüntülenmiş olabilir, ancak bu olay ürün/reklam tarafı için kullanılır

#### 3.2.2. Lead ve lead quality olayları

- `lead_qualified` : bir lead başarılı şekilde nitelikli hale geldi
- lead_score_updated : skor değiştiğinde kayıt
- lead_disqualified : uygun olmayan lead kapandı

#### 3.2.3. Randevu olayları

- `appointment_booked` : randevu hazırlandı
- `appointment_confirmed` : randevu müşteriden onay aldı
- `appointment_cancelled` : iptal
- `appointment_rescheduled` : kaydırma

#### 3.2.4. Müşteri dönüşüm olayları

- `customer_converted` : müşteri, randevu sonrası başarılı şekilde müşteri oldu

### 3.3. `funnel_events` tablosu ile model

`funnel_events` tablosu şu alanları taşımalıdır:

- `id`
- `business_id`
- `conversation_id` (varsa)
- `lead_id` (varsa)
- `event_type`
- `created_at`

Kısıtlar:

- `event_type` yalnızca tanımlı değerler olmalı
- aynı olay birden fazla kez tekrar edilirse dedupe kuralları uygulanmalı
- gereksiz olaylar, “sadece mesaj geldi” gibi tek başına anlamsız girişler değildir; ana işlemler kaydedilmeli

### 3.4. `audit_log` ile sistem yazılım olayları

`audit_log` daha geniş ve daha teknik olayları tutar. Bu olaylar şunları kapsamalıdır:

- `lead_scored`
- `lead_qualified`
- `lead_disqualified`
- `appointment_requested`
- `appointment_confirmed`
- `appointment_conflict_detected`
- `escalation_created`
- `escalation_resolved`
- `model_routed`
- `rate_limited`
- `webhook_signature_failed`
- `business_config_loaded`
- `system_error`

`payload` JSON içindeki alanlar şunları taşımalı:

- `message_id`
- `conversation_id`
- `lead_id`
- `appointment_id`
- `business_id`
- `reason`
- `score`
- `model`
- `status`
- `error_message`
- `actor`
- `channel`

### 3.5. Takip gereksinimleri

#### Akış takibi

Bir konuşma için sistemin güvenli bir şekilde izlemesi gereken temel akış şöyledir:

1. initial message received
2. conversation created / found
3. lead detection
4. score assigned
5. qualification decision
6. if appointment needed, booking process starts
7. if escalation triggered, human assigned
8. final status recorded

Her adım, `audit_log` veya `funnel_events` içinde izlenebilir olmalıdır.

#### Performans takibi

Ayrıca şu metrikler izlenebilir olmalıdır:

- DM başlatma sayısı
- nitelikli lead sayısı
- randevu talebi sayısı
- onaylanan randevular
- iptal sayısı
- insan devrine geçen konuşma sayısı
- lead conversion oranı
- randevu dönüşüm oranı
- müşteri dönüşüm oranı

### 3.6. KPI ve funnel takibi

Proje tasarımında hedef funnel açıkça şöyle:

Reel/Reklam -> DM -> Nitelikli lead -> Randevu -> Müşteri

Bu nedenle her aşamada bir olay tanımlanmalıdır:

- `reel_view` reklam/izlenme tarafı
- `dm_started` iletişim başlatıldı
- `lead_qualified` ilk sıcak lead
- `appointment_booked` randevu oluştu
- `customer_converted` müşteri oldu

Bu olaylar, aynı zamanda analiz ve raporlama için de kullanılabilir. Hangi olayın hangi aşamada oluştuğu, KPI'ların doğru hesaplanması için önemlidir.

### 3.7. Raporlama gereksinimleri

Aşağıdaki raporlar gerekli ve kullanılabilir olmalıdır:

#### 7.1. Funnel raporu

- toplam DM sayısı
- nitelikli lead sayısı
- randevu talebi sayısı
- onaylanan randevu sayısı
- müşteri dönüşüm sayısı
- her aşamadaki kayıp oranı

#### 7.2. Lead quality report

- her lead için score dağılımı
- en yüksek / en düşük skorlar
- hangi metin kalıpları lead olarak işaretlendi
- hangi içerik / kanal daha çok lead verdi

#### 7.3. İnsan devri raporu

- toplam escalation sayısı
- hangi nedenden dolayı devredildi
- devri kimin çözdüğü
- çözüm süresi
- randevu oluşturulan devrim sayısı

#### 7.4. Denetim / audit report

- hangi karar ne zaman alındı
- hangi olay neden oluştu
- sistemin hangi model veya hangi düzenlemeden geçtiği

### 3.8. Analiz için gerekli verinin yapısı

Analysis engine, aşağıdaki alanlara bakmalıdır:

- `conversation_id`
- `business_id`
- `channel` (whatsapp / instagram)
- `message timestamp`
- `lead_id`
- `appointment_id`
- `event_type`
- `score`
- `reason`
- `response_time_ms` (gerekirse)

Bu alanlar, daha sonra KPI hesaplaması için kullanılabilir.

### 3.9. Analiz ve güvenlik

- Kullanıcı kimlikleri ve müşteri verileri sadece bu iş için kayıt altına alınmalı
- `audit_log`lardan yalnızca ilgili yetkili insanlar içeriği görmeli
- `PII` ve hassas müşteri detayları sıklıkla doğrudan metin olarak yazılmamalı; sadece sanal/özet/işaretli bilgiler tutulmalı

---

## 4) Maliyet kontrolü (Cost control and model routing) gereksinimleri

### 4.1. Neden önemlidir?

Sistem, her mesaj için en güçlü modeli seçmek yerine, her durumda en uygun modeli seçmelidir. Bu hem maliyet hem de hız açısından kritik öneme sahiptir.

Projede model routing mantığı zaten planlanmıştır. `model_routing_log` tablosu bunun için öngörülmüştür. Bu tablo, hangi provider/model kullanıldığını, ne kadar maliyet oluştuğunu ve gecikmeyi kaydeder.

### 4.2. Model routing kararının amacı

Aşağıdaki üç maddede tek hedef vardır:

- basit, rutin ve düşük riskli mesajlar için ucuz ve hızlı modeli kullanmak
- karmaşık, hassas, niyetli veya kritik mesajlar için daha güçlü modeli kullanmak
- maliyet ve kalite dengesi kurmak

### 4.3. Model routing için veri kaynakları

Aşağıdaki bilgiler karar için gereklidir:

- mesajın uzunluğu
- mesajın karmaşıklığı (basit mi, çoklu amaçlı mı?)
- lead qualification sonucu
- randevu talebinin ciddiyeti
- müşteri davranışının risk düzeyi
- mevcut konuşma bağlamı
- geçmiş mesajların toplam uzunluğu

### 4.4. Hangi durumlarda hangi model?

İlk düşünülmüş başlangıç kuralları şunlardır:

#### 1. Basit, kısa ve rutin mesajlar

Örnekler:

- merhaba
- fiyat sorusu (tek başına)
- çalışma saatleri sorusu
- adres sorusu
- “hangi hizmetler var?”

Bu durumda:

- ucuz / hızlı model (ör. haiku benzeri) kullanılabilir
- response_time kısa olmalı
- maliyet düşük olmalı

#### 2. Orta karmaşıklık ve müşteriyle işlem niyeti taşıyan mesajlar

Örnekler:

- hizmet ve fiyat birlikte soruluyor
- uygun randevu uygunluğu tartışılıyor
- müşteri hem fiyat hem tarih soruyor
- müşteri endişesini anlatıyor

Bu durumda:

- orta seviye model / güçlü ama maliyet açısından dengeli seçim
- kullanımdan önce `lead qualification` durumu kontrol edilmeli

#### 3. Yüksek risk / kritik / özel karar gerektiren mesajlar

Örnekler:

- müşteri itiraz ediyor
- fiyat indirim talep ediyor
- randevu için çok özel bir istek var
- konuşma çelişkili, güvenli karar vermek için insan müdahalesi gerekli
- system triggers escalation

Bu durumda:

- güçlü model ancak insan müdahalesi yaklaşımı daha güvenli olabilir
- model seçimi ne olursa olsun, her adım `audit_log` ile izlenmeli

### 4.5. `model_routing_log` tablosunun rolü

`model_routing_log` tablosunda şunlar tutulmalıdır:

- `id`
- `business_id`
- `message_id`
- `provider`
- `model`
- `cost_usd`
- `latency_ms`
- `created_at`

Bu sayede bir mesajın hangi modelle işlendiği kesin olarak görülebilir. `message_id` bağlantısı ile ilgili mesajın bulunduğu konuşma ve lead ile birleştirilebilir.

### 4.6. Cost control için temel gereksinimler

#### 6.1. Başlangıç eşikleri

Maliyet kontrolü şu eşiklere dayanmalıdır:

- kısa ve basit mesajlarda düşük maliyetli model
- yüksek niyet / yüksek önemli mesajlarda güçlü model
- aynı konuşma içindeki tekrar eden mesajlar için tekrar tekrar maliyet oluşmamalı

#### 6.2. Bing hyper-optimization değil, mantıklı kısıt

Maliyet kontrolü şunu yapmamalıdır:

- tek bir modelin her durumda kullanılmasına zorlamak
- çok basit mesajlarda güçlü model kullanmak
- çok kısa bir içeriği benzerleştirerek gereksiz maliyet çıkarmak

Doğru yaklaşım şudur:

- “öğrenme ve maliyet kontrolü” üzerinden model seçimi
- buna göre route etme

### 4.7. Maliyet kontrolü işlemi

Aşağıdaki akış uygulanmalı:

1. Mesaj alınır
2. Mesaj kısa mı, karmaşık mı, kritik mi kontrol edilir
3. Lead qualification sonucu ve risk seviyesi hesaplanır
4. Uygun model seçilir
5. `model_routing_log` içinde kayıt oluşturulur
6. Çözüm üretim sonrası maliyet ve gecikme not edilir
7. gerektiğinde düzenli rapor oluşturulur

### 4.8. Model seçimi için kurallar

Bahsi geçen model routing, kod ile şu şekilde davranmalıdır:

- `simple` / `routine` / `faq` mesajlarda düşük maliyetli model
- `middle` / `transactional` mesajlarda ortalama model
- `complex` / `lead` / `escalation` / `complaint` mesajlarda daha güçlü model
- maliyeti aşırı yükselten işlemler için ekstra kontrol ve batch optimize edilebilir

### 4.9. Maliyet ve kalite takibi için raporlama

Aşağıdaki raporlar gerekli olmalıdır:

#### 9.1. Model maliyet raporu

- toplam maliyet
- model bazlı maliyet dağılımı
- en pahalı model hangisi
- hangi tür mesajlar en çok para harcatıyor

#### 9.2. Cevap kalitesi ve hız raporu

- model bazlı ortalama latency
- model bazlı hata / retry / reject oranı
- çözüm için geçen süre

#### 9.3. Lead / model korelasyonu

- hangi model daha çok lead üretmiş
- hangi model daha çok randevu veya müşteri dönüşümü sağlamış
- maliyet başına başarılı lead oranı

### 4.10. Maliyet kontrolü mantığı ile ilgili kritik kurallar

- Model route işlemi yalnızca maliyet değil, kalite ve güvenlik için yapılmalıdır.
- En pahalı model her durumda en iyi cevap garantisi vermemelidir.
- Basit mesajlarda güçlü model kullanmak, gereksiz maliyeti artırır.
- Her model seçiminde `model_routing_log` yazılmalıdır.
- `provider` ve `model` alanları her zaman net olmalıdır.

### 4.11. Maliyet kontrolünde riskler

Aşağıdaki durumlar özellikle kontrol edilmelidir:

- aynı mesaj birden fazla kez model seçimi için tekrar tekrar işlenmesin
- çok kısa / gereksiz mesajlar için aşırı model çağrısı yapılmasın
- lead alımı ve randevu işlemleri için model riskleri aşırı basit hale getirilmesin
- model seçimi sırasında `business_id` ve `conversation_id` kaybı olmasın

---

## 5) Bütün bu alanların bir arada çalışacağı veri akışı

Bu üç sistemin birlikte nasıl işlediğini tanımlayan ortak akış şöyle olmalıdır:

1. Gelen mesaj alınır.
2. `messages` tablosuna kaydedilir.
3. `conversations` bağlamı bulunur.
4. `lead qualification` çalıştırılır.
5. `qualification_score` ve `status` set edilir.
6. `funnel_events` ve `audit_log` içine uygun olaylar düşer.
7. Eğer insan müdahalesi gerekiyorsa `escalations` oluşturulur.
8. Model routing, mesajın karmaşıklığına göre uygun provider/model seçer.
9. `model_routing_log` yazılır.
10. Eğer uygunluk ve niyet ciddi ise `appointments` akışı başlar.
11. Tüm bu adımlar `audit_log` ve `funnel_events` ile izlenir.
12. Son sonuçlar raporlanır.

Bu akış, tek tek görevler olarak butonlanabilir; ancak bütün sistemin aynı anda izlenmesi gereklidir.

---

## 6) Yalın başlangıç örneği

Bu iş akışı için en pratik ilk uygulama, aşağıdaki şekilde minimum ama yeterli bir başlangıç olabilir:

### 6.1. İnsan devri kuralları

- lead_score < 40 ise otomatik değil, sadece bilgi verme olarak işlem görsün
- lead_score 40-69 arasında ise ek soru gerekirse insan devri
- lead_score >= 70 ise randevu akışına yönlendir
- müşteri şikâyeti veya agresif mesaj varsa insan devri

### 6.2. Funnel kuralları

- her sohbet için `dm_started` event
açık konuşma
- lead qualified ise `lead_qualified`
- randevu varsa `appointment_booked`
- müşteri olduysa `customer_converted`

### 6.3. Model routing

- kısa mesajlar -> hızlı model
- niyetli/karmaşık mesajlar -> güçlü model
- escalation sırasında insan eşliğinde model geçişi sağlayan karar

### 6.4. Maliyet kuralı

- modele göre `cost_usd` ve `latency_ms` kaydedilsin
- her 30 veya 60 dakikada maliyet raporu çıkarılsın
- gereksiz tekrar model çağrısı önlensin

---

## 7) Hata ve güvenlik senaryoları

### 7.1. İnsan devri yanlış tetiklenirse

Bazı konuşmalar gereksiz yere Ayşe'ye giderse:

- `escalations` sayısı artar
- insan yükü yükselir
- operasyonel maliyet artar

Bu durumda, escalation koşullarının eşikleri yeniden incelenmeli ve `lead qualification` skorları ayarlanmalı.

### 7.2. Maliyet kontrolü yanlış model seçerse

En pahalı veya en zayıf model seçilirse:

- gereksiz para harcanır
- hızlı dönüşüm bozulabilir
- operasyonel verim düşer

Bu durumda route rules tekrar güncellenmeli ve `model_routing_log` üzerinden analiz yapılmalı.

### 7.3. Analiz takibi eksikse

Eğer `audit_log` veya `funnel_events` tam dolmazsa:

- hangi karar neden verildiğini izlemek imkânsız hale gelir
- randevu ve lead başarısı ölçülemez
- soru cevap ve hata ayıklama zorluk çıkar

Bu tablolara veri düşürmek, sistemin güvenlik ve operasyonel sürdürülebilirliği için bir zorunluluktur.

---

## 8) Kodlamaya geçmeden önce netleşmesi gerekenler

Bu üç alanı uygulamaya geçmeden önce aşağıdakiler açık ve sabit olmalıdır:

1. `escalations` hangi koşullarda açılacak?
2. `audit_log` event type listesi sabitlenecek mi?
3. `funnel_events` hangi event türleri ile sınırlandırılacak?
4. `lead qualification` sonucu ile route kararları nasıl eşleşecek?
5. `model_routing_log` hangi frequency ile doldurulacak?
6. `business_id` bazlı izleme ve raporlama kimler tarafından görülecek?
7. insan devri için öncelik listesi ve atama kuralı netleşecek mi?
8. `same conversation` tekrar eden mesajların dedupe kuralı olacak mı?

Bu maddeler netleşince, sistem hem güvenli hem izlenebilir hem de maliyet açısından kontrollü hale gelir.

---

## 9) Kısa özet

Bu üç alan bir arada düşünüldüğünde, sistem şöyle işler:

- müşteriler farklı niyet seviyeleriyle gelir
- sistem onları sınıflandırır
- iyi leadler randevu akışına girer
- belirsizlik veya risk varsa insan devri açılır
- her olay izlenir
- model seçimi maliyet ve kalite dengesiyle yapılır
- her karar kayıt altına alınır

Bu sayede sistem sadece "mesaj alıp cevap veriyor" değil; gerçekten iş akışını yönetebilen, izlenebilir ve güvenli bir otomasyon haline gelir.

Bu gereksinim dokümanı, insan devri, analiz/takip ve maliyet kontrolü için gerekli iş mantığını netleştirir. Kodlama öncesinde bu kuralların uygulanabilir ve belgelenmiş olması gerekir; aksi halde sistemin neden bir karar verdiğini izlemek, bir hatayı düzeltmek ve maliyeti kontrol etmek mümkün olmaz.
