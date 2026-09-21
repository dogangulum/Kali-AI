# Webhook testleri

WhatsApp ve Instagram'ın `supabase/functions/` altındaki gerçek TypeScript dosyaları için ortak davranış testleri. Her senaryo yeni bir VM bağlamında çalışır; ortam değişkenleri, saat ve `Deno.serve` test karşılıklarıyla sağlanır. Handler doğrudan çağrılır; HTTP sunucusu açılmaz ve ağ isteği gönderilmez. `.env` dosyaları veya gerçek anahtarlar okunmaz. Uygulama dosyasının davranışı değiştirilmez; yalnızca gerçek `import` satırı, Node'un `vm` modülünde script olarak çalıştırılabilmesi için test yüklemesi sırasında sahte bir modül referansıyla değiştirilir (bkz. aşağıdaki not).

## Kapsam

- Doğru, yanlış, boş ve eksik doğrulama token'ı; yanlış/eksik `hub.mode`.
- Geçerli UTF-8 gövde imzası; eksik, sahte, bozuk ve farklı anahtarla üretilmiş imzalar.
- İmzalandıktan sonra değiştirilmiş gövde; eksik uygulama sırrı.
- Geçersiz JSON, imza kontrolünün önceliği ve desteklenmeyen HTTP metodu.
- GET ve POST için 30 istek sınırı, 31. isteğin engellenmesi, 60 saniye sınırında yeniden kabul.
- Farklı IP kovaları, ortak GET/POST sayacı, reddedilen isteklerin sayılması ve IP başlığı bulunmaması.
- Gelen mesajın veritabanına yazılması: yeni conversation/message oluşturma, aynı gönderenden ikinci mesajda mevcut conversation'ın yeniden kullanılması, metin olmayan mesajların JSON olarak saklanması, mesaj içermeyen olayların (durum/okundu bildirimi) hiçbir şey yazmaması, `SUPABASE_URL`/`KALI_BUSINESS_ID` tanımsızken yazmanın atlanması ve veritabanı hatasında yine de `200` dönülüp hatanın loglanması. Eksik yapılandırma durumunda handler `console.error` ile kayıt bırakır; test ortamında bu çıktı yakalanır.

İmzalar test tarafında Node.js `createHmac` ile hesaplanır; uygulama kendi Web Crypto doğrulama kodunu çalıştırır. Zaman sanal olarak ilerletilir; testler gerçek 60 saniyelik bekleme yapmaz. Tüm değerler sahtedir. Supabase istemcisi de sahte: `tests/helpers/webhook-suite.cjs` içindeki `createMockSupabase`, gerçek ağ/DB'ye dokunmadan `conversations`/`messages` sorgu şeklini bellekte taklit eder; uygulama kodundaki gerçek `npm:@supabase/supabase-js@2` importu, VM içinde script olarak çalıştırılabilmesi için test tarafında bu sahte modüle yönlendirilir (uygulama dosyasının kendisi değişmez).

## Daha sonra çalıştırmak için

Node.js **22.13 veya üzeri** gerekir (`node:module.stripTypeScriptTypes` API'si). Harici paket kurulumu gerekmez. Proje kökünden:

```powershell
node --test tests/whatsapp-webhook.test.cjs tests/instagram-webhook.test.cjs
```

`package.json` aynı testler için `npm test` kısayolunu tanımlar. `deno task test` ayrı bir Deno görevidir; mevcut Node.js testlerinin çalıştırma komutu değildir.

Node sürümüne bağlı olarak TypeScript dönüştürme API'si deneysel özellik uyarısı verebilir.

Bu testler Supabase gateway, gerçek Meta teslimatı, proxy başlıklarının güvenilirliği, dağıtık istek sınırlama veya canlı dağıtımı doğrulamaz. Veritabanı yazma mantığı yalnızca sahte (in-memory) bir Supabase istemcisine karşı test edilir; gerçek Postgres/RLS davranışı, migration'ın uygulanıp uygulanmadığı veya `KALI_BUSINESS_ID`'nin doğru değere ayarlanmış olması bu testlerle doğrulanmaz. `api/whatsapp-webhook.js` taslağı kapsam dışındadır. Testlerin geçmesi tek başına üretim güvenliği onayı değildir.
