// Pure rules for the WhatsApp webhook. Imports nothing, so base44/tests/ can
// load it directly (entry.ts imports npm:@base44/sdk and cannot be).

/**
 * Canonical comparison key for a phone number: digits only, full country code.
 *
 * The one equivalence allowed is Mexico's: the same mobile arrives as
 * +52XXXXXXXXXX, +521XXXXXXXXXX (the old mobile "1") or a bare 10-digit number,
 * depending on the provider and on how the owner typed it. Everything else is
 * compared whole. Comparing only the last 10 digits — the previous rule — let
 * +1 551 234 5678 (a US number anyone can buy) match +52 55 1234 5678 and act
 * as that person.
 *
 * Must stay in step with the dedup key in whatsappAdmin/saveNumerosSafe.ts.
 */
export function claveTelefono(raw: unknown): string {
  const d = String(raw ?? "").replace(/[^\d]/g, "");
  if (!d) return "";
  if (/^\d{10}$/.test(d)) return `52${d}`;
  if (/^521\d{10}$/.test(d)) return `52${d.slice(3)}`;
  return d;
}

export function mismoTelefono(a: unknown, b: unknown): boolean {
  const ka = claveTelefono(a);
  return ka !== "" && ka === claveTelefono(b);
}

/**
 * After creating its own WhatsAppEvento claim, a delivery re-reads every claim
 * for the same provider event and proceeds only if its row is the oldest
 * (created_date, then id as tie-break). Two concurrent deliveries that both
 * passed the read-before-create check therefore agree on a single winner.
 */
export function ganaElReclamo(
  rows: Array<{ id: string; created_date?: string }>,
  propioId: string,
): boolean {
  if (!rows || rows.length === 0) return true;
  const orden = [...rows].sort((a, b) => {
    const ta = Date.parse(a.created_date || "") || 0;
    const tb = Date.parse(b.created_date || "") || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
  return orden[0].id === propioId;
}

export const ZONA_HORARIA_DEFAULT = "America/Mexico_City";

/**
 * Calendar date (AAAA-MM-DD) at `fecha` in the business's time zone. Using
 * toISOString() dated every expense recorded after 18:00 in Mexico as
 * tomorrow — and on a Sunday night, into next week's cut.
 */
export function fechaLocal(fecha: Date, zona?: unknown): string {
  const formatear = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(fecha);
  try {
    return formatear(String(zona || ZONA_HORARIA_DEFAULT));
  } catch {
    // An unknown zone string on Business.timezone must not take the agent down.
    return formatear(ZONA_HORARIA_DEFAULT);
  }
}

/**
 * The Messages API requires the first message to be a user turn. The history
 * window can start on an outbound row (a photo with no caption is stored with
 * empty text and skipped), so drop leading assistant turns.
 */
export function sinAsistenteAlInicio<T extends { role: string }>(messages: T[]): T[] {
  let i = 0;
  while (i < messages.length && messages[i].role !== "user") i++;
  return messages.slice(i);
}
