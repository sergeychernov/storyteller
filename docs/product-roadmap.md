# Product roadmap

Задачи, их статусы, интерфейсы, milestones, сроки и доказательства выполнения
ведутся в [GitHub Issues](https://github.com/sergeychernov/storyteller/issues) и
[GitHub Milestones](https://github.com/sergeychernov/storyteller/milestones).
Этот файл больше не дублирует issue backlog.

## Источник данных

- Одна issue описывает один проверяемый результат для одного интерфейса.
- Интерфейс задаётся ровно одним label: `backend`, `web`, `mobile` или `mcp`.
- Целевой выпуск задаётся GitHub milestone; его стабильный `number` используется
  только как технический ключ. Искусственные идентификаторы `P0`–`P6` больше не
  являются частью модели или публичного интерфейса.
- Product roadmap milestones назначаются только issues, но не pull requests:
  GitHub включает назначенные PR в те же агрегаты `open_issues` и `closed_issues`.
- Открытая issue — незавершённая задача. Закрывать issue можно только после
  выполнения и проверки описанных критериев; ошибочно созданные issue удаляются,
  а не закрываются.
- Issue body остаётся достаточным самостоятельно: результат, границы, зависимости,
  критерии завершения и evidence не должны требовать task-строки в репозитории.
- Ориентировочная дата берётся из `due_on` GitHub milestone. Изменение даты или
  состава milestone выполняется в GitHub, без синхронной копии в Markdown.

## Порядок выпуска

Сначала завершается YouTube MVP на Web, затем тот же продуктовый путь в native
Mobile, после него — управление через MCP. Начиная со следующего этапа Web,
Mobile, MCP и самостоятельные backend-результаты могут развиваться параллельно,
но каждая применимая поверхность сохраняет отдельную issue и независимую
приёмку. Готовый backend сам по себе не завершает Web, Mobile или MCP.

Реализация сохраняет [product-first подход](adr/0001-product-first-foundation.md):
общие application/domain/worker и разные интерфейсы без копирования продуктовой
логики. Архитектурный контекст остаётся в [migration-plan.md](migration-plan.md),
границы frontend-продуктов — в
[ADR 0004](adr/0004-separate-product-frontends.md), доступ и внутренняя админка —
в [отдельном плане](access-control-admin-plan.md).

## Публичный виджет

`ProductRoadmap` запрашивает `/product-roadmap.json`. Web-сервер с коротким кешем
читает GitHub Milestones API и рассчитывает:

- прогресс milestone как `closed_issues / (open_issues + closed_issues)`;
- общий прогресс по тем же счётчикам всех product milestones;
- текущий milestone как первый по номеру, в котором остаются открытые issue;
- ориентировочный месяц из GitHub milestone `due_on`.

В публичный ответ входят только агрегаты, даты и локализованные названия. Issue
titles, bodies, labels, пользователи и внутренние evidence в браузер не передаются.
Изменение issue отражается после истечения кеша без нового site deployment.

GitHub хранит одно название milestone, поэтому публичные продуктовые подписи на
EN/RU/SR Latin/ES остаются единственной локальной конфигурацией. Ключ каждого
элемента — GitHub milestone number; milestones, которых нет в этом списке, не
относятся к product roadmap и в расчёт не входят:

<!-- product-roadmap-public-titles:
{
  "1": { "en": "Stories on YouTube", "ru": "Истории на YouTube", "sr-Latn": "Priče na YouTube-u", "es": "Historias en YouTube" },
  "2": { "en": "Mobile studio", "ru": "Мобильная студия", "sr-Latn": "Mobilni studio", "es": "Estudio móvil" },
  "3": { "en": "Personal Codex, connected workflows & more collages", "ru": "Личный Codex, управление из других приложений и новые коллажи", "sr-Latn": "Lični Codex, povezani tokovi i novi kolaži", "es": "Codex personal, flujos conectados y nuevos collages" },
  "4": { "en": "New channels, media library & 5-card collages", "ru": "Новые площадки, медиатека и коллажи из 5 материалов", "sr-Latn": "Novi kanali, medijateka i kolaži od 5 materijala", "es": "Nuevos canales, biblioteca y collages de 5 elementos" },
  "5": { "en": "AI plan, tools & 6-card collages", "ru": "AI-тариф, AI-помощь и коллажи из 6 материалов", "sr-Latn": "AI paket, alati i kolaži od 6 materijala", "es": "Plan de IA, herramientas y collages de 6 elementos" },
  "6": { "en": "Multi-camera music clips", "ru": "Музыкальные клипы из нескольких ракурсов", "sr-Latn": "Muzički spotovi iz više uglova", "es": "Videoclips multicámara" },
  "7": { "en": "Clips recorded part by part", "ru": "Клипы, записанные по отдельности", "sr-Latn": "Spotovi snimljeni deo po deo", "es": "Clips grabados por partes" }
}
-->
