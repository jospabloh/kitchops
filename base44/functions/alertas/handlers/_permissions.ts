// Server-side mirror of src/lib/permissionRegistry.js's resolvePermission().
//
// GENERATED FILE — do not edit by hand. Every function group carries its own
// identical copy because Base44/Deno isolates each function directory (a
// function cannot import a sibling's file), and every copy is regenerated from
// src/lib/permissionRegistry.js by:
//
//     npm run generate:function-shared
//
// Hand-diverging one copy is the failure this arrangement exists to prevent:
// the whole point of Module 3 is that client and server resolve the same key
// the same way, and two registries that drift apart resolve it differently
// while both looking correct.

// AUTOGEN:REGISTRY:BEGIN
const REGISTRY_DEFAULTS: Record<string, Record<string, boolean>> = {
  "Dashboard:view": { "business_admin": true, "staff": true },
  "Dashboard:financials": { "business_admin": true, "staff": false },
  "Gastos:view": { "business_admin": true, "staff": true },
  "Gastos:create": { "business_admin": true, "staff": true },
  "Gastos:edit": { "business_admin": true, "staff": true },
  "Gastos:delete": { "business_admin": true, "staff": false },
  "Gastos:mark_facturado": { "business_admin": true, "staff": true },
  "Gastos:mark_pagado": { "business_admin": true, "staff": false },
  "Ingresos:view": { "business_admin": true, "staff": true },
  "Ingresos:create": { "business_admin": true, "staff": true },
  "Ingresos:edit": { "business_admin": true, "staff": true },
  "Ingresos:conciliar": { "business_admin": true, "staff": false },
  "Ingresos:delete": { "business_admin": true, "staff": false },
  "Inventario:view": { "business_admin": true, "staff": true },
  "Inventario:create": { "business_admin": true, "staff": true },
  "Inventario:edit_stock": { "business_admin": true, "staff": true },
  "Inventario:edit_item": { "business_admin": true, "staff": true },
  "Inventario:edit_costo": { "business_admin": true, "staff": false },
  "Inventario:delete": { "business_admin": true, "staff": false },
  "Proveedores:view": { "business_admin": true, "staff": true },
  "Proveedores:create": { "business_admin": true, "staff": false },
  "Proveedores:edit": { "business_admin": true, "staff": false },
  "Proveedores:delete": { "business_admin": true, "staff": false },
  "Alertas:view": { "business_admin": true, "staff": true },
  "Alertas:mark_read": { "business_admin": true, "staff": true },
  "Alertas:generate": { "business_admin": true, "staff": true },
  "WhatsApp:view": { "business_admin": true, "staff": true },
  "WhatsApp:configure": { "business_admin": true, "staff": false },
  "WhatsApp:manage_numbers": { "business_admin": true, "staff": false },
  "WhatsApp:read_inbox": { "business_admin": true, "staff": false },
  "Bitacora:view": { "business_admin": true, "staff": false },
  "Configuracion:view": { "business_admin": true, "staff": false },
  "Configuracion:edit": { "business_admin": true, "staff": false },
  "Cuenta:edit_profile": { "business_admin": true, "staff": false },
  "Cuenta:manage_members": { "business_admin": true, "staff": false },
  "Cuenta:danger_zone": { "business_admin": true, "staff": false },
  "Soporte:create": { "business_admin": true, "staff": true },
};

export const ALL_PERMISSION_KEYS: string[] = [
  "Dashboard:view",
  "Dashboard:financials",
  "Gastos:view",
  "Gastos:create",
  "Gastos:edit",
  "Gastos:delete",
  "Gastos:mark_facturado",
  "Gastos:mark_pagado",
  "Ingresos:view",
  "Ingresos:create",
  "Ingresos:edit",
  "Ingresos:conciliar",
  "Ingresos:delete",
  "Inventario:view",
  "Inventario:create",
  "Inventario:edit_stock",
  "Inventario:edit_item",
  "Inventario:edit_costo",
  "Inventario:delete",
  "Proveedores:view",
  "Proveedores:create",
  "Proveedores:edit",
  "Proveedores:delete",
  "Alertas:view",
  "Alertas:mark_read",
  "Alertas:generate",
  "WhatsApp:view",
  "WhatsApp:configure",
  "WhatsApp:manage_numbers",
  "WhatsApp:read_inbox",
  "Bitacora:view",
  "Configuracion:view",
  "Configuracion:edit",
  "Cuenta:edit_profile",
  "Cuenta:manage_members",
  "Cuenta:danger_zone",
  "Soporte:create",
];
// AUTOGEN:REGISTRY:END

const PLATFORM_OWNER_EMAIL = Deno.env.get("PLATFORM_OWNER_EMAIL");

export interface PermissionUser {
  id?: string;
  email?: string;
  role?: string;
  business_id?: string;
}

interface ProfileRow {
  permissions?: Record<string, boolean>;
}

interface ServiceRole {
  entities: {
    PermissionProfile: {
      filter: (q: Record<string, unknown>) => Promise<ProfileRow[]>;
    };
  };
}

export function registryDefault(key: string, role: string | undefined): boolean {
  if (!role) return false;
  return REGISTRY_DEFAULTS[key]?.[role] === true;
}

export function isWriteKey(key: string): boolean {
  const action = key.split(":")[1] || "";
  if (action === "view" || action === "financials") return false;
  if (action.startsWith("read_")) return false;
  return true;
}

/**
 * Resolve one permission key for one caller, in the exact precedence order
 * src/lib/PermissionContext.jsx uses on the client:
 *
 *   1. platform admin (role "admin", or the platform-owner email) → allowed.
 *   2. billing_status view_only/suspended → every WRITE key denied, whatever
 *      the role or the override says. Reads are deliberately still allowed:
 *      a "view only" tenant that cannot view its own books is just broken.
 *   3. an explicit true/false override for (business_id, "staff", key) in
 *      PermissionProfile wins over the registry default.
 *   4. otherwise the registry default for the caller's role.
 *
 * `asServiceRole` is passed in rather than imported so this function is
 * unit-testable with a stub, with no SDK import anywhere in this file — that
 * is what lets base44/tests/permissions_test.ts exercise it for real instead
 * of simulating it.
 */
export async function hasPermission(
  asServiceRole: ServiceRole,
  user: PermissionUser | null | undefined,
  key: string,
  billingStatus?: string | null,
): Promise<boolean> {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (PLATFORM_OWNER_EMAIL && user.email === PLATFORM_OWNER_EMAIL) return true;

  if (
    isWriteKey(key) &&
    (billingStatus === "view_only" || billingStatus === "suspended")
  ) {
    return false;
  }

  // business_admin is definitionally the tenant owner: full access inside its
  // own business_id, and not overridable. Only "staff" has a profile row.
  if (user.role === "business_admin") return registryDefault(key, "business_admin");

  if (user.role === "staff") {
    let stored: boolean | undefined;
    try {
      const rows = await asServiceRole.entities.PermissionProfile.filter({
        business_id: user.business_id,
        role: "staff",
      });
      stored = rows?.[0]?.permissions?.[key];
    } catch {
      // A profile that cannot be read must not silently widen access — fall
      // through to the registry default, which is the conservative answer.
      stored = undefined;
    }
    if (stored === true) return true;
    if (stored === false) return false;
    return registryDefault(key, "staff");
  }

  // Unknown role → denied. Matches the client's `return {}` fallback.
  return false;
}
