// Client-side permission registry (acacia-app-standard, Module 3). One place
// listing every gated action as "Sección:acción" with a per-role default.
//
// THIS FILE IS NOT THE ENFORCEMENT BOUNDARY. Hiding a button is a UX nicety.
// Every key below has an independent server-side re-check in the Safe function
// that performs the write (base44/functions/*/handlers/), resolving the SAME
// precedence in the SAME order:
//
//   1. platform admin (role: admin) → always allowed.
//   2. an explicit true/false override for (business_id, "staff", key) in
//      PermissionProfile wins — that's the tenant admin tuning their own staff
//      beyond the defaults here (src/pages/Permisos.jsx). RLS scopes that row
//      to the caller's own business_id, so no tenant can touch another's.
//   3. billing_status view_only/suspended → every write rejected regardless of
//      role or override (Module 1's read-only degrade).
//   4. otherwise, the default below for the caller's role.
//
// StockFlow shipped the client-only half of this for three entities across two
// release cycles before closing it: an authenticated low-privilege user could
// open devtools and call the backend directly, bypassing a permission their
// admin had explicitly revoked. That is the incident this arrangement exists to
// not repeat — see acacia-app-standard docs/incidents.md.
//
// The WhatsApp agent resolves the same keys for the number that messaged it
// (base44/functions/whatsapp/handlers/_permissions.ts), so a staff phone cannot
// do over WhatsApp what that person cannot do in the app.
// NOTE the explicit ".js": this file is imported both by Vite (which resolves
// extensionless paths) and by scripts/generate-function-shared.mjs running under
// plain Node ESM (which does not). Dropping the extension breaks the generator
// with ERR_MODULE_NOT_FOUND while the app keeps building fine — so the mismatch
// only shows up at release time.
import { ROLES } from "./rbac.js";

export const PERMISSION_REGISTRY = {
  // ── Resumen ───────────────────────────────────────────────────────────────
  // Staff see the operational dashboard (what's low, what's pending) but not
  // the money roll-up: margin, what the card owes, deposits vs. cuts.
  "Dashboard:view": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Dashboard:financials": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },

  // ── Gastos ────────────────────────────────────────────────────────────────
  // Capturing expenses is the single most common staff task, so create/edit are
  // on by default. Deleting is not: a deleted expense vanishes from a closed
  // week's numbers with nothing left to notice.
  "Gastos:view": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Gastos:create": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Gastos:edit": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Gastos:delete": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },
  "Gastos:mark_facturado": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Gastos:mark_pagado": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },

  // ── Ingresos de plataformas ───────────────────────────────────────────────
  // Staff can type in the weekly cut. Reconciling it against what the bank
  // actually deposited is the owner's call — that's the step that decides
  // whether the platform shorted you.
  "Ingresos:view": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Ingresos:create": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Ingresos:edit": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Ingresos:conciliar": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },
  "Ingresos:delete": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },

  // ── Inventario ────────────────────────────────────────────────────────────
  "Inventario:view": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Inventario:create": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Inventario:edit_stock": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Inventario:edit_item": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Inventario:edit_costo": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },
  "Inventario:delete": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },

  // ── Proveedores ───────────────────────────────────────────────────────────
  // A catalog, not an operation: staff pick from it, the owner curates it.
  "Proveedores:view": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Proveedores:create": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },
  "Proveedores:edit": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },
  "Proveedores:delete": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },

  // ── Alertas ───────────────────────────────────────────────────────────────
  "Alertas:view": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Alertas:mark_read": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "Alertas:generate": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },

  // ── Agente de WhatsApp ────────────────────────────────────────────────────
  // Editing the allowlist is deciding who may write to the books from a phone.
  // That is an owner decision, and it stays one even if the toggle looks small.
  "WhatsApp:view": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
  "WhatsApp:configure": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },
  "WhatsApp:manage_numbers": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },
  "WhatsApp:read_inbox": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },

  // ── Bitácora ──────────────────────────────────────────────────────────────
  // The audit trail answers "who changed this". Showing it to the people being
  // audited is not useful; AuditLog's RLS enforces the same thing server-side.
  "Bitacora:view": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },

  // ── Configuración y cuenta ────────────────────────────────────────────────
  "Configuracion:view": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },
  "Configuracion:edit": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },
  "Cuenta:edit_profile": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },
  "Cuenta:manage_members": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },
  "Cuenta:danger_zone": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: false },

  // ── Soporte ───────────────────────────────────────────────────────────────
  // Anyone who hits a problem must be able to report it. Gating this would just
  // mean the owner hears about breakage second-hand, later.
  "Soporte:create": { [ROLES.BUSINESS_ADMIN]: true, [ROLES.STAFF]: true },
};

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_REGISTRY);

// Grouped, human-readable view for the Permisos matrix. Only 'staff' is ever
// editable — business_admin is definitionally the tenant owner and always has
// full access within its own business_id.
export const PERMISSION_SECTIONS = [
  {
    section: "Resumen",
    keys: [
      { key: "Dashboard:view", label: "Ver el resumen" },
      { key: "Dashboard:financials", label: "Ver cifras financieras (utilidad, saldos)" },
    ],
  },
  {
    section: "Gastos",
    keys: [
      { key: "Gastos:view", label: "Ver gastos" },
      { key: "Gastos:create", label: "Registrar gastos" },
      { key: "Gastos:edit", label: "Editar gastos" },
      { key: "Gastos:mark_facturado", label: "Marcar como facturado" },
      { key: "Gastos:mark_pagado", label: "Marcar como pagado" },
      { key: "Gastos:delete", label: "Eliminar gastos" },
    ],
  },
  {
    section: "Ingresos de plataformas",
    keys: [
      { key: "Ingresos:view", label: "Ver cortes" },
      { key: "Ingresos:create", label: "Registrar cortes" },
      { key: "Ingresos:edit", label: "Editar cortes" },
      { key: "Ingresos:conciliar", label: "Conciliar depósitos" },
      { key: "Ingresos:delete", label: "Eliminar cortes" },
    ],
  },
  {
    section: "Inventario",
    keys: [
      { key: "Inventario:view", label: "Ver inventario" },
      { key: "Inventario:create", label: "Agregar insumos" },
      { key: "Inventario:edit_stock", label: "Ajustar existencias" },
      { key: "Inventario:edit_item", label: "Editar datos del insumo" },
      { key: "Inventario:edit_costo", label: "Editar el costo de compra" },
      { key: "Inventario:delete", label: "Eliminar insumos" },
    ],
  },
  {
    section: "Proveedores",
    keys: [
      { key: "Proveedores:view", label: "Ver proveedores" },
      { key: "Proveedores:create", label: "Agregar proveedores" },
      { key: "Proveedores:edit", label: "Editar proveedores" },
      { key: "Proveedores:delete", label: "Eliminar proveedores" },
    ],
  },
  {
    section: "Alertas",
    keys: [
      { key: "Alertas:view", label: "Ver alertas" },
      { key: "Alertas:mark_read", label: "Marcar como leídas" },
      { key: "Alertas:generate", label: "Volver a calcular alertas" },
    ],
  },
  {
    section: "Agente de WhatsApp",
    keys: [
      { key: "WhatsApp:view", label: "Ver el estado del agente" },
      { key: "WhatsApp:read_inbox", label: "Leer las conversaciones" },
      { key: "WhatsApp:configure", label: "Configurar el agente" },
      { key: "WhatsApp:manage_numbers", label: "Autorizar números" },
    ],
  },
  {
    section: "Bitácora",
    keys: [{ key: "Bitacora:view", label: "Ver la bitácora de actividad" }],
  },
  {
    section: "Configuración",
    keys: [
      { key: "Configuracion:view", label: "Ver configuración" },
      { key: "Configuracion:edit", label: "Editar configuración" },
    ],
  },
  {
    section: "Soporte",
    keys: [{ key: "Soporte:create", label: "Enviar tickets de soporte" }],
  },
];

export function registryDefault(key, role) {
  return Boolean(PERMISSION_REGISTRY[key]?.[role]);
}

// Precedence step 2: an explicit override wins over the registry default when
// present; undefined/missing falls through to the default.
export function resolvePermission(key, role, overrides) {
  const override = overrides?.[key];
  if (override === true || override === false) return override;
  return registryDefault(key, role);
}

// Every key that is a WRITE. The billing_status gate (precedence step 3) only
// applies to these — a view_only tenant must still be able to read its own
// books, which is the entire point of "view only".
export const WRITE_KEYS = new Set(
  ALL_PERMISSION_KEYS.filter((k) => {
    const action = k.split(":")[1] || "";
    return !(action === "view" || action.startsWith("read_") || action === "financials");
  })
);

export function isWriteKey(key) {
  return WRITE_KEYS.has(key);
}
