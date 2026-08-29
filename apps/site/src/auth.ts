import { createAuthClient } from "@storyteller/auth-client";

export const authClient = createAuthClient(import.meta.env.VITE_API_URL ?? "http://localhost:3001");
