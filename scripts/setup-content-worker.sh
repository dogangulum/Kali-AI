#!/usr/bin/env bash
# Günlük içerik worker'ını Oracle sunucusuna kurar (bir kez, root ile):
#   sudo bash scripts/setup-content-worker.sh
# Önkoşul: setup-oracle-server.sh çalışmış, repo /opt/kali-ai'de, .env.local dolu.
set -euo pipefail
PROJECT_DIR="${PROJECT_DIR:-/opt/kali-ai}"
STATE_DIR=/var/lib/kali-ai
export PLAYWRIGHT_BROWSERS_PATH="$STATE_DIR/ms-playwright"

[[ $EUID -eq 0 ]] || { echo "root ile çalıştırın: sudo bash $0"; exit 1; }
cd "$PROJECT_DIR"

echo "[1/5] ffmpeg"
apt-get install -y ffmpeg

echo "[2/5] worker bağımlılıkları"
(cd worker && npm install --omit=dev)

echo "[3/5] Chromium (Playwright)"
(cd worker && npx playwright install --with-deps chromium)

echo "[4/5] durum klasörleri (repo dışında: deploy'daki git clean silmesin)"
mkdir -p "$STATE_DIR/state/capcut-profiles" /var/log/kali-ai
chmod 700 "$STATE_DIR/state"

echo "[5/5] systemd"
cp systemd/kali-ai-content.service systemd/kali-ai-content.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now kali-ai-content.timer
systemctl list-timers kali-ai-content.timer --no-pager
echo "Tamam. Elle bir kez denemek için: sudo systemctl start kali-ai-content && tail -f /var/log/kali-ai/content-*.log"
