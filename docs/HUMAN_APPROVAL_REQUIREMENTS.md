# İnsan Onay Akışı — Gereksinimler (Onayla / Değiştir / Reddet)

Bu belge, mevcut repo içindeki veri modeli ile tutarlı şekilde insan onay akışını tanımlar. Yeni bir teknoloji ya da yeni bir tablo tasarımı eklenmez; mevcut şema ve iş kuralları içinde net, uygulanabilir adımlar yazılır.

Amaç
- İçerik üretim hattında bir katmanın / içeriğin yayımlanma öncesi insan onayı şartını güvenli şekilde kurmak.
- Her eylemin izlenebilir, denetlenebilir ve geriye dönük incelenebilir olmasını sağlamak.
- İlk insan onayı sahibi olarak Ayşe kullanılacaktır; bu kişi konfigüre edilebilir ama süreç aynı kalır.

Schema uyumluluğu ve kritik notlar
- `approvals.action` alanı mevcut şema ile sınırlıdır: `approve`, `change`, `reject`.
- `approvals.target_type` alanı mevcut şema ile sınırlıdır: `content_item`, `content_layer`, `ad_campaign`.
- `content_items.status` için mevcut değerler: `draft`, `researching`, `generating`, `ready_for_review`, `approved`, `published`.
- `content_layers.status` için mevcut değerler: `pending`, `generating`, `ready`, `approved`, `rejected`.
- Bu nedenle "review requested" gibi ayrı bir eylem tipi veya `needs_change` / `pending_change` gibi status değeri eklenmez; değişiklik talebi kayıt için `approvals.action = 'change'` ve açıklayıcı `notes` kullanılır.
- Değişiklik istenen katman için üretim yeniden başlatılır; `content_layers.version` arttırılır ve yeni satır / yeni sürüm oluşturulur. Bu durum, `status` olarak ayrı bir yeni state yaratmak yerine `pending` veya `generating` ile işaretlenir.

İlgili veritabanı tabloları
- `content_items`
- `content_layers`
- `approvals`
- `audit_log`
- `ad_campaigns` (varsa kampanya bağlamı)

Ne zaman devreye girmeli
1. İçerik katmanı üretimi tamamlandığında:
   - `content_layers.status` = `ready`
   - veya `content_items.status` = `ready_for_review`
2. İnsan tarafından manuel olarak onay isteği başlatıldığında:
   - üretimin tamamlanması gerekmez; ancak yayımlama öncesi zorunlu onay adımı yine vardır.
3. Değişiklik talebi sonrası yeni sürüm hazır olduğunda:
   - yeni `content_layers.version` kullanılır ve tekrar review kuyruğuna girer.

Tam akış
1. Üretim tamamlanır ve içerik / layer hazır hale gelir.
2. Sistem, ilgili hedefe göre bir review task oluşturur.
   - review task, `approvals` tablosuna doğrudan `action = 'change'` ile istek kaydı olarak yazılabilir; ayrı bir `request_review` tipi yoktur.
   - Minimum tanım: `target_type`, `target_id`, `action = 'change'`, `notes = 'Review requested'` veya daha açıklayıcı açıklama.
3. Ayşe veya atanmış onaycı bilgilendirilir.
   - Bildirim kanalı uygulamaya bırakılır; gereklilik sadece "onay için queue / notification" olmasıdır.
4. Onay ekranı gösterilir.
   - Eğer çoklu katman varsa, her katman ayrı ayrı önizlenir; bir katman tek tek incelenebilir.
5. Onaycı eylem seçer:
   - `approve`
   - `change`
   - `reject`
6. Sistem eylemi işler:
   - `approvals` tablosuna kayıt eklenir.
   - `audit_log` içine önemli olay kaydı yazılır.
   - Durum güncellemesi yapılır:
    - `approve`: `content_layer.status = 'approved'` ve/veya `content_item.status = 'approved'`; yayın adımı için hazır bileşenler işaretlenir.
    - `change`: ilgili katman için yeniden üretim başlatılır; `content_layer.status` `pending` veya `generating` olarak güncellenir; `notes` içinde net değişiklik talebi yazılır. `content_item.status` `generating` veya `draft` gibi geri dönüş durumlarına çekilebilir.
    - `reject`: `content_layer.status = 'rejected'`; `content_item.status` uygun şekilde `draft` veya `researching` olarak düzenlenebilir; sebep `notes` içinde saklanır.
7. Değişiklik talebi sonrası yeni sürüm eklenir.
   - `content_layers.version` artırılır.
   - yeni önizleme hazır hale gelir.
   - review akışı yeniden başlar.

Önizleme ve onay ekranında gösterilmesi gereken bilgiler
- İçerik düzeyi
  - `content_items.topic`
  - `content_items.content_type`
  - bağlantılı `ad_campaign_id` varsa kampanya bağlamı
  - `business_id` / iş yeri kapsamı
  - üretim zamanı ve son güncelleme
- Katman düzeyi
  - `layer_type`
  - `version`
  - `asset_url`
  - kısa önizleme (thumbnail / oynatıcı / metin)
  - üretim prompt veya özet açıklama
  - önceki sürüm ile fark özetine dair notlar (varsa)
- Önceki onay geçmişi
  - `approvals` tablosundaki önceki eylemler
  - kim ne zaman ne yaptı, işlenmiş notlar
- Net eylem butonları
  - Onayla
  - Değiştir
  - Reddet

Kayıt / izlenebilirlik gereksinimleri
- Her onay eylemi `approvals` tablosuna yazılmalı.
- `actor` alanı güvenli şekilde kullanıcı kimliği / kısa ad / e-posta gibi tanımlı bir değer olmalı.
- `notes` alanı gerekirse değişiklik isteklerini veya nedenleri açıkça açıklamalı.
- `audit_log` içine önemli olaylar kaydedilmeli; örnek `event_type` değerleri: `approval_requested`, `approval_approved`, `approval_changed`, `approval_rejected`, `content_review_started`.
- `audit_log.payload` JSON içinde en az şunlar bulunmalı:
  - `business_id`
  - `target_type`
  - `target_id`
  - `action`
  - `actor`
  - `notes`
  - `content_item_id` varsa
- Bu akış, `RLS` ve yetkilendirme sınırları içinde çalışmalıdır; uygulama katmanı uygun service role veya yetkili kullanıcı kimliği ile güncelleme yapmalıdır.

Gerekli iş kuralları ve eksik senaryolar
1. Ayşe cevap vermezse
   - öğe `pending approval` listesinde kalır.
   - belirli bir SLA aşımı varsa ikinci bir onaycı veya insan temsilciye düşürme mekanizması devreye girebilir.
   - bu durum otomatik olarak `approved` veya `published` yapılmaz; sistem güvenli şekilde bekleme modunda kalır.
2. Aynı anda iki içerik onay beklerse
   - her kayıt ayrı ayrı bir `approvals` row'u olarak işlenir.
   - öncelik, yaratılma zamanı, aciliyet veya iş hedefi üzerinden verilir.
   - aynı anda çoklu review ekranı açık olabilir; ancak tek bir hakkı da geçerli userdata olarak işlenmelidir.
3. Aynı eylem tekrar tekrar gönderilirse
   - işlem idempotent olmalı.
   - aynı `target_id`, aynı `action` ve aynı `actor` için tekrar ekleme yapılmamalı. Zaten açık olan review taleplerine ikinci kez aynı karar eklenmemeli.
4. Değişiklik talebinde netlik yoksa
   - `notes` alanı zorunlu olmalı.
   - "daha iyi olsun" gibi belirsiz notlar kabul edilmemeli; anlatım şunları içermeli: hangi katman, hangi sorun, ne değişmeli.
5. Reddet veya değişiklik kararı sonrası üretim durdurulmalıdır
   - `reject` sonrası otomatik yayın yapılmaz.
   - `change` sonrası yeni üretim için gerekli prompt / notlar saklanır.

Kullanıcı deneyimi / uyarılar
- Onay ekranı, hızlı önizleme ve kısa açıklamayı birlikte göstermelidir.
- Not alanı kısa ama net olmalıdır; belirsiz terimler kullanılmamalıdır.
- Onaycı bir akışı başkasına devretme seçeneğine sahip olabilir ama bu yalnızca ekran düzeyindeki UX detayıdır; veri modeli aynı kalır.

Güvenlik, uyumluluk ve gizlilik
- Hiçbir onay/uygulama adımı CLAUDE.md’deki kritik uyarıları bozmaz.
- `approvals.actor` kaydı kişisel veri olarak değil, güvenli bir kullanıcı kimliği / kullanıcı adı olarak tutulur.
- İçerik önizleme veya loglarda müşteri içeriği ve özel veriler doğrudan görünmemelidir; gerekirse maskelenmiş / özetlenmiş gösterim kullanılır.

Raporlama / takip
- `Pending approvals` görünümü olmalı.
- approvals tablosu üzerinden rapor üretilebilmeli:
  - ortalama onay süresi
  - reddetme oranı
  - yeniden üretim sayısı
  - en çok değiştirilen katmanlar

Kısa özet
- Onay akışı: üretim tamamlandı → review task oluşturuldu → Ayşe değerlendirir → `approve` / `change` / `reject` → approvals ve audit_log yazılır → içerik durumu güncellenir → gerekiyorsa yeni sürüm üretimi başlatılır.
- Yalnızca arayüzde "Önizleme / Bildirim / Karar" olmakla kalmaz; her işlem veri modelinde de açık şekilde audit edilebilir olmalıdır.
- Bu süreçte asla otomatik yayın yapılmaz; yayın, ayrı bir adım olarak yönetilir.

Bu gereksinim belgesi, mevcut veritabanı şeması ve proje kurallarıyla tutarlı biçimde insan onay akışını tanımlar. Kod yazma amacı yoktur; amaç, uygulamaya geçmeden önce herkesin aynı süreç ve veri modelini görmesi ve aynı sonuca ulaşmasıdır.