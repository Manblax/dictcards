# dictcards

Веб-приложение для создания собственных наборов терминов, работы со словарными
подсказками и изучения материала в интерактивных режимах.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-149eca)
![NestJS](https://img.shields.io/badge/NestJS-11-e0234e)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169e1)

## Возможности

- Регистрация, вход по логину или email, Google OAuth и Яндекс ID.
- Защищённые пользовательские модули с созданием, редактированием, удалением и
  сохранённым порядком терминов.
- Главная страница с недавними модулями, библиотека и поиск по названию своих
  модулей с постраничной загрузкой.
- Подсказки из Cambridge или Oxford при редактировании терминов.
- UK/US-произношение через словарные аудиофайлы и Google Cloud TTS.
- Четыре цветовые темы: `dark-classic`, `light-classic`, `light` и `dark`.
- Пять учебных режимов: `card`, `learn`, `test`, `write` и `spell`.
- Восстановление незавершённых упражнений после обновления страницы в
  пределах текущей вкладки.
- Адаптивный интерфейс для мобильных и десктопных экранов.

## Архитектура

Репозиторий содержит три самостоятельных npm-проекта. npm workspaces не
используются.

| Сервис | Технологии | Порт | Назначение |
| --- | --- | --- | --- |
| `frontend/` | Next.js 16, React 19, Tailwind CSS 4, DaisyUI 5 | 3000 | UI, маршруты и клиентское состояние |
| `backend/` | NestJS 11, Prisma 6, JWT/Passport | 3001 | Авторизация, CRUD модулей, словарный кеш, TTS и загрузки |
| `dictionary-service/` | NestJS 11, Cheerio | 4000, только внутренняя сеть | Получение и нормализация данных Cambridge/Oxford |
| PostgreSQL | PostgreSQL 15 | 5432 | Пользователи, модули, термины, словарный и TTS-кеш |

Основной поток данных:

```text
Browser
  └─ Next.js frontend
       └─ NestJS backend
            ├─ PostgreSQL
            ├─ Google Cloud Text-to-Speech
            └─ dictionary-service
                 ├─ Cambridge Dictionary
                 └─ Oxford Learner's Dictionaries
```

Backend — единственный сервис, который обращается к PostgreSQL.
`dictionary-service` не хранит состояние и не публикуется наружу в production.

## Быстрый старт через Docker

### 1. Подготовьте окружение

Docker Compose требует файл `backend/.env`, даже если большая часть значений
переопределяется в `docker-compose.yml`:

```dotenv
DATABASE_URL=postgresql://myuser:mypassword@postgres:5432/dictcards_db
JWT_SECRET=dev-secret-change-me
FRONTEND_URL=http://localhost:3000
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
DICTIONARY_SERVICE_URL=http://dictionary-service:4000
```

Google OAuth необязателен для обычной регистрации. Для него дополнительно
укажите `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET`.

Значения паролей и JWT в примерах предназначены только для локальной разработки.
Для production создайте отдельные случайные секреты. Перед первым коммитом
настройте [локальную проверку секретов](docs/security.md).

Для Яндекс ID заполните `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET` и
`YANDEX_CALLBACK_URL` в корневом `.env` для Docker или `backend/.env` для запуска
на хосте. [Регистрация OAuth-приложения и настройка Яндекса](docs/yandex-auth.md).

При необходимости переопределить публичные или внутренние URL:

```bash
cp .env.example .env
```

### 2. Запустите стек

```bash
docker compose up -d
```

Команда запускает весь development-стек:

- frontend: [http://localhost:3000](http://localhost:3000)
- backend: [http://localhost:3001](http://localhost:3001)
- Swagger: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- pgAdmin: [http://localhost:5050](http://localhost:5050)
- PostgreSQL: `localhost:5432`

Проверка состояния и логов:

```bash
docker compose ps
docker compose logs -f frontend backend dictionary-service
```

### Восстановление резервной копии PostgreSQL

Восстанавливайте custom-format dump в пустую базу `dictcards_db` до запуска
backend. Укажите путь к нужному архиву и проверьте его контрольную сумму:

```bash
backup_file="backups/dictcards_db_<timestamp>.dump"
(cd "$(dirname "$backup_file")" && shasum -a 256 -c "$(basename "$backup_file").sha256") &&
docker compose up -d --wait postgres &&
docker compose exec -T postgres pg_restore \
  --username=myuser --dbname=dictcards_db \
  --no-owner --no-privileges --exit-on-error < "$backup_file"
```

Здесь намеренно отсутствует `--create`: восстановление использует указанную
базу `dictcards_db`, а не исходное имя базы внутри архива. После успешного
восстановления можно запускать остальные сервисы.

## Локальный запуск без полного Compose-стека

### 1. Установите зависимости

```bash
npm --prefix frontend install
npm --prefix backend install
npm --prefix dictionary-service install
```

### 2. Запустите PostgreSQL

```bash
docker compose up -d postgres
```

Для процесса backend, запущенного на хосте, создайте `backend/.env` с адресом
базы через `localhost`:

```dotenv
DATABASE_URL=postgresql://myuser:mypassword@localhost:5432/dictcards_db
JWT_SECRET=dev-secret-change-me
FRONTEND_URL=http://localhost:3000
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
DICTIONARY_SERVICE_URL=http://localhost:4000
```

### 3. Примените миграции и запустите сервисы

```bash
(cd backend && npx prisma generate && npx prisma migrate deploy)
npm --prefix dictionary-service run start:dev
npm --prefix backend run start:dev
npm --prefix frontend run dev
```

Каждую команду `start:dev` запускайте в отдельном терминале.

## Основные frontend-маршруты

| Маршрут | Доступ | Назначение |
| --- | --- | --- |
| `/` | публичный | Гостевой экран или последние модули пользователя |
| `/register`, `/login` | публичный | Регистрация и вход |
| `/library` | защищённый | Библиотека модулей |
| `/search?q=...` | защищённый | Поиск по названию своих модулей |
| `/create` | защищённый | Создание модуля |
| `/module/[id]` | защищённый | Просмотр терминов и выбор режима |
| `/module/[id]/edit` | защищённый | Редактирование модуля и терминов |
| `/module/[id]/card` | защищённый | Переворот и оценка карточек |
| `/module/[id]/learn` | защищённый | Заучивание с выбором и вводом ответа |
| `/module/[id]/test` | защищённый | Настраиваемый тест и итоговая оценка |
| `/module/[id]/write` | защищённый | Письменное упражнение |
| `/module/[id]/spell` | защищённый | Ввод термина на слух |
| `/settings` | защищённый | Тема, источник словаря и вариант произношения |

### Учебные режимы

Все пять режимов работают с терминами выбранного модуля. `card` позволяет
переворачивать и оценивать карточки; `learn` сочетает выбор и письменный ответ;
`test` поддерживает несколько типов вопросов; `spell` тренирует написание на слух.
Прогресс хранится в `sessionStorage` текущей вкладки и не отправляется на сервер.

### Как работает режим `write`

1. Все термины модуля перемешиваются.
2. Пользователь видит определение и вводит термин.
3. Регистр и пробелы по краям игнорируются; орфография, пунктуация и внутренние
   пробелы должны совпасть.
4. «Не знаю» считается ошибкой. Ошибочную оценку можно вручную изменить через
   «Я ответил правильно».
5. После завершения этапа только неосвоенные термины переходят в новый
   перемешанный этап.
6. Упражнение заканчивается, когда все термины отвечены правильно.

Состояние хранится в `sessionStorage` под ключом
`dictcards:write:<moduleId>`. Оно сбрасывается при изменении состава модуля,
явном перезапуске или закрытии вкладки.

## API

Маршруты модулей, словарного поиска, TTS и загрузки файлов требуют Bearer JWT.
Регистрация, вход, OAuth, аудиопрокси, статические загрузки и корневой health
endpoint доступны без JWT.

### Авторизация

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /auth/yandex`
- `GET /auth/yandex/callback`

### Модули

- `GET /dictcards?skip=0&take=20&q=...` — `q` необязателен; поиск по названию
  без учёта регистра, только среди модулей текущего пользователя.
- `GET /dictcards/:id`
- `POST /dictcards`
- `PATCH /dictcards/:id`
- `DELETE /dictcards/:id`

### Словарь и файлы

- `GET /dictionary/lookup?word=run&source=cambridge`
- `GET /dictionary/audio/:id`
- `POST /upload` — JWT, одно multipart-поле `file`, файл до 10 МиБ;
  Nginx дополнительно ограничивает размер всего запроса.
- `POST /tts` — JWT, JSON `{ "text": "hello", "variant": "uk" }`, ответ MP3.

Интерактивная документация находится на `/api/docs`, OpenAPI JSON — на
`/api/docs-json`.

## Авторизация во frontend

Frontend хранит сессию одновременно в двух местах:

- `localStorage.token` и `localStorage.user` используются клиентскими запросами;
- cookie `token` используется Server Components.

Запись и удаление обоих представлений выполняют функции из `frontend/lib/auth.ts`.
JWT и cookie имеют срок жизни 60 минут.
Регистрация сразу возвращает JWT и создаёт сессию. На страницах входа и
регистрации страна определяет выбор Google/Яндекс; серверная переменная
frontend `SOCIAL_AUTH_ENABLED=false` скрывает обе кнопки.

## Тесты и сборка

```bash
# Все unit-тесты: backend → dictionary-service → frontend
npm test

# Frontend E2E в Chromium, Firefox и WebKit
npm run test:e2e

# Сборки отдельных сервисов
npm --prefix frontend run build
npm --prefix backend run build
npm --prefix dictionary-service run build
```

Frontend использует Vitest и Testing Library, backend и dictionary-service —
Jest, browser E2E — Playwright.

CI также проверяет историю Git через Gitleaks. Локальный pre-commit hook нужно
включить в каждом клоне: [проверка секретов](docs/security.md).

## Структура репозитория

```text
dictcards/
├── frontend/
│   ├── app/                    # Next.js App Router
│   ├── components/             # UI и layout-компоненты
│   ├── lib/                    # API, auth, темы и логика упражнений
│   ├── hooks/                  # Общий hook воспроизведения аудио
│   ├── e2e/                    # Playwright tests
│   └── types/
├── backend/
│   ├── src/auth/               # JWT, Google OAuth и Яндекс ID
│   ├── src/dictcards/          # CRUD модулей и терминов
│   ├── src/dictionary/         # Кеш и проксирование словаря
│   ├── src/tts/                # Google TTS и кеш MP3
│   ├── src/uploads/            # Загрузка изображений
│   └── prisma/                 # Схема и миграции
├── dictionary-service/
│   └── src/dictionary/         # Cambridge/Oxford providers
├── deploy/nginx/               # Production reverse proxy
├── scripts/                    # TLS bootstrap и deployment
├── docker-compose.yml
├── docker-compose.production.yml
├── docker-compose.vps.yml
└── docker-compose.tts.yml
```

## Production

В репозитории два варианта production-развёртывания:

| Конфигурация | Образы и адреса | Обновление |
| --- | --- | --- |
| `docker-compose.vps.yml` | Сборка на сервере; один домен или IP для frontend и API | `./scripts/deploy-vps.sh`, окружение `.env.vps` |
| `docker-compose.production.yml` | Готовые образы GHCR с тегом `sha-*`; настройки `FRONTEND_HOST` и `API_HOST` | `./scripts/deploy-production.sh .env.production` |

Текущий VPS описан в [инструкции развёртывания по IP или домену](docs/vps.md).
У Compose-проектов разные имена (`dictcards-vps` и `dictcards-production`),
поэтому по умолчанию они используют разные тома базы и загрузок. Простая замена
Compose-файла не переносит данные. `docker-compose.tts.yml` — дополнительный
overlay для ADC credentials, а не самостоятельный стек.

Следующие команды относятся к варианту GHCR. Он использует образы с `sha-*` тегами,
закрытую Docker-сеть, Nginx и Let’s Encrypt. Публично доступны только порты 80
и 443.

```bash
cp .env.production.example .env.production
./scripts/init-production-tls.sh .env.production
```

При переходе существующего production-развёртывания на `dictcards-production`
сначала перенесите данные PostgreSQL, загруженные файлы и TLS-хранилище в тома
нового проекта, подготовьте сертификат с именем `dictcards` и опубликуйте образы
`ghcr.io/manblax/dictcards-*` с выбранным `IMAGE_TAG`. Затем запускайте deployment.

Последующие обновления:

```bash
./scripts/deploy-production.sh .env.production
```

`NEXT_PUBLIC_API_URL` встраивается во frontend во время сборки образа и должен
совпадать с `https://$API_HOST`. Для CD задайте GitHub Actions repository
variables `API_HOST` и `NEXT_PUBLIC_API_URL`.

## Дополнительная документация

- [Секреты, Git ignore и pre-commit/CI-проверки](./docs/security.md)
- [Развёртывание VPS и обслуживание TLS](./docs/vps.md)
- [Google TTS: окружение, кеш и проверка](./docs/google-tts.md)
- [Google sign-in visibility by country](./docs/google-auth-country.md)
- [Яндекс ID: регистрация приложения, окружение и проверка](./docs/yandex-auth.md)
- [Быстрый старт frontend](./frontend/QUICK_START.md)
- [Компоненты frontend](./frontend/COMPONENTS.md)
- [Архитектура frontend](./frontend/PROJECT_OVERVIEW.md)
- [Backend](./backend/README.md)

### Google Text-to-Speech

Google TTS supplies missing pronunciation recordings and reads Learn/Test text.
See [Google TTS setup and deployment](docs/google-tts.md) for credentials,
Docker configuration, caching, and verification.
