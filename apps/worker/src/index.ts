// Render, music and publication jobs will be wired here one vertical slice at a time.
export const workerApp = { name: "storyteller-worker" } as const;

console.info(`${workerApp.name} boundary started`);
setInterval(() => undefined, 60_000);
