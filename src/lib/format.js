// Formatting helpers. One place, because a number that renders three different
// ways across three screens is a number people stop trusting.

const MX = "es-MX";

/**
 * Money for display. Always with the symbol, never with decimals when they're
 * zero — a kitchen's expenses are whole pesos in practice, and ".00" on every
 * line is noise that makes the column harder to scan.
 */
export function money(value, simbolo = "$") {
  const n = Number(value || 0);
  const decimals = Number.isInteger(n) ? 0 : 2;
  return `${n < 0 ? "−" : ""}${simbolo}${Math.abs(n).toLocaleString(MX, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  })}`;
}

/** Money with an explicit sign, for differences where direction is the point. */
export function moneySigned(value, simbolo = "$") {
  const n = Number(value || 0);
  if (n === 0) return money(0, simbolo);
  return `${n > 0 ? "+" : "−"}${simbolo}${Math.abs(n).toLocaleString(MX, {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "12 ago 2026" — short enough for a table, unambiguous unlike 08/12. */
export function fecha(value) {
  if (!value) return "—";
  const d = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(MX, { day: "numeric", month: "short", year: "numeric" });
}

/** "12 ago, 3:40 p.m." — for the activity trail, where time of day matters. */
export function fechaHora(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString(MX, { day: "numeric", month: "short" })}, ${d.toLocaleTimeString(MX, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** "hace 5 min" — for anything that should feel live. */
export function haceRato(value) {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const horas = Math.floor(mins / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
  return fecha(value);
}

/** Today, as the YYYY-MM-DD a date input expects. */
export function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * ISO week key (YYYY-WW) — the same grouping the backend's semanaDe() computes.
 * The two must agree: a cut filed under a different week key than the expenses
 * it should be compared against silently breaks every weekly roll-up.
 */
export function semanaDe(fechaISO = hoy()) {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${target.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

/** "Semana 34 de 2026" for display; the stored form stays YYYY-WW. */
export function semanaLegible(semana) {
  if (!semana || !/^\d{4}-\d{2}$/.test(semana)) return semana || "—";
  const [anio, num] = semana.split("-");
  return `Semana ${Number(num)} de ${anio}`;
}

/** First day of the current month, as YYYY-MM-DD. */
export function inicioDeMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Turn a Base44 function error into something worth showing a person.
 *
 * The SDK buries the server's message a couple of levels down, and the fallback
 * most code writes ("Error al guardar") throws away the one useful sentence the
 * backend went to the trouble of writing — which for this app is usually
 * "no tienes permiso para hacer esto" or "tu negocio está en solo lectura".
 */
export function mensajeDeError(error, fallback = "Algo salió mal. Inténtalo otra vez.") {
  return (
    error?.data?.message ||
    error?.response?.data?.message ||
    error?.originalError?.response?.data?.message ||
    error?.message ||
    fallback
  );
}
