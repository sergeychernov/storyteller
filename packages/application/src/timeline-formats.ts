import type { TimelineDurationLimit } from "@storyteller/domain";

// Advisory duration profiles for the Web YouTube MVP milestone, not publication eligibility.
// Verified 2026-08-28 against:
// https://support.google.com/youtube/answer/15424877?hl=en (Shorts)
// https://support.google.com/youtube/answer/71673?hl=en (default / verified uploads)
// Account access, dimensions, copyright and the 256 GB size limit belong to F15.
export const timelineDurationLimits: readonly TimelineDurationLimit[] = [
  { formatId: "youtube-shorts", maxDurationSeconds: 180, requiresVerifiedAccount: false },
  { formatId: "youtube-video", maxDurationSeconds: 900, requiresVerifiedAccount: false },
  { formatId: "youtube-video-verified", maxDurationSeconds: 43_200, requiresVerifiedAccount: true },
];
