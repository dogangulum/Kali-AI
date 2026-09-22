# Tüm senaryoları tek komutla deneme

Proje klasöründe:

```powershell
npm.cmd run test:scenarios
```

Diğer kabuklarda `npm run test:scenarios` kullanılabilir. Aynı toplu akış mevcut
araçlardan da açılır:

```powershell
node scripts/dry-run.cjs --all
node scripts/chat-simulator.cjs --all
```

İnternet, gerçek API anahtarı, yerel webhook sunucusu veya canlı veritabanı
gerekmez. Girdiler dosyalardan okunur; mock veritabanı ve sahte AI yanıtı kullanılır.
Dosyalar değiştirilmez. Başarılı toplu koşu 0; herhangi bir aşama hatası 1 döner.
Hatalı aşamadan sonra diğer aşamalar da denenir ve son durum başarısız kalır.

| Kaynak | Toplu koşuda yapılan kontrol |
|---|---|
| `tests/fixtures/*.json` | Tüm Meta payload'ları doğru kanalın gerçek handler'ında mock DB/AI ile yürütülür; HTTP, mesaj, routing ve taslak kontrol edilir. Okundu bildiriminde mesaj beklenmez. |
| `tests/scenarios/booking-cases.json` | 58 vakanın fixture eşleştirmesi, mesajları, benzersiz kimlikleri ve gereksinim kapsamı doğrulanır. Dry-run sırasında ön koşul ve beklenen davranış gösterilir. |
| `tests/scenarios/analytics-cost-cases.json` | 92 vaka için rapor alanları/hata beklentileri test edilir; kayıt anı ve yazılmaması gereken olay sözleşmeleri okunur. Kategori özeti üretilir. |
| `tests/scenarios/log-metrics.example.json` | Örnek maliyet/gecikme hesabı doğrulanır ve toplu çıktıda özeti gösterilir. |
| `chat-simulator` hazır konuşmaları | Altı konuşma ayrı mock oturumlarda sırayla çalışır; her yeni mesajın kendi routing/taslağı kontrol edilir. |

92 analiz/maliyet vakasının 10'u kasıtlı bozuk girdidir. Beklenen hata doğru
oluşursa test geçer; bunlar araç arızası değildir. Yeni bir JSON kataloğu eklenip
toplu akışa bağlanmazsa envanter kontrolü hata verir; sessizce atlanmaz.

**Kontrollerin sınırı:** Randevu kataloğundaki takvim, müşteri geçmişi ve
çatışma ön koşulları henüz mevcut olmayan booking motoruna uygulanmaz; ekranda
kabul ölçütü olarak gösterilir. Sahte AI yanıtı gerçek cevap kalitesini veya
beklenen booking davranışını kanıtlamaz. Analiz/maliyet vakaları hedef log
projeksiyonlarını sınar; üretimde bu olayların yazıldığını kanıtlamaz.
[İşletme formu cevap kabul planı](BUSINESS_INFO_ACCEPTANCE_TESTS.md) gerçek
doldurulmuş form ve cevap değerlendirmesi gerektiren ayrı manuel kontroldür.

Tek fixture veya eski kullanım biçimleri korunur:

```powershell
node scripts/dry-run.cjs
node scripts/dry-run.cjs --fixture whatsapp-booking-past-date.json
node scripts/chat-simulator.cjs 6
node scripts/chat-simulator.cjs --quick-all
node scripts/chat-simulator.cjs
```

Etkileşimli sohbet menüsünde `all` aynı toplu akışı çalıştırır; `f` seçeneği
Instagram ve WhatsApp fixture'larını doğru kanal üzerinden dener. Hazır sohbet
seçimi yeni oturum açar; fixture seçimi de diğer denemelerden yalıtılır.
