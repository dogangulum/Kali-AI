# Hayali işletme ayar kaydı

Bu örnekteki **Örnek Bulut Atölyesi (Hayali)** adı, kimlik, hizmetler ve fiyatlar tamamen deneme amaçlıdır. Dosya açıklamalı bir veri örneğidir; migration veya seed değildir ve otomatik yüklenmez.

## Mevcut veritabanıyla ilişkisi

`supabase/migrations/20260921120000_core_schema.sql` içinde işletme adı ve saat dilimi `businesses` tablosunda; hizmetler, fiyatlar, çalışma saatleri ve konuşma tonu ise `business_config.config` adlı JSONB alanında tutulur. `business_config.business_id`, `businesses.id` alanına bağlıdır ve benzersizdir: her işletmenin tek ayar kaydı olabilir.

Aşağıdaki `config` içindeki anahtarlar örnek bir düzen önerisidir. Mevcut kod bunları henüz okumaz veya doğrulamaz; uygulanmış bir uygulama sözleşmesi değildir.

### 1. İşletme kaydı — `businesses`

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Örnek Bulut Atölyesi (Hayali)",
  "timezone": "Europe/Istanbul"
}
```

### 2. Bu işletmeye ait ayar kaydı — `business_config`

```json
{
  "business_id": "11111111-1111-4111-8111-111111111111",
  "config": {
    "language": "tr-TR",
    "currency": "TRY",
    "services": [
      {
        "id": "ornek-el-bakimi",
        "name": "Örnek el bakımı",
        "description": "Deneme amaçlı temel el bakım hizmeti.",
        "duration_minutes": 30,
        "price": {
          "amount": 450,
          "unit": "session",
          "tax_included": true
        },
        "active": true
      },
      {
        "id": "ornek-tirnak-sekillendirme",
        "name": "Örnek tırnak şekillendirme",
        "description": "Deneme amaçlı tırnak şekillendirme hizmeti.",
        "duration_minutes": 20,
        "price": {
          "amount": 300,
          "unit": "session",
          "tax_included": true
        },
        "active": true
      }
    ],
    "working_hours": {
      "monday": [{ "opens": "09:00", "closes": "18:00" }],
      "tuesday": [{ "opens": "09:00", "closes": "18:00" }],
      "wednesday": [{ "opens": "09:00", "closes": "18:00" }],
      "thursday": [{ "opens": "09:00", "closes": "18:00" }],
      "friday": [
        { "opens": "09:00", "closes": "12:00" },
        { "opens": "13:00", "closes": "18:00" }
      ],
      "saturday": [{ "opens": "10:00", "closes": "16:00" }],
      "sunday": []
    },
    "conversation_style": {
      "tone": "Sıcak, sakin ve profesyonel",
      "address_form": "siz",
      "response_length": "Kısa; tercihen 1–3 cümle",
      "emoji_usage": "Seyrek; mesaj başına en fazla bir emoji",
      "greeting": "Merhaba, Örnek Bulut Atölyesi'ne hoş geldiniz. Size nasıl yardımcı olabiliriz?",
      "guidelines": [
        "Hizmet ve fiyat bilgisini yalnızca işletmenin güncel ayarlarından aktar.",
        "Listede olmayan hizmet veya indirim için söz verme; işletme yetkilisine yönlendir.",
        "Çalışma saatleri içinde olmak randevu uygunluğu anlamına gelmez; uygunluk doğrulanmadan randevuyu kesinleştirme."
      ]
    }
  }
}
```

## İşletme kendi bilgilerini nasıl doldurur?

- İşletme adını ve saat dilimini `businesses` kaydında belirtir. Örnekteki UUID yalnızca iki kayıt arasındaki bağı gösterir; farklı işletmeler aynı kimliği paylaşmaz. Ayar kaydı, ait olduğu işletmenin mevcut kimliğiyle ilişkilendirilir.
- Her hizmeti `services` listesine ekler; adını, açıklamasını, dakika cinsinden süresini ve seans fiyatını doldurur. Bu örnekte `amount` ana para birimindedir: `450`, 450 TL demektir. `currency` tüm hizmetler için geçerlidir; `tax_included` verginin fiyata dahil olup olmadığını belirtir.
- Haftanın her günü için `working_hours` altına 24 saat biçiminde saat aralıkları girer. Saatler `businesses.timezone` değerine göredir. Boş liste kapalı günü, birden fazla aralık gün içi molayı gösterir. Örnek yalnızca normal haftalık programı içerir; tatil ve istisnai günleri tanımlamaz.
- Hitap biçimini, konuşma tonunu, yanıt uzunluğunu, emoji kullanımını ve karşılama mesajını `conversation_style` içinde değiştirir.

`business_config` tablosuna karşılık gelen ikinci örnekte yalnızca içteki `config` nesnesi JSONB sütununa aittir; `business_id` ayrı bir sütundur. Gösterilmeyen kayıt kimliği ve zaman alanlarının veritabanında varsayılanları vardır.

## Şu anda çalışan ve eksik olan parçalar

İşletmenin bu bilgileri gireceği bir yönetim ekranı veya ayar kaydetme API'si henüz yoktur. Dosya, böyle bir girişte sağlanacak veriyi gösterir; mevcut uygulamada dosyayı düzenlemek davranışı değiştirmez.

`supabase/functions/` altındaki WhatsApp ve Instagram webhook'ları doğrulama, imza kontrolü ve istek sınırlama yapar; kabul edilen JSON'u konsola yazar. İşletme eşleme, veritabanından ayar okuma veya bu tona göre AI yanıtı üretme henüz uygulanmamıştır. `api/whatsapp-webhook.js` eski, kullanılmayan taslak olarak işaretlidir.

Şemada RLS politikaları bulunması ve bu örnekte `business_id` gösterilmesi, tek başına işletmeler arası izolasyonun tamamlandığını göstermez. Bu dosya yetkilendirme veya webhook yönlendirme mekanizması tanımlamaz. Bu alanlardaki uygulama değişiklikleri proje yönlendirme kuralları kapsamında ayrıca ele alınmalıdır.

Bu örnek hazırlanırken veritabanı veya webhook kodu değiştirilmedi; hiçbir sisteme kayıt yüklenmedi.
