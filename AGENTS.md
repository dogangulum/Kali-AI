# AGENTS.md — Görev Yönlendirme Kuralları

Bu dosya, Kali-AI projesinde bir işin hangi AI ajanına verileceğini belirler. CLAUDE.md'deki
"AI Görev Hiyerarşisi" bölümünü tamamlar; oradaki roller burada somut yönlendirme kuralına
dönüştürülür.

## Yönlendirme Kuralı

| İş türü | Örnekler | Atanacak ajan |
|---|---|---|
| Basit / tekrarlayan | Formatlama, test yazma/çalıştırma, küçük/izole fonksiyonlar | DeepSeek, Gemini, Cline, Kilo Code, GitHub Copilot |
| Orta karmaşıklık | Gözetim gerektiren ama mimari karar içermeyen işler | ChatGPT / Codex |
| Mimari / güvenlik-kritik | Mimari kararlar, webhook güvenliği, secret/ödeme/PII işleyen kod, multi-tenant sınırları etkileyen değişiklikler, CLAUDE.md'deki 🔴 Kritik Uyarılar ile kesişen her şey | Claude |

## Uygulama Notları

- Belirsiz durumda (işin kategorisi net değilse) varsayılan olarak bir üst seviyeye (daha
  yetkin ajana) yönlendirilir — düşük riskli ajana "belki basittir" diye iş verilmez.
- Mimari/güvenlik-kritik işler asla elemanlara (DeepSeek/Gemini/Cline/Kilo Code/Copilot)
  veya müdür yardımcısına (ChatGPT/Codex) devredilmez.
- CLAUDE.md'deki 🔴 Kritik Uyarılar bu dosyadaki yönlendirmeden bağımsız olarak her zaman geçerlidir.
