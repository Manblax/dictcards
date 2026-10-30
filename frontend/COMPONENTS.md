# Компоненты frontend

Документ описывает активные компоненты в `frontend/components/` и связанные с
ними клиентские утилиты. Пользовательские строки интерфейса используются на
русском языке; названия режимов — `card`, `learn`, `test`, `write`, `spell`.

## Layout

### `MainLayout`

Файл: `components/layout/MainLayout.tsx`

- Для гостя показывает только `Header` и содержимое страницы.
- Для авторизованного пользователя создаёт DaisyUI drawer с `Sidebar`.
- Получает `isAuthenticated` из корневого Server Component layout.
- На учебных маршрутах применяет `study-shell`: ниже 1280px глобальная навигация
  скрыта. Редактор использует `editor-shell` со своей мобильной панелью.

```ts
interface MainLayoutProps {
  children: React.ReactNode;
  isAuthenticated: boolean;
}
```

### `Header`

Файл: `components/layout/Header.tsx`

- Показывает мобильный переключатель drawer.
- Для гостя выводит ссылки на регистрацию и вход.
- Для авторизованного пользователя отображает создание модуля и `UserMenu`.
- Использует адаптивные варианты для узких и широких экранов.
- Отправляет поисковый запрос на `/search?q=...`; поиск ограничен своими модулями.

### `BrandLogo`

Файл: `components/BrandLogo.tsx`

Общий логотип на главной странице и в навигации; использует `/dictcards.svg`.

### `Sidebar`

Файл: `components/layout/Sidebar.tsx`

- Содержит основную навигацию авторизованного приложения.
- Подсвечивает активный маршрут через `usePathname`.
- Закрывает мобильный drawer после выбора ссылки.

### `UserMenu`

Файл: `components/layout/UserMenu.tsx`

- Читает текущего пользователя из auth storage.
- Содержит переход в настройки и выход.
- При выходе очищает localStorage и cookie через общий auth helper.

## Синхронизация приложения

### `AuthSessionSync`

Файл: `components/AuthSessionSync.tsx`

Синхронизирует клиентский токен из `localStorage` с cookie, которую читают
Server Components. Если представления расходятся, вызывает `router.refresh()`.

### `ThemeSync`

Файл: `components/ThemeSync.tsx`

Применяет сохранённую DaisyUI-тему к `data-theme` корневого элемента. Доступны:

- `dark-classic` — тема по умолчанию;
- `light-classic`;
- `light`;
- `dark`.

## Модули и термины

### `ModuleCard`

Файл: `components/ModuleCard.tsx`

Карточка модуля для главной страницы и библиотеки. Показывает название,
количество терминов, автора и ведёт на `/module/[id]`. Компонент также отвечает
за корректное русское склонение слова «термин».

### `InfiniteModuleList`

Файл: `components/InfiniteModuleList.tsx`

```ts
interface InfiniteModuleListProps {
  initialModules: Module[];
  query?: string;
}
```

- Получает первую страницу из Server Component.
- Догружает по 20 модулей через `getModules`.
- Использует `IntersectionObserver` как триггер.
- В библиотеке группирует элементы по периодам; при переданном `query` выводит
  результаты поиска без группировки и сохраняет запрос при догрузке.

### `ModuleForm`

Файл: `components/ModuleForm.tsx`

Общая форма создания и редактирования модулей.

```ts
interface ModuleFormProps {
  initialData?: Module;
  mode: "create" | "edit";
}
```

Основные возможности:

- название и необязательное описание;
- добавление, удаление и сортировка терминов через dnd-kit;
- импорт нескольких терминов из текста с настраиваемыми разделителями;
- загрузка изображений;
- словарные подсказки с debounce;
- выбор определения из Cambridge/Oxford;
- отправка через `createModule` или `updateModule`.

### `MobileTextField`

Файл: `components/MobileTextField.tsx`

Поля названия, термина и определения в редакторе. Ниже 640px использует
растущий `textarea` высотой до 192px, на больших экранах — `input`.
Переносы удаляются из значения, поэтому данные остаются однострочными.

### `DeleteModuleButton`

Файл: `components/DeleteModuleButton.tsx`

Показывает подтверждение, вызывает `deleteModule` и после успеха возвращает
пользователя в библиотеку.

### `PronunciationButton`

Файл: `components/PronunciationButton.tsx`

```ts
interface PronunciationButtonProps {
  term: string;
  className?: string;
}
```

- Загружает словарные данные только при первом нажатии.
- Отдельно воспроизводит UK и US варианты.
- Использует `usePronunciation` в режиме `exact`: при отсутствии нужного
  словарного акцента обращается к Google TTS, сохраняя UK/US.
- Показывает состояния загрузки и отсутствующего аудио.

### `ModuleStudyModes`

Файл: `components/ModuleStudyModes.tsx`

Рендерит рабочие ссылки `card`, `learn`, `test`, `write`, `spell` на
`/module/[id]/<mode>` в этом порядке.

## Учебные компоненты и аудио

`CardExercise`, `LearnExercise`, `TestExercise`, `WriteExercise` и `SpellExercise`
принимают `moduleId`, `moduleTitle`, `terms`. Каждый использует чистые функции
из `lib/<mode>-exercise.ts` и хранит свою версионированную сессию в
`sessionStorage`. Обзор поведения: [архитектура frontend](PROJECT_OVERVIEW.md#учебные-режимы).

Общий `hooks/usePronunciation.ts` связывает UI с `PronunciationSession` из
`lib/pronunciation.ts`. Одновременно играет только один фрагмент; новый запуск
останавливает предыдущий. Card/Spell используют словарное аудио с TTS fallback,
Learn/Test — TTS. Blob URL освобождаются при завершении жизненного цикла сессии.

## Режим `write`

### `WriteExercise`

Файл: `components/WriteExercise.tsx`

```ts
interface WriteExerciseProps {
  moduleId: string;
  moduleTitle: string;
  terms: Term[];
}
```

Клиентский контейнер письменного упражнения:

- восстанавливает состояние из `sessionStorage`;
- показывает определение и принимает термин;
- поддерживает Enter, «Ответить» и «Не знаю»;
- показывает корректный ответ и ручную кнопку «Я ответил правильно»;
- повторяет ошибки в новых перемешанных этапах;
- отображает прогресс активного этапа;
- формирует итоговую сводку по всем этапам;
- предлагает перезапуск и возвращение к модулю;
- показывает отдельное empty state для модуля без терминов.

На desktop экран делится на панель прогресса и рабочую область. На мобильном
панель прогресса становится горизонтальным блоком над упражнением.

### Логика `write`

Файл: `lib/write-exercise.ts`

UI использует чистые функции состояния:

- `createInitialWriteState` — создать и перемешать первый этап;
- `submitWriteAnswer` — оценить ответ;
- `overrideWriteAnswer` — изменить последнюю оценку вручную;
- `continueWriteExercise` — перейти к следующему вопросу, этапу или сводке;
- `saveWriteSession` / `loadWriteSession` — сохранить и проверить сессию;
- `clearWriteSession` — удалить состояние при перезапуске.

Сохранённые данные имеют версию и fingerprint текущих `id`, `term` и
`definition`. Повреждённая, устаревшая или относящаяся к изменённому модулю
сессия удаляется автоматически.

## Авторизация

### `AuthInput`

Файл: `components/AuthInput.tsx`

Общее поле страниц регистрации и входа: label, ошибка, доступный `aria-describedby`
и визуальные состояния темы.

Страницы `/login`, `/register` и `/auth/callback` напрямую используют функции
из `lib/auth.ts` для записи согласованной auth-сессии.

## Основные типы

Файл: `types/module.ts`

```ts
interface Term {
  id: string;
  term: string;
  definition: string;
  image?: string;
  isFavorite?: boolean;
}

interface Module {
  id: string;
  title: string;
  description?: string;
  termCount: number;
  author: string;
  createdAt: Date;
  updatedAt: Date;
  terms?: Term[];
}
```

## Стили компонентов

- Tailwind CSS 4 и DaisyUI 5 подключены в `app/globals.css`.
- Компоненты используют семантические DaisyUI-токены и CSS-переменные вида
  `--app-panel`, `--app-border`, `--app-text-strong`, `--app-field`.
- Новые компоненты не должны добавлять raw hex-цвета: один и тот же компонент
  обязан работать во всех четырёх темах.
- Основные адаптивные пороги соответствуют Tailwind (`sm`, `lg`).

## Тестирование

Unit/component tests лежат рядом с исходниками в `*.spec.ts` и `*.spec.tsx`.

```bash
npm --prefix frontend test
npm --prefix frontend run test:watch
```

`test/setup.ts` после каждого теста очищает DOM, localStorage, sessionStorage,
auth cookie и активную тему.

Ключевые сценарии `WriteExercise` покрывают правильный ответ, Enter, пропуск,
повторный этап, ручную переоценку, восстановление сессии, перезапуск и пустой
модуль.
