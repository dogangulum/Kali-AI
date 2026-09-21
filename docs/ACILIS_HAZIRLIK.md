# Açılış öncesi hazırlık

Bu belge yerel ön kontrolleri ve canlı açılıştan önce tamamlanacak kararları ayırır. Çalıştırılabilir bir üretim dağıtım/geri alma prosedürü değildir. `AGENTS.md`, mimari, webhook güvenliği, secret ve müşteri verisi işlerini Claude'a ayırır. Canlıya özel komutları ve geri alma prosedürünü Claude tamamlamalıdır.

## 1. Yerel ön kontrolü çalıştırın

Proje kökünde:

```powershell
npm run check:readiness
```

npm olmadan: `node scripts/check-readiness.cjs`.

Araç gerekli dosyaların varlığını ve boş olmadığını, seçili JSON dosyalarının ayrıştırılabildiğini, Node.js >=22.13 ve Deno 2 erişimini kontrol eder. Mevcut `check-env.cjs` üzerinden `.env.example` içinde tanımlı değişken adlarının `.env.local` içinde bulunup bulunmadığını denetler. Değerleri ekrana yazmaz. Bağlantı, kurulum, webhook başlatma veya dağıtım yapmaz.

`EKSİK/HATA` varsa bildirilen dosya veya çalışma zamanı sorununu giderip tekrar çalıştırın. Çıkış kodu eksikte `1`, yerel kontroller geçtiğinde `0` olur. PowerShell'de `$LASTEXITCODE` ile görülebilir.

Bu kontrol yerel dosya düzeni içindir. Üretimde secrets manager kullanılması mümkündür; yerel `.env.local` kontrolü sunucudaki ayarların varlığını kanıtlamaz. Boş/örnek/geçersiz değerler, doğru işletme kimliği, TOML anlamı ve bağlantı yetkileri doğrulanmaz. Gerçek değerleri raporlara veya sohbete kopyalamayın.

## 2. Test kanıtlarını toplayın

```powershell
npm test
npm run test:local
```

Yerel HTTP testi için [LOCAL_TESTS.md](LOCAL_TESTS.md) gereksinimlerini tamamlayın. Eksik Deno önbelleği otomatik indirilmez. Her iki komutun başarılı çıktısını test edilen sürüm bilgisiyle kaydedin; atlanan adımları başarılı saymayın.

## 3. İşlevsel kabul testini tamamlayın

[TEST_SENARYOLARI.md](TEST_SENARYOLARI.md) listesini hayali müşteri ve test ortamıyla uygulayın. AI yanıtı, randevu ve outbound mesaj akışlarının gerçekten uygulanmış ve doğrulanmış olması gerekir. Dosyaların veya tabloların bulunması bu işlevlerin çalıştığı anlamına gelmez. Hazır olmayan bir akışla canlı müşteri testi başlatmayın.

## 4. Claude tarafından tamamlanacak açılış sırası

Aşağıdaki sıra bir kontrol listesidir; gerçek sunucuya uygulanacak komutlar ve hedefler henüz burada tanımlı değildir.

1. Açılacak özellikleri, hedef ortamı, işletmeyi ve sorumlu kişiyi kesinleştirin. [Oracle hazırlık belgesi](ORACLE_CLOUD_DEPLOYMENT_PREP.md) hedef mimariyi anlatır; çalışan kurulum kanıtı değildir.
2. Mevcut çalışan sürümü, geri dönülecek sürümü ve korunacak veriyi belirleyin. İlk kurulumsa geri dönülecek bir sürüm olmayabileceğini kaydedin.
3. Ortam, yetki, müşteri verisi izolasyonu, HTTPS ve gerçek veri kaydı kontrollerini tamamlayın. Bunların yöntemini Claude belirlemeli ve doğrulamalıdır.
4. Açılıştan önce aşağıdaki geri alma kartını doldurun ve test ortamında deneyin.
5. Onaylanan sürümü, onaylanan dağıtım prosedürüyle hazırlayın. Gerçek public HTTPS endpoint cevap vermeden Meta webhook ayarlarına URL girmeyin.
6. Kontrollü denemede mesajın alınmasını, gerçekten kaydedilmesini ve beklenen yanıtın gönderilmesini ayrı ayrı doğrulayın. HTTP `200`, kayıt başarısı anlamına gelmez.
7. Sorumlu kişinin kabulünden sonra yalnızca kararlaştırılan kapsamı açın; hata, kayıp/tekrar mesaj, yanlış yanıt ve yanlış işletmeye kayıt göstergelerini izleyin.

Mevcut reklam hesaplarına, kampanyalara ve WhatsApp müşteri geçmişine ilişkin `CLAUDE.md` kısıtları geçerlidir.

## 5. Geri alma kartı — canlı açılıştan önce doldurulmalı

| Alan | Claude ve operasyon sorumlusu tarafından tamamlanacak bilgi |
|---|---|
| Açılan sürüm ve ortam | Kesin sürüm kimliği ve hedef |
| Durdurma ölçütleri | Yanlış işletmeye kayıt, veri ifşası, kayıtsız randevu onayı, mesaj kaybı/tekrarı ve kabul edilmeyen hata düzeyi |
| Müdahale sorumlusu | Kararı verecek ve işlemi yapacak kişiler |
| İlk durdurma işlemi | Etkilenen otomatik yanıt/işlem akışını durduran doğrulanmış komut veya işlem |
| Gelen mesajların durumu | Durdurma sırasında kabul, saklama ve sonradan işleme yöntemi |
| Geri dönüş hedefi | Önceki çalışan sürüm veya ilk kurulum için doğrulanmış kapalı durum |
| Veri uyumluluğu | Önceki sürümün mevcut şemayla çalışabildiğinin kanıtı |
| Yedek ve geri yükleme | Doğrulanmış yedek, geri yükleme denemesi ve veri kaybı etkisi |
| Geri alma komutları | Ortama özel, denenmiş adımlar; secret içermeyen kayıt |
| Son kontrol | Mesaj/kayıt tutarlılığı ve yeniden açma kabul ölçütleri |

## 6. Sorun halinde izlenecek sıra

1. İlgili otomasyonun kullanımını, önceden onaylanmış durdurma yöntemiyle durdurun ve sorumluya bildirin.
2. Hatanın zamanı, sürümü ve etkisini kaydedin; müşteri verisini veya secret'ları rapora dökmeyin.
3. Kartta tanımlı geri dönüş yöntemini uygulayın. Sadece kodu geri almak veritabanı değişikliklerini veya gönderilmiş mesajları geri almaz.
4. Canlı veritabanında `supabase db reset`, gelişigüzel ters migration veya toplu silme kullanmayın. Veri geri yükleme gerekiyorsa etkisini Claude ve sorumlu değerlendirmelidir.
5. Eksik/tekrar mesajları ve randevu kayıtlarını kontrol edin; gerçek müşteriye etkisi giderilmeden sistemi yeniden açmayın.
6. Düzeltmeyi test ortamında doğrulayın, kabul testlerini tekrar edin ve yeniden açılış kararını kaydedin.

Bu kart tamamlanmadan canlı açılış ve geri almanın hazır olduğu iddia edilemez. Yerel aracın başarılı sonucu yalnızca yerel ön kontrollerin geçtiğini gösterir.
