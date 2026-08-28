import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPublicRoadmap } from "./public-roadmap.mjs";

const moduleId = "virtual:product-roadmap";
const resolvedId = `\0${moduleId}`;
const defaultPath = fileURLToPath(new URL("../docs/product-roadmap.md", import.meta.url));

export function publicRoadmapPlugin(roadmapPath = defaultPath) {
  return {
    name: "vite-plugin-public-roadmap",
    resolveId(id) {
      if (id === moduleId) return resolvedId;
    },
    async load(id) {
      if (id !== resolvedId) return;
      this.addWatchFile(roadmapPath);
      const source = await readFile(roadmapPath, "utf8");
      return `export default ${JSON.stringify(createPublicRoadmap(source))};`;
    },
    hotUpdate({ file }) {
      if (file !== roadmapPath) return;
      const graph = this.environment.moduleGraph;
      const module = graph.getModuleById(resolvedId);
      if (module) graph.invalidateModule(module);
      this.environment.hot.send({ type: "full-reload" });
      return [];
    },
  };
}
