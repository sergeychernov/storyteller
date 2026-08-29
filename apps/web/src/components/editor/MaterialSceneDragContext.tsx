import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";

interface MaterialSceneDragState {
  readonly sourceSceneId: string;
  readonly materialId: string;
  readonly targetSceneId?: string;
}

interface MaterialSceneDragContextValue {
  readonly state: MaterialSceneDragState | undefined;
  readonly begin: (sourceSceneId: string, materialId: string) => void;
  readonly hover: (targetSceneId: string | undefined) => void;
  readonly end: () => void;
}

const noOp = () => undefined;
const MaterialSceneDragContext = createContext<MaterialSceneDragContextValue>({
  state: undefined, begin: noOp, hover: noOp, end: noOp,
});

export function MaterialSceneDragProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<MaterialSceneDragState>();
  const begin = useCallback((sourceSceneId: string, materialId: string) => setState({ sourceSceneId, materialId }), []);
  const hover = useCallback((targetSceneId: string | undefined) => setState((current) => {
    if (!current || current.targetSceneId === targetSceneId) return current;
    return targetSceneId ? { ...current, targetSceneId } : { sourceSceneId: current.sourceSceneId, materialId: current.materialId };
  }), []);
  const end = useCallback(() => setState(undefined), []);
  const value = useMemo(() => ({ state, begin, hover, end }), [state, begin, hover, end]);
  return <MaterialSceneDragContext.Provider value={value}>{children}</MaterialSceneDragContext.Provider>;
}

export function useMaterialSceneDrag(): MaterialSceneDragContextValue {
  return useContext(MaterialSceneDragContext);
}
