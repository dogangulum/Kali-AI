#!/usr/bin/env bash
# Oracle Cloud Sunucu Kurulum Betiği — Kali AI Projesi
# Bu betik Ubuntu 22.04/24.04 üzerinde test edilmiştir.
# Çalıştırma: sudo bash scripts/setup-oracle-server.sh

set -euo pipefail

LOG_FILE="/var/log/kali-ai-setup.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== Kali AI Sunucu Kurulumu Başlatılıyor: $(date) ==="

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

# --- 1. Sistem güncellemesi ---
info "Sistem paketleri güncelleniyor..."
apt-get update -y
apt-get upgrade -y
apt-get install -y curl wget git unzip ca-certificates gnupg lsb-release software-properties-common
ok "Sistem güncellendi"

# --- 2. Node.js 22 LTS kurulum ---
info "Node.js 22 LTS kuruluyor..."
if ! command -v node &>/dev/null || [[ $(node -v | sed 's/v//' | cut -d. -f1) -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  ok "Node.js $(node -v) kuruldu"
else
  ok "Node.js zaten kurulu: $(node -v)"
fi

# npm güncelle
npm install -g npm@latest
ok "npm $(npm -v) güncellendi"

# --- 3. Deno 2 kurulum ---
info "Deno 2 kuruluyor..."
if ! command -v deno &>/dev/null || [[ $(deno --version | head -1 | cut -d' ' -f2 | cut -d. -f1) -lt 2 ]]; then
  curl -fsSL https://deno.land/install.sh | sh -s v2.2.8
  export DENO_INSTALL="/root/.deno"
  export PATH="$DENO_INSTALL/bin:$PATH"
  echo 'export DENO_INSTALL="/root/.deno"' >> /root/.bashrc
  echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> /root/.bashrc
  ok "Deno $(deno --version | head -1 | cut -d' ' -f2) kuruldu"
else
  ok "Deno zaten kurulu: $(deno --version | head -1 | cut -d' ' -f2)"
fi

# PATH için root ve ubuntu kullanıcısı
if id "ubuntu" &>/dev/null; then
  echo 'export DENO_INSTALL="/root/.deno"' >> /home/ubuntu/.bashrc
  echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> /home/ubuntu/.bashrc
  chown ubuntu:ubuntu /home/ubuntu/.bashrc
fi

# --- 4. pm2 kurulum (servis yöneticisi) ---
info "pm2 kuruluyor..."
npm install -g pm2@latest
pm2 startup systemd -u root --hp /root
ok "pm2 kuruldu ve systemd entegrasyonu yapıldı"

# --- 5. logrotate yapılandırması ---
info "logrotate ayarlanıyor..."
cat > /etc/logrotate.d/kali-ai <<'EOF'
/var/log/kali-ai/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        pm2 reloadLogs > /dev/null 2>&1 || true
    endscript
}
EOF
mkdir -p /var/log/kali-ai
ok "logrotate yapılandırıldı"

# --- 6. Temel firewall (ufw) — SADECE ÖNERİ, AKTİF ETMEZ ---
info "ufw kurulu, varsayılan kurallar ekleniyor (aktif DEĞİL)..."
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
# Webhook portları (8000, 8001) — ihtiyaç olursa açılacak
# ufw allow 8000/tcp
# ufw allow 8001/tcp
# ufw allow 80/tcp
# ufw allow 443/tcp
warn "ufw kuralları tanımlandı ama AKTİF EDİLMEDİ. İhtiyaç olduğunda: ufw enable"
ok "Firewall hazır (pasif)"

# --- 7. Sistem limitleri ---
info "Sistem dosya/bağlantı limitleri artırılıyor..."
cat >> /etc/security/limits.conf <<'EOF'
# Kali AI için artırılmış limitler
* soft nofile 65535
* hard nofile 65535
root soft nofile 65535
root hard nofile 65535
EOF

cat >> /etc/sysctl.d/99-kali-ai.conf <<'EOF'
# Network buffer boyutları
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
fs.file-max = 2097152
EOF
sysctl --system >/dev/null
ok "Sistem limitleri yapılandırıldı"

# --- 8. Zaman dilimi ---
info "Zaman dilimi ayarlanıyor..."
timedatectl set-timezone Europe/Istanbul
ok "Zaman dilimi: $(timedatectl | grep 'Time zone')"

# --- 9. Proje kullanıcısı (opsiyonel, root yerine) ---
if ! id "kali-ai" &>/dev/null; then
  info "kali-ai kullanıcısı oluşturuluyor..."
  useradd -r -m -d /opt/kali-ai -s /bin/bash kali-ai
  usermod -aG sudo kali-ai
  ok "kali-ai kullanıcısı oluşturuldu"
else
  ok "kali-ai kullanıcısı zaten var"
fi

# --- 10. Kurulum özeti ---
echo ""
echo "=== KURULUM ÖZETİ ==="
echo "Node.js:  $(node -v)"
echo "npm:      $(npm -v)"
echo "Deno:     $(deno --version | head -1 | cut -d' ' -f2)"
echo "pm2:      $(pm2 -v)"
echo "OS:       $(lsb_release -ds)"
echo "Kernel:   $(uname -r)"
echo "Timezone: $(timedatectl | grep 'Time zone' | awk '{print $3}')"
echo ""
echo "Log dosyası: $LOG_FILE"
echo ""
warn "SONRAKI ADIMLAR (manuel):"
echo "  1. Repoyu klonlayın: git clone <repo-url> /opt/kali-ai (veya /home/ubuntu/kali-ai)"
echo "  2. Env dosyasını oluşturun: cp .env.example .env.local ve düzenleyin"
echo "  3. Servisleri başlatın: bash scripts/deploy-kali-ai.sh"
echo "  4. Sağlık kontrolü:     bash scripts/server-health-check.sh"
echo ""
ok "Kurulum tamamlandı: $(date)"