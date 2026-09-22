# İçerik & Reklam Üretimi — Uç Durum Senaryoları (Gerçek Örnekler)

Bu belge, içerik üretimi ve reklam üretim hattındaki en kritik uç durumları gerçek örneklerle listeler. Amaç, "Bu durumda ne olacak?" sorusuna açık, uygulanabilir cevaplar vermektir.

Not: tüm örnekler mevcut veritabanı şeması ve proje kuralları ile uyumludur; `business_id` her olayda örtük olarak mevcuttur.

1) Asset yükleme başarısız (format/bozulma)

Örnek:
- `content_layer.id = L-201` (visual) için 4K .mov dosyası yüklendi, ancak hedef platform için çok büyük ve yüklemede hata oluştu.

Davranış:
- Üretim pipeline'ı hatayı yakalar, `content_layers.status` = `error_upload` veya `pending` (implementasyona bağlı) ile işaretlenir ve `audit_log` içine `asset_upload_failed` event'i düşer.
- Onay akışı tetiklenmez.
- Üreticiye (model veya insan) bir hata mesajı, gereken format/limit bilgisi ile gönderilir.
- İçerik listesinde kart üzerinde hata etiketi görünür.

2) Ses ve altyazı senkronizasyonu hatası

Örnek:
- Voiceover hazır, subtitle üretildi; oynatıldığında altyazı zamanlaması yanlış ve CTA metni videonun dışında kalıyor.

Davranış:
- QC adımında teknik kontrol hatayı tespit eder.
- `content_layers` (voiceover veya subtitle) reddedilir (`status = 'rejected'`) veya `change` talebi ile not girilir.
- `approvals` kaydı `action='change'` ile oluşturulur; `notes` içinde "subtitle timing off by 1.2s" gibi net talimat olur.
- Yeniden üretim tetiklenir; sadece subtitle katmanı yeniden üretilir.

3) Fiyat / hizmet bilgisi yanlış gösterildi

Örnek:
- Görselde "Lazer epilasyon 50 TL" yazıyor, ama `business_config`'a göre fiyat 150 TL.

Davranış:
- İçerik doğruluk kontrolü (manual veya otomatik) hatayı yakalar.
- `approvals` içinde `action='reject'` veya `change` ile kayıt düşülür; `audit_log` içinde `content_accuracy_issue` kaydı oluşur.
- İçerik hiç yayımlanmaz; yeniden düzenleme ve yeni review beklenir.
- Bu tür hatalar, eğer test ortamında CSV import veya otomatik prompt üzerinden gelmişse, prompt ve veri kaynakları gözden geçirilir.

4) Telif / hak ihlali tespit edilmesi

Örnek:
- Kullanılan müzik parçası lisanssız ve otomatik telif kontrolü 3. parti API ile ihlal raporu verdi.

Davranış:
- QC derhal içeriği `rejected` yapar ve `audit_log` içine `copyright_violation` kaydı düşürür.
- İçerik yayına asla çıkmaz, ilgili asset karantinaya alınır.
- İnsan onayı ile alternatif lisanslı müzik önerilir veya müzik kaldırılır.

5) Çoklu katman tutarsızlığı (metin vs. ses farklı mesaj söylüyor)

Örnek:
- Visual katmanda %20 indirim yazarken seslendirme indirimden söz etmiyor; altyazı farklı bir CTA gösteriyor.

Davranış:
- QC aşamasında içerik uyumsuzluğu tespit edilir.
- Eğer tutarsızlık küçükse `change` talebi (hangi katmanda ne değişecek) ile işaretlenir.
- Eğer tutarsızlık mesajın özünü bozuyorsa `reject` edilir.
- `approvals` içinde `change` veya `reject` kaydı oluşturulur; notes zorunludur.

6) Ayşe onayı gecikirse (kampanya başlangıcı yaklaşmış)

Örnek:
- Kampanya için onay gereken içerik var; yayına başlama zamanına 2 saat kaldı. Ayşe onay vermedi.

Davranış:
- Sistem SLA kontrolü varsa `audit_log` içine `approval_sla_exceeded` düşer.
- Otomatik devreye alınmaz.
- Opsiyonel: önceden konfigüre edilmiş ikincil onaycıya (ör. "Editor") devredilebilir.
- Acil durumda manuel müdahale gerekeceği bildirilir.

7) İki katman aynı anda değişiklik bekliyor; biri approve diğer change istiyor

Örnek:
- Visual katmanı onaylandı; voiceover için change istendi. Kampanya için tüm katmanların approved olması gerekiyor.

Davranış:
- Campaign publish engellenir; `ad_campaigns` status `draft` kalır.
- Sadece approved tüm katmanlar olduğunda campaign `active` yapılabilir.
- `audit_log` ve `approvals` kayıtları ayrı ayrı tutulur.

8) Meta reklam politikası nedeniyle kampanya reddedildi

Örnek:
- Oluşturulan kampanya hedef kitle veya görsel içeriği Meta politikalarına takıldı; campaign create request reddedildi.

Davranış:
- `ad_campaigns.status` = `draft` veya `rejected` olarak güncellenir.
- `audit_log` içine `campaign_create_failed` ve Meta'nın hata mesajı kaydedilir.
- İnsan müdahalesi ile görsel/metin güncellenip tekrar gönderilir.

9) Asset URL erişilemez hale geldi (CDN problemi)

Örnek:
- Yayın sırasında asset_url 404 dönüyor.

Davranış:
- `funnel_events` event olarak `content_publish_failed` veya `asset_unavailable` düşürülür.
- Kampanya duraklatılır (`ad_campaigns.status = 'paused'`) ve ekip uyarılır.
- Asset yeniden yüklendiğinde campaign tekrar aktif hale getirilebilir.

10) Yeniden üretim sonsuz döngüsü / maliyet patlaması

Örnek:
- Onaycı sürekli küçük değişiklikler istiyor; her değişiklik model çağrısı maliyet arttırıyor.

Davranış:
- Maliyet kontrol mekanizması (`model_routing_log` + cost thresholds) bu davranışı tespit eder.
- Opsiyonel alarm: "excessive_retries" `audit_log` içine düşer.
- İnsan müdahalesi ve maliyet limitleri devreye girer: ör. 3. yeniden üretimden sonra insan onayı zorunlu ve üst yöneticiye rapor edilir.

11) Hedef KPI bekleneni vermedi — after-publish performance düşük

Örnek:
- Yayınlandıktan sonra DM oranı beklenenin altında kaldı; içerik performansı düşük.

Davranış:
- Analytics ve `funnel_events` verisi toplanır; `model_routing_log` ve campaign metadata incelenir.
- Geri bildirim ile yeniden A/B içerik üretilir.
- Eğer problem brief'ten kaynaklanıyorsa brief güncellenir ve yeni içerik üretilir.

12) İcraatta gizlilik/PII sorunu (müşteri görüntüsü izinsiz kullanılmış)

Örnek:
- Video içinde gerçek müşterinin yüzü izinsiz kullanılmış.

Davranış:
- Acil `retract` planı uygulanır: içerik yayından kaldırılır, campaign durdurulur, `audit_log` içine `privacy_breach` kaydı düşer.
- İlgili kayıtlar, insan onayı ve yasal prosedür başlatılır.

---

Her bir senaryo için temel prensipler:
- Hata asla otomatik yayın olarak telafi edilmez.
- Her kritik hata `audit_log` içine kaydedilir.
- Onay/Değiştir/Ret kararları `approvals` tablosuna kaydedilir ve versiyon bazlı izlenir.
- Maliyet ve tekrar çağrıları `model_routing_log` ile izlenir; limit aşımı durumunda insan müdahalesi gereklidir.

Bu liste başlangıç için kritik uç durumları kapsar; uygulamaya geçmeden önce ek senaryoların (yerel regülasyon, platform politikası güncellemeleri vb.) değerlendirilmesi önerilir.