// HTTP transport will be added after persistence and command handlers are chosen.
export const apiApp = { name: "storyteller-api" } as const;

console.info(`${apiApp.name} boundary started`);
setInterval(() => undefined, 60_000);
