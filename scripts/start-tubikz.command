#!/usr/bin/env bash
# ₮ubikz · one-click launcher
# Двойной клик — поднимет prod-сервер и откроет приложение в браузере.

set -e
cd "$(dirname "$0")/.."

# Найдём свободный node (homebrew / nvm / system) — используем первый рабочий.
if ! command -v node >/dev/null 2>&1; then
  for p in /opt/homebrew/bin /usr/local/bin "$HOME/.volta/bin" "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin"; do
    if [ -x "$p/node" ]; then export PATH="$p:$PATH"; break; fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "₮ubikz" message "Node.js не найден. Установи через https://nodejs.org или brew install node, затем повтори."'
  exit 1
fi

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}/chat"

# Установим зависимости при первом запуске
if [ ! -d node_modules ]; then
  echo "▶ первый запуск, ставлю зависимости…"
  npm install --silent
fi

# Сгенерим Prisma client + поднимем БД, если нужно
[ ! -f prisma/dev.db ] && npx prisma db push --accept-data-loss --skip-generate >/dev/null 2>&1 || true
[ ! -d node_modules/.prisma ] && npx prisma generate >/dev/null 2>&1 || true

# Соберём prod-бандл при первом запуске или после изменений
if [ ! -f .next/BUILD_ID ]; then
  echo "▶ собираю production-бандл…"
  npm run build
fi

# Откроем браузер чуть позже, когда сервер встанет
( sleep 2; open "$URL" ) &

echo "▶ ₮ubikz стартует на $URL"
exec env PORT="$PORT" NODE_ENV=production npx tsx server.ts
