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

export const CHORE_HOUSE_AREA_LABELS: Record<ChoreHouseAreaCode, string> = {
  NONE: 'Not specified',
  KITCHEN: 'Kitchen',
  BATHROOM: 'Bathroom',
  BEDROOM: 'Bedroom',
  LIVING: 'Living / family room',
  DINING: 'Dining',
  LAUNDRY: 'Laundry',
  OFFICE: 'Office / study',
  HALLWAY: 'Hallway / stairs',
  GARAGE: 'Garage',
  OUTDOOR: 'Outdoor / yard',
  BASEMENT: 'Basement',
  ATTIC: 'Attic',
  PLAYROOM: 'Playroom',
  OTHER: 'Other',
};

const ALLOWED = new Set<string>(CHORE_HOUSE_AREAS);

export function normalizeHouseArea(raw: string | undefined | null): ChoreHouseAreaCode {
  if (raw && ALLOWED.has(raw)) {
    return raw as ChoreHouseAreaCode;
  }
  return 'NONE';
}
