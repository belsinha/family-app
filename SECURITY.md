# Security Policy

This is a private family app, not a public product — there's no bug bounty and no dedicated
security team. If you (family member, collaborator, or anyone who finds this repo) notice a
security problem — a leaked credential, an auth bypass, anything that could expose family or
child data — tell Rommel or Celiane directly rather than opening a public GitHub issue.

## Operational security

Day-to-day security procedures (backups, key rotation, log review, session revocation, data
retention/deletion, and privacy handling for AI-parsed uploads) live in
[`docs/security-runbook.md`](docs/security-runbook.md). Start there for anything operational.

## Known, already-documented issues

- An old shared Supabase dev key is present in this repo's git history and must be treated as
  permanently compromised (rotate, don't rely on removal) — see the runbook's Supabase section
  and the README's "Security: rotate the Supabase key".
- There is no server-side JWT revocation — see the runbook's "Session/key revocation steps" and
  the README's "Security: authentication posture" for what that does and doesn't cover today.
