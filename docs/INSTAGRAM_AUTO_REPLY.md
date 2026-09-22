# Instagram otomatik yanıtı — devreye alma notu

Kod hazır; migration, deploy, canlı mesaj gönderimi veya Meta ayarı bu çalışma sırasında uygulanmadı.

## Elle yapılacak Meta kontrolü

Meta Developers → ilgili uygulama → Webhooks → Instagram aboneliklerini kontrol edin.
`messages` aboneliği gerekli; panelde `message_echoes` alanı sunuluyorsa bunu da açın.
Amaç, hesabın kendi Instagram uygulamasından gönderdiği mesajların webhook'a ulaşmasıdır.
Menü/alan seçenekleri kullanılan Instagram bağlantı türüne göre farklı olabilir.

Instagram uygulamasında **Ayarlar ve hareketlerin → Mesajlar ve hikâye yanıtları →
Mesaj kontrolleri / Mesaj istekleri → Bağlı araçlar → Mesajlara erişime izin ver
(Allow access to messages)** ayarını kontrol edip açın.

Meta'nın [Instagram webhook referansı](https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram/)
ve [Instagram Messaging başlangıç rehberi](https://developers.facebook.com/docs/messenger-platform/instagram/get-started/)
ilgili resmi başvuru adresleridir. Bu çalışmada resmi sayfalar HTTP 429 döndürdüğü için
güncel panel etiketleri doğrudan doğrulanamadı; belirleyici kontrol aşağıdaki gerçek echo testidir.

Bir test konuşmasında native Instagram uygulamasından yanıt yazın. Webhook'ta hesap
gönderen, müşteri alıcı olmalı; `message.is_echo: true` veya gönderenin `entry.id` ile
aynı olması outbound olarak tanınır. Veritabanında `author=human`, `control_mode=human`
ve bekleyen yanıtların `cancelled` olduğunu doğrulayın. Bu adım tamamlanmadan
Supabase Function secret **`IG_HUMAN_ECHOES_CONFIRMED=true` ayarlamayın**.
Eksik/false olduğunda dispatcher HTTP 503 döner ve gönderim yapmaz; yalnızca
echo gelmemesinden Meta ayarının açık olduğu sonucu çıkarılmaz.

## Devreye alma sırası (Doğan tarafından)

1. Hazırlanmış `20260922120000_instagram_handoff_and_pending_replies.sql`
   migration'ını uygulayın. `pending_replies.status` içinde `processing` de bulunmalı.
2. `instagram-webhook` ve `instagram-reply-dispatcher` fonksiyonlarını deploy edin.
   Webhook'un Meta imza kontrolü korunur; dispatcher için Supabase JWT doğrulamasını açık tutun.
3. Var olan Supabase/business/Anthropic ayarlarına ek olarak `IG_PAGE_ACCESS_TOKEN`
   secret'ını güvenli kanaldan yapılandırın. Mevcut gönderici Facebook Login / Page token
   yolunu kullanır; Instagram Login token'ıyla karıştırmayın.
4. Yukarıdaki native mesaj testini yapıp `IG_HUMAN_ECHOES_CONFIRMED=true` ayarlayın.
5. Yetkili POST istekleriyle dispatcher'ı yaklaşık 10–15 saniyede bir çağıran
   zamanlayıcıyı (ör. pg_cron + pg_net) kurun. Endpoint kendi kendine zamanlanmaz.
   Mesaj, hesaplanan süreden önce gönderilmez; polling aralığı kadar gecikebilir.

## Davranış ve sınırlar

- Müşteri mesajlarında bekleme: 60, 55, 50, …, 15 saniye; 15'te kalır.
- Son müşteri mesajından **30 dakikadan fazla** geçtiyse sonraki bot beklemesi 60 saniyedir.
- Meta `mid`, kayıtlı `platform_message_id` ile eşleşirse tekrar teslimat/kendi echo'su
  olarak atlanır. Aynı metne sahip farklı bir `mid` insan mesajı sayılabilir;
  eşleştirme metin üzerinden yapılmaz.
- İnsan yanıtı konuşmayı devralır, eski bekleyen yanıtları iptal eder.
  Yeni müşteri mesajı gelmeden süre dolması botu yeniden başlatmaz.
- İnsan kontrolünde gelen yeni müşteri mesajı 180 saniye cevapsız kalırsa yanıt gönderilir;
  kontrol bota döner, sonraki bekleme 55 saniyedir. İnsan bu arada yanıtlarsa taslak iptal olur.
- Gönderim öncesi atomik sahiplenme ve son veritabanı kontrolü korunur.
  Meta henüz teslim etmemiş bir insan webhook'unu veritabanı kontrolü göremez.
  Kendi gönderiminin echo'su Send API sonucunun kaydından önce gelirse eşleşmeyen
  echo ihtiyatlı olarak insan devri sayılır; içerik benzerliğine dayanarak yok sayılmaz.
- İşlem `processing` durumundayken süreç çökerse kayıt otomatik yeniden gönderilmez;
  belirsiz teslimatları tekrar kuyruğa almadan önce Meta tarafında kontrol edin.

WhatsApp webhook'u ve `generateAndStoreReply` bu entegrasyonda değiştirilmedi.
