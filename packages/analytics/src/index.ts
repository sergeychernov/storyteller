import { createProductAnalytics } from "./core.js";

export type {
  AnalyticsAdapter,
  AnalyticsConfiguration,
  AnalyticsEventMap,
  AnalyticsEventName,
  AnalyticsServerZone,
  AnalyticsSurface,
  CollageBackgroundMode,
  CollageCardOrientation,
  CollageMediaMix,
  CollageRowDirection,
  ExportFailureReason,
  ExportFailureStage,
  ExportMode,
  MaterialKind,
  ProductAnalytics,
  RendererKind,
} from "./core.js";
export { analyticsEventPropertyNames, createProductAnalytics, resolveAnalyticsRelayUrl, resolveAnalyticsServerZone } from "./core.js";

type AmplitudeClient = typeof import("@amplitude/analytics-browser");
let amplitudeClient: Promise<AmplitudeClient> | undefined;

export const analytics = createProductAnalytics({
  initialize: (apiKey, serverZone, relayUrl) => {
    amplitudeClient = import("@amplitude/analytics-browser").then(async (client) => {
      await client.init(apiKey, {
        autocapture: false,
        fetchRemoteConfig: false,
        identityStorage: "localStorage",
        ...(relayUrl ? { serverUrl: relayUrl } : {}),
        serverZone,
        trackingOptions: { ipAddress: false },
      }).promise;
      return client;
    });
  },
  setUserId: (profileId) => runWithAmplitude((client) => client.setUserId(profileId)),
  reset: () => runWithAmplitude((client) => client.reset()),
  track: (eventName, properties) => runWithAmplitude((client) => { client.track(eventName, properties); }),
  flush: () => withAmplitude(async (client) => { await client.flush().promise; }),
});

function runWithAmplitude(action: (client: AmplitudeClient) => void): void {
  void withAmplitude(action).catch(() => undefined);
}

async function withAmplitude(action: (client: AmplitudeClient) => void | Promise<void>): Promise<void> {
  if (!amplitudeClient) return;
  await action(await amplitudeClient);
}
