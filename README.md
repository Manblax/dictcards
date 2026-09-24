# FlashCards2

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
- Главная страница с недавними модулями и библиотека с постраничной загрузкой.
- Подсказки из Cambridge или Oxford при редактировании терминов.
- UK/US-произношение через проксируемые словарные аудиофайлы.
- Четыре цветовые темы: `dark-classic`, `light-classic`, `light` и `dark`.
- Режим `write`: ввод термина по определению, проверка ответа, повтор ошибок по
  этапам, ручная переоценка и итоговая сводка.
- Восстановление незавершённого `write`-упражнения после обновления страницы в
  пределах текущей вкладки.
- Адаптивный интерфейс для мобильных и десктопных экранов.

Кнопки «Карточки», «Заучивание» и «Тест» пока не имеют учебной логики. Полностью
реализованный учебный режим на данный момент — `write`.

## Архитектура

Репозиторий содержит три самостоятельных npm-проекта. npm workspaces не
используются.

| Сервис | Технологии | Порт | Назначение |
| --- | --- | --- | --- |
| `frontend/` | Next.js 16, React 19, Tailwind CSS 4, DaisyUI 5 | 3000 | UI, маршруты и клиентское состояние |
| `backend/` | NestJS 11, Prisma 6, JWT/Passport | 3001 | Авторизация, CRUD модулей, словарный кеш и загрузки |
| `dictionary-service/` | NestJS 11, Cheerio | 4000, только внутренняя сеть | Получение и нормализация данных Cambridge/Oxford |
| PostgreSQL | PostgreSQL 15 | 5432 | Пользователи, модули, термины и словарный кеш |

Основной поток данных:

```text
Browser
  └─ Next.js frontend
       └─ NestJS backend
            ├─ PostgreSQL
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
DATABASE_URL=postgresql://myuser:mypassword@postgres:5432/flashcards_db
JWT_SECRET=dev-secret-change-me
FRONTEND_URL=http://localhost:3000
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
DICTIONARY_SERVICE_URL=http://dictionary-service:4000
```

Google OAuth необязателен для обычной регистрации. Для него дополнительно
укажите `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET`.

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
DATABASE_URL=postgresql://myuser:mypassword@localhost:5432/flashcards_db
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
| `/create` | защищённый | Создание модуля |
| `/module/[id]` | защищённый | Просмотр терминов и выбор режима |
| `/module/[id]/edit` | защищённый | Редактирование модуля и терминов |
| `/module/[id]/write` | защищённый | Письменное упражнение |
| `/settings` | защищённый | Тема, источник словаря и вариант произношения |

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
`flashcards2:write:<moduleId>`. Оно сбрасывается при изменении состава модуля,
явном перезапуске или закрытии вкладки.

## API

Все маршруты модулей и словарного поиска требуют Bearer JWT, кроме регистрации,
входа, OAuth callback, аудиопрокси и корневого health endpoint.

### Авторизация

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /auth/yandex`
- `GET /auth/yandex/callback`

### Модули

- `GET /flashcards?skip=0&take=20`
- `GET /flashcards/:id`
- `POST /flashcards`
- `PATCH /flashcards/:id`
- `DELETE /flashcards/:id`

### Словарь и файлы

- `GET /dictionary/lookup?word=run&source=cambridge`
- `GET /dictionary/audio/:id`
- `POST /upload`

Интерактивная документация находится на `/api/docs`, OpenAPI JSON — на
`/api/docs-json`.

## Авторизация во frontend

Frontend хранит сессию одновременно в двух местах:

- `localStorage.token` и `localStorage.user` используются клиентскими запросами;
- cookie `token` используется Server Components.

Запись и удаление обоих представлений выполняют функции из `frontend/lib/auth.ts`.
JWT и cookie имеют срок жизни 60 минут.

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

## Структура репозитория

```text
flashcards2/
├── frontend/
│   ├── app/                    # Next.js App Router
│   ├── components/             # UI и layout-компоненты
│   ├── lib/                    # API, auth, темы и логика write
│   ├── e2e/                    # Playwright tests
│   └── types/
├── backend/
│   ├── src/auth/               # JWT, Google OAuth и Яндекс ID
│   ├── src/flashcards/         # CRUD модулей и терминов
│   ├── src/dictionary/         # Кеш и проксирование словаря
│   ├── src/uploads/            # Загрузка изображений
│   └── prisma/                 # Схема и миграции
├── dictionary-service/
│   └── src/dictionary/         # Cambridge/Oxford providers
├── deploy/nginx/               # Production reverse proxy
├── scripts/                    # TLS bootstrap и deployment
├── docker-compose.yml
└── docker-compose.production.yml
```

## Production

Production Compose использует образы GHCR с неизменяемыми `sha-*` тегами,
закрытую Docker-сеть, Nginx и Let’s Encrypt. Публично доступны только порты 80
и 443.

```bash
cp .env.production.example .env.production
./scripts/init-production-tls.sh .env.production
```

Последующие обновления:

```bash
./scripts/deploy-production.sh .env.production
```

`NEXT_PUBLIC_API_URL` встраивается во frontend во время сборки образа и должен
совпадать с `https://$API_HOST`. Для CD задайте GitHub Actions repository
variables `API_HOST` и `NEXT_PUBLIC_API_URL`.

## Дополнительная документация

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
