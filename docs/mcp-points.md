# Parent-authorized Family App MCP

The existing backend exposes a stateless Streamable HTTP MCP endpoint at `/mcp` when explicitly enabled. It supports general bonuses and demerits without inventing a chore association. All amounts are positive integers in **points**; a bonus returns a positive signed delta and a demerit a negative one. Points are not currency. No MCP tool fetches prices, creates conversions, signs a wallet, generates addresses or sends money.

Tools: `list_children`, `resolve_child` (exact names; ambiguity returns candidates), `list_point_history` (maximum 50 records per page), `record_bonus`, `record_demerit`, `void_point`. Writes require an explicit child ID, integer amount, `unit=points`, nonempty reason and UUID `requestId`. Reuse the same ID for a retry. Changing the intent under that ID fails. The database protects audit intent, actor and ID from mutation and requires voiding instead of deletion. A fingerprint binds the submitted intent; it is a SHA-256 hash, not a cryptographic ledger signature. Authentication and persisted actor/house relationships identify the responsible parent. Financial balance queries continue to select only legacy points.

## Deploy and configure only after review

Use the existing service; do not create a new Render service or expose backend keys to the SPA. Complete the approved compatibility/task/chores cutover and apply `supabase/migrations/20261011210000_manual_point_tracking.sql` after the task-point migration. Validate any deliberately NOT VALID compatibility constraints. Back up and restore first, and keep existing ledger/wallet history intact.

Initially keep `MCP_ENABLED=false` and `MANUAL_POINT_SCHEMA_READY=false`. After the reviewed manual migration and complete private backend configuration:

```
MANUAL_POINT_SCHEMA_READY=true
MCP_ENABLED=true
MCP_PUBLIC_URL=https://family-app-ksog.onrender.com/mcp
MCP_OAUTH_CLIENT_ID=<exact predefined public client ID configured in the plugin>
MCP_OAUTH_REDIRECT_URI=<exact HTTPS callback shown by the plugin setup>
```

The callback must be an exact allowed ChatGPT URI; the server does not accept arbitrary redirects. Configure OAuth authorization code with PKCE S256 and public-client token authentication `none` (no client secret). This implementation deliberately uses a predefined client: it does not advertise CIMD or dynamic registration. The actual connection UI must support that public-client configuration; if it does not, report the incompatibility rather than using no-auth or a fixed API key. Metadata is at `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`; unauthenticated MCP requests return a discovery challenge.

The owner logs in personally using the existing Family App parent account and explicitly consents. No new user identity directory, persistent MCP API key, OAuth client secret or separate signing secret is created. MCP JWTs are purpose-, issuer-, audience-, expiry- and scope-bound, and are rejected as app login tokens. Each request checks the current persisted parent role and house; each point operation checks child ownership. Backend private credentials remain owner-entered.

## Token lifecycle and deployment limit

Access tokens last 15 minutes. Single-use rotating refresh tokens renew them within a fixed eight-hour authorization grant. Reusing an old refresh token revokes the whole session, including already-issued access tokens; concurrent reuse is treated as replay and likewise revokes the session. Revocation terminates access immediately. Scopes cannot be upgraded by refresh.

Authorization requests, codes, refresh lineage and sessions are bounded and held in memory for the existing single process. Restart, redeploy or the eight-hour limit requires the owner to reauthorize; no persistent refresh credential is generated or stored in the database. Multi-process or durable unattended use would require a separately reviewed shared session store. Do not add horizontal instances without that change.

## Acceptance verification

`npm run test:mcp --workspace backend` performs actual SDK initialize/tool discovery/calls against synthetic local HTTP and PostgreSQL fixtures, including OAuth consent/PKCE, invalid token claims, scope/house/role denial, retry conflicts, refresh replay/expiry, immutable audit and unchanged legacy financial balance. `npm test --workspace backend` includes this suite. No test uses a production child or creates real points.

After reviewed deployment, the owner creates and installs the custom MCP plugin using the endpoint and OAuth settings above. First verify tool discovery and an authenticated own-house read through the installed plugin. Do not claim Sunny can operate the app until that connection succeeds. A real write requires the user to explicitly select child, bonus/demerit, points and reason; do not invent an award to test production.
