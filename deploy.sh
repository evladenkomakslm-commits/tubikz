#!/usr/bin/env bash
# Одна команда: пересобрать → закоммитить → запушить → Render задеплоит автоматом.
# Использование:
#   ./deploy.sh "какая-то правка"
#
# Если без аргумента — возьмёт текущее время как сообщение.

set -e
cd "$(dirname "$0")"

MSG="${1:-update $(date '+%Y-%m-%d %H:%M')}"

echo "▶ собираю production-бандл…"
rm -rf .next/cache
npm run build >/dev/null

echo "▶ коммичу и пушу…"
git add -A
git commit -m "$MSG" 2>/dev/null || { echo "нечего коммитить"; exit 0; }
git push origin main

echo ""
echo "✅ запушено. Render автоматом подхватит за ~10 сек, билд ~2 мин."
echo "   следить: https://dashboard.render.com"
echo "   приложение: https://tubikz.onrender.com"
