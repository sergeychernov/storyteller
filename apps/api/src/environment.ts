import { loadEnvFile } from "node:process";

const rootEnvFiles = [
  new URL("../../../.env", import.meta.url),
  new URL("../../../.env.local", import.meta.url),
] as const;

export function loadLocalEnvironment(): void {
  for (const envFile of rootEnvFiles) {
    try {
      loadEnvFile(envFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  inheritBrowserSafeAnalyticsConfiguration();
}

/** The Amplitude project key is browser-safe and both sides of the local relay must use the same value. */
export function inheritBrowserSafeAnalyticsConfiguration(environment: NodeJS.ProcessEnv = process.env): void {
  if (!environment.AMPLITUDE_API_KEY?.trim() && environment.VITE_AMPLITUDE_API_KEY?.trim()) {
    environment.AMPLITUDE_API_KEY = environment.VITE_AMPLITUDE_API_KEY.trim();
  }
  if (!environment.AMPLITUDE_SERVER_ZONE?.trim() && environment.VITE_AMPLITUDE_SERVER_ZONE?.trim()) {
    environment.AMPLITUDE_SERVER_ZONE = environment.VITE_AMPLITUDE_SERVER_ZONE.trim();
  }
}
