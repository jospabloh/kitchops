// Append one AuditLog row after a successful mutation.
//
// GENERATED FILE — do not edit by hand. See _permissions.ts's header; run
// `npm run generate:function-shared` to refresh every copy.
//
// Deliberately BEST-EFFORT: a failure to write the trail never fails the
// operation that already succeeded. The alternative — rolling back a saved
// expense because its log row didn't land — trades a real, wanted write for a
// bookkeeping nicety, and leaves the user staring at an error for something
// that did in fact happen. The tradeoff is that the trail can have holes; the
// mitigation is that it is written by the service role from inside the same
// function that did the work, so the only way to lose a row is an actual
// backend failure, not a caller choosing to skip it.

export interface AuditInput {
  businessId: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  summary?: string;
  changes?: Record<string, unknown>;
  source?: "app" | "whatsapp" | "mission_control" | "cron";
}

export async function writeAudit(
  // deno-lint-ignore no-explicit-any
  sr: any,
  input: AuditInput,
): Promise<void> {
  try {
    await sr.entities.AuditLog.create({
      business_id: input.businessId,
      actor_email: input.actorEmail || "",
      actor_role: input.actorRole || "",
      action: input.action,
      entity: input.entity || "",
      entity_id: input.entityId || "",
      summary: input.summary || "",
      changes: input.changes || {},
      source: input.source || "app",
      occurred_at: new Date().toISOString(),
    });
  } catch {
    // Swallowed on purpose — see the header.
  }
}

/**
 * Build a { field: { antes, despues } } diff, keeping only the fields that
 * actually changed. Keeps audit rows readable: an edit that touched one field
 * shows one field, not the whole record.
 */
export function diffOf(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
): Record<string, { antes: unknown; despues: unknown }> {
  const out: Record<string, { antes: unknown; despues: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    const prev = before?.[k];
    if (JSON.stringify(prev) !== JSON.stringify(v)) {
      out[k] = { antes: prev ?? null, despues: v };
    }
  }
  return out;
}
