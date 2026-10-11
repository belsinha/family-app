import { createHash } from "node:crypto";
import { authorizeChildAccess, listAccessibleChildren } from "./childAccess.js";
import { getSupabaseClient } from "../db/supabase.js";
import { getUserById } from "../db/queries/users.js";
import { positiveId } from "./taskPointRequest.js";
import type { Point } from "../types.js";

export class PointActionError extends Error {}
export interface ManualPointIntent {
  childId: number;
  points: number;
  unit: "points";
  type: "bonus" | "demerit";
  reason: string;
  requestId: string;
}
export function parseManualPointIntent(raw: unknown): ManualPointIntent {
  const b = raw as Partial<ManualPointIntent> | null;
  if (
    !b ||
    !positiveId(b.childId) ||
    !positiveId(b.points) ||
    b.points > 2147483647 ||
    b.unit !== "points" ||
    !["bonus", "demerit"].includes(b.type ?? "") ||
    typeof b.reason !== "string" ||
    !b.reason.trim() ||
    b.reason.trim().length > 2000 ||
    typeof b.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      b.requestId,
    )
  ) {
    throw new PointActionError(
      "Supply childId, positive integer points, unit points, bonus/demerit, reason and UUID requestId",
    );
  }
  return {
    childId: b.childId,
    points: b.points,
    unit: "points",
    type: b.type!,
    reason: b.reason.trim(),
    requestId: b.requestId.toLowerCase(),
  };
}
export function manualFingerprint(intent: ManualPointIntent): string {
  const { requestId: _requestId, ...values } = intent;
  return createHash("sha256")
    .update(JSON.stringify({ source: "manual", ...values }))
    .digest("hex");
}
export function publicPoint(p: Point) {
  return {
    id: p.id,
    childId: p.child_id,
    points: p.points,
    unit: "points",
    delta: p.type === "bonus" ? p.points : -p.points,
    type: p.type,
    source: p.source,
    reason: p.reason,
    actorId: p.task_actor_id ?? p.parent_id,
    createdAt: p.created_at,
    voidedAt: p.voided_at ?? null,
    voidedBy: p.voided_by ?? null,
    voidReason: p.void_reason ?? null,
  };
}
export async function assertCurrentParent(userId: number, houseId: number) {
  const parent = await getUserById(userId);
  if (
    parent?.role !== "parent" ||
    parent.house_id == null ||
    parent.house_id !== houseId
  )
    throw new PointActionError("Parent access is no longer valid");
  return { userId, role: "parent" as const, name: parent.name };
}
export async function visibleChildren(userId: number, houseId: number) {
  const user = await assertCurrentParent(userId, houseId);
  return (await listAccessibleChildren(user)).map((c) => ({
    id: c.id,
    name: c.name,
  }));
}
async function childGuard(userId: number, houseId: number, childId: number) {
  const user = await assertCurrentParent(userId, houseId);
  const access = await authorizeChildAccess(user, childId);
  if (!access.ok || access.child.house_id !== houseId)
    throw new PointActionError("Child is not accessible to this parent");
}
export async function recordManualPoint(
  userId: number,
  houseId: number,
  raw: unknown,
) {
  const intent = parseManualPointIntent(raw);
  await childGuard(userId, houseId, intent.childId);
  const fingerprint = manualFingerprint(intent);
  const db = getSupabaseClient();
  const previous = async () => {
    const { data, error } = await db
      .from("points")
      .select("*")
      .eq("task_actor_id", userId)
      .eq("request_id", intent.requestId)
      .maybeSingle();
    if (error) throw new Error("Could not check point request");
    return data as Point | null;
  };
  const replay = (point: Point) => {
    if (point.source !== "manual" || point.request_fingerprint !== fingerprint)
      throw new PointActionError(
        "requestId was already used for different intent",
      );
    return { point: publicPoint(point), replayed: true };
  };
  const existing = await previous();
  if (existing) return replay(existing);
  const { data, error } = await db
    .from("points")
    .insert({
      child_id: intent.childId,
      points: intent.points,
      type: intent.type,
      reason: intent.reason,
      parent_id: userId,
      task_actor_id: userId,
      task_house_id: houseId,
      source: "manual",
      request_id: intent.requestId,
      request_fingerprint: fingerprint,
      task_instance_id: null,
      task_snapshot: null,
    })
    .select("*")
    .single();
  if (!error && data)
    return { point: publicPoint(data as Point), replayed: false };
  if (error?.code === "23505") {
    const winner = await previous();
    if (winner) return replay(winner);
  }
  throw new Error("Could not record points");
}
export async function pointHistory(
  userId: number,
  houseId: number,
  childId: number,
  beforeId?: number,
  limit = 25,
) {
  await childGuard(userId, houseId, childId);
  let query = getSupabaseClient()
    .from("points")
    .select("*")
    .eq("child_id", childId)
    .order("id", { ascending: false })
    .limit(limit);
  if (beforeId != null) query = query.lt("id", beforeId);
  const { data, error } = await query;
  if (error) throw new Error("Could not read point history");
  const rows = (data ?? []) as Point[];
  return {
    points: rows.map(publicPoint),
    nextBeforeId: rows.length === limit ? rows[rows.length - 1].id : null,
  };
}
export async function voidAuditedPoint(
  userId: number,
  houseId: number,
  pointId: number,
  reason: string,
) {
  if (
    !positiveId(pointId) ||
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.trim().length > 2000
  )
    throw new PointActionError("Valid pointId and reason required");
  const db = getSupabaseClient();
  const read = async () => {
    const { data, error } = await db
      .from("points")
      .select("*")
      .eq("id", pointId)
      .maybeSingle();
    if (error || !data) throw new PointActionError("Point is not accessible");
    return data as Point;
  };
  const point = await read();
  await childGuard(userId, houseId, point.child_id);
  if (point.source !== "manual" && point.source !== "task")
    throw new PointActionError(
      "Only nonfinancial audited points can be voided here",
    );
  if (point.voided_at) return { point: publicPoint(point), replayed: true };
  const { data, error } = await db
    .from("points")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: userId,
      void_reason: reason.trim(),
    })
    .eq("id", pointId)
    .eq("child_id", point.child_id)
    .eq("source", point.source)
    .is("voided_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error("Could not void point");
  return {
    point: publicPoint((data as Point) ?? (await read())),
    replayed: !data,
  };
}
