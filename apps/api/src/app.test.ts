import assert from "node:assert/strict";
import test from "node:test";
import { buildApi } from "./server.js";

test("creates an account and its first story", async () => {
  process.env.NODE_ENV = "test";
  const api = await buildApi();
  const accountResponse = await api.inject({ method: "POST", url: "/accounts", payload: { name: "Sergej" } });
  assert.equal(accountResponse.statusCode, 201);
  const account = accountResponse.json<{ id: string }>();

  const storyResponse = await api.inject({
    method: "POST",
    url: `/accounts/${account.id}/stories`,
    payload: { title: "First story" },
  });
  assert.equal(storyResponse.statusCode, 201);
  assert.equal(storyResponse.json<{ title: string }>().title, "First story");

  const listResponse = await api.inject({ method: "GET", url: `/accounts/${account.id}/stories` });
  assert.equal(listResponse.json<unknown[]>().length, 1);
  await api.close();
});
