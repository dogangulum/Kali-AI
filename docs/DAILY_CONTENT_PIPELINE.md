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

## Sonraki aşama (sağlayıcılar)

Sırayla: `publish` (Instagram Graph API), `writeCaption`/`inventSubTopic`/`analyzeCompetitor` (Claude API), `generateVoiceover` (ElevenLabs API), `merge` (ffmpeg), `generateImage`, `generateVideo` (CapCut headless Chromium), `findCompetitorVideos`.
