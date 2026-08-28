import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Story } from "../../api.js";
import { resolveSceneSelection, storyEditorPath } from "./scene-deletion-model.js";

export function useStorySceneSelection(storyId: string, sceneId: string | undefined, story: Story | undefined) {
  const navigate = useNavigate();
  const previous = useRef<Story>(undefined);
  const selectedId = resolveSceneSelection(story, previous.current, sceneId);

  useEffect(() => {
    // Keep the last valid route snapshot while cache updates race with navigation.
    if (story && (!sceneId || story.scenes.some(({ id }) => id === sceneId))) previous.current = story;
  }, [sceneId, story]);

  useEffect(() => {
    if (story && (sceneId ?? "") !== selectedId) navigate(storyEditorPath(storyId, selectedId), { replace: true });
  }, [navigate, sceneId, selectedId, story, storyId]);

  return { selectedId, onSelect: (id: string) => navigate(storyEditorPath(storyId, id), { replace: true }) };
}
