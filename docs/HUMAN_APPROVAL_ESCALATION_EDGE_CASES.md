# İnsan Onay ve İnsan Devri Uç Durum Senaryoları

Bu belge, insan onayı ve insan devri akışındaki en kritik uç durumları gerçek örnekler halinde açıklar. Amaç, uygulama sırasında "bu durumda ne olacak?" sorusunun cevabını netleştirmektir.

## 1) Ayşe onayı gecikirse

### Örnek senaryo
- `content_items.id = C-148` için görsel katmanı hazır hale geldi.
- Ayşe, onay ekranına bakması gereken görev listesine düşmüştür.
- Ancak Ayşe 2 saat boyunca yanıt vermez.
- Aynı gün içinde başka bir kampanya için başka bir içerik de beklemektedir.

### Sistem davranışı
1. Görev `pending approval` listesinde kalır.
2. `approvals` tablosuna ek bir onay kaydı yazılmaz; yalnızca review task aktif kalır.
3. `audit_log` içine `approval_pending` veya `approval_sla_exceeded` gibi kayıt düşülebilir.
4. Eğer iş kuralı belirli bir SLA sonrası ikinci bir onaycıya devretmeyi gerektiriyorsa, `assigned_to` değiştirilebilir.
5. Otomatik yayın yapılmaz.
6. İçerik `ready_for_review` durumunda kalmaya devam eder; yalnızca onay geldiğinde `approved`/`published` adımına geçer.

### Sonuç
- Sistem bekleme modunda kalır.
- İçerik yayına girmeden bekler.
- İnsan devri gerekli değilse bu, sadece "onay bekliyor" olarak izlenir.

## 2) Aynı anda iki içerik onay beklerse

### Örnek senaryo
- `content_items`: C-110 (reel görsel), C-111 (Instagram reklam görsel)
- Her ikisi de review için beklemektedir.
- Ayşe aynı anda ikisini de kontrol etmek ister.

### Sistem davranışı
1. Her içerik ayrı ayrı `approvals` veya review task olarak izlenir.
2. Öncelik listesi şu sıraya göre verilebilir:
   - aciliyet
   - kampanya teslim tarihi
   - müşteri değeri
   - oluşturma zamanına göre eski olanlar
3. Görünüm her bir öğe için ayrı küçük kart olarak gösterilir.
4. Ayşe bir kartı onaylar, diğer kart aynı listede kalmaya devam eder.
5. Her karar ayrı olarak kaydedilir; tek bir "hepsi bir arada onaylandı" eylemi yoktur.

### Sonuç
- Aynı anda çoklu review kabul edilir.
- Ancak her biri ayrı iş olarak izlenir.
- İki onay aynı anda verilebilir; ana kural idempotent ve tek tek kayıtlı olmak zorundadır.

## 3) İnsan aktarım gerekirken kimse cevap vermezse

### Örnek senaryo
- Müşteri, aradığında randevu için çok özel bir saat istiyor.
- Sorumlu sistem, `lead qualification` ve `appointment` bilgilerini toparlayamıyor.
- `escalations` kaydı açılıyor ama Ayşe cevap vermiyor.

### Sistem davranışı
1. `escalations` tablosuna `status = 'open'` veya `in_progress` kaydı düşer.
2. `conversations.status` `escalated` olarak kalır.
3. Sistem otomatik olarak lead veya randevu oluşturmaz.
4. Görev listesi veya inbox kuyruğu üzerinden insan temsilciye görünür hale gelir.
5. `audit_log` içine `escalation_opened` ve `escalation_unassigned` benzeri kayıtlar düşülebilir.
6. Kimse cevap vermezse, müşteri bilgilendirme (ör. "Ekibimiz sizi takip edecek" gibi) yalnızca insan tarafı tarafından yapılmalıdır; otomatik sistem bunu kendi başına not olarak kabul etmez.

### Sonuç
- Bu durum, hata değil; operasyonel beklenti olarak alınır.
- `resolved` olana kadar sistem “bekletme” modunda kalır.

## 4) Değişiklik talebi gelirse ama not belirsizse

### Örnek senaryo
- Ayşe, görsel için "bunu biraz daha iyi yap" diyor.
- Bunun ne anlama geldiği açık değil.

### Sistem davranışı
1. `approvals.action = 'change'` olarak kaydedilir.
2. `notes` alanı boş bırakılmaz; en azından hangi katman, neyin değişmesi gerektiği yazılır.
3. Belirsiz istekler için production promptuna geri dönüş yapılmaz; önce netleştirme gerekir.
4. Yeni sürüm hazırlanırken `content_layers.version` artar ve `status` `pending` veya `generating` durumuna geri döner.

### Sonuç
- Değişiklik talebi, “görsel daha iyi olsun” gibi yüzeysel bir biçimden çok, eksik olan parçayı ve hedefi belirtir.
- Bu, aynı anda yeniden üretim ve yeni review tetikler.

## 5) Aynı lead için iki randevu çakışırsa

### Örnek senaryo
- Aynı kullanıcı için bir randevu zaten var.
- Başka bir iş akışı aynı lead için ikinci bir randevu üretmeye çalışıyor.

### Sistem davranışı
1. `appointments` tablosunda çakışma kontrolü yapılır.
2. Hata durumunda `audit_log` içinde `appointment_conflict_detected` yazılır.
3. Sistem yeni randevu oluşturmaz; mevcut randevu korunur.
4. Eğer farklı bir tarihte ek randevu gerekiyorsa, bu ancak insan müdahalesi veya net onay sonrası yapılır.

### Sonuç
- Çakışma otomatik olarak çözümez; güvenli bir şekilde engellenir.
- Bu durum operasyonel olarak “müşteri üzerinde birden fazla kayıt” riskini önler.

## 6) Onay ardından yeni sürüm gelirse

### Örnek senaryo
- Ayşe görseli onayladı.
- Sonra sistem otomatik olarak başka bir versiyon üretti.

### Sistem davranışı
1. Önceki onay kaydı korunur; yeni kaydın eski kaydı geçersiz sayılma durumu yoktur.
2. Yeni versiyon `content_layers.version` artar, yeni `ready` veya `review` kuyruğuna girer.
3. Eski onay, tarih ve actor bilgisiyle birlikte kalır.
4. Yeni sürüm için tekrar approval akışı tetiklenir.

### Sonuç
- Her versiyon ayrı olarak izlenir; “son onay” ile “eski onay” birbirine karıştırılmaz.

## 7) Gerekli sistem çıktı listesi

Bu uç durumlar için sistem aşağıdaki çıktılarla çalışmalıdır:

- `approvals` kaydı
- `audit_log` kaydı
- `escalations` kaydı
- `conversations.status` güncellemesi
- `content_layers.status` güncellemesi
- görev listesi / pending queue görünümü
- SLA aşım uyarısı (opsiyonel)

## 8) Kısa kural

- Onay gecikirse: yayın yapılmaz, bekleme listesinde kalır.
- Aynı anda çoklu review varsa: ayrı ayrı işlenir.
- İnsan devri boşta kalırsa: sistem otomatik karar vermez; bekleme kuyruğunda kalır.
- Belirsiz change notu: kabul edilmez, netleştirilmeli.
- Çakışan randevu / çakışan review: engellenmeli ve loglanmalı.
