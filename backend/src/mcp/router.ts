import express, { Router } from "express";
import {
  productionSessionStore,
  type SessionStore,
  type Grant,
} from "./sessionStore.js";
import { randomBytes } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  createRateLimiter,
  loginIpRateLimiter,
  loginNameRateLimiter,
} from "../middleware/rateLimit.js";
import {
  normalizeLoginName,
  comparePassword,
  MAX_PASSWORD_LENGTH,
} from "../utils/auth.js";
import { getUserByName } from "../db/queries/users.js";
import {
  visibleChildren,
  recordManualPoint,
  pointHistory,
  voidAuditedPoint,
  assertCurrentParent,
} from "../services/manualPoints.js";
import { createPointMcpServer, type PointTools } from "./tools.js";
import {
  ExpiringStore,
  SCOPES,
  parseAuthorization,
  issueMcpToken,
  verifyMcpToken,
  verifyPkce,
  type McpSettings,
  type McpIdentity,
  type AuthorizationIntent,
} from "./oauth.js";

export interface McpDependencies {
  login(
    name: string,
    password: string,
  ): Promise<{ userId: number; houseId: number } | null>;
  parent(userId: number, houseId: number): Promise<unknown>;
  tools: PointTools;
  sessions?: SessionStore;
}
const production: McpDependencies = {
  login: async (name, password) => {
    const user = await getUserByName(normalizeLoginName(name));
    if (
      user?.role !== "parent" ||
      user.house_id == null ||
      !user.password_hash ||
      !(await comparePassword(password, user.password_hash))
    )
      return null;
    return { userId: user.id, houseId: user.house_id };
  },
  parent: assertCurrentParent,
  tools: {
    children: visibleChildren,
    record: recordManualPoint,
    history: pointHistory,
    void: voidAuditedPoint,
  },
};
type Pending = { intent: AuthorizationIntent; csrf: string };
type Code = { intent: AuthorizationIntent; identity: McpIdentity };
function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function createFamilyMcpRouter(
  settings: McpSettings,
  deps: McpDependencies = production,
) {
  const router = Router();
  if (!settings.enabled) return router;
  const pending = new ExpiringStore<Pending>(10 * 60_000);
  const codes = new ExpiringStore<Code>(60_000);
  const sessions = deps.sessions ?? productionSessionStore(settings);
  const limited = createRateLimiter("Too many MCP requests", {
    windowMs: 60_000,
    limit: 60,
  });
  router.use((req, res, next) => {
    // No credential-bearing request is allowed to an alternate host/origin.
    if (req.path.startsWith("/mcp") || req.path.startsWith("/.well-known/")) {
      res.setHeader("Cache-Control", "no-store");
      if (
        req.get("host") !== new URL(settings.issuer).host ||
        (req.get("origin") && req.get("origin") !== settings.issuer)
      )
        return res.status(403).json({ error: "Unapproved host or origin" });
    }
    next();
  });
  const resourceMetadata = {
    resource: settings.resource,
    authorization_servers: [settings.issuer],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
  };
  router.get(
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ],
    (_req, res) => res.json(resourceMetadata),
  );
  router.get("/.well-known/oauth-authorization-server", (_req, res) =>
    res.json({
      issuer: settings.issuer,
      authorization_endpoint: `${settings.issuer}/mcp/oauth/authorize`,
      token_endpoint: `${settings.issuer}/mcp/oauth/token`,
      revocation_endpoint: `${settings.issuer}/mcp/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: SCOPES,
      authorization_response_iss_parameter_supported: true,
    }),
  );
  const form = (res: express.Response, key: string, p: Pending, error = "") => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    res
      .type("html")
      .send(
        `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conectar Family App</title><h1>Conectar Family App ao ChatGPT</h1><p>Autorize acesso às crianças da sua casa e ao histórico de pontos${p.intent.scopes.includes("family:points:write") ? ", incluindo registrar e anular bônus e deméritos com motivo" : ""}. Nenhuma operação de dinheiro ou carteira está incluída.</p><p>${escapeHtml(error)}</p><form method="post" action="/mcp/oauth/authorize"><input type="hidden" name="request" value="${escapeHtml(key)}"><input type="hidden" name="csrf" value="${escapeHtml(p.csrf)}"><label>Nome de responsável <input name="name" required maxlength="200" autocomplete="username"></label><label>Senha do Family App <input name="password" type="password" required maxlength="128" autocomplete="current-password"></label><button name="consent" value="allow">Entrar e autorizar</button><button name="consent" value="deny" formnovalidate>Cancelar</button></form></html>`,
      );
  };
  const redirect = (
    res: express.Response,
    intent: AuthorizationIntent,
    params: Record<string, string>,
  ) => {
    const url = new URL(intent.redirectUri);
    url.searchParams.set("state", intent.state);
    url.searchParams.set("iss", settings.issuer);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return res.redirect(303, url.href);
  };
  router.get("/mcp/oauth/authorize", limited, (req, res) => {
    const intent = parseAuthorization(settings, req.query);
    if (!intent)
      return res.status(400).json({ error: "Invalid authorization request" });
    try {
      const p = { intent, csrf: randomBytes(32).toString("base64url") },
        key = pending.put(p);
      res.cookie("family_mcp_consent", key, {
        httpOnly: true,
        secure: new URL(settings.issuer).protocol === "https:",
        sameSite: "lax",
        path: "/mcp/oauth/authorize",
        maxAge: 10 * 60_000,
      });
      return form(res, key, p);
    } catch {
      return res.status(503).json({ error: "Try authorization again later" });
    }
  });
  router.post(
    "/mcp/oauth/authorize",
    express.urlencoded({ extended: false, limit: "8kb" }),
    loginIpRateLimiter,
    loginNameRateLimiter,
    async (req, res) => {
      const key = typeof req.body?.request === "string" ? req.body.request : "";
      const p = pending.get(key);
      const cookie = req.headers.cookie
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("family_mcp_consent="))
        ?.slice("family_mcp_consent=".length);
      if (
        !p ||
        cookie !== key ||
        req.body?.csrf !== p.csrf ||
        req.get("origin") !== settings.issuer
      )
        return res
          .status(400)
          .json({ error: "Expired or invalid consent request" });
      if (req.body.consent === "deny") {
        pending.take(key);
        return redirect(res, p.intent, { error: "access_denied" });
      }
      if (
        req.body.consent !== "allow" ||
        typeof req.body.name !== "string" ||
        !normalizeLoginName(req.body.name) ||
        typeof req.body.password !== "string" ||
        !req.body.password ||
        req.body.password.length > MAX_PASSWORD_LENGTH
      )
        return res
          .status(400)
          .json({ error: "Name, password and explicit consent required" });
      try {
        const identity = await deps.login(req.body.name, req.body.password);
        if (!identity)
          return form(
            res,
            key,
            p,
            "Nome ou senha inválidos, ou conta sem acesso de responsável.",
          );
        // Login awaited: another concurrent consent may already have consumed the request.
        if (!pending.take(key))
          return res.status(400).json({ error: "Consent already used" });
        await deps.parent(identity.userId, identity.houseId);
        const code = codes.put({
          intent: p.intent,
          identity: { ...identity, scopes: p.intent.scopes },
        });
        res.clearCookie("family_mcp_consent", { path: "/mcp/oauth/authorize" });
        return redirect(res, p.intent, { code });
      } catch {
        return res.status(503).json({ error: "Authorization unavailable" });
      }
    },
  );
  router.post(
    "/mcp/oauth/token",
    express.urlencoded({ extended: false, limit: "8kb" }),
    limited,
    async (req, res) => {
      const b = req.body ?? {},
        key = typeof b.code === "string" ? b.code : "";
      if (
        b.client_id !== settings.clientId ||
        b.client_secret != null ||
        req.headers.authorization
      )
        return res.status(400).json({ error: "invalid_client" });
      const response = (grant: Grant) => ({
        access_token: issueMcpToken(settings, {
          ...grant.identity,
          sessionId: grant.sessionId,
        }),
        token_type: "Bearer",
        expires_in: 900,
        scope: grant.identity.scopes.join(" "),
        refresh_token: grant.refreshToken,
      });
      if (b.grant_type === "refresh_token") {
        const token =
          typeof b.refresh_token === "string" ? b.refresh_token : "";
        try {
          const identity = await sessions.inspect(token);
          if (
            !identity ||
            b.resource !== settings.resource ||
            (b.scope != null && b.scope !== identity.scopes.join(" "))
          )
            return res.status(400).json({ error: "invalid_grant" });
          await deps.parent(identity.userId, identity.houseId);
          const grant = await sessions.rotate(token);
          return grant
            ? res.json(response(grant))
            : res.status(400).json({ error: "invalid_grant" });
        } catch {
          return res.status(400).json({ error: "invalid_grant" });
        }
      }
      const code = codes.get(key);
      if (
        b.grant_type !== "authorization_code" ||
        b.client_id !== settings.clientId ||
        b.redirect_uri !== settings.redirectUri ||
        b.resource !== settings.resource ||
        !code ||
        !verifyPkce(b.code_verifier, code.intent.challenge)
      )
        return res.status(400).json({ error: "invalid_grant" });
      try {
        await deps.parent(code.identity.userId, code.identity.houseId);
        if (!codes.take(key))
          return res.status(400).json({ error: "invalid_grant" });
        return res.json(response(await sessions.create(code.identity)));
      } catch {
        return res.status(400).json({ error: "invalid_grant" });
      }
    },
  );
  router.post(
    "/mcp/oauth/revoke",
    express.urlencoded({ extended: false, limit: "8kb" }),
    limited,
    async (req, res) => {
      const b = req.body ?? {};
      if (
        b.client_id !== settings.clientId ||
        b.client_secret != null ||
        req.headers.authorization
      )
        return res.status(400).json({ error: "invalid_client" });
      const token = typeof b.token === "string" ? b.token : "";
      try {
        await sessions.revoke(
          token,
          verifyMcpToken(settings, token)?.sessionId,
        );
      } catch {
        return res.status(503).json({ error: "Revocation unavailable" });
      }
      return res.status(200).end();
    },
  );
  router.all("/mcp", limited, async (req, res) => {
    const raw = req.headers.authorization;
    const identity = raw?.startsWith("Bearer ")
      ? verifyMcpToken(settings, raw.slice(7))
      : null;
    const challenge = () => {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${settings.issuer}/.well-known/oauth-protected-resource/mcp", scope="${SCOPES.join(" ")}"`,
      );
      return res
        .status(401)
        .json({ error: "MCP OAuth authorization required" });
    };
    try {
      if (!identity?.sessionId || !(await sessions.active(identity.sessionId)))
        return challenge();
      await deps.parent(identity.userId, identity.houseId);
    } catch {
      return challenge();
    }
    if (req.method !== "POST")
      return res.status(405).setHeader("Allow", "POST").end();
    const server = createPointMcpServer(identity, deps.tools);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent)
        res.status(500).json({ error: "MCP request failed" });
    }
  });
  return router;
}
