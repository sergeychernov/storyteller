import polyglotI18nProvider from "ra-i18n-polyglot";
import englishMessages from "ra-language-english";
import { mergeTranslations } from "react-admin";

const productEnglish = {
  resources: {
    users: { name: "Users", fields: { name: "Name", email: "Email", language: "Language", createdAt: "Registered", lastSeenAt: "Last seen", storyCount: "Stories", activeSessionCount: "Active sessions" } },
    activity: { name: "Activity", fields: { profileId: "Profile UUID", code: "Event", occurredAt: "Occurred" } },
    audit: { name: "Audit", fields: { actorProfileId: "Actor UUID", action: "Action", targetType: "Target type", targetProfileId: "Target UUID", occurredAt: "Occurred", source: "Source" } },
  },
  admin: {
    dashboard: "Dashboard", overview: "Overview", activity: "Activity", sessions: "Sessions", access: "Effective access",
    registrations: "Registrations", today: "Today (UTC)", sevenDays: "7 days", thirtyDays: "30 days", total: "Total",
    activeSessions: "Active sessions", observedSessions: "Sessions observed in 90 days", stories: "Stories by status",
    eventCoverage: "Event coverage starts", noEvents: "No activity events have been recorded yet.", denied: "Access denied",
  },
};

const russianMessages = mergeTranslations(englishMessages, productEnglish, {
  ra: {
    action: { show: "Открыть", list: "Список", search: "Поиск", refresh: "Обновить", sort: "Сортировка", logout: "Выйти", back: "Назад", expand: "Развернуть", close: "Закрыть" },
    navigation: { page_rows_per_page: "Строк на странице:", page_range_info: "%{offsetBegin}–%{offsetEnd} из %{total}", no_results: "Нет данных", no_more_results: "Больше данных нет", page_out_of_boundaries: "Страница вне диапазона", page_out_from_end: "Нельзя перейти дальше последней страницы" },
    message: { loading: "Загрузка", error: "Произошла ошибка", invalid_form: "Проверьте введённые данные", not_found: "Не найдено" },
  },
  resources: {
    users: { name: "Пользователи", fields: { name: "Имя", email: "Email", language: "Язык", createdAt: "Регистрация", lastSeenAt: "Последняя активность", storyCount: "Истории", activeSessionCount: "Активные сессии" } },
    activity: { name: "Активность", fields: { profileId: "UUID профиля", code: "Событие", occurredAt: "Время" } },
    audit: { name: "Аудит", fields: { actorProfileId: "UUID сотрудника", action: "Действие", targetType: "Тип цели", targetProfileId: "UUID цели", occurredAt: "Время", source: "Источник" } },
  },
  admin: {
    dashboard: "Обзор", overview: "Основное", activity: "Активность", sessions: "Сессии", access: "Эффективный доступ",
    registrations: "Регистрации", today: "Сегодня (UTC)", sevenDays: "7 дней", thirtyDays: "30 дней", total: "Всего",
    activeSessions: "Активные сессии", observedSessions: "Сессии за 90 дней", stories: "Истории по статусам",
    eventCoverage: "События покрывают период с", noEvents: "События активности ещё не зафиксированы.", denied: "Доступ запрещён",
  },
});

export const i18nProvider = polyglotI18nProvider(
  (locale) => locale === "ru" ? russianMessages : mergeTranslations(englishMessages, productEnglish),
  typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en",
  [{ locale: "en", name: "English" }, { locale: "ru", name: "Русский" }],
  { allowMissing: true },
);
