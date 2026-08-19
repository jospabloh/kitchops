import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit, diffOf } from "./_audit.ts";
import { ALL_PERMISSION_KEYS } from "./_permissions.ts";

// Saves a tenant's staff permission overrides.
//
// TWO THINGS THIS HANDLER REFUSES TO TRUST, both of which matter:
//
// 1. The key names. Only keys present in the generated ALL_PERMISSION_KEYS are
//    stored. Without that filter, a client could persist arbitrary keys into
//    the profile object — harmless today (nothing reads them), and exactly the
//    kind of dormant data that becomes a bypass the first time someone adds a
//    permission whose name a stale row already carries with `true`.
//
// 2. The role. `role` is forced to "staff". business_admin is definitionally
//    the tenant owner with full access inside its own business_id, and
//    hasPermission() never consults a profile for it — so a row claiming to
//    restrict business_admin would be a lie the UI might well render.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Same "runs the tenant" gate as member management: deciding what the
    // kitchen staff may do is the same class of decision as who they are.
    const g = await guard(base44, body, "Cuenta:manage_members");
    if (!g.ok) return g.response;

    const incoming = body.permissions;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      return Response.json({ message: "permissions debe ser un objeto." }, { status: 400 });
    }

    const known = new Set(ALL_PERMISSION_KEYS);
    const permissions: Record<string, boolean> = {};
    const ignored: string[] = [];
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
      if (!known.has(key)) {
        ignored.push(key);
        continue;
      }
      // Only real overrides are stored. A key the admin reset back to the
      // default arrives as undefined/null and is simply left out, so the row
      // keeps meaning "these are the deliberate exceptions".
      if (value === true || value === false) permissions[key] = value;
    }

    const existingRows = await g.sr.entities.PermissionProfile.filter(
      { business_id: g.businessId, role: "staff" }, null, 1,
    );
    const existing = existingRows?.[0] || null;

    const patch = { permissions, updated_by_email: g.user.email || "" };
    const saved = existing
      ? await g.sr.entities.PermissionProfile.update(existing.id, patch)
      : await g.sr.entities.PermissionProfile.create({
          business_id: g.businessId,
          role: "staff",
          ...patch,
        });

    const before = (existing?.permissions || {}) as Record<string, boolean>;
    const changedKeys = [
      ...new Set([...Object.keys(before), ...Object.keys(permissions)]),
    ].filter((k) => before[k] !== permissions[k]);

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Cuenta:manage_members",
      entity: "PermissionProfile",
      entityId: saved.id,
      summary: changedKeys.length
        ? `Cambió los permisos del personal: ${changedKeys.map((k) => `${k}=${permissions[k] === undefined ? "por defecto" : permissions[k]}`).join(", ")}.`
        : "Guardó los permisos del personal sin cambios.",
      changes: diffOf({ permissions: before }, { permissions }),
    });

    return Response.json({ profile: saved, ignored });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
