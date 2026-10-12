# Быстрый старт frontend

Frontend не использует mock data в runtime: для регистрации, входа, модулей и
словаря ему нужен работающий backend. Команды ниже выполняются из корня
репозитория, если не указано иное.

## Вариант 1: весь стек через Docker

Создайте `backend/.env`:

```dotenv
DATABASE_URL=postgresql://myuser:mypassword@postgres:5432/dictcards_db
JWT_SECRET=dev-secret-change-me
FRONTEND_URL=http://localhost:3000
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
DICTIONARY_SERVICE_URL=http://dictionary-service:4000
```

Затем запустите Compose:

```bash
docker compose up -d
```

Frontend будет доступен на [http://localhost:3000](http://localhost:3000).
Compose также запускает PostgreSQL, backend, dictionary-service и pgAdmin.

## Вариант 2: frontend на хосте

Убедитесь, что backend доступен на `http://localhost:3001`.

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Если API работает по другому адресу, создайте `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001
INTERNAL_API_URL=http://localhost:3001
```

- `NEXT_PUBLIC_API_URL` используется браузером.
- `INTERNAL_API_URL` используется Next.js Server Components.

После изменения `NEXT_PUBLIC_API_URL` перезапустите dev server. В production
это значение встраивается во время сборки.

## Первый сценарий использования

1. Откройте `/register` и создайте пользователя.
2. Перейдите в `/create`.
3. Укажите название модуля и добавьте термины с определениями.
4. При необходимости используйте словарные подсказки или импорт из текста.
5. Сохраните модуль и откройте его страницу.
6. Нажмите `write`, чтобы начать письменное упражнение.

В `write` показывается определение, а вводить нужно термин. Ошибки повторяются
в новых этапах, пока все термины не будут отвечены правильно. Обновление
страницы восстанавливает попытку в текущей вкладке.

## Маршруты

| Маршрут | Назначение |
| --- | --- |
| `/` | Гостевой экран или недавние модули |
| `/register` | Регистрация |
| `/login` | Вход и Google OAuth |
| `/library` | Все модули пользователя |
| `/create` | Создание модуля |
| `/module/[id]` | Просмотр модуля |
| `/module/[id]/edit` | Редактирование |
| `/module/[id]/write` | Письменное упражнение |
| `/settings` | Тема, словарь и произношение |

Защищённые страницы перенаправляют неавторизованного пользователя на `/login`
и возвращают обратно после успешного входа.

## Команды

```bash
# Development server
npm --prefix frontend run dev

# Unit и component tests
npm --prefix frontend test

# Tests в watch mode
npm --prefix frontend run test:watch

# Playwright E2E
npm --prefix frontend run test:e2e

# Production build
npm --prefix frontend run build

# Запуск уже собранного приложения
npm --prefix frontend run start
```

Скрипт `npm run lint` сейчас ссылается на устаревшую команду `next lint` и не
должен считаться рабочей проверкой для Next.js 16. TypeScript-проверка входит в
`npm run build`.

## Настройки

Страница `/settings` хранит настройки в браузере:

- `preferred-theme` — одна из четырёх тем;
- `preferred-dictionary-source` — `cambridge` или `oxford`;
- `preferred-pronunciation-variant` — `uk` или `us`.

Изменение источника словаря влияет на последующие подсказки и поиск
произношения.

## Проверка режима `write`

Минимальная ручная проверка:

1. Создайте модуль минимум с двумя терминами.
2. Откройте `write` и убедитесь, что поле ответа получает focus.
3. Введите правильный ответ с другим регистром и пробелами по краям — он должен
   быть принят.
4. Нажмите «Не знаю» для другого термина — он должен перейти в следующий этап.
5. Обновите страницу до завершения — текущий экран должен восстановиться.
6. Ответьте на повторный термин и проверьте сводку по этапам.
7. Нажмите «Пройти заново» — должна начаться новая перемешанная попытка.

## Частые проблемы

### После входа список модулей пуст

Проверьте одновременно `localStorage.token` и cookie `token`. Client Components
используют первое хранилище, Server Components — второе. `AuthSessionSync`
обычно синхронизирует их автоматически.

### Server Components не видят backend

При запуске Next.js на хосте используйте `INTERNAL_API_URL=http://localhost:3001`.
В Docker правильный адрес — `http://backend:3001`.

### Словарные подсказки не загружаются

Проверьте backend и dictionary-service. Для ручного запуска backend должен
получить `DICTIONARY_SERVICE_URL=http://localhost:4000`; в Compose используется
`http://dictionary-service:4000`.

### После редактирования сбросилось упражнение

Это ожидаемо. `write` привязывает session state к ID и содержимому терминов.
После изменения модуля сохранённая попытка считается устаревшей и удаляется.

## Дополнительная документация

- [Общий README](../README.md)
- [Архитектура frontend](./PROJECT_OVERVIEW.md)
- [Компоненты frontend](./COMPONENTS.md)
