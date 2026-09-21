# KALI BEAUTY AI — PROJECT HANDOFF

## Vizyon
Kali Beauty Center için 7/24 çalışabilen AI pazarlama ve satış otomasyonu geliştirmek.

Ana funnel:
Reel/Reklam -> DM -> Lead Qualification -> Appointment -> Customer

## İlk Kullanım
- İşletme: Kali Beauty Center
- Başlangıç hedef bölgesi: Mersin, Yenişehir ve Mezitli
- Planlanan aylık reklam bütçesi: 5.000–7.500 TL
- İnsan onayı: Ayşe

## Ürünleşme Hedefi
Mimari ileride başka küçük işletmelere de satılabilecek şekilde çoklu işletme mantığına uygun kurulmalı.
İşletmeye özgü bilgiler kod içine gömülmemeli.

## Planlanan Yetkinlikler
- İçerik/konu araştırması
- Reklam kreatifi oluşturma
- Reel/video/görsel/metin üretim orkestrasyonu
- İnsan onay akışı
- Meta reklam kampanyası hazırlama/yönetme
- Instagram DM karşılama
- Lead qualification
- Randevuya yönlendirme
- İnsan temsilciye escalation
- Analytics
- Model routing
- Maliyet optimizasyonu

## İnsan Onay Akışı
Onayla / Değiştir / Reddet.

Değişiklik hedefleri:
Video / Görsel / Altyazı-Metin / Seslendirme.

Telegram daha sonra onay paneli olarak değerlendirilecek.

## Teknik Fikirler
- Meta/Instagram webhooks
- PostgreSQL / Supabase
- Model routing
- Rolling conversation summaries
- Prompt caching
- Rate limiting
- Webhook signature verification
- Idempotency
- Audit logs
- Secret management
- Modular provider integrations

## Araştırılmış ancak henüz kurulmuş sayılmayacak araçlar
- Headroomlabs
- Graphify
- Task Observer
- Remotion
- Mempalace

Bunlar ihtiyaç ve doğrulama sonrasında değerlendirilecek; mevcut entegrasyon olarak varsayılmayacak.

Claude Code eklentisinin kurulum durumu aşağıdaki "Şu Anki Aşama" bölümünde ayrı belirtilmiştir.

## Kritik Gerçeklik Kontrolü
Önceki planlama görüşmelerinde bazı entegrasyonların yapılmış olabileceğini ima eden ifadeler geçti.
Bunlar doğrulanmadı.
Kod/repository veya çalışan servis ile kanıtlanmayan hiçbir entegrasyonu mevcut kabul etme.

## Şu Anki Aşama
VS Code proje klasörü oluşturuldu:
D:\Kali Beauty\Kali-AI

Claude Code eklentisi kurulmuş durumda.
Repository'nin temel dosya yapısı mevcut: webhook kaynakları, SQL migration dosyaları, ortam örneği, yerel Supabase yapılandırması, Deno/npm görevleri ve Node.js test dosyaları bulunuyor. Dosyaların varlığı canlı kurulumun veya testlerin başarıyla çalıştığının kanıtı değildir.
Claude ücretli aboneliği/Claude Code kullanım yetkisi henüz doğrulanmış değildir.

## İlk Teknik Milestone
Önce güvenli ve modüler bir temel oluştur:
1. [x] configuration schema taslağı (`business_config.config` JSONB alanı ve açıklamalı örnek; alan doğrulaması ve uygulama entegrasyonu tamamlanmış değil)
2. [x] environment template
3. [ ] business profile abstraction
4. [ ] provider interfaces
5. [ ] DM conversation state model
6. [ ] approval workflow model
7. [x] database schema taslağı
8. [x] test dosyaları (çalıştırma başarısı ayrıca doğrulanmalı)
9. [x] README/setup dosyaları (uçtan uca kurulum doğrulaması anlamına gelmez)
10. [ ] ardından gerçek Meta/Supabase entegrasyonları
