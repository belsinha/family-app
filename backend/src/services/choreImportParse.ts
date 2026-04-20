import { PDFParse } from 'pdf-parse';

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

export type CategoryMatchLevel = 'exact' | 'partial' | 'fallback';

export interface ImportPreviewItem {
  name: string;
  description: string | null;
  categoryId: number;
  categoryMatch: CategoryMatchLevel;
  categoryHint: string | null;
  frequencyType: string;
  timeBlock: string;
}

export interface ImportPreviewResult {
  parseMode: 'openai' | 'lines';
  /** Human-readable note (e.g. low confidence, fallback category). */
  message?: string;
  items: ImportPreviewItem[];
}

type ChoreCategoryRow = { id: number; name: string };

type RawChore = {
  name: string;
  description: string | null;
  categoryHint: string | null;
  frequencyType: string;
  timeBlock: string;
};

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
  return { id: first.id, match: 'fallback' };
}

function normalizeFrequency(v: unknown): string {
  const s = String(v ?? 'DAILY').trim().toUpperCase();
  return FREQUENCY_TYPES.includes(s as (typeof FREQUENCY_TYPES)[number]) ? s : 'DAILY';
}

function normalizeTimeBlock(v: unknown): string {
  const s = String(v ?? 'ANY').trim().toUpperCase();
  return TIME_BLOCKS.includes(s as (typeof TIME_BLOCKS)[number]) ? s : 'ANY';
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.text ?? '').trim();
  } finally {
    await parser.destroy();
  }
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
    const t = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${t.slice(0, 800)}`);
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
    out.push({
      name,
      description,
      categoryHint,
      frequencyType: normalizeFrequency(o.frequencyType),
      timeBlock: normalizeTimeBlock(o.timeBlock),
    });
  }
  return out;
}

async function structureChoresWithOpenAi(
  text: string,
  categoryNames: string[]
): Promise<RawChore[] | null> {
  if (!process.env.OPENAI_API_KEY) {
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
Each chore object: name (short title, required), description (extra detail or empty string), categoryHint (best area label or empty), frequencyType (one of: ${FREQUENCY_TYPES.join(', ')}; default DAILY), timeBlock (one of: ${TIME_BLOCKS.join(', ')}; default ANY).
Existing category names for hints (prefer aligning categoryHint when obvious): ${categoryNames.join(', ') || '(none)'}.
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
Each chore: name (required), description (detail or empty), categoryHint, frequencyType (${FREQUENCY_TYPES.join(', ')}), timeBlock (${TIME_BLOCKS.join(', ')}).
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
    });
  }
  return out;
}

function toPreviewItems(raw: RawChore[], categories: ChoreCategoryRow[]): ImportPreviewItem[] {
  return raw.map((r) => {
    const { id, match } = matchCategoryId(r.categoryHint, categories);
    return {
      name: r.name,
      description: r.description,
      categoryId: id,
      categoryMatch: match,
      categoryHint: r.categoryHint,
      frequencyType: r.frequencyType,
      timeBlock: r.timeBlock,
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

export async function buildImportPreview(opts: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  categories: ChoreCategoryRow[];
}): Promise<ImportPreviewResult> {
  const { buffer, mimetype, originalname, categories } = opts;
  const lower = originalname.toLowerCase();
  const mime = (mimetype || '').toLowerCase();
  const isPdf = mime === 'application/pdf' || lower.endsWith('.pdf');
  const isTxt = mime === 'text/plain' || lower.endsWith('.txt');
  const isImage =
    IMAGE_MIME.has(mime) ||
    /\.(jpe?g|png|gif|webp)$/i.test(lower) ||
    (mime === 'application/octet-stream' && /\.(jpe?g|png|gif|webp)$/i.test(lower));

  const categoryNames = categories.map((c) => c.name);

  if (isImage && !isPdf) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        'Image import needs OPENAI_API_KEY on the server for text recognition. Use a text-based PDF, or ask your host to set the API key.'
      );
    }
    const imgMime = inferImageMime(mime, lower);
    const b64 = buffer.toString('base64');
    const raw = await structureChoresFromImageOpenAi(b64, imgMime, categoryNames);
    return {
      parseMode: 'openai',
      items: toPreviewItems(raw, categories),
    };
  }

  if (isTxt && !isPdf) {
    const text = buffer.toString('utf8');
    let parseMode: 'openai' | 'lines' = 'lines';
    const fromAi = await structureChoresWithOpenAi(text, categoryNames);
    const raw: RawChore[] =
      fromAi && fromAi.length > 0 ? fromAi : naiveLinesFromText(text);
    if (fromAi && fromAi.length > 0) parseMode = 'openai';
    if (raw.length === 0) {
      throw new Error('No chore lines were found in the text file.');
    }
    const items = toPreviewItems(raw, categories);
    const fallbackCount = items.filter((i) => i.categoryMatch === 'fallback').length;
    return {
      parseMode,
      message:
        fallbackCount > 0
          ? `${fallbackCount} task(s) used the first category as a guess — adjust after import.`
          : undefined,
      items,
    };
  }

  if (!isPdf) {
    throw new Error('Unsupported file type. Use PDF, plain text (.txt), or JPEG/PNG/GIF/WebP.');
  }

  const pdfText = await extractPdfText(buffer);
  if (!pdfText || pdfText.length < 8) {
    throw new Error(
      'Could not read enough text from this PDF. Export with selectable text, or upload a clear photo (image) if OPENAI_API_KEY is set on the server.'
    );
  }

  let parseMode: 'openai' | 'lines' = 'lines';
  const fromAi = await structureChoresWithOpenAi(pdfText, categoryNames);
  const raw: RawChore[] = fromAi && fromAi.length > 0 ? fromAi : naiveLinesFromText(pdfText);
  if (fromAi && fromAi.length > 0) parseMode = 'openai';

  if (raw.length === 0) {
    throw new Error('No chore lines were found. Check the document or add chores manually.');
  }

  const items = toPreviewItems(raw, categories);
  const fallbackCount = items.filter((i) => i.categoryMatch === 'fallback').length;
  const message =
    fallbackCount > 0
      ? `${fallbackCount} task(s) used the first category as a guess — adjust categories after import.`
      : undefined;

  return {
    parseMode,
    message,
    items,
  };
}
