# Script Kısa Rehberi

Bu klasördeki yardımcı script'ler, yerel geliştirme ve webhook doğrulama akışını kolaylaştırmak için hazırlanmıştır. Her biri ayrı bir amaca hizmet eder; üretim kodu değil, test ve kontrol aracı olarak kullanılır.

## 1) check-env.cjs
- Ne işe yarar: `.env.example` ile `.env.local` arasındaki eksik ortam değişkenlerini kontrol eder.
- Çalıştırma:
  ```powershell
  node scripts/check-env.cjs
  ```
- Ne kontrol eder: `.env.example` içinde yer alan değişkenlerden `.env.local` içinde olmayanları listeler.
- Dikkat: gerçek secret'leri okumaz; sadece değişken adlarını karşılaştırır.

## 2) check-webhooks.cjs
- Ne işe yarar: canlı/uzak webhook URL'leri için doğrulama token kontrolü yapar.
- Çalıştırma:
  ```powershell
  node scripts/check-webhooks.cjs --log-file .logs/webhook-check.log
  ```
- Ne kontrol eder:
  - doğru token çözümleniyor mu?
  - yanlış token reddediliyor mu?
  - token eksikse reddediliyor mu?
  - yanlış hub.mode reddediliyor mu?
- Dikkat: Supabase Functions URL'i ve token'ları `.env.local` veya ortam değişkenlerinden okur; yerel localhost değil, uzak endpoint hedefi olabilir.

## 3) run-local-tests.cjs
- Ne işe yarar: webhook'ların yerelde çalıştığını, GET doğrulamasını, POST imzasını ve temel HTTP davranışını test eder.
- Çalıştırma:
  ```powershell
  npm run test:local
  ```
  veya
  ```powershell
  node scripts/run-local-tests.cjs
  ```
- Ne yapar:
  - Node.js sürümünü kontrol eder
  - mevcut Node davranış testlerini çalıştırır
  - Deno 2'nin erişilebilir olduğunu doğrular
  - `deno run` ile WhatsApp ve Instagram webhook'larını yerelde başlatır
  - örnek JSON fixture'ları gönderir
  - 200 / 401 / 403 / 429 gibi beklenen HTTP yanıtlarını kontrol eder
- Dikkat: gerçek Meta veya Supabase ile konuşmaz; yalnızca yerel localhost:8000 üzerinden sahte test istekleri gönderir.

## 4) simulate-webhook.cjs
- Ne işe yarar: manuel olarak tek bir sahte webhook isteği gönderir.
- Çalıştırma:
  ```powershell
  node scripts/simulate-webhook.cjs tests/fixtures/whatsapp-text-message.json
  ```
  Bozuk imza ile:
  ```powershell
  node scripts/simulate-webhook.cjs tests/fixtures/instagram-image-message.json --bad-signature
  ```
- Ne yapar:
  - belirtilen JSON fixture dosyasını okur
  - gerçek HMAC-SHA256 imzası oluşturur
  - `http://localhost:8000/` adresine POST gönderir
  - yanıtı konsola basar
- Dikkat: bunu kullanmadan önce ayrı bir terminalde webhook sunucusunu başlatmak gerekir (ör. Deno run komutu). Bu script gerçek Meta/Supabase yerine yerel sunucuya istek atar.

## 5) dry-run.cjs
- Ne işe yarar: `tests/fixtures/` altındaki tüm örnek mesajları tek seferde gerçek webhook akışı üzerinden sahte/deneme modda çalıştırır.
- Çalıştırma:
  ```powershell
  node scripts/dry-run.cjs
  ```
- Ne yapar:
  - `tests/fixtures/` içindeki tüm JSON örneklerini sırayla okur
  - her birini Webhook suite üzerinden gerçek kod akışıyla çalıştırır
  - sahte Supabase mock'ı ve sahte Anthropic yanıtı kullanır
  - gelen mesajın veritabanına kaydedilip kaydedilmediğini, model yönlendirmesini ve taslak cevap üretimini izler
  - çıktıda HTTP durumunu, yönlendirme kararını ve oluşturulan taslak cevapları gösterir
- Dikkat: Bu araç gerçek bir Meta webhook, gerçek Supabase proje veya gerçek Anthropic API anahtarı kullanmaz; tamamen kuru/deneme modundadır. Ama aynı test harness'i kullanır; bu yüzden gerçek üretim akışının davranışını yansıtır.
- Amaç: "Gerçek anahtar olmadan bütün sistemi deneme" amacıyla oluşturulmuştur; güvenlik riski olmadan, yerel ortamda akışın genel davranışını görmek için kullanılır.

## 6) live-monitor.cjs
- Ne işe yarar: Canlı test sırasında en son gelen/giden mesajları ve model routing kararlarını, Supabase'den okuma modunda gerçek zamanlı olarak izlemek için kullanılır. Amacı canlı bir WhatsApp/Instagram testini izlemek ve "mesaj kaydedildi mi / hangi model kullanıldı / hangi taslak oluştu?" sorularına hızlı yanıt vermektir.
- Çalıştırma:
  ```powershell
  npm run monitor:live
  ```
  veya doğrudan:
  ```powershell
  node scripts/live-monitor.cjs
  ```
  İsterseniz son N mesajı da parametre olarak verebilirsiniz:
  ```powershell
  node scripts/live-monitor.cjs 25
  ```
- Ne yapar:
  - `messages` tablosundan en son kayıtları çeker
  - `model_routing_log` tablosundan model maliyet ve gecikme bilgilerini alır
  - `conversations` tablosunu ilişkilendirerek platform ve müşteri kimliğini gösterir
  - çıktıda bir zaman çizelgesi (timeline) hazırlar
  - sadece okuma yapar; yazma, gönderim veya sürüm değişikliği yapmaz
- Dikkat: Bu araç gerçek müşteri kimliği ve mesaj içeriği görüntüleyebilir; test sırasında gerçek kişisel veri görünebilir. Kısacası "read-only canlı izleme" aracıdır. Geliştirme/deneme sırasında kullanılan harici anahtar ve müşteri bilgileri yine de güvenli ortamda tutulmalıdır.

## 7) check-readiness.cjs
- Ne işe yarar: Yerel geliştirme ortamının hazır olup olmadığını (dosyalar, JSON geçerliliği, Node.js/Deno sürümleri, ortam değişkenleri) toplu kontrol eder.
- Çalıştırma:
  ```powershell
  node scripts/check-readiness.cjs
  ```
- Ne kontrol eder:
  - Gerekli dosyaların varlığı ve boş olmaması (`package.json`, `deno.json`, `.env.example`, `.env.local`, Supabase yapılandırması, webhook fonksiyonları, testler, fixture'lar, belgeler)
  - `.json` uzantılı dosyaların geçerli JSON olup olmadığı
  - Node.js sürümünün >= 22.13 olması
  - Deno 2'nin PATH üzerinde erişilebilir olması
  - `check-env.cjs` aracılığıyla ortam değişkeni adlarının `.env.local` içinde bulunması
- Dikket: Bu araç yalnızca yerel dosya ve sürüm kontrolleri yapar; canlı bağlantı, kimlik doğrulama, AI akışı, Supabase bağlantısı veya üretim hazırlığını doğrulamaz. Sadece "yerelde geliştirmeye başlanabilir mi?" sorusuna kısmi cevap verir.

## 8) chat-simulator.cjs
- Ne işe yarar: Gerçek API anahtarı olmadan terminalde canlı canlı sohbet simülasyonu yapar. Gerçek yönlendirme mantığı (classifyComplexity) çalışır, sahte AI cevabı verir.
- Çalıştırma:
  ```powershell
  # Etkileşimli mod
  node scripts/chat-simulator.cjs
  
  # Senaryo numarası ile doğrudan çalıştırma (1-6)
  node scripts/chat-simulator.cjs 1
  node scripts/chat-simulator.cjs 3
  ```
- Ne yapar:
  - Lead/Randevu, İçerik/Reklam, Fiyat/Bilgi, İtiraz/Pazarlık, İnsan Desteği konularında hazır senaryolar sunar
  - Her mesaj için konu etiketi, model yönlendirmesi (Haiku/Sonnet), yönlendirme nedeni ve sahte cevabı gösterir
  - Fixture dosyalarından tek mesaj testine de izin verir
- Dikket: Gerçek internet/API anahtarı KULLANMAZ; sadece sistemin "hissini" almak içindir.

## 9) run-all-checks.cjs
- Ne işe yarar: Tüm kontrol araçlarını (check-env, check-webhooks, check-readiness, check-business-info) tek komutla art arda çalıştırıp özet rapor verir.
- Çalıştırma:
  ```powershell
  node scripts/run-all-checks.cjs
  node scripts/run-all-checks.cjs --verbose
  node scripts/run-all-checks.cjs config/business-config.example.md
  ```
- Ne yapar:
  - Zorunlu kontrolleri (check-env, check-readiness) her zaman çalıştırır
  - İsteğe bağlı kontrolleri (check-webhooks, check-business-info) uygun koşullar sağlanıyorsa çalıştırır
  - Her kontrol için geçiş/başarısız/atlandı durumunu ve süreyi gösterir
  - Sonunda özet rapor verir (toplam, geçen, başarısız, atlanan)
- Dikkat: check-webhooks için SUPABASE_FUNCTIONS_URL ve token'lar, check-business-info için form dosyası argümanı gereklidir.

## Hızlı kullanım sırası

Yerel webhook çalıştırma ve doğrulama için önerilen sırayla:
1. `node scripts/check-env.cjs`
2. `node scripts/run-local-tests.cjs`
3. Sorun varsa, tek örnek için `node scripts/simulate-webhook.cjs <fixture.json>`

## Not

Bu script'ler geliştirme/test amacıyla yazılmıştır; kod tarafında canlı üretim entegrasyonu, gerçek Meta akışı ya da veritabanı işlemi beklenmez. Gerçek üretim ortamında kullanılmadan önce projedeki güvenlik kuralları ve ortam değişkenleri tekrar kontrol edilmelidir.
