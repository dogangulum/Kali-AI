# Teknik Terimler Sözlüğü / SSS

Bu belge, projede geçen teknik terimleri günlük dil ile açıklamak için hazırlanmıştır. Teknik bilgiye yeni başlayan biri bile anlayabilsin diye sade anlatım kullanılmıştır.

## Genel kavramlar

### API
- Bir sistemin başka bir sistemle konuşmasını sağlayan arayüz.
- Basitçe: "uygulama A, uygulama B'ye istek atar ve cevap bekler" demektir.
- Bu projede Meta ve WhatsApp/Instagram webhook'ları bu şekilde çalışır.

### Webhook
- Bir olay olduğunda otomatik olarak tetiklenen çağrı.
- Basitçe: "birisi mesaj gönderince, sistem otomatik olarak haber alır" demektir.
- Projede WhatsApp ve Instagram'dan gelen mesajlar webhook ile gelir.

### Endpoint
- Bir web adresi, bir API uç noktası.
- Basitçe: “burası sistemin dinlediği kapı”dır.
- Meta webhook'ları bu adrese gelir.

### Public HTTPS endpoint
- İnternette erişilebilen, güvenli (https) web adresi.
- Basitçe: "Meta'nın dışarıdan ulaşabileceği güvenli bir adres" demektir.
- Bu proje için zorunludur, çünkü Meta webhook'ları dışarıdan bu adrese ulaşır.

### Rate limiting
- Aynı IP veya kullanıcıdan çok fazla istek gelirse, kısa süreli olarak durdurma.
- Basitçe: “çok sık istek gelirse bir süre bekletme” demektir.
- Projede webhook'larda istek sayısı sınırlanır.

### HMAC-SHA256
- Bir mesajın değiştirilmediğini doğrulayan güvenlik yöntemi.
- Basitçe: “gönderenin mesajı imzaladığını ve alıcının bunun aynı olduğundan emin olmasını sağlar.”
- Projede `X-Hub-Signature-256` başlığı ile kullanılır.

### Signature (imza)
- Mesajın doğru ve değişmeden geldiğini gösteren kod.
- Basitçe: “mesajın, gizli bir anahtarla imzalanmış olması” demektir.
- Meta webhook'larında bu imza doğrulanır.

### Verify token
- Doğrulama için kullanılan özel değer.
- Basitçe: “bunu bilmeyen biri webhook doğrulamasını geçemez” demektir.
- Meta GET doğrulama aşamasında kullanılır.

### Challenge
- Doğrulama sırasında sunucuya gönderilen sayı/karakter dizisi.
- Basitçe: “server, doğru token gelince geri döndürülen doğrulama değeri”dir.
- Meta webhook doğrulamasında kullanılır.

### JSON
- Veri taşıma için kullanılan metin formatı.
- Basitçe: “anahtar: değer” şeklinde yapılandırılmış veridir.
- Webhook payload'ları çoğunlukla JSON olarak gelir.

### Payload
- Gelen veri gövdesi.
- Basitçe: “webhook tarafından taşınan gerçek veri paketi” demektir.

## Platform ve sistemler

### WhatsApp Business API
- WhatsApp'tan iş hesabı üzerinden mesaj alma/gönderme sistemidir.
- Projede müşteri mesajlarını almak için kullanılır.

### Instagram Messaging API
- Instagram DM üzerinden görüşme akışını yönetmeye yarayan sistemdir.
- Projede müşterilerin Instagram DM'lerinden gelen mesajlar burada yakalanır.

### Meta
- Facebook ve Instagram altyapısını yöneten şirket/ekosistem.
- Projede Meta webhook/mesaj sistemi kullanılır.

### Supabase
- PostgreSQL tabanlı bir geliştirme ve veri platformudur.
- Projede veritabanı ve RLS gibi temel veritabanı işlevleri için kullanılır.

### PostgreSQL
- Güçlü açık kaynak ilişkisel veritabanı sistemi.
- Projede mesaj, konuşma, lead, randevu ve içerik verileri burada tutulur.

### Deno
- JavaScript/TypeScript için modern bir runtime ortamıdır.
- Projede webhook handler'ları Deno ile çalışır.

### Node.js
- JavaScript çalıştırma ortamıdır.
- Projede test araçları ve bazı yardımcı script'ler Node.js ile çalışır.

### Oracle Cloud VPS
- Sunucu/host hizmeti.
- Projede backend ve webhook sunumu için kullanılacak hedef ortamdır.

### Docker / Docker Desktop
- Uygulamaları kapsülleyip çalıştıran ortam.
- Yerel Supabase kurulumu için kullanılır.

### Reverse proxy
- Gelen web trafiğini bir sunucuya yönlendiren ara katman.
- Basitçe: “internet ile uygulama arasına yerleşen kapı” demektir.
- HTTPS ve güvenli erişim için kullanılabilir.

## Veritabanı ve veri kavramları

### Database / veritabanı
- Bilgilerin düzenli şekilde saklandığı sistem.
- Projede mesajlar, konuşmalar, reklam kampanyaları, içerikler ve leadler burada tutulur.

### Schema
- Veritabanındaki tablo yapıları ve ilişkiler.
- Basitçe: “hangi tablo ne işe yarar, hangi alanı içerir?” demektir.

### Business
- İşletme kaydı.
- Projede bir iş yerinin kimliği ve özel bilgileri tutulur.

### Business_id
- Her iş yerinin tekil kimliği.
- Basitçe: “hangi işletmeye ait olduğumuzu gösteren ID”dir.
- Webhook mesajları bu ID ile işlenir.

### business_config
- İşletmeye özel ayarlar için tutulan yapı.
- Mesela hizmetler, fiyatlar, çalışma saatleri, konuşma tonu, dil gibi bilgiler burada tutulur.

### Conversation
- Bir müşterinin işletmeyle olan konuşma akışı.
- Basitçe: “müşteriyle yapılan tek bir görüşme zinciri”dir.
- Her müşteri için bir konuşma kaydı olabilir.

### Message
- Bir konuşma içindeki tek mesaj.
- Projede müşteriden gelen mesajlar `inbound`, sistemden giden mesajlar `outbound` olarak işlenir.

### Inbound / outbound
- Inbound: dışarıdan içeri gelen mesaj.
- Outbound: sistemden dışarı giden mesaj.
- Projede gelen müşteri mesajları inbound, cevaplar outbound olabilir.

### Lead
- Potansiyel müşteri / satış adayı.
- Basitçe: “ilgi gösteren ama henüz müşteri olmayan kişi” demektir.

### Appointment
- Randevu kaydı.
- Lead’den randevuya dönüşümün kaydedildiği yer.

### Audit log
- Yapılan işlemlerin kaydı.
- Basitçe: “ne oldu, ne zaman, kim yaptı?” gibi bilgi deposudur.

### RLS (Row Level Security)
- Her kullanıcının yalnızca kendi satırlarını görmesini sağlayan güvenlik kuralı.
- Basitçe: “bir işletmenin verileri başka işletmenin görmediği şekilde korunur.”

### JWT
- Kullanıcı veya sistemin kimliğini taşıyan token.
- Basitçe: “bana ait olduğuma dair güvenli bir kart” demektir.

### Service role key
- Veritabanına özel yetkili erişim anahtarı.
- Basitçe: “backend sistemler için özel, yüksek yetkili anahtar”dır.
- Projede webhook’lar bunu kullanır.

### customer_identifier
- Müşteriyi tanımlayan benzersiz değer.
- WhatsApp'ta telefon numarası, Instagram’da kullanıcı ID olabilir.
- Böylece aynı müşteri aynı konuşma içinde bir arada tutulur.

### conversation_id / message_id
- Konuşma ve mesajların benzersiz kimlikleri.
- Bu sayede tek tek kayıtlar izlenebilir.

## İçerik ve reklam üretimi

### Content item
- Üretilen içerik kaydı.
- Basitçe: “bu reklam/örnek içerik ne?” kaydıdır.
- Tek bir içerik parçası için master satırdır.

### Content layer
- İçeriğin ayrı katmanları.
- Örnekler: görsel, video, seslendirme, altyazı.
- Projede “Değiştir” seçilirse sadece ilgili katman yeniden üretilir.

### visual
- Görsel katmanı.
- Reklamın fotoğrafı veya video çekimi gibi unsurları ifade eder.

### voiceover
- Seslendirme katmanı.
- Reklamda konuşan sesin metni/ses kaydıdır.

### subtitle
- Altyazı katmanı.
- Video içinde görünen metinlerdir.

### approval
- İnsan onayı.
- Basitçe: “bu içerik uygun mu? değiştirilmeli mi? reddedilmeli mi?”
- `Onayla / Değiştir / Reddet` akışı budur.

### ad campaign
- Reklam kampanyası.
- Basitçe: “yayımlanacak reklam serisi veya kampanyanın kaydı”dır.

### KPI
- Başarı ölçümleri.
- Örnek: DM sayısı, lead sayısı, randevu sayısı, satış, maliyet.

### Funnel
- Müşteri akışının basamakları.
- Projede temel akış: Reel/Reklam → DM → lead → randevu → müşteri.

### Model routing
- Hangi modelin hangi mesaj için kullanılacağını belirleme.
- Basitçe: “kısa ve basit bir mesajı ucuz modelle, zor bir mesajı güçlü modelle işleme” anlamına gelir.

### Prompt caching
- Tekrarlayan talep/istemleri önbellekte tutma.
- Maliyet ve zaman düşürmeye yarar.

### Multi-tenant
- Birden fazla işletmenin aynı sistemi paylaşması.
- Basitçe: “bir yazılım birden çok iş yerine hizmet eder.”
- Proje bunun için tasarlanmıştır.

## Güvenlik ve operasyon

### Secret
- Gizli bilgi, ör. API anahtarı, token, şifre.
- Asla Git’e yazılmaz.

### .env
- Ortam değişkenlerinin saklandığı dosya.
- Projede API anahtarları burada tutulur.

### .gitignore
- Git’e eklenmemesi gereken dosyaları listeleyen dosya.
- Basitçe: “bunu Git takip etmesin” demektir.

### CI / test pipeline
- Kod değişikliğinde otomatik olarak testlerin çalıştığı akış.
- Basitçe: “kod değişince otomatik kontrol yap” demektir.

### Mock / fixture
- Gerçek sistem yerine örnek veri ve sahte payload.
- Testler için kullanılır.

### Localhost
- Bilgisayarda yerel olarak çalışan adres.
- Örnek: `http://localhost:8000/`.

### Log
- Sistem olaylarını yazan kayıtlar.
- Basitçe: “ne oldu, neden oldu?” izini gösteren metinlerdir.

### Environment variables
- Çalışan uygulamanın içine verilen ayar değişkenleri.
- Örnek: `META_APP_SECRET`, `KALI_BUSINESS_ID`.

## Metin ve işleyiş örnekleri

### Parse etmek
- Gelen veriyi anlamlandırıp uygun alanlara ayırmak.
- Webhook payload içindeki `message.text` gibi alanları çıkarmak buna örnektir.

### Extract etmek
- Veriden istenen bilgi parçalarını çıkarmak.
- Örnek: müşteri telefon numarası ve metin mesajı çıkarımı.

### Persist etmek
- Veriyi kalıcı olarak kaydetmek.
- Projede mesajın databases yazılması buna örnektir.

### Serialize / stringify
- Nesneyi metin haline getirmek.
- Özellikle loglama ve JSON göndermede kullanılır.

### Handler
- İstekleri alan ve işleyen fonksiyon/parça.
- Webhook handler’ı gelen mesajı kontrol edip işleyen kısımdır.

## Kısacık örnek açıklamalar

### “Webhook güvenliği” neden önemli?
- Çünkü sahte istekler gelebilir.
- Bu yüzden imza kontrolü ve rate limiting yapılır.

### “Lead qualification” ne demek?
- Müşterinin gerçekten satış için uygun olup olmadığını değerlendirmek.
- Basitçe: “bu kişi gerçek potansiyel müşteri mi?” sorusunun cevabıdır.

### “Randevu iş akışı” nedir?
- Müşterinin iletişim kurmasını, uygun zamanın seçilmesini ve randevu kaydının yapılmasını sağlayan akıştır.

### “Human approval” neden gerekir?
- İnsan kararıyla içerik veya kampanya onaylamak daha güvenli ve doğru sonuç verir.

### “Multi-tenant” neden önemli?
- Bir sistemin birden fazla iş yerine hizmet etmesini sağlar.
- Böylece kod özel işletme bilgisi içermez; her iş yerine ayrı ayarlar verilir.

## Kısa özet

Bu projede en önemli kavramlar şunlardır:
- webhook: gelen mesajların otomatik yakalanması
- signature: güvenli doğrulama
- rate limiting: aşırı istekleri durdurma
- Supabase: veritabanı ve saklama alanı
- business_config: işletmeye özel ayarlar
- conversations/messages: müşteri konuşmaları ve mesajlar
- leads/appointments: satış ve randevu süreci
- content_items/content_layers: içerik üretimi ve katmanlar
- approvals: insan onayı
- ad_campaigns: reklam kampanyaları
- funnel_events: dönüşüm ve KPI takibi

Bu kavramları bilmek, projeyi okumayı ve ileride geliştirmeyi çok kolaylaştırır.
