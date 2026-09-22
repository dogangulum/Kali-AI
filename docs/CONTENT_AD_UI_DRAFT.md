# İçerik & Reklam Üretimi — UI / Bildirim Taslağı (Örnekler)

Aşağıda içerik üretimi, onaylama ve kampanya yayınlama süreçleri için basit ama uygulamaya geçirilebilir arayüz ve bildirim taslakları yer alır. Amaç: geliştiriciye hangi ekranlarda ne gösterileceğini ve hangi bildirimlerin gideceğini anlatmak.

1) Dashboard / Content Queue (START_HERE -> Content)

- Amaç: Onay bekleyen ve aksiyona ihtiyaç duyan içeriklerin hızlı görünümü.
- Görüntülenecek sütunlar:
  - Content ID / Topic
  - Business (masked) / business_id (gizli)
  - Content type (Reel/Image/Text)
  - Status (draft / generating / ready_for_review / approved / published / error)
  - Pending approvals (n) - tıklanabilir
  - Last activity (zaman)
- Aksiyonlar:
  - İncele (preview modal)
  - Hızlı onay (approve) — açılabilir onay modalı
  - Gönder (assign to person)

2) Content Detail / Layer Tab

- Header: topic, content_type, status, version selector
- Sekmeler:
  - Overview (brief, KPI hedefleri, campaign linkleri)
  - Layers (visual / voiceover / subtitle / text) - her layer için card
    - layer card: asset preview, version, status, notes, small QC checklist
    - actions: preview, download, request change, approve, reject
  - Approvals: geçmiş approval kayıtları (kim, ne, notlar, zaman)
  - Audit log: ilgili `audit_log` kayıtları (filtrelenebilir)
- Layer preview modal:
  - video/audio player, subtitle toggle, quick QC checkboxes
  - "Onayla / Değiştir / Reddet" butonları
  - Değiştir seçilirse: kısa form (neden değiştirilsin, hangi alan) + zorunlu not

3) Approval Modal / Screen (Ayşe için özel view)

- İçerik özeti (topic, hedef, platform)
- Katman listesi ve küçük preview (thumbnail + 8s preview)
- Her katman için QC checklist (tek tıkla işaretlenebilir)
- Zorunlu onay seçenekleri:
  - Onayla (approve) — opsiyonel kısa not
  - Değiştir (change) — zorunlu not ve opsiyonel edit talimatı; yeniden üretim tetiklenecek katman seçilir
  - Reddet (reject) — zorunlu neden
- Onay sonrası gösterim: onay veren, zaman, versiyon nöbeti

4) Campaign Builder Screen

- Campaign metadata form:
  - Title, budget, start/end, target audience, platform, ad objectives, linked content (multiple select)
- Validation: campaign can only be activated if all linked content layers have status `approved` (or `published` depending on policy)
- On activation: create `ad_campaigns` record, log `audit_log`, enqueue publish job (manual step required to actually start advertising account calls)

5) Notifications / Alerts

- To Ayşe (primary approver):
  - "Review request: [Topic] — [Layer types] — [preview link]" (push/email/telegram)
  - SLA reminders: 24h left, 2h left, overdue
  - Critical: copyright or privacy breach detected (urgent)
- To Production/Operations:
  - asset_upload_failed notifications
  - campaign_create_failed with provider error code
- To Finance/Ops (cost control):
  - cost threshold alerts when model calls for a content item exceed configured budget

6) Error and Retry UX

- Eğer bir işlem hata verirse (format, upload), içerik detayında kırmızı bir hata bannerı gösterilir ve "Retry upload" / "Request help" seçenekleri sunulur.
- Hata detayları `audit_log` içinde saklanır; sadece gerekli meta kullanıcıya gösterilir, PII gösterilmez.

7) Access / Permissions

- Roles:
  - Admin: tüm aksiyonlar
  - Approver (Ayşe): onay/değiştir/reject
  - Creator: içerik oluşturma ve yeniden üretim tetikleme
  - Viewer: read only
- UI öğeleri rol bazlı gösterilmeli; `business_id` veya PII gösterimi role ile kısıtlanmalı.

8) Mobile-first considerations

- Önizleme modal küçük ekranlarda hızlı ön izleme + QC checkbox'ları ile olmalı.
- Bildirimler (SLA, request) kısa ve kontekst içerikli olmalı (örn. "1 katman bekliyor: Visual — 12s preview")

9) Quick flows (kısa senaryolar)

- Hızlı Onay: Ayşe dashboarddan "Quick Approve" ile tek bir tıklamada görsel katman onaylayabilir; yine de opsiyonel not bırakması önerilir.
- Change with instruction: Değiştir seçildiğinde sistem otomatik olarak yalnızca ilgili katmanı yeniden üretmek için üretim kuyruğuna girer ve sürüm numarası artırılır.

---

Bu UI taslakları geliştiricinin frontend implementasyonuna yeterli olacak kadar somutluktur; tasarımcılar için wireframe adımı sonrası detaylandırılmalıdır.
