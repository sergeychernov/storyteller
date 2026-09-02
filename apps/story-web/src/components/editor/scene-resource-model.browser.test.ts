import { describe, expect, it } from "vitest";
import {
  aggregateSceneResources, createSceneResourceRegistry, updateSceneResourceRegistry,
} from "./scene-resource-model.js";

describe("scene resource registry", () => {
  it("does not recover a scene until every individually waiting resource is ready", () => {
    let registry = createSceneResourceRegistry(["video-a", "video-b"]);
    registry = updateSceneResourceRegistry(registry, { resourceId: "video-a", state: "ready" });
    registry = updateSceneResourceRegistry(registry, { resourceId: "video-b", state: "ready" });
    expect(aggregateSceneResources(registry)).toBe("ready");

    registry = updateSceneResourceRegistry(registry, { resourceId: "video-a", state: "waiting" });
    registry = updateSceneResourceRegistry(registry, { resourceId: "video-b", state: "waiting" });
    registry = updateSceneResourceRegistry(registry, { resourceId: "video-a", state: "ready" });
    expect(aggregateSceneResources(registry)).toBe("waiting");

    registry = updateSceneResourceRegistry(registry, { resourceId: "video-b", state: "ready" });
    expect(aggregateSceneResources(registry)).toBe("ready");
  });

  it("keeps failure dominant and ignores events from unregistered resources", () => {
    let registry = createSceneResourceRegistry(["video"]);
    const unchanged = updateSceneResourceRegistry(registry, { resourceId: "stale", state: "ready" });
    expect(unchanged).toBe(registry);
    registry = updateSceneResourceRegistry(registry, { resourceId: "video", state: "failed" });
    expect(aggregateSceneResources(registry)).toBe("failed");
  });
});
