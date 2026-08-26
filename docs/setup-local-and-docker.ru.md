# Запуск MRH TrackWork локально и через Docker

> Актуальная production/self-host инструкция для MRH TrackWork находится в
> [trackwork-selfhost.ru.md](./trackwork-selfhost.ru.md). В ней описаны новая
> сборка только server/web/admin, password-only вход, healthchecks и
> backup/restore.

Ниже инструкция именно по этому форку и по текущей структуре репозитория.

## Что есть в репозитории

Это Yarn 4 monorepo. Для разработки тут важны два разных сценария:

1. **Локальная разработка без Docker для самого приложения**
   - web запускается через `yarn dev`
   - backend запускается через `yarn affine server dev`
   - но для полного стека всё равно нужны внешние сервисы: Postgres, Redis и почтовый сервер для dev-потока

2. **Self-host запуск через Docker Compose**
   - одной командой собираются только server, web и admin;
   - PostgreSQL, Redis, миграции и приложение запускаются через Compose.

## Проверенные входные точки

- Node.js: версия из `.nvmrc` -> `22.22.2`
- Yarn: `4.13.0`
- Web dev: `yarn dev`
- Server dev: `yarn affine server dev`
- Инициализация backend: `yarn affine server init`
- Локальная сборка server/web/admin: `yarn build:trackwork`
- Сборка и запуск Docker: `./scripts/start-docker-selfhost.sh`
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

## Сценарий 2. Собрать и запустить TrackWork в Docker

Из корня репозитория выполните одну команду:

```bash
./scripts/start-docker-selfhost.sh
```

Скрипт автоматически:

1. создаёт `.docker/selfhost/.env`, если файла ещё нет;
2. генерирует безопасный пароль PostgreSQL;
3. собирает Linux Docker image `trackwork-local:dev`;
4. внутри builder-образа собирает server, web и admin с native-модулем;
5. запускает PostgreSQL и Redis;
6. ожидает готовности зависимостей и применяет Prisma migrations;
7. запускает TrackWork на <http://localhost:3010>.

Node.js, Yarn и Rust на host-машине для этого сценария не нужны. Mobile,
Electron и native mobile wrappers не собираются.

Первый build может занять несколько минут. Последующие сборки используют Docker
BuildKit cache и пересобирают только изменившиеся слои.

Строка `Compiling affine_server_native` относится к обязательному native-модулю
backend, а не к mobile или desktop. Он компилируется под Linux внутри builder и
нужен server во время запуска. Dockerfile использует incremental Cargo cache,
параллельную code generation и отключает долгий LTO, поэтому наиболее долгой
является только первая сборка для выбранной архитектуры.

Проверить результат:

```bash
./scripts/start-docker-selfhost.sh --status
curl -fsS http://localhost:3010/health/ready
```

Ожидаемое состояние:

- migration-контейнер завершился с кодом `0`;
- контейнер приложения имеет состояние `Up`/`healthy`;
- readiness endpoint возвращает успешный ответ.

### Управление стеком

Только собрать image, не запуская контейнеры:

```bash
./scripts/start-docker-selfhost.sh --build
```

Пересобрать и запустить явно:

```bash
./scripts/start-docker-selfhost.sh --up
```

Посмотреть журналы:

```bash
./scripts/start-docker-selfhost.sh --logs
```

Остановить контейнеры без удаления данных:

```bash
./scripts/start-docker-selfhost.sh --down
```

Не используйте `docker compose down -v`, если хотите сохранить базу и файлы.

---

## Готовые скрипты

- `scripts/start-local-no-docker.sh` — локальная разработка;
- `scripts/start-docker-selfhost.sh` — полная Docker-сборка и запуск TrackWork.

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

## Практический вывод

Если цель:

- **собрать и поднять ваш форк целиком** — `./scripts/start-docker-selfhost.sh`;
- **разрабатывать web/server с быстрым hot reload** — локальный сценарий без
  Docker для app-процессов, но с PostgreSQL и Redis.
