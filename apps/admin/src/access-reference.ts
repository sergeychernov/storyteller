export type AccessReferenceKind = "role" | "capability" | "cohort" | "limit";
export type AccessReferenceLocale = "en" | "ru";

interface LocalizedReference {
  readonly en: { readonly name: string; readonly description: string };
  readonly ru: { readonly name: string; readonly description: string };
}

export interface AccessReferenceText {
  readonly name: string;
  readonly description: string;
  readonly documented: boolean;
}

const references: Readonly<Record<AccessReferenceKind, Readonly<Record<string, LocalizedReference>>>> = {
  role: {
    creator: reference(
      "Creator", "Creates and edits stories, uploads media, renders and exports results, manages YouTube credentials and publishes to YouTube.",
      "Автор", "Создаёт и редактирует истории, загружает материалы, запускает рендер и экспорт, управляет YouTube-реквизитами и публикует на YouTube.",
    ),
    access_manager: reference(
      "Access manager", "Sensitive administrator role containing all admin capabilities, including access changes, session revocation and audit reads.",
      "Менеджер доступа", "Критичная административная роль со всеми admin-правами, включая изменение доступа, отзыв сессий и чтение аудита.",
    ),
  },
  capability: {
    "admin.console.access": reference("Open Admin", "Allows entry to the internal Admin console. Other Admin sections still require their own capabilities.", "Вход в Admin", "Разрешает открыть внутреннюю админку. Для её разделов всё равно нужны отдельные права."),
    "admin.users.list": reference("List users", "Lists and searches safe user summaries.", "Список пользователей", "Показывает и позволяет искать безопасные сводные данные пользователей."),
    "admin.users.read": reference("Read user", "Opens a user profile without passwords, tokens or content.", "Профиль пользователя", "Открывает профиль без паролей, токенов и пользовательского контента."),
    "admin.users.activity.read": reference("Read activity", "Shows allowlisted product activity events and aggregates.", "Активность пользователя", "Показывает разрешённые продуктовые события и агрегаты активности."),
    "admin.sessions.metadata.read": reference("Read session metadata", "Shows session IDs, status and dates without raw tokens or hashes.", "Метаданные сессий", "Показывает UUID, состояние и даты сессий без raw-токенов и хешей."),
    "admin.audit.read": reference("Read audit", "Reads immutable administrative and access audit records.", "Чтение аудита", "Показывает неизменяемые записи административного аудита и аудита доступа."),
    "admin.access.explain": reference("Explain effective access", "Shows the final access decision and decisive or overridden sources.", "Объяснение доступа", "Показывает итоговое решение и решающие либо переопределённые источники доступа."),
    "admin.permissions.read": reference("Read capability and limit catalogs", "Reads the available capability and limit definitions.", "Каталоги прав и лимитов", "Разрешает читать доступные определения прав и лимитов."),
    "admin.roles.read": reference("Read roles", "Reads role definitions and the capabilities included in each role.", "Каталог ролей", "Показывает роли и входящие в каждую роль права."),
    "admin.cohorts.read": reference("Read cohorts", "Reads cohort definitions and memberships.", "Каталог когорт", "Показывает когорты и memberships пользователей."),
    "admin.access.assign_role": reference("Assign roles", "Assigns, updates or removes direct user roles through preview/apply.", "Назначение ролей", "Назначает, обновляет или снимает прямые роли пользователя через preview/apply."),
    "admin.access.assign_cohort": reference("Assign cohorts", "Adds, updates or removes user cohort membership through preview/apply.", "Назначение когорт", "Добавляет, обновляет или удаляет membership пользователя через preview/apply."),
    "admin.access.override": reference("Override access", "Creates or removes personal capability allow/deny and limit add/replace overrides.", "Переопределение доступа", "Создаёт или удаляет персональные allow/deny для прав и add/replace для лимитов."),
    "admin.sessions.revoke": reference("Revoke sessions", "Revokes another active session by safe UUID; never reveals its secret.", "Отзыв сессий", "Отзывает другую активную сессию по безопасному UUID, не раскрывая её секрет."),
    "studio.access": reference("Open Story Studio", "Allows entry to the user Story Studio.", "Вход в Story Studio", "Разрешает открыть пользовательскую студию историй."),
    "story.list": reference("List stories", "Lists stories available to the current user.", "Список историй", "Показывает доступные текущему пользователю истории."),
    "story.create": reference("Create stories", "Creates a new story.", "Создание историй", "Разрешает создать новую историю."),
    "story.read": reference("Read stories", "Reads a story when its resource ownership policy also allows it.", "Чтение историй", "Читает историю, если это также разрешает resource policy владения."),
    "story.update": reference("Edit stories", "Changes a story when its resource ownership policy also allows it.", "Редактирование историй", "Изменяет историю, если это также разрешает resource policy владения."),
    "story.delete": reference("Delete stories and scenes", "Deletes a story or its parts after resource and revision checks.", "Удаление историй и сцен", "Удаляет историю или её части после проверки ресурса и revision."),
    "media.upload": reference("Upload media", "Uploads source images, video and audio for stories.", "Загрузка материалов", "Загружает исходные изображения, видео и аудио для историй."),
    "scene.render": reference("Render scenes", "Queues and retrieves scene rendering results.", "Рендер сцен", "Запускает и получает результаты рендера сцен."),
    "story.export": reference("Export stories", "Builds downloadable story exports.", "Экспорт историй", "Создаёт итоговый файл истории для скачивания."),
    "profile.platform_credentials.manage": reference("Manage platform credentials", "Adds, replaces or removes the user's encrypted publishing credentials.", "Реквизиты площадок", "Добавляет, заменяет или удаляет зашифрованные реквизиты пользователя для публикации."),
    "publish.youtube": reference("Publish to YouTube", "Publishes an eligible story to the user's connected YouTube account.", "Публикация на YouTube", "Публикует готовую историю в подключённый YouTube-аккаунт пользователя."),
    "studio.timeline.access": reference("Timeline tools", "Opens timeline editing features when implemented for the interface.", "Инструменты таймлайна", "Открывает функции редактирования таймлайна, когда они реализованы в интерфейсе."),
    "studio.collage.access": reference("Collage tools", "Opens collage layout and composition features.", "Инструменты коллажей", "Открывает выбор раскладки и композицию коллажей."),
    "studio.custom_layout.access": reference("Custom layouts", "Opens custom layout controls when implemented.", "Произвольные раскладки", "Открывает управление произвольными раскладками, когда оно реализовано."),
    "studio.scene_groups.access": reference("Scene groups", "Opens scene grouping features when implemented.", "Группы сцен", "Открывает группировку сцен, когда она реализована."),
    "mobile.access": reference("Native Mobile access", "Allows entry to protected native Mobile features; it does not prove that Mobile parity is implemented.", "Доступ в native Mobile", "Открывает защищённые функции native Mobile, но само по себе не означает готовность Mobile parity."),
    "mcp.access": reference("MCP access", "Allows protected MCP operations; every MCP tool still needs its own checks.", "Доступ к MCP", "Открывает защищённые MCP-операции; каждому MCP-инструменту всё равно нужна собственная проверка."),
    "ai.story_assist.use": reference("AI story assistant", "Allows AI-assisted story operations when the feature and usage accounting are available.", "AI-помощник истории", "Разрешает AI-помощь для истории, когда доступны сама функция и учёт использования."),
    "ai.music.generate": reference("AI music generation", "Allows AI music generation, subject to feature availability and usage limits.", "AI-генерация музыки", "Разрешает AI-генерацию музыки с учётом готовности функции и лимитов."),
    "ai.cover.generate": reference("AI cover generation", "Allows AI cover generation, subject to feature availability and usage limits.", "AI-генерация обложки", "Разрешает AI-генерацию обложки с учётом готовности функции и лимитов."),
    "developer.diagnostics.read": reference("Developer diagnostics", "Reads technical diagnostics intended for developers, without granting access to user content.", "Диагностика разработчика", "Показывает техническую диагностику для разработчиков, не открывая пользовательский контент."),
  },
  cohort: {
    testers: reference("Testers", "Participants in controlled testing. Membership grants only the assignments explicitly attached to this cohort.", "Тестировщики", "Участники контролируемого тестирования. Membership выдаёт только явно привязанные к этой когорте назначения."),
    early_users: reference("Early users", "Early-access participants. Use time windows for temporary campaigns.", "Ранние пользователи", "Участники раннего доступа. Для временных кампаний следует задавать срок действия."),
    ambassadors: reference("Ambassadors", "Community or partner participants. The cohort itself has no implicit capabilities.", "Амбассадоры", "Участники партнёрской или community-программы. У когорты нет неявных прав."),
    developers: reference("Developers", "Internal or trusted technical participants. Add only the capabilities required for diagnostics or testing.", "Разработчики", "Внутренние или доверенные технические участники. Следует выдавать только нужные для диагностики или тестирования права."),
  },
  limit: {
    "limit.stories.active": reference("Active stories", "Maximum number of active stories available to the user.", "Активные истории", "Максимальное число активных историй пользователя."),
    "limit.storage.bytes": reference("Storage", "Maximum stored media size in bytes.", "Хранилище", "Максимальный объём сохранённых материалов в байтах."),
    "limit.scene_renders.month": reference("Scene renders per month", "Monthly allowance for scene render operations.", "Рендеры сцен в месяц", "Месячный лимит операций рендера сцен."),
    "limit.story_exports.month": reference("Story exports per month", "Monthly allowance for complete story exports.", "Экспорты историй в месяц", "Месячный лимит итоговых экспортов историй."),
    "limit.ai.credits.month": reference("AI credits per month", "Monthly typed AI allowance; zero disables paid AI usage and unlimited removes the numeric ceiling.", "AI-кредиты в месяц", "Месячный типизированный AI-лимит: ноль запрещает платное использование, unlimited снимает числовой предел."),
  },
};

const rules = {
  en: [
    "Roles are reusable bundles of capabilities. Assigning a role allows the capabilities listed inside it.",
    "Cohort membership has no implicit power: only assignments explicitly attached to that cohort take effect.",
    "A personal override is more specific than a cohort or plan. At the same level, deny wins over allow.",
    "For limits, add increases the current value; replace sets a new value. unlimited is a distinct value, not a large number.",
    "Start and expiry windows apply at evaluation time. An operational switch can still deny a capability globally.",
  ],
  ru: [
    "Роль — переиспользуемый набор прав. Назначение роли выдаёт перечисленные внутри неё capabilities.",
    "Membership в когорте ничего не выдаёт автоматически: действуют только назначения, явно привязанные к этой когорте.",
    "Персональное переопределение приоритетнее когорты и тарифа. На одном уровне deny сильнее allow.",
    "Для лимитов add увеличивает текущее значение, replace задаёт новое. unlimited — отдельное значение, а не большое число.",
    "Начало и срок действия проверяются во время вычисления. Глобальный operational switch всё равно может запретить право.",
  ],
} as const;

export function getAccessReference(kind: AccessReferenceKind, code: string, locale: string): AccessReferenceText {
  const language: AccessReferenceLocale = locale === "ru" ? "ru" : "en";
  const localized = references[kind][code]?.[language];
  if (localized) return { ...localized, documented: true };
  return {
    name: language === "ru" ? "Описание ещё не добавлено" : "Description not added yet",
    description: language === "ru"
      ? "Код уже есть в серверном каталоге, но его назначение нужно документировать перед использованием."
      : "The code exists in the server catalog, but its purpose must be documented before use.",
    documented: false,
  };
}

export function getAccessRules(locale: string): readonly string[] {
  return locale === "ru" ? rules.ru : rules.en;
}

export function accessReferenceCodes(kind: AccessReferenceKind): readonly string[] {
  return Object.keys(references[kind]);
}

function reference(enName: string, enDescription: string, ruName: string, ruDescription: string): LocalizedReference {
  return { en: { name: enName, description: enDescription }, ru: { name: ruName, description: ruDescription } };
}
