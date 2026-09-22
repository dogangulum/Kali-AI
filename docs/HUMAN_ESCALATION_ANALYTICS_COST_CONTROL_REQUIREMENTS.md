# İnsan Devri, Analiz/Takip ve Maliyet Kontrolü Gereksinimleri

Bu belge, proje içindeki mevcut şema ve gereksinim belgeleriyle tutarlı şekilde üç alanı açıklar:

1. Bir konuşmanın ne zaman ve nasıl Ayşe'ye (veya başka bir insan temsilciye) devredileceği
2. Hangi olayların kaydedileceği, funnel'ın nasıl izleneceği ve analiz/raporlama yapılandırmasının nasıl olacağı
3. Hangi yapay zeka modelinin ne zaman kullanılacağına dair kararların nasıl verileceği ve maliyet kontrolünün nasıl yapılacağı

Amaç
- Sistem davranışını güvenli ve izlenebilir tutmak
- İnsan müdahalesi gerektiğinde net bir akış sağlamak
- Model seçimi ve maliyet kontrolünü operasyonel kararlarla bağlantılı hale getirmek

Schema uyumluluğu ve kritik notlar
- `funnel_events.event_type` şema tarafından sınırlandırılmıştır: `reel_view`, `dm_started`, `lead_qualified`, `appointment_booked`, `customer_converted`.
- Bu nedenle `lead_score_updated`, `lead_disqualified`, `appointment_cancelled`, `appointment_confirmed`, `appointment_rescheduled` gibi değerler `funnel_events` için doğrudan kullanılamaz; bunlar `audit_log` üzerinden izlenmelidir.
- `conversations.status` sadece `open`, `closed`, `escalated` değerlerini kabul eder.
- `escalations.status` sadece `open`, `in_progress`, `resolved` değerlerini kabul eder.
- `model_routing_log` sabit sütunlar taşır; JSON payload alanı yoktur. Yalnız `audit_log.payload` JSON'dur. Bir routing satırı çağrı sonucu, token kullanımı, retry veya karar nedeni alanlarını tek başına içermez.

---

## 1) İnsan devri (Escalation) gereksinimleri

### 1.1. İnsan devri niçin gerekir?

Otomatik sistem bazı durumlarda güvenli ve doğru karar alamaz. Aşağıdaki durumlar insan müdahalesi gerektirir:

- müşteri niyeti net değil ama yüksek değerli bir lead potansiyeli var
- fiyat, paket, özel durum veya premium talebi söz konusu
- müşteri agresif, şikâyetçi veya anlatımı çelişkili
- birden fazla niyet aynı anda ortaya çıkıyor
- sistem cevabın güvenli olmadığını düşünüyor
- webhook, veri kaybı veya yapılandırma hatası gibi teknik bir problemin ardından güvenli bir cevap üretilemiyor
- müşterinin özel izin veya hassas özel koşul talebinde bulunduğu durumlar

### 1.2. İnsan devri zamanlaması

Bir konuşma farklı aşamalarda Ayşe'ye devredilebilir:

- doğrudan girişte
- lead qualification sonrası, randevu tamamlanmadan önce
- ihtiyaç netleşmeden önce
- randevu çakışması veya belirsizlikte
- müşteri şikâyeti / itirazında
- otomatik sistemin cevap üretemediği durumlarda

### 1.3. Devri tetikleyen sinyaller

Aşağıdaki koşullar devri tetikler:

- müşteri tek cümlelik değil, uzun ve çok yönlü konuşuyor; net amaç ortaya çıkmıyor
- randevu talebi var ama hizmet, gün, saat veya fiyat bilgisi eksik
- müşteri önceki mesajla çelişkili davranıyor
- fiyat/indirim / promosyon / özel paket isteniyor
- aynı konuşmada birden fazla farklı niyet birlikte görülüyor
- konuşma lead_score ve randevu kararının insan müdahalesine ihtiyaç duyduğunu gösteriyor
- sistemin güvenli davranışı bozuluyor veya `business_config` okunamıyor

### 1.4. Devri tetikleyen örnek senaryolar

#### Senaryo A: yüksek olasılıkla lead ama net bilgi eksik

Mesaj:

"Aslında biraz düşünüyordum, telefonla konuşmak isterim. Hangi saatler uygun?"

Bu durumda:
- lead potansiyeli yüksektir
- sistem tek başına randevu veremez
- insan devri uygundur

#### Senaryo B: müşteri agresif / şikâyetçi

Mesaj:

"Bu kadar pahalıya geliyorsunuz, başka yerde daha ucuz. Siz ne yapıyorsunuz?"

Bu durumda:
- fiyat üzerinde pazarlık / şikâyet riski vardır
- insan müdahalesi gerekir

#### Senaryo C: çoklu niyet

Mesaj:

"Fiyatı öğrenmek istiyorum ama salı günü randevu da ayarlayayım; hafta sonu da olur mu?"

Bu durumda:
- hem bilgi hem randevu niyeti aynı anda gelir
- kararın insan tarafından netleştirilmesi daha güvenlidir

#### Senaryo D: teknik veya veri sorunu

Aşağıdakiler insan devrine işaret eder:

- webhook iletileri bozuk ama müşteri anlamlı şekilde devam ediyor
- mesaj kaydı başarısız oluyor
- `business_config` okunamıyor
- aynı konuşma birden fazla platformdan çelişkili işleniyor

### 1.5. `escalations` tablosu ile veri modeli

`escalations` tablosu şu alanlara sahiptir:

- `id`
- `business_id`
- `conversation_id`
- `reason`
- `status` (`open`, `in_progress`, `resolved`)
- `assigned_to`
- `created_at`
- `resolved_at`

Bu tablonun amacı:

- konuşma neden insan devrine gittiğini kayıt altına almak
- kimin üstlendiğini görmek
- çözüm durumunu takip etmek
- konuşmanın tarihsel akışını izlemek

### 1.6. İnsan devri akışı

Tek tip bir escalation pipeline oluşturulmalıdır:

1. Gelen mesaj alınır ve ilgili `conversation_id` belirlenir.
2. `lead qualification` ve `booking` kontrolü yapılır.
3. Sistem, devreye girip girmeyeceğine karar verir.
4. Devreye girecekse `escalations` kaydı açılır.
5. `status = 'open'` ve `assigned_to = 'Ayşe'` veya atanmış temsilci.
6. `audit_log` içinde `escalation_created` event'i yazılır.
7. İnsan tarafına kısa, net ve bağlamlı bir özet iletilir.
8. İnsan müdahalesi sonrası sonuç ne olursa olsun `status` güncellenir.
9. `resolved_at` yazılır ve gerekli durum güncellemesi yapılır.
10. Gerekirse yeni `lead` veya `appointment` kaydı oluşturulur.

### 1.7. İnsan devri için gerekli bağlam bilgisi

İnsan tarafına iletilecek özet aşağıdakileri içermelidir:

- kanal ve `conversation_id`
- son 5-15 mesajın özeti
- `lead` durumu ve skor bilgisi
- mevcut `appointment` durumu
- istenen hizmet, gün, saat ve fiyat bilgisi
- çakışma / risk bilgisi
- sistemin hangi kuralın devreye girdiği

### 1.8. Devri kapatma ve durum güncellemesi

Bir escalation şu şekilde kapatılır:

- müşteriyle iletişim tamamlandı
- randevu oluşturuldu
- insan takibi gerçekten tamamlandı; sistemin devam edememesi veya hâlâ takip gerekmesi çözüm değildir (bu durumda 1.9 uygulanır)

Kapatıldığında şunlar olur:

- `escalations.status = 'resolved'`
- `resolved_at = now()`
- gerekli `audit_log` kaydı
- gerekiyorsa `funnel_events` veya `lead` güncellemesi

### 1.9. Devredilen konuşmanın beklemede kalması

Özellikle şu senaryolar önemlidir:

- Devredilen bir konuşmaya kimse cevap vermeyebilir.
- Bu durumda oluşturulan escalation `open` veya `in_progress` olarak kalır.
- Sistem otomatik olarak randevu veya lead oluşturmaz.
- `conversations.status` `escalated` olarak kalmalıdır.
- Bu durum bir "çözülmüş" karar değil, "bekleyen insan iş yükü" olarak izlenmelidir.

### 1.10. Güvenlik ve etik kurallar

- müşteri verileri sadece yetkili kişilere görünür olmalı
- aynı müşteri verisi farklı işletmeler arasında karışmamalı
- insan devri, promosyon/indirim dayatması olarak kullanılmamalı
- lead'i insan devri ile kapatmak otomatik onay değildir

---

## 2) Analiz / takip (Tracking and Analysis) gereksinimleri

### 2.1. Neden takip gerekir?

Sistem sadece cevap üretmekle kalmamalı; müşteri akışını ölçmelidir. Bu amaçla hangi olaylar kaydedileceği net olmalıdır.

`funnel_events` tablosu temel müşteri akışı olaylarını kapsar. `audit_log` ise daha geniş sistem olaylarını ve teknik/operasyonel hikâyeyi kaydeder.

### 2.2. `funnel_events` için izin verilen event türleri

Şema tarafından izin verilenler:

- `reel_view`
- `dm_started`
- `lead_qualified`
- `appointment_booked`
- `customer_converted`

Not: `lead_score_updated`, `lead_disqualified`, `appointment_cancelled`, `appointment_confirmed`, `appointment_rescheduled` gibi olaylar `audit_log` içinde izlenir; `funnel_events` için ayrı bir `event_type` eklenmez.

### 2.3. `audit_log` için olay örnekleri

`audit_log` daha geniş ve teknik olayları tutar. Örnek event type'lar:

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

`payload` alanları olaya göre seçilir; aşağıdakilerin tümü her olayda zorunlu değildir.
Örneğin randevu oluşmadan `appointment_id`, lead oluşmadan `lead_id` bilinmez.
Kimlik veya hata ayrıntısı uydurulmaz; ham müşteri metni/secret eklenmez.
`business_id` zaten tablo sütunudur; payload'da tekrar etmek zorunlu değildir.
Olası bağlam alanları:

- `business_id`
- `message_id`
- `conversation_id`
- `lead_id`
- `appointment_id`
- `reason`
- `score`
- `model`
- `status`
- `error_message`
- `actor`
- `channel`

### 2.4. Takip gereken temel akış

Bir konuşma için izlenmesi gereken akış:

1. Mesaj alınır
2. `messages` tablosuna yazılır
3. `conversations` bağlamı bulunur
4. `lead qualification` çalıştırılır
5. `qualification_score` ve `status` belirlenir
6. uygun `audit_log` / `funnel_events` kaydı yazılır
7. gerekli ise `escalations` açılır
8. `appointments` süreci başlar
9. sonuç kaydedilir

### 2.5. Performans takibi

Aşağıdaki metrikler izlenebilir olmalıdır:

- DM başlatma sayısı
- nitelikli lead sayısı
- randevu talebi sayısı
- onaylanan randevular
- iptal sayısı
- insan devrine geçen konuşma sayısı
- lead conversion oranı
- randevu dönüşüm oranı
- müşteri dönüşüm oranı

### 2.6. KPI ve funnel takibi

Hedef funnel şudur:

Reel/Reklam -> DM -> Nitelikli lead -> Randevu -> Müşteri

Bu nedenle her aşamada bir olay tanımlanmalıdır:

- `reel_view`
- `dm_started`
- `lead_qualified`
- `appointment_booked`
- `customer_converted`

### 2.7. Raporlama gereksinimleri

Aşağıdaki raporlar alınabilir olmalıdır:

#### Funnel raporu
- toplam DM sayısı
- nitelikli lead sayısı
- randevu talebi sayısı
- onaylanan randevu sayısı
- müşteri dönüşüm sayısı
- her aşamadaki kayıp oranı ancak aynı kohort, gözlem penceresi ve tekilleştirme tanımlandığında; bağımsız olay sayıları birbirine bölünmez

#### Lead quality report
- her lead için skor dağılımı
- en yüksek ve en düşük skorlar
- lead olma nedenleri
- hangi kanal / içerik tipi daha çok lead verdi

#### İnsan devri raporu
- toplam escalation sayısı
- hangi nedenden dolayı devredildi
- devri kimin çözdüğü
- çözüm süresi
- randevu oluşturulan devir sayısı; ilişkilendirilmiş kayıt yoksa hesaplanamaz

#### Denetim / audit report
- hangi karar ne zaman alındı
- hangi olay neden oluştu
- hangi model / hangi davranış düzeni kullanıldı

### 2.8. Veri gizliliği ve güvenlik

- veri sadece ilgili işletme kapsamı içinde görünmelidir
- müşteri kişisel verileri doğrudan rapor veya log olarak yazılmamalıdır
- `messages.content` ve `customer_identifier` için maskelenmiş, özetlenmiş veya sanal versiyon kullanılmalıdır

---

## 3) Maliyet kontrolü ve model routing gereksinimleri

### 3.1. Neden önemlidir?

Sistem, her mesaj için en güçlü modeli seçmek yerine, doğru durumda doğru modeli seçmelidir. Bu hem maliyet hem de hız açısından kritiktir.

`model_routing_log` tablosu bunun için kullanılmalıdır.

### 3.2. Model routing kararının amacı

- basit, rutin ve düşük riskli mesajlar için ucuz ve hızlı modeli kullanmak
- karmaşık / kritik / insan müdahalesi gereken mesajlar için daha güçlü modeli kullanmak
- maliyet ve kalite dengesi kurmak

### 3.3. Model routing için veri kaynakları

Aşağıdaki bilgiler karar için gereklidir:

- mesajın uzunluğu
- karmaşıklık seviyesi
- lead qualification sonucu
- randevu talebinin ciddiyeti
- müşteri risk seviyesi
- konuşma bağlamı
- önceki mesajların toplam uzunluğu

### 3.4. Hangi durumlarda hangi model?

#### Basit, kısa ve rutin mesajlar
Örnekler:
- merhaba
- fiyat sorusu tek başına
- çalışma saatleri
- adres sorusu

Bu durumda:
- hızlı ve düşük maliyetli model tercih edilir

#### Orta karmaşıklık / iş niyeti taşıyan mesajlar
Örnekler:
- hizmet ve fiyat birlikte soruluyor
- uygun randevu tartışılıyor
- müşteri endişesini anlatıyor

Bu durumda:
- orta seviye model uygun olabilir

Bu bir kalite gereksinimi örneğidir; mevcut routing kodunda ayrı üçüncü bir
“orta model” seçeneği uygulanmış değildir. Rapor kayıtlı provider/model adlarını
aynen gruplar; olmayan bir model katmanı veya fiyat tarifesi türetmez.

#### Yüksek risk / kritik karar gerektiren mesajlar
Örnekler:
- agresif şikâyet
- özel fiyat / özel paket isteniyor
- konuşma çelişkili
- insan müdahalesi gerektiği belirlenmiş

Bu durumda:
- güçlü model kullanılabilir; ancak güvenlik için insan müdahalesi daha güvenli bir seçenek olabilir

### 3.5. `model_routing_log` rolü

`model_routing_log` tablosunda şunlar tutulmalıdır:

- `id`
- `business_id`
- `message_id`
- `provider`
- `model`
- `cost_usd`
- `latency_ms`
- `created_at`

Bu sayede hangi modelin kullanıldığı ve maliyet / gecikme bilgisi açıkça izlenebilir.

### 3.6. Maliyet kontrolü için temel kurallar

- kısa ve basit mesajlarda düşük maliyetli model
- yüksek niyet / yüksek risk mesajlarında güçlü model
- aynı konuşma içindeki tekrar eden işlemler için birden fazla gereksiz model çağrısı yapılmamalı
- model seçimi sadece maliyet değil, güvenlik ve kalite için olmalı

### 3.7. Maliyet kontrolü akışı

1. Mesaj alınır
2. Mesajın kısa / karmaşık / kritik olduğuna karar verilir
3. Lead qualification sonucu ve risk seviyesi değerlendirilir
4. Uygun model seçilir
5. Seçim kararı `audit_log.model_routed` ile izlenebilir; karar vermek henüz ücretli çağrı yapmak değildir
6. Gerçek sağlayıcı denemesi sonuçlandığında bilinen maliyet/gecikme `model_routing_log` içinde izlenir; bilinmeyen maliyet sıfır sayılmaz (mevcut uygulama açıkları bölüm 7.4'te)
7. gerektiğinde raporlanır

### 3.8. Maliyet ve kalite raporları

Aşağıdaki raporlar gerekli olmalıdır:

- kaydedilmiş bilinen maliyet, eksik ölçüm sayısı ve kapsam sınırlaması; fatura toplamı olduğu iddia edilmez
- model bazlı maliyet dağılımı
- ortalama latency
- model bazlı hata / retry / reject oranı ancak model ve deneme sonuçları ilişkilendirilebiliyorsa; mevcut routing sütunları yeterli değildir
- başarılı lead başına maliyet ancak maliyet kapsamı, başarı tanımı ve aynı kohort belirlenmişse; sıfır payda için oran tanımsızdır

### 3.9. Riskler ve korunma

Aşağıda önemli riskler vardır:

- aynı teslimat gereksiz tekrar çağrı üretmesin; yetkili teknik retry ayrı bir gerçek denemedir ve maliyeti gizlenmez
- çok kısa / gereksiz mesajlar için aşırı model çağrısı yapılmasın
- `business_id` ve `conversation_id` kaybı yaşanmasın
- `audit_log` ve `model_routing_log` bütün kararları net şekilde göstersin

---

## 4) Senaryo bazlı boşluklar ve çözüm notları

### 4.1. Ayşe'nin onayı gecikirse

- review task `pending approval` listesinde kalır
- belirli bir SLA aşımında ikinci bir onaycı seçilebilir
- otomatik yayın yapılmaz
- eğer insan tekrar geri dönmezse `conversations.status` `escalated` olarak kalır

### 4.2. Aynı anda iki içerik onay beklerse

- her öğe ayrı `approvals` kaydı olarak işlenir
- öncelik şu sıralamaya göre verilebilir: aciliyet, zaman, iş hedefi, müşteri değeri
- aynı anda birden fazla review ekranı açık olabilir; fakat her cevap ayrı olarak izlenir

### 4.3. İnsan aktarım gerekirken kimse cevap vermezse

- escalation `open` veya `in_progress` olarak kalır
- sistem otomatik olarak lead veya randevu oluşturmaz
- görev listesi / bekleme kuyruğu olarak kalır
- bu durum bir hata değil, insan iş yükü olarak izlenir

### 4.4. `funnel_events` içinde beklenmeyen event türü düşerse

- bu olay `audit_log` içinde kaydedilir
- `funnel_events` listesi değişmez; gereksiz event engellenir

### 4.5. İki işlemin aynı anda çakışması

- örneğin aynı lead için iki randevu oluşturulmaya çalışılırsa
- sistem aynı `lead_id` ve `business_id` için çakışma kontrolü yapmalıdır
- çakışma `audit_log` içinde `appointment_conflict_detected` olarak işlenir

---

## 5) Bütün alanların birlikte çalışacağı veri akışı

1. Gelen mesaj alınır
2. `messages` tablosuna kaydedilir
3. `conversations` bağlamı bulunur
4. `lead qualification` çalıştırılır
5. `audit_log` ve `funnel_events` için uygun olaylar yazılır
6. Risk / belirsizlik / şikâyet varsa `escalations` açılır
7. Model routing kararı verilir; gerçek çağrı sonuçlandığında bilinen ölçümler `model_routing_log` üzerinden izlenir (7.4'teki uygulama sınırlamaları geçerlidir)
8. Randevu gerekiyorsa `appointments` akışı başlar
9. İnsan onayı gerekiyorsa `approvals` işlemi başlatılır
10. Son sonuçlar raporlanır

Bu akış, tek tek görevler gibi değil, aynı anda izlenebilen bir operasyonel döngü olarak düşünülmelidir.

---

## 6) Kısa özet

Bu üç alan birlikte değerlendirildiğinde sistem şöyle işler:

- müşteriler farklı niyet ve risk seviyeleriyle gelir
- sistem onları sınıflandırır
- güçlü leadler randevu akışına yönlendirilir
- belirsizlik veya risk varsa insan devri açılır
- her olay izlenir
- model seçimi maliyet ve kalite dengesiyle yapılır
- her karar kayıt altına alınır

Bu belge, mevcut veritabanı yapısı ve proje kurallarıyla tutarlı şekilde insan devri, analiz/takip ve maliyet kontrolünü tanımlar. Kodlama öncesinde bu kuralların net ve uygulanabilir olması gerekir; aksi halde kararların neden alındığını izlemek ve hata ayıklamak mümkün olmaz.

---

## 7) Analiz ve maliyet incelemesi — 22 Eylül 2026

Bu bölüm analiz/maliyet için önceki genel ifadeleri netleştirir. Olaylar aşağıda
**hedef kabul sözleşmesi** olarak tanımlanmıştır; bugün hepsinin üretildiği
iddia edilmez. Canlı olay yazımı, kalıcı tekilleştirme, atomik kayıt, tenant
sınırları ve bütçe nedeniyle otomatik işlem durdurma tasarımı AGENTS.md gereği
Claude tarafından ele alınmalıdır. Bu çalışmada yalnız belge, sentetik
senaryolar ve çevrimdışı rapor değişmiştir; şema/webhook değişmemiştir.

### 7.1. Bulunan açıklar ve düzeltmeler

| No | Bulgu | Netleştirme |
|---|---|---|
| A01 | Olay, müşteri ve mesaj sayısı birbirine karışıyor | Bir konuşmada on mesaj bir `dm_started` olayıdır. Rapordaki kayıt sayısı benzersiz müşteri değildir. |
| A02 | Reklamdan gelen DM otomatik görüntülenme sayılıyor olabilir | `reel_view` yalnız doğrulanmış kaynak olayıyla; DM'den görüntülenme veya kampanya atfı türetilmez. Toplu 100 görüntülenme tek müşteri olayı değildir. |
| A03 | Lead skoru değişimi qualification ile eş tutuluyor | Her skor değişimi audit; ilk doğrulanmış qualification geçişi funnel. Aynı qualified durumda yeni mesaj yeni qualification değildir. Eşik tanımı lead belgesindeki açık karardır. |
| A04 | Talep, pending teklif, onay aynı randevu metriği | Talep audit; başarılı kesinleşme audit + `appointment_booked`. Teklif veya müşterinin bağlamsız “tamam” mesajı booking değildir. |
| A05 | İptal/ertelemenin geçmiş funnel sayısını silmesi belirsiz | Başarılı iptal/erteleme audit olaylarıdır; geçmiş booking silinmez. Güncel aktif randevu, booked eksi cancelled hesabıyla bulunmaz. |
| A06 | “Müşteri geldi” satış/dönüşüm kabul ediliyor | Geldi bilgisi `customer_arrived` audit; hizmet tamamlanması `appointment_completed` audit. `customer_converted` yalnız işletmenin ayrıca doğrulanmış dönüşüm tanımına göre. Tanım yoksa rapor dönüşüm varsaymaz. |
| A07 | Tekrar teslimat, retry ve yeni talep aynı sayılabilir | Aynı olay yeniden teslim edildiğinde yeni iş olayı yok; gerçekten yeni randevu veya ücretli retry ayrı olaydır. Aynı metin güvenilir tekilleştirme anahtarı değildir. |
| A08 | Zaman ve geç gelen olaylar tanımsız | Rapor `[from,to)` ve verilen saat dilimiyle çalışır. Şemadaki `created_at` kayıt zamanıdır; olay gerçekleşme zamanı/geç yükleme kaynak bilgisi ayrı izlenmeli. Bu rapor olay zamanını yeniden kurmaz. |
| A09 | Dönüşüm/kayıp oranlarının paydası belirsiz | Aynı kohort, gözlem süresi, tekil varlıklar ve atıf olmadan oran yok. Geç dönem randevusu DM sayısından büyük olabilir; bunu negatif kayıp diye sunma. |
| A10 | Eksik tablo ile ölçülmüş sıfır ayrılmıyor | Verilmeyen tablo `not_supplied`; boş dışa aktarım `no_rows`. Olay yazımı yoksa boş kayıt sağlıklı sıfır trafik kanıtı değildir. |
| A11 | Routing log bütün maliyeti/hataları kapsıyor sanılıyor | Mevcut başarılı ana çağrı kayıtları kısmi ölçümdür; özet, başarısız çağrı, log hatası ve cache kullanımı ayrıntıları eksiktir. |
| A12 | Karar ve sağlayıcı denemesi birbiri yerine yazılıyor | `model_routed` kararı; `model_call_failed/retried/rejected` operasyonel audit; gerçek denemenin ölçümü routing. Audit maliyeti routing maliyetine yeniden ekleme. |
| A13 | Null/0, para birimi ve fiyat sürümü belirsiz | Null bilinmiyor, 0 ölçülmüş sıfırdır. `cost_usd` USD tahminidir; TL ile toplanmaz, canlı tarife çekilmez. Tarife güncellemesi geçmiş ölçümü sessizce yeniden fiyatlamamalı. |
| A14 | Maliyet artışı eşiği ve bütçe zamanı yok | Rapor bütçesi açıkça seçilen rapor aralığına aittir; günlük/aylık limit diye kendiliğinden yorumlanmaz. Eşik ve limit ayar olarak verilir, işletme değeri koda gömülmez. |
| A15 | Uyarı otomatik durdurma/ucuz modele geçiş gibi okunabilir | Rapor yalnız tespit eder; iş durdurmaz, model değiştirmez veya olay yazmaz. Eksik maliyette “bütçe güvenli” sonucu vermez. Kritik kalite maliyet uğruna düşürülmez. |
| A16 | Çözülen devir sayısı ve SLA anlık snapshot'tan çıkarılıyor | Güncel status ile çözülme olayı farklıdır. `resolved_at`/durum geçmişi olmadan çözüm süresi veya geçmiş iş yükü hesaplanmaz. |
| A17 | Her audit için tüm kimlikler/hata metni zorunlu | Olaya göre asgari bağlam; kimlik yoksa uydurma yok. Teknik hatalarda ham gövde, müşteri verisi, secret veya sağlayıcı hata metni rapora taşınmaz. |
| A18 | Ana işlem başarılı, log başarısız olduğunda tekrar işleme belirsiz | Log kaybı işi yeniden yürütme gerekçesi değildir. Yazım/onarım ve atomik garantiler Claude tasarımına bırakılır; rapor eksik veriyi tamamlanmış saymaz. |
| A19 | Aynı tür audit ve funnel birlikte iki dönüşüm sayılabilir | `lead_qualified` audit + funnel aynı geçişin iki görünümüdür; sayıları toplanmaz. `appointment_confirmed` ile booked için de aynı kural. |
| A20 | Başarılı API yanıtı başarılı müşteri iletişimi sayılıyor | Taslak üretimi, kaydı, mesaj gönderimi, teslimi, okunması farklıdır. Ücretli çağrı başarıyla dönse bile müşteriye ulaşmamış olabilir. |

### 7.2. Olayların kayıt anı

Bu tablo yeni DB enum alanı eklemez. Audit türleri serbest metinli mevcut
`audit_log` için hedef isimlerdir. İlgili durum değişmeden başarı olayı yazılmaz.
Tekrar gelen aynı geçiş ikinci kez sayılmaz. Teknik tekilleştirme yöntemi bu
belgede uygulanmış kabul edilmez.

| Olay / örnek | Ne zaman | Kayıt yeri / tür | Ne zaman yazılmaz? |
|---|---|---|---|
| Reklam görüntülenmesi | Yetkili kaynaktan tekil görüntüleme kanıtı gelince | funnel `reel_view` | Yalnız DM veya doğrulanmamış reklam iddiası |
| İlk müşteri mesajı | Yeni konuşmanın ilk geçerli inbound mesajı kalıcı kaydedilince | funnel `dm_started` | Read receipt, outbound, aynı konuşmada devam mesajı, kayıt hatası |
| Skor değişimi | Yeni skor değerlendirmesi kalıcı uygulanınca | audit `lead_scored` | Aynı teslimatın tekrarı |
| Lead olma | Doğrulanmış qualification geçişi uygulanınca | audit ve funnel `lead_qualified` | Yalnız fiyat sorusu veya zaten qualified durum |
| Lead uygun değil | Disqualification kararı uygulanınca | audit `lead_disqualified` | Salt düşük skor veya merak nedeniyle |
| Randevu talebi | Anlaşılabilir yeni talep alınca | audit `appointment_requested` | Yalnız fiyat/saat bilgisi veya teklif onayı sanılan belirsiz mesaj |
| Randevu kesinleşmesi | Müşteri onayı, uygunluk ve kalıcı confirmed kayıt başarılıysa | audit `appointment_confirmed`, funnel `appointment_booked` | Pending, çakışma, timeout sonucu belirsizliği |
| Çakışma | Uygunluk denetimi çakışma saptayınca | audit `appointment_conflict_detected` | Sırf aynı gün diye |
| İptal | Mevcut randevu cancelled durumuna başarılı geçince | audit `appointment_cancelled` | “İptal koşulları nedir?”, iptal hatası, zaten cancelled |
| Erteleme | Doğrulanmış yeni tarih/saat değişimi başarıyla uygulanınca | audit `appointment_rescheduled` | Yeni saat dolu; eski randevu kendiliğinden iptal edilmez |
| Müşteri geldi | Yetkili operasyon kaynağı gelişi doğrulayınca | audit `customer_arrived` | Randevu saati geçti diye veya yalnız “geliyorum” mesajında |
| Hizmet tamamlandı | Operasyon tarafından tamamlanma doğrulanınca | audit `appointment_completed` | Yalnız zaman geçti diye |
| Gelmedi | Operasyon ve işletme politikası gelmemeyi doğrulayınca | audit `appointment_no_show` | Şemada no_show appointment status yok; böyle bir status yazılmaz |
| Müşteriye dönüştü | İşletmenin onaylanmış dönüşüm tanımı ilk kez sağlanınca | funnel `customer_converted` | Geliş, booking veya ödeme iddiasından tek başına türetme |
| İnsan devri | Açık devir kaydı başarıyla yaratılınca / çözüm doğrulanınca | audit `escalation_created` / `escalation_resolved` | Aynı açık işin tekrar bildirimi; hâlâ takip gerekirken resolved |
| Model seçildi | Yönlendirme kararı verilince | audit `model_routed` | Bu karar kendi başına routing maliyet satırı değildir |
| Deneme sonuçlandı | Gerçek çağrı ölçümü elde edilince | `model_routing_log` | Çağrı yapılmadıysa sahte ücretsiz satır yazma |
| Hata, yeniden deneme, ret | İlgili teknik sonuç/gerçek retry/ret gerçekleşince | audit `model_call_failed`, `model_call_retried`, `model_call_rejected` | Teknik retryyi yeni müşteri veya yeni booking sayma |
| Maliyet yükseldi | Karşılaştırılabilir dönem/kapsam ve tanımlı artış eşiği aşımı doğrulanınca | audit `cost_increase_detected` | Önceki dönem eksik/0 ve yöntem tanımsızken artış yüzdesi uydurma |
| Bütçe uyarısı / aşımı | Aynı bütçe döneminde eşik ilk geçildiğinde | audit `cost_budget_warning` / `cost_budget_exceeded` | Her rapor yenilemede aynı eşik olayını yeniden yazma |
| Kayıt veya yanıt hatası | İlgili hata gözlenince | audit `telemetry_write_failed`, `reply_store_failed`, `reply_delivery_failed` veya `system_error` | Hata var diye booking/conversion başarı olayı yazma |

Yeniden qualified olma, konuşmayı yeniden açma, kanallar arası eşleme ve
tekrar gelen müşterinin dönüşümü için tekil varlık/dönem politikası ayrıca
kararlaştırılmalı. Bunlar raporda otomatik birleştirilmez veya müşteri sayılmaz.

### 7.3. Rapor ve maliyet değerlendirmesi

- Olay sayıları audit/funnel kaynakları ayrı tutularak sunulur. İptal/erteleme,
  geliş/tamamlama, model hata/retry/ret ve maliyet uyarıları operasyon özetinde
  görünür. Log türü serbesttir; tanınmayan audit türü kaybolmaz, ayrı listelenir.
- Model bazında kayıt payı, bilinen maliyet, eksik ölçüm ve gecikme raporlanır.
  Model çağrı başarısı/kalitesi mevcut sütunlardan hesaplanamaz.
- Günlük dağılım seçilen IANA saat diliminde kayıt zamanına göre gruplanır.
  Kayıtsız günler otomatik sıfır gün diye doldurulmaz. UTC varsayılanı açıkça
  yazılır; DST/ay sonu yerel gün sınırları test edilir.
- Bütçe pozitif USD değeri; uyarı yüzdesi 0'dan büyük ve 100'den küçük olmalı.
  Eşiğe eşitlik uyarıdır; limite eşitlik limit doldu, üstü aşım demektir.
  Eksik kayıt/ölçüm gerçek harcamayı artırabilir; limit altında bilinen toplam
  “güvenli” veya “kalan kullanılabilir kredi” olarak sunulmaz.
- Bütçeye göre yerel rapor sonucu bir **hesaplama**dır; mevcut `cost_*` audit
  kayıtları geçmiş **olay sayıları**dır. Rapor çalıştırmak yeni olay yazmaz.
- Negatif/bozuk maliyet, geçersiz tarih, bilinmeyen funnel türü ve yanlış
  alanlar açık hata üretir. Null/eksik ölçüm desteklenir. Eksik export, atlanmış
  sayfa, duplicate ve log kaybı kimliksiz projeksiyondan otomatik onarılamaz.

### 7.4. Mevcut uygulama ile hedef arasındaki fark

`supabase/functions/_shared/reply-agent.ts` incelemesinde ana model cevabı
alındıktan sonra routing satırı yazılıyor. Ana API çağrısı hata verirse bu
satıra ulaşılmıyor; `foldConversationSummary` içindeki ek model çağrısının
maliyet/gecikmesi de routing'e yazılmıyor. Routing yazım hatası yalnız console'a
gidiyor. Dolayısıyla bugünkü toplam yalnız **kaydedilmiş ana çağrı tahmini**dir.
Fiyat, token/cache ayrıntısı, deneme kimliği, model bazlı hata oranı ve maliyet
başına tekil lead verisi rapordan çıkarılamaz. Üretim instrumentation düzeltmesi
bu işin kapsamında değildir; Claude'a aktarılacak somut uygulama açığıdır.

Senaryo kataloğu: `tests/scenarios/analytics-cost-cases.json`. Her vakanın
gerçekçi bağlamı, kayıt anı, yazılmaması gereken olayları, sentetik metrik
girdisi ve rapor beklentisi bulunur. Testler rapor hesaplarını doğrular;
üretimde olay yazımının çalıştığını kanıtlamaz.
