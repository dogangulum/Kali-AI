# Doküman İndeksi

Bu klasör, projenin mevcut durumunu, çalışma mantığını, taşınma hazırlığını ve yerel test akışını anlatan belgeleri içerir. Hangi belge ne zaman bakılmalı? Aşağıdaki kısa indeks bunu hızlıca gösterir.

## Belgeler

### 0) START_HERE.md
- Ne işe yarar: Projeyi yeni başlatan biri için tek giriş noktasıdır. Projenin gerçek durumu, neyin hazır olduğu, neyin eksik olduğu ve hangi dosyanın ne zaman okunması gerektiğini açıklar.
- Ne zaman bakılmalı: projeye ilk kez başlarken, konuyu toparlamak istediğinde veya başka belgeyi okurken bağlamı kaybettiğinde.
- Kısa özet: mevcut gerçek durum, okuma sırası, hangi belgelerin hangi aşamada bakılması gerektiği ve kısa karar rehberi içerir.

### 1) PROJECT_HANDOFF.md
- Ne işe yarar: Projenin amacı, hedefi, geçmiş notları ve teknik ilkeler için ana devir dokümanıdır.
- Ne zaman bakılmalı: projeye yeni başlarken, hedefi yeniden hatırlamak istediğinde veya "neden böyle yapıldı?" sorusu ortaya çıktığında.
- Kısa özet: statü, hedef funnel, başlangıç kullanım senaryosu, kritik gerçeklik kontrolü ve ilk teknik milestone listesi bulunur.

### 2) SYSTEM_FLOW.md
- Ne işe yarar: Sistemin şu anki çalışma mantığını adım adım anlatır.
- Ne zaman bakılmalı: bir webhook geldiğinde ne olduğunu anlamak, veritabanına nereye yazıldığını kontrol etmek veya mevcut akışı izlemek istediğinde.
- Kısa özet: WhatsApp/Instagram webhook akışı, GET doğrulama, POST imza kontrolü, rate limiting, `conversations` / `messages` yazımı ve mevcut eksik/planlanan adımlar.

### 3) ORACLE_CLOUD_DEPLOYMENT_PREP.md
- Ne işe yarar: Oracle Cloud VPS taşıma için gerekli hazırlık ve yol haritasını özetler.
- Ne zaman bakılmalı: sunucuya taşıma öncesi, ortam değişkenlerinin hazırlanması gerektiğinde veya üretim benzeri dağıtım planı çıkarılırken.
- Kısa özet: hedef mimari, secrets yönetimi, HTTPS/webhook erişimi, runtime kurulumu, Supabase bağlantısı, güvenlik kuralları ve taşıma adımları.

### 4) LOCAL_TESTS.md
- Ne işe yarar: Yerel test akışını ve temel webhook doğrulama komutlarını açıklar.
- Ne zaman bakılmalı: yerelde işin doğru çalıştığını kontrol etmek, Webhook akışını doğrulamak veya sorun giderme için başlatılacak komutları bulmak istediğinde.
- Kısa özet: gerekli araçlar, `npm run test:local` akışı, test senaryoları, başarı kriterleri ve sık karşılaşılan hatalar.

### 5) SCRIPTS.md
- Ne işe yarar: `scripts/` klasöründeki yardımcı araçların ne işe yaradığını ve nasıl çalıştırılacağını özetler.
- Ne zaman bakılmalı: yerel test, webhook doğrulama, env kontrolü, canlı izleme veya sahte dry-run senaryolarını çalıştırmak istediğinizde.
- Kısa özet: `check-env`, `check-webhooks`, `run-local-tests`, `simulate-webhook`, `dry-run.cjs` ve `live-monitor.cjs` araçları için kullanım örnekleri ve amaçları yer alır.

### 6) DEVELOPMENT_START_GUIDE.md
- Ne işe yarar: Geliştirme öncesi okuma sırasını, veri tabanı eşlemelerini ve fonksiyon isim önerilerini tek bir yerden anlatır.
- Ne zaman bakılmalı: kodlamaya başlamak için hangi dosyadan başlanacağını netleştirmek istediğinizde.
- Kısa özet: akış bazlı okuma sırası, tablo eşlemeleri, işlev isimleri ve mevcut testlerin nasıl çalıştırılacağı yer alır.

### 7) KALI_BUSINESS_INFO_TEMPLATE.md
- Ne işe yarar: İşletmenin gerçek hizmet, fiyat, çalışma saatleri, tonu ve karşılama mesajı gibi bilgilerini toplamaya yarayan boş şablon.
- Ne zaman bakılmalı: sistemin gerçekten çalışması için ilk işletme profili hazırlık aşamasında.
- Kısa özet: Ayşe'nin dolduracağı baştan sona iş bilgisi formu, neden gerekli olduğu açıklaması ve kontrol listesi içerir.

### 8) BUSINESS_INFO_ACCEPTANCE_TESTS.md
- Ne işe yarar: İşletme bilgi formu ve içerik üretiminde kullanılacak işletme verilerinin doğruluğunu kontrol eden kabul testlerini ve fixture örneklerini içerir.
- Ne zaman bakılmalı: yeni bir işletme profili girildiğinde veya `dry-run`/CI testleri çalıştırılmadan önce doğrulama gerektiğinde.
- Kısa özet: zorunlu alanlar, sınır koşulları, örnek veri setleri ve başarısızlık durumunda izlenecek düzeltme adımları.

### 9) LEAD_QUALIFICATION_AND_BOOKING_REQUIREMENTS.md
- Ne işe yarar: Gelen mesajın ciddi lead olup olmadığına karar verme ve randevu akışının gereksinimlerini detaylı anlatır.
- Ne zaman bakılmalı: lead scoring, niyet analizi, randevu uygunluk kontrolü ve otomatik/insan devri kararı planlanırken.
- Kısa özet: müşteri niyeti, kriterler, puanlama, randevu onayı, çakışma ve insan devri kuralları yer alır.

### 10) HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md
- Ne işe yarar: İnsan devri, analiz/takip ve model maliyet kontrolünü tek belgede açıklar.
- Ne zaman bakılmalı: Ayşe'ye devredilecek durumlar, funnel takibi veya model seçimi iş akışı planlanırken.
- Kısa özet: escalation koşulları, audit/funnel event yapısı, model routing ve maliyet izleme kuralları yer alır.

### 11) HUMAN_APPROVAL_REQUIREMENTS.md
- Ne işe yarar: İçerik ve kampanya için Onayla / Değiştir / Reddet akışını tanımlar.
- Ne zaman bakılmalı: üretim katmanı, içerik onayı ve insan denetimi planlanırken.
- Kısa özet: approvals, audit log, versiyon yönetimi ve onay ekranı gereksinimleri yer alır.

### 12) HUMAN_APPROVAL_ESCALATION_EDGE_CASES.md
- Ne işe yarar: Onay ve insana devretme akışındaki uç durum senaryolarını gerçek örneklerle listeler ve her durumda beklenen sistem davranışını açıklar.
- Ne zaman bakılmalı: approval/escalation mantığı kodlanırken, SLA ve alarm kuralları belirlenirken.
- Kısa özet: gecikmeler, çakışan onay istekleri, onaycı yoksa ne yapılacağı, audit_log kayıtları ve önerilen çözüm yolları.

### 13) HUMAN_APPROVAL_ESCALATION_UI_DRAFT.md
- Ne işe yarar: Onay ve insana aktarım akışlarının hangi ekranlarda nasıl görüneceğine dair basit UI taslakları ve bildirim metinleri sağlar.
- Ne zaman bakılmalı: frontend implementasyonu, bildirim tasarımı ve kullanıcı rolleri belirlenirken.
- Kısa özet: dashboard, approval modal, SLA uyarıları, hızlı onay/assign akışları ve mobil bildirim örnekleri.

### 14) CONTENT_AD_PREP.md
- Ne işe yarar: İçerik üretimi, video/görsel/seslendirme/altyazı ve reklam kampanyası için detaylı hazırlık akışını anlatır.
- Ne zaman bakılmalı: içeriğe başlanacağında, brief oluşturulurken ve yayın öncesi üretim planı hazırlanırken.
- Kısa özet: brief, katman üretimi, QC, onay, kampanya ve performans takibi yer alır.

### 15) CONTENT_AD_PREP_EDGE_CASES.md
- Ne işe yarar: İçerik üretimi akışındaki sürpriz ve hata senaryolarını örneklerle gösterir.
- Ne zaman bakılmalı: üretim katmanları kodlanırken ve onay/retry kararları belirlenirken.
- Kısa özet: yeniden üretim, reddetme, ek açıklama, hatalı brief ve yayın öncesi doğrulama davranışları yer alır.

### 16) CONTENT_AD_UI_DRAFT.md
- Ne işe yarar: İçerik ve reklam üretimi akışının kullanıcı arayüzü örneklerini gösterir.
- Ne zaman bakılmalı: onay ekranı, önizleme ve görev listesi tasarımı planlanırken.
- Kısa özet: taslak ekranlar, edit/replace akışları ve bildirim örnekleri içerir.

### 17) IMPLEMENTATION_PRIORITY_PLAN.md
- Ne işe yarar: Hangi iş akışının önce, hangisinin sonra kodlanması gerektiğini bağımlılık mantığıyla anlatan öncelik planı.
- Ne zaman bakılmalı: görevleri sıralarken, kod başlatma öncesi ve üretim planı oluşturulurken.
- Kısa özet: business_config ve temel müşteri akışı öncelikli; ardından escalation, tracking, model routing, approval ve içerik/reklam üretimi gelir.

### 18) TEST_SENARYOLARI.md
- Ne işe yarar: Uçtan uca müşteri benzeri test senaryolarını listeler.
- Ne zaman bakılmalı: sistemin konuşma davranışını ve randevu akışını canlı benzeri şekilde kontrol ederken.
- Kısa özet: bilgi, itiraz, randevu, insan devri ve hatalı karakter girişini kapsayan senaryolar vardır.

### 19) TEST_KAPSAM_RAPORU.md
- Ne işe yarar: Test kapsamı, açıklar ve mevcut kanıtları özetleyen denetim raporu.
- Ne zaman bakılmalı: test durumu ve açıklar kontrol edilecekse.

### 20) LOG_REPORT.md
- Ne işe yarar: Raporlama ara yüzü için örnek log çıktıları ve metrik analiz akışını anlatır.
- Ne zaman bakılmalı: model maliyet, funnel, audit ve operasyonel metrikleri izlemek istediğinizde.
- Kısa özet: raporlama formatı, tarih filtresi, bütçe uyarısı ve senaryo modu kullanımı yer alır.

### 21) ALL_SCENARIOS.md
- Ne işe yarar: Proje için hazırlanmış tüm örnek senaryoların tek bir katalogudur.
- Ne zaman bakılmalı: davranış testi, örnek konuşma listesi veya gerçek müşteri benzeri akışı doğrulamak istediğinizde.
- Kısa özet: kanal bazlı, iş akışı bazlı ve hata senaryoları içeren geniş örnek seti bulunur.

### 22) TROUBLESHOOTING_GUIDE.md
- Ne işe yarar: Canlı test ve çalıştırma sırasında ortaya çıkabilecek sorunların nedenlerini ve adım adım çözümlerini anlatır.
- Ne zaman bakılmalı: webhook 500, yanlış işletme verisi, kayıt tekrarı, AI yanıtı gelmemesi veya denetim sorunu yaşadığınızda.
- Kısa özet: sorun tanımlama, kontrol listesi, hızlı çözüm ve güvenlik önlemleri yer alır.

### 23) SHARE_CHECKLIST.md
- Ne işe yarar: Paylaşım öncesi gizli bilgi, canlı veri ve üretim bilgilerinin dışarı çıkmasını engelleme kontrol listesi.
- Ne zaman bakılmalı: GitHub / repo paylaşımı, başka ekip veya ajana açma ve güvenlik ön kontrolünde.

### 24) SOZLUK.md
- Ne işe yarar: Teknik terimleri sade dille açıklayan sözlük/SSS.
- Ne zaman bakılmalı: yeni kişi projeyi anlamaya başlarken ya da teknik terimlere takıldığında.

### 25) ACILIS_HAZIRLIK.md
- Ne işe yarar: Açılış öncesi hazırlık, yerel kontrol ve canlı açılış için sorumluluk ve güvenlik listesi.
- Ne zaman bakılmalı: canlı ortam/taşıma öncesi ve geri alma planı hazırlanırken.

## Hızlı önerilen sıralama

Yeni bir kişi projeye giriyorsa önerilen sırayla bakması:
1. START_HERE.md
2. PROJECT_HANDOFF.md
3. SYSTEM_FLOW.md
4. DEVELOPMENT_START_GUIDE.md
5. LOCAL_TESTS.md
6. SCRIPTS.md
7. KALI_BUSINESS_INFO_TEMPLATE.md
8. BUSINESS_INFO_ACCEPTANCE_TESTS.md
9. IMPLEMENTATION_PRIORITY_PLAN.md
10. LEAD_QUALIFICATION_AND_BOOKING_REQUIREMENTS.md
11. HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md
12. HUMAN_APPROVAL_REQUIREMENTS.md
13. CONTENT_AD_PREP.md
14. ORACLE_CLOUD_DEPLOYMENT_PREP.md
15. TROUBLESHOOTING_GUIDE.md
16. SHARE_CHECKLIST.md
17. SOZLUK.md
18. ACILIS_HAZIRLIK.md

Canlı test sırasında en son mesaj ve model kararı izlemek için `npm run monitor:live` komutunu `SCRIPTS.md` üzerinden çalıştırabilirsiniz.

Bu sıralama, önce bağlam ve gerçek durum, sonra veri modeli ve işleyiş, ardından işletme bilgisi, öncelik planı, iş akışları ve en son taşıma, güvenlik ve sorumluluk ayrıntıları mantığını takip eder.

## Kısa karar rehberi

- "Projeyi nasıl anlamaya başlarım?" -> START_HERE.md
- "Proje neden böyle kuruldu?" -> PROJECT_HANDOFF.md
- "Bir mesaj geldiğinde ne oluyor?" -> SYSTEM_FLOW.md
- "Geliştirmeye nereden başlamalıyım?" -> DEVELOPMENT_START_GUIDE.md
- "Lokal olarak testi nasıl çalıştırırım?" -> LOCAL_TESTS.md
- "Script'ler ne işe yarıyor, hangi komutu kullanırım?" -> SCRIPTS.md
- "İşletme bilgileri nasıl doldurulur?" -> KALI_BUSINESS_INFO_TEMPLATE.md
- "İşletme bilgisi doğru mu?" -> BUSINESS_INFO_ACCEPTANCE_TESTS.md
- "Hangisi önce kodlanmalı?" -> IMPLEMENTATION_PRIORITY_PLAN.md
- "Lead qualification ve randevu akışı nasıl olmalı?" -> LEAD_QUALIFICATION_AND_BOOKING_REQUIREMENTS.md
- "İnsan devri, takip ve maliyet kontrolü nasıl yapılmalı?" -> HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md
- "İnsan onayı nasıl olmalı?" -> HUMAN_APPROVAL_REQUIREMENTS.md
- "İçerik ve reklam üretimi için ne gerekli?" -> CONTENT_AD_PREP.md
- "Uç durumlar nasıl kontrol edilir?" -> HUMAN_APPROVAL_ESCALATION_EDGE_CASES.md / CONTENT_AD_PREP_EDGE_CASES.md
- "Yarın Oracle Cloud'a taşıma için ne gerekli?" -> ORACLE_CLOUD_DEPLOYMENT_PREP.md
- "Sorun yaşarsam ne bakmalıyım?" -> TROUBLESHOOTING_GUIDE.md
- "Paylaşım öncesi ne kontrol edilir?" -> SHARE_CHECKLIST.md
- "Teknik terimlerin anlamı ne?" -> SOZLUK.md
- "Açılış öncesi ne yapılmalı?" -> ACILIS_HAZIRLIK.md
- "Canlı mesaja ne oldu, hangi model kullanıldı?" -> SCRIPTS.md (`npm run monitor:live`)

## Not

Bu belgeler, mevcut repo içindeki gerçek dosyalara dayanır. Yeni bir mimari tasarım eklenmez; mevcut durum ve proje kuralları düzenli şekilde özetlenir.

## Tam liste ve belgelerin durumu
Aşağıda docs/ klasöründeki tüm belgeler ve önerilen durum etiketleri listelenmiştir. "Stable" üretim/eğitim amaçlı referans olarak kullanılabilir; "Draft / WIP" geliştirme aşamasında veya UI taslakları; "Review / Possibly obsolete" bir gözden geçirme ve arşivleme kararı gerektirir.

- ACILIS_HAZIRLIK.md — Stable
- ALL_SCENARIOS.md — Review / Possibly obsolete (içerikte "taslak" / "eski" ibareleri bulundu; güncel senaryolarla eşleştiğinden emin olun)
- BUSINESS_INFO_ACCEPTANCE_TESTS.md — Review / Possibly obsolete (içerikte "eski" ibareleri bulundu; fixture uyumu kontrolü önerilir)
- CONTENT_AD_PREP.md — Draft / WIP
- CONTENT_AD_PREP_EDGE_CASES.md — Draft / WIP
- CONTENT_AD_UI_DRAFT.md — Draft / UI (taslak)
- DEVELOPMENT_START_GUIDE.md — Draft / WIP
- HUMAN_APPROVAL_ESCALATION_EDGE_CASES.md — Review / Possibly obsolete
- HUMAN_APPROVAL_ESCALATION_UI_DRAFT.md — Draft / UI
- HUMAN_APPROVAL_REQUIREMENTS.md — Draft / WIP
- HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md — Review / Possibly obsolete
- IMPLEMENTATION_PRIORITY_PLAN.md — Stable
- KALI_BUSINESS_INFO_TEMPLATE.md — Review / Possibly obsolete
- LEAD_QUALIFICATION_AND_BOOKING_REQUIREMENTS.md — Review / Possibly obsolete
- LIVE_MESSAGE_MONITOR_HANDOFF.md — Draft / WIP (yeni uygulandı; içerikte hala "taslak/eski" ifadeleri olabilir)
- LIVE_MESSAGE_TEST_CHECKLIST.md — Draft / WIP
- LIVE_MONITOR_TESTS.md — Draft / WIP
- LOCAL_TESTS.md — Stable
- LOG_REPORT.md — Stable
- ORACLE_CLOUD_DEPLOYMENT_PREP.md — Draft / Needs review (taşıma adımları güncellenmeli)
- PROJECT_HANDOFF.md — Stable
- SCRIPTS.md — Stable
- SHARE_CHECKLIST.md — Stable
- SOZLUK.md — Stable
- START_HERE.md — Draft / WIP (içerikte "henüz uygulanmadı" notu var; güncelleme önerilir)
- SYSTEM_FLOW.md — Review / Possibly obsolete
- TEST_KAPSAM_RAPORU.md — Review / Possibly obsolete
- TEST_SENARYOLARI.md — Stable
- TROUBLESHOOTING_GUIDE.md — Draft / WIP

Öneriler:
- Draft / WIP etiketli dosyalar: öncelikli olarak okunup eksik bilgiler tamamlanmalı; özellikle DEVELOPMENT_START_GUIDE.md, START_HERE.md, LIVE_MESSAGE_MONITOR_HANDOFF.md gibi rehber belgeler güncel durumla eşleştirilmeli.
- Review / Possibly obsolete etiketli dosyalar: içeriklerin güncellik kontrolü yapılsın; eğer yeni belgeler (örn. LEAD_QUALIFICATION_... veya HUMAN_ESCALATION_... güncellenmiş sürümleri) varsa eski sürümler arşivlenip README'de referans bırakılmalı.
- Stable etiketli dosyalar: referans olarak kullanılabilir; yine düzenli aralıklarla (ör. sprint bazlı) gözden geçirilmesi önerilir.

Bu liste, içerik içinde bulunan anahtar kelimelere göre ("taslak", "eski", "draft", "henüz uygulanmadı", vb.) otomatik tespit ile oluşturulmuştur. Belirtilen durumlardan farklı düşündüğünüz maddeler varsa söyleyin, README.md'de son halini sizin onayınıza göre netleştiririm.
