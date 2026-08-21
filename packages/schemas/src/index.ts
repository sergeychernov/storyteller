import { z } from "zod";

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const createStorySchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  providerConnections: z.array(z.object({
    provider: z.string(),
    externalAccountId: z.string(),
  })),
});

export const storySummarySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  title: z.string().optional(),
  status: z.enum(["draft", "rendering", "ready", "publishing", "published"]),
  sceneCount: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
});

export const healthSchema = z.object({ status: z.literal("ok") });
export const errorSchema = z.object({ message: z.string() });

export type CreateAccountRequest = z.infer<typeof createAccountSchema>;
export type CreateStoryRequest = z.infer<typeof createStorySchema>;
export interface CreateSceneRequest { readonly id: string }
export interface AddSceneMaterialRequest { readonly assetId: string; readonly kind: "image" | "video" | "audio" }
export interface SelectSceneRendererRequest { readonly rendererId: string }
export interface SetSceneTitleRequest { readonly title: string | null }
export interface AddNarrationRequest { readonly id: string; readonly assetId: string; readonly fromSceneId: string }
export interface GenerateMusicRequest { readonly prompt?: string }
export interface ApplyMusicRequest { readonly assetId: string }
export interface LinkProviderRequest { readonly provider: string; readonly authorizationCode: string }
export interface PublishStoryRequest { readonly provider: string; readonly connectionId: string }
