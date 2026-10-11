import { test, mock, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import express from "express";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { applySecurityMiddleware } from "../securityMiddleware.js";
import {
  SCOPES,
  issueMcpToken,
  verifyMcpToken,
  loadMcpSettings,
  ExpiringStore,
  type McpSettings,
} from "./oauth.js";

const db = new PGlite();
await db.exec(
  "CREATE ROLE family_app_chores_runtime NOLOGIN NOINHERIT NOBYPASSRLS",
);
for (const path of [
  "../db/schema-postgres-supabase.sql",
  "../../../supabase/migrations/20261010201518_task_point_tracking.sql",
  "../../../supabase/migrations/20261011200919_durable_mcp_oauth.sql",
  "../../../supabase/migrations/20261011210000_manual_point_tracking.sql",
]) {
  await db.exec(readFileSync(new URL(path, import.meta.url), "utf8"));
}
await db.exec(`INSERT INTO houses(id,name) VALUES(1,'Fixture one'),(2,'Fixture two');
INSERT INTO users(id,name,role,house_id) VALUES(1,'Fixture parent','parent',1),(2,'Other fixture parent','parent',2),(3,'Fixture child','child',1),(4,'Fixture family','family',1);
INSERT INTO children(id,name,house_id) VALUES(10,'Alex',1),(11,'Alex',1),(12,'Sam',1),(20,'Other child',2);
INSERT INTO points(child_id,points,type,reason,parent_id) VALUES(10,5,'bonus','Legacy fixture',1);`);
function tableBuilder(table: string) {
  assert.match(table, /^[a-z_]+$/);
  let operation = "read",
    values: unknown[] = [],
    filters: string[] = [],
    columns = "*",
    order = "",
    limit = "",
    changes: Record<string, unknown> = {};
  const ident = (key: string) => {
    assert.match(key, /^[a-z_]+$/);
    return `"${key}"`;
  };
  const bind = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  const builder: any = {
    select: (c = "*") => {
      columns = c;
      return builder;
    },
    insert: (v: Record<string, unknown>) => {
      operation = "insert";
      changes = v;
      return builder;
    },
    update: (v: Record<string, unknown>) => {
      operation = "update";
      changes = v;
      return builder;
    },
    eq: (k: string, v: unknown) => {
      filters.push(`${ident(k)}=${bind(v)}`);
      return builder;
    },
    lt: (k: string, v: unknown) => {
      filters.push(`${ident(k)}<${bind(v)}`);
      return builder;
    },
    is: (k: string, v: unknown) => {
      assert.equal(v, null);
      filters.push(`${ident(k)} IS NULL`);
      return builder;
    },
    order: (k: string, o: any) => {
      order = ` ORDER BY ${ident(k)} ${o.ascending ? "ASC" : "DESC"}`;
      return builder;
    },
    limit: (n: number) => {
      assert(Number.isInteger(n));
      limit = ` LIMIT ${n}`;
      return builder;
    },
    single: () => execute(true),
    maybeSingle: () => execute(true),
    then: (resolve: any, reject: any) => execute(false).then(resolve, reject),
  };
  async function execute(single: boolean) {
    const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
    const keys = Object.keys(changes);
    let sql: string;
    if (operation === "insert")
      sql = `INSERT INTO ${table}(${keys.map(ident).join(",")}) VALUES(${keys.map((k) => bind(changes[k])).join(",")}) RETURNING *`;
    else if (operation === "update")
      sql = `UPDATE ${table} SET ${keys.map((k) => `${ident(k)}=${bind(changes[k])}`).join(",")}${where} RETURNING *`;
    else sql = `SELECT ${columns} FROM ${table}${where}${order}${limit}`;
    try {
      const result = await db.query(sql, values);
      return {
        data: single ? (result.rows[0] ?? null) : result.rows,
        error: null,
      };
    } catch (error: any) {
      return { data: null, error: { code: error.code } };
    }
  }
  return builder;
}
mock.module("../db/supabase.js", {
  namedExports: { getSupabaseClient: () => ({ from: tableBuilder }) },
});
// A forbidden financial dependency fails loudly if any MCP/manual action imports or invokes it.
let financialCalls = 0;
mock.module("../services/bitcoin.js", {
  namedExports: {
    getOrFetchPrice: async () => {
      financialCalls++;
      throw new Error("Financial I/O forbidden");
    },
  },
});
const {
  visibleChildren,
  recordManualPoint,
  pointHistory,
  voidAuditedPoint,
  assertCurrentParent,
  parseManualPointIntent,
} = await import("../services/manualPoints.js");
const { getChildBalance } = await import("../db/queries/points.js");
const { createFamilyMcpRouter } = await import("./router.js");
const settings: McpSettings = {
  enabled: true,
  resource: "",
  issuer: "",
  clientId: "fixture-public-client",
  redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
  secret: randomBytes(32).toString("hex"), // Ephemeral test-only key; never persisted.
};
const { config } = await import("../config.js");
config.jwt.secret = settings.secret; // Same signing key: token-purpose isolation must still hold.
const { DatabaseSessionStore, SESSION_LIFETIME, SESSION_IDLE, tokenHash } =
  await import("./sessionStore.js");
const sqlDatabase = {
  query: (sql: string, values?: unknown[]) => db.query(sql, values),
  transaction: <T>(fn: (sql: any) => Promise<T>) => db.transaction(fn),
};
const app = express();
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
settings.issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
settings.resource = `${settings.issuer}/mcp`;
const durableSessions = new DatabaseSessionStore(sqlDatabase, settings);
applySecurityMiddleware(app, {
  allowedOrigins: [settings.issuer],
  allowLocalhost: true,
});
app.use(
  createFamilyMcpRouter(settings, {
    login: async (name, password) =>
      password === "fixture-owner-password" &&
      name.startsWith("Fixture parent ")
        ? { userId: 1, houseId: 1 }
        : null,
    sessions: durableSessions,
    parent: assertCurrentParent,
    tools: {
      children: visibleChildren,
      record: recordManualPoint,
      history: pointHistory,
      void: voidAuditedPoint,
    },
  }),
);
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});
const formHeaders = { "content-type": "application/x-www-form-urlencoded" };
async function authorizationCode(scopes = SCOPES.join(" ")) {
  const verifier = randomBytes(32).toString("base64url");
  const params = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: settings.redirectUri,
    response_type: "code",
    scope: scopes,
    state: "fixture-state",
    resource: settings.resource,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  });
  const response = await fetch(
    `${settings.issuer}/mcp/oauth/authorize?${params}`,
  );
  assert.equal(response.status, 200);
  const html = await response.text(),
    cookie = response.headers.get("set-cookie")!.split(";")[0];
  const request = html.match(/name="request" value="([^"]+)"/)![1],
    csrf = html.match(/name="csrf" value="([^"]+)"/)![1];
  const body = {
    request,
    csrf,
    name: `Fixture parent ${randomUUID()}`,
    password: "fixture-owner-password",
    consent: "allow",
  };
  const bad = await fetch(`${settings.issuer}/mcp/oauth/authorize`, {
    method: "POST",
    headers: { ...formHeaders, origin: settings.issuer, cookie },
    body: new URLSearchParams({ ...body, csrf: "wrong" }),
    redirect: "manual",
  });
  assert.equal(bad.status, 400);
  const approved = await fetch(`${settings.issuer}/mcp/oauth/authorize`, {
    method: "POST",
    headers: { ...formHeaders, origin: settings.issuer, cookie },
    body: new URLSearchParams(body),
    redirect: "manual",
  });
  assert.equal(approved.status, 303);
  const callback = new URL(approved.headers.get("location")!);
  assert.equal(callback.searchParams.get("iss"), settings.issuer);
  assert.equal(callback.searchParams.get("state"), "fixture-state");
  return { code: callback.searchParams.get("code")!, verifier };
}
async function exchange(
  code: string,
  verifier: string,
  override: Record<string, string> = {},
) {
  return fetch(`${settings.issuer}/mcp/oauth/token`, {
    method: "POST",
    headers: formHeaders,
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: settings.clientId,
      redirect_uri: settings.redirectUri,
      resource: settings.resource,
      code,
      code_verifier: verifier,
      ...override,
    }),
  });
}
async function sdk(token: string) {
  const client = new Client({ name: "Synthetic test client", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(settings.resource), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}
function result(r: any) {
  assert(!r.isError, JSON.stringify(r));
  return JSON.parse(r.content[0].text);
}
const intent = {
  childId: 10,
  points: 3,
  unit: "points" as const,
  type: "bonus" as const,
  reason: "Explicit fixture award",
  requestId: "10000000-0000-4000-8000-000000000001",
};

test("configuration is opt-in, requires schema and exact HTTPS client/redirect configuration", () => {
  assert.equal(loadMcpSettings({}, settings.secret).enabled, false);
  assert.throws(() =>
    loadMcpSettings({ MCP_ENABLED: "true" }, settings.secret),
  );
  const valid = {
    MCP_ENABLED: "true",
    MANUAL_POINT_SCHEMA_READY: "true",
    MCP_PUBLIC_URL: "https://family.example/mcp",
    MCP_OAUTH_CLIENT_ID: "owner-configured-public-client",
    MCP_OAUTH_REDIRECT_URI: settings.redirectUri,
  };
  assert.equal(loadMcpSettings(valid, settings.secret).enabled, true);
  for (const change of [
    { MCP_PUBLIC_URL: "http://family.example/mcp" },
    { MCP_PUBLIC_URL: "https://user:pass@family.example/mcp" },
    { MCP_OAUTH_REDIRECT_URI: "https://attacker.example/callback" },
  ])
    assert.throws(() =>
      loadMcpSettings({ ...valid, ...change }, settings.secret),
    );
});
test("OAuth PKCE exchange rejects changed resource/redirect/verifier, consumes code once, separates app tokens", async () => {
  const { code, verifier } = await authorizationCode();
  const overrides: Record<string, string>[] = [
    { resource: "https://attacker.example/mcp" },
    { redirect_uri: "https://attacker.example/cb" },
    { code_verifier: "x".repeat(43) },
  ];
  for (const override of overrides)
    assert.equal((await exchange(code, verifier, override)).status, 400);
  const response = await exchange(code, verifier);
  assert.equal(response.status, 200);
  const token = ((await response.json()) as any).access_token;
  const verified = verifyMcpToken(settings, token)!;
  assert.equal(verified.userId, 1);
  assert.equal(verified.houseId, 1);
  assert.deepEqual(verified.scopes, SCOPES);
  assert(verified.sessionId);
  assert.equal((await exchange(code, verifier)).status, 400);
  const { verifyToken } = await import("../utils/auth.js");
  assert.equal(verifyToken(token), null);
  const common = { purpose: "family-mcp", houseId: 1, scope: SCOPES.join(" ") };
  for (const options of [
    {
      issuer: "https://wrong.example",
      audience: settings.resource,
      expiresIn: 900,
    },
    { issuer: settings.issuer, audience: "wrong", expiresIn: 900 },
    { issuer: settings.issuer, audience: settings.resource, expiresIn: -1 },
  ] as const) {
    assert.equal(
      verifyMcpToken(
        settings,
        jwt.sign(common, settings.secret, { ...options, subject: "1" }),
      ),
      null,
    );
  }
  assert.equal(
    verifyMcpToken(
      settings,
      jwt.sign({ userId: 1, role: "parent", name: "Fixture" }, settings.secret),
    ),
    null,
  );
});
test("authorization rejects unknown client, downgrade PKCE, missing resource and open redirects", async () => {
  for (const q of [
    { client_id: "wrong" },
    { redirect_uri: "https://attacker.example" },
    { code_challenge_method: "plain" },
    { resource: "" },
  ]) {
    const params = new URLSearchParams({
      client_id: settings.clientId,
      redirect_uri: settings.redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      state: "s",
      resource: settings.resource,
      code_challenge_method: "S256",
      code_challenge: "a".repeat(43),
      ...q,
    });
    const r = await fetch(`${settings.issuer}/mcp/oauth/authorize?${params}`, {
      redirect: "manual",
    });
    assert.equal(r.status, 400);
    assert.equal(r.headers.get("location"), null);
  }
});
test("MCP initialize, discovery, exact child resolution and synthetic writes enforce audit and no financial effects", async () => {
  const { code, verifier } = await authorizationCode();
  const token = ((await (await exchange(code, verifier)).json()) as any)
    .access_token;
  const client = await sdk(token);
  try {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((t) => t.name).sort(),
      [
        "list_children",
        "resolve_child",
        "list_point_history",
        "record_bonus",
        "record_demerit",
        "void_point",
      ].sort(),
    );
    const kids = result(
      await client.callTool({ name: "list_children", arguments: {} }),
    ).children;
    assert.deepEqual(
      kids.map((k: any) => k.id),
      [10, 11, 12],
    );
    assert.equal(
      result(
        await client.callTool({
          name: "resolve_child",
          arguments: { name: "Alex" },
        }),
      ).match,
      "ambiguous",
    );
    assert.equal(
      result(
        await client.callTool({
          name: "resolve_child",
          arguments: { name: "Ale" },
        }),
      ).match,
      "not_found",
    );
    const added = result(
      await client.callTool({ name: "record_bonus", arguments: intent }),
    );
    assert.equal(added.point.delta, 3);
    assert.equal(added.point.source, "manual");
    assert.equal(added.point.unit, "points");
    const replay = result(
      await client.callTool({ name: "record_bonus", arguments: intent }),
    );
    assert.equal(replay.replayed, true);
    assert.equal(replay.point.id, added.point.id);
    assert.equal(
      (
        await client.callTool({
          name: "record_bonus",
          arguments: { ...intent, points: 9 },
        })
      ).isError,
      true,
    );
    assert.equal(
      (
        await client.callTool({
          name: "record_bonus",
          arguments: { ...intent, childId: 20, requestId: randomUUID() },
        })
      ).isError,
      true,
    );
    assert.equal(
      (
        await client.callTool({
          name: "record_demerit",
          arguments: { ...intent, points: 0 },
        })
      ).isError,
      true,
    );
    const deduction = result(
      await client.callTool({
        name: "record_demerit",
        arguments: {
          ...intent,
          points: 2,
          reason: "Explicit fixture demerit",
          requestId: "10000000-0000-4000-8000-000000000002",
        },
      }),
    );
    assert.equal(deduction.point.delta, -2);
    assert.deepEqual(await getChildBalance(10, true), {
      bonus: 5,
      demerit: 0,
      balance: 5,
    });
    assert.deepEqual(await getChildBalance(10), {
      bonus: 8,
      demerit: 2,
      balance: 6,
    });
    const history = result(
      await client.callTool({
        name: "list_point_history",
        arguments: { childId: 10, limit: 1 },
      }),
    );
    assert.equal(history.points.length, 1);
    assert.equal(history.nextBeforeId, deduction.point.id);
    const voided = result(
      await client.callTool({
        name: "void_point",
        arguments: {
          pointId: added.point.id,
          reason: "Owner correction fixture",
        },
      }),
    );
    assert.equal(voided.point.voidedBy, 1);
    assert(voided.point.voidedAt);
    const repeat = result(
      await client.callTool({
        name: "void_point",
        arguments: {
          pointId: added.point.id,
          reason: "Different retry reason",
        },
      }),
    );
    assert.equal(repeat.point.voidReason, "Owner correction fixture");
    assert.equal(
      (
        await client.callTool({
          name: "void_point",
          arguments: { pointId: 1, reason: "Cannot affect legacy" },
        })
      ).isError,
      true,
    );
    assert.equal(financialCalls, 0);
    for (const table of [
      "bitcoin_conversions",
      "child_credit_payouts",
      "child_onchain_wallets",
    ])
      assert.equal(
        (
          await db.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM ${table}`,
          )
        ).rows[0].n,
        0,
      );
  } finally {
    await client.close();
  }
});
test("database preserves manual intent, blocks deletion/cross-house actor, and serializes identical retries", async () => {
  const raw = { ...intent, requestId: "10000000-0000-4000-8000-000000000003" };
  const [a, b] = await Promise.all([
    recordManualPoint(1, 1, raw),
    recordManualPoint(1, 1, raw),
  ]);
  assert.equal(a.point.id, b.point.id);
  assert.equal(Number(a.replayed) + Number(b.replayed), 1);
  await assert.rejects(
    db.exec(`DELETE FROM points WHERE id=${a.point.id}`),
    /must be voided/,
  );
  await assert.rejects(
    db.exec(`UPDATE points SET parent_id=2 WHERE id=${a.point.id}`),
    /immutable/,
  );
  await assert.rejects(
    db.exec(`UPDATE points SET id=99999 WHERE id=${a.point.id}`),
    /immutable/,
  );
  await assert.rejects(
    db.exec(`UPDATE points SET reason='changed' WHERE id=${a.point.id}`),
    /immutable/,
  );
  await assert.rejects(
    recordManualPoint(1, 1, { ...raw, childId: 20 }),
    /not accessible/,
  );
  for (const change of [
    { unit: "USD" },
    { points: -1 },
    { points: 1.5 },
    { points: 2147483648 },
    { points: "3" },
    { reason: " " },
    { requestId: "bad" },
  ])
    assert.throws(() => parseManualPointIntent({ ...raw, ...change }));
  await assert.rejects(
    db.query(
      "INSERT INTO points(child_id,points,type,reason,parent_id,source,task_house_id,task_actor_id,request_id,request_fingerprint) VALUES(10,1,'bonus','Fixture mismatch',2,'manual',1,2,$1,$2)",
      [randomUUID(), "a".repeat(64)],
    ),
    /foreign key/,
  );
});
test("MCP checks read/write scopes and persisted role/house after issuance", async () => {
  const granted = await authorizationCode(SCOPES[0]);
  const validToken = (
    (await (await exchange(granted.code, granted.verifier)).json()) as any
  ).access_token;
  const read = await sdk(validToken);
  try {
    assert.equal(
      (await read.callTool({ name: "record_bonus", arguments: intent }))
        .isError,
      true,
    );
  } finally {
    await read.close();
  }
  for (const [userId, houseId] of [
    [3, 1],
    [4, 1],
    [1, 2],
  ]) {
    const r = await fetch(settings.resource, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${issueMcpToken(settings, { userId, houseId, scopes: SCOPES })}`,
      },
      body: "{}",
    });
    assert.equal(r.status, 401);
  }
  await db.exec("UPDATE users SET role='family' WHERE id=1");
  const r = await fetch(settings.resource, {
    method: "POST",
    headers: {
      authorization: `Bearer ${validToken}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 401);
  await db.exec("UPDATE users SET role='parent' WHERE id=1");
});
test("refresh rotates, detects replay, and revocation terminates existing access", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 61000 });
  const granted = await authorizationCode(SCOPES[0]);
  const initial = (await (
    await exchange(granted.code, granted.verifier)
  ).json()) as any;
  const refresh = (override: Record<string, string> = {}) =>
    fetch(`${settings.issuer}/mcp/oauth/token`, {
      method: "POST",
      headers: formHeaders,
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: settings.clientId,
        resource: settings.resource,
        refresh_token: initial.refresh_token,
        ...override,
      }),
    });
  assert.equal((await refresh({ scope: SCOPES.join(" ") })).status, 400);
  assert.equal(
    (await refresh({ resource: "https://other.example/mcp" })).status,
    400,
  );
  const rotated = (await (await refresh()).json()) as any;
  assert.notEqual(rotated.refresh_token, initial.refresh_token);
  assert.equal(rotated.scope, SCOPES[0]);
  const client = await sdk(rotated.access_token);
  await client.close();
  assert.equal((await refresh()).status, 400);
  const replayDenied = await fetch(settings.resource, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${rotated.access_token}`,
    },
    body: "{}",
  });
  assert.equal(replayDenied.status, 401);
  const next = await authorizationCode(SCOPES[0]);
  const another = (await (
    await exchange(next.code, next.verifier)
  ).json()) as any;
  const revoked = await fetch(`${settings.issuer}/mcp/oauth/revoke`, {
    method: "POST",
    headers: formHeaders,
    body: new URLSearchParams({
      client_id: settings.clientId,
      token: another.refresh_token,
    }),
  });
  assert.equal(revoked.status, 200);
  const access = await fetch(settings.resource, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${another.access_token}`,
    },
    body: "{}",
  });
  assert.equal(access.status, 401);
  assert.equal(
    (await refresh({ refresh_token: another.refresh_token })).status,
    400,
  );
  const racing = await authorizationCode(SCOPES[0]);
  const race = (await (
    await exchange(racing.code, racing.verifier)
  ).json()) as any;
  const concurrent = await Promise.all([
    refresh({ refresh_token: race.refresh_token }),
    refresh({ refresh_token: race.refresh_token }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 400]);
  const winner = (await concurrent
    .find((r) => r.status === 200)!
    .json()) as any;
  assert.equal(
    (
      await fetch(settings.resource, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${winner.access_token}`,
        },
        body: "{}",
      })
    ).status,
    401,
  );
});
test("refresh cannot extend the original thirty-day authorization lifetime", async (t) => {
  const start = Date.now() + 120000;
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const granted = await authorizationCode(SCOPES[0]);
  const original = (await (
    await exchange(granted.code, granted.verifier)
  ).json()) as any;
  await db.query(
    "UPDATE family_oauth.sessions SET idle_until=expires_at WHERE id_hash=$1",
    [tokenHash(verifyMcpToken(settings, original.access_token)!.sessionId!)],
  );
  t.mock.timers.setTime(start + SESSION_LIFETIME - 60000);
  const refresh = await fetch(`${settings.issuer}/mcp/oauth/token`, {
    method: "POST",
    headers: formHeaders,
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: settings.clientId,
      resource: settings.resource,
      refresh_token: original.refresh_token,
    }),
  });
  assert.equal(refresh.status, 200);
  const fresh = (await refresh.json()) as any;
  assert(verifyMcpToken(settings, fresh.access_token));
  t.mock.timers.setTime(start + SESSION_LIFETIME + 1);
  assert(
    verifyMcpToken(settings, fresh.access_token),
    "JWT itself is still within fifteen minutes",
  );
  const denied = await fetch(settings.resource, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${fresh.access_token}`,
    },
    body: "{}",
  });
  assert.equal(denied.status, 401);
});
test("OAuth metadata, challenge, bounded ephemeral state and disabled router", async () => {
  const metadata = (await (
    await fetch(`${settings.issuer}/.well-known/oauth-protected-resource/mcp`)
  ).json()) as any;
  assert.equal(metadata.resource, settings.resource);
  const discovery = (await (
    await fetch(`${settings.issuer}/.well-known/oauth-authorization-server`)
  ).json()) as any;
  assert.deepEqual(discovery.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(discovery.token_endpoint_auth_methods_supported, ["none"]);
  const denied = await fetch(settings.resource, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("www-authenticate")!, /resource_metadata=/);
  const s = new ExpiringStore<string>(-1);
  assert.equal(s.get(s.put("expired")), null);
  const bounded = new ExpiringStore<string>(1000, 1);
  const key = bounded.put("one");
  assert.throws(() => bounded.put("two"));
  assert.equal(bounded.take(key), "one");
  assert.equal(bounded.take(key), null);
  const disabled = express();
  disabled.use(createFamilyMcpRouter({ ...settings, enabled: false }));
  const ds = disabled.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => ds.once("listening", resolve));
  try {
    assert.equal(
      (
        await fetch(
          `http://127.0.0.1:${(ds.address() as AddressInfo).port}/mcp`,
        )
      ).status,
      404,
    );
  } finally {
    await new Promise<void>((resolve) => ds.close(() => resolve()));
  }
});

test("durable hashed grants survive store recreation, binding changes fail closed, idle expiry and revocation persist", async (t) => {
  const grant = await durableSessions.create({
    userId: 1,
    houseId: 1,
    scopes: [SCOPES[0]],
  });
  const restarted = new DatabaseSessionStore(sqlDatabase, settings);
  assert(await restarted.active(grant.sessionId));
  const persisted = await db.query(
    "SELECT id_hash FROM family_oauth.sessions WHERE id_hash=$1",
    [tokenHash(grant.sessionId)],
  );
  assert.equal(persisted.rows.length, 1);
  const refresh = await db.query(
    "SELECT token_hash FROM family_oauth.refresh_tokens WHERE token_hash=$1",
    [tokenHash(grant.refreshToken)],
  );
  assert.equal(refresh.rows.length, 1);
  assert.notEqual(
    (refresh.rows[0] as { token_hash: string }).token_hash,
    grant.refreshToken,
  );
  const other = new DatabaseSessionStore(sqlDatabase, {
    ...settings,
    clientId: "other-client",
  });
  assert.equal(await other.active(grant.sessionId), false);
  assert.equal(await other.rotate(grant.refreshToken), null);
  const rotated = await restarted.rotate(grant.refreshToken);
  assert(rotated);
  assert(await restarted.active(rotated.sessionId));
  await new DatabaseSessionStore(sqlDatabase, settings).revoke(
    "",
    rotated.sessionId,
  );
  assert.equal(await durableSessions.active(grant.sessionId), false);
  assert.equal(await durableSessions.active(rotated.sessionId), false);
  assert.equal(await durableSessions.rotate(rotated.refreshToken), null);
  const idle = await durableSessions.create({
    userId: 1,
    houseId: 1,
    scopes: [SCOPES[0]],
  });
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + SESSION_IDLE + 1 });
  assert.equal(await restarted.active(idle.sessionId), false);
  assert.equal(await restarted.rotate(idle.refreshToken), null);
});
