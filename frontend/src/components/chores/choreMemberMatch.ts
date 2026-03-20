import type { ChoreHouseholdMember } from '../../utils/api';

export function findHouseholdMemberForChildName(
  members: ChoreHouseholdMember[],
  childName: string
): ChoreHouseholdMember | undefined {
  const n = childName.trim().toLowerCase();
  return members.find((m) => m.name.trim().toLowerCase() === n);
}
