import type { Story } from "../../api.js";

export interface SceneDeletionTarget {
  readonly sceneId: string;
  readonly name: string;
  readonly story: Story;
}

export interface SceneDeletionResult {
  readonly status: "deleted" | "changed" | "blocked" | "failed" | "unverified";
  readonly story?: Story;
}

export async function deleteSceneWithRecovery(target: SceneDeletionTarget, transport: {
  readonly remove: (sceneId: string, revision: number) => Promise<Story>;
  readonly read: () => Promise<Story>;
}, checkOnly = false): Promise<SceneDeletionResult> {
  if (!checkOnly) {
    try {
      return { status: "deleted", story: await transport.remove(target.sceneId, target.story.revision) };
    } catch {
      // A lost response can follow a successful commit. Read before permitting another DELETE.
    }
  }
  try {
    const story = await transport.read();
    if (!story.scenes.some(({ id }) => id === target.sceneId)) return { status: "deleted", story };
    if (story.status !== "draft" && story.status !== "ready") return { status: "blocked", story };
    if (story.revision !== target.story.revision) return { status: "changed", story };
    return { status: "failed", story };
  } catch {
    return { status: "unverified" };
  }
}

export function selectSceneAfterDeletion(before: Story, after: Story, selectedId: string, deletedId: string): string {
  const remaining = new Set(after.scenes.map(({ id }) => id));
  if (remaining.has(selectedId)) return selectedId;
  const index = before.scenes.findIndex(({ id }) => id === deletedId);
  const neighbors = [...before.scenes.slice(index + 1), ...before.scenes.slice(0, Math.max(0, index)).reverse()];
  return neighbors.find(({ id }) => remaining.has(id))?.id ?? after.scenes[0]?.id ?? "";
}

export function resolveSceneSelection(story: Story | undefined, previous: Story | undefined, sceneId: string | undefined): string {
  if (!story) return "";
  if (sceneId && story.scenes.some(({ id }) => id === sceneId)) return sceneId;
  if (sceneId && previous?.id === story.id && previous.scenes.some(({ id }) => id === sceneId)) {
    return selectSceneAfterDeletion(previous, story, sceneId, sceneId);
  }
  return story.scenes[0]?.id ?? "";
}

export function newestStory(current: Story | undefined, received: Story): Story {
  return current && current.revision > received.revision ? current : received;
}

export function storyEditorPath(storyId: string, sceneId: string): string {
  return sceneId ? `/${storyId}/scenes/${sceneId}` : `/${storyId}`;
}
