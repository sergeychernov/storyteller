export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export interface ApiClient {
  readonly json: <T>(path: string, init?: RequestInit, token?: string) => Promise<T>;
  readonly blob: (path: string, init?: RequestInit, token?: string) => Promise<Blob>;
}

export function createApiClient(apiUrl: string, fetchRequest?: typeof fetch): ApiClient {
  const baseUrl = apiUrl.replace(/\/+$/, "");

  async function request(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
    const headers = new Headers(init.headers);
    const hasJsonBody = init.body !== undefined && init.body !== null && !(init.body instanceof FormData);
    if (hasJsonBody && !headers.has("content-type")) headers.set("content-type", "application/json");
    if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
    const response = await (fetchRequest ?? fetch)(`${baseUrl}${path}`, { ...init, headers });
    if (!response.ok) await throwResponseError(response);
    return response;
  }

  return {
    json: async <T>(path: string, init?: RequestInit, token?: string): Promise<T> => (
      (await request(path, init, token)).json() as Promise<T>
    ),
    blob: async (path, init, token) => (await request(path, init, token)).blob(),
  };
}

async function throwResponseError(response: Response): Promise<never> {
  const body = await response.json().catch(() => ({ message: response.statusText })) as { message?: string; code?: string };
  throw new ApiError(body.message ?? "Request failed", response.status, body.code);
}
