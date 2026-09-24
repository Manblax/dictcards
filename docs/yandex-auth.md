# Вход через Яндекс ID

На `/login` и `/register` посетителям с определённой страной `RU` показывается
Яндекс, остальным — Google. Неизвестная страна, локальный IP или ошибка GeoIP
оставляют Google. Решение принимает сервер по `X-Real-IP`, который перезаписывает
Nginx. Язык браузера не влияет на выбор. Подробнее: [определение страны](google-auth-country.md).
Прямой вход `/auth/yandex` доступен из любой страны, в том числе локально.

## Регистрация приложения

1. Откройте [Яндекс OAuth](https://oauth.yandex.ru/client/new/id/) под аккаунтом
   владельца сервиса. Выберите тип **Для авторизации пользователей**.
2. Укажите название Flashcards, иконку сервиса и контактную почту владельца.
3. Выберите платформу **Веб-сервисы**. Добавьте Redirect URI:
   - `http://localhost:3001/auth/yandex/callback` для разработки;
   - `https://<API_HOST>/auth/yandex/callback` для production, подставив домен API.
4. Выберите права `login:email` (адрес электронной почты) и `login:info`
   (логин, имя и фамилия, пол). Аватар, телефон и дата рождения не нужны.
5. Сохраните приложение. Запишите ClientID и Client secret в окружение backend.
   Секрет не добавляйте в Git, `NEXT_PUBLIC_*`, переписку или скриншоты.

Официальные инструкции: [регистрация](https://yandex.ru/dev/id/doc/ru/register-auth),
[получение кода и PKCE](https://yandex.ru/dev/id/doc/ru/codes/code-url),
[профиль пользователя](https://yandex.ru/dev/id/doc/ru/user-information).
При необходимости пройдите верификацию сервиса и модерацию в кабинете Яндекса.

## Переменные окружения

```dotenv
YANDEX_CLIENT_ID=<ClientID>
YANDEX_CLIENT_SECRET=<Client secret>
YANDEX_CALLBACK_URL=http://localhost:3001/auth/yandex/callback
```

Для Docker-разработки заполните эти значения в **корневом `.env`**:
Compose передаёт их backend и переопределяет одноимённые значения `backend/.env`.
Для запуска backend непосредственно на хосте добавьте значения в `backend/.env`.
`FRONTEND_URL` указывает адрес frontend; `JWT_SECRET` используется также для
подписи OAuth cookie. После изменения окружения перезапустите backend.

В production ClientID и секрет обязательны в `.env.production`.
Compose задаёт callback как `https://${API_HOST}/auth/yandex/callback`.
`scripts/deploy-production.sh` проверяет наличие значений и отклоняет заглушки
`replace-with-*`. Локальная разработка без ключей остаётся доступна; запуск входа
через Яндекс перенаправляет на понятное сообщение о недостающей настройке.

## Аккаунты и протокол

Backend запрашивает authorization code с PKCE S256 и случайным `state`.
Подписанная HttpOnly cookie действует 10 минут, имеет `SameSite=Lax`, путь
`/auth/yandex`, а в production — `Secure`. Callback проверяет cookie и `state`
до обмена кода, затем удаляет cookie при успехе и ошибке. Новая попытка входа
в том же браузере заменяет предыдущую; старую попытку нужно начать заново.
Код одноразовый; повторный обмен отклоняет Яндекс.

Обмен кода и запрос профиля выполняются сервером с таймаутом 10 секунд каждый.
Токен Яндекса передаётся API профиля в заголовке `Authorization: OAuth …`,
не хранится в базе и не отправляется браузеру. Проверяются ID и ClientID профиля.

Пользователь определяется по уникальному `User.yandexId`. При первой авторизации
точное совпадение `default_email` автоматически привязывает существующий аккаунт:
это выбранная для проекта политика доверия email провайдера. Пароль, email,
username и карточки существующего пользователя сохраняются. Занятая другим
`yandexId` привязка не перезаписывается. Если аккаунт отсутствует, создаётся новый
с уникальным username и случайным хешированным паролем. После привязки изменение
email в Яндексе не меняет аккаунт Flashcards. Управления отвязкой в интерфейсе нет.

JWT приложения со сроком жизни 60 минут передаётся во фрагменте
`/auth/callback?provider=yandex#…`. Страница сразу очищает фрагмент, сохраняет
сессию существующим механизмом и открывает `/`. Google продолжает использовать
свой текущий callback. Ошибки Яндекса возвращаются как `yandex_*` на `/login`.

## Миграция, выпуск и проверка

Миграция добавляет nullable `yandexId` и уникальный индекс, не меняя старые записи.
Сначала настройте OAuth-приложение и окружение, затем примените миграцию и
обновите backend/frontend. Production Compose выполняет миграцию перед backend.
Для разработки:

```bash
docker compose exec backend npx prisma generate
docker compose exec backend npx prisma migrate deploy
docker compose up -d backend frontend
```

Автоматические проверки не требуют реальных ключей и подменяют API Яндекса:

```bash
npm --prefix backend test -- --runInBand
npm --prefix frontend test
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix frontend run geoip:update
npm --prefix frontend run test:e2e -- e2e/login.spec.ts e2e/register.spec.ts e2e/auth-flows.spec.ts e2e/auth-country.spec.ts
```

После настройки ключей откройте `http://localhost:3001/auth/yandex` напрямую
(локальный IP не показывает кнопку Яндекса). Проверьте согласие, возврат на главную,
повторный вход и сохранность карточек при совпадении email. Для production
используйте `https://<API_HOST>/auth/yandex` и дополнительно проверьте показ кнопки
с российского IP. Отмена согласия и истёкшая попытка должны возвращать на `/login`
с сообщением. Проверяйте доступность Яндекс-входа после выпуска; токены и секреты
не записывайте в журналы.
