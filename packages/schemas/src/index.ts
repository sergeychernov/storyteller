import type { AssetKind } from "@storyteller/domain";

export interface CreateAccountRequest { readonly id: string }
export interface CreateStoryRequest { readonly accountId: string; readonly title?: string }
export interface CreateSceneRequest { readonly id: string }
export interface AddSceneMaterialRequest { readonly assetId: string; readonly kind: AssetKind }
export interface SelectSceneRendererRequest { readonly rendererId: string }
export interface SetSceneTitleRequest { readonly title: string | null }
export interface AddNarrationRequest { readonly id: string; readonly assetId: string; readonly fromSceneId: string }
export interface GenerateMusicRequest { readonly prompt?: string }
export interface ApplyMusicRequest { readonly assetId: string }
export interface LinkProviderRequest { readonly provider: string; readonly authorizationCode: string }
export interface PublishStoryRequest { readonly provider: string; readonly connectionId: string }
