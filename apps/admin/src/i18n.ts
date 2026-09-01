import polyglotI18nProvider from "ra-i18n-polyglot";
import englishMessages from "ra-language-english";
import { mergeTranslations } from "react-admin";

const productEnglish = {
  resources: {
    users: { name: "Users", fields: { name: "Name", email: "Email", language: "Language", createdAt: "Registered", lastSeenAt: "Last seen", storyCount: "Stories", activeSessionCount: "Active sessions" } },
    accessReference: { name: "Access guide" },
    activity: { name: "Activity", fields: { profileId: "Profile UUID", code: "Event", occurredAt: "Occurred" } },
    audit: { name: "Audit", fields: { actorProfileId: "Actor UUID", action: "Action", targetType: "Target type", targetProfileId: "Target UUID", targetEntityId: "Entity", reason: "Reason", batchId: "Batch", change: "Change", occurredAt: "Occurred", source: "Source" } },
    sessions: { fields: { isCurrent: "Current", actions: "Actions" } },
  },
  admin: {
    dashboard: "Dashboard", overview: "Overview", activity: "Activity", sessions: "Sessions", access: "Effective access",
    registrations: "Registrations", today: "Today (UTC)", sevenDays: "7 days", thirtyDays: "30 days", total: "Total",
    activeSessions: "Active sessions", observedSessions: "Sessions observed in 90 days", stories: "Stories by status",
    eventCoverage: "Event coverage starts", noEvents: "No activity events have been recorded yet.", denied: "Access denied",
    accessLoadFailed: "Unable to load access management.", manualAccess: "Manual access", changeAccess: "Change access",
    bulkAccess: "Bulk access", selectedUsers: "%{count} selected users", operation: "Operation", accessCode: "Access code",
    limitValue: "Limit value", unlimitedHint: "Use a non-negative integer or unlimited", startsAt: "Starts at",
    expiresAt: "Expires at", reason: "Reason", preview: "Preview", edit: "Edit", apply: "Apply",
    confirmation: "Type %{value} to confirm", accessApplied: "Access change applied", roles: "Roles", cohorts: "Cohorts",
    capabilityOverrides: "Capability overrides", limitOverrides: "Limit overrides", revoke: "Revoke",
    revokeSession: "Revoke session", sessionRevoked: "Session revoked",
    accessReferenceTitle: "Roles and permissions", accessReferenceIntro: "A read-only guide to every current access code and how effective access is calculated.",
    accessReferenceSearch: "Search by code or purpose", accessReferenceLoadFailed: "Unable to load the access catalogs.",
    accessReferenceNoMatches: "No matching access entries.", accessRules: "How access works", capabilities: "Capabilities",
    limits: "Limits", includedCapabilities: "Included capabilities", archived: "Archived",
    operations: {
      set_role: "Assign or update role", remove_role: "Remove role", set_cohort_membership: "Add or update cohort membership",
      remove_cohort_membership: "Remove cohort membership", set_capability_override: "Set capability override",
      remove_capability_override: "Remove capability override", set_limit_override: "Set limit override",
      remove_limit_override: "Remove limit override",
    },
  },
};

const russianMessages = mergeTranslations(englishMessages, productEnglish, {
  ra: {
    action: { show: "Открыть", list: "Список", search: "Поиск", refresh: "Обновить", sort: "Сортировка", logout: "Выйти", back: "Назад", expand: "Развернуть", close: "Закрыть", cancel: "Отмена" },
    navigation: { page_rows_per_page: "Строк на странице:", page_range_info: "%{offsetBegin}–%{offsetEnd} из %{total}", no_filtered_results: "По текущим фильтрам ничего не найдено.", clear_filters: "Сбросить фильтры", no_results: "Нет данных", no_more_results: "Больше данных нет", page_out_of_boundaries: "Страница вне диапазона", page_out_from_end: "Нельзя перейти дальше последней страницы" },
    message: { loading: "Загрузка", error: "Произошла ошибка", invalid_form: "Проверьте введённые данные", not_found: "Не найдено" },
  },
  resources: {
    users: { name: "Пользователи", fields: { name: "Имя", email: "Email", language: "Язык", createdAt: "Регистрация", lastSeenAt: "Последняя активность", storyCount: "Истории", activeSessionCount: "Активные сессии" } },
    accessReference: { name: "Справочник доступа" },
    activity: { name: "Активность", fields: { profileId: "UUID профиля", code: "Событие", occurredAt: "Время" } },
    audit: { name: "Аудит", fields: { actorProfileId: "UUID сотрудника", action: "Действие", targetType: "Тип цели", targetProfileId: "UUID цели", targetEntityId: "Сущность", reason: "Причина", batchId: "Пакет", change: "Изменение", occurredAt: "Время", source: "Источник" } },
    sessions: { fields: { isCurrent: "Текущая", actions: "Действия" } },
  },
  admin: {
    dashboard: "Обзор", overview: "Основное", activity: "Активность", sessions: "Сессии", access: "Эффективный доступ",
    registrations: "Регистрации", today: "Сегодня (UTC)", sevenDays: "7 дней", thirtyDays: "30 дней", total: "Всего",
    activeSessions: "Активные сессии", observedSessions: "Сессии за 90 дней", stories: "Истории по статусам",
    eventCoverage: "События покрывают период с", noEvents: "События активности ещё не зафиксированы.", denied: "Доступ запрещён",
    accessLoadFailed: "Не удалось загрузить управление доступом.", manualAccess: "Ручной доступ", changeAccess: "Изменить доступ",
    bulkAccess: "Массовый доступ", selectedUsers: "Выбрано пользователей: %{count}", operation: "Операция", accessCode: "Код доступа",
    limitValue: "Значение лимита", unlimitedHint: "Неотрицательное целое число или unlimited", startsAt: "Начало",
    expiresAt: "Окончание", reason: "Причина", preview: "Предпросмотр", edit: "Изменить", apply: "Применить",
    confirmation: "Введите %{value} для подтверждения", accessApplied: "Изменение доступа применено", roles: "Роли", cohorts: "Когорты",
    capabilityOverrides: "Переопределения прав", limitOverrides: "Переопределения лимитов", revoke: "Отозвать",
    revokeSession: "Отозвать сессию", sessionRevoked: "Сессия отозвана",
    accessReferenceTitle: "Роли и права", accessReferenceIntro: "Справочник только для чтения: все текущие коды и правила вычисления эффективного доступа.",
    accessReferenceSearch: "Поиск по коду или назначению", accessReferenceLoadFailed: "Не удалось загрузить каталоги доступа.",
    accessReferenceNoMatches: "Подходящих элементов доступа нет.", accessRules: "Как работает доступ", capabilities: "Права",
    limits: "Лимиты", includedCapabilities: "Включённые права", archived: "Архивный",
    operations: {
      set_role: "Назначить или обновить роль", remove_role: "Снять роль", set_cohort_membership: "Добавить или обновить membership",
      remove_cohort_membership: "Удалить membership", set_capability_override: "Задать allow/deny",
      remove_capability_override: "Удалить allow/deny", set_limit_override: "Задать переопределение лимита",
      remove_limit_override: "Удалить переопределение лимита",
    },
  },
});

export const i18nProvider = polyglotI18nProvider(
  (locale) => locale === "ru" ? russianMessages : mergeTranslations(englishMessages, productEnglish),
  typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en",
  [{ locale: "en", name: "English" }, { locale: "ru", name: "Русский" }],
  { allowMissing: true },
);
