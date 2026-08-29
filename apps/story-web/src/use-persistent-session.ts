import { createAuthClient, usePersistentSession as useSharedPersistentSession } from "@storyteller/auth-client";
import { apiUrl } from "./api.js";

const authClient = createAuthClient(apiUrl);

export function usePersistentSession() {
  return useSharedPersistentSession(authClient);
}
