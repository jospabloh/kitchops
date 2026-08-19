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
