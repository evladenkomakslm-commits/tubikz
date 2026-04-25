# Деплой ₮ubikz на Oracle Cloud Always Free — пошагово

Время: ~30 минут (большая часть — ожидание ввода данных в Oracle Console).

---

## 0. Что нужно заранее

- Кредитная или дебетовая карта **с поддержкой международных платежей** (списаний не будет, только верификация на $1, который вернётся).
- Телефон для SMS.
- Email.
- Документ: некоторые регионы спрашивают паспорт.

---

## 1. Регистрация (5–10 мин)

1. Открой <https://www.oracle.com/cloud/free/>.
2. Жми **Start for free**.
3. Заполни форму:
   - **Country**: выбирай страну, в которой реально живёшь (от этого зависит **Home Region** — её потом не сменить).
   - **Account Type**: **Personal**.
   - Имя, email — реальные.
4. Подтверди email по ссылке из письма.
5. Введи адрес, телефон → SMS-код.
6. Привяжи карту. **Важно**: убедись, что переключатель **«Always Free»** виден — это значит, что без апгрейда тарифа списаний не будет.
7. Дождись завершения провижининга аккаунта (5–10 мин). Придёт письмо «Your Oracle Cloud Account is Ready».

---

## 2. Создание ARM VM (10 мин)

ARM Ampere A1 — самый сочный free-вариант: **до 4 ядер + 24 GB RAM навсегда бесплатно**.

1. Войди в Console: <https://cloud.oracle.com>.
2. Слева ☰ → **Compute → Instances**.
3. Кнопка **Create Instance**.
4. Заполни:
   - **Name**: `tubikz`
   - **Compartment**: дефолтный
   - **Image**: **Change image** → **Canonical Ubuntu 22.04** (Always Free eligible).
   - **Shape**: **Change shape** → вкладка **Ampere** → выбери **VM.Standard.A1.Flex** → поставь **OCPU = 4**, **Memory = 24 GB**. Это всё ещё в пределах free.
     > Если выдаёт «Out of capacity» — попробуй другой Availability Domain (AD-1/2/3) или подожди час и попробуй снова. Иногда нужно несколько попыток.
   - **Networking**: «Create new VCN» (по умолчанию). Subnet — public.
   - **SSH keys**: выбери **Generate a key pair for me** → нажми **Save Private Key** и **Save Public Key**. Файл `.key` сохрани — это твой пропуск на сервер.
   - **Boot volume**: оставь как есть (50 GB бесплатно).
5. Жми **Create**. Через 1–2 минуты VM будет в статусе **Running**.
6. В карточке инстанса скопируй **Public IP Address** — это твой адрес.

---

## 3. Открыть порты 80 и 443 (3 мин)

Oracle по умолчанию блокирует входящий трафик кроме SSH.

1. На странице инстанса → блок **Primary VNIC** → ссылка **Subnet: …**.
2. На странице subnet → ссылка **Default Security List for vcn-…**.
3. **Add Ingress Rules**:
   - **Source CIDR**: `0.0.0.0/0`, **Destination Port Range**: `80` — добавить
   - Ещё раз: то же самое для `443`
4. Сохранить.

---

## 4. Подключение по SSH (1 мин)

На своём Маке:

```bash
chmod 600 ~/Downloads/ssh-key-XXXX.key   # путь к скачанному приватному ключу
ssh -i ~/Downloads/ssh-key-XXXX.key ubuntu@<PUBLIC_IP>
```

Если первый раз — подтверди fingerprint (`yes`).

---

## 5. Деплой ₮ubikz (5 мин)

Самый простой путь — заливать с локальной машины через `scp` (если репо ещё не на GitHub).

### Вариант А — заливаешь свой Mac → VM (без GitHub)

С Мака, **в корне проекта** `/Users/maxevladenko/₮ubikz`:

```bash
# создаём архив, исключаем тяжёлое
tar --exclude=node_modules --exclude=.next --exclude=build --exclude='prisma/dev.db' \
    -czf /tmp/tubikz.tgz -C /Users/maxevladenko ₮ubikz

# копируем на VM
scp -i ~/Downloads/ssh-key-XXXX.key /tmp/tubikz.tgz ubuntu@<PUBLIC_IP>:/tmp/

# распаковываем и запускаем bootstrap
ssh -i ~/Downloads/ssh-key-XXXX.key ubuntu@<PUBLIC_IP> << 'EOF'
sudo mkdir -p /opt/tubikz
sudo tar -xzf /tmp/tubikz.tgz -C /opt --strip-components=1 --transform='s|^₮ubikz|tubikz|' 2>/dev/null || \
  sudo tar -xzf /tmp/tubikz.tgz -C /opt && sudo mv /opt/₮ubikz /opt/tubikz
sudo chown -R ubuntu:ubuntu /opt/tubikz
cd /opt/tubikz
sudo bash deploy/setup-vm.sh
EOF
```

### Вариант Б — через GitHub (чище, обновления через `git pull`)

1. Создай репо на github.com (можно приватный).
2. На Маке:
   ```bash
   cd /Users/maxevladenko/₮ubikz
   git init && git add . && git commit -m "init"
   git remote add origin git@github.com:<you>/tubikz.git
   git push -u origin main
   ```
3. На VM:
   ```bash
   ssh -i ~/Downloads/ssh-key-XXXX.key ubuntu@<PUBLIC_IP>
   sudo REPO_URL=https://github.com/<you>/tubikz.git \
        bash <(curl -fsSL https://raw.githubusercontent.com/<you>/tubikz/main/deploy/setup-vm.sh)
   ```

В обоих случаях скрипт:
- поставит Node 20, nginx, certbot
- соберёт прод-бандл
- зарегистрирует systemd-сервис (auto-restart при падении, autostart при ребуте)
- настроит nginx с WebSocket-проксированием
- откроет файрволл

В конце выведет: `✅ ₮ubikz развёрнут!  http://<PUBLIC_IP>`

---

## 6. (Опционально) Свой домен + HTTPS

Без домена приложение доступно по `http://<PUBLIC_IP>`. Это работает, но браузеры будут ругаться на отсутствие HTTPS, а **доступ к микрофону на iOS требует HTTPS** — без сертификата голосовые с iPhone не запишутся.

**Бесплатный вариант — DuckDNS:**

1. Зайди на <https://www.duckdns.org>, авторизуйся через Google/GitHub.
2. Создай поддомен, например `tubikz.duckdns.org`, укажи **current IP = твой Public IP**.
3. На VM:
   ```bash
   sudo DOMAIN=tubikz.duckdns.org EMAIL=ты@mail.com bash /opt/tubikz/deploy/setup-vm.sh
   ```
   Скрипт повторно прогонит конфиг и выпустит Let's Encrypt сертификат.
4. Открывай `https://tubikz.duckdns.org`.

---

## 7. Полезные команды на VM

```bash
sudo systemctl status tubikz       # статус сервиса
sudo systemctl restart tubikz      # рестарт
sudo journalctl -u tubikz -f       # живые логи
sudo systemctl reload nginx        # перечитать nginx
sudo certbot renew --dry-run       # проверить продление сертификата
```

Обновление кода:
```bash
cd /opt/tubikz
sudo -u tubikz git pull
sudo -u tubikz npm ci
sudo -u tubikz npx prisma db push --accept-data-loss --skip-generate
sudo -u tubikz npm run build
sudo systemctl restart tubikz
```

---

## 8. Что делать, если

**Сайт не открывается по IP** → проверь
- `sudo systemctl status tubikz` (запущен?)
- `sudo systemctl status nginx`
- Ingress Rules в Oracle Console (порты 80/443 открыты?)
- `sudo iptables -L -n | head` (порты не заблокированы локально?)

**`Out of capacity` при создании VM** → ARM-инстансы временно нет в этой AD.
Попробуй другую Availability Domain или подожди час.

**Oracle списал $1** → это hold для верификации, вернётся в течение 7 дней.

**Аккаунт могут «забрать», если не пользоваться?** — Free Tier ресурсы Oracle
**может реклеймить после 7 дней простоя**. Решение: периодически открывать сайт
или поставить простой watchdog (cron, который раз в день делает HTTP-запрос).
