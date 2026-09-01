import { ApiError, createBrowserApiClient } from "@storyteller/api-client";
import { createAuthClient, type AuthSession } from "@storyteller/auth-client";
import type { DataProvider, GetListParams, GetManyReferenceParams, GetOneParams, RaRecord } from "react-admin";
import type {
  AdminAccessApplyResult, AdminAccessOperation, AdminAccessPreview, AdminPage,
} from "@storyteller/schemas";
import type { AuthProvider } from "react-admin";
import { i18nProvider } from "./i18n.js";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const siteUrl = import.meta.env.VITE_SITE_URL ?? (import.meta.env.DEV ? "http://localhost:3000" : "https://makeitastory.app");
const api = createBrowserApiClient(apiUrl);
const authClient = createAuthClient(apiUrl);

interface AdminIdentityResponse {
  readonly profile: AuthSession["profile"];
  readonly capabilities: readonly string[];
}

let currentSession: AuthSession | undefined;
let currentIdentity: AdminIdentityResponse | undefined;
let accessDenied = false;
const signInUrl = `${siteUrl.replace(/\/+$/, "")}/sign-in?continue=admin`;

export const authProvider: AuthProvider = {
  login: async () => {
    window.location.assign(signInUrl);
  },
  logout: async () => {
    const denied = accessDenied;
    const csrfToken = currentSession?.csrfToken;
    currentSession = undefined;
    currentIdentity = undefined;
    if (!denied && csrfToken) await authClient.logout(csrfToken);
    return denied ? "/login" : signInUrl;
  },
  checkAuth: async () => {
    try { await ensureIdentity(); }
    catch (error) {
      if (error instanceof ApiError && error.status === 403) accessDenied = true;
      if (error instanceof ApiError && error.status === 401) accessDenied = false;
      throw error;
    }
  },
  checkError: async (error) => {
    if (error instanceof ApiError && error.status === 401) {
      currentSession = undefined;
      currentIdentity = undefined;
      throw error;
    }
    if (error instanceof ApiError && error.status === 403) throw { ...error, logoutUser: false };
  },
  getIdentity: async () => {
    const identity = await ensureIdentity();
    return { id: identity.profile.id, fullName: identity.profile.name };
  },
  getPermissions: async () => (await ensureIdentity()).capabilities,
  canAccess: async ({ action, resource }) => {
    const identity = await ensureIdentity();
    if (!resource) return true;
    return requiredCapabilitiesFor(resource, action).every((capability) => identity.capabilities.includes(capability));
  },
};

export const dataProvider: DataProvider = {
  getList: getAdminList,
  getOne: async <RecordType extends RaRecord = RaRecord>(resource: string, params: GetOneParams<RecordType>) => {
    await ensureIdentity();
    if (resource === "users") return { data: await api.json<RecordType>(`/admin/users/${encodeURIComponent(String(params.id))}`) };
    if (resource === "access") return { data: { id: params.id, ...await api.json<object>(`/admin/users/${encodeURIComponent(String(params.id))}/access`) } as RecordType };
    if (resource === "accessManagement") return { data: await api.json<RecordType>(`/admin/users/${encodeURIComponent(String(params.id))}/access-management`) };
    if (resource === "overview") return { data: { id: "overview", ...await api.json<object>("/admin/overview") } as RecordType };
    throw new Error(`Unsupported read-only resource: ${resource}`);
  },
  getMany: readOnlyReject,
  getManyReference: async <RecordType extends RaRecord = RaRecord>(resource: string, params: GetManyReferenceParams) => {
    if ((resource !== "activity" && resource !== "sessions") || params.target !== "profileId") {
      throw new Error(`Unsupported read-only relation: ${resource}.${params.target}`);
    }
    return getAdminList<RecordType>(resource, {
      pagination: params.pagination,
      sort: params.sort,
      filter: { ...(params.filter as Record<string, unknown>), [params.target]: String(params.id) },
      ...(params.signal ? { signal: params.signal } : {}),
    });
  },
  create: readOnlyReject,
  update: readOnlyReject,
  updateMany: readOnlyReject,
  delete: readOnlyReject,
  deleteMany: readOnlyReject,
};

async function getAdminList<RecordType extends RaRecord = RaRecord>(resource: string, params: GetListParams) {
  await ensureIdentity();
  if (resource === "users") {
    const response = await requestPage<RecordType>("/admin/users/search", params, {
      method: "POST", body: JSON.stringify({
        page: params.pagination?.page ?? 1, perPage: params.pagination?.perPage ?? 25,
        sort: normalizeUserSort(params.sort?.field), order: params.sort?.order ?? "DESC",
        ...((params.filter as { q?: string }).q ? { query: (params.filter as { q: string }).q } : {}),
      }),
    });
    return { data: [...response.data], total: response.total };
  }
  if (resource === "activity") {
    const profileId = stringFilter(params, "profileId");
    const query = pageQuery(params, ["code", "from", "to"]);
    return listResult(await api.json<AdminPage<RecordType>>(
      profileId ? `/admin/users/${encodeURIComponent(profileId)}/activity?${query}` : `/admin/activity?${query}`,
    ));
  }
  if (resource === "sessions") {
    const profileId = requiredStringFilter(params, "profileId");
    return listResult(await api.json<AdminPage<RecordType>>(`/admin/users/${encodeURIComponent(profileId)}/sessions?${pageQuery(params)}`));
  }
  if (resource === "audit") return listResult(await api.json<AdminPage<RecordType>>(`/admin/audit?${pageQuery(params, ["action"])}`));
  const catalogPath = ({
    accessCapabilities: "/admin/access/capabilities",
    accessLimits: "/admin/access/limits",
    accessRoles: "/admin/access/roles",
    accessCohorts: "/admin/access/cohorts",
  } as const)[resource as "accessCapabilities"];
  if (catalogPath) return listResult(await api.json<AdminPage<RecordType>>(catalogPath));
  throw new Error(`Unsupported read-only resource: ${resource}`);
}

export async function previewAccessChange(
  profileIds: readonly string[],
  operation: AdminAccessOperation,
  reason: string,
): Promise<AdminAccessPreview> {
  return mutation<AdminAccessPreview>("/admin/access/previews", {
    method: "POST", body: JSON.stringify({ profileIds, operation, reason }),
  });
}

export async function applyAccessPreview(previewId: string, confirmation?: string): Promise<AdminAccessApplyResult> {
  return mutation<AdminAccessApplyResult>(`/admin/access/previews/${encodeURIComponent(previewId)}/apply`, {
    method: "POST", body: JSON.stringify(confirmation ? { confirmation } : {}),
  });
}

export async function revokeAdminSession(profileId: string, sessionId: string, reason: string): Promise<void> {
  await mutation(`/admin/users/${encodeURIComponent(profileId)}/sessions/${encodeURIComponent(sessionId)}/revoke`, {
    method: "POST", body: JSON.stringify({ reason }),
  });
}

async function mutation<T>(path: string, init: RequestInit): Promise<T> {
  const session = currentSession ?? await authClient.getSession();
  currentSession = session;
  return api.json<T>(path, init, session.csrfToken);
}

async function ensureIdentity(): Promise<AdminIdentityResponse> {
  if (currentSession && currentIdentity) return currentIdentity;
  currentSession = await authClient.getSession();
  currentIdentity = await api.json<AdminIdentityResponse>("/admin/me", { cache: "no-store" });
  accessDenied = false;
  await i18nProvider.changeLocale(currentIdentity.profile.language === "ru" ? "ru" : "en");
  return currentIdentity;
}

async function requestPage<T extends RaRecord>(path: string, params: GetListParams, init: RequestInit): Promise<AdminPage<T>> {
  const session = currentSession ?? await authClient.getSession();
  currentSession = session;
  return api.json(path, init, session.csrfToken);
}

function pageQuery(params: GetListParams, filters: readonly string[] = []): string {
  const query = new URLSearchParams({ page: String(params.pagination?.page ?? 1), perPage: String(params.pagination?.perPage ?? 25) });
  for (const key of filters) {
    const value = (params.filter as Record<string, unknown>)[key];
    if (typeof value === "string" && value) query.set(key, value);
  }
  return query.toString();
}

function stringFilter(params: GetListParams, key: string): string | undefined {
  const value = (params.filter as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : undefined;
}

function requiredStringFilter(params: GetListParams, key: string): string {
  const value = stringFilter(params, key);
  if (!value) throw new Error(`${key} filter is required`);
  return value;
}

function normalizeUserSort(field: string | undefined): string {
  return ["createdAt", "email", "lastSeenAt", "storyCount"].includes(field ?? "") ? field! : "createdAt";
}

function listResult<T extends RaRecord>(response: AdminPage<T>) {
  return { data: [...response.data], total: response.total };
}

function readOnlyReject(..._arguments: unknown[]): Promise<never> {
  return Promise.reject(new Error("The Admin data provider is read-only"));
}

export function requiredCapabilitiesFor(resource: string, action: string): readonly string[] {
  if (resource === "users") return [action === "list" ? "admin.users.list" : "admin.users.read"];
  if (resource === "activity") return ["admin.users.activity.read"];
  if (resource === "sessions") return ["admin.sessions.metadata.read"];
  if (resource === "access") return ["admin.access.explain"];
  if (resource === "accessManagement") return ["admin.access.explain"];
  if (resource === "accessCapabilities") return ["admin.permissions.read"];
  if (resource === "accessLimits") return ["admin.permissions.read"];
  if (resource === "accessRoles") return ["admin.roles.read"];
  if (resource === "accessCohorts") return ["admin.cohorts.read"];
  if (resource === "accessReference") return [
    "admin.access.explain", "admin.permissions.read", "admin.roles.read", "admin.cohorts.read",
  ];
  if (resource === "audit") return ["admin.audit.read"];
  return [];
}

export function resetProviderStateForTest(): void {
  currentSession = undefined;
  currentIdentity = undefined;
  accessDenied = false;
}

export function wasAccessDenied(): boolean { return accessDenied; }
