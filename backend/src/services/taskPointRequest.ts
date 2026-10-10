import { createHash } from 'node:crypto';

export interface TaskPointRequest {
  childId: number;
  taskInstanceId: number;
  points: number;
  type: 'bonus' | 'demerit';
  reason: string;
  requestId: string;
}

export function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function parseTaskPointRequest(body: unknown): TaskPointRequest | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!positiveId(b.childId) || !positiveId(b.taskInstanceId) ||
      !positiveId(b.points) || b.points > 2_147_483_647 ||
      (b.type !== 'bonus' && b.type !== 'demerit') ||
      typeof b.reason !== 'string' || !b.reason.trim() || b.reason.trim().length > 2000 ||
      typeof b.requestId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.requestId)) return null;
  return {
    childId: b.childId, taskInstanceId: b.taskInstanceId, points: b.points,
    type: b.type, reason: b.reason.trim(), requestId: b.requestId.toLowerCase(),
  };
}

export function taskPointFingerprint(request: TaskPointRequest): string {
  // Only submitted intent participates: retries still work if a task is renamed or deleted.
  return createHash('sha256').update(JSON.stringify({
    childId: request.childId, taskInstanceId: request.taskInstanceId,
    points: request.points, type: request.type, reason: request.reason,
  })).digest('hex');
}
