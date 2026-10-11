import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import type { McpIdentity, McpSettings } from "./oauth.js";

export const SESSION_LIFETIME = 30 * 24 * 60 * 60_000;
export const SESSION_IDLE = 7 * 24 * 60 * 60_000;
export interface Grant {
  identity: McpIdentity;
  expires: number;
  sessionId: string;
  refreshToken: string;
}
export interface SessionStore {
  create(identity: McpIdentity): Promise<Grant>;
  active(sessionId: string): Promise<boolean>;
  inspect(token: string): Promise<McpIdentity | null>;
  rotate(token: string): Promise<Grant | null>;
  revoke(token: string, sessionId?: string): Promise<void>;
}
export interface SqlConnection {
  query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>;
}
export interface SqlDatabase extends SqlConnection {
  transaction<T>(fn: (db: SqlConnection) => Promise<T>): Promise<T>;
}
const random = () => randomBytes(32).toString("base64url");
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** All persisted bearer identifiers are one-way hashes. Rotation locks the lineage before inspecting reuse. */
export class DatabaseSessionStore implements SessionStore {
  private binding: string;
  constructor(
    private db: SqlDatabase,
    settings: McpSettings,
  ) {
    this.binding = tokenHash(
      JSON.stringify([
        settings.issuer,
        settings.resource,
        settings.clientId,
        settings.redirectUri,
      ]),
    );
  }
  async create(identity: McpIdentity): Promise<Grant> {
    const sessionId = random(),
      refreshToken = random(),
      now = Date.now(),
      expires = now + SESSION_LIFETIME;
    await this.db.transaction(async (db) => {
      // Expired lineages no longer authorize tokens; cleanup cascades their hashes.
      await db.query(
        "DELETE FROM family_oauth.sessions WHERE expires_at <= $1",
        [now],
      );
      await db.query(
        `INSERT INTO family_oauth.sessions(id_hash,binding,user_id,house_id,scopes,expires_at,idle_until) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          tokenHash(sessionId),
          this.binding,
          identity.userId,
          identity.houseId,
          identity.scopes,
          expires,
          now + SESSION_IDLE,
        ],
      );
      await db.query(
        "INSERT INTO family_oauth.refresh_tokens(token_hash,session_hash) VALUES($1,$2)",
        [tokenHash(refreshToken), tokenHash(sessionId)],
      );
    });
    return { identity, sessionId, refreshToken, expires };
  }
  async active(sessionId: string) {
    const { rows } = await this.db.query(
      `SELECT 1 FROM family_oauth.sessions WHERE (id_hash=$1 OR id_hash IN (SELECT session_hash FROM family_oauth.session_aliases WHERE id_hash=$1)) AND binding=$2 AND NOT revoked AND expires_at>$3 AND idle_until>$3`,
      [tokenHash(sessionId), this.binding, Date.now()],
    );
    return rows.length === 1;
  }
  async inspect(token: string): Promise<McpIdentity | null> {
    const { rows } = await this.db.query(
      `SELECT s.user_id,s.house_id,s.scopes FROM family_oauth.sessions s JOIN family_oauth.refresh_tokens t ON t.session_hash=s.id_hash WHERE t.token_hash=$1 AND s.binding=$2 AND NOT s.revoked AND s.expires_at>$3 AND s.idle_until>$3`,
      [tokenHash(token), this.binding, Date.now()],
    );
    const r = rows[0];
    return r
      ? { userId: r.user_id, houseId: r.house_id, scopes: r.scopes }
      : null;
  }
  async rotate(token: string): Promise<Grant | null> {
    return this.db.transaction(async (db) => {
      const hash = tokenHash(token),
        now = Date.now();
      const { rows: found } = await db.query(
        "SELECT session_hash FROM family_oauth.refresh_tokens WHERE token_hash=$1",
        [hash],
      );
      if (!found.length) return null;
      const { rows } = await db.query(
        "SELECT * FROM family_oauth.sessions WHERE id_hash=$1 AND binding=$2 FOR UPDATE",
        [found[0].session_hash, this.binding],
      );
      const s = rows[0];
      if (
        !s ||
        s.revoked ||
        Number(s.expires_at) <= now ||
        Number(s.idle_until) <= now
      )
        return null;
      const { rows: tokens } = await db.query(
        "SELECT used FROM family_oauth.refresh_tokens WHERE token_hash=$1",
        [hash],
      );
      if (tokens[0]?.used) {
        await db.query(
          "UPDATE family_oauth.sessions SET revoked=true WHERE id_hash=$1",
          [s.id_hash],
        );
        return null; // Commit revocation even when the caller receives invalid_grant.
      }
      const refreshToken = random(),
        sessionId = random();
      // New hashed access-session alias points to the same revocable lineage.
      await db.query(
        "INSERT INTO family_oauth.session_aliases(id_hash,session_hash) VALUES($1,$2)",
        [tokenHash(sessionId), s.id_hash],
      );
      await db.query(
        "UPDATE family_oauth.refresh_tokens SET used=true WHERE token_hash=$1",
        [hash],
      );
      await db.query(
        "INSERT INTO family_oauth.refresh_tokens(token_hash,session_hash) VALUES($1,$2)",
        [tokenHash(refreshToken), s.id_hash],
      );
      await db.query(
        "UPDATE family_oauth.sessions SET idle_until=$2 WHERE id_hash=$1",
        [s.id_hash, Math.min(Number(s.expires_at), now + SESSION_IDLE)],
      );
      return {
        identity: { userId: s.user_id, houseId: s.house_id, scopes: s.scopes },
        sessionId,
        refreshToken,
        expires: Number(s.expires_at),
      };
    });
  }
  async revoke(token: string, sessionId?: string) {
    await this.db.query(
      `UPDATE family_oauth.sessions SET revoked=true WHERE binding=$1 AND (id_hash=$2 OR id_hash IN (SELECT session_hash FROM family_oauth.session_aliases WHERE id_hash=$2) OR id_hash IN (SELECT session_hash FROM family_oauth.refresh_tokens WHERE token_hash=$3))`,
      [this.binding, tokenHash(sessionId ?? ""), tokenHash(token)],
    );
  }
}
let pool: Pool | undefined;
export function productionSessionStore(settings: McpSettings): SessionStore {
  const url = process.env.CHORES_DATABASE_URL;
  if (!url || !/^postgres(ql)?:/.test(url))
    throw new Error("MCP requires durable PostgreSQL OAuth storage");
  pool ??= new Pool({
    connectionString: url,
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", () => {}); // Never expose connection credentials in background error output.
  const p = pool;
  return new DatabaseSessionStore(
    {
      query: (sql, values) => p.query(sql, values),
      transaction: async (fn) => {
        const c = await p.connect();
        try {
          await c.query("BEGIN");
          const result = await fn(c);
          await c.query("COMMIT");
          return result;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
    },
    settings,
  );
}
