import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { LanguageSwitcher, LocalizationProvider, useLocalization } from "@storyteller/web-ui";

function CurrentMessage() {
  const { t } = useLocalization();
  return <p>{t("common.error")}</p>;
}

function InvalidDestinationSwitcher() {
  // @ts-expect-error Localized destinations must always delegate to the application's router.
  return <LanguageSwitcher destinations={{ ru: "/ru" }} />;
}

function renderLocalization(onLocaleChange?: (locale: "en" | "ru" | "sr-Latn" | "es") => Promise<void>) {
  return render(
    <MemoryRouter>
      <LocalizationProvider>
        <LanguageSwitcher onLocaleChange={onLocaleChange} />
        <CurrentMessage />
      </LocalizationProvider>
    </MemoryRouter>,
  );
}

describe("web localization", () => {
  test("delegates localized destinations to the application router", async () => {
    localStorage.setItem("storyteller.locale", "en");
    const navigate = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LocalizationProvider>
          <LanguageSwitcher destinations={{ ru: "/ru" }} onNavigate={navigate} />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "ru");

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/ru");
  });

  test("restores the locale and persists a confirmed change", async () => {
    localStorage.setItem("storyteller.locale", "ru");
    const save = vi.fn(async () => undefined);
    const user = userEvent.setup();

    renderLocalization(save);

    const select = screen.getByRole("combobox", { name: "Язык" });
    expect(select).toHaveProperty("value", "ru");
    expect(document.documentElement.lang).toBe("ru");
    expect(screen.getByText("Что-то пошло не так. Попробуйте ещё раз.")).toBeTruthy();

    await user.selectOptions(select, "es");

    await waitFor(() => expect(save).toHaveBeenCalledWith("es"));
    expect(localStorage.getItem("storyteller.locale")).toBe("es");
    expect(document.documentElement.lang).toBe("es");
    expect(screen.getByText("Algo salió mal. Inténtalo de nuevo.")).toBeTruthy();
  });

  test("keeps the current locale and reports a failed profile update", async () => {
    localStorage.setItem("storyteller.locale", "en");
    const user = userEvent.setup();
    renderLocalization(async () => { throw new Error("offline"); });

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "ru");

    expect((await screen.findByRole("alert")).textContent).toContain("Could not save the language");
    expect(localStorage.getItem("storyteller.locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
