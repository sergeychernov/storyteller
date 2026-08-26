import { loadEnvFile } from "node:process";

const rootEnvFile = new URL("../../../.env", import.meta.url);

export function loadLocalEnvironment(): void {
  try {
    loadEnvFile(rootEnvFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
