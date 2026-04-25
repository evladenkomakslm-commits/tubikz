#!/usr/bin/env bash
# Собирает Tubikz.app — нативный bundle для Dock/Launchpad.
# Запускается изнутри корня проекта.

set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_ROOT="$(pwd)"
APP_NAME="Tubikz"
APP_DIR="build/${APP_NAME}.app"
CONTENTS="${APP_DIR}/Contents"
MACOS="${CONTENTS}/MacOS"
RESOURCES="${CONTENTS}/Resources"

rm -rf "$APP_DIR"
mkdir -p "$MACOS" "$RESOURCES"

# 1. Иконка
cp build/Tubikz.icns "${RESOURCES}/AppIcon.icns"

# 2. Info.plist
cat > "${CONTENTS}/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>₮ubikz</string>
  <key>CFBundleDisplayName</key><string>₮ubikz</string>
  <key>CFBundleIdentifier</key><string>app.tubikz.launcher</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleExecutable</key><string>tubikz-launcher</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><false/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
EOF

# 3. Launcher binary (bash)
cat > "${MACOS}/tubikz-launcher" <<EOF
#!/usr/bin/env bash
PROJECT="${PROJECT_ROOT}"
PORT="\${TUBIKZ_PORT:-3000}"
URL="http://localhost:\${PORT}/chat"
LOG="\$HOME/Library/Logs/Tubikz.log"

mkdir -p "\$(dirname "\$LOG")"

# Подхватим Node из обычных мест
if ! command -v node >/dev/null 2>&1; then
  for p in /opt/homebrew/bin /usr/local/bin "\$HOME/.volta/bin"; do
    [ -x "\$p/node" ] && export PATH="\$p:\$PATH" && break
  done
fi

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "₮ubikz" message "Node.js не найден. Установи через https://nodejs.org или brew install node."'
  exit 1
fi

cd "\$PROJECT"

# Если уже слушает — просто откроем
if curl -sf "http://localhost:\${PORT}" >/dev/null 2>&1; then
  open "\$URL"
  exit 0
fi

# Первый запуск — подготовим
[ -d node_modules ] || npm install --silent >> "\$LOG" 2>&1
[ -f prisma/dev.db ] || npx prisma db push --accept-data-loss --skip-generate >> "\$LOG" 2>&1
[ -d node_modules/.prisma ] || npx prisma generate >> "\$LOG" 2>&1
[ -f .next/BUILD_ID ] || npm run build >> "\$LOG" 2>&1

# Поднимем сервер в фоне
nohup env PORT="\$PORT" NODE_ENV=production npx tsx server.ts >> "\$LOG" 2>&1 &
SERVER_PID=\$!
echo "\$SERVER_PID" > "\$HOME/Library/Logs/Tubikz.pid"

# Подождём, пока встанет, и откроем
for i in {1..30}; do
  if curl -sf "http://localhost:\${PORT}" >/dev/null 2>&1; then
    open "\$URL"
    exit 0
  fi
  sleep 0.5
done

osascript -e 'display alert "₮ubikz" message "Сервер не поднялся. Лог: ~/Library/Logs/Tubikz.log"'
exit 1
EOF
chmod +x "${MACOS}/tubikz-launcher"

# 4. Сообщить Finder перечитать иконку
touch "$APP_DIR"

echo "✓ собрано: $APP_DIR"
echo ""
echo "Чтобы установить:"
echo "  cp -R $APP_DIR /Applications/"
echo ""
echo "Или перетащи build/${APP_NAME}.app в /Applications в Finder."
