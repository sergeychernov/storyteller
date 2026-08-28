# Initial product scope

This is the proposed HTTP surface. Paths describe product capabilities, not a committed framework or storage model.

| Capability | Method and path |
| --- | --- |
| Sign in or complete a new profile | `POST /auth/sign-in` |
| Read/update own profile | `GET/PATCH /profile` |
| Create/list stories | `POST/GET /stories` |
| Create scene | `POST /stories/{storyId}/scenes` |
| Delete scene (optional expected revision) | `DELETE /stories/{storyId}/scenes/{sceneId}` |
| Upload original photo/video to scene (multipart) | `POST /stories/{storyId}/scenes/{sceneId}/materials` |
| Read authenticated material content | `GET /stories/{storyId}/materials/{materialId}/content` |
| Reorder scene materials | `PUT /stories/{storyId}/scenes/{sceneId}/material-order` |
| Configure scene duration, layout, motion and normalized focus point | `PATCH /stories/{storyId}/scenes/{sceneId}` |
| Remove material | `DELETE /stories/{storyId}/scenes/{sceneId}/materials/{assetId}` |
| Select renderer | `PUT /stories/{storyId}/scenes/{sceneId}/renderer` |
| Add or remove title | `PUT /stories/{storyId}/scenes/{sceneId}/title` |
| Preview scene | `POST /stories/{storyId}/scenes/{sceneId}/preview` |
| Add narration from scene X | `POST /stories/{storyId}/narrations` |
| Remove narration | `DELETE /stories/{storyId}/narrations/{narrationId}` |
| Generate music | `POST /stories/{storyId}/music/generations` |
| Apply music | `PUT /stories/{storyId}/music` |
| Preview story | `POST /stories/{storyId}/preview` |
| View timeline | `GET /stories/{storyId}/timeline` |
| Manage platform credentials | `GET/PUT/DELETE /profile/platform-credentials/{provider}` |
| Publish story | `POST /stories/{storyId}/publications` |

Preview, music generation and publication endpoints create asynchronous jobs. Their status/resource endpoints will be designed with the first vertical slice so idempotency and persistence are not guessed prematurely.

The implemented scene-deletion contract, current file-cleanup semantics and Web integration are documented in [B05 — scene deletion](b05-scene-deletion.md). Deleting a scene is not archive preservation; that remains part of F10.1 in the product roadmap.
