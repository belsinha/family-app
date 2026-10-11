import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";

export const READ_SCOPE = "family:points:read";
export const WRITE_SCOPE = "family:points:write";
export const SCOPES = [READ_SCOPE, WRITE_SCOPE];
export interface McpSettings {
  enabled: boolean;
  resource: string;
  issuer: string;
  clientId: string;
  redirectUri: string;
  secret: string;
}
export function loadMcpSettings(
  env: NodeJS.ProcessEnv,
  secret: string,
): McpSettings {
  const enabled = env.MCP_ENABLED === "true";
  const disabled = {
    enabled: false,
    resource: "",
    issuer: "",
    clientId: "",
    redirectUri: "",
    secret,
  };
  if (!enabled) return disabled;
  if (env.MANUAL_POINT_SCHEMA_READY !== "true")
    throw new Error("MCP requires the reviewed manual-point schema");
  let resource: URL, redirect: URL;
  try {
    resource = new URL(env.MCP_PUBLIC_URL ?? "");
    redirect = new URL(env.MCP_OAUTH_REDIRECT_URI ?? "");
  } catch {
    throw new Error(
      "Configure the canonical MCP URL and exact OAuth redirect URI",
    );
  }
  if (
    resource.protocol !== "https:" ||
    resource.pathname !== "/mcp" ||
    resource.search ||
    resource.hash ||
    resource.username ||
    resource.password ||
    redirect.protocol !== "https:" ||
    redirect.origin !== "https://chatgpt.com" ||
    redirect.search ||
    redirect.hash ||
    redirect.username ||
    redirect.password ||
    !(
      /^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(redirect.pathname) ||
      redirect.pathname === "/connector_platform_oauth_redirect"
    ) ||
    !env.MCP_OAUTH_CLIENT_ID?.trim() ||
    secret.length < 32
  )
    throw new Error("Invalid MCP OAuth configuration");
  return {
    enabled: true,
    resource: resource.href,
    issuer: resource.origin,
    clientId: env.MCP_OAUTH_CLIENT_ID.trim(),
    redirectUri: redirect.href,
    secret,
  };
}
export interface McpIdentity {
  userId: number;
  houseId: number;
  scopes: string[];
  sessionId?: string;
}
export function issueMcpToken(
  settings: McpSettings,
  identity: McpIdentity,
): string {
  return jwt.sign(
    {
      purpose: "family-mcp",
      houseId: identity.houseId,
      scope: identity.scopes.join(" "),
      sid: identity.sessionId,
    },
    settings.secret,
    {
      algorithm: "HS256",
      issuer: settings.issuer,
      audience: settings.resource,
      subject: String(identity.userId),
      expiresIn: "15m",
    },
  );
}
export function verifyMcpToken(
  settings: McpSettings,
  token: string,
): McpIdentity | null {
  try {
    const p = jwt.verify(token, settings.secret, {
      algorithms: ["HS256"],
      issuer: settings.issuer,
      audience: settings.resource,
    }) as jwt.JwtPayload;
    const userId = Number(p.sub);
    const scopes = typeof p.scope === "string" ? p.scope.split(" ") : [];
    if (
      p.purpose !== "family-mcp" ||
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      String(userId) !== p.sub ||
      !Number.isSafeInteger(p.houseId) ||
      p.houseId <= 0 ||
      typeof p.exp !== "number" ||
      typeof p.iat !== "number" ||
      p.exp - p.iat > 900 ||
      !scopes.length ||
      scopes.some((s) => !SCOPES.includes(s)) ||
      (p.sid != null &&
        (typeof p.sid !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(p.sid)))
    )
      return null;
    return {
      userId,
      houseId: p.houseId,
      scopes,
      ...(p.sid ? { sessionId: p.sid } : {}),
    };
  } catch {
    return null;
  }
}
export interface AuthorizationIntent {
  redirectUri: string;
  state: string;
  challenge: string;
  resource: string;
  scopes: string[];
}
export function parseAuthorization(
  settings: McpSettings,
  q: Record<string, unknown>,
): AuthorizationIntent | null {
  if (
    q.client_id !== settings.clientId ||
    q.redirect_uri !== settings.redirectUri ||
    q.response_type !== "code" ||
    q.resource !== settings.resource ||
    q.code_challenge_method !== "S256" ||
    typeof q.code_challenge !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge) ||
    typeof q.state !== "string" ||
    !q.state ||
    q.state.length > 1024 ||
    typeof q.scope !== "string"
  )
    return null;
  const scopes = [...new Set(q.scope.split(" ").filter(Boolean))];
  if (!scopes.length || scopes.some((s) => !SCOPES.includes(s))) return null;
  return {
    redirectUri: settings.redirectUri,
    state: q.state,
    challenge: q.code_challenge,
    resource: settings.resource,
    scopes,
  };
}
export class ExpiringStore<T> {
  private values = new Map<string, { expires: number; value: T }>();
  constructor(
    private ttl: number,
    private capacity = 500,
  ) {}
  put(value: T, expires?: number): string {
    const key = randomBytes(32).toString("base64url");
    this.remember(key, value, expires);
    return key;
  }
  remember(key: string, value: T, expires?: number): void {
    for (const [key, v] of this.values)
      if (v.expires <= Date.now()) this.values.delete(key);
    if (this.values.size >= this.capacity)
      throw new Error("Authorization capacity reached");
    this.values.set(key, {
      expires: Math.min(expires ?? Infinity, Date.now() + this.ttl),
      value,
    });
  }
  get(key: string): T | null {
    const v = this.values.get(key);
    if (!v || v.expires <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return v.value;
  }
  take(key: string): T | null {
    const v = this.get(key);
    this.values.delete(key);
    return v;
  }
}
export function verifyPkce(verifier: unknown, challenge: string): boolean {
  if (
    typeof verifier !== "string" ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)
  )
    return false;
  const calculated = createHash("sha256").update(verifier).digest("base64url");
  return (
    calculated.length === challenge.length &&
    timingSafeEqual(Buffer.from(calculated), Buffer.from(challenge))
  );
}
