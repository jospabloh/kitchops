import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";

const MAX_NUMEROS = 25;

/**
 * Normalize to E.164, accepting what people actually type — "55 1234 5678",
 * "+52 1 55…", "045 55…". Returns "" for anything it cannot confidently
 * interpret, because a half-parsed number saved as if it were valid is a person
 * who silently cannot use the agent (or, worse, a stranger who silently can).
 */
function normalizar(raw: unknown): string {
  const digits = String(raw ?? "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return /^\+\d{10,15}$/.test(digits) ? digits : "";
  if (/^\d{10}$/.test(digits)) return `+52${digits}`;
  if (/^52\d{10}$/.test(digits)) return `+${digits}`;
  if (/^521\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{11,15}$/.test(digits)) return `+${digits}`;
  return "";
}

// The allowlist: who may command the agent, and as what.
//
// This is the highest-consequence screen in the WhatsApp module, which is why it
// has its own permission key (WhatsApp:manage_numbers) rather than riding on the
// general configure key. Adding a number here grants somebody the ability to
// write to the restaurant's books from a phone, with no login, no password, and
// no second factor beyond possession of that SIM. Granting business_admin here
// grants it at the owner's own level.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const g = await guard(base44, body, "WhatsApp:manage_numbers");
    if (!g.ok) return g.response;

    const entradas = Array.isArray(body.numeros) ? body.numeros : null;
    if (!entradas) return Response.json({ message: "numeros debe ser una lista." }, { status: 400 });
    if (entradas.length > MAX_NUMEROS) {
      return Response.json(
        { message: `Son demasiados números (máximo ${MAX_NUMEROS}). Si de verdad necesitas más, escríbenos.` },
        { status: 400 },
      );
    }

    const limpios: Array<{ numero: string; nombre: string; rol: string }> = [];
    const vistos = new Set<string>();
    for (const entrada of entradas) {
      const numero = normalizar(entrada?.numero);
      if (!numero) {
        return Response.json(
          {
            message: `"${entrada?.numero ?? ""}" no se entiende como número. Escríbelo a 10 dígitos (5512345678) o en formato internacional (+525512345678).`,
          },
          { status: 400 },
        );
      }
      // The webhook matches on the last 10 digits, so two entries that differ
      // only by prefix are the same person — and if they carried different
      // roles, which one wins would be down to array order.
      const clave = numero.replace(/[^\d]/g, "").slice(-10);
      if (vistos.has(clave)) {
        return Response.json({ message: `El número ${numero} está repetido en la lista.` }, { status: 400 });
      }
      vistos.add(clave);

      limpios.push({
        numero,
        nombre: String(entrada?.nombre ?? "").trim().slice(0, 60),
        rol: entrada?.rol === "business_admin" ? "business_admin" : "staff",
      });
    }

    const existingRows = await g.sr.entities.WhatsAppConfig.filter({ business_id: g.businessId }, null, 1);
    const existing = existingRows?.[0] || null;

    const saved = existing
      ? await g.sr.entities.WhatsAppConfig.update(existing.id, { numeros_autorizados: limpios })
      : await g.sr.entities.WhatsAppConfig.create({
          business_id: g.businessId,
          numeros_autorizados: limpios,
        });

    const antes = new Set(
      ((existing?.numeros_autorizados || []) as Array<{ numero?: string }>).map((n) => String(n.numero)),
    );
    const ahora = new Set(limpios.map((n) => n.numero));
    const agregados = limpios.filter((n) => !antes.has(n.numero)).map((n) => `${n.numero} (${n.rol})`);
    const quitados = [...antes].filter((n) => !ahora.has(n));

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "WhatsApp:manage_numbers",
      entity: "WhatsAppConfig",
      entityId: saved.id,
      summary: [
        agregados.length ? `Autorizó por WhatsApp a ${agregados.join(", ")}.` : "",
        quitados.length ? `Quitó el acceso por WhatsApp a ${quitados.join(", ")}.` : "",
      ].filter(Boolean).join(" ") || "Guardó la lista de números autorizados sin cambios.",
      changes: { numeros_autorizados: { antes: [...antes], despues: [...ahora] } },
    });

    return Response.json({ config: saved, agregados, quitados });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
