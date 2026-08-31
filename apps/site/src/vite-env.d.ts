/// <reference types="vite/client" />

declare module "virtual:public-site" {
  const publicSite: import("./components/public/public-site-types.js").PublicSiteData;
  export default publicSite;
}
