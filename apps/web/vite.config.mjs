import { defineConfig } from "vite";
import { publicRoadmapPlugin } from "../../scripts/vite-public-roadmap.mjs";

export default defineConfig({
  plugins: [publicRoadmapPlugin()],
});
