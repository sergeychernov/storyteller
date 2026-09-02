export type SceneResourceState = "ready" | "waiting" | "failed";

export interface SceneResourceEvent {
  readonly resourceId: string;
  readonly state: SceneResourceState;
}

export type SceneResourceAggregate = "loading" | SceneResourceState;

export interface SceneResourceRegistry {
  readonly states: Readonly<Record<string, "loading" | SceneResourceState>>;
}

export function createSceneResourceRegistry(resourceIds: readonly string[]): SceneResourceRegistry {
  return { states: Object.fromEntries(resourceIds.map((id) => [id, "loading"])) };
}

export function updateSceneResourceRegistry(
  registry: SceneResourceRegistry,
  event: SceneResourceEvent,
): SceneResourceRegistry {
  if (!(event.resourceId in registry.states) || registry.states[event.resourceId] === event.state) return registry;
  return { states: { ...registry.states, [event.resourceId]: event.state } };
}

export function aggregateSceneResources(registry: SceneResourceRegistry): SceneResourceAggregate {
  const states = Object.values(registry.states);
  if (states.some((state) => state === "failed")) return "failed";
  if (states.some((state) => state === "waiting")) return "waiting";
  if (states.some((state) => state === "loading")) return "loading";
  return "ready";
}
