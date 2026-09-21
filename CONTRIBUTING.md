# Katkıda Bulunma Rehberi

Bu proje için işler, risk seviyesine göre farklı yapay zekalara atanır. Amaç, basit görevleri hızlıca çözen araçlara vermek, kritik kararları ise daha güvenilir ve yetkili ajana bırakmaktır.

## İşlerin hangi yapay zekaya verileceği

### Basit / tekrarlayan işler
Bu tür işler genellikle küçük, standart ve düşük risklidir.

Örnekler:
- formatlama
- küçük düzeltmeler
- test yazma veya çalıştırma
- izole edilmiş küçük fonksiyonlar

Atanacak araçlar:
- DeepSeek
- Gemini
- Cline
- Kilo Code
- GitHub Copilot

### Orta karmaşıklık işler
Bu işler belirli bir kontrol gerektirir ama mimari karar içermeyen işlerdir.

Örnekler:
- ayrıntılı ama düşük riskli geliştirme adımları
- revizyon ve denetim işleri
- gözetim gerektiren ama büyük karar istemeyen işler

Atanacak araç:
- ChatGPT / Codex

### Mimari / güvenlik-kritik işler
Bu tür işler, projeye büyük etki eden kararlar ya da güvenlik riski taşıyan konulara girer.

Örnekler:
- mimari kararlar
- webhook güvenliği
- secret, ödeme, PII (kişisel veri) işlemleri
- multi-tenant sınırları etkileyen değişiklikler
- CLAUDE.md içindeki kritik uyarılarla ilgili işler

Atanacak araç:
- Claude

## Temel kural

- Belirsiz bir iş olduğunda daha yüksek seviyedeki, daha güvenilir ajana verilir.
- Mimari veya güvenlik kritik işlerde düşük riskli araçlara devredilmez.
- Kritik uyarılar ve proje kural dosyaları her zaman geçerlidir.
- Konuya uygun ekip/araç seçimi, hataları azaltır ve güvenliği artırır.

## Kısa özet

- Basit iş: küçük araçlar
- Orta iş: orta seviye asistan
- Kritik iş: Claude

Bu yaklaşım, hem hızı hem de güvenliği birlikte korumayı amaçlar.
