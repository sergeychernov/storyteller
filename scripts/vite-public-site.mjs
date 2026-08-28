import { createPublicSite } from "./public-site.mjs";

const moduleId = "virtual:public-site";
const resolvedModuleId = `\0${moduleId}`;

export function publicSitePlugin() {
  return {
    name: "storyteller-public-site",
    resolveId(id) {
      return id === moduleId ? resolvedModuleId : undefined;
    },
    load(id) {
      return id === resolvedModuleId ? `export default ${JSON.stringify(createPublicSite())};` : undefined;
    },
  };
}
