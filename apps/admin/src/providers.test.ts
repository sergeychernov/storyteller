import { afterEach, describe, expect, it, vi } from "vitest";
import { authProvider, dataProvider, resetProviderStateForTest, wasAccessDenied } from "./providers.js";

describe("admin providers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetProviderStateForTest();
  });

  it("uses cookie credentials and CSRF for the POST-only user search", async () => {
    const requests: { readonly url: string; readonly init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), ...(init ? { init } : {}) });
      if (String(input).endsWith("/auth/browser/session")) return Response.json({
        csrfToken: "csrf-token", expiresAt: "2026-10-01T00:00:00.000Z",
        profile: { id: "4fbb3ca0-88d7-4aa0-a925-eaec3572a420", name: "Admin", email: "admin@example.com", language: "ru" },
      });
      if (String(input).endsWith("/admin/me")) return Response.json({
        profile: { id: "4fbb3ca0-88d7-4aa0-a925-eaec3572a420", name: "Admin", email: "admin@example.com", language: "ru" },
        capabilities: ["admin.console.access", "admin.users.list"],
      });
      return Response.json({ data: [], total: 0, page: 1, perPage: 25 });
    }));

    const result = await dataProvider.getList("users", {
      pagination: { page: 1, perPage: 25 }, sort: { field: "createdAt", order: "DESC" }, filter: { q: "person@" },
    });

    expect(result).toEqual({ data: [], total: 0 });
    const search = requests.at(-1)!;
    expect(search.url).toBe("http://localhost:3001/admin/users/search");
    expect(search.init?.credentials).toBe("include");
    expect(new Headers(search.init?.headers).get("x-csrf-token")).toBe("csrf-token");
    expect(JSON.parse(String(search.init?.body))).toMatchObject({ query: "person@", page: 1, perPage: 25 });
  });

  it("rejects every mutation", async () => {
    await expect(dataProvider.create("users", { data: { id: "new" } })).rejects.toThrow("read-only");
    await expect(dataProvider.update("users", { id: "one", data: {}, previousData: { id: "one" } })).rejects.toThrow("read-only");
    await expect(dataProvider.delete("users", { id: "one", previousData: { id: "one" } })).rejects.toThrow("read-only");
  });

  it.each([
    ["activity", "/admin/users/user%2Fone/activity?page=2&perPage=10"],
    ["sessions", "/admin/users/user%2Fone/sessions?page=2&perPage=10"],
  ])("loads the %s relation without treating the read as a mutation", async (resource, expectedPath) => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/auth/browser/session")) return Response.json({
        csrfToken: "csrf-token", expiresAt: "2026-10-01T00:00:00.000Z",
        profile: { id: "4fbb3ca0-88d7-4aa0-a925-eaec3572a420", name: "Admin", email: "admin@example.com", language: "en" },
      });
      if (url.endsWith("/admin/me")) return Response.json({
        profile: { id: "4fbb3ca0-88d7-4aa0-a925-eaec3572a420", name: "Admin", email: "admin@example.com", language: "en" },
        capabilities: ["admin.console.access", "admin.users.activity.read", "admin.sessions.metadata.read"],
      });
      return Response.json({ data: [{ id: "record-one" }], total: 1, page: 2, perPage: 10 });
    }));

    const result = await dataProvider.getManyReference(resource, {
      target: "profileId", id: "user/one", pagination: { page: 2, perPage: 10 },
      sort: { field: "createdAt", order: "DESC" }, filter: {},
    });

    expect(result).toEqual({ data: [{ id: "record-one" }], total: 1 });
    expect(requests.at(-1)).toBe(`http://localhost:3001${expectedPath}`);
  });

  it("redirects an anonymous session to the main sign-in instead of leaving an empty admin root", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { message: "authentication required", code: "authentication_required" },
      { status: 401 },
    )));

    await expect(authProvider.checkAuth({})).rejects.toMatchObject({ status: 401 });
    await expect(authProvider.logout({})).resolves.toMatch(/\/sign-in\?continue=admin$/);
    expect(wasAccessDenied()).toBe(false);
  });

  it("keeps a valid session on the local access-denied page after an admin 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/auth/browser/session")) return Response.json({
        csrfToken: "csrf-token", expiresAt: "2026-10-01T00:00:00.000Z",
        profile: { id: "4fbb3ca0-88d7-4aa0-a925-eaec3572a420", name: "User", email: "user@example.com", language: "en" },
      });
      return Response.json({ message: "access denied", code: "access_denied" }, { status: 403 });
    }));

    await expect(authProvider.checkAuth({})).rejects.toMatchObject({ status: 403 });
    await expect(authProvider.logout({})).resolves.toBe("/login");
    expect(wasAccessDenied()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
