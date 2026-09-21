# Kali Beauty AI — Claude Project Instructions

## Project
Kali Beauty Center için AI destekli pazarlama, içerik, reklam ve Instagram DM satış otomasyonu.

## Primary Goal
Reklam/Reel -> Instagram DM -> nitelikli potansiyel müşteri -> randevu -> müşteri akışını mümkün olduğunca otomatikleştirmek.

## Initial Market
Mersin / Yenişehir ve Mezitli.

## Architecture Rule
Sistem yalnız Kali Beauty'ye özel hard-code edilmemeli.
İşletme adı, konum, hizmetler, fiyatlar, kampanya bilgileri, çalışma saatleri, iletişim bilgileri ve marka ayarları config/veritabanından gelmeli.
Amaç ileride aynı sistemi farklı küçük işletmelere kurabilmek.

## Core Modules
1. Content research and planning
2. Reel/video/image/caption generation workflow
3. Human approval workflow
4. Meta/Instagram advertising workflow
5. Instagram DM sales assistant
6. Lead qualification
7. Appointment handoff/integration
8. Analytics and optimization
9. Model routing and cost control
10. Audit/logging and safety controls

## Approval Workflow
Ayşe içerik onayında insan kontrol noktasıdır.

Temel seçenekler:
- Onayla
- Değiştir
- Reddet

Değiştir seçeneği gerektiğinde şunları ayrı ayrı hedefleyebilmelidir:
- Video
- Görsel
- Altyazı/metin
- Seslendirme

Telegram ileride onay arayüzü olarak kullanılabilir.

## DM Architecture
Instagram/Meta webhook tabanlı tasarla.
Webhook doğrulaması, signature kontrolü, rate limit ve idempotency düşün.
Basit mesajlarda ekonomik/hızlı model; karmaşık mesajlarda güçlü model kullan.
Uzun konuşmalarda rolling summary uygula.
Kalıcı veri için PostgreSQL/Supabase düşünülebilir.
Gerektiğinde konuşmayı Ayşe'ye devret.

## AI Rules
- Kullanıcıya uydurma fiyat, kampanya, randevu veya işletme bilgisi verme.
- Gerçek sistem işlemi yapılmadıysa yapılmış gibi söyleme.
- Harcama doğurabilecek reklam yayınlama/değişikliklerinde açık yetkilendirme katmanı kullan.
- API anahtarlarını source code içine yazma.
- Secrets .env veya uygun secret manager üzerinden gelsin.
- Loglarda secret/credential gösterme.
- Üçüncü taraf entegrasyonlarını modüler tut.

## Development Rules
- Önce mevcut repository ve dosyaları incele.
- Büyük değişiklikten önce plan çıkar.
- Mevcut çalışan parçaları gereksiz yere yeniden yazma.
- Küçük, test edilebilir modüller oluştur.
- Hata durumunda kök nedeni araştır.
- Test/build kontrollerini çalıştır.
- Başarısız testi görmezden gelme.
- Gereksiz dependency ekleme.
- Secret veya credential commit etme.
- Windows path uyumluluğunu koru.

## Claude Working Style
Bir görev verildiğinde:
1. Repository durumunu incele.
2. İlgili dosyaları oku.
3. Uygulama planını oluştur.
4. Uygula.
5. Test et.
6. Hata varsa teşhis edip düzelt.
7. Değişen dosyaları ve test sonucunu kısa özetle.

Kullanıcıdan yalnız gerçekten dışarıdan alınması gereken credential, hesap yetkisi veya geri döndürülemez önemli karar gerekiyorsa müdahale iste.

## Current Status
Bu repository yeni kurulmaktadır.
Henüz Kali Beauty üretim sistemi kurulmuş kabul edilmemelidir.
Meta webhook, Instagram DM otomasyonu, reklam otomasyonu, Supabase ve deployment doğrulanmadan "kurulu" veya "çalışıyor" kabul edilmemelidir.
