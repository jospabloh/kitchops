// Single source of truth for KitchOps's OWN role model (acacia-app-standard,
// Module 2, layer 2) — separate from Mission Control's operator roles
// (owner | admin | viewer in the bodega `members` table, which govern who can
// drive the central panel, not this app).
//
// Mirrors base44/entities/User.jsonc's `role` enum exactly. If you add a role
// here, add it to that enum and re-deploy the schema too, or RLS and the client
// will disagree — and RLS disagreements in Base44 fail silently.
//
// The two layers never merge: an `owner` in Mission Control's members table has
// no role inside KitchOps, and a KitchOps business_admin has no access to the
// panel. Mission Control reaches this app's data through the service-role
// acaciaControl bridge, never by impersonating one of its users.

export const ROLES = {
  // Platform/ACACIA owner. This is the tier the service role evaluates as, and
  // the tier every entity's RLS admin branch is written against (Module 4).
  // Never assigned to a restaurant's own staff.
  ADMIN: "admin",
  // Tenant owner/manager — full access within their own business_id. Sees
  // money: margins, deposits that never landed, what the card owes.
  BUSINESS_ADMIN: "business_admin",
  // Kitchen staff — day-to-day capture only. Registers expenses, moves stock,
  // enters the weekly platform cut. Does not see the financial roll-up and
  // cannot delete records that would silently change a closed week.
  STAFF: "staff",
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: "Administrador ACACIA",
  [ROLES.BUSINESS_ADMIN]: "Dueño / gerente",
  [ROLES.STAFF]: "Personal de cocina",
};

export const ROLE_DESCRIPTIONS = {
  [ROLES.BUSINESS_ADMIN]:
    "Ve todo el negocio: gastos, cortes, utilidad, alertas y configuración. Puede invitar y quitar personal.",
  [ROLES.STAFF]:
    "Captura el día a día: gastos, inventario y cortes de plataforma. No ve el resumen financiero ni la configuración.",
};

// Roles a tenant admin can actually assign. 'admin' is deliberately absent —
// it is the platform tier, not something a restaurant hands out.
export const ASSIGNABLE_ROLES = [ROLES.BUSINESS_ADMIN, ROLES.STAFF];

export function isPlatformAdmin(user) {
  return user?.role === ROLES.ADMIN;
}

export function isBusinessAdmin(user) {
  return user?.role === ROLES.BUSINESS_ADMIN || isPlatformAdmin(user);
}

export function isStaff(user) {
  return user?.role === ROLES.STAFF;
}

// Has this user completed onboarding (created or joined a restaurant)?
export function hasBusiness(user) {
  return Boolean(user?.business_id);
}
