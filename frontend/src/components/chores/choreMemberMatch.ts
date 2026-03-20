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
