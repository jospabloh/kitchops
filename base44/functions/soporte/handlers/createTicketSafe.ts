import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";

const CATEGORIES = ["soporte", "mejora", "facturacion", "cuenta"];

// Module 8: the ticket is written to KitchOps FIRST, so it is never lost if the
// sync to Mission Control lags or fails. Mission Control pulls it from here
// through the acaciaControl bridge (tickets.list) into the portfolio-wide
// bodega, where triage actually happens. This app deliberately has no triage UI
// of its own beyond "enviado / respondido / resuelto".
//
// `ignoreBillingBlock` is the one deliberate exemption from the write gate:
// see GuardOptions in _guard.ts for why a suspended tenant must still be able
// to open a ticket. The real billing_status travels on the ticket so the
// operator sees it immediately.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const g = await guard(base44, body, "Soporte:create", { ignoreBillingBlock: true });
    if (!g.ok) return g.response;

    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!subject) return Response.json({ message: "Escribe un asunto." }, { status: 400 });
    if (!message) return Response.json({ message: "Cuéntanos qué pasó." }, { status: 400 });

    const category = CATEGORIES.includes(String(body.category)) ? String(body.category) : "soporte";
    const now = new Date().toISOString();

    const ticket = await g.sr.entities.SupportTicket.create({
      business_id: g.businessId,
      business_name: (g.business.name as string) || "",
      subject: subject.slice(0, 200),
      message,
      category,
      // Priority is the operator's call in Mission Control, not the reporter's
      // — otherwise every ticket arrives "urgent".
      priority: "normal",
      status: "submitted",
      created_by_email: g.user.email || "",
      last_message_at: now,
      last_message_by_role: "tenant",
      messages_count: 1,
      unread_for_tenant: false,
      app_version: String(body.app_version ?? "").slice(0, 32),
    });

    // The opening message is also the first row of the thread, so an operator
    // reading tickets.thread sees one continuous conversation rather than an
    // orphaned description followed by replies.
    await g.sr.entities.SupportTicketMessage.create({
      business_id: g.businessId,
      ticket_id: ticket.id,
      body: message,
      author_role: "tenant",
      author_email: g.user.email || "",
      author_name: (g.user.full_name as string) || g.user.email || "",
      sent_at: now,
    });

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Soporte:create",
      entity: "SupportTicket",
      entityId: ticket.id,
      summary: `Abrió un ticket de ${category}: "${subject}".`,
    });

    return Response.json({ ticket });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
