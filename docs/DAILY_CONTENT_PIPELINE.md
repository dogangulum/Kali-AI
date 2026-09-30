# Günlük İçerik Hattı — Kurallar, Yapı ve Kurulum

Her gün 1 story + 1 post + 1 Reel'in, insan onayıyla otomatik yayınlanması. Bu belge kuralları, kodun neresinde uygulandığını ve canlıya alma adımlarını anlatır.

## Akış

1. **Konu seçimi:** Hizmetler sırayla döner (en uzun süredir işlenmeyen hizmet önce). O hizmette daha önce kullanılmamış bir alt konu seçilir. Hepsi kullanıldıysa üretici yeni bir alt konu uydurur ve eskileri tekrarlamaz. Kod: `pickNextTopic`.
2. **Rakip analizi:** Rakip videosundan sadece senaryo ve kurgu yapısı alınır (kamera hareketi, ritim, anlatı), görüntü alınmaz. Uygun olmayan video reddedilir, başkası seçilir. Kabul edilen de reddedilen de `competitor_analyses` tablosuna yazılır. Aynı video bir daha asla kullanılmaz. Kod: `unseenCompetitorSources`.
3. **Üretim:** Görsel üretilir, CapCut'ta `candidates_per_day` (varsayılan 3) video yapılır, ElevenLabs seslendirmesi eklenip birleştirilir.
4. **Seçim (öğrenen):** Adaylar sabit kuralla değil, geçmişe göre puanlanır. Onay/değiştir kararları ve yayın performansı her özelliğe (kanca tipi, ses, müzik, senaryo...) ağırlık verir. Hiç denenmemiş stile küçük bir keşif puanı verilir. Kod: `candidateReward`, `learnFeatureWeights`, `scoreCandidates`.
5. **Onay (Telegram):** Taslak onaylayıcıya **Onayla / Değiştir** butonlarıyla gider. Değiştir'e basılırsa seçenekler çıkar: Seslendirme, Video, Metin, Etiketler, Müzik, Hepsini yeniden yap. Sadece seçilen katman yeniden üretilir.
6. **Yayın:** En iyi saat, Instagram performansından öğrenilir (bir saatte en az 3 örnek olmalı). Veri yoksa config'teki varsayılan saat kullanılır. Kod: `bestPublishTime`.

## Onay zamanlama kuralları

| Durum | Ne olur |
|---|---|
| Yayına 3 saat kala cevap yok | Bir kez hatırlatma gider. Taslak geç geldiyse gönderimden en az 1 saat sonra gider. |
| Gün bitti, cevap yok | O gün yayın yapılmaz, plan `expired` olur. Video **silinmez**. |
| Aynı gün, yayın saatinden önce onay | Planlanan saatte yayınlanır. |
| Aynı gün, yayın saati geçmişken onay | Hemen yayınlanır. |
| Gün geçtikten sonra onay | `queued` kuyruğuna girer. Ertesi gün yeni içerikten önce ilk o yayınlanır. |
| Butona iki kez basma | İkinci basış "zaten karar verildi" der, çift işlem olmaz. |

Otomatik onay yoktur, insan onayı her zaman akışta kalır.

## Hata ve kredi kuralları

- **CapCut hatası:** Sistem ekran görüntüsü alır, sayfayı okur, seçicileri yeniler ve tekrar dener. 3. başarısız denemeden sonra Telegram'dan haber verir. Her deneme `automation_attempts` tablosuna yazılır. Kod: `retryDecision`.
- **Krediler:** CapCut ve ElevenLabs hesapları ortak `generation_accounts` tablosunda tutulur. Kredisi yetmeyen hesap atlanıp sıradakine geçilir. Günlük veya aylık sıfırlanma hesaba katılır. Kod: `pickAccount`.
- **Kaç günlük kredi:** Telegram'da `/kredi` yazınca her sağlayıcı için "yaklaşık N gün yeter" cevabı gelir. N, 7 günün altına düşünce günde en fazla bir kez uyarı gönderilir. Kod: `estimateCreditDays`.
- Hesap şifreleri veritabanında **tutulmaz**. `credential_ref` alanında yalnızca Oracle sunucusundaki secret'ın adı yazar.

## Dosyalar

| Dosya | Görev |
|---|---|
| `supabase/migrations/20260929120000_daily_content_pipeline.sql` | Yeni tablolar (sadece ekleme, mevcut veriye dokunmaz) |
| `supabase/functions/_shared/content-rules.ts` | Tüm kurallar (saf mantık, I/O yok) |
| `supabase/functions/_shared/content-approval-agent.ts` | Telegram buton işleme ve zamanlayıcı |
| `supabase/functions/_shared/telegram.ts` | Telegram API yardımcıları, buton yapısı, secret kontrolü |
| `supabase/functions/telegram-approval-webhook/` | Telegram'ın çağırdığı uç nokta |
| `supabase/functions/content-scheduler/` | pg_cron'un 5 dakikada bir çağırdığı uç nokta |
| `tests/content-pipeline.test.cjs`, `tests/worker-daily-run.test.cjs` | 29 test |
| `worker/` | Oracle'da çalışan günlük üretim/yayın worker'ı |

## İşletme ayarı (`business_config.config.content_pipeline`)

Kod işletmeye özel hiçbir şey içermez. Kali Beauty için ayar aşağıda. Alt konular başlangıç önerisidir, istediğin gibi düzenleyebilirsin.

```sql
update business_config
set config = config || jsonb_build_object('content_pipeline', '{
  "services": [
    {"key": "nail", "name": "Tırnak", "sub_topics": ["Protez tırnak", "Kalıcı oje", "Nail art trendleri", "Tırnak bakımı"]},
    {"key": "skincare", "name": "Cilt bakımı", "sub_topics": ["Hydrafacial", "Kış cilt bakımı", "Leke tedavisi", "Akne bakımı"]},
    {"key": "epilation", "name": "Epilasyon", "sub_topics": ["Ayak epilasyonu", "Koltuk altı epilasyonu", "Yüz epilasyonu", "Tüm vücut"]},
    {"key": "pmu", "name": "Kalıcı makyaj", "sub_topics": ["Microblading", "Dudak renklendirme", "Eyeliner", "Kaş laminasyonu"]},
    {"key": "slimming", "name": "Bölgesel incelme", "sub_topics": ["Selülit", "Karın bölgesi", "Basen bölgesi", "Sıkılaşma"]}
  ],
  "candidates_per_day": 3,
  "reminder_hours_before": 3,
  "max_attempts": 3,
  "credit_warning_days": 7,
  "default_publish_times": {"story": "10:00", "post": "13:00", "reel": "19:00"},
  "approver_telegram_chat_ids": ["<EŞİNİN_TELEGRAM_CHAT_ID>"]
}'::jsonb)
where business_id = '<KALI_BUSINESS_ID>';
```

## Canlıya alma (sırayla)

1. Migration'ı uygula: `supabase db push` (veya SQL Editor'de dosyayı çalıştır).
2. Yukarıdaki ayar SQL'ini çalıştır.
3. Telegram'da @BotFather ile bot oluştur. Eşin bota `/start` yazsın, chat id'si ayara eklensin.
4. Supabase secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (rastgele uzun metin), `CONTENT_SCHEDULER_SECRET` (rastgele uzun metin). `KALI_BUSINESS_ID` zaten var.
5. Fonksiyonları deploy et: `supabase functions deploy telegram-approval-webhook --no-verify-jwt` ve `supabase functions deploy content-scheduler --no-verify-jwt`. İkisi de kendi secret başlığıyla korunur.
6. Telegram webhook'u bağla: `setWebhook` çağrısı, `url` = fonksiyon adresi, `secret_token` = `TELEGRAM_WEBHOOK_SECRET`.
7. pg_cron işi (5 dakikada bir):

```sql
select cron.schedule('content-scheduler-every-5-min', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://aldqtwrrkjtucpsgjrus.supabase.co/functions/v1/content-scheduler',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'X-Scheduler-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'content_scheduler_secret')),
    body := '{}'::jsonb);
$$);
```

(`content_scheduler_secret` Supabase Vault'a aynı değerle eklenir.)

## Oracle worker (`worker/`)

`systemd/kali-ai-content.timer` her gün 07:30'da, ayrıca 08:05–22:05 arasında saat başı `worker/index.cjs`'i çalıştırır. Her çalışmada şu sırayla ilerler:

1. Onaylanıp vakti gelen içerikleri yayınlar. `queued` kuyruğundakiler her zaman önce gider.
2. Açık "Değiştir" taleplerini işler. Sadece seçilen katman yeniden üretilir ve yeni taslak Telegram'a gider.
3. Bugünün planı yoksa oluşturur: konu seçer, rakip senaryosunu bulur, 3 aday üretir, öğrenen puanlamayla birini seçer ve taslağı gönderir. Plan varsa bu adımı atlar, yani aynı gün iki kez çalışmak güvenlidir.

Saatlik çalıştığı için yayın, planlanan saatten en fazla ~1 saat sonra gerçekleşir (19:00 slotu → 19:05).

- `worker/lib/retry-runner.cjs`: Her adım 3 kez denenir. Her hatada ekran görüntüsü alınır ve 2. denemeden itibaren seçiciler yenilenir. Sonunda Telegram uyarısı gider.
- `worker/lib/credit-pool.cjs`: Sağlayıcı `OUT_OF_CREDIT` döndürürse sıradaki hesaba geçilir. Hiç hesap kalmazsa plan `failed` olur ve "yeni hesap eklenmeli" uyarısı gider.
- `worker/providers/index.cjs`: Dış servis bağlantıları. **Henüz hepsi boş (NOT_IMPLEMENTED).** Bağlanmadan worker çalışırsa planı `failed` yapar ve Telegram'dan haber verir, yarım iş yapmaz.

## Sağlayıcılar (`worker/providers/`)

| Adım | Nasıl | Durum |
|---|---|---|
| Rakip videoları | Instagram Graph API `business_discovery`: resmi yol, sadece açık işletme/içerik üreticisi hesapları. Hesaplar `competitor_instagram_usernames` ayarından okunur. | Yazıldı, testli |
| Rakip analizi | Videodan 6 kare çıkarılır (ffmpeg), kareler ve açıklama Claude'a verilir. Uygunluk kararı ve senaryo iskeleti gelir. | Yazıldı, testli |
| Metin / hashtag / seslendirme metni / yeni alt konu | Claude API | Yazıldı, testli |
| Kaynak görsel | Şimdilik Storage'daki `reference/` klasöründen eşinin fotoğrafları sırayla seçilir. AI görsel üretici seçilince buraya takılacak. | Yazıldı, testli |
| Video | CapCut web, headless Chromium. Her hesabın kendi oturumu var. Hata olunca Claude ekran görüntüsünden seçiciyi yeniler. | Yazıldı, sahte tarayıcıyla testli. **Gerçek CapCut'ta henüz denenmedi.** |
| Seslendirme | ElevenLabs API. Kota hatasında sıradaki hesaba geçilir. | Yazıldı, testli |
| Müzik | Storage `music/<ruh-hali>/` klasöründen seçilir, son kullanılanlar tekrar edilmez. Klasör boşsa sadece seslendirme kullanılır. | Yazıldı, testli |
| Birleştirme | ffmpeg: video + ses + döngülü müzik. Çıktı H.264/AAC, Instagram'a uygun. | Gerçek ffmpeg ile testli |
| Yayın | Graph API: Reel, aynı videodan Story, kaynak görselden Post. Her format yayınlandığı an kaydedilir, tekrar denemede çift paylaşım olmaz. | Yazıldı, testli |
| Performans | Yayından 24 saat ile 7 gün sonrası arasında günde bir kez insights çekilir. Öğrenen seçim ve en iyi saat bu veriyle besleniyor. | Yazıldı |

Worker durumunu (CapCut oturumları, düzeltilmiş seçiciler) repo dışında, `/var/lib/kali-ai/state` altında tutar. Bu yüzden deploy'daki `git clean` bu dosyaları silmez.

### Ek ayarlar (`content_pipeline` içine)

```json
{
  "brand_name": "Kali Beauty Center",
  "city": "Mersin",
  "competitor_instagram_usernames": ["<rakip1>", "<rakip2>"],
  "elevenlabs_voice_id": "<ses id>",
  "music_volume": 0.15,
  "capcut_credits_per_video": 1,
  "caption_rules": ["Fiyat yazma", "DM'e yönlendir"]
}
```

## Rakip videoları: ayrı hesapla tarama (yedek yol)

Resmi yol Graph API `business_discovery`'dir. Meta uygulamasının bu erişimi yoksa (hata `#10`), worker rakip videolarını **ayrı bir Instagram hesabıyla** `instagrapi` üzerinden alır (`worker/scripts/ig_scraper.py`).

- Bu yol Instagram kullanım şartlarına aykırıdır; hesap kilitlenebilir. Bu yüzden **salonun hesabı asla kullanılmaz**; sadece bu iş için açılmış bir hesap (`IG_SCRAPER_USERNAME` / `IG_SCRAPER_PASSWORD`).
- Günde bir kez, rakip başına 8–20 sn bekleyerek son 30 paylaşıma bakar. Oturum `/var/lib/kali-ai/state/ig-scraper-session.json` içinde tutulur (her seferinde yeniden giriş yapılmaz).
- Videolar sadece kare analizi için okunur, indirilip saklanmaz ve paylaşılmaz.
- Giriş/doğrulama sorunu olursa Telegram'a "Rakip videoları alınamadı" mesajı gelir ve o gün video konudan üretilir.
- Graph API izni açıldığında worker kendiliğinden resmi yolu kullanır; yedek yol devreye girmez.

## Senin yapman gerekenler (tek seferlik)

1. Kodu GitHub'a al (yama dosyası veya repoya erişim ver).
2. Supabase: migration + `content_pipeline` ayarı (yukarıdaki SQL'ler).
3. Telegram: [@BotFather](https://t.me/BotFather) ile bot oluştur ve token'ı sunucuya koy. Eşin bota `/start` yazsın, ardından `node scripts/setup-telegram.cjs chats` komutu chat id'yi verir. Sonra `node scripts/setup-telegram.cjs webhook <fonksiyon-url>` ile webhook'u kur.
4. Storage `content` kovası: `reference/` klasörüne eşinin 20-30 fotoğrafını, salon ve logo görsellerini yükle. `music/enerjik/`, `music/sakin/` gibi klasörlere telifsiz müzik koy.
5. Sunucu: `.env.local`'a değerleri gir. Sonra `sudo bash scripts/setup-content-worker.sh` çalıştır.
6. CapCut: her hesap için bilgisayarında `node worker/scripts/capcut-login.cjs cc1` çalıştır. Çıkan `.state.json` dosyasını sunucuda `/var/lib/kali-ai/state/capcut-profiles/` klasörüne koy. Hesapları `node worker/scripts/accounts.cjs add capcut cc1 CAPCUT_CC1 10 daily 1` ile havuza ekle. ElevenLabs için de aynısını `ELEVENLABS_KEY_1` ile yap.
7. İlk deneme: `sudo systemctl start kali-ai-content`. CapCut adımı ilk çalışmada büyük ihtimalle seçici düzeltmesi isteyecek. Ekran görüntüleri Storage'da `screenshots/` altına düşer.
