// MCP will call the same application services as HTTP; it will not own workflow state.
export const mcpApp = { name: "storyteller-mcp" } as const;

console.info(`${mcpApp.name} boundary started`);
setInterval(() => undefined, 60_000);
