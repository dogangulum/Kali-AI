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
- Ne zaman bakılmalı: yerel test, webhook doğrulama, env kontrolü veya sahte dry-run senaryolarını çalıştırmak istediğinizde.
- Kısa özet: `check-env`, `check-webhooks`, `run-local-tests`, `simulate-webhook` ve yeni `dry-run.cjs` araçları için kullanım örnekleri ve amaçları yer alır.

### 6) KALI_BUSINESS_INFO_TEMPLATE.md
- Ne işe yarar: İşletmenin gerçek hizmet, fiyat, çalışma saatleri, tonu ve karşılama mesajı gibi bilgilerini toplamaya yarayan boş şablon.
- Ne zaman bakılmalı: sistemin gerçekten çalışması için ilk işletme profili hazırlık aşamasında.
- Kısa özet: Ayşe'nin dolduracağı baştan sona iş bilgisi formu, neden gerekli olduğu açıklaması ve kontrol listesi içerir.

### 7) LEAD_QUALIFICATION_AND_BOOKING_REQUIREMENTS.md
- Ne işe yarar: Gelen mesajın ciddi lead olup olmadığına karar verme ve randevu akışının gereksinimlerini detaylı anlatır.
- Ne zaman bakılmalı: lead scoring, niyet analizi, randevu uygunluk kontrolü ve otomatik/insan devri kararı planlanırken.
- Kısa özet: müşteri niyeti, kriterler, puanlama, randevu onayı, çakışma ve insan devri kuralları yer alır.

### 8) HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md
- Ne işe yarar: İnsan devri, analiz/takip ve model maliyet kontrolünü tek belgede açıklar.
- Ne zaman bakılmalı: Ayşe'ye devredilecek durumlar, funnel takibi veya model seçimi iş akışı planlanırken.
- Kısa özet: escalation koşulları, audit/funnel event yapısı, model routing ve maliyet izleme kuralları yer alır.

### 9) HUMAN_APPROVAL_REQUIREMENTS.md
- Ne işe yarar: İçerik ve kampanya için Onayla / Değiştir / Reddet akışını tanımlar.
- Ne zaman bakılmalı: üretim katmanı, içerik onayı ve insan denetimi planlanırken.
- Kısa özet: approvals, audit log, versiyon yönetimi ve onay ekranı gereksinimleri yer alır.

### 10) CONTENT_AD_PREP.md
- Ne işe yarar: İçerik üretimi, video/görsel/seslendirme/altyazı ve reklam kampanyası için detaylı hazırlık akışını anlatır.
- Ne zaman bakılmalı: içeriğe başlanacağında, brief oluşturulurken ve yayın öncesi üretim planı hazırlanırken.
- Kısa özet: brief, katman üretimi, QC, onay, kampanya ve performans takibi yer alır.

### 11) SHARE_CHECKLIST.md
- Ne işe yarar: Paylaşım öncesi gizli bilgi, canlı veri ve üretim bilgilerinin dışarı çıkmasını engelleme kontrol listesi.
- Ne zaman bakılmalı: GitHub / repo paylaşımı, başka ekip veya ajana açma ve güvenlik ön kontrolünde.

### 12) SOZLUK.md
- Ne işe yarar: Teknik terimleri sade dille açıklayan sözlük/SSS.
- Ne zaman bakılmalı: yeni kişi projeyi anlamaya başlarken ya da teknik terimlere takıldığında.

### 13) ACILIS_HAZIRLIK.md
- Ne işe yarar: Açılış öncesi hazırlık, yerel kontrol ve canlı açılış için sorumluluk ve güvenlik listesi.
- Ne zaman bakılmalı: canlı ortam/taşıma öncesi ve geri alma planı hazırlanırken.

### 14) TEST_KAPSAM_RAPORU.md
- Ne işe yarar: Test kapsamı, açıklar ve mevcut kanıtları özetleyen denetim raporu.
- Ne zaman bakılmalı: test durumu ve açıklar kontrol edilecekse.

## Hızlı önerilen sıralama

Yeni bir kişi projeye giriyorsa önerilen sırayla bakması:
1. START_HERE.md
2. PROJECT_HANDOFF.md
3. SYSTEM_FLOW.md
4. LOCAL_TESTS.md
5. SCRIPTS.md
6. KALI_BUSINESS_INFO_TEMPLATE.md
7. LEAD_QUALIFICATION_AND_BOOKING_REQUIREMENTS.md
8. HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md
9. HUMAN_APPROVAL_REQUIREMENTS.md
10. CONTENT_AD_PREP.md
11. ORACLE_CLOUD_DEPLOYMENT_PREP.md
12. SHARE_CHECKLIST.md
13. SOZLUK.md
14. ACILIS_HAZIRLIK.md

Bu sıralama, önce bağlam ve gerçek durum, sonra işleyiş, ardından işletme bilgisi ve iş akışları, en son taşıma ve güvenlik ayrıntıları mantığını takip eder.

## Kısa karar rehberi

- "Projeyi nasıl anlamaya başlarım?" -> START_HERE.md
- "Proje neden böyle kurulmuş?" -> PROJECT_HANDOFF.md
- "Bir mesaj geldiğinde ne oluyor?" -> SYSTEM_FLOW.md
- "Lokal olarak testi nasıl çalıştırırım?" -> LOCAL_TESTS.md
- "Script'ler ne işe yarıyor, hangi komutu kullanırım?" -> SCRIPTS.md
- "İşletme bilgileri nasıl doldurulur?" -> KALI_BUSINESS_INFO_TEMPLATE.md
- "Lead qualification ve randevu akışı nasıl olmalı?" -> LEAD_QUALIFICATION_AND_BOOKING_REQUIREMENTS.md
- "İnsan devri, takip ve maliyet kontrolü nasıl yapılmalı?" -> HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md
- "İnsan onayı nasıl olmalı?" -> HUMAN_APPROVAL_REQUIREMENTS.md
- "İçerik ve reklam üretimi için ne gerekli?" -> CONTENT_AD_PREP.md
- "Yarın Oracle Cloud'a taşıma için ne gerekli?" -> ORACLE_CLOUD_DEPLOYMENT_PREP.md
- "Paylaşım öncesi ne kontrol edilir?" -> SHARE_CHECKLIST.md
- "Teknik terimlerin anlamı ne?" -> SOZLUK.md
- "Açılış öncesi ne yapılmalı?" -> ACILIS_HAZIRLIK.md

## Not

Bu belgeler, mevcut repo içindeki gerçek dosyalara dayanır. Yeni bir mimari tasarım eklenmez; mevcut durum ve proje kuralları düzenli şekilde özetlenir.
