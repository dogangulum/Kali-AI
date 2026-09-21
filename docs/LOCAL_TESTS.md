# Tek komutla yerel webhook testi

## 1. Gereksinimleri kontrol edin

PowerShell'de proje köküne geçin:

```powershell
Set-Location "D:\Kali Beauty\Kali-AI"
node --version
deno --version
```

Node.js 22.13 veya üzeri ve PATH üzerinde Deno 2 gerekir. Test sırasında `8000` portu boş olmalıdır; önceden başlattığınız webhook varsa kendi terminalinde `Ctrl+C` ile kapatın. Araç başka bir süreci kapatmaz.

Webhook'ların kullandığı `npm:@supabase/supabase-js@2` paketinin Deno önbelleğinde bulunması gerekir. Birleşik araç `--cached-only` ile çalışır ve eksik paketleri indirmez. Önbellek eksikse başlatma adımında Deno'nun hata mesajını gösterir. Gerekirse **ayrı bir ilk hazırlık adımı olarak, internet bağlantısıyla** şu komutu çalıştırın:

```powershell
deno cache --no-config --no-lock supabase/functions/whatsapp-webhook/index.ts supabase/functions/instagram-webhook/index.ts
```

Bu hazırlık paket indirir; webhook sunucusunu çalıştırmaz. Test aracı için `npm install`, Docker, Supabase hesabı veya gerçek Meta anahtarı gerekmez.

## 2. Testi başlatın

```powershell
npm run test:local
```

npm kullanmadan eşdeğeri:

```powershell
node scripts/run-local-tests.cjs
```

Başka terminalde sunucu başlatmanız veya ortam değişkeni girmeniz gerekmez. Araç sırasıyla:

1. Node.js sürümünü ve beş örnek JSON dosyasını kontrol eder.
2. Mevcut WhatsApp/Instagram Node.js davranış testlerini çalıştırır.
3. Deno 2'nin erişilebilir olduğunu kontrol eder.
4. WhatsApp webhook'unu başlatır ve GET challenge yanıtını doğrular.
5. Mevcut `simulate-webhook.cjs` ile WhatsApp metin, görsel ve okundu örneklerini gönderir; HTTP `200` ve `received: true` bekler. Bozuk imza denemesinde HTTP `401` ve `Unauthorized` bekler.
6. WhatsApp sürecini kapatır; Instagram için aynı akışı metin ve görsel örnekleriyle tekrarlar.
7. Açtığı süreçleri kapatır ve sonuç özetini gösterir.

## 3. Sonucu okuyun

Her adım `[BAŞARILI]` veya `[SORUN]` olarak yazdırılır. Tüm adımlar geçerse **HEPSİ BAŞARILI**, aksi durumda **ŞURADA SORUN VAR** ve başarısız adımların adları görünür. Ön koşul eksikse HTTP denemeleri `[ATLANDI]` olarak belirtilir ve genel sonuç başarısızdır.

Çıkış kodu başarıda `0`, hatada `1` olur. PowerShell'de hemen ardından `$LASTEXITCODE` ile kontrol edebilirsiniz. `Ctrl+C` testi iptal eder ve aracın açtığı süreçleri kapatır. Alt komutlar için süre sınırı vardır; takılan mesaj gönderimi sonsuza kadar beklenmez.

Sık görülen hatalar:

| Adım / hata | Yapılacak işlem |
| --- | --- |
| Deno başlatılamadı | Deno 2'nin kurulu ve PATH üzerinde olduğunu kontrol edin; terminali yeniden açın. |
| 8000 portu kullanılamıyor | Önceden açık yerel webhook'u kendi terminalinden kapatın. |
| Webhook başlatılamadı / paket önbellekte yok | Yukarıdaki ayrı önbellek hazırlığını yapın. |
| Beklenen HTTP yanıtı alınmadı | Rapordaki kanal, örnek dosya, durum kodu ve yanıt gövdesini inceleyin. |
| Node.js davranış testleri | Hata çıktısındaki başarısız test adını inceleyin. |

## Kapsam

Araç imza üretimini yeniden yazmaz; mevcut göndericiyi kullanır. `.env` ve `.env.local` okumaz; alt süreçlere yalnızca çalıştırma için gereken sistem yollarını ve mevcut sahte test değerlerini aktarır. Supabase bağlantı değişkenlerini aktarmaz. Deno ağ izni yerel `8000` portuyla sınırlıdır; uygulama veya webhook güvenlik kodu değiştirilmez.

`check-env.cjs` gerçek yerel ortam dosyasını okuduğu, `check-webhooks.cjs` ise yapılandırılmış uzak adreslere istek gönderebildiği için bu yerel akışta çalıştırılmaz. GET kontrolünü birleşik araç yalnızca kendi başlattığı localhost sunucusunda yapar.

Başarı, yerel HTTP alımını ve mevcut davranış testlerini doğrular. Gerçek Meta teslimatını, veritabanına kaydı, RLS'yi veya AI yanıtlarını doğrulamaz. Webhook veritabanı hatasında da `200` dönebildiğinden bu sonuç bir veritabanı testi olarak yorumlanmamalıdır.
