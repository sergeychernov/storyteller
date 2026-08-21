import { createStory, type Account, type Story } from "@storyteller/domain";

export interface NamedAccount extends Account {
  readonly name: string;
}

export interface StorySummary {
  readonly id: string;
  readonly accountId: string;
  readonly title?: string;
  readonly status: Story["status"];
  readonly sceneCount: number;
  readonly revision: number;
}

export class StoryApplication {
  readonly #accounts = new Map<string, NamedAccount>();
  readonly #stories = new Map<string, Story>();

  createAccount(input: { name: string }): NamedAccount {
    const account = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      providerConnections: [],
    } satisfies NamedAccount;
    this.#accounts.set(account.id, account);
    return account;
  }

  createStory(input: { accountId: string; title: string }): StorySummary {
    this.#requireAccount(input.accountId);
    const story = createStory({
      id: crypto.randomUUID(),
      accountId: input.accountId,
      title: input.title.trim(),
    });
    this.#stories.set(story.id, story);
    return summarize(story);
  }

  listStories(accountId: string): readonly StorySummary[] {
    this.#requireAccount(accountId);
    return [...this.#stories.values()]
      .filter((story) => story.accountId === accountId)
      .map(summarize);
  }

  #requireAccount(accountId: string): NamedAccount {
    const account = this.#accounts.get(accountId);
    if (!account) throw new ApplicationError(`account not found: ${accountId}`, 404);
    return account;
  }
}

export class ApplicationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

function summarize(story: Story): StorySummary {
  return {
    id: story.id,
    accountId: story.accountId,
    ...(story.title === undefined ? {} : { title: story.title }),
    status: story.status,
    sceneCount: story.scenes.length,
    revision: story.revision,
  };
}
