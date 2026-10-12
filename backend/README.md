# dictcards Backend

NestJS API для авторизации, пользовательских модулей, загрузки изображений и
доступа к словарным данным. Backend — единственный сервис проекта, который
работает с PostgreSQL.

## Стек

- NestJS 11
- Prisma 6
- PostgreSQL 15
- Passport JWT и `@nestjs/jwt`
- Swagger/OpenAPI
- Multer и `@nestjs/serve-static`
- Jest

По умолчанию сервер доступен на `http://localhost:3001`. Swagger UI находится
на `/api/docs`, OpenAPI JSON — на `/api/docs-json`.

## Модули

| Каталог | Назначение |
| --- | --- |
| `src/auth/` | Регистрация, парольный вход, Google OAuth, выпуск и проверка JWT |
| `src/dictcards/` | CRUD модулей и вложенных терминов с проверкой владельца |
| `src/dictionary/` | Кеш словарных ответов, вызов dictionary-service и аудиопрокси |
| `src/uploads/` | Загрузка файлов и выдача URL из `/uploads` |
| `src/prisma/` | Общий Prisma client и lifecycle подключения |
| `prisma/` | Схема базы данных и миграции |

## Модель данных

- `User`: уникальные `email` и `username`, bcrypt-хеш пароля.
- `Module`: название, описание, автор, владелец и количество терминов.
- `Term`: термин, определение, изображение, избранное и позиция в модуле.
- `DictionaryEntry`: кеш нормализованного словарного ответа по паре
  `(normalizedWord, dictionarySource)`.
- `DictionaryAudio`: стабильный ID и upstream URL аудиофайла.

Удаление пользователя каскадно удаляет его модули, а удаление модуля — термины.
При обновлении модуля список терминов пересоздаётся транзакционно; ID терминов
после сохранения могут измениться.

## Авторизация и доступ к модулям

`POST /auth/register` и `POST /auth/login` возвращают JWT со сроком жизни 60
минут. Защищённые маршруты используют `AuthGuard('jwt')` и ожидают заголовок:

```http
Authorization: Bearer <token>
```

Google OAuth реализован напрямую через OAuth endpoints Google:

1. `GET /auth/google` перенаправляет пользователя на Google.
2. `GET /auth/google/callback` обменивает `code` на профиль.
3. Backend перенаправляет на frontend `/auth/callback` с токеном и профилем в
   query string.

Доступ к модулю разрешён, если `Module.userId` совпадает с ID пользователя. Для
старых записей также поддерживается ветка `userId IS NULL AND author = username`.
Чужой или отсутствующий модуль возвращает 404, а не 403.

## API

### Состояние

- `GET /` — простой ответ для healthcheck backend.

### Авторизация

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/google`
- `GET /auth/google/callback`

### Модули — Bearer JWT обязателен

- `POST /dictcards`
- `GET /dictcards?skip=0&take=20`
- `GET /dictcards/:id`
- `PATCH /dictcards/:id`
- `DELETE /dictcards/:id`

### Словарь

- `GET /dictionary/lookup?word=<word>&source=cambridge|oxford` — требует JWT.
- `GET /dictionary/audio/:id` — публичный аудиопрокси; `<audio>` не может
  отправить Bearer-заголовок.

Словарный lookup сначала проверяет PostgreSQL-кеш, затем вызывает внутренний
`dictionary-service`. Срок кеша задаёт `DICTIONARY_CACHE_TTL_DAYS`.

### Загрузки

- `POST /upload` — multipart form-data, поле `file`.
- `/uploads/*` — статическая раздача загруженных файлов.

Текущий upload endpoint не защищён JWT и не ограничивает MIME-тип или размер
файла. Это известное ограничение, которое необходимо учитывать при публичном
развёртывании.

## Переменные окружения

| Переменная | Назначение | Значение по умолчанию |
| --- | --- | --- |
| `PORT` | Порт backend | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | обязательно |
| `JWT_SECRET` | Подпись JWT | небезопасный dev fallback |
| `FRONTEND_URL` | CORS origin и OAuth redirect target | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Google OAuth client | нужен только для Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | нужен только для Google OAuth |
| `GOOGLE_CALLBACK_URL` | Google callback URL | `http://localhost:3001/auth/google/callback` |
| `DICTIONARY_SERVICE_URL` | Адрес внутреннего dictionary-service | `http://localhost:4000` вне Compose |
| `DICTIONARY_CACHE_TTL_DAYS` | Срок словарного кеша | `30` |
| `DICTIONARY_BACKEND_TIMEOUT_MS` | Таймаут backend → dictionary-service | `9000` |

Для Docker development создайте `backend/.env`:

```dotenv
DATABASE_URL=postgresql://myuser:mypassword@postgres:5432/dictcards_db
JWT_SECRET=dev-secret-change-me
FRONTEND_URL=http://localhost:3000
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
DICTIONARY_SERVICE_URL=http://dictionary-service:4000
```

## Установка и запуск

Из корня репозитория:

```bash
npm --prefix backend install
(cd backend && npx prisma generate && npx prisma migrate deploy)
npm --prefix backend run start:dev
```

При запуске backend на хосте используйте PostgreSQL и dictionary-service через
`localhost`. В Docker Compose используются имена сервисов `postgres` и
`dictionary-service`.

## Prisma

```bash
cd backend

# Обновить Prisma Client после изменения schema.prisma
npx prisma generate

# Создать development migration
npx prisma migrate dev --name <migration-name>

# Применить готовые migrations
npx prisma migrate deploy
```

Изменение `schema.prisma` всегда требует повторного `prisma generate`.

## Проверки

```bash
npm --prefix backend run build
npm --prefix backend test -- --runInBand
npm --prefix backend run test:e2e
npm --prefix backend run test:cov
```

`npm run lint` запускает ESLint с `--fix` и может изменить файлы.

## Связанные сервисы

- Общий запуск и production: [корневой README](../README.md)
- Frontend: [frontend/PROJECT_OVERVIEW.md](../frontend/PROJECT_OVERVIEW.md)
- Внутренний dictionary-service: `../dictionary-service/`

## Google Text-to-Speech

`POST /tts` accepts `{ "text": "hello", "variant": "uk" }` (or `"us"`),
requires a bearer JWT, and returns MP3 bytes. Google credentials stay in the
backend. See [setup, deployment, limits, and cache details](../docs/google-tts.md).
