#!/usr/bin/env bash
# ₮ubikz · one-shot Oracle Cloud (Ubuntu 22.04 / 24.04, ARM или x86) bootstrap.
#
# Что делает:
#   1. Ставит Node.js 20 LTS, git, nginx, certbot, ufw.
#   2. Клонирует репозиторий (или использует существующий /opt/tubikz).
#   3. Ставит зависимости, поднимает Prisma, собирает prod-бандл.
#   4. Регистрирует systemd-сервис tubikz.service (auto-restart, autostart).
#   5. Конфигурирует nginx как reverse proxy с WebSocket upgrade.
#   6. Открывает порты 80/443 в ufw + iptables (Oracle любит iptables).
#   7. Если задан DOMAIN — выпускает Let's Encrypt сертификат.
#
# Запуск (на VM, под пользователем ubuntu, с правами sudo):
#   curl -fsSL https://raw.githubusercontent.com/<you>/tubikz/main/deploy/setup-vm.sh \
#     | DOMAIN=tubikz.example.com EMAIL=you@mail.com sudo -E bash
#
# Или вручную:
#   git clone <repo> /opt/tubikz && cd /opt/tubikz
#   sudo DOMAIN=... EMAIL=... bash deploy/setup-vm.sh
#
# Без DOMAIN — поднимет приложение на http://<public-ip>:80, без HTTPS.

set -euo pipefail

REPO_URL="${REPO_URL:-}"          # необязательно: если не задан, ожидает что repo уже в /opt/tubikz
APP_DIR="${APP_DIR:-/opt/tubikz}"
APP_USER="${APP_USER:-tubikz}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
NODE_MAJOR="${NODE_MAJOR:-20}"

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ запусти под sudo"; exit 1
fi

log() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }

log "1/8 · обновляю apt"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git build-essential ca-certificates ufw nginx certbot python3-certbot-nginx

log "2/8 · ставлю Node.js ${NODE_MAJOR} LTS (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v && npm -v

log "3/8 · создаю системного пользователя ${APP_USER}"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"

log "4/8 · готовлю код в ${APP_DIR}"
if [ -n "$REPO_URL" ] && [ ! -d "${APP_DIR}/.git" ]; then
  rm -rf "$APP_DIR"
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
elif [ -d "$APP_DIR" ]; then
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only 2>/dev/null || true
else
  echo "❌ нет ${APP_DIR} и не задан REPO_URL"; exit 1
fi

cd "$APP_DIR"

if [ ! -f .env ]; then
  log "    · генерирую .env"
  SECRET=$(openssl rand -base64 32)
  cat > .env <<EOF
DATABASE_URL="file:./prisma/dev.db"
NEXTAUTH_SECRET="${SECRET}"
NEXTAUTH_URL="${DOMAIN:+https://${DOMAIN}}${DOMAIN:-http://$(curl -s ifconfig.me)}"
PORT=3000
NODE_ENV=production
EOF
  chown "$APP_USER":"$APP_USER" .env
  chmod 600 .env
fi

log "5/8 · npm install + prisma + build"
sudo -u "$APP_USER" npm ci --no-audit --no-fund
sudo -u "$APP_USER" npx prisma generate
sudo -u "$APP_USER" npx prisma db push --accept-data-loss --skip-generate
sudo -u "$APP_USER" npm run build
mkdir -p public/uploads
chown -R "$APP_USER":"$APP_USER" public/uploads

log "6/8 · регистрирую systemd-сервис"
install -m 644 deploy/tubikz.service /etc/systemd/system/tubikz.service
sed -i "s|@APP_DIR@|${APP_DIR}|g; s|@APP_USER@|${APP_USER}|g" /etc/systemd/system/tubikz.service
systemctl daemon-reload
systemctl enable tubikz.service
systemctl restart tubikz.service
sleep 2
systemctl --no-pager --lines=10 status tubikz.service || true

log "7/8 · настраиваю nginx"
TEMPLATE=deploy/nginx.conf
TARGET=/etc/nginx/sites-available/tubikz
SERVER_NAME="${DOMAIN:-_}"
sed "s|@SERVER_NAME@|${SERVER_NAME}|g" "$TEMPLATE" > "$TARGET"
ln -sf "$TARGET" /etc/nginx/sites-enabled/tubikz
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "8/8 · открываю файрволл (ufw + iptables, Oracle любит оба)"
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

# Oracle VMs идут с iptables, который блокирует входящие — открываем 80/443
if command -v iptables >/dev/null 2>&1; then
  iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
  iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save 2>/dev/null || true
  else
    apt-get install -y iptables-persistent >/dev/null 2>&1 || true
    netfilter-persistent save 2>/dev/null || true
  fi
fi

if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
  log "получаю Let's Encrypt сертификат для ${DOMAIN}"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || \
    echo "⚠ certbot не смог. Проверь, что DNS ${DOMAIN} → этот VM, и запусти руками:
       sudo certbot --nginx -d ${DOMAIN} -m ${EMAIL} --agree-tos --redirect"
fi

PUBLIC_IP=$(curl -s ifconfig.me || echo 'unknown')
echo
echo "✅ ₮ubikz развёрнут!"
echo "   приложение:   ${DOMAIN:+https://${DOMAIN}}${DOMAIN:-http://${PUBLIC_IP}}"
echo "   логи:         sudo journalctl -u tubikz -f"
echo "   рестарт:      sudo systemctl restart tubikz"
echo "   обновление:   cd ${APP_DIR} && sudo -u ${APP_USER} git pull && sudo -u ${APP_USER} npm ci && sudo -u ${APP_USER} npm run build && sudo systemctl restart tubikz"
