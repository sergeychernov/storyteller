import assert from "node:assert/strict";
import test from "node:test";
import { adminSecurityHeaders } from "./server.mjs";

test("Admin static headers are noindex, non-embeddable, and allow only the configured API origin", () => {
  const headers = adminSecurityHeaders("https://api.example.test");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Robots-Tag"], "noindex, nofollow");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.match(headers["Content-Security-Policy"], /connect-src 'self' https:\/\/api\.example\.test/);
  assert.doesNotMatch(headers["Content-Security-Policy"], /connect-src[^;]*\*/);
});
