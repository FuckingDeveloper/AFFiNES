# Запуск AFFiNES локально и через Docker

Ниже инструкция именно по этому форку и по текущей структуре репозитория.

## Что есть в репозитории

Это Yarn 4 monorepo. Для разработки тут важны два разных сценария:

1. **Локальная разработка без Docker для самого приложения**
   - web запускается через `yarn dev`
   - backend запускается через `yarn affine server dev`
   - но для полного стека всё равно нужны внешние сервисы: Postgres, Redis и почтовый сервер для dev-потока

2. **Self-host запуск через Docker Compose**
   - используется `.docker/selfhost/compose.yml`
   - можно поднять либо upstream image, либо локально собранный image из вашего форка

## Проверенные входные точки

- Node.js: версия из `.nvmrc` -> `22.22.2`
- Yarn: `4.13.0`
- Web dev: `yarn dev`
- Server dev: `yarn affine server dev`
- Инициализация backend: `yarn affine server init`
- Полная Docker-сборка артефактов: `yarn build:docker`
- Self-host compose: `.docker/selfhost/compose.yml`
- Dev services compose: `.docker/dev/compose.yml.example`

## Важное ограничение про «без Docker»

Если под «без Docker» вы имеете в виду **вообще без контейнеров**, то полный локальный сценарий возможен, но у вас должны быть **локально установлены**:

- PostgreSQL 16+
- Redis
- Mailpit или MailHog
- Rust toolchain

Если этих сервисов локально нет, frontend можно поднять, но backend-функциональность без БД и Redis полноценно не заработает.

---

## Сценарий 1. Полный запуск локально, без Docker

### 1) Установить системные зависимости

Минимум:

- Node.js `22.22.2`
- Corepack
- Yarn `4.13.0`
- Rust (`cargo`, `rustc`)
- PostgreSQL
- Redis
- Mailpit или MailHog

На macOS через Homebrew это обычно выглядит так:

```bash
brew install nvm redis postgresql@16 mailpit
curl https://sh.rustup.rs -sSf | sh -s -- -y
```

Node лучше поставить через `nvm`:

```bash
nvm install 22.22.2
nvm use 22.22.2
corepack enable
corepack prepare yarn@4.13.0 --activate
```

### 2) Поднять локальные сервисы

Запустите сервисы отдельно от приложения:

```bash
brew services start postgresql@16
brew services start redis
brew services start mailpit
```

Проверка:

```bash
pg_isready -h localhost -p 5432
redis-cli ping
curl -fsS http://127.0.0.1:8025 >/dev/null
```

### 3) Подготовить БД

Создайте пользователя и БД, если их ещё нет:

```bash
createuser -s affine || true
psql postgres -c "ALTER USER affine WITH PASSWORD 'affine';" || true
createdb -O affine affine || true
```

Если пользователь `affine` не создан, можно сначала создать его вручную:

```bash
createuser affine
psql postgres -c "ALTER USER affine WITH SUPERUSER PASSWORD 'affine';"
createdb -O affine affine
```

### 4) Установить зависимости репозитория

Из корня репозитория:

```bash
yarn install
```

### 5) Подготовить backend env

Создайте файл:

`packages/backend/server/.env`

Минимальное содержимое:

```bash
DATABASE_URL="postgres://affine:affine@localhost:5432/affine"
REDIS_SERVER_HOST=localhost
MAILER_HOST=127.0.0.1
MAILER_PORT=1025
MAILER_SECURE=false
AFFINE_SERVER_EXTERNAL_URL=http://localhost:8080
AFFINE_INDEXER_ENABLED=false
```

Почему так:

- `DATABASE_URL` и `REDIS_SERVER_HOST` реально используются сервером
- `MAILER_*` нужны для dev-почты
- `AFFINE_SERVER_EXTERNAL_URL=http://localhost:8080` уже встречается в server package как локальная dev-база URL
- indexer лучше отключить для простого локального старта

### 6) Собрать native-зависимости сервера

```bash
yarn affine @affine/server-native build
```

### 7) Инициализировать сервер

```bash
yarn affine server init
```

Это прогонит Prisma migrations и dev-инициализацию.

### 8) Запустить backend

В одном терминале:

```bash
yarn affine server dev
```

### 9) Запустить frontend

Во втором терминале:

```bash
yarn dev
```

### 10) Проверить

- backend: `http://localhost:3010/info` или GraphQL endpoint сервера, если он объявлен текущей сборкой
- frontend: обычно `http://localhost:8080`

Для логина в dev-режиме репозиторий документирует тестовых пользователей:

- `dev@affine.pro / dev`
- `pro@affine.pro / pro`
- `team@affine.pro / team`

### 11) Дополнительно

Prisma Studio:

```bash
yarn affine server prisma studio
```

---

## Сценарий 2. Docker self-host с upstream image

Это самый быстрый способ просто поднять self-host окружение.

```bash
cd .docker/selfhost
cp .env.example .env
```

После этого обязательно задайте пароль БД в `.env`, например:

```bash
DB_PASSWORD=affine
```

Запуск:

```bash
docker compose up -d
```

Проверка:

```bash
docker compose ps
docker compose logs --tail=120 affine_migration affine
curl -fsS http://localhost:3010/info
```

Остановка:

```bash
docker compose down
```

---

## Сценарий 3. Docker self-host именно из вашего форка

Если нужен запуск **вашего кода**, а не `ghcr.io/toeverything/affine:stable`, нужен локальный image.

### 1) Собрать артефакты

```bash
yarn install
yarn build:docker
```

`build:docker` включает:

- `build:server`
- `build`
- `build:admin`
- `build:mobile`

### 2) Собрать image

```bash
docker build -f .github/deployment/node/Dockerfile -t affine-local:dev .
```

### 3) Подготовить selfhost env

```bash
cd .docker/selfhost
cp .env.example .env
```

Заполните минимум:

```bash
DB_PASSWORD=affine
PORT=3010
```

### 4) Запустить compose с override

В репозитории уже есть `.docker/selfhost/compose.local.yml`, который подменяет image на `affine-local:dev`.

Запуск:

```bash
docker compose -f compose.yml -f compose.local.yml up -d
```

Проверка:

```bash
docker compose -f compose.yml -f compose.local.yml ps -a
docker compose -f compose.yml -f compose.local.yml logs --tail=120 affine_migration affine
curl -fsS http://localhost:3010/info
```

Ожидаемое состояние:

- `affine_migration` завершился с кодом `0`
- `affine_server` находится в `Up`
- `/info` возвращает JSON с self-host информацией

Остановка:

```bash
docker compose -f compose.yml -f compose.local.yml down
```

---

## Готовые скрипты

Я добавил два скрипта:

- `scripts/start-local-no-docker.sh`
- `scripts/start-docker-selfhost.sh`

### Локальный сценарий

Проверка и подготовка env:

```bash
./scripts/start-local-no-docker.sh --prepare
```

Запуск backend + frontend:

```bash
./scripts/start-local-no-docker.sh --start
```

Только backend:

```bash
./scripts/start-local-no-docker.sh --server
```

Только frontend:

```bash
./scripts/start-local-no-docker.sh --web
```

### Docker-сценарий

Быстро поднять upstream image:

```bash
./scripts/start-docker-selfhost.sh --upstream
```

Собрать и поднять ваш fork image:

```bash
./scripts/start-docker-selfhost.sh --local-image
```

Остановить upstream стек:

```bash
./scripts/start-docker-selfhost.sh --down-upstream
```

Остановить стек локального image:

```bash
./scripts/start-docker-selfhost.sh --down-local
```

Показать логи:

```bash
./scripts/start-docker-selfhost.sh --logs-upstream
./scripts/start-docker-selfhost.sh --logs-local
```

---

## Практический вывод

Если цель:

- **быстро просто посмотреть продукт** -> используйте Docker upstream
- **поднимать именно ваш форк в контейнере** -> `--local-image`
- **разрабатывать web/server и дебажить код** -> локальный сценарий без Docker для app-процессов, но с локально установленными Postgres/Redis/Mailpit

Если хотите, следующим сообщением я могу ещё сделать третий скрипт: `scripts/stop-all-affine.sh`, чтобы одной командой гасить оба сценария.
