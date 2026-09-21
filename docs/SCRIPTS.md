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

## 6) check-readiness.cjs
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

## Hızlı kullanım sırası

Yerel webhook çalıştırma ve doğrulama için önerilen sırayla:
1. `node scripts/check-env.cjs`
2. `node scripts/run-local-tests.cjs`
3. Sorun varsa, tek örnek için `node scripts/simulate-webhook.cjs <fixture.json>`

## Not

Bu script'ler geliştirme/test amacıyla yazılmıştır; kod tarafında canlı üretim entegrasyonu, gerçek Meta akışı ya da veritabanı işlemi beklenmez. Gerçek üretim ortamında kullanılmadan önce projedeki güvenlik kuralları ve ortam değişkenleri tekrar kontrol edilmelidir.
