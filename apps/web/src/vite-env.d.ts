/// <reference types="vite/client" />

declare module "virtual:product-roadmap" {
  const roadmap: import("./components/roadmap/roadmap-types.js").PublicRoadmap;
  export default roadmap;
}
