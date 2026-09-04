import { defineConfig } from "vite";
import { brandAssetsPlugin } from "../../scripts/vite-brand-assets.mjs";
import { publicRoadmapPlugin } from "../../scripts/vite-public-roadmap.mjs";
import { publicSitePlugin } from "../../scripts/vite-public-site.mjs";

export default defineConfig({
  envDir: "../../",
  plugins: [brandAssetsPlugin(), publicRoadmapPlugin(), publicSitePlugin()],
});
