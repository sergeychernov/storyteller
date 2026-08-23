# Initial product scope

This is the proposed HTTP surface. Paths describe product capabilities, not a committed framework or storage model.

| Capability | Method and path |
| --- | --- |
| Sign in or complete a new profile | `POST /auth/sign-in` |
| Read/update own profile | `GET/PATCH /profile` |
| Create/list projects | `POST/GET /projects` |
| Create story | `POST /projects/{projectId}/stories` |
| Create scene | `POST /stories/{storyId}/scenes` |
| Add material to scene | `POST /stories/{storyId}/scenes/{sceneId}/materials` |
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
