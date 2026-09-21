# Lead Qualification ve Randevu Akışı Gereksinimleri

Bu belge, projede henüz uygulanmamış iki ana iş akışını netleştirir:

1. Gelen mesajın "gerçek bir müşteri adayı" olup olmadığına karar verme (lead qualification)
2. Randevu talebi geldiğinde sistemin hangi adımları takip edeceği (appointment booking flow)

Amaç, daha sonra bir yazılımcı ya da başka yapay zeka bu akışı kodlamaya başladığında hazır, eksiksiz ve uygulanabilir bir tasarım kitabı elinde olsun.

Bu belge, mevcut projedeki veri modelini (`leads`, `appointments`, `conversations`, `messages`, `audit_log`, `escalations`, `funnel_events` vb.) ve proje kurallarını dikkate alır; yeni mimari karar eklenmez. Sadece mevcut veri yapısıyla uyumlu, açıklayıcı ve kodlanabilir bir gereksinim seti oluşturur.

---

## 1) Hedef ve temel prensipler

### 1.1. Amaç

Sistem, her gelen müşterilik mesajını tek tek değerlendirmeli ve şu üç sınıfa sokmalıdır:

- A) ciddi müşteri adayı (qualified lead)
- B) bilgi sorusu / düşük niyetli iletişim (informational inquiry)
- C) uygun değil / spam / yanlış kanal / insan müdahalesi gereken durum (disqualified / escalated)

Bu ayrım, sadece "mesaj geldi mi?" kontrolüne değil; müşterinin niyetinin, ulaşılabilirliğinin, hizmet uyumunun, bütçe ve zaman uygunluğunun birlikte değerlendirilmesine dayanmalıdır.

### 1.2. Temel ilke

Bir mesaj, yalnızca "hizmet sorusu" olduğu için otomatik lead olarak işaretlenmez. Lead olarak değerlendirme için genelde aşağıdakilerin en az bir kısmı bir arada görülmelidir:

- belirli bir hizmet belirtilmiş olmalı
- istek/niyet açıkça görünmeli
- uygun zaman / uygunluk yaşanıyor olmalı
- müşteri iletişim bilgisi ve istenilen randevu detayları net olmalı
- konuşma, bilgi istemek yerine işlem yapma niyeti taşımalı

### 1.3. Gerekli veri kaynakları

Lead qualification ve randevu akışı kararları şu verilere dayanmalıdır:

- `conversations` tablosu: müşteri kimliği, kanal, durum
- `messages` tablosu: mevzuat, önceki konuşma, geçmiş talepler
- `business_config.config`: hizmetler, fiyatlar, çalışma saatleri, ton, iletişim kuralları
- `leads` tablosu: mevcut lead puanı ve status
- `appointments` tablosu: geçmiş ve gelecekteki randevular
- `audit_log`: kararlar ve nedenler
- `escalations`: insan müdahalesi gereken durumlar

---

## 2) Sınıflandırma modeli

### 2.1. Lead sınıfları

Sistem şu durumları tanımlamalıdır:

- `new`: henüz değerlendirilmeyen mesaj
- `qualified`: ciddi müşteri adayı
- `disqualified`: uygun değil, otomatik olarak kapatılacak
- `converted`: randevu veya satış sonrası müşteri olarak kabul edildi
- `escalated`: insan müdahalesi gerekiyorsa

`leads` tablosundaki `status` alanı bunu temsil eder. `qualification_score` alanı, müşteri adaylığını ölçmek için kullanılır; bu puan 0-100 aralığında olmalıdır.

### 2.2. Eşik değerleri

Önerilen başlangıç eşikleri:

- 0-29: düşük niyet / bilgi sorusu / otomatik kapatma
- 30-59: sıcak ama tamamlanmamış / ek bilgi gerek
- 60-79: güçlü aday / randevu önerilmeli
- 80-100: çok güçlü aday / en kısa sürede randevu veya insan müdahalesi

Bu eşikler başlangıç değeri olarak kullanılabilir; daha sonra gerçek müşteri davranışlarıyla ayarlanabilir.

### 2.3. Üç ana karar tipi

#### A. Niyetli / ciddi lead

Aşağıdaki durumlarda değerlendirme yapılır:

- müşteri belirli bir hizmetten bahsediyorsa
- fiyat ve süre sorusunu sormakla kalmayıp randevu ya da ziyareti hedefliyorsa
- uygun gün/saat belirtmişse
- aynı konuşmada birkaç kez niyet belirtmişse (ör. "ayarla", "gelmek istiyorum", "uğrayabilir miyim?")
- önceden konuşma başlamışsa ve mevcut akış ilerliyorsa

#### B. Bilgi sorgusu / düşük dönüşüm

Aşağıdakiler bilgi sorgusu olarak değerlendirilir:

- sadece "hizmetleriniz var mı?", "fiyat nedir?" gibi soyut sorular
- randevu veya ulaşımlı adım yok
- yazım hatası ve kısa konuşma, karar için yeterli veri yok
- müşteri anlamaya çalışıyor ama işlem yapma niyeti yok

#### C. Uygun değil / insan müdahalesi

Aşağıdaki durumlar otomatik olarak escalated veya disqualified olur:

- müşteri ciddi şekilde uygun değil (ör. sadece merak / sohbet / yanlış kanal)
- uygun tarih ve saat girebilecek bilgi yok ama işin ciddiyetini doğrulamak için insan gerek
- çok belirsiz ve müşteri pratikte randevu almak için gereken bilgiyi vermiyor
- rakip fiyat kıyaslama, indirim dayatması, müşteri şikayeti veya agresif davranış
- söz verdiği halde birden fazla senaryoda çelişen bilgiler

---

## 3) Lead qualification karar kriterleri

Bir mesajın lead olarak işaretlenmesi için sistemin kontrol etmesi gereken başlıca alanlar şunlardır.

### 3.1. Hizmet ilgili mi?

Mesajın içeriğinde aşağıdaki sinyaller mevcutsa ilgili yorumlanır:

- hizmet adı geçiyor: "el bakımı", "epilasyon", "manikür", "bride package" vb.
- müşteri bir hizmetin süresine ve fiyatına bakıyor
- hizmete ilişkin detay sorusu var
- müşterinin ifade ettiği istek bir hizmete tekabül ediyor

Örnekler:

- "El bakımı yaptırmak istiyorum."
- "Lazer epilasyon için fiyat alabilir miyim?"
- "Hizmetleriniz nelerdir?"

Bu mesajlar yöneticiden bağımsız olarak işaretlenebilir.

### 3.2. Niyet açık mı?

Aşağıdaki ifadeler yüksek niyet sinyali verir:

- "İstiyorum", "almak istiyorum", "yaptırmak istiyorum"
- "Randevu almak istiyorum"
- "Bugün/yarın gelebilir miyim?"
- "Ne zaman uygun?"
- "Tamam, onaylıyorum"

Aşağıdakiler daha zayıf sinyal verir:

- "merhaba"
- "fiyat ne kadar?"
- "başka bir şey var mı?"
- "sadece bilgi almak istiyorum"

### 3.3. Uygunluk var mı?

Sistem, müşterinin uygunluk/bağlam bilgisine bakar:

- önceden tanımlı çalışma saatleri içinde mi?
- istenen gün saat randevu için mümkün mü?
- hizmet süresi ile zaman uygunluğu uyuyor mu?
- müşterinin talebi için işin koşulları karşılanıyor mu?

Örnekler:

- Çalışma saatleri dışında randevu istemesi: uygunluk yoksa alternatif sunulmalı
- İstenilen tarih geçmişteyse: uygunluk yoksa yeniden yönlendirme veya insan müdahalesi
- Çok kısa aralıkta aynı müşteri için birden çok randevu çakışması varsa: sorun olarak işaretlenir

### 3.4. Bütçe ve fiyat uyumu

Fiyatın esası olmasa da fiyat/niyet ilişkisi önemlidir:

- "Ne kadar?" tek başına bilgi sorgusu olabilir
- "Fiyat uygun mu, ilk randevuyu alabilir miyim?" daha yüksek niyet
- "Bu fiyat için ne kadar sürede bitiyor?" hizmet uyumu ve niyetin güçlü olduğuna delalettir

Sistem, fiyat ve hizmet açıklamasını veritabanındaki `business_config` ile karşılaştırmalı, yanlış veya uydurulmuş fiyat verme riskini önlemelidir.

### 3.5. Müşteri gerçekten ulaşılabilir mi?

Aşağıdaki bilgiler lead için önemli sinyallerdir:

- WhatsApp veya Instagram üzerinden erişilebilir kanal
- müşteri numarası / kullanıcı adı net
- uygun iletişim bilgisi ve kısa yanıt alınabilirlik

Eksik iletişim bilgisi varsa yapılacak işlem:

- bilgi isteği olarak işaretle
- ek kontakt bilgisi istenmesi gerekli mi kontrol et
- mümkün değilse insan müdahalesi

### 3.6. Mesajın ciddiyeti ve tekrarlar

Aynı konuşmada aşağıdakiler yan yana görülürse güçlü bir lead sinyali oluşur:

- hizmet sorusu
- fiyat sorusu
- uygun tarih sorusu
- "onaylıyorum" veya "tamam" ifadesi
- tekrarlayan kısa mesajlar içeren sıra

Tersine, tek bir "merhaba" ya da tek bir "fiyat ne kadar" değeri yeterli değildir.

---

## 4) Lead qualification puanlama örneği

Aşağıdaki örnek puanlama metodu, kodlanabilir ve test edilebilir bir başlangıç tanımı sağlar.

| Kriter | Puan |
|---|---:|
| Belirli hizmet adı var | +20 |
| Fiyat veya süre bilgisi soruluyor | +10 |
| Randevu / uygun zaman isteği var | +25 |
| "İstiyorum / alacağım / gelecek / randevu" gibi niyet ifadeleri var | +20 |
| Aynı konuşmada 2+ adım ilerleme var | +15 |
| Uygun çalışma saatleri içindeyse | +10 |
| Bütçe ve hizmet uyumu görünüyorsa | +10 |
| Mesaj çok belirsiz / tek cümle | -15 |
| Yalnızca bilgi sorgusu ve işlem niyeti yok | -20 |
| Spam / gereksiz / uygunsuz içerik | -30 |
| Müşteri belirtilen bilgileri vermiyor | -10 |

Bu puanlama, `qualification_score` alanı için temel tekniği verir. Sonuç daha sonra `status` olarak işlenir.

Örnek kararlar:

- Skor 80+: `qualified`
- Skor 50-79: `new` veya `qualified` eşiği için ek kontrol
- Skor < 50: `disqualified` veya `new` (bilgi sorusu)

---

## 5) Lead qualification iş akışı

### 5.1. Bir mesaj alındığında ilk adım

Her yeni inbound mesaj için sistem aşağıdaki adımları takip etmelidir:

1. Mesaj `messages` tablosuna kaydedilir.
2. `conversations` içindeki konuşma bağlamı bulunur.
3. Müşteri için mevcut `leads` kaydı aranır.
4. Mesaj metni ve önceki konuşma birleştirilerek bir "context summary" hazırlanır.
5. Mesajın niyeti, istenen hizmet, zaman ve uygunluk bilgisi çıkarılır.
6. Puanlama fonksiyonu çalıştırılır.
7. `leads` tablosunda yeni veya güncellenmiş kayıt oluşturulur.
8. `audit_log` içine karar kaydı yazılır.
9. `funnel_events` içinde gerekli olaylar düşer.

### 5.2. Mesaj metni analiz edilmesi gereken alanlar

Aşağıdaki bilgiler sistemin çıkarıcı modülü tarafından işlenmelidir:

- müşteri hangi hizmeti soruyor?
- müşteri fiyat mı soruyor, randevu mu istiyor?
- hangi gün / saat isteniyor?
- iletişim bilgisi eksik mi?
- müşteri ikinci kez mesaj atmış mı?
- önceki mesajlar ile çelişen bir durum var mı?
- müşteri agresif mi? istekli mi? cari mi?

### 5.3. Lead karar örnekleri

#### Örnek 1: net ve niyetli

Mesaj:

"Merhaba, el bakımı yaptırmak istiyorum. Bu hafta salı 15:00'da gelebilir miyim?"

Karar:

- hizmet tanımlı
- randevu isteniyor
- gün/saat tarif edildi
- müşterinin niyeti açık
- `qualified` ve `appointment_booking_possible` için uygunluk kontrolü başlatılır

#### Örnek 2: sadece bilgi sorgusu

Mesaj:

"Fiyatlarınız ne kadar?"

Karar:

- fiyat bilgisi soruluyor
- işlem niyeti yok
- `new` veya düşük niyetli lead
- `disqualified` değil, ama otomatik randevu önerisi verilmez

#### Örnek 3: insan müdahalesi gereken durum

Mesaj:

"Birkaç farklı hizmet alacağım ama bunu dünden önce ayarlamak istiyorum, fiyatı düşündüm ama çok kararsızım."

Karar:

- niyet var
- ancak net randevu bilgisi yok
- fiyat/uygunluk belirsiz
- insan onayı gerekebilir
- `escalated` veya `new` + `requires_human_follow_up`

### 5.4. Lead süreci: ne zaman otomatik, ne zaman insan

Otomatik işleyebilecek alanlar:

- hizmet sorularını cevaplamak
- fiyat ve sürenin açıklanması
- çalışma saatlerinin söylenmesi
- uygun saat önerisi sunmak
- randevu talebi varsa uygunluk kontrolü yapmak

İnsan müdahalesi gereken alanlar:

- müşteri gerçekten uygunluk ve niyet kapsamı net değil
- iki farklı hizmet ve tarih arasında çelişki var
- müşterinin konu dışı davranışı, şikâyeti, agresif davranışı var
- otomatik sistem aynı anda iki randevu oluşturma riskini taşıyor
- özel fiyat, özel talep, paketler, bridal, premium değerler gibi kıyaslamalar var

---

## 6) Randevu akışı gereksinimleri

### 6.1. Randevu akışı ne zaman başlar?

Randevu akışı yalnızca aşağıdakilerden biri olduğunda başlatılmalıdır:

- müşteri doğrudan randevu istiyor
- müşteri uygun tarih/saat öneriyor
- sistem, önceki konuşma ve hizmet bilgisine göre uygun bir saat öneriyor ve müşteriden onay istiyor
- müşteri önceki mesajda "tamam, onaylıyorum" diye cevap veriyor

### 6.2. Randevu akışının temel hedefi

Sistem şu üç şeyi aynı anda sağlamalıdır:

1. Müşterinin istediği hizmetin, saatinin ve gününün uygunluğu kontrol edilmeli
2. Birden fazla eşzamanlı randevu oluşmamalı
3. Müşteri net bir onay verdiğinde kayıt kesinleşmeli

### 6.3. Randevu talebi için gerekli bilgiler

Bir randevu talebi için sistemin gerektiği minimum bilgiler şunlar olmalıdır:

- hizmet adı / hizmet tipi
- istenen tarih veya en az bir uygunluk aralığı
- istenen saat veya zaman dilimi
- müşteri kimliği / konuşma bağlamı
- gerekli durumda iletişim ve onay teyidi

Eksikse sistem şu adımları uygulamalıdır:

- hangi bilgi eksik onu sor
- bu bilgi gelmeden kesin randevu oluşturma
- en fazla 1-2 ek soru ile gerekli bilgiyi istemeli

### 6.4. Randevu akışı adımları

Randevu akışı aşağıdaki sırayla ilerlemelidir:

1. Mesajdaki istek anlaşılır mı? (hizmet + tarih + saat)
2. ilgili hizmet `business_config` içinde mevcut mu?
3. istenen saat çalışma saatleri içinde mi?
4. aynı müşteri için çakışan başka bir randevu var mı?
5. aynı gün / saat başka müşteri için uygun mu? (tabloyu kontrol et)
6. müşteri bu hizmet için uygunluk var mı?
7. `appointments` tablosuna bir geçici/öneri kaydı oluşturulabilir mi?
8. müşteri onayı isteği
9. onay gelince `appointments.status = 'pending'` veya `confirmed` olarak işaretle
10. `audit_log` ve `funnel_events` ile kayıtla ilgili süreçleri yaz

### 6.5. Randevu teklif ve onay

Sistem, müşteriye saat önerisi verdiğinde şu yapmalıdır:

- kendi bilgi seti dahilinde, iş saatleri ve hizmet süreleriyle uyumlu öneri sunulmalı
- net gün ve saat yazılmalı
- randevuya yönelik cümle çok belirsiz olmamalı
- if "tamam" cevabı gelirse kesin kayıt yürütülmeli
- "bugün olmaz" gibi cevap gelirse tekrar yeni öneri sorulmalı

Örnek akış:

- "Salı 15:00 uygun mu?"
- müşteri: "Evet, uygundur."
- sistem: `appointments` kaydı oluşturur, `status='pending'` veya `confirmed`
- sistem: müşteriye onay ve işlem özeti gönderir

### 6.6. Kesinleşme kriteri

Kesin randevu şu koşullarda oluşturulmalıdır:

- müşteri açıkça randevu onayı verdi
- istenen saat ve hizmet netleşti
- çalışma saatleri ve hizmet süresi uygun
- başka bir çakışma yok
- müşterinin konuşma bağlamı, sabit bir lead veya konuşma kaydıyla uyumlu

Kesin randevu oluşturulmadan önce müşteri aynı konuşmada "son kararı veriyorum" gibi bir onayı vermelidir.

---

## 7) Çakışma ve aynı anda iki randevu sorunu

Bu durum sistemin en kritik güvenlik kuralıdır. Çakışan randevu oluşturmayı önlemek gerekir.

### 7.1. Aynı müşteri için çakışma

Aynı müşteri için aynı gün içinde iki farklı randevu oluşmamalıdır. Durum şöyle yönetilmelidir:

- `appointments` tablosunda aynı `lead_id` + aynı gün/saat aralığı için başka aktif kaydı kontrol et
- aynı anda iki kayıt bulunursa en son onay kaydı öncelik taşımalı
- eski kayıt iptal edilmeli ve müşteriye çakışma hakkında açıklayıcı mesaj dönülmeli

### 7.2. Farklı müşteriler için çakışma

Sistem yapılacak randevu için servis süresini ve zaman aralığını kontrol etmelidir. Eğer salon / çalışan kapasitesi kısıtlıysa:

- aynı saat diliminde diğer hizmetle çakışma varsa otomatik olarak reddet
- uygun alternatif saatler öner
- aynı anda çoklu randevu alımına izin verilmemeli

### 7.3. Zaman bölümü kontrolü

Sistem, randevu tarih ve saatleri için şu kuralları dikkate almalıdır:

- hizmetin dakika süresi dikkate alınmalı
- iş saatleri dışına randevu oluşturulmamalı
- kritik sonrası / öncesi boşluklar da dikkate alınmalı
- bir hizmet bitiş saati ile bir sonraki randevu başlama saati çakışmamalı

### 7.4. Çakışma durumunda davranış

Aynı anda çakışma tespit edilirse:

- yeni randevu kaydı oluşturulmaz
- müşteri varsa uygun alternatifler sunulur
- aynı saat / gün için ikinci alternatif istenirse sistem netleştirici mesajla cevap verir
- eğer insan müdahalesi gerektiriyorsa `escalations` tablosuna kayıt düşer

---

## 8) Hangi durumlarda insan müdahalesi gerekir?

### 8.1. Otomatik karar vermek güvenli değilse

Aşağıdaki koşullarda sistem, `escalations` yaratmalı ve işi insana devretmelidir:

- müşteri niyetini net ifade etmiyor ama yüksek değerli görünmüyor
- aynı konuşma içinde birden çok çelişkili durum var
- müşteri şartları konusunda belirsiz ve daha fazla soru sorması gerekiyor
- randevu uygunluk kontrolü yapılırken eksik bilgi var
- müşteri şikayet, tartışma, agresif davranış ya da sık tekrar eden mesajlar gönderiyor
- sistem, hizmet ve fiyat tutarsızlığı bulduğunda
- müşteri, fiyat indirimini dayatıyor ya da gerçek olmayan söz istiyor

### 8.2. İnsan devri için örnek durumlar

- "Herhalde gelebilirim, siz uygun bir saat düşünün"
- "Bana en uygun saati söyleyin"
- "Fiyatım biraz düşük geldi, ne yaparsınız?"
- "Bir arkadaşım da gelebilir mi?"
- iki farklı hizmette aynı anda kararsızlık var
- önceki randevu iptali veya değişikliği gerekiyor

### 8.3. Devredilen konuşmanın işaretleri

Escalation kaydı oluştururken şunlar saklanmalıdır:

- `conversation_id`
- `reason`
- `status` (`open`, `in_progress`, `resolved`)
- `assigned_to` (ör. Ayşe)
- `created_at`
- kısa açıklama / not

Bu, cevapın neden insana geçtiğini net ve geriye dönük izlenebilir hale getirir.

---

## 9) Hata ve güvenlik senaryoları

### 9.1. Geçmiş tarih / yanlış tarih

Mesajın içerdiği tarih geçmişteyse:

- kayıt oluşmaz
- müşteri yeni bir uygun tarih önerilmesini ister
- "geçmiş bir tarih verdiniz; lütfen yeni bir uygun gün belirtin" cevabı verilir

### 9.2. Çalışma saatleri dışında istek

Eğer istenen saat işletmenin çalışma saatleri dışında kalıyorsa:

- otomatik olarak uygun saat önerilir
- müşteri önceki günün dışında bir şey isteyip istemediği kontrol edilir
- çalışan saatlerinin dışına kayıt yapılmaz

### 9.3. Hizmet mevcut değil

Müşteri listede olmayan bir hizmetten bahsediyorsa:

- sistem bunu doğrulamaz; uydurmaz
- "bu hizmet şu anda mevcut değil; benzer seçeneklerim var" tarzında net cevap verir
- geçerli hizmetler listelenir
- daha kapsamlı bir teklif için insan müdahalesi gerekebilir

### 9.4. Seans süresi ve hizmet uyumsuzluğu

İstenen saat, hizmet süresi ve iş bitişiyle uyumsuzsa:

- yeni zaman önerisi sunulur
- kesin kayıt yapılmaz
- buna uygun bir alternatifi istemek gerekir

### 9.5. Duygusal / agresif / uygunsuz mesajlar

Sistem, böyle mesajları doğrudan lead olarak değerlendirmemeli:

- yakınlaştırma / kopyalama / hakaret / kaba dil içeren mesajlarda insan müdahalesi uygun olur
- bu mesajlar için `disqualified` veya `escalated` seçeneği uygulanır

### 9.6. Tekrarlanan aynı mesaj / idempotency

Aynı mesajın daha sonra tekrar gelmesi veya aynı istek iki kez farklı kanalda gelirse:

- aynı `conversation_id` ve benzer `message content` için duplikat lead oluşturulmaz
- bir önceki lead veya randevu kaydı güncellenir
- `audit_log` idempotent kayıt yapısı ile kontrol edilir

---

## 10) Lead / randevu status akışı (tam örnek)

Aşağıdaki örnek, kodlamaya başlanırken kullanılabilecek tipik süreci gösterir:

### Senaryo A: net randevu talebi

1. Müşteri mesaj atar: "Salı 15:00 el bakımı için gelebilirim."
2. Sistem mesajı `messages` tablosuna ekler.
3. Konuşma açık mı kontrol eder.
4. Mesaja göre `leads` oluşturur veya günceller.
5. `qualification_score` hesaplar; hizmet + niyet + uygunluk yüksek ise `qualified`.
6. Sistem, çalışma saatleri ve hizmet süresiyle kontroller yapar.
7. Çakışma yoksa `appointments` için öneri veya hazır kayıt oluşturur.
8. Müşteriden onay ister.
9. Müşteri "tamam" derse `appointments.status = 'pending'` veya `confirmed` olarak kaydeder.
10. `funnel_events` içinde `appointment_booked` event'i düşer.
11. `audit_log` içine karar ve randevu kayıtları yazılır.

### Senaryo B: bilgi sorgusu

1. Müşteri: "Fiyatlar ne kadar?"
2. Sistem, `qualification_score` düşük çıkarsa `new` / düşük niyetli lead.
3. `leads.status` hiç `qualified` olmaz.
4. Sistem fiyata dair kısa bilgi verir.
5. Eğer müşteri randevu başlatmazsa, konuşma açık kalabilir, fakat otomatik randevu oluşturulmaz.

### Senaryo C: insan müdahalesi

1. Müşteri: "Acaba çıkış tarihini yazabilir misiniz? Bunu da düşünüyorum ama tam karar veremedim."
2. `qualification_score` orta ama belirsiz.
3. Sistem, randevu tanımına dair hâlâ gerekli bilgi yoksa `escalated` oluşturur.
4. Ayşe'ye iletilir.
5. İnsan nihai karar verir.

---

## 11) `leads` ve `appointments` için minimum ilke seti

Bu iki tablo için kodlamanın temel kuralları şunlardır:

### `leads` tablosu

- her konuşma için en az bir lead kaydı olmalı
- `status` ve `qualification_score` her mesajdan sonra güncellenmeli
- aynı konuşma için duplicate lead oluşmamalı
- lead, konuşma bağlamı ve müşteri kimliği ile eşlenmeli

### `appointments` tablosu

- her randevu tek bir `lead_id` ve `business_id` yönetmelidir
- `scheduled_at` zaman bilgisi mutlaka tam tarih + saat olmalıdır
- `status` geçişleri net olmalı: `pending -> confirmed -> completed/cancelled`
- aynı müşteri için çakışan kayıt yasaklanmalı
- müşteriden açık onay gelmeden kesin randevu oluşturulmamalı

---

## 12) `audit_log` ve izlenebilirlik gereksinimleri

Her lead qualification ve randevu kararı için `audit_log` içine yazılmalıdır.

Örnek event tipleri:

- `lead_scored`
- `lead_qualified`
- `lead_disqualified`
- `appointment_requested`
- `appointment_confirmed`
- `appointment_rejected`
- `appointment_conflict_detected`
- `escalated_to_human`

`payload` içinde shunların saklanması gerekir:

- conversation_id
- lead_id
- message_id
- score
- reason
- customer_identifier
- service_name
- proposed_time
- actor
- created_at

Bu kayıtlar, gelecekte "neden bu karar verildi?" sorusunun yanıtı için çok önemlidir.

---

## 13) İş kuralları ve business-config bağlantısı

Tüm kararlar, kod içinde sabit bir listeye değil, `business_config.config` içindeki verilere dayanmalıdır:

- hangi hizmetler var
- her hizmetin süresi ve fiyatı
- çalışma saatleri
- hangi günler kapalı
- istenen iletişim tonu
- hangi durumlarda insan müdahalesi gerekli

Bu, sistemin her işletme için yeniden konfigüre edilebilir olmasını sağlar.

Yani: lead qualification ve randevu iş akışı, **işletme bilgisi** üzerinden çalışacak şekilde tasarlanmalıdır. Kod hiçbir zaman "Kali için şu hizmetler burada" gibi sabit değerler içermemeli.

---

## 14) Kullanıcı davranış ve iletişim kuralları

### 14.1. Mesaj dili

Sistem, müşteriyle konuşurken şunlara dikkat etmeli:

- net ve kısa olmalı
- gerçek bilgi vermeli
- yanlış fiyat veya yanlış süre uydurmamalı
- "tamam, size uygun bir saat bulalım" gibi açık ve güven veren bir ton taşımalı

### 14.2. Soru sayısı kuralı

Müşteriden gerekli bilgiyi almak için sistem en fazla şu sayıda soru sormalı:

- 1-2 soru ile temel bilgi toplanmalı
- daha fazlası gerekiyorsa insan müdahalesi

Bu, müşteri kaybını ve kafa karışıklığını önler.

### 14.3. Sonraki adım kuralı

Her cevapın sonunda müşteriye net bir sonraki adım verilmelidir:

- "İstediğiniz hizmeti daha net tarif eder misiniz?"
- "Hangi günü tercih ediyorsunuz?"
- "Şuan uygun saatlerimiz: X ve Y, hangisi size uygun?"
- "Bu randevu için onay veriyor musunuz?"

---

## 15) Kısaltılmış karar tablosu

Aşağıdaki tablo, kodlanacak karar mantığının kısa özeti olarak kullanılabilir.

| Durum | Sonuç |
|---|---|
| Belirli hizmet + niyet + uygun saat | `qualified` -> randevu akışı |
| Sadece bilgi sorusu, niyet yok | `new` / düşük niyet; otomatik randevu oluşturma yok |
| Müşteri uygunluk bilgisi vermedi, ek onay gerek | `escalated` |
| Çakışan randevu tespit edildi | yeni kayıt oluşturma; alternatif sun |
| Hizmet yok / yanlış aralık / saat dışı | uygun alternatif sun; kayıt oluşturma |
| Duygusal/agresif/uygunsuz mesaj | `disqualified` veya `escalated` |
| Müşteri açıkça onay verdi | randevu `confirmed` |
| Müşteri onay vermedi | geçici teklif olarak beklemede |

---

## 16) Sonuç ve uygulanacak temel tasarım

Bu belgeyi kodlamaya başlarken temel hedef şudur:

- her mesaj için lead değeri hesapla
- ciddi niyetli müşteriyi `qualified` yap
- düşük niyetli soruları bilgi odaklı tut
- uygunluk ve zaman kontrolüyle randevu oluştur
- insan devri gereken durumları açıkça ayır
- çakışma, eksik bilgi ve tutarsız kararları önle
- her adımın nedenini `audit_log` ile kaydet

Bu, bir kullanıcıya “işte zaten bir otomasyon akışı var” değil; tam tersine, sistemin "gerçekten hangi durumlarda ciddi müşteri olduğuna karar verdiğini, hangi durumlarda insanın devreye girmesi gerektiğini" açıklayan doğru ve test edilebilir bir gereksinim modelidir.

Kod yazımına geçmeden önce, bu gereksinimler doğrultusunda aşağıdaki üç şey netleşmelidir:

1. `qualification_score` hesaplama yöntemi ve eşikleri
2. `appointment` status ve geçiş akışı
3. `escalations` ve `audit_log` kayıt şablonları

Bunlar netleştiğinde sistem, hem gelişmiş lead qualification hem de doğrulanan randevu akışı için pratik olarak kodlanabilir hale gelir.
