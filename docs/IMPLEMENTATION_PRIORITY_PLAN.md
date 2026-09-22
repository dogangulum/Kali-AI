# Kodlama Öncelik Planı ve Bağımlılık Sırası

Bu belge, mevcut gereksinim belgelerinin mantıksal bağımlılıklarını temel alır ve hangi iş akışının önce hangi iş akışından sonra kodlanması gerektiğini açıklar. Amaç, uygulamaya başlarken doğru sırayı takip etmektir.

Temel ilke: önce müşteri akışı, sonra üretim ve izleme katmanları.

## 1) Sıra

### Öncelik 0: İşletme verisi ve tenant izolasyon temelini netleştir

Gerekli belgeler:
- `docs/KALI_BUSINESS_INFO_TEMPLATE.md`
- `config/business-config.example.md`
- `docs/PROJECT_HANDOFF.md`

Neden önce?
- Doğru fiyat, hizmet, saat ve konuşma tonu olmadan lead qualification ve approval akışı güvenilir olmaz.
- Her iş akışı, ilgili `business_id` kapsamı içinde çalışmalıdır.

### Öncelik 1: Lead qualification ve booking flow

Gerekli belge:
- `docs/LEAD_QUALIFICATION_AND_BOOKING_REQUIREMENTS.md`

Neden ilk?
- Bu akış müşteri niyetini ve randevu gereksinimini anlamanın ana mekanizmasıdır.
- İnsan devri, tracking, routing ve approval iş akışları bu katmanın sonuçlarından beslenir.

### Öncelik 2: Human escalation flow

Gerekli belge:
- `docs/HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md` (insan devri bölümü)

Neden ikinci?
- Lead akışı güvenli şekilde karar vermediğinde, insan müdahalesi bir güvenlik bariyeridir.
- Escalation, yanlış randevu ve yanlış müşteri yönlendirmesini önler.

### Öncelik 3: Model routing ve maliyet kontrolü

Gerekli belge:
- `docs/HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md` (maliyet ve routing bölümü)

Neden üçüncü?
- Model seçimi, operasyonel durum netleştikten sonra anlamlı hale gelir.
- Bu katman, hangi modelin hangi koşullarda çağrılacağını tanımlar.

### Öncelik 4: Analiz / funnel tracking

Gerekli belge:
- `docs/HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md` (analiz / tracking bölümü)

Neden dördüncü?
- Tracking, operasyonel akışın sonuçlarını izlemenin temelidir.
- Fakat ölçüm katmanı, temel akış güvenceye alınmadan eksik kalır.

### Öncelik 5: Human approval flow

Gerekli belge:
- `docs/HUMAN_APPROVAL_REQUIREMENTS.md`

Neden beşinci?
- Approval, üretim katmanı için güvenlik kapısıdır.
- Ancak içerik üretim süreçlerinden önce müşteri akışı ve escalation akışının net olması gerekir.

### Öncelik 6: Content ve ad production pipeline

Gerekli belge:
- `docs/CONTENT_AD_PREP.md`

Neden son?
- Bu katman, tüm önceki akışların çıktısını besler.
- İçerik ve reklam üretimi en ileri katmandır; temel müşteri akışı doğru kurulmadan yanlış hedefe, yanlış metne veya gereksiz maliyete yönlenme riski vardır.

## 2) Bağımlılık özeti

- `business_config` ve işletme verisi -> tüm akışların ön koşulu
- lead qualification / booking -> escalation, routing, approval ve tracking için temel
- human escalation -> tam güvenlik ve insana aktarma bariyeridir
- model routing -> müşteri akışını maliyet ve kalite açısından yönlendirir
- analytics -> operasyonel performansı ve veri kalitesini izler
- approval -> içerik yayımlama öncesi güvenlik kalkanıdır
- content/ad production -> en ileri katman ve tüm akışın tamamlayıcısıdır

## 3) Gerçek kodlama sırası (kısa versiyon)

1. İşletme verisi ve yapılandırma doldurulmalı
2. Lead qualification + booking akışı kodlanmalı
3. Human escalation akışı eklenmeli
4. Model routing ve maliyet kontrolü kurulmalı
5. Funnel tracking / analytics kurulmalı
6. Human approval sistemi kurulmalı
7. Content ve ad production pipeline devreye alınmalı

## 4) Kritik tutarlılık notları

- `HUMAN_APPROVAL_REQUIREMENTS.md` için `approval` işlevleri mevcut `approvals` tablosu ile uyumludur: `approve`, `change`, `reject`.
- `HUMAN_ESCALATION_ANALYTICS_COST_CONTROL_REQUIREMENTS.md` için `funnel_events` listesi mevcut şema ile uyumludur; ekstra event türleri `audit_log` tarafında izlenir.
- Approval işleminde `change` eylemi, ayrı bir `request_review` tipi olarak değil, `notes` ile açıklama taşıyan bir değişiklik talebine dönüştürülür.
- Bu plan, son aşamada production katmanını yedeklemeyip, müşteri akışı ve güvenlik katmanını önce kurar; bu nedenle operasyonel risk daha düşüktür.

## 5) Son karar

En güvenli ve tutarlı sıralama şöyledir:

1. `business_config` ve gerçek iş verisi
2. lead qualification + booking
3. human escalation
4. model routing + cost control
5. funnel tracking / analytics
6. human approval
7. content/ad production

Bu sırayla kodlanırsa proje hem müşteri akışını doğru yönetir, hem insan müdahalesini güvenli şekilde işler, hem izlenebilir hale gelir, hem de içerik üretimi aynı anda maliyet ve kalite kontrollü biçimde ilerler.
