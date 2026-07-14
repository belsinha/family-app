import { createRequire } from 'node:module';
import { parseChoreHouseArea } from '../constants/choreHouseArea.js';

/** pdf-parse 1.x default export (callable). Pinned to 1.1.1 — npm 2.x renamed the API and breaks `require()` as a function. */
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse') as (
  data: Buffer,
  options?: { max?: number }
) => Promise<{ text: string }>;

/** Uploads are held fully in memory (multer.memoryStorage) — keep this conservative. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Bounds pdf.js work on adversarial/huge PDFs; a chore list never needs more pages. */
const MAX_PDF_PAGES = 25;
/** Cap on characters fed to the local parsers (OpenAI input is capped separately below). */
const MAX_TEXT_CHARS = 200_000;
/** Cap on preview rows returned per upload. */
const MAX_PREVIEW_ITEMS = 300;

const FREQUENCY_TYPES = [
  'DAILY',
  'EVERY_OTHER_DAY',
  'WEEKLY',
  'MONTHLY',
  'SEMIANNUAL',
  'CONDITIONAL_SCHEDULE',
] as const;

const TIME_BLOCKS = ['MORNING', 'AFTERNOON', 'NIGHT', 'ANY'] as const;

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export type ChoreImportUploadKind = 'pdf' | 'txt' | 'image';

const UNSUPPORTED_TYPE_MESSAGE =
  'Unsupported file type. Use PDF, plain text (.txt), or JPEG/PNG/GIF/WebP.';

function kindFromName(originalname: string): ChoreImportUploadKind | null {
  const lower = originalname.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.txt')) return 'txt';
  if (/\.(jpe?g|png|gif|webp)$/.test(lower)) return 'image';
  return null;
}

function kindFromMime(mimetype: string): ChoreImportUploadKind | null | 'unknown' {
  const mime = (mimetype || '').toLowerCase().split(';')[0].trim();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/plain') return 'txt';
  if (IMAGE_MIME.has(mime)) return 'image';
  // Browsers fall back to octet-stream when the OS has no mapping; defer to the extension.
  if (mime === '' || mime === 'application/octet-stream') return 'unknown';
  return null;
}

/**
 * Both the extension and the declared MIME type must be on the allowlist, and must agree
 * (an octet-stream/empty MIME defers to the extension). Returns null when the upload
 * should be rejected.
 */
export function detectUploadKind(
  mimetype: string,
  originalname: string
): ChoreImportUploadKind | null {
  const byName = kindFromName(originalname);
  if (!byName) return null;
  const byMime = kindFromMime(mimetype);
  if (byMime === null) return null;
  if (byMime === 'unknown') return byName;
  return byMime === byName ? byName : null;
}

/** Cheap magic-byte / content sniff so a mislabeled file can't reach the wrong parser. */
export function contentMatchesKind(buffer: Buffer, kind: ChoreImportUploadKind): boolean {
  if (buffer.length === 0) return false;
  if (kind === 'pdf') {
    // The header may be preceded by a small amount of junk per the PDF spec.
    return buffer.subarray(0, 1024).includes('%PDF-');
  }
  if (kind === 'image') {
    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return true; // JPEG
    if (buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return true; // PNG
    if (buffer.subarray(0, 4).toString('latin1') === 'GIF8') return true; // GIF
    return (
      buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
      buffer.subarray(8, 12).toString('latin1') === 'WEBP'
    );
  }
  // txt: reject binary payloads smuggled in with a .txt name.
  return !buffer.subarray(0, 65_536).includes(0);
}

/**
 * AI-assisted parsing is opt-in twice over: it needs OPENAI_API_KEY *and* the explicit
 * CHORE_IMPORT_AI=1 acknowledgment that uploaded content (which can include household
 * members' names) will be sent to OpenAI. See README.md.
 */
export function aiParsingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.OPENAI_API_KEY) return false;
  const optIn = (env.CHORE_IMPORT_AI ?? '').trim().toLowerCase();
  return optIn === '1' || optIn === 'true' || optIn === 'yes';
}

export type CategoryMatchLevel = 'exact' | 'partial' | 'suggested' | 'fallback';

export interface ImportPreviewItem {
  name: string;
  description: string | null;
  categoryId: number;
  categoryMatch: CategoryMatchLevel;
  categoryHint: string | null;
  frequencyType: string;
  timeBlock: string;
  houseArea: string;
  anyoneMayComplete: boolean;
  /** Resolved from PDF "Person:" when names match household members; empty means use default assignees on import. */
  assigneeIds: number[];
  dayOfWeek: number | null;
  /** For MONTHLY imports from PDFs, first week of month as a default when day-of-week is not used by the generator. */
  weekOfMonth: number | null;
}

export interface ImportPreviewResult {
  parseMode: 'openai' | 'lines' | 'structured';
  /** Human-readable note (e.g. low confidence, fallback category). */
  message?: string;
  items: ImportPreviewItem[];
}

type ChoreCategoryRow = { id: number; name: string };

export type HouseholdMemberHint = { id: number; name: string };

type RawChore = {
  name: string;
  description: string | null;
  categoryHint: string | null;
  frequencyType: string;
  timeBlock: string;
  houseArea?: string;
  anyoneMayComplete?: boolean;
  dayOfWeek?: number | null;
  weekOfMonth?: number | null;
  /** Raw "Person:" line for assignee resolution (not anyone / n/a). */
  personHint?: string | null;
};

function significantWords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 2);
}

export function matchCategoryId(
  hint: string | null | undefined,
  categories: ChoreCategoryRow[]
): { id: number; match: CategoryMatchLevel } {
  const first = categories[0];
  if (!first) {
    throw new Error('No chore categories exist; add at least one category first.');
  }
  const h = (hint ?? '').trim().toLowerCase();
  if (!h) {
    return { id: first.id, match: 'fallback' };
  }
  const exact = categories.find((c) => c.name.toLowerCase() === h);
  if (exact) {
    return { id: exact.id, match: 'exact' };
  }
  const partial = categories.find(
    (c) =>
      h.includes(c.name.toLowerCase()) ||
      c.name.toLowerCase().includes(h) ||
      h.split(/\s+/).some((w) => w.length > 2 && c.name.toLowerCase().includes(w))
  );
  if (partial) {
    return { id: partial.id, match: 'partial' };
  }

  const hw = significantWords(h);
  if (hw.length > 0) {
    let best: { id: number; score: number } | null = null;
    for (const c of categories) {
      const cn = c.name.toLowerCase();
      const cw = significantWords(c.name);
      let score = 0;
      for (const w of hw) {
        if (cn.includes(w)) score += 3;
      }
      for (const w of cw) {
        if (h.includes(w)) score += 2;
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { id: c.id, score };
      }
    }
    if (best && best.score >= 4) {
      return { id: best.id, match: 'suggested' };
    }
    if (best && best.score >= 2) {
      return { id: best.id, match: 'suggested' };
    }
  }
  return { id: first.id, match: 'fallback' };
}

export function resolveAssigneeIdsFromPersonHint(
  personHint: string | null | undefined,
  anyoneMayComplete: boolean,
  members: HouseholdMemberHint[]
): number[] {
  if (anyoneMayComplete || !personHint?.trim()) return [];
  const t = personHint.trim();
  if (/^n\/a$/i.test(t) || /^na$/i.test(t)) return [];
  const parts = t.split(/\s*,\s*|\s+and\s+/i);
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const part of parts) {
    const name = part.trim();
    if (!name || /^n\/a$/i.test(name)) continue;
    const m = members.find((mem) => mem.name.trim().toLowerCase() === name.toLowerCase());
    if (m && !seen.has(m.id)) {
      seen.add(m.id);
      ids.push(m.id);
    }
  }
  return ids;
}

function normalizeFrequency(v: unknown): string {
  const s = String(v ?? 'DAILY').trim().toUpperCase();
  return FREQUENCY_TYPES.includes(s as (typeof FREQUENCY_TYPES)[number]) ? s : 'DAILY';
}

function normalizeTimeBlock(v: unknown): string {
  const s = String(v ?? 'ANY').trim().toUpperCase();
  return TIME_BLOCKS.includes(s as (typeof TIME_BLOCKS)[number]) ? s : 'ANY';
}

const PAGE_MARKER = /^--\s*\d+\s+of\s+\d+\s*--$/i;
const HR_MARKER = /^-{3,}$/;

/** PDFs exported as "Task: … / Category: … / Area: …" blocks (e.g. chore lists). */
export function looksStructuredChorePdf(text: string): boolean {
  const taskHits = (text.match(/^Task:\s*/gim) ?? []).length;
  const freqHits = (text.match(/^Frequency:\s*/gim) ?? []).length;
  return taskHits >= 2 && freqHits >= 2;
}

type KvBlock = Partial<Record<'task' | 'category' | 'area' | 'person' | 'day' | 'time' | 'frequency', string>>;

function cleanPdfLine(line: string): string | null {
  const t = line.trim();
  if (!t) return null;
  if (PAGE_MARKER.test(t)) return null;
  if (HR_MARKER.test(t)) return null;
  return t;
}

const FIELD_LINE =
  /^(Task|Category|Area|Person|Day|Time|Frequency):\s*(.*)$/i;

function mapPdfAreaToHouseCode(area: string | undefined): string {
  if (!area) return 'NONE';
  const a = area.trim().toLowerCase();
  if (a.includes('bathroom')) return 'BATHROOM';
  if (a.includes('bedroom')) return 'BEDROOM';
  if (a.includes('kitchen')) return 'KITCHEN';
  if (a.includes('laundry')) return 'LAUNDRY';
  if (a.includes('garage')) return 'GARAGE';
  if (a.includes('office') || a.includes('study')) return 'OFFICE';
  if (a.includes('living') || a.includes('family room')) return 'LIVING';
  if (a.includes('dining')) return 'DINING';
  if (a.includes('hallway') || a.includes('stairs')) return 'HALLWAY';
  if (a.includes('basement')) return 'BASEMENT';
  if (a.includes('attic')) return 'ATTIC';
  if (a.includes('playroom')) return 'PLAYROOM';
  if (a.includes('outdoor') || a.includes('yard')) return 'OUTDOOR';
  if (a.includes('not specified') || a === 'n/a') return 'NONE';
  if (a.includes('all areas') || a.includes('all area')) return 'OTHER';
  return 'NONE';
}

function mapPdfPersonAnyone(person: string | undefined): boolean {
  if (!person) return false;
  const t = person.trim().toLowerCase();
  if (!t || t === 'n/a' || t === 'na') return false;
  return t.includes('anyone') || t === 'any' || t.includes('household');
}

function mapPdfDayToDow(day: string | undefined): number | null {
  if (!day) return null;
  const t = day.trim().toLowerCase().replace(/\./g, '');
  if (!t || t === 'n/a' || t === 'na') return null;
  const map: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };
  return map[t] ?? null;
}

function mapPdfTimeToBlock(time: string | undefined): string {
  if (!time) return 'ANY';
  const t = time.trim().toLowerCase();
  if (!t || t === 'n/a' || t === 'na') return 'ANY';
  if (t.includes('morning')) return 'MORNING';
  if (t.includes('afternoon')) return 'AFTERNOON';
  if (t.includes('night')) return 'NIGHT';
  return 'ANY';
}

function mapPdfFrequency(line: string | undefined): { frequencyType: string; extraNote?: string } {
  if (!line) return { frequencyType: 'DAILY' };
  const t = line.trim().toLowerCase();
  if (t.includes('as needed')) return { frequencyType: 'DAILY', extraNote: 'As needed (from PDF)' };
  if (t.includes('semiannual') || t.includes('semi-annual')) return { frequencyType: 'SEMIANNUAL', extraNote: undefined };
  if (t.includes('month')) return { frequencyType: 'MONTHLY' };
  if (t.includes('week')) return { frequencyType: 'WEEKLY' };
  if (t.includes('other day') || t.includes('every other')) return { frequencyType: 'EVERY_OTHER_DAY' };
  if (t.includes('conditional') || t.includes('after')) return { frequencyType: 'CONDITIONAL_SCHEDULE' };
  return { frequencyType: 'DAILY' };
}

function kvBlockToRawChore(b: KvBlock): RawChore | null {
  const name = b.task?.trim();
  if (!name || name.length < 2) return null;

  const categoryHint = b.category?.trim() || null;
  const { frequencyType, extraNote } = mapPdfFrequency(b.frequency);
  const timeBlock = normalizeTimeBlock(mapPdfTimeToBlock(b.time));
  const anyoneMayComplete = mapPdfPersonAnyone(b.person);
  const dayOfWeek = mapPdfDayToDow(b.day);
  const houseArea = parseChoreHouseArea(mapPdfAreaToHouseCode(b.area));

  const personHint = (() => {
    const p = b.person?.trim();
    if (!p || /^n\/a$/i.test(p)) return null;
    if (mapPdfPersonAnyone(p)) return null;
    return p;
  })();

  const notes: string[] = [];
  if (extraNote) notes.push(extraNote);
  if (frequencyType === 'WEEKLY' && dayOfWeek == null && b.day?.trim() && !/^n\/a$/i.test(b.day.trim())) {
    notes.push(`Day (from PDF): ${b.day.trim()}`);
  }
  if (frequencyType === 'MONTHLY') {
    notes.push(
      'Monthly template: week-of-month defaults to 1 (first week). Adjust in the app if your schedule differs.'
    );
  }

  let weekOfMonth: number | null = null;
  let effectiveDow = frequencyType === 'WEEKLY' ? dayOfWeek : null;
  if (frequencyType === 'MONTHLY') {
    weekOfMonth = 1;
    effectiveDow = null;
  }

  return {
    name,
    description: notes.length ? notes.join(' · ') : null,
    categoryHint,
    frequencyType,
    timeBlock,
    houseArea,
    anyoneMayComplete,
    dayOfWeek: effectiveDow,
    weekOfMonth,
    personHint,
  };
}

/** Parses "Task:/Category:/…" style text into raw chores; returns [] if nothing valid. */
export function parseStructuredChoreListFromText(text: string): RawChore[] {
  const lines = text.split(/\r?\n/);
  let block: KvBlock = {};
  const out: RawChore[] = [];

  const flushBlock = () => {
    const raw = kvBlockToRawChore(block);
    if (raw) out.push(raw);
    block = {};
  };

  for (const rawLine of lines) {
    const line = cleanPdfLine(rawLine);
    if (line == null) continue;
    const m = FIELD_LINE.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase() as keyof KvBlock;
    const val = m[2].trim();
    if (key === 'task') {
      flushBlock();
      block = { task: val };
    } else {
      block[key] = val;
    }
  }
  flushBlock();
  return out;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  let text: string;
  try {
    ({ text } = await pdfParse(buffer, { max: MAX_PDF_PAGES }));
  } catch {
    // pdf.js errors can quote raw document bytes — never surface (or log) them.
    throw new Error('Could not parse this PDF. Re-export it or try a plain-text (.txt) file.');
  }
  return (text ?? '').trim().slice(0, MAX_TEXT_CHARS);
}

async function openAiChatJson(messages: unknown[]): Promise<Record<string, unknown>> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    // Status only — the response body is not included so no upstream detail (or anything
    // echoing the request) can end up in a client-facing error or a log line.
    throw new Error(`OpenAI request failed (HTTP ${res.status}). Try again later.`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty content');
  }
  return JSON.parse(content) as Record<string, unknown>;
}

function rawChoresFromOpenAiPayload(payload: Record<string, unknown>): RawChore[] {
  const chores = payload.chores;
  if (!Array.isArray(chores)) {
    return [];
  }
  const out: RawChore[] = [];
  for (const row of chores) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const name = String(o.name ?? '').trim();
    if (name.length < 2) continue;
    const description =
      o.description != null && String(o.description).trim() ? String(o.description).trim() : null;
    const categoryHint =
      o.categoryHint != null && String(o.categoryHint).trim() ? String(o.categoryHint).trim() : null;
    const dowRaw = o.dayOfWeek;
    let dayOfWeek: number | null | undefined;
    if (dowRaw !== undefined && dowRaw !== null && String(dowRaw).trim() !== '') {
      const n = Number(dowRaw);
      dayOfWeek = Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
    }
    const anyoneMayComplete = o.anyoneMayComplete === true;
    let personHint: string | null = null;
    const pr = o.personHint ?? o.person;
    if (typeof pr === 'string' && pr.trim()) {
      const p = pr.trim();
      if (!/^n\/a$/i.test(p) && !mapPdfPersonAnyone(p)) {
        personHint = p;
      }
    }

    out.push({
      name,
      description,
      categoryHint,
      frequencyType: normalizeFrequency(o.frequencyType),
      timeBlock: normalizeTimeBlock(o.timeBlock),
      houseArea: typeof o.houseArea === 'string' ? o.houseArea.trim() : undefined,
      anyoneMayComplete,
      dayOfWeek,
      weekOfMonth:
        o.weekOfMonth != null && Number.isInteger(Number(o.weekOfMonth)) ? Number(o.weekOfMonth) : undefined,
      personHint,
    });
  }
  return out;
}

async function structureChoresWithOpenAi(
  text: string,
  categoryNames: string[]
): Promise<RawChore[] | null> {
  if (!aiParsingEnabled()) {
    return null;
  }
  const trimmed = text.trim().slice(0, 100_000);
  if (!trimmed) {
    return null;
  }
  try {
    const payload = await openAiChatJson([
      {
        role: 'system',
        content: `You extract household chore tasks from unstructured text. Respond with JSON: {"chores":[...]}.
Each chore object: name (short title, required), description (extra detail or empty string), categoryHint (best category label or empty), frequencyType (one of: ${FREQUENCY_TYPES.join(', ')}; default DAILY), timeBlock (one of: ${TIME_BLOCKS.join(', ')}; default ANY), optional houseArea (one of: NONE, KITCHEN, BATHROOM, BEDROOM, LIVING, DINING, LAUNDRY, OFFICE, HALLWAY, GARAGE, OUTDOOR, BASEMENT, ATTIC, PLAYROOM, OTHER), optional anyoneMayComplete (boolean), optional personHint (exact person name(s) from the document when a specific person is assigned — comma-separated or "Name1 and Name2"; omit or empty when n/a or anyone), optional dayOfWeek (0–6 Sunday–Saturday) when weekly or similar.
Existing category names for hints (prefer aligning categoryHint when obvious): ${categoryNames.join(', ') || '(none)'}.
If the text uses lines like "Task:", "Category:", "Area:", "Person:", "Day:", "Time:", "Frequency:", preserve those mappings in the JSON fields (copy Person: value into personHint when it is a specific name, not "Anyone").
Skip headers, page numbers, and non-task lines. Merge sub-bullets into one chore when they belong together.`,
      },
      { role: 'user', content: trimmed },
    ]);
    const list = rawChoresFromOpenAiPayload(payload);
    return list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

async function structureChoresFromImageOpenAi(
  base64: string,
  mime: string,
  categoryNames: string[]
): Promise<RawChore[]> {
  const payload = await openAiChatJson([
    {
      role: 'system',
        content: `You read images of chore lists. Respond with JSON: {"chores":[...]}.
Each chore: name (required), description (detail or empty), categoryHint, frequencyType (${FREQUENCY_TYPES.join(', ')}), timeBlock (${TIME_BLOCKS.join(', ')}), optional houseArea (NONE, KITCHEN, BATHROOM, BEDROOM, LIVING, DINING, LAUNDRY, OFFICE, HALLWAY, GARAGE, OUTDOOR, BASEMENT, ATTIC, PLAYROOM, OTHER), optional anyoneMayComplete, optional personHint (specific assignee name(s) from the image; omit when anyone or n/a), optional dayOfWeek 0–6.
Category hints may align with: ${categoryNames.join(', ') || '(none)'}.`,
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Extract every distinct chore from this image as structured JSON.',
        },
        {
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${base64}` },
        },
      ],
    },
  ]);
  const list = rawChoresFromOpenAiPayload(payload);
  if (list.length === 0) {
    throw new Error('No chores could be read from the image');
  }
  return list;
}

function naiveLinesFromText(text: string): RawChore[] {
  const lines = text.split(/\r?\n/);
  const out: RawChore[] = [];
  for (let line of lines) {
    line = line.replace(/^\s*[\[(]?\d+[)\].]\s*/, '').replace(/^[-*•◦]\s*/, '').trim();
    if (line.length < 3) continue;
    if (/^(page|www\.|http)/i.test(line)) continue;

    let name = line;
    let categoryHint: string | null = null;

    const dashParts = line.split(/\s[–—-]\s/);
    if (dashParts.length >= 2 && dashParts[0].length <= 48) {
      const left = dashParts[0].trim();
      const right = dashParts.slice(1).join(' - ').trim();
      if (left.length >= 2 && right.length >= 2) {
        if (left.length <= right.length) {
          categoryHint = left;
          name = right;
        } else {
          name = left;
          categoryHint = right;
        }
      }
    }

    const m = /^([^:]+):\s*(.+)$/.exec(line);
    if (m && m[1].length <= 36 && m[2].length >= 2) {
      const left = m[1].trim();
      const right = m[2].trim();
      if (!categoryHint) {
        categoryHint = left;
        name = right;
      }
    }

    name = name.replace(/\s+/g, ' ').trim();
    if (name.length < 2) continue;

    out.push({
      name,
      description: null,
      categoryHint,
      frequencyType: 'DAILY',
      timeBlock: 'ANY',
      houseArea: 'NONE',
      anyoneMayComplete: false,
      dayOfWeek: null,
      weekOfMonth: null,
    });
  }
  return out;
}

function toPreviewItems(
  raw: RawChore[],
  categories: ChoreCategoryRow[],
  members: HouseholdMemberHint[] = []
): ImportPreviewItem[] {
  return raw.map((r) => {
    const { id, match } = matchCategoryId(r.categoryHint, categories);
    const anyone = r.anyoneMayComplete ?? false;
    const assigneeIds = resolveAssigneeIdsFromPersonHint(r.personHint, anyone, members);
    let description = r.description;
    if (
      assigneeIds.length === 0 &&
      !anyone &&
      r.personHint?.trim() &&
      !/^n\/a$/i.test(r.personHint.trim())
    ) {
      const extra = `Person from file "${r.personHint.trim()}" did not match a household name — pick assignees below or add the member.`;
      description = description ? `${description} · ${extra}` : extra;
    }
    return {
      name: r.name,
      description,
      categoryId: id,
      categoryMatch: match,
      categoryHint: r.categoryHint,
      frequencyType: r.frequencyType,
      timeBlock: r.timeBlock,
      houseArea: parseChoreHouseArea(r.houseArea ?? 'NONE'),
      anyoneMayComplete: anyone,
      assigneeIds,
      dayOfWeek: r.dayOfWeek ?? null,
      weekOfMonth: r.weekOfMonth ?? null,
    };
  });
}

function inferImageMime(mimetype: string, lower: string): string {
  if (IMAGE_MIME.has(mimetype)) return mimetype;
  if (/\.jpe?g$/i.test(lower)) return 'image/jpeg';
  if (/\.png$/i.test(lower)) return 'image/png';
  if (/\.gif$/i.test(lower)) return 'image/gif';
  if (/\.webp$/i.test(lower)) return 'image/webp';
  return 'image/jpeg';
}

function capRawChores(raw: RawChore[]): { raw: RawChore[]; note?: string } {
  if (raw.length <= MAX_PREVIEW_ITEMS) return { raw };
  return {
    raw: raw.slice(0, MAX_PREVIEW_ITEMS),
    note: `Preview limited to the first ${MAX_PREVIEW_ITEMS} tasks — split larger files.`,
  };
}

function tryStructuredKeyValueImport(
  text: string,
  categories: ChoreCategoryRow[],
  members: HouseholdMemberHint[] = []
): ImportPreviewResult | null {
  if (!looksStructuredChorePdf(text)) return null;
  const parsed = parseStructuredChoreListFromText(text);
  if (parsed.length === 0) return null;
  const { raw, note } = capRawChores(parsed);
  const items = toPreviewItems(raw, categories, members);
  const fallbackCount = items.filter((i) => i.categoryMatch === 'fallback').length;
  const suggestedCount = items.filter((i) => i.categoryMatch === 'suggested').length;
  const anyoneCount = items.filter((i) => i.anyoneMayComplete).length;
  const parts: string[] = [];
  if (note) parts.push(note);
  if (fallbackCount > 0) {
    parts.push(
      `${fallbackCount} task(s) used the first category as a guess — pick the right category before adding.`
    );
  } else if (suggestedCount > 0) {
    parts.push(
      `${suggestedCount} task(s) category was inferred from wording — confirm the category column.`
    );
  }
  if (anyoneCount > 0) {
    parts.push(`${anyoneCount} task(s) are set to anyone-can-do (no fixed assignees when created).`);
  }
  return {
    parseMode: 'structured',
    items,
    message: parts.length > 0 ? parts.join(' ') : undefined,
  };
}

export async function buildImportPreview(opts: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  categories: ChoreCategoryRow[];
  members?: HouseholdMemberHint[];
}): Promise<ImportPreviewResult> {
  const { buffer, mimetype, originalname, categories, members: membersOpt } = opts;
  const members = membersOpt ?? [];
  const lower = originalname.toLowerCase();
  const mime = (mimetype || '').toLowerCase();

  const kind = detectUploadKind(mimetype, originalname);
  if (!kind) {
    throw new Error(UNSUPPORTED_TYPE_MESSAGE);
  }
  if (buffer.length === 0) {
    throw new Error('The uploaded file is empty.');
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large. Max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`);
  }
  if (!contentMatchesKind(buffer, kind)) {
    throw new Error(
      `The file content does not look like a ${kind === 'txt' ? 'plain-text' : kind.toUpperCase()} file. ${UNSUPPORTED_TYPE_MESSAGE}`
    );
  }

  const categoryNames = categories.map((c) => c.name);

  if (kind === 'image') {
    if (!aiParsingEnabled()) {
      throw new Error(
        'Image import is disabled on this server. It requires OPENAI_API_KEY and CHORE_IMPORT_AI=1, because the image is sent to OpenAI for text recognition — see README.md. Use a text-based PDF or .txt file instead.'
      );
    }
    const imgMime = inferImageMime(mime, lower);
    const b64 = buffer.toString('base64');
    const { raw, note } = capRawChores(
      await structureChoresFromImageOpenAi(b64, imgMime, categoryNames)
    );
    return {
      parseMode: 'openai',
      message: note,
      items: toPreviewItems(raw, categories, members),
    };
  }

  if (kind === 'txt') {
    const text = buffer.toString('utf8').slice(0, MAX_TEXT_CHARS);
    const structuredTxt = tryStructuredKeyValueImport(text, categories, members);
    if (structuredTxt) return structuredTxt;

    let parseMode: 'openai' | 'lines' = 'lines';
    const fromAi = await structureChoresWithOpenAi(text, categoryNames);
    if (fromAi && fromAi.length > 0) parseMode = 'openai';
    const { raw, note } = capRawChores(
      fromAi && fromAi.length > 0 ? fromAi : naiveLinesFromText(text)
    );
    if (raw.length === 0) {
      throw new Error('No chore lines were found in the text file.');
    }
    const items = toPreviewItems(raw, categories, members);
    const fallbackCount = items.filter((i) => i.categoryMatch === 'fallback').length;
    const suggestedCount = items.filter((i) => i.categoryMatch === 'suggested').length;
    const categoryNote =
      fallbackCount > 0
        ? `${fallbackCount} task(s) used the first category as a guess — adjust after import.`
        : suggestedCount > 0
          ? `${suggestedCount} task(s) category was inferred from wording — confirm before adding.`
          : undefined;
    return {
      parseMode,
      message: [note, categoryNote].filter(Boolean).join(' ') || undefined,
      items,
    };
  }

  const pdfText = await extractPdfText(buffer);
  if (!pdfText || pdfText.length < 8) {
    throw new Error(
      'Could not read enough text from this PDF. Export with selectable text, or upload a clear photo (image) if AI parsing is enabled on the server.'
    );
  }

  const structuredPdf = tryStructuredKeyValueImport(pdfText, categories, members);
  if (structuredPdf) return structuredPdf;

  let parseMode: 'openai' | 'lines' = 'lines';
  const fromAi = await structureChoresWithOpenAi(pdfText, categoryNames);
  if (fromAi && fromAi.length > 0) parseMode = 'openai';
  const { raw, note } = capRawChores(
    fromAi && fromAi.length > 0 ? fromAi : naiveLinesFromText(pdfText)
  );

  if (raw.length === 0) {
    throw new Error('No chore lines were found. Check the document or add chores manually.');
  }

  const items = toPreviewItems(raw, categories, members);
  const fallbackCount = items.filter((i) => i.categoryMatch === 'fallback').length;
  const suggestedCount = items.filter((i) => i.categoryMatch === 'suggested').length;
  const categoryNote =
    fallbackCount > 0
      ? `${fallbackCount} task(s) used the first category as a guess — adjust categories after import.`
      : suggestedCount > 0
        ? `${suggestedCount} task(s) category was inferred from wording — confirm the category column.`
        : undefined;

  return {
    parseMode,
    message: [note, categoryNote].filter(Boolean).join(' ') || undefined,
    items,
  };
}
