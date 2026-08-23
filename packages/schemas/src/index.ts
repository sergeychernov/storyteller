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
const materialFileShape = {
  id: z.string().uuid(), name: z.string(), orientation: materialOrientationSchema, storageKey: z.string(), mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive(),
};
export const sceneMaterialSchema = z.discriminatedUnion("kind", [
  z.object({ ...materialFileShape, kind: z.literal("image") }),
  z.object({
    ...materialFileShape, kind: z.literal("video"), hasAudio: z.boolean(), audioTags: z.array(videoAudioTagSchema),
  }),
]);
export const sceneSchema = z.object({
  id: z.string().uuid(), materials: z.array(sceneMaterialSchema), durationSeconds: z.number().min(3).max(15),
  layoutId: z.string().optional(), motion: sceneMotionSchema, rendererId: z.string().optional(), title: z.string().optional(),
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
export const configureSceneSchema = z.object({
  durationSeconds: z.number().min(3).max(15).optional(), layoutId: z.string().nullable().optional(), motion: sceneMotionSchema.optional(),
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
export interface CreateSceneRequest { readonly id: string }
export interface SelectSceneRendererRequest { readonly rendererId: string }
export interface SetSceneTitleRequest { readonly title: string | null }
export interface AddNarrationRequest { readonly id: string; readonly assetId: string; readonly fromSceneId: string }
export interface GenerateMusicRequest { readonly prompt?: string }
export interface ApplyMusicRequest { readonly assetId: string }
export interface PublishStoryRequest { readonly provider: string; readonly connectionId: string }
