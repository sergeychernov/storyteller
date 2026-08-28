/// <reference types="vite/client" />

declare module "virtual:product-roadmap" {
  const roadmap: import("./components/roadmap/roadmap-types.js").PublicRoadmap;
  export default roadmap;
}

declare module "virtual:public-site" {
  const publicSite: import("./components/public/public-site-types.js").PublicSiteData;
  export default publicSite;
}
