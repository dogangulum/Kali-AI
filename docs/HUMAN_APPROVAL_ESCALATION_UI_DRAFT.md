# İnsan Onay ve İnsan Devri için Ekran / Bildirim Taslağı

Bu belge, uygulamanın ileride nasıl görüneceğine dair sözlü bir taslak sunar. Kod yazılmaz; sadece ekran akışı ve bilgi düzeni açıklanır.

## 1) Ana iş listesi / queue ekranı

### Başlık
- `Onay Bekleyen İçerikler`
- `Bekleyen İnsan Devri` (opsiyonel ayrı sekme)

### Gösterim düzeni
Her kart aşağıdakileri gösterir:
- İçerik adı / başlık
- Tür (reel / image / text)
- Hedef işletme / `business_id`
- Durum (`ready_for_review`, `escalated`, `pending approval`)
- Süre / bekleme süresi
- Atanmış kişi (Ayşe / başka saha)
- Hızlı eylem butonu: `Detay`, `Onayla`, `Değiştir`, `Reddet`

### Örnek kart
- `Reel - Güzellik bakım serisi`
- Durum: `ready_for_review`
- Bekleme: `1 saat 12 dakika`
- Atanan: `Ayşe`
- Hızlı işlemler: `Detay | Onayla | Değiştir`

## 2) Onay detay ekranı

### Başlık
- `İçerik İncelemesi`

### Üst bölüm
- İçerik başlığı
- İçerik türü
- Hedef kampanya (varsa)
- `content_item_id` ve `business_id`
- Versiyon bilgisi
- Durum

### Orta bölüm
- Önizleme alanı
  - görsel önizleme
  - video oynatıcı veya thumbnail
  - ses örneği
  - altyazı metni
- Katman listesi
  - visual
  - voiceover
  - subtitle
- Versiyon farkı / notlar
- Üretim promptu / kısa açıklama

### Alt bölüm
- Önceki onay geçmişi
  - 2026-09-22 | Ayşe | Onaylandı
  - 2026-09-21 | Sistem | Değişiklik istendi
- Eylem alanı
  - Onayla
  - Değiştir
  - Reddet
- Değiştir için zorunlu not alanı
- Reddet için zorunlu neden alanı

## 3) İnsan devri detay ekranı

### Başlık
- `Müşteri Devri: Escalated Conversation`

### Üst bilgi alanı
- `conversation_id`
- Kanal: WhatsApp / Instagram
- Müşteri kimliği (maskelenmiş)
- Durum: `escalated`
- Atanan: Ayşe / mevcut kişi

### Orta bölüm
- Son mesaj özeti (son 5-15 mesaj)
- Lead durumu ve skor
- Randevu durumu
- Risk açıklaması
- Sistem karar özeti

### Alt bölüm
- `Açıklama` alanı
- `Mesajı çöz` butonu
- `Randevu oluştur` butonu (gerekirse)
- `İletiği kapat` / `Çözüm kaydet` butonu

## 4) Bildirimler / uyarılar

### Bildirim türleri
- `Yeni onay isteği`
- `Onay gecikti`
- `Değişiklik talebi geldi`
- `İnsan devri açıldı`
- `Escalation çözümleme tamamlandı`

### Bildirim metni örnekleri
- "Yeni içerik onayı: Reel - Güzellik serisi için Ayşe kontrol etmeli."
- "Onay bekleyen 2 içerik var; SLA süresi dolmak üzere."
- "İnsan devri açıldı: müşteri özel başlangıç sorusu ve randevu çakışması var."
- "Escalation çözüldü; yeni randevu kaydı oluşturuldu."

## 5) Queue görünümü ve öncelik sırası

### Her kartta gösterilmesi gerekenler
- başlık
- tür
- bekleme süresi
- aciliyet bandı
- atanan kişi
- hızlı eylem butonu

### Öncelik sırası örneği
1. Escalation açık
2. Randevu için net bilgi bekleyen lead
3. Kampanya teslim tarihi yaklaşan içerik
4. Kısa bekleme süresi olan ama düşük öncelikli içerik

## 6) Basit ekran akışı

- Ana kontrol paneli
  - Onay bekleyen bütün nesneler görünür
  - Escalation listesi görünür
- Kart seçildiğinde detay ekranı açılır
- Kullanıcı karar verir
- Karar sonrası durum güncellenir
- `audit_log` ve `approvals` kaydı arka planda yazılır
- Kuyruk yenilenir

## 7) Son not

Bu taslak, saydam ve minimal bir kullanıcı deneyimi hedefler. Görüntü, önizleme ve kısa bağlam bilgisi çok önemlidir; aksi halde Ayşe karar verirken gereksiz detaylarla uğraşmak zorunda kalır.
