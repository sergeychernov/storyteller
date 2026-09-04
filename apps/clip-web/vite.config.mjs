import { defineConfig } from "vite";
import { brandAssetsPlugin } from "../../scripts/vite-brand-assets.mjs";

export default defineConfig({
  base: "/app/clips/",
  envDir: "../../",
  plugins: [brandAssetsPlugin()],
});
