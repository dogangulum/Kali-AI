# Canlı Mesaj Testi Kontrol Listesi

Bu belge, WhatsApp ve Instagram webhook'larının canlı ortamda test edilmesi için adım adım prosedürü açıklar.

---

## Ön Hazırlık (Test Öncesi)

### 1. Dağıtım Kontrolleri
- [ ] Supabase Edge Functions deploy edildi: `supabase functions deploy whatsapp-webhook instagram-webhook`
- [ ] Environment variables ayarlandı (Dashboard → Settings → Edge Functions):
  - `META_WHATSAPP_VERIFY_TOKEN`
  - `META_INSTAGRAM_VERIFY_TOKEN`
  - `META_APP_SECRET`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `KALI_BUSINESS_ID`
  - `ANTHROPIC_API_KEY`
- [ ] Functions URL'leri not alındı:
  - WhatsApp: `https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook`
  - Instagram: `https://<project-ref>.supabase.co/functions/v1/instagram-webhook`

### 2. Meta Developer Console Ayarları
- [ ] **WhatsApp Business API** → Configuration → Webhook:
  - Callback URL: WhatsApp function URL
  - Verify Token: `META_WHATSAPP_VERIFY_TOKEN` değeri
  - Fields: `messages`, `message_deliveries`, `message_reads`
- [ ] **Instagram Basic Display / Messenger API** → Webhooks:
  - Callback URL: Instagram function URL
  - Verify Token: `META_INSTAGRAM_VERIFY_TOKEN` değeri
  - Fields: `messages`, `messaging_postbacks`, `messaging_optins`

### 3. Test Hesapları
- [ ] **WhatsApp test numarası**: Meta Business Manager → WhatsApp Manager → Test numbers bölümünden bir test numarası seçin (veya gerçek işletme numarası)
- [ ] **Instagram test hesabı**: Meta Business Suite → Instagram accounts → test için kullanılacak sayfa/hesap

---

## Test Senaryoları (Sırayla Çalıştırın)

### Senaryo 1: Webhook Doğrulama (GET)
**Amaç**: Meta'nın webhook URL'lerini doğrulayabildiğini kanıtla

| Adım | Eylem | Beklenen Sonuç |
|------|-------|----------------|
| 1.1 | Meta Console → "Verify and Save" butonuna bas | HTTP 200, challenge değeri döner |
| 1.2 | Loglarda `WEBHOOK_VERIFIED` mesajı var mı? | Evet |

**Doğrulama komutu (manuel):**
```bash
curl "https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=test123"
# Beklenen: 200 OK, body: "test123"
```

### Senaryo 2: Gelen Metin Mesajı (WhatsApp)
**Amaç**: Uçtan uca mesaj alma → DB kaydı → AI yönlendirme → taslak cevap

| Adım | Eylem | Beklenen Sonuç |
|------|-------|----------------|
| 2.1 | Test numarasından WhatsApp'a mesaj gönder: "Merhaba, fiyatlarınız nedir?" | Mesaj alınır |
| 2.2 | 5-10 sn bekle | Function loglarında: `inbound message persisted`, `reply-agent: routed to haiku/sonnet` |
| 2.3 | Supabase Dashboard → `messages` tablosu kontrolü | `direction: inbound` kaydı var |
| 2.4 | `messages` tablosunda `direction: outbound` taslak cevap var mı? | Evet (AI cevabı taslağı) |
| 2.5 | `model_routing_log` tablosunda kayıt var mı? | Evet (model, cost, latency) |
| 2.6 | `conversations` tablosunda `summary` güncellendi mi? | Evet (ilk mesajda özet oluşturulur) |

### Senaryo 3: Gelen Metin Mesajı (Instagram)
**Amaç**: Instagram DM akışı çalışıyor mu

| Adım | Eylem | Beklenen Sonuç |
|------|-------|----------------|
| 3.1 | Test Instagram hesabından sayfaya DM gönder: "Randevu saatleriniz?" | Mesaj alınır |
| 3.2 | 5-10 sn bekle | Function loglarında inbound/outbound kayıtları |
| 3.3 | `messages` tablosunda `platform: instagram` kayıtları var mı? | Evet |

### Senaryo 4: İmza Doğrulama (POST Security)
**Amaç**: Sadece Meta'dan gelen isteklerin kabul edildiğini doğrula

| Adım | Eylem | Beklenen Sonuç |
|------|-------|----------------|
| 4.1 | İmzasız POST gönder (curl ile) | HTTP 401 Unauthorized |
| 4.2 | Yanlış imza ile POST gönder | HTTP 401 Unauthorized |
| 4.3 | Doğru imza ile POST gönder | HTTP 200, `{"received":true}` |

**İmzalı test komutu:**
```bash
# scripts/simulate-webhook.cjs kullanın (yerel test için)
# Canlı için: Meta Console'dan "Send Test Notification" kullanın
```

### Senario 5: Rate Limiting
**Amaç**: Aşırı istek koruması çalışıyor mu

| Adım | Eylem | Beklenen Sonuç |
|------|-------|----------------|
| 5.1 | Aynı numaradan 35+ ardışık mesaj gönder | 31. mesajdan itibaren HTTP 429 |
| 5.2 | 60 sn bekle | Limit sıfırlanır, tekrar 200 döner |

### Senaryo 6: Randevu Akışı (İsteğe Bağlı)
**Amaç**: Lead qualification → randevu teklifi → onay akışı

| Adım | Mesaj Dizisi | Kontrol |
|------|--------------|---------|
| 6.1 | "Merhaba" | Karşılama gelir |
| 6.2 | "El bakımı fiyatı ne kadar?" | Fiyat + süre cevabı (Haiku) |
| 6.3 | "Yarın 14:00 müsait mi?" | Uygunluk kontrolü + teklif (Sonnet) |
| 6.4 | "Tamam, onaylıyorum" | Randevu `confirmed` kaydı oluşur |
| 6.5 | "Randevum ne zamandı?" | Konuşma özeti ile tutarlı cevap |

**Veritabanı kontrolleri (her adımda):**
- `appointments` tablosunda `status: confirmed` kaydı
- `funnel_events` tablosunda `qualified`, `booking_offered`, `booking_confirmed` eventleri

---

## Sonuç Kontrol Nereden Yapılır

| Kaynak | Ne Kontrol Edilir | Erişim |
|--------|-------------------|--------|
| **Supabase Dashboard → Logs → Edge Functions** | Function stdout/stderr, hatalar, latency | `https://supabase.com/dashboard/project/<ref>/functions` |
| **Supabase Dashboard → Table Editor** | `messages`, `conversations`, `appointments`, `model_routing_log`, `funnel_events`, `audit_log` | `https://supabase.com/dashboard/project/<ref>/editor` |
| **Meta Developer Console → Webhook Logs** | Meta tarafında gönderilen/başarısız istekler | `developers.facebook.com` → App → Webhooks |
| **Function Metrics** | Invocation count, error rate, latency p50/p95 | Dashboard → Functions → Metrics |

---

## Yaygın Sorunlar ve Çözümler

| Sorun | Neden | Çözüm |
|-------|-------|-------|
| 403 Forbidden (GET) | Verify token uyuşmazlığı | Env var vs Meta Console aynı mı kontrol et |
| 401 Unauthorized (POST) | İmza hesaplama hatası | `META_APP_SECRET` doğru mu? Body raw mi? |
| Mesaj gelmiyor | Webhook URL yanlış / SSL sorunu | `https://` ile başlıyor mu? Domain erişilebilir mi? |
| AI cevabı gelmiyor | `ANTHROPIC_API_KEY` eksik/yanlış | Env var ayarlı mı? Quota var mı? |
| DB yazma hatası | RLS policy / service role | Service role key kullanılıyor mu? |
| Rate limit çalışmıyor | IP header eksik | `x-forwarded-for` header'ı geliyor mu? |

---

## Test Sonrası Temizlik

- [ ] Test mesajları `messages` tablosundan silindi (veya `test_run_<timestamp>` tag ile işaretlendi)
- [ ] Test randevuları `appointments` tablosundan silindi
- [ ] `funnel_events` / `audit_log` test kayıtları temizlendi
- [ ] Meta Console'dan test webhook URL'i kaldırıldı / production URL ile değiştirildi

---

## İmza

| Test Eden | Tarih | Ortam | Notlar |
|-----------|-------|-------|--------|
| | | Production / Staging | |

---

**Not**: Bu liste `docs/TEST_SENARYOLARI.md` içindeki detaylı müşteri senaryolarının canlı ortam uyarlamasıdır. Tam kabul kriterleri için o belgedeki tabloları kullanın.