import { getSceneDurationSeconds, sceneTitleMinimumDurationSeconds } from "@storyteller/domain";
import type { SceneTitleChangeKind } from "@storyteller/analytics";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Scene, SceneTitle } from "../../api.js";

export interface SceneTitleEditorController {
  readonly title: SceneTitle | undefined;
  readonly canAdd: boolean;
  readonly saving: boolean;
  readonly add: () => void;
  readonly remove: () => Promise<void>;
  readonly preview: (title: SceneTitle | undefined) => void;
  readonly save: (title: SceneTitle, kind: Exclude<SceneTitleChangeKind, "added" | "removed">) => Promise<void>;
  readonly saveText: () => Promise<void>;
}

export function useSceneTitleEditor(
  scene: Scene,
  saving: boolean,
  onSave: (title: SceneTitle | null, kind: SceneTitleChangeKind) => Promise<void>,
): SceneTitleEditorController {
  const [title, setTitle] = useState<SceneTitle | undefined>(scene.title);
  const [localSaving, setLocalSaving] = useState(false);
  const persisted = useRef<SceneTitle | undefined>(scene.title);
  const sceneId = useRef(scene.id);
  const generation = useRef(0);
  const operation = useRef(0);
  const pendingCount = useRef(0);
  const latestRequested = useRef<{
    readonly generation: number;
    readonly title: SceneTitle | undefined;
    readonly promise: Promise<void>;
  } | undefined>(undefined);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (sceneId.current !== scene.id) {
      sceneId.current = scene.id;
      generation.current += 1;
      persisted.current = scene.title;
      latestRequested.current = undefined;
      pendingCount.current = 0;
      setTitle(scene.title);
      setLocalSaving(false);
      operation.current += 1;
      return;
    }
    persisted.current = scene.title;
    if (pendingCount.current === 0) {
      setTitle((current) => current && !scene.title && current.text === "" ? current : scene.title);
    }
  }, [scene.id, scene.title]);

  const persist = useCallback(async (next: SceneTitle | null, requestedKind: SceneTitleChangeKind) => {
    const requestedTitle = next ?? undefined;
    const currentGeneration = generation.current;
    const duplicate = latestRequested.current;
    if (duplicate?.generation === currentGeneration && sameTitle(duplicate.title, requestedTitle)) {
      await duplicate.promise;
      return;
    }
    if (pendingCount.current === 0 && sameTitle(persisted.current, requestedTitle)) {
      setTitle(requestedTitle);
      return;
    }
    const revision = ++operation.current;
    setTitle(requestedTitle);
    pendingCount.current += 1;
    setLocalSaving(true);
    const pending = queue.current.then(async () => {
      const rollback = persisted.current;
      const kind = requestedKind === "removed" ? "removed" : rollback ? requestedKind : "added";
      try {
        await onSave(next, kind);
        if (generation.current === currentGeneration) persisted.current = requestedTitle;
      } catch (error) {
        if (generation.current === currentGeneration && operation.current === revision) setTitle(rollback);
        throw error;
      }
    });
    latestRequested.current = { generation: currentGeneration, title: requestedTitle, promise: pending };
    queue.current = pending.catch(() => undefined);
    try {
      await pending;
    } catch (error) {
      if (latestRequested.current?.promise === pending) latestRequested.current = undefined;
      throw error;
    } finally {
      if (generation.current === currentGeneration) {
        pendingCount.current = Math.max(0, pendingCount.current - 1);
        if (pendingCount.current === 0) setLocalSaving(false);
      }
    }
  }, [onSave]);

  return {
    title,
    canAdd: scene.materials.length > 0,
    saving: saving || localSaving,
    add() {
      if (!scene.materials.length || title) return;
      const durationSeconds = getSceneDurationSeconds(scene);
      setTitle({
        text: "",
        position: { x: 0.5, y: 0.78 },
        style: "shadow",
        size: "medium",
        color: "#FFFFFF",
        timing: { startSeconds: 0, endSeconds: durationSeconds },
      });
    },
    async remove() {
      if (!title) return;
      if (!persisted.current) {
        setTitle(undefined);
        return;
      }
      await persist(null, "removed");
    },
    preview: setTitle,
    async save(next, kind) {
      if (!next.text.trim()) {
        setTitle(next);
        return;
      }
      await persist(normalizeTiming(next, getSceneDurationSeconds(scene)), kind);
    },
    async saveText() {
      if (!title) return;
      const text = title.text.trim();
      if (!text) {
        if (!persisted.current) setTitle(undefined);
        return;
      }
      await persist({ ...title, text }, "text");
    },
  };
}

function normalizeTiming(title: SceneTitle, durationSeconds: number): SceneTitle {
  const minimum = Math.min(sceneTitleMinimumDurationSeconds, durationSeconds);
  const endSeconds = Math.min(durationSeconds, Math.max(minimum, title.timing.endSeconds));
  const startSeconds = Math.min(Math.max(0, title.timing.startSeconds), Math.max(0, endSeconds - minimum));
  const normalizedEnd = Math.abs(endSeconds - durationSeconds) < 1e-6 ? precise(durationSeconds) : tenth(endSeconds);
  let normalizedStart = tenth(startSeconds);
  if (normalizedEnd - normalizedStart + 1e-6 < minimum) normalizedStart = precise(Math.max(0, normalizedEnd - minimum));
  return { ...title, timing: { startSeconds: normalizedStart, endSeconds: normalizedEnd } };
}

function tenth(value: number): number { return Math.round(value * 10) / 10; }
function precise(value: number): number { return Number(value.toFixed(6)); }

function sameTitle(left: SceneTitle | undefined, right: SceneTitle | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
