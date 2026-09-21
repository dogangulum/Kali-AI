# CLAUDE.md — Kali-AI Projesi Kuralları

Bu dosya, Claude Code'un bu repoda her oturumda otomatik olarak okuduğu proje kural dosyasıdır. Amaç: Claude'a (veya bağlı diğer AI ajanlarına) her seferinde sıfırdan anlatmadan bağlam ve sınırları vermek, böylece token/maliyet tasarrufu sağlamak.

## Proje Özeti

Kali Beauty Center için 7/24 otonom çalışan bir Instagram/WhatsApp/Meta reklam AI ajan sistemi geliştiriliyor. KPI zinciri: Reel/reklam → DM → nitelikli lead → randevu → müşteri.

Tam devir dosyası: `docs/PROJECT_HANDOFF.md` — büyük mimari kararlar, geçmiş, ve "neden böyle yapıldı" bilgisi burada. Bu dosyayı değiştirmeden önce oradaki ilgili bölümü oku.

## Mimari İlkeler

- **Multi-tenant / genel amaçlı mimari.** İşletmeye özel hiçbir şey (hizmetler, fiyatlar, ton, çalışma saatleri, Kali'ye özgü metin) kod içine gömülmez. Her şey dışarıda config/veritabanı (Supabase) olarak tutulur. Kod, ileride başka işletmelere satılabilecek şekilde yazılır.
- **Backend:** Oracle Cloud VPS.
- **CRM/DB:** Supabase / PostgreSQL (proje: "Kali Beauty AI", eu-west-1).
- **DM Agent modeli:** Claude / Anthropic API. Basit mesajlar (fiyat, adres, saat) ucuz/hızlı modele (Haiku) veya kural tabanlı yanıta yönlendirilir; karmaşık mesajlar (randevu ikna, itiraz karşılama) Claude Sonnet'e gider.
- **Webhook güvenliği:** Her webhook'ta imza doğrulama (`X-Hub-Signature-256`) ve rate limiting zorunlu — atlanmaz.
- **Reklam üretim akışı modüler:** görsel/video, seslendirme, altyazı ayrı katmanlar halinde üretilir; onay ekranında "Değiştir" seçilirse sadece o katman yeniden üretilir.

## 🔴 Kritik Uyarılar — ASLA İhlal Edilmez

1. Mevcut (eski) reklam hesabına dokunma: **kalibeautycenter / Ad Account ID 1022196827301104**. Silme, düzenleme, claim/transfer yok.
2. Gerçek WhatsApp hattı **+90 532 610 22 44** üzerinde mevcut müşteri geçmişini bozacak yıkıcı (destructive) migration yapma.
3. Yeni bir Facebook Page oluşturmadan önce mutlaka mevcut asset yapısını kontrol et.
4. **"Akıl Almaz Dünya"** (eski Business Portfolio) ile **"Kali Beauty"** (yeni, ID 1690144316017274) portföylerini karıştırma — ayrı tutulacak.
5. Hiçbir secret/token/API key'i Git'e commit etme veya sohbete yapıştırma/yapıştırılmasını isteme. Her şey `.env` / secrets manager'da.
6. Meta webhook alanlarına, endpoint gerçekten public HTTPS üzerinden cevap vermeden sahte/test URL girme.
7. Production reklam kampanyalarına dokunma (şu ana kadar dokunulmadı, bu böyle kalacak — yeni kampanyalar ayrı, yeni Ad Account/portföy üzerinden kurulacak).
8. Kullanıcıyı gereksiz ekranlarda bekletme; bilinen ardışık adımları toplu ver, tek tek onay isteme.

## Token / Context Optimizasyonu

- **Plan Mode (Shift+Tab)** kullanılacak: koda dokunmadan önce plan çıkar, kullanıcı onaylamadan uygulamaya geçme.
- Context'e şunlar **sokulmaz**: lock dosyaları (`package-lock.json`, `yarn.lock` vb.), build logları, `node_modules`, bağımlılık dosyaları, gereksiz büyük veri dosyaları. `.gitignore` ve context-ignore kurallarıyla dışarıda tutulur.
- Uzun konuşma geçmişi yerine **rolling summary** kullanılır (özellikle DM Agent'ın CRM'den konuşma özeti çekmesi gibi).
- Mümkün olan yerde **prompt caching** (sistem promptu cache'den okunur) tercih edilir.
- Araç çıktıları (log, dosya, RAG chunk) büyükse sıkıştırılarak (bkz. headroomlabs yaklaşımı) modele verilir, ham haliyle değil.

## Kabul Edilen / Kullanılacak Araçlar

- Plan Mode, CLAUDE.md (bu dosya), background agent'lar (periyodik kontrol + bildirim), otomatik test+deploy akışı.
- **Cline** (VS Code eklentisi) — DeepSeek, Gemini gibi modelleri tek bir güvenilir köprü üzerinden bağlamak için.
- Resmi Anthropic Claude Code VS Code eklentisi.

## Reddedilen Araçlar (kullanılmayacak)

- "Free Claude Code" (doğrulanmamış `curl | sh` proxy scripti) — güvenlik riski.
- Omniroute — aynı kategori risk.
- Hermes / Hermes Agent — canlı/para kazandıran sistemde riskli bulundu.

### İstisna (yazılı onaylı): Headroom proxy modu — 2026-09-21

Normalde yukarıdaki kategoriye (doğrulanmamış proxy/wrapper) girecek bir araç, Doğan Gülüm tarafından aşağıdaki riskler kendisine açıkça bildirildikten sonra bilinçli olarak onaylandı:

- `headroomlabs-ai/headroom` ve `KhryptorGraphics/headroom` adında iki farklı/çelişen repo bulundu, kimliği bağımsız olarak doğrulanamadı.
- Yoğun, koordineli görünen SEO pazarlama ağı tespit edildi (8-9 farklı düşük-otoriteli blog, aynı hafta, benzer içerik) — organik açık kaynak projesi paterninden farklı.
- Proxy modu (`headroom wrap claude`), Claude Code ile Anthropic arasındaki tüm trafiği yerel bir ara katmandan geçiriyor. Aracın kendi dokümantasyonu sıkıştırmanın yerel yapıldığını ve prompt/dosya içeriğinin dışarı gönderilmediğini iddia ediyor, ama bu bağımsız olarak doğrulanmadı.
- Varsayılan açık bir telemetri beacon var (provider ID + sistem bilgisi gönderiyor; `HEADROOM_BEACON=off` ile kapatılabilir).
- Kurulum, mevcut Claude Code aboneliğinden ayrı yeni bir Anthropic API key gerektiriyor (ek maliyet riski).

**Kabul edilen risk kapsamı:** sadece bu geliştirme makinesinde, token maliyetini azaltmak amacıyla. Bu proxy üzerinden üretim/canlı sistemlere (Supabase, Meta, WhatsApp hattı) hiçbir secret veya işlem yapılmayacak; kural #5 (secret'ları sohbete yazmama) bu kurulum için de geçerli — yeni Anthropic API key'i kullanıcı kendisi oluşturup proxy yapılandırmasına girdi.

## AI Görev Hiyerarşisi

- **Patron:** Doğan Gülüm (kullanıcı)
- **Müdür:** Claude — mimari/karmaşık/güvenlik-kritik işler, görev dağıtım kararları
- **Müdür Yardımcısı:** ChatGPT/Codex — orta karmaşıklıkta, gözetim gerektiren işler
- **Elemanlar:** DeepSeek, Gemini, Cline, Kilo Code, GitHub Copilot — basit, tekrarlayan, düşük riskli işler (format, test, küçük fonksiyonlar)

## Bilinen Sınırlama

claude.ai sohbeti (web/mobil) bu repoya veya yerel Windows ortamına doğrudan erişemez. Kod değişiklikleri ya Claude Code (yerel VS Code eklentisi) ile ya da bağlı bir MCP connector (örn. Supabase) üzerinden yapılır.
