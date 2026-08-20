const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface Account {
  id: string;
  name: string;
}

export interface StorySummary {
  id: string;
  accountId: string;
  title?: string;
  status: "draft" | "rendering" | "ready" | "publishing" | "published";
  sceneCount: number;
  revision: number;
}

export async function checkHealth(): Promise<boolean> {
  try {
    return (await fetch(`${apiUrl}/health`)).ok;
  } catch {
    return false;
  }
}

export async function createAccount(name: string): Promise<Account> {
  return request("/accounts", { method: "POST", body: JSON.stringify({ name }) });
}

export async function createStory(accountId: string, title: string): Promise<StorySummary> {
  return request(`/accounts/${accountId}/stories`, { method: "POST", body: JSON.stringify({ title }) });
}

export async function listStories(accountId: string): Promise<StorySummary[]> {
  return request(`/accounts/${accountId}/stories`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
    throw new Error(body.message ?? "Request failed");
  }
  return response.json() as Promise<T>;
}
