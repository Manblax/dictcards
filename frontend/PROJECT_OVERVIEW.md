# dictcards Frontend: обзор архитектуры

Frontend находится в `frontend/` и построен на Next.js App Router. Он сочетает
Server Components для защищённой загрузки данных и Client Components для форм,
настроек, аудио и интерактивных упражнений.

## Технологии

- Next.js 16
- React 19
- TypeScript 5 в strict mode
- Tailwind CSS 4
- DaisyUI 5
- dnd-kit для сортировки терминов
- Vitest, Testing Library и jsdom для unit/component tests
- Playwright для browser E2E

Точные версии зависимостей зафиксированы в `package-lock.json`.

## Маршруты

| Маршрут | Рендеринг | Назначение |
| --- | --- | --- |
| `/` | Server Component | Гостевой landing или шесть последних модулей |
| `/register` | Server + Client | Регистрация и выбор OAuth-провайдера по стране |
| `/login` | Server + Client | Парольный вход, Google OAuth и Яндекс ID |
| `/auth/callback` | Client Component | Сохранение результата Google/Яндекс OAuth |
| `/library` | Server + Client | Первая страница модулей и бесконечная догрузка |
| `/search?q=...` | Server + Client | Поиск своих модулей по названию с догрузкой |
| `/create` | Server + Client | Защищённая форма создания модуля |
| `/module/[id]` | Server Component | Детали модуля, термины и выбор режима |
| `/module/[id]/edit` | Server + Client | Защищённое редактирование модуля |
| `/module/[id]/card` | Server + Client | Карточки с переворотом и оценкой |
| `/module/[id]/learn` | Server + Client | Заучивание |
| `/module/[id]/test` | Server + Client | Настраиваемый тест |
| `/module/[id]/write` | Server + Client | Письменное упражнение |
| `/module/[id]/spell` | Server + Client | Написание термина на слух |
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

Регистрация сразу возвращает JWT и профиль, после чего форма сохраняет сессию.
Серверные страницы `/login` и `/register` выбирают Google или Яндекс по стране.
`SOCIAL_AUTH_ENABLED=false` в окружении Next.js скрывает обе кнопки; это не
отключает маршруты OAuth на backend. Подробнее: [видимость кнопок](../docs/google-auth-country.md).

## Модули и словарь

### Просмотр и библиотека

- Главная страница загружает до шести недавних модулей.
- `/library` получает первые 20 модулей на сервере.
- `InfiniteModuleList` догружает следующие страницы при пересечении sentinel.
- Модули группируются по текущей неделе, прошлой неделе и месяцам.
- Поиск из header открывает `/search?q=...`. Backend ищет подстроку в названии
  без учёта регистра и сохраняет ограничение по владельцу.
- Результаты поиска используют `InfiniteModuleList` с `query`; догрузка сохраняет
  запрос, а группировка по датам отключена.

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
примеры, IPA и UK/US audio URL. В списке терминов модуля `PronunciationButton`
загружает IPA при приближении строки к области просмотра и показывает его рядом
с кнопками UK/US. В редакторе и учебных режимах транскрипция не отображается.
Данные для аудио загружаются при первом воспроизведении.

`lib/pronunciation-cache.ts` хранит общий кэш текущей вкладки: lookup по
нормализованному слову и словарю, аудио по URL записи либо тексту TTS и акценту.
Транскрипция и воспроизведение используют один lookup; одновременные запросы
разделяют один Promise. Загруженное аудио воспроизводится через Blob URL и
сохраняется при переходах между словами, модулями и режимами. При выходе или
смене аккаунта воспроизведение останавливается, кэш очищается, Blob URL
освобождаются; поздние ответы старых запросов отбрасываются. Ошибки загрузки
не кэшируются. Обновление или закрытие вкладки завершает срок жизни кэша.
Автоматического вытеснения записей нет: память растёт с объёмом прослушанного
аудио. Кэш не хранится на сервере, в localStorage или между посещениями.

`hooks/usePronunciation.ts` и `lib/pronunciation.ts` управляют воспроизведением
во всём приложении. Card/Spell пробуют выбранный акцент словаря, другой акцент,
затем Google TTS. Кнопки UK/US сохраняют выбранный акцент и при отсутствии записи
используют TTS. Learn/Test озвучивают текст напрямую через TTS. Браузерного
`speechSynthesis` fallback нет. Подробнее: [Google TTS](../docs/google-tts.md).

## Учебные режимы

Все пять маршрутов загружают модуль на сервере и передают данные клиентскому
компоненту упражнения. Логика каждого режима находится в `lib/<mode>-exercise.ts`.

| Режим | Компонент | Поведение |
| --- | --- | --- |
| `card` | `CardExercise` | Переворот, оценка знания и отмена последней оценки |
| `learn` | `LearnExercise` | Этапы по 7 терминов, выбор и письменные ответы |
| `test` | `TestExercise` | Настройка типов вопросов и итоговая оценка |
| `write` | `WriteExercise` | Ввод термина по определению с повторением ошибок |
| `spell` | `SpellExercise` | Ввод на слух, разбор ошибок и повторное написание |

Состояние каждого режима хранится в `sessionStorage` под ключом
`dictcards:<mode>:<moduleId>`. Версия и fingerprint терминов позволяют отвергать
устаревшие сессии. Учебный прогресс не записывается в backend.

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
| `dictcards:<mode>:<moduleId>` | sessionStorage | Состояние card/learn/test/write/spell |

Имена ключей тем и словаря также экспортируются из соответствующих файлов
`lib/`; при изменении следует обновить эту таблицу.

## Структура

```text
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── login/ register/ auth/callback/
│   ├── library/ search/ create/ settings/
│   └── module/[id]/
│       ├── page.tsx
│       ├── edit/page.tsx
│       └── card/ learn/ test/ write/ spell/   # page.tsx в каждом режиме
├── components/
│   ├── layout/
│   ├── ModuleForm.tsx
│   ├── ModuleStudyModes.tsx
│   ├── PronunciationButton.tsx
│   ├── MobileTextField.tsx
│   └── *Exercise.tsx
├── hooks/usePronunciation.ts
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   ├── server-auth.ts
│   ├── theme.ts
│   ├── dictionary-settings.ts
│   ├── pronunciation.ts
│   └── *-exercise.ts
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

- Учебная история всех режимов не отправляется на backend и не синхронизируется между
  устройствами или вкладками.
- Auth cookie и JWT могут устареть независимо; при проблемах с пустыми данными
  сначала проверяйте согласованность cookie и localStorage.
