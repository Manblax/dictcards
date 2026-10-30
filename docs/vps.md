# VPS: dictcards.com

Для запуска приложения используется `docker-compose.vps.yml`.
Сборка выполняется на сервере. Nginx обслуживает frontend и маршруты API на
одном HTTPS-адресе. PostgreSQL и сервисы приложения не публикуют порты наружу.
Кнопки Google/Яндекс включены через `SOCIAL_AUTH_ENABLED=true`.
Статус проверки OAuth описан ниже.
Google Cloud TTS подключён через серверный `GOOGLE_TTS_API_KEY`. Ключ ограничен
API `texttospeech.googleapis.com` и исходящим IPv4 VPS `159.194.230.72`.

## Развёрнутый сервер

- Адрес: https://dictcards.com
- Старый адрес https://159.194.230.72 перенаправляет на домен.
- Каталог: `/opt/dictcards`
- Переменные и секреты: `/opt/dictcards/.env.vps` (права 600).
- Сертификаты: `/var/lib/dictcards/letsencrypt`.
- HTTP challenge: `/var/lib/dictcards/acme`.
- Данные: Docker volumes `dictcards-vps_postgres_data` и
  `dictcards-vps_backend_uploads`.

Исходники скопированы с рабочего компьютера, `.git` на сервер не переносится.
Локальные `.env`, базы, uploads и резервные копии не копировались.
Значения Google/Яндекс OAuth отдельно перенесены в серверный `.env.vps`.
Личные Google ADC credentials на сервер не переносились.

## Домен и OAuth

Домен `dictcards.com` направлен на VPS `159.194.230.72`. Выпущен отдельный
сертификат Let’s Encrypt `dictcards-domain`. В `.env.vps` настроены:

```dotenv
PUBLIC_HOST=dictcards.com
NGINX_TEMPLATE=./deploy/nginx/vps-domain.conf.template
```

Frontend собран с `NEXT_PUBLIC_API_URL=https://dictcards.com`. HTTP и старый
HTTPS-адрес по IP перенаправляют на домен. Старый IP-сертификат сохраняется
для корректного HTTPS-редиректа; таймер продлевает оба сертификата.

Адреса возврата для существующих OAuth-приложений:

- Google: `https://dictcards.com/auth/google/callback`.
- Яндекс: `https://dictcards.com/auth/yandex/callback`.

На VPS используется Google OAuth Client ID
`606342284578-38uf0hq2uj7b5hegh3s28r44v8inh46d.apps.googleusercontent.com`.
Секрет этого клиента хранится в серверном `.env.vps`.
Google принимает callback и открывает страницу входа `/v3/signin/identifier`;
ошибки `redirect_uri_mismatch` нет. Запрос обмена заведомо неверного кода
вернул `invalid_grant`, а не `invalid_client`; это не заменяет полный вход.
Яндекс при автоматической проверке показывал SmartCaptcha.
Серверные перенаправления и обработка отказа проверены; полный вход с личными
аккаунтами провайдеров должен проверить владелец в браузере.
Кнопки включены через `SOCIAL_AUTH_ENABLED=true` и проверены на страницах входа
и регистрации. Google/Яндекс показываются по существующему правилу определения
страны.

## Google TTS

На VPS используются голоса `en-GB-Chirp3-HD-Achernar` и
`en-US-Chirp3-HD-Achernar`. Проверены реальные запросы `/tts` для UK и US:
оба вернули MP3 с HTTP 200; повторный запрос вернул тот же звук из кеша.
API-ключ хранится только в `/opt/dictcards/.env.vps` и окружении backend.
Он не передаётся во frontend и не входит в Docker-образ.

## Обновление

С рабочего компьютера из корня репозитория:

```bash
rsync -az --files-from=<(git ls-files --cached --others --exclude-standard) \
  ./ root@159.194.230.72:/opt/dictcards/
ssh root@159.194.230.72 \
  'cd /opt/dictcards && ./scripts/deploy-vps.sh'
```

Перед копированием убедитесь, что список Git не содержит секретов. Команды
используют существующий SSH-ключ; если он защищён паролем, SSH запросит его.
Скрипт последовательно собирает образы, применяет миграции через
`backend-migrate` и ждёт готовности сервисов.
Обновление может вызвать короткий перерыв в работе.

## Состояние и логи

На VPS:

```bash
cd /opt/dictcards
docker compose --env-file .env.vps -f docker-compose.vps.yml ps
docker compose --env-file .env.vps -f docker-compose.vps.yml logs --tail=100
systemctl list-timers 'dictcards-*'
journalctl -u dictcards-tls-renew.service -n 30
```

## TLS

[Let's Encrypt поддерживает IP-сертификаты](https://letsencrypt.org/2026/03/11/shorter-certs-certbot.html)
с коротким сроком действия. Таймер `dictcards-tls-renew.timer` проверяет
продление дважды в сутки и перезагружает Nginx после успешной команды Certbot.
Порт 80 должен оставаться доступным для HTTP challenge.

Проверка продления без замены действующего сертификата:

```bash
cd /opt/dictcards
./scripts/renew-vps-tls.sh --dry-run
```

## Резервные копии

Автоматическое резервное копирование отключено по просьбе владельца.
При обновлении приложения резервные копии также не создаются.
Ранее созданная копия в `/opt/dictcards/backups/` сохранена.

## Повторное развёртывание на чистом сервере

Установите Docker Engine с Compose plugin, скопируйте проект в `/opt/dictcards`.
Создайте `.env.vps` с правами 600:

```dotenv
PUBLIC_IP=YOUR_PUBLIC_IPV4
IMAGE_TAG=vps
POSTGRES_PASSWORD=YOUR_RANDOM_HEX_PASSWORD
JWT_SECRET=YOUR_RANDOM_HEX_SECRET
```

Пароль БД должен быть безопасен для URL; используйте `openssl rand -hex 32`.
Создайте каталоги `/var/lib/dictcards/acme` и `/var/lib/dictcards/letsencrypt`.
До запуска основного Nginx поднимите временный HTTP-сервер на порту 80,
обслуживающий `/.well-known/acme-challenge/` из `/var/lib/dictcards/acme`.
Запросите сертификат (Certbot 5.4+):

```bash
docker compose --env-file .env.vps -f docker-compose.vps.yml run --rm certbot \
  certonly --webroot -w /var/www/certbot --preferred-profile shortlived \
  --ip-address YOUR_PUBLIC_IPV4 --cert-name dictcards-ip \
  --non-interactive --agree-tos --email YOUR_EMAIL
```

После успешного выпуска остановите временный HTTP-сервер и выполните
`./scripts/deploy-vps.sh`. Установите таймер продления TLS:

```bash
cp deploy/systemd/dictcards-tls-renew.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dictcards-tls-renew.timer
```

## Проверки при первом запуске

Production-зависимости frontend обновлены до Next.js 16.4.3 и React 19.2.9;
`npm audit --omit=dev` для frontend не показывает известных уязвимостей.
Обновлены совместимые серверные зависимости. В backend остаются предупреждения
для цепочки Prisma CLI, `multer` и `js-yaml`; полное устранение требует отдельной
проверки совместимости. Это развёртывание не заменяет аудит безопасности приложения.

Загрузка файлов требует JWT и ограничена 10 МиБ. Nginx добавляет CSP `sandbox`
к ответам `/uploads/`, поскольку файлы и frontend размещены на одном origin.

При проверке реального сервера исправлена регистрация: backend теперь возвращает
JWT вместе с созданным пользователем, как ожидает frontend. Прошли 294 unit-теста
и проверка в Chromium: регистрация, вход, обновление страницы с сохранением
сессии, CRUD модулей, открытие всех учебных режимов, словарь Cambridge, загрузка
изображений, запрет анонимных загрузок и мобильная ширина. Тестовые аккаунты,
модули и изображения удалены. Проверка Certbot `renew --dry-run` завершилась
успешно через работающий Nginx.

После переключения на dictcards.com повторно проверены регистрация и вход по
паролю, SSR-сессия, CRUD модулей, загрузки, учебные маршруты, словарь и TTS.
Проверка продления доменного сертификата через `renew --dry-run` прошла успешно.
