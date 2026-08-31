import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocalizationProvider } from "@storyteller/web-ui";
import type { Preview } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import "@storyteller/web-ui/global.css";
import "./storybook.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

installStorybookMediaFixtures();

const preview: Preview = {
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <LocalizationProvider>
          <MemoryRouter>
            <Story />
          </MemoryRouter>
        </LocalizationProvider>
      </QueryClientProvider>
    ),
  ],
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: { expanded: true },
    layout: "centered",
  },
};

export default preview;

function installStorybookMediaFixtures(): void {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(requestUrl, globalThis.location.href);
    const match = /^\/stories\/storybook\/materials\/([^/]+)\/content-access$/u.exec(url.pathname);
    if (!match?.[1]) return originalFetch(input, init);
    return Promise.resolve(new Response(JSON.stringify({ url: materialDataUrl(match[1]) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  };
}

function materialDataUrl(id: string): string {
  const portrait = id.startsWith("portrait");
  const index = Number(id.match(/\d+/u)?.[0] ?? 1) - 1;
  const palettes = [
    ["#25362f", "#8fac72", "#e6c69a"],
    ["#4a302c", "#c68167", "#efd5aa"],
    ["#23394b", "#6b9db1", "#dfb877"],
    ["#41314d", "#a07db1", "#e2c898"],
    ["#3d4227", "#a5ad5e", "#e5ae79"],
    ["#283d3d", "#6aa2a1", "#e7c2a2"],
  ] as const;
  const palette = palettes[index % palettes.length] ?? palettes[0];
  const [dark, middle, light] = palette;
  const width = portrait ? 900 : 1600;
  const height = portrait ? 1600 : 900;
  const label = id.replaceAll("-", " ").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${dark}"/><stop offset=".58" stop-color="${middle}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width * 0.72}" cy="${height * 0.3}" r="${Math.min(width, height) * 0.2}" fill="#fff" opacity=".24"/>
    <path d="M0 ${height * 0.78} Q ${width * 0.25} ${height * 0.52} ${width * 0.5} ${height * 0.78} T ${width} ${height * 0.7} V ${height} H0Z" fill="${dark}" opacity=".72"/>
    <text x="${width * 0.07}" y="${height * 0.9}" fill="#fff" font-family="system-ui,sans-serif" font-size="${Math.min(width, height) * 0.07}" font-weight="700" letter-spacing="4">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
