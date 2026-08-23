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

export const createProjectSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const projectSchema = z.object({ id: z.string().uuid(), profileId: z.string().uuid(), name: z.string() });
export const createStorySchema = z.object({ title: z.string().trim().min(1).max(120) });
export const storySummarySchema = z.object({
  id: z.string().uuid(), projectId: z.string().uuid(), title: z.string().optional(),
  status: z.enum(["draft", "rendering", "ready", "publishing", "published"]),
  sceneCount: z.number().int().nonnegative(), revision: z.number().int().positive(),
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
export interface AddSceneMaterialRequest { readonly assetId: string; readonly kind: "image" | "video" | "audio" }
export interface SelectSceneRendererRequest { readonly rendererId: string }
export interface SetSceneTitleRequest { readonly title: string | null }
export interface AddNarrationRequest { readonly id: string; readonly assetId: string; readonly fromSceneId: string }
export interface GenerateMusicRequest { readonly prompt?: string }
export interface ApplyMusicRequest { readonly assetId: string }
export interface PublishStoryRequest { readonly provider: string; readonly connectionId: string }
