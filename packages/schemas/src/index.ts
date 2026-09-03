import { z } from "zod";
import {
  collageFrameShapes, collageRowDirections, defaultCollageRowDirection,
  normalizeCollageFrameWidth, profileLanguages, sceneTitleColors, sceneTitleSizes, sceneTitleStyles,
} from "@storyteller/domain";

export const profileLanguageSchema = z.enum(profileLanguages);
export const profileSchema = z.object({ id: z.string().uuid(), name: z.string(), email: z.email(), language: profileLanguageSchema });
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254),
  password: z.string().min(10).max(200),
  language: profileLanguageSchema.optional(),
});
export const loginSchema = registerSchema.pick({ email: true, password: true });
export const signInSchema = loginSchema.extend({ name: registerSchema.shape.name.optional(), language: profileLanguageSchema.optional() });
export const authenticationSchema = z.object({
  accessToken: z.string(), accountCreated: z.boolean(), expiresAt: z.iso.datetime(), profile: profileSchema,
});
export const browserSessionSchema = z.object({
  accountCreated: z.boolean().optional(), expiresAt: z.iso.datetime(), profile: profileSchema, csrfToken: z.string().min(1),
});
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(), language: profileLanguageSchema.optional(),
}).refine(({ name, language }) => name !== undefined || language !== undefined, { message: "profile update must not be empty" });

export const createStorySchema = z.object({ title: z.string().trim().min(1).max(120) });
export const storySummarySchema = z.object({
  id: z.string().uuid(), profileId: z.string().uuid(), title: z.string().optional(),
  status: z.enum(["draft", "rendering", "ready", "publishing", "published"]),
  sceneCount: z.number().int().nonnegative(), revision: z.number().int().positive(),
});
export const materialOrientationSchema = z.enum(["portrait", "landscape"]);
export const rationalFrameRateSchema = z.object({
  numerator: z.number().int().positive(), denominator: z.number().int().positive(),
});
export const videoAudioTagSchema = z.enum(["voice", "music", "ambient"]);
export const sceneMotionSchema = z.enum(["none", "zoom-in", "zoom-out", "pan-left", "pan-right"]);
export const focusPointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export const sceneTitleSchema = z.object({
  text: z.string().trim().min(1).max(120).refine((text) => text.replace(/\r\n?/g, "\n").split("\n").length <= 3, {
    message: "scene title text must contain at most 3 lines",
  }),
  position: focusPointSchema,
  style: z.enum(sceneTitleStyles),
  size: z.enum(sceneTitleSizes),
  color: z.enum(sceneTitleColors),
  timing: z.object({ startSeconds: z.number().nonnegative(), endSeconds: z.number().positive() })
    .refine(({ startSeconds, endSeconds }) => endSeconds > startSeconds, { message: "scene title timing must be positive" }),
}).strict();
const collageFrameInputSchema = z.object({
    width: z.number().int().min(0).max(24),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    shape: z.enum([...collageFrameShapes, "rectangle", "rounded", "circle"]),
  });
const collageFrameValueSchema = z.object({
    width: z.union([z.literal(12), z.literal(16), z.literal(20), z.literal(24)]),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    shape: z.enum(collageFrameShapes),
  });
const collageFrameSchema = z.codec(
  collageFrameInputSchema,
  collageFrameValueSchema,
  {
    decode: (frame) => ({
      width: normalizeCollageFrameWidth(frame.width),
      color: frame.color,
      shape: frame.width === 0 || frame.shape === "none"
        ? "none" as const
        : frame.shape === "torn" ? "torn" as const : "straight" as const,
    }),
    encode: (frame) => frame,
  },
);

const collageSettingsValueSchema = z.object({
  frame: collageFrameValueSchema,
  entryDurationSeconds: z.number().positive().max(14),
  rowDirection: z.enum(collageRowDirections),
  straightCards: z.boolean(),
  cardAngles: z.array(z.object({
    materialId: z.string().uuid(),
    angleDegrees: z.number().min(-10).max(10),
  })).max(6),
  cardOffsets: z.array(z.object({
    materialId: z.string().uuid(),
    offsetY: z.number().int().min(-80).max(80),
  })).max(6),
});
const collageSettingsInputSchema = collageSettingsValueSchema.extend({
  frame: collageFrameSchema,
  rowDirection: z.enum(collageRowDirections).default(defaultCollageRowDirection),
  straightCards: z.boolean().default(false),
  cardAngles: collageSettingsValueSchema.shape.cardAngles.default([]),
  cardOffsets: collageSettingsValueSchema.shape.cardOffsets.default([]),
  background: z.object({ mode: z.enum(["automatic", "first-material"]) }).optional(),
});
/** Reads the former settings-owned background field but never writes it back. */
export const collageSettingsSchema = z.codec(
  collageSettingsInputSchema,
  collageSettingsValueSchema,
  {
    decode: ({ background: _legacyBackground, ...settings }) => settings,
    encode: (settings) => settings,
  },
);
const editableCollageSettingsSchema = collageSettingsValueSchema.omit({
  cardAngles: true, cardOffsets: true, rowDirection: true, straightCards: true,
}).extend({
  frame: collageFrameSchema,
  rowDirection: z.enum(collageRowDirections).optional(),
  straightCards: z.boolean().optional(),
});
const materialRotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const materialCropSchema = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
}).refine(({ x, width }) => x + width <= 1.000_001, { message: "crop exceeds image width" })
  .refine(({ y, height }) => y + height <= 1.000_001, { message: "crop exceeds image height" });
const videoTrimSchema = z.object({
  startSeconds: z.number().nonnegative(), endSeconds: z.number().positive(),
}).refine(({ startSeconds, endSeconds }) => endSeconds > startSeconds, { message: "video trim must have a positive duration" });
export const editMaterialSchema = z.object({
  rotation: materialRotationSchema, crop: materialCropSchema, trim: videoTrimSchema.optional(),
});
const materialFileShape = {
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  id: z.string().uuid(), name: z.string(), orientation: materialOrientationSchema, storageKey: z.string(), mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive(),
  edit: z.object({
    rotation: materialRotationSchema,
    crop: materialCropSchema,
    trim: videoTrimSchema.optional(),
    result: z.object({
      contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      storageKey: z.string(), mimeType: z.string(), sizeBytes: z.number().int().nonnegative(),
      width: z.number().int().positive(), height: z.number().int().positive(), orientation: materialOrientationSchema,
      durationSeconds: z.number().positive().optional(),
    }).optional(),
  }).optional(),
};
const videoTrackSchema = z.object({
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  storageKey: z.string(), mimeType: z.string(), sizeBytes: z.number().int().nonnegative(), durationSeconds: z.number().positive(),
});
const audioTrackSchema = videoTrackSchema.extend({
  sampleRate: z.number().int().positive(), channels: z.number().int().positive(),
  processing: z.object({
    version: z.number().int().positive(), filter: z.string(),
    integratedLufs: z.number().nullable(), truePeakDbfs: z.number().nullable(),
  }),
});
export const sceneMaterialSchema = z.discriminatedUnion("kind", [
  z.object({ ...materialFileShape, kind: z.literal("image") }),
  z.object({
    ...materialFileShape, kind: z.literal("video"), hasAudio: z.boolean(),
    sourceDurationSeconds: z.number().positive(), audioTags: z.array(videoAudioTagSchema),
    sourceFrameRate: rationalFrameRateSchema.optional(),
    videoTrack: videoTrackSchema.optional(), audioTrack: audioTrackSchema.optional(),
  }),
]);
export const collageBackgroundSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("previous-scene") }),
  z.object({ source: z.literal("material"), material: sceneMaterialSchema }),
]);
export const materialContentAccessSchema = z.object({
  url: z.url().nullable(),
  expiresAt: z.iso.datetime().optional(),
});
export const materialWaveformSchema = z.object({ peaks: z.array(z.number().min(0).max(1)).max(512) });
export const sceneSchema = z.object({
  id: z.string().uuid(), materials: z.array(sceneMaterialSchema), durationSeconds: z.number().min(3).max(15),
  layoutId: z.string().optional(), motion: sceneMotionSchema, focusPoint: focusPointSchema.optional(),
  collage: collageSettingsSchema.optional(),
  collageBackground: collageBackgroundSchema.optional(),
  rendererId: z.string().optional(), title: sceneTitleSchema.optional(),
  render: z.object({ status: z.enum(["idle", "queued", "running", "ready", "failed"]), artifactId: z.string().optional() }),
});
export const storySchema = z.object({
  id: z.string().uuid(), profileId: z.string().uuid(), title: z.string().optional(),
  status: z.enum(["draft", "rendering", "ready", "publishing", "published"]), scenes: z.array(sceneSchema),
  narrations: z.array(z.object({ id: z.string(), assetId: z.string(), fromSceneId: z.string() })),
  music: z.object({ generationStatus: z.enum(["idle", "queued", "running", "ready", "failed"]), assetId: z.string().optional(), applied: z.boolean() }),
  outputFrameRate: rationalFrameRateSchema.optional(),
  approvedMix: z.object({
    storageKey: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/), mimeType: z.literal("audio/mp4"),
    sizeBytes: z.number().int().nonnegative(), sampleRate: z.literal(48000), channels: z.literal(2),
    timelineHash: z.string().regex(/^[a-f0-9]{64}$/), durationFrames: z.number().int().positive(),
  }).optional(),
  revision: z.number().int().positive(),
});
export const reorderSceneMaterialsSchema = z.object({ materialIds: z.array(z.string().uuid()) });
export const reorderStoryScenesSchema = z.object({
  sceneIds: z.array(z.string().uuid()), expectedRevision: z.number().int().positive(),
}).strict();
export const moveSceneMaterialsSchema = z.object({
  materialIds: z.array(z.string().uuid()).min(1), targetSceneId: z.string().uuid(),
  targetIndex: z.number().int().nonnegative(), expectedRevision: z.number().int().positive(),
}).strict();
export const storyTimelineSchema = z.object({
  storyId: z.string().uuid(), revision: z.number().int().positive(), sceneOrder: z.array(z.string().uuid()),
  frameRate: rationalFrameRateSchema, totalFrames: z.number().int().nonnegative(),
  scenes: z.array(z.object({
    sceneId: z.string().uuid(), index: z.number().int().nonnegative(), materialIds: z.array(z.string().uuid()),
    startSeconds: z.number().nonnegative(), endSeconds: z.number().nonnegative(),
    durationSeconds: z.number().nonnegative(), durationSource: z.enum(["empty", "scene", "video", "trim"]),
    startFrame: z.number().int().nonnegative(), endFrame: z.number().int().nonnegative(), durationFrames: z.number().int().nonnegative(),
  })),
  totalDurationSeconds: z.number().nonnegative(),
  transitionOverlapSeconds: z.literal(0),
  warnings: z.array(z.object({ code: z.literal("empty_scene"), sceneId: z.string().uuid() })),
  formatLimits: z.array(z.object({
    formatId: z.string(), maxDurationSeconds: z.number().positive(), requiresVerifiedAccount: z.boolean(),
    status: z.enum(["within_limit", "exceeded"]), excessSeconds: z.number().nonnegative(),
  })),
});
export const deleteSceneSchema = z.object({ expectedRevision: z.number().int().positive().optional() }).strict();
export const configureSceneSchema = z.object({
  durationSeconds: z.number().min(3).max(15).optional(), layoutId: z.string().nullable().optional(),
  motion: sceneMotionSchema.optional(), focusPoint: focusPointSchema.optional(), collage: editableCollageSettingsSchema.optional(),
});
export const setSceneTitleSchema = z.object({
  title: sceneTitleSchema.nullable(), expectedRevision: z.number().int().positive(),
}).strict();
export const sceneRenderStatusSchema = z.enum(["queued", "running", "ready", "failed", "canceled"]);
export const sceneRenderProgressPhaseSchema = z.enum(["queued", "downloading", "rendering", "finalizing", "uploading", "ready"]);
export const sceneRenderRequestSchema = z.object({ mode: z.enum(["video", "audio", "combined"]).optional() }).nullish().default({});
export const sceneRenderSchema = z.object({
  id: z.string().uuid(), status: sceneRenderStatusSchema,
  progressPercent: z.number().int().min(0).max(100), progressPhase: sceneRenderProgressPhaseSchema,
  artifact: z.literal("scene-render"),
  current: z.boolean(), inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), createdAt: z.iso.datetime().optional(),
  mode: z.enum(["video", "audio", "combined"]), parameters: z.record(z.string(), z.unknown()),
  dependencies: z.array(z.object({
    role: z.enum(["original", "image-edit", "video-track", "audio-track", "scene-frame"]),
    storageKey: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    parents: z.array(z.string()), parameters: z.record(z.string(), z.unknown()),
  })),
  sizeBytes: z.number().int().nonnegative().optional(), error: z.string().optional(),
});
export const sceneFrameSchema = sceneRenderSchema.omit({ artifact: true, mode: true }).extend({
  artifact: z.literal("scene-frame"),
});
export const storyExportRequestSchema = z.object({
  expectedRevision: z.number().int().positive(), outputProfileId: z.literal("vertical-social-v1"),
}).strict();
export const storyExportSchema = z.object({
  id: z.string().uuid(), status: z.enum(["queued", "rendering", "assembling", "ready", "failed", "canceled"]),
  currentRevision: z.number().int().positive(), storyRevision: z.number().int().positive(),
  outputProfileId: z.literal("vertical-social-v1"), frameRate: rationalFrameRateSchema,
  totalFrames: z.number().int().positive(), progressPercent: z.number().int().min(0).max(100),
  progressPhase: z.enum(["queued", "rendering_segments", "assembling", "uploading", "ready"]),
  readySegments: z.number().int().nonnegative(), totalSegments: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative().optional(),
  errorCode: z.enum(["story_revision_changed", "segment_failed", "segment_profile_mismatch", "approved_mix_mismatch", "assembly_failed"]).optional(),
});

export const platformProviderSchema = z.enum(["telegram", "tiktok", "instagram"]);
export const platformParamsSchema = z.object({ provider: platformProviderSchema });
export const setPlatformCredentialSchema = z.object({
  secret: z.string().min(1).max(4096), externalAccountId: z.string().trim().min(1).max(255).optional(),
});
export const platformCredentialSchema = z.object({
  id: z.string().uuid(), provider: platformProviderSchema, externalAccountId: z.string().optional(), secretHint: z.string(),
});

export const productActivityCodeSchema = z.enum([
  "auth.registered", "auth.logged_in", "story.created", "material.uploaded",
  "scene.render_requested", "scene.render_ready", "story.export_requested", "story.export_ready",
  "publication.requested", "publication.succeeded", "publication.failed",
]);
export const adminPageRequestSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});
export const adminUserSearchSchema = adminPageRequestSchema.extend({
  query: z.string().trim().max(254).optional(),
  sort: z.enum(["createdAt", "email", "lastSeenAt", "storyCount"]).default("createdAt"),
  order: z.enum(["ASC", "DESC"]).default("DESC"),
}).strict();
export const adminActivityQuerySchema = adminPageRequestSchema.extend({
  code: productActivityCodeSchema.optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export const adminAuditQuerySchema = adminPageRequestSchema.extend({
  action: z.string().trim().max(100).optional(),
});
export const adminProfileParamsSchema = z.object({ profileId: z.string().uuid() });
export const adminOverviewSchema = z.object({
  registrations: z.object({ today: z.number().int().nonnegative(), last7Days: z.number().int().nonnegative(), last30Days: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
  sessions: z.object({ active: z.number().int().nonnegative(), observedLast90Days: z.number().int().nonnegative() }),
  stories: z.object({ draft: z.number().int().nonnegative(), rendering: z.number().int().nonnegative(), ready: z.number().int().nonnegative(), publishing: z.number().int().nonnegative(), published: z.number().int().nonnegative() }),
  activity: z.array(z.object({ code: productActivityCodeSchema, count: z.number().int().nonnegative() })),
  eventCoverageStartedAt: z.iso.datetime().nullable(),
  generatedAt: z.iso.datetime(),
});
export const adminUserSummarySchema = z.object({
  id: z.string().uuid(), name: z.string(), email: z.email(), language: profileLanguageSchema,
  createdAt: z.iso.datetime(), lastSeenAt: z.iso.datetime().nullable(), storyCount: z.number().int().nonnegative(),
  activeSessionCount: z.number().int().nonnegative(),
});
export const adminUserDetailSchema = adminUserSummarySchema.extend({ updatedAt: z.iso.datetime() });
export const adminActivityEventSchema = z.object({
  id: z.string(), profileId: z.string().uuid(), code: productActivityCodeSchema, occurredAt: z.iso.datetime(),
});
export const adminSessionMetadataSchema = z.object({
  id: z.string().uuid(), createdAt: z.iso.datetime(), lastSeenAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(), status: z.enum(["active", "expired", "revoked"]), isCurrent: z.boolean(),
});
export const adminAuditEntrySchema = z.object({
  id: z.string(), actorProfileId: z.string().uuid().nullable(), action: z.string(), targetType: z.string(),
  targetProfileId: z.string().uuid().nullable(), targetEntityId: z.string().nullable(), occurredAt: z.iso.datetime(),
  source: z.enum(["admin_read", "access_change"]), reason: z.string().nullable(), batchId: z.string().uuid().nullable(),
  change: z.object({ before: z.unknown().nullable(), after: z.unknown().nullable() }).nullable(),
});
export const adminMeSchema = z.object({ profile: profileSchema, capabilities: z.array(z.string()) });
const adminAccessSourceSchema = z.object({
  kind: z.enum(["plan_version", "role", "cohort", "user_override", "operational_switch"]), key: z.string(),
  effect: z.enum(["allow", "deny", "base", "add", "replace"]), via: z.string().optional(), decisive: z.boolean(),
});
export const adminEffectiveAccessSchema = z.object({
  planVersionCode: z.string().nullable(), roles: z.array(z.string()),
  capabilities: z.array(z.object({ code: z.string(), allowed: z.boolean(), expiresAt: z.iso.datetime().optional(), sources: z.array(adminAccessSourceSchema) })),
  limits: z.array(z.object({ code: z.string(), value: z.union([z.number(), z.literal("unlimited"), z.null()]), expiresAt: z.iso.datetime().optional(), sources: z.array(adminAccessSourceSchema) })),
  evaluatedAt: z.iso.datetime(),
});
const adminAccessWindowSchema = z.object({
  startsAt: z.iso.datetime().nullable(), expiresAt: z.iso.datetime().nullable(), reason: z.string(),
  createdBy: z.string().uuid().nullable(), createdAt: z.iso.datetime(),
});
export const adminAccessCatalogEntrySchema = z.object({
  id: z.string(), code: z.string(), archived: z.boolean(),
});
export const adminAccessRoleSchema = adminAccessCatalogEntrySchema.extend({ capabilities: z.array(z.string()) });
export const adminAccessManagementSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().nonnegative(),
  memberships: z.array(adminAccessWindowSchema.extend({ cohortCode: z.string() })),
  roles: z.array(adminAccessWindowSchema.extend({ id: z.string(), roleCode: z.string() })),
  capabilityOverrides: z.array(adminAccessWindowSchema.extend({
    id: z.string(), capabilityCode: z.string(), effect: z.enum(["allow", "deny"]),
  })),
  limitOverrides: z.array(adminAccessWindowSchema.extend({
    id: z.string(), limitCode: z.string(), operation: z.enum(["add", "replace"]),
    value: z.union([z.number().int().nonnegative(), z.literal("unlimited")]),
  })),
  effective: adminEffectiveAccessSchema,
});

const adminAccessTimedOperationSchema = z.object({
  startsAt: z.iso.datetime().optional(), expiresAt: z.iso.datetime().optional(),
});
export const adminAccessOperationSchema = z.discriminatedUnion("type", [
  adminAccessTimedOperationSchema.extend({ type: z.literal("set_role"), roleCode: z.string().min(1).max(100) }),
  z.object({ type: z.literal("remove_role"), roleCode: z.string().min(1).max(100) }),
  adminAccessTimedOperationSchema.extend({ type: z.literal("set_cohort_membership"), cohortCode: z.string().min(1).max(100) }),
  z.object({ type: z.literal("remove_cohort_membership"), cohortCode: z.string().min(1).max(100) }),
  adminAccessTimedOperationSchema.extend({
    type: z.literal("set_capability_override"), capabilityCode: z.string().min(1).max(120), effect: z.enum(["allow", "deny"]),
  }),
  z.object({ type: z.literal("remove_capability_override"), capabilityCode: z.string().min(1).max(120) }),
  adminAccessTimedOperationSchema.extend({
    type: z.literal("set_limit_override"), limitCode: z.string().min(1).max(120), operation: z.enum(["add", "replace"]),
    value: z.union([z.number().int().nonnegative(), z.literal("unlimited")]),
  }),
  z.object({ type: z.literal("remove_limit_override"), limitCode: z.string().min(1).max(120) }),
]);
export const adminAccessPreviewRequestSchema = z.object({
  profileIds: z.array(z.string().uuid()).min(1).max(100).refine((values) => new Set(values).size === values.length, "profileIds must be unique"),
  operation: adminAccessOperationSchema,
  reason: z.string().trim().min(1).max(500),
}).strict();
export const adminAccessPreviewTargetSchema = z.object({
  profileId: z.string().uuid(), changed: z.boolean(), blockers: z.array(z.string()),
  before: adminEffectiveAccessSchema.nullable(), after: adminEffectiveAccessSchema.nullable(),
});
export const adminAccessPreviewSchema = z.object({
  id: z.string().uuid(), expiresAt: z.iso.datetime(), reason: z.string(), targetCount: z.number().int().positive(),
  changedCount: z.number().int().nonnegative(), noOpCount: z.number().int().nonnegative(), blockedCount: z.number().int().nonnegative(),
  operation: adminAccessOperationSchema, targets: z.array(adminAccessPreviewTargetSchema), applicable: z.boolean(),
});
export const adminAccessApplyRequestSchema = z.object({ confirmation: z.string().max(40).optional() }).strict();
export const adminAccessApplyResultSchema = adminAccessPreviewSchema.extend({ appliedAt: z.iso.datetime() });
export const adminSessionRevokeSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
export const adminSessionRevokedSchema = z.object({ id: z.string().uuid(), revokedAt: z.iso.datetime() });
export function adminPageSchema<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), total: z.number().int().nonnegative(), page: z.number().int().positive(), perPage: z.number().int().positive() });
}

export const bearerSecurity = [{ bearerAuth: [] }];
export const browserSecurity = [{ cookieAuth: [] }];
export const healthSchema = z.object({ status: z.literal("ok") });
export const errorSchema = z.object({ message: z.string(), code: z.string().optional() });

export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type BrowserSession = z.infer<typeof browserSessionSchema>;
export type AdminOverview = z.infer<typeof adminOverviewSchema>;
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;
export type AdminActivityEvent = z.infer<typeof adminActivityEventSchema>;
export type AdminSessionMetadata = z.infer<typeof adminSessionMetadataSchema>;
export type AdminAuditEntry = z.infer<typeof adminAuditEntrySchema>;
export type AdminAccessCatalogEntry = z.infer<typeof adminAccessCatalogEntrySchema>;
export type AdminAccessRole = z.infer<typeof adminAccessRoleSchema>;
export type AdminAccessManagement = z.infer<typeof adminAccessManagementSchema>;
export type AdminAccessOperation = z.infer<typeof adminAccessOperationSchema>;
export type AdminAccessPreviewRequest = z.infer<typeof adminAccessPreviewRequestSchema>;
export type AdminAccessPreview = z.infer<typeof adminAccessPreviewSchema>;
export type AdminAccessApplyResult = z.infer<typeof adminAccessApplyResultSchema>;
export type AdminPage<T> = { readonly data: readonly T[]; readonly total: number; readonly page: number; readonly perPage: number };
export type CreateStoryRequest = z.infer<typeof createStorySchema>;
export type DeleteSceneRequest = z.infer<typeof deleteSceneSchema>;
export type ReorderStoryScenesRequest = z.infer<typeof reorderStoryScenesSchema>;
export type MoveSceneMaterialsRequest = z.infer<typeof moveSceneMaterialsSchema>;
export type StoryTimelineResponse = z.infer<typeof storyTimelineSchema>;
export interface CreateSceneRequest { readonly id: string }
export interface SelectSceneRendererRequest { readonly rendererId: string }
export type SetSceneTitleRequest = z.infer<typeof setSceneTitleSchema>;
export interface AddNarrationRequest { readonly id: string; readonly assetId: string; readonly fromSceneId: string }
export interface GenerateMusicRequest { readonly prompt?: string }
export interface ApplyMusicRequest { readonly assetId: string }
export interface PublishStoryRequest { readonly provider: string; readonly connectionId: string }
