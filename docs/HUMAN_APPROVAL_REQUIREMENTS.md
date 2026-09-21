# İnsan Onay Akışı — Gereksinimler (Onayla / Değiştir / Reddet)

Bu belge, CLAUDE.md ve docs/PROJECT_HANDOFF.md dosyalarında tanımlanan "İnsan Onay Akışı" (Onayla / Değiştir / Reddet) gereksinimlerini, proje dosyalarındaki mevcut veri modellerine bağlı kalarak net ve uygulanmaya hazır biçimde sıralar. Yeni mimari kararlar eklenmez — sadece mevcut açıklamalar düzenlenir.

Amaç
- İçerik üretim hattında insan onayını sistematik hale getirmek: insan onayı olmadan bir içerik katmanının (visual / voiceover / subtitle) yayımlanmaması.
- Her onay veya değişiklik isteğinin izlenebilir, denetlenebilir ve geriye dönük incelenebilir olması.
- İlk insan onayı sahibi: Ayşe (belgelerde adı geçen onaycı). Onaycı listesi konfigüre edilebilir olmalı, fakat bu belge sadece süreç ve gösterilecek bilgileri tanımlar.

İlgili veritabanı tabloları (projede zaten var)
- content_items (master içerik kaydı: topic, content_type, status)
- content_layers (layer_type: visual/voiceover/subtitle, version, asset_url, status)
- approvals (target_type, target_id, action ∈ {approve, change, reject}, notes, actor, created_at)
- audit_log (opsiyonel olarak önemli olayların kaydı)

Ne zaman devreye girmeli
1. Otomatik üretim tamamlandığında: bir content_layer üretimi tamamlandığında (ör. status = 'ready' veya 'ready_for_review'), onay akışı tetiklenmelidir.
2. İnsan tarafından manuel başlatıldığında: üretim tamamlanmadan da onay isteği başlatılabilir (ör. taslak görüntüleme), ancak yayımlama öncesi zorunlu kabul edilen adım yine onaydır.
3. Yeniden üretim ("Değiştir" isteği) tamamlandığında: yeni versiyon yüklendiğinde onay akışı yeniden tetiklenir.

Hangi adımlar izlenmelidir (adet adım şeklinde)
1. Üretim tamamlanır ve content_layer.status = 'ready' veya content_item.status = 'ready_for_review' set edilir.
2. Sistem otomatik olarak (ve/veya üretici araç tarafından) approvals tablosuna bir "review requested" (action = 'change' veya özel bir request-review tipi) kaydı ekleyebilir; en azından bir review event loglanmalıdır.
3. Atama / bildirim: ilgili onaycı(lar) (ilk etapta Ayşe) bilgilendirilir. Bildirim kanalı konfigüre edilebilir (e-posta / yönetim paneli/Telegram) — burada bildirim gereksinimi belirtilir, somut kanal uygulaması implementasyona bırakılır.
4. Onay ekranı gösterimi: onaycı içerik katmanını inceler (aşağıdaki “Gösterilmesi gereken bilgiler” bölümüne bakınız).
5. Onaycı bir eylem seçer:
   - Onayla (Approve)
   - Değişiklik isteği (Request Change / Değiştir)
   - Reddet (Reject)
6. Sistem onayı işler:
   - approvals tablosuna bir satır eklenir: target_type ('content_item' veya 'content_layer'), target_id, action ('approve'|'change'|'reject'), notes (freeform), actor (onaycı adı/id), created_at.
   - İçeriğin durumu güncellenir:
     - Approve: content_layer.status -> 'ready' / content_item.status -> 'approved' (iş akışına göre) ve yayın adımına (ad_campaigns oluşturma / publish) hazır olarak işaretlenir.
     - Change: content_layer.status -> 'needs_change' veya 'pending_change'; notes içinde değişiklik yönergeleri saklanır; sistem ilgili üretim pipeline'ı tetikleyebilir.
     - Reject: content_layer.status -> 'rejected' ve content_item.status uygun şekilde set edilir; sebep notes içinde saklanır.
   - audit_log içine bir kayıt yazılmalı (event_type = 'approval', payload = { target, action, actor, notes }).
7. Değişiklik istendiğinde: üretim takımına (otomatik model veya insan üretici) net yönergeler iletilir; yeni versiyon yüklendiğinde (content_layers.version ++), adım 1'e geri dönülür.

Gösterilmesi gereken bilgiler (onay ekranı)
- Content item seviyesi
  - Başlık / konu (content_items.topic)
  - İçerik türü (reel, image, text) ve hedef kampanya (varsa ad_campaigns bilgisi)
  - İşletme kimliği / KALI_BUSINESS_ID (kimin için üretildiği)
  - Oluşturulma zamanı ve üretim notları
- Content layer seviyesi (her bir katman ayrı gösterilmeli)
  - Katman türü (visual / voiceover / subtitle)
  - Versiyon numarası
  - Önizleme bağlantısı (asset_url) — görsel/video thumbnail, audio oynatıcı, altyazı metni
  - Oluşturan (model veya insan), otomatik üretilme zamanı
  - İlgili üretim parametreleri / prompt metni (kopya veya özet)
  - Son değişiklik/diff özet (varsa)
- Kampanya / yayım bilgisi (eğer content_item ad_campaigns ile ilişkilendirildiyse)
  - Hedef kitle kısa bilgisi, bütçe/plan (özet)
- Önceki onay geçmişi
  - approvals tablosundan önceki eylemler: kim, ne zaman, notlar
- Net yapılacak eylemler için butonlar ve kısa uyarı metinleri
  - Approve (Onayla): "Bu içerik yayımlansın / kampanyada kullanılsın"
  - Request Change (Değiştir): kısa not alanı (zorunlu) + hangi katmana değişiklik gerektiği seçeneği
  - Reject (Reddet): zorunlu sebep alanı

Kayıt / izlenebilirlik gereksinimleri
- Her onay eylemi approvals tablosuna yazılmalı (target_type, target_id, action, notes, actor, created_at).
- Önemli olaylar audit_log içine de yazılmalı (event_type, payload JSON, created_at) — böylece opsiyonel olarak dış denetim yapılabilir.
- RLS politikaları nedeniyle uygulama sunucusu, uygun service-role veya yetkili kimlik ile bu güncellemeleri yapmalıdır.

İş kuralları / istisnalar
- Onay insanı yoksa (Ayşe ulaşılmazsa) onay bekleyen öğeler queue içinde beklemeli; acil durumlar için ikinci dereceden onaycı konfigüre edilebilmeli (implementasyona bırakılır).
- Onay verildikten sonra içerik **otomatik** olarak canlı hesapta yayımlanmamalıdır; manuel kampanya başlatma veya ayrı bir deployment adımı gerektirir. (CLAUDE.md içindeki “production reklam kampanyalarına dokunma” kuralı hatırlanmalıdır.)
- Onay/Değiştir akışları idempotent olmalı: aynı eylem tekrarlanırsa çift kayıt veya çifte yayın önlenmeli.
- Versiyon yönetimi: her yeni üretim sürümünde content_layers.version artırılmalı; approvals sadece ilgili versiyonla ilişkilendirilmeli.
- Değişiklik talepleri açık, eyleme geçirilebilir ve spesifik olmalıdır (ör. "görselin arka planı daha açık olsun; yazı fontu değişsin; seslendirme daha hızlı konuşsun").

Kullanıcı deneyimi / uyarılar (kısa)
- Onay ekranı, hızlı önizleme (thumbnail, kısa oynatıcı) + tam dosyaya erişim sağlamalı.
- Not alanları sınırlı uzunlukta olmalı ama açıklayıcı metin kabul etmeli.
- Onaycı, atamayı veya soruyu başkalarına devretme (reassign) seçeneğine sahip olmalı — yine implementasyona bırakılan detay.

Güvenlik ve uyumluluk
- Hiçbir onay veya onay sonrası eylem, CLAUDE.md’deki kritik uyarıları çiğnememeli (ör. mevcut reklam hesabına zarar verme vs.).
- Onaycı kimliği approvals.actor alanında güvenli şekilde tutulmalı (kullanıcı ID, e-posta veya sistemde tanımlı kısa ad).
- Onay işlemine dair loglar gizlilik gereksinimlerine uygun saklanmalı.

Raporlama / takip
- Onay bekleyen öğeler için bir "Pending approvals" görünümü olmalı (kimin onay beklediğini, ne kadar zamandır beklediğini gösterir).
- approvals tablosu üzerinden raporlar üretilebilmeli (onay süresi, reddedilme oranı, yeniden üretim sayısı).

Not — kod durumu
- Bu belge, yalnızca gereksinim ve iş akışını tanımlar. Sistemde ilgili tablolar (content_items, content_layers, approvals, audit_log) mevcut; ancak bu akışın uygulama katmanında tam bir implementasyonu (UI, bildirim, reassign, yayın adımı) kodlanmamıştır.

Kısa özet
- Onay akışı: üretim → review request → Ayşe (ve/veya atanan onaycı) inceleme → Approve / Request Change / Reject → approvals + audit_log kaydı → içerik durum güncellemesi → (gerektiğinde) yeniden üretim ve tekrar review.
- Gösterilecek temel bilgiler: preview (asset_url), versiyon, üretim prompt/metin, kampanya hedefi, önceki onay geçmişi, değişiklik notları.
- Güvenlik: onaylar RLS ve audit ile korunmalı; canlı hesaplara direkt otomatik değişiklik yapılmamalıdır.

Bu gereksinim belgesi, CLAUDE.md ve PROJECT_HANDOFF.md içinde belirtilen insan onayı maddelerini düzenli, uygulanabilir bir adım setine dönüştürür. Kodlama veya yeni teknoloji kararı içermez; uygulamaya geçmeden önce onaycı(lar) ile süreç ve bildirim kanalını netleştirmek önerilir.