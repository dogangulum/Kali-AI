#!/usr/bin/env bash
# Sunucu Sağlık Kontrol Betiği — Kali AI
# Çalıştırma: bash scripts/server-health-check.sh

set -euo pipefail

# --- Renkler ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}   $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR]${NC}  $*"; }

echo "=== Kali AI Sunucu Sağlık Raporu: $(date) ==="
echo ""

# --- 1. Sistem Bilgileri ---
info "=== SİSTEM BİLGİLERİ ==="
echo "Hostname:     $(hostname)"
echo "OS:           $(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"')"
echo "Kernel:       $(uname -r)"
echo "Uptime:       $(uptime -p)"
echo "Timezone:     $(timedatectl | grep 'Time zone' | awk '{print $3}')"
echo "Architecture: $(uname -m)"
echo ""

# --- 2. CPU ---
info "=== CPU ==="
CPU_CORES=$(nproc)
CPU_LOAD=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
echo "Çekirdek:     $CPU_CORES"
echo "Load (1m):    $CPU_LOAD"
if (( $(echo "$CPU_LOAD > $CPU_CORES" | bc -l 2>/dev/null || echo 0) )); then
  warn "Yük çekirdek sayısından yüksek!"
else
  ok "CPU yükü normal"
fi
echo ""

# --- 3. Bellek ---
info "=== BELLEK (RAM) ==="
MEM_INFO=$(free -h | grep '^Mem:')
MEM_TOTAL=$(echo $MEM_INFO | awk '{print $2}')
MEM_USED=$(echo $MEM_INFO | awk '{print $3}')
MEM_AVAIL=$(echo $MEM_INFO | awk '{print $7}')
MEM_PERCENT=$(free | grep '^Mem:' | awk '{printf "%.1f", $3/$2*100}')
echo "Toplam:   $MEM_TOTAL"
echo "Kullanım: $MEM_USED (%$MEM_PERCENT)"
echo "Müsait:   $MEM_AVAIL"
if (( $(echo "$MEM_PERCENT > 85" | bc -l 2>/dev/null || echo 0) )); then
  warn "Bellek kullanımı yüksek (%$MEM_PERCENT)"
elif (( $(echo "$MEM_PERCENT > 70" | bc -l 2>/dev/null || echo 0) )); then
  warn "Bellek kullanımı orta (%$MEM_PERCENT)"
else
  ok "Bellek kullanımı normal (%$MEM_PERCENT)"
fi
echo ""

# --- 4. Disk ---
info "=== DİSK KULLANIMI ==="
df -h / | tail -1 | awk '{print "Root (/):     Boyut: " $2 " | Kullanım: " $3 " (" $5 ") | Boş: " $4}'
DISK_PERCENT=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [[ $DISK_PERCENT -gt 85 ]]; then
  warn "Disk kullanımı yüksek (%$DISK_PERCENT)"
elif [[ $DISK_PERCENT -gt 70 ]]; then
  warn "Disk kullanımı orta (%$DISK_PERCENT)"
else
  ok "Disk kullanımı normal (%$DISK_PERCENT)"
fi

# /var/log ayrıysa
if mountpoint -q /var/log 2>/dev/null; then
  df -h /var/log | tail -1 | awk '{print "/var/log:     Boyut: " $2 " | Kullanım: " $3 " (" $5 ") | Boş: " $4}'
fi
echo ""

# --- 5. Ağ ve Portlar ---
info "=== AĞ VE PORTLAR ==="
echo "Açık portlar (LISTEN):"
ss -tlnp | grep -E '^LISTEN' | awk '{print "  " $4 " -> " $6}' | sort -u

echo ""
echo "Webhook portları kontrol:"
for port in 8000 8001 80 443 22; do
  if ss -tln | grep -q ":$port "; then
    ok "Port $port: AÇIK"
  else
    warn "Port $port: KAPALI"
  fi
done
echo ""

# --- 6. Servisler ---
info "=== SERVİSLER ==="
SERVICES=("kali-ai-whatsapp" "kali-ai-instagram" "pm2-root" "ssh" "ufw")
for svc in "${SERVICES[@]}"; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    ok "$svc: AKTİF"
  elif systemctl list-unit-files | grep -q "^$svc"; then
    warn "$svc: DURDURULMUŞ (enabled ama inactive)"
  else
    warn "$svc: YÜKLENMEMIŞ"
  fi
done

# pm2 durumu
if command -v pm2 &>/dev/null; then
  echo ""
  info "pm2 süreçleri:"
  pm2 list --no-color 2>/dev/null | tail -n +3 | head -n -1 | while read line; do
    if [[ -n "$line" ]]; then
      echo "  $line"
    fi
  done
fi
echo ""

# --- 7. Deno ve Node.js ---
info "=== ÇALIŞMA ORTAMLARI ==="
if command -v deno &>/dev/null; then
  DENO_VER=$(deno --version | head -1 | cut -d' ' -f2)
  ok "Deno: $DENO_VER"
else
  err "Deno: KURULU DEĞİL"
fi

if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  ok "Node.js: $NODE_VER"
else
  err "Node.js: KURULU DEĞİL"
fi

if command -v npm &>/dev/null; then
  ok "npm: $(npm -v)"
fi

if command -v pm2 &>/dev/null; then
  ok "pm2: $(pm2 -v)"
fi
echo ""

# --- 8. Loglar ---
info "=== LOG DOSYALARI ==="
LOG_DIR="/var/log/kali-ai"
if [[ -d "$LOG_DIR" ]]; then
  echo "Log dizini: $LOG_DIR"
  ls -lh "$LOG_DIR"/*.log 2>/dev/null | awk '{print "  " $9 ": " $5 " (" $6 " " $7 " " $8 ")"}' || echo "  (log dosyası yok)"
else
  warn "Log dizini yok: $LOG_DIR"
fi
echo ""

# --- 9. Proje Dosyaları ---
info "=== PROJE DURUMU ==="
PROJECT_DIRS=("/opt/kali-ai" "/home/ubuntu/kali-ai")
for dir in "${PROJECT_DIRS[@]}"; do
  if [[ -d "$dir/.git" ]]; then
    ok "Proje bulundu: $dir"
    cd "$dir"
    echo "  Git commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'bilinmiyor')"
    echo "  Branch:     $(git branch --show-current 2>/dev/null || echo 'bilinmiyor')"
    echo "  Son commit: $(git log -1 --format='%ci %s' 2>/dev/null || echo 'bilinmiyor')"
    if [[ -f ".env.local" ]]; then
      ok "  .env.local: VAR"
    else
      warn "  .env.local: YOK"
    fi
  fi
done
echo ""

# --- 10. Güvenlik ---
info "=== GÜVENLİK ==="
# ufw durumu
if command -v ufw &>/dev/null; then
  UFW_STATUS=$(ufw status | head -1)
  if [[ "$UFW_STATUS" == *"active"* ]]; then
    ok "ufw: AKTİF"
    ufw status numbered | grep -E '^\[.*\]' | head -10 | sed 's/^/  /'
  else
    warn "ufw: PASİF (öneri: ufw enable)"
  fi
fi

# SSH root login
SSH_ROOT=$(grep '^PermitRootLogin' /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}')
if [[ "$SSH_ROOT" == "yes" ]]; then
  warn "SSH root girişine izin veriliyor (güvenlik riski)"
else
  ok "SSH root girişi kısıtlı"
fi

# Fail2ban
if systemctl is-active --quiet fail2ban 2>/dev/null; then
  ok "fail2ban: AKTİF"
else
  warn "fail2ban: KURULU DEĞİL (önerilir)"
fi
echo ""

# --- Özet ---
echo "=== ÖZET ==="
ERRORS=0
WARNINGS=0

# Hata/warning sayısını hesapla (basit yaklaşım)
# Bu kısım manuel gözden geçirme için bırakıldı
echo "Detaylı çıktı yukarıda. Sorunlu öğeler [WARN] veya [ERR] ile işaretlenmiştir."
echo ""
echo "Rapor tarihi: $(date)"
echo "=== RAPOR SONU ==="