# План управления доступом и внутренней админки

Дата решения: 29.08.2026. Статус актуализирован 01.09.2026: управление ручным
доступом из issue #16 реализовано локально поверх завершённых Web-этапов прав и
read-only админки; production deployment и приёмка issue #16 ещё не выполнены.
Применение прав в native Mobile и MCP, а также тарифы, billing и usage не реализованы.

Связанные задачи product roadmap:

- **B13** — определить и применять права, роли и эффективный доступ;
- **B14** — наблюдать пользователей в read-only мини-админке;
- **B15** — управлять ручными назначениями и overrides в админке;
- **F17** — подключить тарифы к оплате, лимитам и учёту затрат.

## Цель и границы

Нужна единая модель, в которой пользователь получает возможности из активного
тарифа, ролей и когорт, а персональные назначения могут временно или постоянно
переопределить общий результат. Та же модель должна защищать API и управлять
видимостью разделов Web, native Mobile и MCP, не смешивая продуктовые права с
правами операторов внутренней админки.

Первая практическая цель — быстро получить безопасную read-only мини-админку для
наблюдения за регистрациями и использованием уже открытого сайта. Платежи,
провайдер биллинга, окончательные цены и коммерческие лимиты остаются в F17 и не
блокируют B13–B15.

Реализации B13 Web и B14 Web, включая production-приёмку B14, зафиксированы
ниже. В B14 не входят управляющие операции B15, платёжный lifecycle и usage
F17, произвольный отзыв пользовательских сессий или включение платных AI-вызовов.

## Зафиксированные решения

### Отдельный сервис

- Админка разворачивается из отдельного workspace `apps/admin` в отдельном
  контейнере и Railway service.
- Production-адрес — `https://admin.makeitastory.app`.
- Контейнер админки не совмещается с публичным Web и не получает прямые
  PostgreSQL credentials. Чтение и изменения выполняются через защищённые
  `/admin/*` endpoints общего API, чтобы правила доступа, валидация и аудит были
  едиными.
- Общие TypeScript-типы и UI-токены могут переиспользоваться на этапе сборки, но
  runtime и deployment остаются независимыми.
- Для сервиса обязательны отдельный healthcheck, TLS, `noindex`, CSP, запрет
  встраивания во frame и собственные Railway watch paths. Наличие записи в этом
  плане не означает, что удалённые настройки или DNS уже изменены.

### Общая авторизация Web и Admin

Браузерные приложения используют общую cookie-only сессию API; Mobile и MCP
сохраняют bearer transport. Старый Web bearer из `localStorage` мигрируется
одноразовым обменом и после успеха удаляется:

1. Закрепить first-party адрес API, предпочтительно
   `https://api.makeitastory.app`.
2. `POST /auth/browser/sign-in` устанавливает `__Host-storyteller-session` с
   `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` и без `Domain`; access token
   в browser response не возвращается. API хранит только hash opaque token.
3. Web и Admin вызывают один API с `credentials: include`; браузер отправляет одну
   API-cookie из обоих first-party subdomains. Mobile и MCP сохраняют
   `Authorization: Bearer` с тем же форматом токена.
4. `POST /auth/browser/exchange` меняет валидный legacy bearer на новую cookie,
   отзывает старую сессию и не передаёт token в URL. Одновременные bearer и cookie
   отклоняются как неоднозначная авторизация, кроме того, что сам exchange требует bearer.
5. CORS перечисляет точные разрешённые origins, включая основной Web и Admin,
   разрешает credentials и никогда не использует wildcard. State-changing
   cookie-запросы дополнительно защищаются проверкой `Origin` и CSRF-механизмом.
6. Отсутствие сессии даёт `401`; действующая пользовательская сессия без
   `admin.console.access` — `403`. Сам факт входа в основной продукт не открывает
   админку.

Таким образом Web, Admin, Mobile и MCP используют одну identity/session model и
одни серверные токены, но raw token не переносится между frontend origins и не
попадает в query string, логи или HTML.

### Основа UI

Выбран React-admin OSS 5.15.1 (MIT): готовые Dashboard/List/Show, Datagrid и
SimpleList работают с React 19/Vite, а типизированные `authProvider` и
`dataProvider` оставляют все решения доступа в общем API. Enterprise-модули,
AdminJS, второй user store и прямой DB-доступ UI-контейнера не используются.

Справка: [React-admin authorization](https://marmelab.com/react-admin/Permissions.html)
и [security/authProvider](https://marmelab.com/react-admin/SecurityGuide.html).

## Сущности доступа

| Сущность | Назначение |
| --- | --- |
| Capability | Стабильное атомарное право на действие или доступ к изолированной beta-секции. |
| Role / access bundle | Переиспользуемый набор capabilities; тарифом не является. |
| Plan version | Неизменяемая версия коммерческого набора ролей, отдельных прав и базовых лимитов. |
| Cohort | Группа пользователей: testers, early users, ambassadors, developers или участники акции. |
| Assignment | Назначение роли или отдельного права тарифу, когорте либо пользователю. |
| Override | Явный `allow`/`deny` для capability либо `replace`/`add` для лимита. |
| Effective access | Вычисленный результат с объяснением источников и ближайшим сроком истечения. |
| Usage ledger | Идемпотентные резервирование, списание и возврат платного лимита; реализуется в F17. |

У каждого назначения и override предусмотрены `starts_at`, `expires_at`,
обязательная причина, автор, время создания и ссылка на кампанию или внутреннюю
задачу. Использованные capability codes не удаляются и не переименовываются:
устаревшее право архивируется, а новое получает новый код.

## Правила вычисления

1. Системное значение по умолчанию — запрет.
2. Активная `plan_version` выдаёт базовые роли, отдельные права и лимиты.
3. Активные роли и назначения когорт расширяются до атомарных capabilities.
4. Персональный override имеет больший вес, чем override когорты; override
   когорты — больший вес, чем тариф. На одном уровне `deny` сильнее `allow`.
5. Роли и тарифы в первой версии только выдают права; явный запрет хранится как
   override, а не прячется внутри access bundle.
6. Для лимитов используются явные операции: базовое значение тарифа, затем
   `add`-бонусы, затем наиболее специфичный `replace`. `unlimited` — отдельное
   типизированное значение, а не большое условное число.
7. Просроченные назначения не участвуют в результате. Ближайший `expires_at`
   возвращается вместе с эффективным доступом.
8. Глобальный operational kill switch запрещает недоступную функцию независимо
   от тарифов и overrides.
9. После capability API отдельно проверяет связь с ресурсом. Например,
   `story.update` не разрешает редактировать чужую историю; для этого требуется
   отдельное административное право.
10. Для тарифицируемой операции после авторизации выполняется атомарная
    reservation лимита; commit/release и защита от повторного списания относятся
    к F17.

Ответ resolver для админки должен объяснять результат, например:

```json
{
  "capability": "ai.music.generate",
  "allowed": true,
  "expiresAt": "2026-10-01T00:00:00Z",
  "sources": [
    { "kind": "cohort", "key": "early_users", "effect": "allow" }
  ]
}
```

## Начальный каталог capabilities

Каталог организован по очереди реализации. Это стабильные технические ключи, а
не публичные названия тарифов.

### Очередь A — безопасное наблюдение за открытым продуктом

| Код | Назначение |
| --- | --- |
| `admin.console.access` | Открыть внутреннюю админку после общей аутентификации. |
| `admin.users.list` | Просматривать список пользователей и безопасные агрегаты. |
| `admin.users.read` | Открывать профиль пользователя без password hash, токенов и секретов площадок. |
| `admin.users.activity.read` | Смотреть продуктовые события и агрегаты активности без содержимого историй и файлов. |
| `admin.sessions.metadata.read` | Смотреть число, даты и expiry сессий без raw tokens и token hashes. |
| `admin.audit.read` | Просматривать журнал административных чтений и изменений. |
| `admin.access.explain` | Получать effective access и объяснение его источников. |

### Очередь B — ручное управление ранним доступом

| Код | Назначение |
| --- | --- |
| `admin.permissions.read` | Просматривать каталог capabilities. |
| `admin.roles.read` | Просматривать состав ролей. |
| `admin.cohorts.read` | Просматривать когорты и активные membership. |
| `admin.access.assign_role` | Назначать и снимать роли с причиной и сроком. |
| `admin.access.assign_cohort` | Добавлять пользователя в когорту и исключать из неё. |
| `admin.access.override` | Создавать персональные allow/deny и limit overrides. |
| `admin.sessions.revoke` | Отзывать выбранные пользовательские сессии без просмотра токена. |

### Очередь C — базовые продуктовые действия

| Код | Назначение |
| --- | --- |
| `studio.access` | Войти в пользовательскую студию. |
| `story.list` | Перечислять доступные пользователю истории. |
| `story.create` | Создавать историю. |
| `story.read` | Читать историю при выполнении resource policy. |
| `story.update` | Изменять историю при выполнении resource policy. |
| `story.delete` | Удалять историю или её части по правилам продукта. |
| `media.upload` | Загружать материалы. |
| `scene.render` | Запускать рендер сцены. |
| `story.export` | Собирать и скачивать мастер или пакет. |
| `profile.platform_credentials.manage` | Управлять собственными подключениями площадок. |
| `publish.youtube` | Подготавливать и подтверждать публикацию в YouTube. |

### Очередь D — beta-разделы и поздние возможности

| Код | Назначение |
| --- | --- |
| `studio.timeline.access` | Показывать и использовать общий таймлайн до общего выпуска. |
| `studio.collage.access` | Открывать экспериментальные коллажи. |
| `studio.custom_layout.access` | Открывать нестандартные макеты. |
| `studio.scene_groups.access` | Открывать группы сцен. |
| `mobile.access` | Разрешать вход в native Mobile при ограниченном выпуске. |
| `mcp.access` | Разрешать использование MCP-интерфейса. |
| `ai.story_assist.use` | Использовать предложения сюжета, титров и текстов. |
| `ai.music.generate` | Генерировать музыку. |
| `ai.cover.generate` | Генерировать AI-композит обложки. |
| `developer.diagnostics.read` | Читать техническую диагностику без автоматического доступа к PII и контенту. |

### Первые типизированные лимиты

| Код | Тип |
| --- | --- |
| `limit.stories.active` | Целое число или `unlimited`. |
| `limit.storage.bytes` | Целое число байт или `unlimited`. |
| `limit.scene_renders.month` | Целое число операций за расчётный период. |
| `limit.story_exports.month` | Целое число операций за расчётный период. |
| `limit.ai.credits.month` | Целое число внутренних AI credits за расчётный период. |

Раздел UI по умолчанию виден, если у пользователя есть хотя бы одно применимое
действие внутри него. Отдельный `*.access` создаётся только для закрытой beta-зоны
или интерфейса, а не дублирует каждую backend-проверку.

## Первые две роли

| Роль | Состав и назначение |
| --- | --- |
| `creator` | `studio.access`, работа со своими историями, материалами, рендерами и экспортом, управление собственными platform credentials и `publish.youtube`. |
| `access_manager` | Внутренняя админка: read-only наблюдение, чтение каталога и управление ролями, когортами, overrides и отзывом сессий. До B15 доступны только реализованные в B14 read-only операции. |

AI-возможности не выделяются в роль: их атомарные capabilities выдаёт
`plan_version`, а фактический платный вызов дополнительно требует доступного
лимита F17.

Роль `product_tester` не входит в P0. Её можно ввести после P0 только вместе с
конкретной beta-функцией, известным набором прав и критериями раннего доступа.

Когорты не считаются ролями. Начальные когорты: `testers`, `early_users`,
`ambassadors`, `developers` и именованные кампании вида
`campaign_<stable_key>`. Когорты не получают beta-права по умолчанию; конкретные
атомарные capabilities назначаются им только для утверждённого сценария.

## Три примерных тарифа

Ниже — fixtures для проектирования resolver и админки, а не утверждённые цены,
названия или коммерческие лимиты. Окончательные значения принимаются в F17.

| Тариф | Роли и отдельные права | Тестовые лимиты |
| --- | --- | --- |
| `free-v1` | `creator`; без встроенных AI-вызовов | 3 активные истории, 2 GiB, 20 scene renders и 3 exports в месяц, 0 AI credits. |
| `creator-v1` | `creator` | 50 активных историй, 50 GiB, 300 renders и 60 exports в месяц, 0 AI credits. |
| `studio-v1` | `creator` + три атомарные AI-capabilities | 500 активных историй, 500 GiB, 2 000 renders, 300 exports и 500 AI credits в месяц. |

Подписка ссылается на неизменяемую `plan_version`. Изменение состава для новых
пользователей создаёт следующую версию; массовая миграция существующих подписок
явна, проверяема и записывается в audit log.

## Конфликтные сценарии overrides

Эти сценарии становятся обязательными fixtures и тестами resolver при реализации
B13.

| Сценарий | Ожидаемый результат |
| --- | --- |
| `free-v1` + cohort `early_users` выдаёт `studio.timeline.access` | Таймлайн разрешён до expiry membership; остальные beta-права не появляются. |
| `creator-v1` выдаёт `publish.youtube`, но user override содержит `deny` | Публикация запрещена; explanation показывает тариф и перекрывший его user deny. |
| Cohort `ambassadors` добавляет 100 AI credits, user bonus добавляет ещё 50 | Итоговый лимит равен base тарифа + 150; списания остаются в отдельном ledger. |
| Две когорты на одном уровне дают `allow` и `deny` одной capability | Побеждает `deny`; результат не зависит от порядка чтения строк. |
| Cohort deny и персональный user allow одной capability | Побеждает более специфичный user allow. |
| Campaign membership истёк | Назначение не участвует; explanation может показывать его только в истории. |
| Capability разрешена, но operational kill switch выключен | Операция запрещена как временно недоступная, не как проблема тарифа. |
| `story.update` разрешено, но история принадлежит другому profile | Resource policy запрещает действие без раскрытия существования чужой истории. |
| AI capability разрешена, но credits исчерпаны | Авторизация успешна, reservation отклонена с отдельным `quota_exhausted`; provider не вызывается. |
| Тариф обновлён с `creator-v1` на `creator-v2` | Пользователь остаётся на сохранённой версии до явной миграции или события подписки. |

## Мини-админка и наблюдаемость

### Первая read-only версия B14

- счётчики регистраций: сегодня, 7 и 30 дней, всего;
- список пользователей с поиском по ID/email, датой регистрации и последней
  успешной активностью;
- число активных/истёкших сессий и возможность увидеть expiry без токена;
- агрегаты: количество историй по статусам, загрузок, render requests, exports и
  publication attempts;
- безопасная лента продуктовых событий;
- effective access с источниками в read-only режиме;
- audit чтений чувствительных административных экранов.

Начальный словарь продуктовых событий:

```text
auth.registered
auth.logged_in
story.created
material.uploaded
scene.render_requested
scene.render_ready
story.export_requested
story.export_ready
publication.requested
publication.succeeded
publication.failed
```

События не содержат свободного payload, password hashes, raw tokens, token hashes,
секреты площадок, имена файлов или содержимое историй. Они записываются
идемпотентно вместе с подтверждённым результатом; Worker удаляет события и
завершённые session metadata старше 90 дней. Коды export/publication зарезервированы,
но до реальных операций события не создаются.

### Управление B15

- добавление/удаление пользователя в когорте;
- назначение/снятие роли;
- персональные allow/deny и limit add/replace;
- обязательные reason, start/expiry и preview effective access до сохранения;
- защита от случайного снятия последнего `access_manager`;
- отзыв пользовательской сессии;
- неизменяемый audit trail и экран «почему доступ разрешён/запрещён»;
- подтверждение для массовых операций и запрет тихих bulk-изменений.

Управление ценами, billing products, активными подписками и usage ledger не
входит в B15: это расширение админки в F17.

## Этапы выполнения

### Этап 1 — B13: спецификация и серверный контракт

1. Утвердить capability catalog, две начальные роли, когорты и semantics выше.
2. Зафиксировать таблицы, constraints, архивирование ключей и audit schema.
3. Описать resolver contract, explain response и все конфликтные fixtures.
4. Провести threat model общей cookie/bearer-сессии, CORS, CSRF и административной роли.
5. Провести spike React-admin против AdminJS без production deployment.

### Этап 2 — общая сессия и отдельный контейнер

1. Добавить first-party API domain и dual cookie/bearer transport.
2. Добавить точные Web/Admin origins и CSRF-защиту.
3. Создать `apps/admin`, отдельную сборку, container/service и healthcheck.
4. Подключить `admin.makeitastory.app`, TLS и security headers.
5. Проверить одну сессию между Web и Admin, отдельные `401`/`403`, logout и
   revocation. Никакие raw tokens не должны попадать в URL или frontend storage
   админки.

### Этап 3 — B14: read-only мини-админка

1. Ввести безопасный event dictionary и агрегаты.
2. Реализовать список, профиль, session metadata, activity и access explanation.
3. Проверить отсутствие контента/секретов, пагинацию, фильтры и audit чтений.

### Этап 4 — B15: ручные назначения

1. Реализовать роли, когорты, membership и user overrides.
2. Добавить preview результата, обязательную причину, expiry и audit.
3. Проверить все конфликтные сценарии, self-lockout и одновременные изменения.

### Этап 5 — применение B13 во всех интерфейсах

1. Web скрывает или объяснимо блокирует недоступные разделы, но API остаётся
   единственной security boundary.
2. Native Mobile в milestone P1 и MCP в milestone P2 используют тот же resolver и
   коды, с независимой проверкой интерфейсов.
3. Существующие пользователи получают явно заданную baseline role/plan version,
   чтобы миграция не создала случайный lockout.

### Этап 6 — F17: тарифы, биллинг и usage

1. Утвердить реальные тарифы и лимиты; связать billing products с внутренними
   `plan_version`.
2. Синхронизировать subscription status идемпотентными webhooks.
3. Добавить reservation/commit/release ledger и защиту retry.
4. Расширить админку тарифами и расходами, не меняя semantics ручных overrides.

## Запись реализации B13 — 29.08.2026

- Общий application-модуль определяет стабильный каталог из 35 capabilities,
  пять типизированных лимитов и только две начальные роли: `creator` и
  `access_manager`. Публикация входит в `creator`; AI-возможности выдаются
  версией тарифа, а `translator`, `ai_creator`, `user_observer` и
  `product_tester` не создавались.
- Deny-by-default resolver объединяет plan version, роли, когорты, персональные
  назначения, expiry и operational kill switches. Персональное назначение
  сильнее когорты, когорта сильнее тарифа, deny побеждает allow на одинаковом
  уровне; объяснение сохраняет решающие и переопределённые источники. Лимиты
  поддерживают базовое значение, бонусы и наиболее специфичную замену.
- PostgreSQL migration 6 создаёт каталог, версии тарифов, когорты, memberships,
  назначения, switches и audit. Существующие профили получают `free-v1` и
  baseline `creator`; ключи каталога и зафиксированные версии тарифов
  неизменяемы. Repository читает resolver snapshot в repeatable-read
  транзакции.
- Data migration 7 идемпотентно назначает запрошенному существующему профилю
  начального оператора роль `access_manager`; назначение проходит через общий
  audit trigger и не дублируется, если роль уже выдана.
- API публикует `GET /access/effective`, классифицирует каждый защищённый bearer
  route как auth-only или capability-gated и возвращает `403 access_denied` до
  выполнения операции. Проверка capability дополняет, но не заменяет проверку
  владения историей и материалами.
- Story Studio загружает effective access до защищённого интерфейса, скрывает
  недоступные действия и показывает локализованное объяснение запрета. Сервер
  остаётся единственной security boundary.
- Unit и PostgreSQL fixtures покрывают baseline, приоритет user/cohort/plan,
  одинаково специфичные allow/deny, expiry, kill switch, лимиты, audit,
  constraints и неизменяемость каталога и plan versions. Локально в браузере
  проверены обычный путь до создания истории, персональный deny
  `studio.access` и экран запрета на ширине 390 px без overflow.
- Новое Amplitude-событие не добавлено: вычисление или запрет доступа не является
  подтверждённым пользовательским outcome. Уже типизированные продуктовые
  события отправляются только после успешных операций; access explanation,
  причины deny и внутренние назначения во внешнюю аналитику не передаются.
- B14/B15, native Mobile, MCP, production deployment, реальные коммерческие
  лимиты, subscription lifecycle и usage ledger этой реализацией не закрыты.

## Запись реализации B14 — 31.08.2026

- Migration 10 добавляет безопасный UUID, `last_seen_at` и `revoked_at` сессии,
  стабильный каталог внутренних product activity events, 90-дневную read model и
  отдельный `admin_audit_log`. Token/hash не входит ни в один Admin-контракт.
- Browser auth использует cookie-only sign-in/session/logout и одноразовый
  bearer-to-cookie exchange. Cookie host-only, HttpOnly, Strict и Secure в
  production; unsafe cookie-запросы требуют точный allowlisted Origin и CSRF,
  криптографически связанный с UUID сессии. Mobile/MCP bearer endpoints сохранены.
- Подтверждённые registration/login/story/material/render outcomes записываются
  идемпотентно в той же PostgreSQL-транзакции или SQL CTE, что и результат.
  Scene frames не считаются пользовательским render outcome; историю до migration
  10 намеренно не реконструируем.
- `/admin/me`, overview, POST-only user search, user detail, activity, sessions,
  effective access и нормализованный audit защищены сочетанием
  `admin.console.access` и endpoint capability. Чтения users/activity/sessions/
  access/audit fail closed, если audit insert не сохранился; ответы имеют
  `private, no-store` и не содержат пользовательского контента или raw ошибок.
- `apps/admin` — независимая React-admin 5.15.1 сборка с RU/EN fallback,
  Dashboard/List/Show, desktop Datagrid, mobile SimpleList и только read-only
  dataProvider. Static runtime выставляет CSP, frame deny, nosniff, strict
  permissions/referrer policy и `noindex`; healthcheck и закрытый `robots.txt`
  не требуют backend secrets или DB credentials.
- Site, Story Studio и Clip Studio переведены на cookie API; legacy bearer
  удаляется из `localStorage` только после успешного обмена. `continue=admin` —
  фиксированный target основного sign-in, не произвольный URL.
- Внешнее Amplitude-событие для Admin не добавлено: административное чтение не
  является product outcome и фиксируется внутренним audit. B15 mutations,
  billing/usage F17 и arbitrary session revocation не входят в B14.
- На промежуточном этапе Railway Admin service, команды, watch paths,
  public-only variables, API browser-auth variables и custom domains были
  подготовлены без deployment. Проверенный тогда fallback `404` был release
  gate, а не итоговым состоянием B14.
- Базовый release `66426a9`, исправление relation-read `0596a15` и исправление
  локализации `5f838ff` прошли CI и развёрнуты в Railway; API, Worker, Web и
  Admin завершили deployment со статусом `SUCCESS`. В production подтверждены
  общая авторизованная Site/Admin session, Dashboard, Users, Activity, Sessions,
  Effective access и Audit, реальные session metadata и audit-записи чтений.
  Матрица CSRF даёт missing `403`, invalid `403`, valid `200`;
  неавторизованный `/admin/me` возвращает `401`, пользователь без
  `admin.console.access` — `403`, а logout — `204` с последующим session `401`.
  Также проверены точный CORS allow/deny, CSP/`DENY`/noindex/robots, отсутствие
  DB credentials у Admin, локализованное пустое состояние и отсутствие
  horizontal overflow на 390/320 px. Relation-read больше не вызывает snackbar
  и показывает `1–1 из 1`; фильтр без результатов использует русские
  `ra.navigation.no_filtered_results` и `ra.navigation.clear_filters`. B14 Web
  принят и выполнен в P0. Повторная публичная read-only проверка 31.08.2026
  получила `200` от API/Admin healthchecks и корня Admin, подтвердила security
  headers и полностью закрытый `robots.txt`.

## Запись локальной реализации issue #16 — 01.09.2026

- Migration 11 добавляет per-profile и global access revisions, одноразовые
  десятиминутные preview, unique constraints для прямых role/capability/limit
  назначений и останавливается на старых дублях без автоматического удаления.
- Общий command contract поддерживает назначение и снятие ролей, memberships,
  capability allow/deny и limit add/replace. Одна операция применяется к 1–100
  пользователям; bulk выполняется только целиком и требует `APPLY <count>`.
- Preview сохраняет нормализованную операцию, actor, revisions и hash эффективного
  результата. Apply повторяет resolver в serializable-транзакции, блокирует stale,
  expired, consumed и no-op preview и сериализует административные изменения
  advisory lock. Изменение, лишающее текущего оператора нужных прав или оставляющее
  систему без эффективного access manager, отклоняется.
- Проверка последнего manager не обходит всю таблицу profiles под advisory lock:
  SQL заранее выбирает только активных direct-, plan- и cohort-holders роли
  `access_manager`, после чего добавляет не более 100 изменяемых preview targets.
  PostgreSQL regression с 250 нерелевантными профилями проверяет постоянный бюджет
  запросов и отсутствие прежнего полного scan.
- Audit triggers получают фактические actor, reason, target profile и batch из
  транзакционного контекста; access/admin audit защищены от update/delete. Session
  revoke работает только по безопасному UUID, не читает token/hash и запрещает
  отзыв текущей сессии самим оператором.
- Admin показывает сырые ручные назначения отдельно от effective access, источники
  decisive/overridden решений, preview before/after, полные bulk-действия, revoke
  активной сессии и безопасный audit diff. Отдельный permission-aware справочник
  объясняет все текущие роли, capabilities, когорты, лимиты и правила приоритета;
  те же RU/EN описания показываются прямо в списке выбора и после выбора кода.
  Неизвестный новый код получает заметное предупреждение вместо пустой подсказки.
  Формы остаются RU/EN и адаптивными.
- Добавлены unit, provider/UI и PostgreSQL/API fixtures для no-op, expiry, stale и
  consumed preview, all-or-nothing bulk, audit actor/reason, self-lockout и revoke.
  PostgreSQL fixtures требуют явно заданную disposable test database. Финальная
  локальная проверка прошла: `yarn check`; `yarn test` (192 backend/unit и 46 Web
  tests); `yarn test:api:postgres` (22 tests на изолированном PostgreSQL);
  `yarn test:admin` (11 Vitest tests и отдельный static-header test);
  `yarn build:admin`.
- Внешнее Amplitude-событие не добавляется: ручное изменение доступа является
  административной security-операцией и подтверждается внутренним audit, а не
  пользовательским продуктовым outcome.
- Эта запись не утверждает deployment или production-приёмку. Issue #16 остаётся
  открытой до прохождения обязательных проверок и проверки обратимого сценария на
  выделенном production test profile.

## Критерии завершения задач

### B13 Web

- capability catalog и resolver реализованы и покрыты всеми конфликтными
  fixtures;
- API проверяет capability, resource relationship и deny-by-default;
- Web получает effective access и корректно отражает недоступные действия и разделы;
- baseline migration не блокирует существующих пользователей;
- изменения имеют audit и объяснимый источник;
- тарифный биллинг и usage не выдаются за готовые до F17.

### B14 Web

Все критерии ниже подтверждены production-приёмкой 31.08.2026.

- админка действительно работает в отдельном container/service на
  `admin.makeitastory.app`;
- используется общая API-сессия, без второго хранилища пользователей и без
  прямого DB-доступа контейнера;
- неавторизованный запрос даёт `401`, обычный пользователь — `403`;
- read-only метрики, список, профиль, activity, session metadata и access
  explanation проверены на production-данных без секретов и контента;
- security headers, CORS/CSRF, `noindex`, audit и responsive layout проверены.

### Issue #16 Web

- роли, когорты, memberships и user overrides управляются из админки;
- start/expiry, reason, preview, audit, revoke и self-lockout guard проверены;
- все конфликтные fixtures дают детерминированный результат;
- массовые изменения требуют отдельного подтверждения;
- платные subscription lifecycle и usage остаются незавершёнными до F17.

### Mobile и MCP для B13

Общий backend сам по себе не закрывает статусы. Для каждого интерфейса отдельно
проверяются аутентификация, effective access, скрытие/ошибки недоступной операции,
expiry, override и отсутствие обхода через прямой API/MCP-вызов.
