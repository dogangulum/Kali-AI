# Oracle Cloud Sunucu Kurulum Rehberi — Kali AI

Bu rehber, Oracle Cloud Ubuntu sunucusunda Kali AI projesini baştan sona kurmak için adım adım talimatları içerir.

---

## Ön Koşullar

- Oracle Cloud Free Tier (veya paid) Ubuntu 22.04/24.04 instance
- SSH erişimi (ssh key ile)
- Sudo/root yetkisi
- GitHub reposu erişimi (public veya SSH key ile private)

---

## Adım 1: Sunucuya Bağlanın ve Temel Kurulumu Çalıştırın

```bash
# 1. Sunucuya SSH ile bağlanın
ssh ubuntu@<SUNUCU_IP>

# 2. Repoyu klonlayın
git clone https://github.com/<KULLANICI>/<REPO>.git kali-ai
cd kali-ai

# 3. Kurulum betiğini çalıştırın (root yetkisi gerektirir)
sudo bash scripts/setup-oracle-server.sh
```

**Beklenen süre:** 3-5 dakika

**Kurulum ne yapar?**
- Sistem güncellemesi
- Node.js 22 LTS kurulumu
- Deno 2 kurulumu
- pm2 (process manager) kurulumu
- logrotate yapılandırması
- ufw firewall (pasif, kuralları hazır)
- Sistem limitleri (dosya/bağlantı)
- Zaman dilimi: Europe/Istanbul
- `kali-ai` sistem kullanıcısı oluşturma

---

## Adım 2: Projeyi Deploy Edin

```bash
# Proje dizinine gidin
cd /opt/kali-ai  # veya ~/kali-ai

# Deploy betiğini çalıştırın
# REPO_URL'i kendi repolinkinizle değiştirin!
REPO_URL=https://github.com/<KULLANICI>/<REPO>.git bash scripts/deploy-kali-ai.sh
```

**Beklenen süre:** 2-3 dakika

**Deploy ne yapar?**
- Repoyu günceller/klonlar
- `.env.local` dosyasını `.env.example`'dan kopyalar (veya varsa kullanır)
- **SİZİ UYARIR: `.env.local` dosyasını düzenleyin** (gerçek değerleri girin)
- Node.js bağımlılıklarını yükler (`npm ci`/`install`)
- Deno cache'alır (webhook fonksiyonları için)
- pm2 ecosystem.config.cjs oluşturur
- 2 servisi başlatır: `kali-ai-whatsapp`, `kali-ai-instagram`
- pm2 startup systemd yapar (reboot'ta otomatik başlar)

---

## Adım 3: Ortam Değişkenlerini Yapılandırın (KRİTİK)

```bash
# Proje dizinindeyken
nano .env.local
```

**Mutlaka doldurulması gerekenler:**

| Değişken | Açıklama | Örnek |
|----------|----------|-------|
| `META_WHATSAPP_VERIFY_TOKEN` | WhatsApp webhook doğrulama tokenı | `openssl rand -hex 32` ile üretin |
| `META_INSTAGRAM_VERIFY_TOKEN` | Instagram webhook doğrulama tokenı | `openssl rand -hex 32` ile üretin |
| `META_APP_SECRET` | Meta App Secret | Meta Developer Console'dan |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Supabase Dashboard → Settings → API |
| `KALI_BUSINESS_ID` | İşletme UUID | `11111111-1111-4111-8111-111111111111` |
| `ANTHROPIC_API_KEY` | Anthropic API key | `sk-ant-...` |

**Kaydedip çıkın (Ctrl+O, Enter, Ctrl+X), sonra servisleri yeniden başlatın:**

```bash
pm2 restart kali-ai-whatsapp kali-ai-instagram
```

---

## Adım 4: Webhook URL'lerini Meta'ya Kaydedin

**WhatsApp:**
- Callback URL: `https://<DOMAIN>/functions/v1/whatsapp-webhook`
- Verify Token: `.env.local` içindeki `META_WHATSAPP_VERIFY_TOKEN` değeri
- Fields: `messages`, `message_deliveries`, `message_reads`

**Instagram:**
- Callback URL: `https://<DOMAIN>/functions/v1/instagram-webhook`
- Verify Token: `.env.local` içindeki `META_INSTAGRAM_VERIFY_TOKEN` değeri
- Fields: `messages`, `messaging_postbacks`, `messaging_optins`

> **Not:** Domain/SSL/Reverse proxy (nginx/Caddy) kurulumunu **siz ayrı halledeceksiniz**. Bu rehberde sunucu portları (8000, 8001) localhost'ta dinlenir; dışarıya açma/SSL size aittir.

---

## Adım 5: Sağlık Kontrolü Yapın

```bash
bash scripts/server-health-check.sh
```

**Kontrol edilenler:**
- CPU, RAM, Disk kullanımı
- Açık portlar (8000, 8001, 22, 80, 443)
- Servis durumları (systemd + pm2)
- Deno/Node.js/pm2 sürümleri
- Log dosyaları
- Proje git durumu
- Güvenlik (ufw, SSH, fail2ban)

---

## Adım 6: Canlı Mesaj Testi Yapın

`docs/LIVE_MESSAGE_TEST_CHECKLIST.md` dosyasındaki kontrol listesini takip edin:
1. Webhook doğrulama (GET challenge)
2. WhatsApp test mesajı gönder → Function loglarında inbound/outbound gör
3. Instagram DM test mesajı gönder
4. İmza doğrulama (401/200)
5. Rate limiting (31. istek 429)

---

## Yaygın Komutlar

```bash
# Servis logları
pm2 logs kali-ai-whatsapp
pm2 logs kali-ai-instagram

# Servis yeniden başlatma
pm2 restart kali-ai-whatsapp
pm2 restart kali-ai-instagram

# Servis durdurma
pm2 stop kali-ai-whatsapp

# Canlı izleme
pm2 monit

# Sistem logları (systemd)
journalctl -u kali-ai-whatsapp -f
journalctl -u kali-ai-instagram -f

# Sağlık kontrolü
bash scripts/server-health-check.sh

# Deploy sonrası güncelleme
cd /opt/kali-ai && git pull && bash scripts/deploy-kali-ai.sh
```

---

## Dosya Yapısı (Özet)

```
/opt/kali-ai/                    # Proje kök dizini
├── .env.local                   # GERÇEK DEĞERLER (git'e eklenmez)
├── .env.example                 # Şablon
├── ecosystem.config.cjs         # pm2 konfigürasyonu (deploy'da oluşur)
├── supabase/functions/
│   ├── whatsapp-webhook/index.ts
│   └── instagram-webhook/index.ts
├── scripts/
│   ├── setup-oracle-server.sh   # Sunucu kurulumu (1 kez)
│   ├── deploy-kali-ai.sh        # Deploy (her güncellemede)
│   └── server-health-check.sh   # Sağlık kontrolü
└── systemd/                     # systemd servis dosyaları (alternatif)
    ├── kali-ai-whatsapp.service
    └── kali-ai-instagram.service

/var/log/kali-ai/                # Log dosyaları (logrotate ile döner)
├── whatsapp-out.log
├── whatsapp-error.log
├── instagram-out.log
└── instagram-error.log
```

---

## Güvenlik Notları

| Konu | Durum | Not |
|------|-------|-----|
| `.env.local` | **Git'e eklenmez** | `.gitignore` içinde |
| ufw | Pasif | `ufw enable` siz yapın |
| SSL/Reverse proxy | Size ait | nginx/Caddy/Cloudflare |
| Fail2ban | Kurulu değil | `apt install fail2ban` önerilir |
| SSH root login | Kısıtlı | `PermitRootLogin no` |
| Secrets | Git'e yazılmaz | Sadece `.env.local`'da |

---

## Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| `pm2: command not found` | `source ~/.bashrc` veya yeniden login |
| `deno: command not found` | `export PATH="$DENO_INSTALL/bin:$PATH"` |
| Port 8000/8001 erişilemiyor | ufw/iptables/cloud firewall kontrolü |
| Servis hemen kapanıyor | `pm2 logs` → env vars eksik mi? |
| Supabase bağlantı hatası | `SUPABASE_URL` ve `SERVICE_ROLE_KEY` doğru mu? |
| Git pull permission denied | SSH key doğru mu? `git remote set-url origin git@github.com:...` |

---

## İlgili Belgeler

- `docs/ORACLE_CLOUD_DEPLOYMENT_PREP.md` — Mimari genel bakış
- `docs/NEW_AD_ACCOUNT_SETUP_PREP.md` — Yeni reklam hesabı kurulumu
- `docs/LIVE_MESSAGE_TEST_CHECKLIST.md` — Canlı test prosedürü
- `docs/TEST_SENARYOLARI.md` — Müşteri test senaryoları
- `docs/CONTENT_AD_PREP.md` — İçerik/reklam üretim akışı

---

## Destek

Sorun yaşarsanız:
1. `bash scripts/server-health-check.sh` çıktısını inceleyin
2. `pm2 logs kali-ai-whatsapp` ve `pm2 logs kali-ai-instagram` bakın
3. `journalctl -u kali-ai-whatsapp -f` systemd logları
4. `.env.local` dosyasındaki değerleri doğrulayın