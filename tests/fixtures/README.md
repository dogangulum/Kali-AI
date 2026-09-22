# Webhook Test Fixtures — Kapsamlı Dizin

Bu klasör, Meta (WhatsApp/Instagram) webhook'larından gelen gerçekçi payload örneklerini içerir. Her dosya `tests/helpers/webhook-suite.cjs` test harness'i ile çalışacak şekilde hazırlanmıştır.

## Toplam: 68 fixture dosyası

---

## 1. Temel Mesaj Tipleri (5 dosya)

| Dosya | Kanal | Mesaj Türü | Açıklama |
|-------|-------|------------|----------|
| `whatsapp-text-message.json` | WhatsApp | Text | Temel metin mesajı — randevu isteği/soru |
| `whatsapp-image-message.json` | WhatsApp | Image | Görsel + caption (referans fotoğrafı) |
| `whatsapp-read-receipt.json` | WhatsApp | Status | `read` durumu — mesaj okundu bildirimi |
| `instagram-text-message.json` | Instagram | Text | DM metin mesajı — fiyat/saat sorgusu |
| `instagram-image-message.json` | Instagram | Image | DM görsel ekli mesaj — referans tasarımı |

---

## 2. Müşteri Davranış Senaryoları (4 dosya)

| Dosya | Mesaj | Test Amacı |
|-------|-------|------------|
| `whatsapp-price-objection.json` | "Biraz pahalı geldi." | İtiraz karşılama — indirim uydurmama |
| `whatsapp-appointment-request.json` | "O zaman gelecek salı 14.00 olur mu?" | Tarih netleştirme & uygunluk kontrolü |
| `whatsapp-off-topic-message.json` | "Bana şiir yaz." | Alakasız istek — kibarca yönlendirme |
| `whatsapp-human-handoff.json` | "Bir yetkiliyle konuşmak istiyorum." | İnsan devri tetikleme |

---

## 3. Randevu — Temel Akış (14 dosya)

| Dosya | Mesaj | Senaryo |
|-------|-------|---------|
| `whatsapp-booking-greeting.json` | "Merhaba" | Karşılama — konuşma başlangıcı |
| `whatsapp-booking-earliest.json` | "Manikür için en erken boş saatiniz ne zaman?" | En yakın müsait slot sorgusu |
| `whatsapp-booking-adjacent.json` | "Yarın 16'da manikür olur mu?" | Belirli tarih/saat isteği |
| `whatsapp-booking-relative-date.json` | "Bu hafta Cuma günü ne zaman müsaitsiniz?" | Göreceli tarih (bu hafta/gelecek hafta) |
| `whatsapp-booking-two-dates.json` | "15 veya 16 Nisan, hangisi müsait?" | İki alternatif tarih sunma |
| `whatsapp-booking-two-services.json` | "Manikür ve pedikür aynı saatte olabilir mi?" | Birden fazla hizmet — süre/toplam kontrolü |
| `whatsapp-booking-package.json` | "El bakımı + tırnak paketi var mı, fiyatı ne?" | Paket/hizmet kombinasyonu sorgusu |
| `whatsapp-booking-valid-confirm.json` | "Evet, 14:00 onaylıyorum." | Kesin onay — randevu oluşturma |
| `whatsapp-booking-bare-confirm.json` | "Tamam." | Belirsiz onay — hangi randevu netleştirme |
| `whatsapp-booking-simultaneous-confirm.json` | (İki müşteri aynı saati onaylar) | Çakışma — iki ayrı bağlam, aynı slot |
| `whatsapp-booking-friend.json` | "Yarın 15'te arkadaşım da gelsin, iki kişi." | İkinci kişi ekleme — kapasite kontrolü |
| `whatsapp-booking-change-service.json` | "El bakımından vazgeçtim, sadece manikür olsun." | Hizmet değiştirme — süre/fiyat güncelleme |
| `whatsapp-booking-reschedule.json` | "14:00 değil, 15:00 yapalım." | Erteleme — yeni slot uygunluğu |
| `whatsapp-booking-decline.json` | "Yarın olmaz, şimdilik randevudan vazgeçtim." | Red — randevu oluşturulmaması |

---

## 4. Randevu — Sınır & Hata Durumları (18 dosya)

| Dosya | Mesaj | Senaryo |
|-------|-------|---------|
| `whatsapp-booking-closed-day.json` | "Pazar 14:00 randevu olsun." | Kapalı gün — alternatif sunma |
| `whatsapp-booking-outside-hours.json` | "Gece 22:00 randevu alabilir miyim?" | Çalışma saati dışı — reddetme/alternatif |
| `whatsapp-booking-overruns-close.json` | "Kapanıştan 15 dk önce 1 saaatlik işlem istiyorum." | Kapanışı aşan süre — reddetme |
| `whatsapp-booking-break.json` | "Mola saatinizde randevu verilebilir mi?" | Mola aralığı — uygunluk kontrolü |
| `whatsapp-booking-midnight.json` | (Gece yarısı saat testi) | Tarih/saat sınırı — gece yarısı geçişi |
| `whatsapp-booking-past-date.json` | "Geçen hafta Salı için randevu." | Geçmiş tarih — reddetme |
| `whatsapp-booking-past-today.json` | "Bugün sabah için randevu." | Bugün geçmiş saat — reddetme |
| `whatsapp-booking-invalid-date.json` | "31 Şubat için randevu." | Geçersiz tarih — hata yönetimi |
| `whatsapp-booking-earliest.json` | "En erken ne zaman?" | Boş slot sorgusu |
| `whatsapp-booking-own-conflict.json` | "Aynı saatte zaten randevum var, yine o saatte." | Kendi çakışması — mevcut randevu koruma |
| `whatsapp-booking-other-conflict.json` | (Başka müşterinin randevusu dolu) | Başka müşteri çakışması — alternatif |
| `whatsapp-booking-two-offers.json` | "14:00 ve 15:00 teklif ettiniz, 15:00 seçiyorum." | Çoklu teklif — seçim netleştirme |
| `whatsapp-booking-score-repeat.json` | (Tekrar aynı puanlama tetikleyicisi) | Puanlama tekrarı — idempotent davranış |
| `whatsapp-booking-same-day-separate.json` | "Aynı gün ama ayrı saatlerde iki randevu." | Aynı gün birden fazla randevu |
| `whatsapp-booking-same-text-new-id.json` | (Aynı metin, farklı mesaj ID) | Duplicate teslimat — idempotent işleme |
| `whatsapp-booking-retry.json` | (Aynı ID ile ikinci teslimat) | Yeniden deneme — tekrar engelleme |
| `whatsapp-booking-stale-confirm.json` | (Eski teklifi onaylama) | Süresi dolmuş teklif — reddetme |
| `whatsapp-booking-stop-contact.json` | "Beni aramayın/yazmayın." | İletişim durdurma — opt-out |

---

## 5. Randevu — İptal & Değişiklik (6 dosya)

| Dosya | Mesaj | Senaryo |
|-------|-------|---------|
| `whatsapp-booking-cancel.json` | "Yarınki randevumu iptal etmek istiyorum." | İptal talebi — doğru randevu bulma |
| `whatsapp-booking-no-show.json` | (Müşteri gelmedi) | Gelmeme — durum güncelleme |
| `whatsapp-booking-late.json` | "Yolda oldum, 15 dk geç kalacağım." | Geç kalma — tolerans/esneklik |
| `whatsapp-booking-age.json` | "Yaşım 16, veli izniyle yapabilir miyim?" | Yaş kısıtı — politika kontrolü |
| `whatsapp-booking-guarantee.json` | "Tek seansta kesin sonuç garantisi veriyor musunuz?" | Garanti vaadi — gerçekçi cevap |
| `whatsapp-booking-health.json` | "Hamileyim, bu işlem bana kesin güvenli mi?" | Sağlık durumu — teşhis yapmama/yonlendirme |

---

## 6. İtiraz, Pazarlık & Karşılaştırma (5 dosya)

| Dosya | Mesaj | Senaryo |
|-------|-------|---------|
| `whatsapp-booking-price-only.json` | "Sadece fiyatı söyler misiniz?" | Sadece fiyat — hizmet bağlamı olmadan |
| `whatsapp-booking-price-comparison.json` | "Başka yerde 200 TL uygun." | Rekabet karşılaştırması — baskı yapmama |
| `whatsapp-booking-discount-demand.json` | "Yarı fiyatına yaparsanız hemen gelirim." | İndirim talebi — tanımlı olmayan indirim |
| `whatsapp-booking-complaint.json` | "Son işlemden hiç memnun kalmadım!" | Şikayet — ciddiye alma/savunmamaz |
| `whatsapp-booking-wrong-channel.json` | (Yanlış kanaldan gelen) | Kanal uyuşmazlığı — yönlendirme |

---

## 7. Belirsizlik & Netleştirme (5 dosya)

| Dosya | Mesaj | Senaryo |
|-------|-------|---------|
| `whatsapp-booking-ambiguous.json` | "Şey için yazmıştım, yarın olur mu?" | Belirsiz "şey" — hangi hizmet sorulması |
| `whatsapp-booking-clarification-limit.json` | (Çok fazla netleştirme sorusu) | Netleştirme sınırı — karar verme |
| `whatsapp-booking-short-intent.json` | "Randevu." | Çok kısa niyet — genişletme sorusu |
| `whatsapp-booking-media-context.json` | (Görsel bağlamıyla metin) | Medya+metin — bağlam birleştirme |
| `whatsapp-booking-traceability.json` | (İzlenebilirlik testi) | Audit trail — kayıt takibi |

---

## 8. Yapılandırma & Sistem (6 dosya)

| Dosya | Mesaj | Senaryo |
|-------|-------|---------|
| `whatsapp-booking-missing-config.json` | (İşletme config eksik) | Eksik config — fallback davranış |
| `whatsapp-booking-timezone-missing.json` | (Saat dilimi yok) | Timezone eksikliği — UTC varsayılan |
| `whatsapp-booking-missing-config.json` | (Config satırı yok) | Config okunamazsa — hata yönetimi |
| `whatsapp-booking-write-failure.json` | (DB yazma hatası) | Yazma hatası — 200 dönüp loglama |
| `whatsapp-booking-cross-channel.json` | "Instagram'dan da yazmıştım..." | Çok kanallı — aynı müşteri birleştirme |
| `whatsapp-booking-no-extra-phone.json` | (Ek telefon yok) | İletişim bilgisi eksikliği |

---

## 9. Dönüşüm & Analitik (4 dosya)

| Dosya | Mesaj | Senaryo |
|-------|-------|---------|
| `whatsapp-booking-returning-customer.json` | (Tekrar eden müşteri) | Müşteri tanıma — geçmiş kullanma |
| `whatsapp-booking-score-repeat.json` | (Puanlama tekrarı) | Lead scoring idempotency |
| `whatsapp-booking-after-handoff.json` | "O zaman yarın 15'e yazın beni." | İnsan devri sonrası — otomatik devam |
| `whatsapp-human-handoff.json` | "Bir yetkiliyle konuşmak istiyorum." | Devir tetikleme — escalation |

---

## 10. Spam & Güvenlik (2 dosya)

| Dosya | Mesaj | Senaryo |
|-------|-------|---------|
| `whatsapp-booking-spam.json` | (Tekrarlı/spam mesaj) | Rate limiting — 429/engelleme |
| `whatsapp-booking-unknown-service.json` | "Kristal terapi var mı?" | Tanımsız hizmet — liste dışı reddetme |

---

## Kullanım

### Tek fixture çalıştırma (simulate-webhook)
```powershell
# Yerel webhook sunucusu açıkken (deno run ...)
node scripts/simulate-webhook.cjs tests/fixtures/whatsapp-price-objection.json
```

### Tüm fixture'ları kuru deneme (dry-run)
```powershell
# Gerçek API/DB olmadan uçtan uca akış
node scripts/dry-run.cjs
```

### Senaryo kataloğu ile test
```powershell
npm run test:scenarios
# veya
node scripts/run-all-checks.cjs --scenarios
```

---

## Notlar

- **Timestamp**: Tüm fixture'larda `1790060400` (sabit test tarihi) kullanılır. Gerçek zaman testi için test harness'i `FakeDate` kullanır.
- **Mesaj ID**: Her dosyada benzersiz `wamid.TEST_...` ID'si vardır. `same-text-new-id` ve `retry` testleri için ID farkı kritiktir.
- **İşletme config**: Testlerde `DEFAULT_BUSINESS_CONFIG` (tests/helpers/webhook-suite.cjs:118-142) kullanılır — gerçek işletme verisi için `config/business-config.example.md` şablonunu doldurun.
- **Katalog**: Tüm senaryoların `id`, `message`, `given`, `expect`, `refs` alanları `tests/scenarios/booking-cases.json` kataloğunda tanımlıdır.
- **Güvenlik**: Bu dosyalar **sahte test verisidir**. Canlı müşteri hesabına/numarasına **asla göndermeyin**.

---

## Dosya Adlandırma Kuralı

```
whatsapp-booking-{scenario-id}.json     # Randevu senaryoları
whatsapp-{type}.json                    # Temel mesaj tipleri
instagram-{type}.json                   # Instagram mesaj tipleri
```

Yeni fixture eklerken bu kuralı takip edin ve kataloğu (`booking-cases.json`) güncelleyin.