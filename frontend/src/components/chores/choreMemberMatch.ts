import type { ChoreHouseholdMember } from '../../utils/api';

export function findHouseholdMemberForChildName(
  members: ChoreHouseholdMember[],
  childName: string
): ChoreHouseholdMember | undefined {
  const n = childName.trim().toLowerCase();
  return members.find((m) => m.name.trim().toLowerCase() === n);
}

/** Parent login name ↔ household member with template-edit permission (e.g. Celiane). */
export function findChoreEditorMember(
  members: ChoreHouseholdMember[],
  loginName: string
): ChoreHouseholdMember | undefined {
  const n = loginName.trim().toLowerCase();
  return members.find(
    (m) => m.canEditChores && m.name.trim().toLowerCase() === n
  );
}

/**
 * Resolves which household member id to send as `X-Editor-User-Id` for template APIs.
 * Prefer a member with `canEditChores` whose name matches the login display name; otherwise,
 * for parent accounts only, use the first editor member so the UI stays usable when names differ slightly.
 */
export function resolveChoreEditorMemberIdForParentUi(
  members: ChoreHouseholdMember[],
  loginName: string | undefined,
  isParent: boolean
): number | null {
  if (members.length === 0) return null;
  const trimmed = loginName?.trim();
  if (trimmed) {
    const byName = findChoreEditorMember(members, trimmed);
    if (byName) return byName.id;
  }
  if (!isParent) return null;
  const editors = members.filter((m) => m.canEditChores).sort((a, b) => a.id - b.id);
  return editors[0]?.id ?? null;
}
