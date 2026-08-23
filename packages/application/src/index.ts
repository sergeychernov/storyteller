import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { createStory, type PlatformCredential, type PlatformProvider, type Profile, type Project, type Story } from "@storyteller/domain";

export interface ProfileAuthentication extends Profile { readonly passwordHash: string }
export interface PlatformCredentialSummary {
  readonly id: string;
  readonly provider: PlatformProvider;
  readonly externalAccountId?: string;
  readonly secretHint: string;
}
export interface StorySummary {
  readonly id: string;
  readonly projectId: string;
  readonly title?: string;
  readonly status: Story["status"];
  readonly sceneCount: number;
  readonly revision: number;
}
export interface SessionRecord { readonly profileId: string; readonly tokenHash: string; readonly expiresAt: Date }
export interface StoryRepository {
  createProfileWithSession(input: ProfileAuthentication, session: SessionRecord): Promise<boolean>;
  findProfileAuthenticationByEmail(email: string): Promise<ProfileAuthentication | undefined>;
  createSession(session: SessionRecord): Promise<void>;
  findProfileBySession(tokenHash: string, now: Date): Promise<Profile | undefined>;
  updateProfile(profileId: string, name: string): Promise<Profile>;
  createProject(project: Project): Promise<void>;
  listProjects(profileId: string): Promise<readonly Project[]>;
  projectBelongsToProfile(projectId: string, profileId: string): Promise<boolean>;
  createStory(story: Story): Promise<void>;
  listStories(projectId: string): Promise<readonly Story[]>;
  upsertPlatformCredential(credential: PlatformCredential): Promise<PlatformCredentialSummary>;
  listPlatformCredentials(profileId: string): Promise<readonly PlatformCredentialSummary[]>;
  deletePlatformCredential(profileId: string, provider: PlatformProvider): Promise<boolean>;
}
export interface AuthenticationResult {
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly profile: Profile;
}

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

export class StoryApplication {
  constructor(private readonly repository: StoryRepository) {}

  async signIn(input: { email: string; password: string; name?: string }): Promise<AuthenticationResult> {
    const email = normalizeEmail(input.email);
    const authentication = await this.repository.findProfileAuthenticationByEmail(email);
    if (authentication) return this.loginAuthentication(authentication, input.password);
    if (!input.name?.trim()) throw new ApplicationError("profile name is required", 422, "profile_name_required");
    return this.register({ name: input.name, email, password: input.password });
  }

  async register(input: { name: string; email: string; password: string }): Promise<AuthenticationResult> {
    const profile: ProfileAuthentication = {
      id: randomUUID(), name: input.name.trim(), email: normalizeEmail(input.email), passwordHash: await hashPassword(input.password),
    };
    const issued = issueSession(profile.id);
    if (!await this.repository.createProfileWithSession(profile, issued.record)) {
      throw new ApplicationError("email is already registered", 409);
    }
    return { accessToken: issued.accessToken, expiresAt: issued.record.expiresAt.toISOString(), profile: publicProfile(profile) };
  }

  async login(input: { email: string; password: string }): Promise<AuthenticationResult> {
    const authentication = await this.repository.findProfileAuthenticationByEmail(normalizeEmail(input.email));
    if (!authentication) throw new ApplicationError("invalid email or password", 401);
    return this.loginAuthentication(authentication, input.password);
  }

  private async loginAuthentication(authentication: ProfileAuthentication, password: string): Promise<AuthenticationResult> {
    if (!await verifyPassword(password, authentication.passwordHash)) throw new ApplicationError("invalid email or password", 401);
    const issued = issueSession(authentication.id);
    await this.repository.createSession(issued.record);
    return { accessToken: issued.accessToken, expiresAt: issued.record.expiresAt.toISOString(), profile: publicProfile(authentication) };
  }

  async authenticate(accessToken: string): Promise<Profile> {
    if (!accessToken) throw new ApplicationError("authentication required", 401);
    const profile = await this.repository.findProfileBySession(hashToken(accessToken), new Date());
    if (!profile) throw new ApplicationError("invalid or expired access token", 401);
    return profile;
  }

  updateProfile(profileId: string, input: { name: string }): Promise<Profile> {
    return this.repository.updateProfile(profileId, input.name.trim());
  }
  async createProject(profileId: string, input: { name: string }): Promise<Project> {
    const project = { id: randomUUID(), profileId, name: input.name.trim() } satisfies Project;
    await this.repository.createProject(project);
    return project;
  }
  listProjects(profileId: string): Promise<readonly Project[]> { return this.repository.listProjects(profileId); }
  async createStory(profileId: string, input: { projectId: string; title: string }): Promise<StorySummary> {
    await this.requireProject(profileId, input.projectId);
    const story = createStory({ id: randomUUID(), projectId: input.projectId, title: input.title.trim() });
    await this.repository.createStory(story);
    return summarize(story);
  }
  async listStories(profileId: string, projectId: string): Promise<readonly StorySummary[]> {
    await this.requireProject(profileId, projectId);
    return (await this.repository.listStories(projectId)).map(summarize);
  }
  setPlatformCredential(profileId: string, input: { provider: PlatformProvider; secret: string; externalAccountId?: string }): Promise<PlatformCredentialSummary> {
    return this.repository.upsertPlatformCredential({
      id: randomUUID(), profileId, provider: input.provider, secret: input.secret,
      ...(input.externalAccountId === undefined ? {} : { externalAccountId: input.externalAccountId.trim() }),
    });
  }
  listPlatformCredentials(profileId: string): Promise<readonly PlatformCredentialSummary[]> {
    return this.repository.listPlatformCredentials(profileId);
  }
  async deletePlatformCredential(profileId: string, provider: PlatformProvider): Promise<void> {
    if (!await this.repository.deletePlatformCredential(profileId, provider)) {
      throw new ApplicationError(`platform credential not found: ${provider}`, 404);
    }
  }
  private async requireProject(profileId: string, projectId: string): Promise<void> {
    if (!await this.repository.projectBelongsToProfile(projectId, profileId)) throw new ApplicationError(`project not found: ${projectId}`, 404);
  }
}

export class ApplicationError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code?: string) { super(message); }
}

function summarize(story: Story): StorySummary {
  return { id: story.id, projectId: story.projectId, ...(story.title === undefined ? {} : { title: story.title }), status: story.status, sceneCount: story.scenes.length, revision: story.revision };
}
function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }
function issueSession(profileId: string): { accessToken: string; record: SessionRecord } {
  const accessToken = randomBytes(32).toString("base64url");
  return { accessToken, record: { profileId, tokenHash: hashToken(accessToken), expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS) } };
}
function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt);
  return `scrypt:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}
async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = encoded.split(":");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await derivePassword(password, Buffer.from(saltValue, "base64url"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
}
function publicProfile(profile: ProfileAuthentication): Profile { return { id: profile.id, name: profile.name, email: profile.email }; }
