# Canlı izleme aracının çevrimdışı testleri

```powershell
node --test tests/live-monitor.test.cjs
```

`npm.cmd test` de bu dosyayı otomatik çalıştırır. Testler mevcut
`runCheckScript` VM düzeneğinde aracın gerçek CLI kaynak kodunu yürütür.
`fetch`, dosya sistemi ve `process.env` sahtedir. `.env.local` örnekleri yalnız
bellektedir; gerçek yapılandırma veya müşteri verisi okunmaz. Ağ isteği yapılmaz.
Sentetik servis adresi `monitor.invalid`, müşteri kimlikleri
`SYNTHETIC_CUSTOMER_A/B` biçimindedir.

25 test; ilk çalıştırmada 23 geçen kontrol ve 2 doğrulanmış kusur için TODO:

| Kimlik | Beklenen | Mevcut sonuç |
|---|---|---|
| MONITOR-01 | Null maliyet ölçülmüş sıfır gibi gösterilmemeli | `$0.00000` basılıyor |
| MONITOR-02 | Aynı mesajın yeni model kaydı eskisi tarafından ezilmemeli | Azalan zaman sırasındaki routing dizisi Map'e çevrilirken eski kayıt kazanıyor |

TODO testleri gerçekten çalışır ve bu kusurları gösterir; atlanmış test değildir.
Node bunları normal başarısız testlerden ayrı raporlar ve çıkış kodunu tek
başlarına başarısız yapmazlar. Bunlar başarılı özellik olarak sayılmamalıdır.
Araç sahibi düzeltmeleri yaptıktan sonra ilgili `todo` işaretleri kaldırılmalı.
Üretim aracı değiştirilmedi.

Diğer kontroller: kronolojik ekran sırası, müşteri/konuşma eşleşmesi, inbound'a
doğru model bağlama, outbound'un taslak etiketi, yabancı routing kaydının
kullanılmaması, sayı/metin maliyeti ve yuvarlama, sıfır maliyet/gecikme, boş
veri, eksik konuşma/routing, limit parametresi, Türkçe/çok satırlı metin,
sahte ortam değişkeni önceliği, eksik ayar, HTTP ve JSON/ağ hata çıktıları.
