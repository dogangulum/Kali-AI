#!/usr/bin/env bash
# Kali AI Deployment Betiği — Oracle Cloud Sunucusunda Çalıştırılır
# Repoyu klonlar, env dosyasını hazırlar, pm2 ile servisleri başlatır
# Çalıştırma: bash scripts/deploy-kali-ai.sh

set -euo pipefail

# --- Yapılandırma ---
REPO_URL="${REPO_URL:-https://github.com/<KULLANICI>/<REPO>.git}"  # BURAYI DÜZENLEYİN
PROJECT_DIR="${PROJECT_DIR:-/opt/kali-ai}"
BRANCH="${BRANCH:-main}"
PM2_USER="${PM2_USER:-root}"

# --- Yardımcı fonksiyonlar ---
info() { echo -e "\033[1;34m[INFO]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[OK]\033[0m   $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $*"; }
err()  { echo -e "\033[1;31m[ERR]\033[0m  $*"; }

# Root kontrolü
if [[ $EUID -ne 0 ]]; then
  err "Bu betik root yetkisiyle çalıştırılmalı: sudo bash $0"
  exit 1
fi

# REPO_URL kontrolü
if [[ "$REPO_URL" == *"<KULLANICI>"* ]]; then
  err "REPO_URL değişkenini düzenleyin: REPO_URL=https://github.com/kullanici/repo.git bash $0"
  exit 1
fi

info "=== Kali AI Deployment Başlatılıyor: $(date) ==="
info "Proje dizini: $PROJECT_DIR"
info "Repo: $REPO_URL"
info "Branch: $BRANCH"

# --- 1. Proje dizinini hazırla ---
if [[ -d "$PROJECT_DIR/.git" ]]; then
  info "Mevcut repo güncelleniyor..."
  cd "$PROJECT_DIR"
  git fetch origin
  git reset --hard "origin/$BRANCH"
  git clean -fd
else
  info "Repo klonlanıyor..."
  git clone --branch "$BRANCH" "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

ok "Repo hazır: $(git rev-parse --short HEAD)"

# --- 2. .env.local dosyasını kontrol et ---
if [[ ! -f ".env.local" ]]; then
  if [[ -f ".env.example" ]]; then
    warn ".env.local bulunamadı, .env.example'dan kopyalanıyor..."
    cp .env.example .env.local
    warn "LÜTFEN .env.local DOSYASINI DÜZENLEYİN VE GERÇEK DEĞERLERİ GİRİN!"
    warn "Düzenleme: nano .env.local"
    read -p "Devam etmek için Enter'a basın (düzenlemeyi bitirdikten sonra)..."
  else
    err ".env.example dosyası bulunamadı!"
    exit 1
  fi
else
  ok ".env.local zaten mevcut"
fi

# Gerekli env var'ları kontrol et
REQUIRED_VARS=(
  "META_WHATSAPP_VERIFY_TOKEN"
  "META_INSTAGRAM_VERIFY_TOKEN"
  "META_APP_SECRET"
  "SUPABASE_URL"
  "SUPABASE_SERVICE_ROLE_KEY"
  "KALI_BUSINESS_ID"
  "ANTHROPIC_API_KEY"
)

MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
  if ! grep -q "^${var}=" .env.local || grep -q "^${var}=$" .env.local; then
    warn "Eksik/boş: $var"
    MISSING=1
  fi
done

if [[ $MISSING -eq 1 ]]; then
  warn "Bazı env değişkenleri eksik/boş. Lütfen .env.local dosyasını kontrol edin."
  read -p "Yine de devam etmek için Enter'a basın..."
fi

# --- 3. Bağımlılıkları yükle (Node.js tarafı) ---
info "Node.js bağımlılıkları kontrol ediliyor..."
if [[ -f "package.json" ]]; then
  # package-lock.json varsa ci, yoksa install
  if [[ -f "package-lock.json" ]]; then
    npm ci --production=false
  else
    npm install
  fi
  ok "npm bağımlılıkları yüklendi"
else
  warn "package.json bulunamadı, atlanıyor"
fi

# --- 4. Deno cache (webhook fonksiyonları için) ---
info "Deno bağımlılıkları önbelleğe alınıyor..."
if [[ -f "supabase/functions/whatsapp-webhook/index.ts" ]]; then
  deno cache supabase/functions/whatsapp-webhook/index.ts
  ok "WhatsApp webhook cache alındı"
fi
if [[ -f "supabase/functions/instagram-webhook/index.ts" ]]; then
  deno cache supabase/functions/instagram-webhook/index.ts
  ok "Instagram webhook cache alındı"
fi

# --- 5. pm2 servislerini yapılandır ve başlat ---
info "pm2 servisleri yapılandırılıyor..."

# Ecosystem dosyası oluştur
cat > ecosystem.config.cjs <<'EOF'
module.exports = {
  apps: [
    {
      name: 'kali-ai-whatsapp',
      script: 'deno',
      args: 'run --allow-net --allow-env=META_WHATSAPP_VERIFY_TOKEN,META_APP_SECRET supabase/functions/whatsapp-webhook/index.ts',
      cwd: '/opt/kali-ai',
      env: {
        META_WHATSAPP_VERIFY_TOKEN: process.env.META_WHATSAPP_VERIFY_TOKEN,
        META_APP_SECRET: process.env.META_APP_SECRET,
        DENO_DIR: '/root/.deno/cache'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      error_file: '/var/log/kali-ai/whatsapp-error.log',
      out_file: '/var/log/kali-ai/whatsapp-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
    {
      name: 'kali-ai-instagram',
      script: 'deno',
      args: 'run --allow-net --allow-env=META_INSTAGRAM_VERIFY_TOKEN,META_APP_SECRET supabase/functions/instagram-webhook/index.ts',
      cwd: '/opt/kali-ai',
      env: {
        META_INSTAGRAM_VERIFY_TOKEN: process.env.META_INSTAGRAM_VERIFY_TOKEN,
        META_APP_SECRET: process.env.META_APP_SECRET,
        DENO_DIR: '/root/.deno/cache'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      error_file: '/var/log/kali-ai/instagram-error.log',
      out_file: '/var/log/kali-ai/instagram-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 5000,
      listen_timeout: 10000,
    }
  ]
};
EOF

# pm2'yi durdur ve yeniden başlat
pm2 delete kali-ai-whatsapp kali-ai-instagram 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

ok "pm2 servisleri başlatıldı"

# --- 6. systemd entegrasyonu (pm2 startup zaten yapıldıysa) ---
info "systemd servisleri etkinleştiriliyor..."
pm2 startup systemd -u "$PM2_USER" --hp "/root" | tail -1 | bash -s 2>/dev/null || true
systemctl enable pm2-root 2>/dev/null || true
ok "systemd entegrasyonu yapıldı"

# --- 7. Log dizinleri ---
mkdir -p /var/log/kali-ai
chown -R root:root /var/log/kali-ai

# --- 8. Durum kontrolü ---
info "=== DEPLOYMENT DURUMU ==="
pm2 list
echo ""
echo "Servis URL'leri (yerel):"
echo "  WhatsApp:  http://localhost:8000"
echo "  Instagram: http://localhost:8001"
echo ""
echo "Log dosyaları:"
echo "  WhatsApp:  /var/log/kali-ai/whatsapp-out.log / ...-error.log"
echo "  Instagram: /var/log/kali-ai/instagram-out.log / ...-error.log"
echo ""
echo "pm2 komutları:"
echo "  pm2 logs kali-ai-whatsapp"
echo "  pm2 logs kali-ai-instagram"
echo "  pm2 restart kali-ai-whatsapp"
echo "  pm2 stop kali-ai-whatsapp"
echo "  pm2 monit"
echo ""

ok "Deployment tamamlandı: $(date)"