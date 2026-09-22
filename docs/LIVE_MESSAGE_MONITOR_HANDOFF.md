# Canlı WhatsApp mesaj izleme — uygulama devri

Durum: araç uygulandı (scripts/live-monitor.cjs mevcut) ve basit canlı izleme yetenekleri sağlar. Bu belge, aracın beklenen davranışı, çalışma gereksinimleri ve bilinen sınırlamaları ile kabul kriterlerini güncelleyerek uygulama el kitabı görevi görür. AGENTS.md hâlâ gerçek müşteri kimliği/mesajı işleyen kodun sorumluluğunu açıklar; bu araç yalnızca okuma/izleme amaçlıdır.

## İstenen davranış

Kullanıcı WhatsApp test numarasına mesaj gönderdiğinde tek komutla en yeni
gelen mesajları ve hazırlanan cevapları tek ekranda görmek istiyor. Ekranda
kayıt zamanı, yön, müşteri kimliği, içerik ve ilgili model görünmeli. Webhook
güvenlik dosyaları ile veritabanı şema dosyası değiştirilmeyecek.

## Mevcut kaynaklardan doğrulananlar

- `messages`: `id`, `business_id`, `conversation_id`, `direction`, `content`,
  `created_at`. Zaman kayıt zamanıdır; WhatsApp teslim/okunma zamanı değildir.
- `conversations`: kanal `platform`, müşteri kimliği `customer_identifier`.
  Şemada müşteri görünen adı yok; kimlikten isim uydurulmamalı.
- `model_routing_log.message_id`, ana çağrıyı tetikleyen **inbound mesajın**
  kimliğine bağlanır. Model, provider, maliyet ve gecikme bu tabloda bulunur.
- `reply-agent.ts` ve WhatsApp handler'ı cevapları `outbound` olarak kaydeder,
  fakat WhatsApp gönderim API'sini çağırmaz. Bu satırlar **cevap taslağı** diye
  gösterilmeli; gönderildi/teslim edildi olarak gösterilmemeli.
- Outbound satırında inbound'a veya routing kaydına doğrudan cevap ilişkisi
  yok. Aynı konuşmadaki en yakın model kaydını kesin eşleşme gibi göstermek
  hatalı olabilir. Kesin bağlantı olmayan outbound model alanı “doğrudan
  bağlantı yok” olarak açıklanmalı; inbound satırında gerçek model gösterilebilir.
- API hatası veya routing log yazım hatası sonucu model kaydı bulunmayabilir.
  Model alanı “kayıt yok” olmalı; bu tek başına modelin çağrılmadığı kanıtı değil.
- Konuşma özeti çağrısının routing maliyeti mevcut kodda ayrıca kaydedilmiyor.

## Nasıl çalıştırılır

- Komut:
  ```powershell
  npm run monitor:live
  ```
  veya doğrudan:
  ```powershell
  node scripts/live-monitor.cjs
  ```
  (İsteğe bağlı: `node scripts/live-monitor.cjs 25` son 25 mesajı gösterir.)

- Gereksinimler:
  - Ortamda veya `.env.local` içinde `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` olmalıdır.
  - Araç yalnızca okuma (read-only) modunda çalışır; veritabanına yazmaz, mesaj göndermez.

- Çalışma şekli (özet):
  - `messages` tablosundan son N mesaj çekilir; `model_routing_log` tablosundan model/maliyet kaydı eşlenir (message_id ile). `conversations` tablosu platform ve müşteri kimliği için ilişkilendirilir. Zaman gösterimleri yerel saat dilimine göre formatlanır.

## Bilinen sınırlamalar ve öneriler

- Script şu anda mesaj içeriklerini (PII) olduğu gibi konsola bastığı için sadece yetkili ve dikkatli testlerde kullanılmalıdır.
- Script çalıştırıldığında açık bir "son yenileme zamanı" satırı göstermiyor; zamanlar her mesaj için yerel biçimde görünür.
- Kodda dikkat edilmesi gereken bir uygulama notu: `scripts/live-monitor.cjs` içinde Authorization başlığının (`Authorization:`) değerinin düzgün ayarlandığından emin olun. Supabase REST API için doğru kullanım `Authorization: Bearer <SERVICE_ROLE_KEY>` şeklindedir. (Mevcut kaynakta placeholder/redaksiyon veya eksik biçimlendirme hatası bulunabilir; çalıştırmadan önce başlığı doğrulayın.)
- Script uzun/çok satırlı içerikleri otomatik kırmıyor veya terminal kontrol karakterlerini temizlemiyor. Çok uzun içeriklerde görüntüyü sınırlamak veya truncate etmek önerilir.
- Çok sık çalıştırma halinde Supabase REST çağrıları için rate-limit veya maliyet kaydı oluşabilir; canlı test sırasında makul aralıklarla tekrar edin.

## Uygulama ve kabul kontrol listesi

- Canlı bağlantı, yetkilendirme ve işletme kapsamı mevcut proje kurallarıyla
  Claude tarafından belirlenmeli; bu hazırlıkta secret dosyaları okunmadı.
- Yalnız istenen işletmenin WhatsApp konuşmaları okunmalı. Eksik işletme
  kapsamı bütün müşterileri sorgulama sonucunu doğurmamalı.
- Son kayıtlar sınırlı sayıda, kararlı sıralamayla gösterilmeli; aynı zamanlı
  kayıtlar kaybolmamalı. Ekran yenilendiğinde yeni routing kaydı da görünmeli.
- Gelen mesaj ve cevap taslağı açıkça ayrılmalı. Aynı inbound için birden çok
  model kaydı varsa bu durum gizlenmemeli.
- Boş sonuç, bağlantı/yetki hatası ve eksik routing kaydı birbirinden ayrılmalı.
  Eski başarılı ekran yeni veriymiş gibi gösterilmemeli.
- Uzun/çok satırlı içerik ve terminal kontrol karakterleri ekranı bozmamalı.
- Saat dilimi ve son yenileme zamanı görünmeli. İzleme seçeneği eklenirse
  kontrollü sorgu aralığı ve Ctrl+C çıkışı bulunmalı.
- Araç veritabanına yazmamalı, mesaj göndermemeli, log içeriğini varsayılan
  olarak dosyaya kaydetmemeli. Testler sentetik verilerle yapılmalı.
- Belgelerde örnek komut ancak araç gerçekten uygulandıktan sonra verilmeli.

Canlı kabul: test numarasından yeni mesaj gönder → ekranı yenile → inbound
kayıt ve zamanı görünür → routing yazıldığında modeli görünür → outbound
üretildiğinde ayrı “taslak” satırı görünür. Telefona yanıt gelmesi bu aracın
ve mevcut taslak üretim kodunun sağladığı bir özellik olarak sunulmamalı.
