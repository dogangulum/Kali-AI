# Webhook örnek mesaj verileri

Bu klasör, ileride test ve deneme için gerçekçi örnek Meta webhook payload'ları içerir. Her dosya farklı bir veri türünü temsil eder.

## Dosyalar

- `whatsapp-text-message.json` — WhatsApp'tan gelen metin mesajı örneği. Müşteri bir soruyu veya randevu isteğini yazmıştır.
- `whatsapp-image-message.json` — WhatsApp'tan gelen görsel mesajı örneği. Müşteri ürün, çalışma alanı ya da referans görseli paylaşmıştır.
- `whatsapp-read-receipt.json` — WhatsApp okundu bilgisi örneği. Mesajın müşteri tarafından okunduğunu gösteren durum eventi.
- `instagram-text-message.json` — Instagram DM üzerinden gelen metin mesajı örneği. Kullanıcı işletmeye soru sormaktadır.
- `instagram-image-message.json` — Instagram DM üzerinden gelen görsel mesajı örneği. Kullanıcı görsel ekli olarak ileti gönderir.

Bu örnekler doğrudan canlı veri değildir; sahte ama gerçek dünya webhook yapısına yakın örneklerdir.

## Müşteri konuşması senaryoları

[Test senaryoları planından](../../docs/TEST_SENARYOLARI.md) seçilen aşağıdaki dosyalar, mevcut `whatsapp-text-message.json` yapısını takip eder. Her dosyada tek bir metin mesajı ve ayrı bir sahte mesaj kimliği bulunur.

| Dosya | Mesaj | Kontrol amacı |
|---|---|---|
| `whatsapp-price-objection.json` | “Biraz pahalı geldi.” | Baskı yapmadan ve indirim uydurmadan itirazı karşılamak. |
| `whatsapp-appointment-request.json` | “O zaman gelecek salı 14.00 olur mu?” | Tarihi netleştirmek ve gerçek randevu uygunluğunu kontrol etmek. |
| `whatsapp-off-topic-message.json` | “Bana şiir yaz.” | Kibarca işletmeyle ilgili konuya dönmek. |
| `whatsapp-human-handoff.json` | “Bir yetkiliyle konuşmak istiyorum.” | İnsan desteği talebini doğru ele almak. |

İtiraz mesajını hizmet/fiyat konuşmasından sonra, randevu isteğini hizmet seçildikten sonra deneyin. Dosyalar konuşma geçmişi veya beklenen AI yanıtı içermez. Tarih ifadeleri görecelidir; timestamp değerleri sabit örnek değerlerdir. Kişi ve hesap bilgileri test amaçlıdır.

Yerel WhatsApp webhook'u test ortamında açıkken örnek gönderim:

```powershell
node scripts/simulate-webhook.cjs tests/fixtures/whatsapp-price-objection.json
```

Hazırlık için [yerel test rehberine](../../docs/LOCAL_TESTS.md) bakın. Bu dosyalar birleşik test aracının sabit örnek listesine otomatik eklenmez. HTTP `200` yanıtı AI cevabının doğruluğunu veya randevu kaydını doğrulamaz; konuşma davranışını test planındaki ölçütlerle ayrıca değerlendirin.
