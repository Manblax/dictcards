# dictcards Frontend: обзор архитектуры

Frontend находится в `frontend/` и построен на Next.js App Router. Он сочетает
Server Components для защищённой загрузки данных и Client Components для форм,
настроек, аудио и интерактивных упражнений.

## Технологии

- Next.js 16.0.10
- React 19.2.1
- TypeScript 5 в strict mode
- Tailwind CSS 4
- DaisyUI 5
- dnd-kit для сортировки терминов
- Vitest, Testing Library и jsdom для unit/component tests
- Playwright для browser E2E

## Маршруты

| Маршрут | Рендеринг | Назначение |
| --- | --- | --- |
| `/` | Server Component | Гостевой landing или шесть последних модулей |
| `/register` | Client Component | Регистрация по email, username и паролю |
| `/login` | Client Component | Парольный вход и запуск Google OAuth |
| `/auth/callback` | Client Component | Сохранение результата Google OAuth |
| `/library` | Server + Client | Первая страница модулей и бесконечная догрузка |
| `/create` | Server + Client | Защищённая форма создания модуля |
| `/module/[id]` | Server Component | Детали модуля, термины и выбор режима |
| `/module/[id]/edit` | Server + Client | Защищённое редактирование модуля |
| `/module/[id]/write` | Server + Client | Письменное упражнение |
| `/settings` | Client Component | Аккаунт, тема, словарь и произношение |

Защищённые Server Components читают cookie `token`. Если токена нет, они
перенаправляют на `/login?redirect=<route>`. После входа redirect проходит через
`resolveSafeRedirect`, чтобы исключить внешние URL.

## Получение данных

`lib/api.ts` — единственная точка frontend-доступа к backend API.

```text
Server Component
  └─ getServerAuthToken()
       └─ getModule(id, { token })
            └─ INTERNAL_API_URL

Client Component
  └─ getModule/createModule/lookupDictionary(...)
       └─ localStorage.token
            └─ NEXT_PUBLIC_API_URL
```

- На сервере базовый URL берётся из `INTERNAL_API_URL`.
- В браузере используется `NEXT_PUBLIC_API_URL`.
- Если server-side URL не задан, он наследует публичный URL.
- `NEXT_PUBLIC_API_URL` в Docker-образе фиксируется во время сборки.
- `getModules` и `getModule` возвращают пустой результат при отсутствии или
  отклонении auth-сессии, чтобы страницы могли показать empty state.

## Авторизация

Backend выдаёт JWT на 60 минут. Frontend хранит одну сессию в двух
представлениях:

| Хранилище | Потребитель |
| --- | --- |
| `localStorage.token` | Клиентские API-вызовы |
| `localStorage.user` | User menu и страница настроек |
| cookie `token` | Server Components |

`persistAuthSession` и `clearAuthSession` из `lib/auth.ts` всегда обновляют оба
представления токена. `AuthSessionSync` сверяет localStorage и cookie, а затем
вызывает `router.refresh()`, чтобы серверное дерево увидело актуальную сессию.

Cookie намеренно не является httpOnly, потому что её синхронизирует браузерный
код. Это архитектурное ограничение текущей версии.

## Модули и словарь

### Просмотр и библиотека

- Главная страница загружает до шести недавних модулей.
- `/library` получает первые 20 модулей на сервере.
- `InfiniteModuleList` догружает следующие страницы при пересечении sentinel.
- Модули группируются по текущей неделе, прошлой неделе и месяцам.

### Создание и редактирование

`ModuleForm` работает в режимах `create` и `edit`:

- управляет названием, описанием и массивом терминов;
- поддерживает drag-and-drop и keyboard sorting;
- позволяет импортировать несколько карточек из текста;
- загружает изображения через `/upload`;
- запрашивает определения через `/dictionary/lookup`;
- отправляет весь модуль через `POST /dictcards` или `PATCH /dictcards/:id`.

Backend при обновлении пересоздаёт термины, поэтому frontend не должен считать
ID термина постоянным после сохранения.

### Словарные данные

Пользователь выбирает Cambridge или Oxford в `/settings`. Предпочтение хранится
в localStorage и добавляется к lookup-вызову. Backend возвращает определения,
примеры, IPA и UK/US audio URL. `PronunciationButton` лениво загружает эти данные
при первом воспроизведении.

## Режим `write`

Страница `/module/[id]/write` загружает модуль на сервере и передаёт в
`WriteExercise` только ID, название и термины. Backend для самого упражнения не
вызывается: попытка является локальной сессией.

### Состояния упражнения

```text
Новый этап
  └─ Вопрос
       └─ Проверка ответа
            ├─ Правильно ───────────────┐
            ├─ Не знаю / ошибка ────────┤
            └─ Ручная переоценка ───────┤
                                        ↓
                              Следующий вопрос
                                        ↓
                              Конец текущего этапа
                                ├─ есть ошибки → новый этап
                                └─ ошибок нет → итоговая сводка
```

Первый этап содержит все термины в случайном порядке. Следующий этап получает
только ошибки предыдущего этапа и снова перемешивает их. Ответ считается
правильным после `trim().toLowerCase()`; внутренние пробелы и пунктуация не
нормализуются.

`lib/write-exercise.ts` содержит чистый reducer-подобный state machine и
валидацию сохранённых данных. `WriteExercise` отвечает за рендеринг и эффекты.

### Восстановление

Состояние хранится в `sessionStorage`:

```text
dictcards:write:<moduleId>
```

Payload содержит номер версии, fingerprint терминов, активную очередь,
результаты текущего этапа, feedback и историю завершённых этапов. Сессия
отбрасывается, если JSON повреждён, версия неизвестна, нарушены state-инварианты
или модуль был изменён.

## Темы и стили

Темы объявлены в `app/globals.css` и применяются через `data-theme` на `<html>`:

- `dark-classic` — default;
- `light-classic`;
- `light`;
- `dark`.

Помимо DaisyUI tokens используются CSS-переменные `--app-*` для панелей,
границ, текста, полей, dropdown и focus-состояний. Компонентам следует
использовать эти токены вместо raw цветов, чтобы одна разметка корректно
работала во всех темах.

## Клиентское хранение

| Ключ | Storage | Назначение |
| --- | --- | --- |
| `token` | localStorage + cookie | JWT |
| `user` | localStorage | Профиль пользователя |
| `preferred-theme` | localStorage | Активная тема |
| `preferred-dictionary-source` | localStorage | Cambridge или Oxford |
| `preferred-pronunciation-variant` | localStorage | UK или US |
| `dictcards:write:<moduleId>` | sessionStorage | Состояние write-сессии |

Имена ключей тем и словаря также экспортируются из соответствующих файлов
`lib/`; при изменении следует обновить эту таблицу.

## Структура

```text
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── login/ register/ auth/callback/
│   ├── library/ create/ settings/
│   └── module/[id]/
│       ├── page.tsx
│       ├── edit/page.tsx
│       └── write/page.tsx
├── components/
│   ├── layout/
│   ├── ModuleForm.tsx
│   ├── ModuleStudyModes.tsx
│   ├── PronunciationButton.tsx
│   └── WriteExercise.tsx
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   ├── server-auth.ts
│   ├── theme.ts
│   ├── dictionary-settings.ts
│   └── write-exercise.ts
├── types/module.ts
├── test/setup.ts
└── e2e/
```

`lib/mockData.ts` сохранён только для собственных unit tests и не участвует в
работе приложения.

## Тестирование

```bash
# Unit и component tests
npm --prefix frontend test

# Watch mode
npm --prefix frontend run test:watch

# Browser E2E
npm --prefix frontend run test:e2e

# TypeScript и production compilation
npm --prefix frontend run build
```

Vitest-файлы находятся рядом с кодом. `test/setup.ts` очищает storage, cookie и
тему после каждого теста. Playwright запускает development server и выполняет
тесты в Chromium, Firefox и WebKit.

## Известные границы

- «Карточки», «Заучивание» и «Тест» пока не реализованы.
- Поиск в header пока не выполняет запросы.
- Учебная история `write` не отправляется на backend и не синхронизируется между
  устройствами или вкладками.
- Auth cookie и JWT могут устареть независимо; при проблемах с пустыми данными
  сначала проверяйте согласованность cookie и localStorage.
