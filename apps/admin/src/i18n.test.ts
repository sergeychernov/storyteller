import { afterEach, describe, expect, it } from "vitest";
import { i18nProvider } from "./i18n.js";

describe("admin i18n provider", () => {
  afterEach(async () => {
    await i18nProvider.changeLocale("en");
  });

  it("fully localizes filtered and unfiltered empty states in Russian", async () => {
    await i18nProvider.changeLocale("ru");

    expect(i18nProvider.translate("ra.navigation.no_filtered_results", { name: "Активность" }))
      .toBe("По текущим фильтрам ничего не найдено.");
    expect(i18nProvider.translate("ra.navigation.no_results", { name: "Активность" })).toBe("Нет данных");
    expect(i18nProvider.translate("ra.navigation.clear_filters")).toBe("Сбросить фильтры");
  });
});
