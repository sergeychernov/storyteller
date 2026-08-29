import { z } from "zod";

export const profileSchema = z.object({ id: z.string().uuid(), name: z.string(), email: z.email() });
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254),
  password: z.string().min(10).max(200),
});
export const loginSchema = registerSchema.pick({ email: true, password: true });
export const signInSchema = loginSchema.extend({ name: registerSchema.shape.name.optional() });
export const authenticationSchema = z.object({ accessToken: z.string(), expiresAt: z.iso.datetime(), profile: profileSchema });
export const updateProfileSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const createStorySchema = z.object({ title: z.string().trim().min(1).max(120) });
export const storySummarySchema = z.object({
  id: z.string().uuid(), profileId: z.string().uuid(), title: z.string().optional(),
  status: z.enum(["draft", "rendering", "ready", "publishing", "published"]),
  sceneCount: z.number().int().nonnegative(), revision: z.number().int().positive(),
});
export const materialOrientationSchema = z.enum(["portrait", "landscape"]);
export const videoAudioTagSchema = z.enum(["voice", "music", "ambient"]);
export const sceneMotionSchema = z.enum(["none", "zoom-in", "zoom-out", "pan-left", "pan-right"]);
export const focusPointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
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
    sourceDurationSeconds: z.number().positive().optional(), audioTags: z.array(videoAudioTagSchema),
    videoTrack: videoTrackSchema.optional(), audioTrack: audioTrackSchema.optional(),
  }),
]);
export const materialContentAccessSchema = z.object({
  url: z.url().nullable(),
  expiresAt: z.iso.datetime().optional(),
});
export const materialWaveformSchema = z.object({ peaks: z.array(z.number().min(0).max(1)).max(512) });
export const sceneSchema = z.object({
  id: z.string().uuid(), materials: z.array(sceneMaterialSchema), durationSeconds: z.number().min(3).max(15),
  layoutId: z.string().optional(), motion: sceneMotionSchema, focusPoint: focusPointSchema.optional(),
  rendererId: z.string().optional(), title: z.string().optional(),
  render: z.object({ status: z.enum(["idle", "queued", "running", "ready", "failed"]), artifactId: z.string().optional() }),
});
export const storySchema = z.object({
  id: z.string().uuid(), profileId: z.string().uuid(), title: z.string().optional(),
  status: z.enum(["draft", "rendering", "ready", "publishing", "published"]), scenes: z.array(sceneSchema),
  narrations: z.array(z.object({ id: z.string(), assetId: z.string(), fromSceneId: z.string() })),
  music: z.object({ generationStatus: z.enum(["idle", "queued", "running", "ready", "failed"]), assetId: z.string().optional(), applied: z.boolean() }),
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
  scenes: z.array(z.object({
    sceneId: z.string().uuid(), index: z.number().int().nonnegative(), materialIds: z.array(z.string().uuid()),
    startSeconds: z.number().nonnegative().nullable(), endSeconds: z.number().nonnegative().nullable(),
    durationSeconds: z.number().nonnegative().nullable(), durationSource: z.enum(["empty", "scene", "video", "trim", "unknown"]),
  })),
  totalDurationSeconds: z.number().nonnegative().nullable(), knownDurationSeconds: z.number().nonnegative(),
  transitionOverlapSeconds: z.literal(0),
  warnings: z.array(z.object({ code: z.enum(["empty_scene", "unknown_video_duration"]), sceneId: z.string().uuid() })),
  formatLimits: z.array(z.object({
    formatId: z.string(), maxDurationSeconds: z.number().positive(), requiresVerifiedAccount: z.boolean(),
    status: z.enum(["within_limit", "exceeded", "unknown"]), excessSeconds: z.number().nonnegative(), isLowerBound: z.boolean(),
  })),
});
export const deleteSceneSchema = z.object({ expectedRevision: z.number().int().positive().optional() }).strict();
export const configureSceneSchema = z.object({
  durationSeconds: z.number().min(3).max(15).optional(), layoutId: z.string().nullable().optional(),
  motion: sceneMotionSchema.optional(), focusPoint: focusPointSchema.optional(),
});
export const sceneRenderStatusSchema = z.enum(["queued", "running", "ready", "failed", "canceled"]);
export const sceneRenderRequestSchema = z.object({ mode: z.enum(["video", "audio", "combined"]).optional() }).nullish().default({});
export const sceneRenderSchema = z.object({
  id: z.string().uuid(), status: sceneRenderStatusSchema,
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

export const platformProviderSchema = z.enum(["telegram", "tiktok", "instagram"]);
export const platformParamsSchema = z.object({ provider: platformProviderSchema });
export const setPlatformCredentialSchema = z.object({
  secret: z.string().min(1).max(4096), externalAccountId: z.string().trim().min(1).max(255).optional(),
});
export const platformCredentialSchema = z.object({
  id: z.string().uuid(), provider: platformProviderSchema, externalAccountId: z.string().optional(), secretHint: z.string(),
});

export const bearerSecurity = [{ bearerAuth: [] }];
export const healthSchema = z.object({ status: z.literal("ok") });
export const errorSchema = z.object({ message: z.string(), code: z.string().optional() });

export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type CreateStoryRequest = z.infer<typeof createStorySchema>;
export type DeleteSceneRequest = z.infer<typeof deleteSceneSchema>;
export type ReorderStoryScenesRequest = z.infer<typeof reorderStoryScenesSchema>;
export type MoveSceneMaterialsRequest = z.infer<typeof moveSceneMaterialsSchema>;
export type StoryTimelineResponse = z.infer<typeof storyTimelineSchema>;
export interface CreateSceneRequest { readonly id: string }
export interface SelectSceneRendererRequest { readonly rendererId: string }
export interface SetSceneTitleRequest { readonly title: string | null }
export interface AddNarrationRequest { readonly id: string; readonly assetId: string; readonly fromSceneId: string }
export interface GenerateMusicRequest { readonly prompt?: string }
export interface ApplyMusicRequest { readonly assetId: string }
export interface PublishStoryRequest { readonly provider: string; readonly connectionId: string }
