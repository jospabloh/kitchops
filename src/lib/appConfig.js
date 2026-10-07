// Module 6 (Changelog & versioning). Stamped by the release step, never by
// `npm run build`.
//
// The rule from acacia-app-standard is "build validates, release generates" —
// and it comes from a real FlowFin incident: a generator that wrote "last
// synced: today" into a tracked file on every build produced a spurious local
// diff on every build, which then fought the next `git pull` the moment main
// had someone else's real release. scripts/release.mjs is the only thing that
// touches the two constants below.
export const APP_VERSION = "0.1.0";
export const RELEASE_DATE = "2026-08-19";

// Public marketing page. Not a secret — it appears on the login screen and in
// the licence banners too. Centralised so a change lands in one place, and
// overridable per environment without recompiling literals scattered around.
export const KITCHOPS_SITE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_KITCHOPS_SITE_URL) ||
  "https://www.acaciaco.com.mx/apps/kitchops.html";

export const SOPORTE_EMAIL = "soporte@acaciaco.com.mx";

// Newest first. Renders in Cuenta → Novedades.
export const CHANGELOG = [
  {
    version: "0.1.0",
    date: "2026-08-19",
    notes: [
      "Primer lanzamiento: cada restaurante tiene sus propios gastos, cortes, inventario y alertas, aislados entre sí.",
      "Asistente de WhatsApp: registra gastos (incluso desde la foto de un ticket), ajusta inventario y consulta cómo va la semana, desde el celular.",
      "Permisos por rol: define qué puede ver y hacer el personal de cocina, aparte de lo que hace el dueño.",
      "Bitácora: queda registrado quién hizo cada movimiento, incluso los que entraron por WhatsApp.",
      "Cuenta y zona de peligro: miembros, código de invitación, exportar datos y eliminar el negocio.",
      "Soporte y sugerencias desde la app.",
    ],
  },
];
