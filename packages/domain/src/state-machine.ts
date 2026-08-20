import { DomainError } from "./errors.js";
import type { Story, StoryStatus } from "./model.js";

const allowedTransitions: Readonly<Record<StoryStatus, readonly StoryStatus[]>> = {
  draft: ["rendering"],
  rendering: ["draft", "ready"],
  ready: ["draft", "publishing"],
  publishing: ["ready", "published"],
  published: [],
};

export function transitionStory(story: Story, target: StoryStatus): Story {
  if (target === story.status) return story;
  if (!allowedTransitions[story.status].includes(target)) {
    throw new DomainError(`invalid story transition: ${story.status} -> ${target}`);
  }
  if (target === "rendering") {
    if (story.scenes.length === 0) throw new DomainError("a story needs at least one scene before rendering");
    if (story.scenes.some((scene) => scene.materials.length === 0 || !scene.rendererId)) {
      throw new DomainError("every scene needs material and a renderer before rendering");
    }
  }
  return { ...story, status: target };
}
