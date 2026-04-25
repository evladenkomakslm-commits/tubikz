# ₮ubikz

> тюбики собираются здесь

Минималистичный мессенджер на Next.js 14 + TypeScript + Socket.io + Prisma.
Тёмная тема, плавные анимации, real-time чаты, голосовые/фото/видео.

## Стек

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** + **Framer Motion** — UI и анимации
- **Prisma** + **SQLite** (легко переключается на PostgreSQL)
- **NextAuth.js** (Credentials) + **bcryptjs** — авторизация
- **Socket.io** — real-time через кастомный сервер (`server.ts`)
- **Zod** — валидация на входе

## Запуск

```bash
cp .env.example .env       # отредактируй NEXTAUTH_SECRET
npm install
npx prisma db push         # создаст SQLite-базу dev.db
npm run dev                # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## Установить на macOS как обычное приложение

Уже собрано: **`/Applications/Tubikz.app`**.

- Запусти из Launchpad / Spotlight (⌘ + пробел → «Tubikz»).
- Перетащи иконку из Launchpad в Dock — будет жить там как обычная программа.
- При первом запуске за ~4 секунды поднимется сервер и откроется чат.
- Логи: `~/Library/Logs/Tubikz.log`.

Пересобрать .app после изменений:

```bash
node scripts/generate-icons.mjs   # если менял иконку
bash scripts/build-app.sh
cp -R build/Tubikz.app /Applications/
```

Альтернатива — **PWA в Safari** (даёт ещё более «нативное» окно без браузерного UI):

1. Запусти сервер любым способом (`npm run dev` или открыв `/Applications/Tubikz.app`).
2. Открой `http://localhost:3000` в Safari.
3. Меню *File → Add to Dock…* → готово, иконка появится в Dock и Launchpad.

Третий вариант — **`scripts/start-tubikz.command`**: двойной клик в Finder поднимет
сервер с production-сборкой и откроет браузер.

## Структура (feature-based, масштабируемая)

```
src/
├── app/
│   ├── (auth)/            # /login, /register
│   ├── (main)/            # /chat, /friends, /profile (требуют авторизации)
│   ├── api/               # все REST-эндпоинты
│   │   ├── auth/          # NextAuth + register
│   │   ├── conversations/ # список + сообщения + read receipts
│   │   ├── friends/       # список, request, respond
│   │   ├── upload/        # загрузка медиа
│   │   └── users/         # профиль + поиск
│   ├── layout.tsx
│   ├── providers.tsx
│   ├── page.tsx           # welcome
│   └── globals.css
├── components/
│   ├── auth/              # формы входа/регистрации
│   ├── chat/              # ChatList, ChatRoom, MessageBubble, Composer, ...
│   ├── friends/           # FriendsPanel
│   ├── profile/           # ProfilePanel
│   ├── shell/             # AppShell + Sidebar
│   ├── ui/                # Avatar, Toast (общие)
│   └── welcome/           # Hero
├── hooks/
│   └── useSocket.ts
├── lib/
│   ├── auth.ts            # NextAuth options + hashPassword
│   ├── db.ts              # Prisma singleton
│   ├── friends.ts         # бизнес-логика дружбы и чатов
│   ├── uploads.ts         # сохранение файлов на диск
│   ├── utils.ts           # cn, время, инициалы, цвет аватара
│   └── validators.ts      # Zod-схемы (один источник истины)
├── server/
│   └── socket-bus.ts      # шина для эмита событий из API роутов
└── types/
    ├── index.ts
    └── next-auth.d.ts

server.ts                  # кастомный HTTP-сервер: Next + Socket.io в одном процессе
prisma/schema.prisma       # модели User, Conversation, Message, Friendship, ...
```

## Как сделана масштабируемость

- **Feature-based components** — каждая фича изолирована (`chat/`, `friends/`,
  `profile/`), легко вынести в отдельный модуль.
- **API роуты как тонкий слой** — вся логика в `lib/` (`friends.ts`,
  `validators.ts`). Можно перенести в отдельный backend без переписывания.
- **Один источник истины для типов** — Zod-схемы в `lib/validators.ts`
  переиспользуются клиентом и сервером.
- **Socket-bus** (`src/server/socket-bus.ts`) — позволяет API роутам
  эмитить события через Socket.io без циклических зависимостей. Готов
  к замене на Redis pub/sub для горизонтального масштабирования.
- **Prisma + SQLite в dev** — переключение на PostgreSQL: меняешь
  `provider` и `DATABASE_URL`, переводишь строковые поля статусов
  обратно в native enums (см. комментарии в `schema.prisma`).
- **Загрузки на диск** — `lib/uploads.ts` инкапсулирует storage. Замена
  на S3 / Cloudflare R2 — точечная.
- **Сессии через JWT** (NextAuth) — масштабируется без sticky session.

## Функционал

- ✅ Регистрация / вход (email + пароль), валидация Zod, пароли через bcrypt
- ✅ Сессии (JWT, 30 дней), выход
- ✅ Профиль: username (уникальный), display name, bio, аватар
- ✅ Поиск пользователей по username
- ✅ Заявки в друзья (с авто-принятием при встречной)
- ✅ 1-на-1 чаты, история, бесконечная пагинация (по `before`)
- ✅ Real-time сообщения через Socket.io
- ✅ Индикатор «печатает…»
- ✅ Статусы: ⏱ отправляется, ✓ отправлено, ✓✓ прочитано
- ✅ Текст / фото / видео / голосовые (запись прямо в браузере)
- ✅ Онлайн / оффлайн статус (по подключённым сокетам)
- ✅ Уведомления-тосты при новых сообщениях, когда вкладка не активна
- ✅ Плавные анимации (Framer Motion), плавный скролл

## Эндпоинты API (кратко)

| Метод | Путь | Что делает |
|-------|------|-----------|
| POST | `/api/auth/register` | регистрация |
| POST/GET | `/api/auth/[...nextauth]` | NextAuth (login/logout/session) |
| GET/PATCH | `/api/users/me` | профиль |
| GET | `/api/users/search?q=...` | поиск по username |
| GET | `/api/friends` | список друзей + входящие заявки |
| POST | `/api/friends/request` | отправить заявку |
| POST | `/api/friends/respond` | принять / отклонить |
| GET/POST | `/api/conversations` | список / создать диалог |
| GET | `/api/conversations/[id]` | инфо о чате (peer) |
| GET/POST | `/api/conversations/[id]/messages` | история / отправка |
| POST | `/api/conversations/[id]/read` | пометить прочитанным |
| POST | `/api/upload` | загрузка файла (avatar/image/video/voice) |

## Socket.io события

**Клиент → сервер:**
- `conversation:join` — войти в комнату чата
- `typing` — `{ conversationId, isTyping }`

**Сервер → клиент:**
- `message:new` — `{ message }`
- `message:read` — `{ conversationId, userId, messageIds }`
- `typing` — `{ conversationId, userId, isTyping }`
- `presence` — `{ userId, isOnline }`

## Деплой на Oracle Cloud Always Free

Полный пошаговый гайд: [`deploy/ORACLE-WALKTHROUGH.md`](deploy/ORACLE-WALKTHROUGH.md).

TL;DR:
1. Создай ARM-инстанс (4 OCPU + 24 GB RAM) в Oracle Cloud — бесплатно навсегда.
2. Открой порты 80/443 в Security List.
3. SSH на VM → `sudo bash deploy/setup-vm.sh` (или с переменной `DOMAIN=` — сразу с HTTPS).
4. Скрипт сам поставит Node, nginx, systemd-сервис, Let's Encrypt.

Артефакты:
- [`deploy/setup-vm.sh`](deploy/setup-vm.sh) — провижининг VM одной командой
- [`deploy/nginx.conf`](deploy/nginx.conf) — reverse proxy с WebSocket upgrade
- [`deploy/tubikz.service`](deploy/tubikz.service) — systemd-юнит (auto-restart, autostart)

## Дальше можно

- Звонки (WebRTC + TURN)
- Групповые чаты (схема уже поддерживает `GROUP`)
- E2E шифрование (Signal protocol)
- Push-уведомления (Web Push / FCM)
- Мобильные клиенты (React Native, переиспользуем API)
- Перевод хранилища медиа на S3, БД на PostgreSQL, socket-bus на Redis

## Лицензия

MIT
