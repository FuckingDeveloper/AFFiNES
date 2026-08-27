# MRH TrackWork: локальная установка и эксплуатация

MRH TrackWork разворачивается как self-hosted приложение из трёх продуктовых
частей: server, web и admin. Mobile-артефакты в образ не входят.

## Требования

- Docker Desktop или Docker Engine с Compose v2;
- минимум 8 ГБ RAM, рекомендуется 12 ГБ на первую сборку;
- свободное место для Docker build cache, PostgreSQL и загруженных файлов.

Проект использует Node.js 22.22.x и Yarn 4.13.0, но для обычного Docker-запуска
локальная установка Node.js не требуется: сборка выполняется внутри Linux
builder-образа.

## Первый запуск

Самый короткий вариант:

```sh
./scripts/start-docker-selfhost.sh
```

При первом запуске скрипт:

1. создаст `.docker/selfhost/.env` из примера;
2. сгенерирует случайный пароль PostgreSQL;
3. соберёт server, web и admin, включая Linux native-модуль;
4. применит миграции и запустит сервисы.

Сборка выполняется внутри Docker, поэтому устанавливать Node.js, Yarn и Rust на
host-машину не требуется. Повторный запуск той же команды пересоберёт изменённые
слои image и обновит контейнеры. Mobile и desktop в image не собираются.

Во время первой сборки появится шаг `Compiling affine_server_native`. Это не
mobile/desktop-компонент, а обязательный Linux-модуль server для обработки
документов, прав доступа и server runtime. Убирать его из image нельзя. Локальная
Docker-сборка использует incremental Cargo cache, параллельную code generation и
не выполняет долгий LTO; первый запуск всё равно может занять несколько минут, а
повторные сборки используют сохранённые Rust-объекты.

После перехода на <http://localhost:3010> TrackWork перенаправит браузер на
`/admin/setup`. Мастер проверит PostgreSQL и Redis, после чего предложит создать
первого администратора. Параллельное создание двух первых администраторов
заблокировано распределённой блокировкой.

Для просмотра состояния и журналов:

```sh
./scripts/start-docker-selfhost.sh --status
./scripts/start-docker-selfhost.sh --logs
```

Остановка:

```sh
./scripts/start-docker-selfhost.sh --down
```

## Авторизация

В стандартном режиме используется связка `логин + пароль`. При создании
пользователя администратор задаёт отдельный уникальный логин; для совместимости
войти также можно по email. Письма и magic-link для входа не отправляются.
Пользователь без пароля не может войти.

Доступные режимы `auth.mode`:

- `password` — локальные пароли TrackWork;
- `ldap` — корпоративный LDAP/Active Directory;
- `radius` — корпоративный RADIUS.

Режим можно задать переменной `AFFINE_AUTH_MODE=password|ldap|radius` или через
admin-конфигурацию. Для LDAP/RADIUS должны быть включены соответствующие поля
`auth.enterprise.*`. Автоматическое создание корпоративных пользователей
контролируется `auth.enterprise.autoRegister`; рекомендуется также задавать
`auth.enterprise.allowedEmailDomains`.

Из OAuth-входов сохранён только корпоративный OIDC. Consumer-провайдеры Google,
GitHub и Apple в production-модуль не регистрируются и в интерфейсе не
показываются.

## Адрес и reverse proxy

Для production обязательно задайте внешний HTTPS-адрес:

```env
AFFINE_SERVER_HTTPS=true
AFFINE_SERVER_EXTERNAL_URL=https://webtrack.example.com
```

TLS рекомендуется завершать на nginx, Caddy, Traefik или ingress-контроллере.
Приложение выставляет `nosniff`, `SAMEORIGIN`, ограничение `frame-ancestors` и,
когда включён HTTPS, HSTS. CORS разрешает только настроенные адреса сервера.

Технические имена переменных `AFFINE_*`, cookie и внутренний server id оставлены
для совместимости с существующими данными. Они не означают подключение к AFFiNE
Cloud: встроенный сервер и telemetry endpoint указывают только на текущий
TrackWork host.

## Проверка работоспособности

```sh
curl -fsS http://localhost:3010/health/live
curl -fsS http://localhost:3010/health/ready
curl -fsS http://localhost:3010/info
```

`live` проверяет процесс. `ready` дополнительно выполняет запросы к PostgreSQL и
Redis. Docker healthcheck использует readiness endpoint.

## Ошибка `P1001: Can't reach database server at postgres:5432`

Имя `postgres` доступно только контейнерам внутри сети Docker Compose. Не
запускайте image или скрипт миграций отдельной командой `docker run`: поднимайте
весь стек через штатный скрипт. Migration job ожидает готовности PostgreSQL и
Redis и повторяет запуск при кратковременном сбое.

Если ошибка осталась от предыдущего запуска, безопасно пересоздайте контейнеры:

```sh
./scripts/start-docker-selfhost.sh --down
./scripts/start-docker-selfhost.sh
./scripts/start-docker-selfhost.sh --status
```

Эти команды не удаляют PostgreSQL, загруженные файлы и конфигурацию. Не
добавляйте флаг `-v` к `docker compose down`, если не хотите безвозвратно удалить
данные Docker volumes. Если запуск снова завершился ошибкой, скрипт сам выведет
последние журналы зависимостей; полный журнал приложения доступен командой:

```sh
./scripts/start-docker-selfhost.sh --logs
```

Для нового окружения `DB_PASSWORD` генерируется автоматически. Если файл
`.docker/selfhost/.env` создаётся вручную, используйте пароль из букв и цифр или
предварительно percent-encode специальные символы: значение входит в
`DATABASE_URL`.

## Резервное копирование

Создать backup PostgreSQL, файлов и конфигурации:

```sh
./scripts/trackwork-backup.sh
```

Или выбрать каталог назначения:

```sh
./scripts/trackwork-backup.sh /path/to/backups
```

Каждый backup содержит:

- `postgres.dump`;
- `affine-data.tar.gz` с storage и config;
- `SHA256SUMS` для проверки целостности.

Храните копии отдельно от сервера и периодически проверяйте восстановление.
Backup содержит пользовательские данные и приватный ключ, поэтому каталог
создаётся с закрытыми правами и должен храниться зашифрованно.

Для ежедневного запуска в 02:00 установите расписание:

```sh
./scripts/install-trackwork-backup-cron.sh
```

Параметры находятся в `.docker/selfhost/backup.env`: срок хранения, пароль
AES-256 и необязательный S3 URI. Для S3 на host должен быть настроен AWS CLI.
Разовый запуск того же контролируемого сценария:

```sh
./scripts/trackwork-backup-auto.sh
```

## Восстановление

Восстановление заменяет текущую базу, storage и config. Команда требует явного
подтверждения:

```sh
./scripts/trackwork-restore.sh \
  /path/to/backups/trackwork-YYYYMMDDTHHMMSSZ \
  --confirm-destructive-restore
```

Скрипт проверит SHA-256, остановит server, восстановит PostgreSQL и файлы,
применит актуальные миграции и снова запустит TrackWork.

## Обновление

Перед обновлением создайте backup, затем получите изменения и пересоберите
образ:

```sh
./scripts/trackwork-backup.sh
git pull --ff-only
./scripts/start-docker-selfhost.sh
```

Migration job завершается до запуска server. Если миграция не прошла, основной
контейнер не стартует; сначала изучите журнал через `--logs`, не изменяя базу
вручную.

## Локальные проверки без Docker

```sh
corepack enable
corepack prepare yarn@4.13.0 --activate
yarn install --immutable
yarn typecheck
yarn lint
yarn test
yarn build:trackwork
```

`build:trackwork` собирает только server, web и admin.

## Интеграции с системами разработки

Подключение GitLab (коммиты, ветки, merge request'ы) и Jenkins (статусы
пайплайнов), стабильные ключи задач и политика связей описаны в
[trackwork-development-integrations.ru.md](trackwork-development-integrations.ru.md).

## Контакты

- сайт: <https://trackwork.mrhsoftware.com>;
- помощь: <https://trackwork.mrhsoftware.com/help>;
- поддержка: <trackwork@mrhsoftware.com>.
