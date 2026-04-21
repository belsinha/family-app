export const CHORE_HOUSE_AREAS = [
  'NONE',
  'KITCHEN',
  'BATHROOM',
  'BEDROOM',
  'LIVING',
  'DINING',
  'LAUNDRY',
  'OFFICE',
  'HALLWAY',
  'GARAGE',
  'OUTDOOR',
  'BASEMENT',
  'ATTIC',
  'PLAYROOM',
  'OTHER',
] as const;

export type ChoreHouseAreaCode = (typeof CHORE_HOUSE_AREAS)[number];

const ALLOWED = new Set<string>(CHORE_HOUSE_AREAS);

export function parseChoreHouseArea(input: unknown): ChoreHouseAreaCode {
  if (typeof input !== 'string') return 'NONE';
  const u = input.trim().toUpperCase();
  return ALLOWED.has(u) ? (u as ChoreHouseAreaCode) : 'NONE';
}
