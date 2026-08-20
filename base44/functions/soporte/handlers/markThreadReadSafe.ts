import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";

// Clears the "hay respuesta del soporte" badge once the tenant has actually
// opened the thread. Its own action rather than a field on the reply path,
// because reading is not replying and the badge should clear on open.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { ticket_id } = body;
    if (!ticket_id) return Response.json({ message: "ticket_id es obligatorio." }, { status: 400 });

    const g = await guard(base44, body, "Soporte:create");
    if (!g.ok) return g.response;

    const ticket = await g.sr.entities.SupportTicket.get(ticket_id).catch(() => null);
    if (!ticket || ticket.business_id !== g.businessId) {
      return Response.json({ message: "Ticket no encontrado." }, { status: 404 });
    }
    if (!ticket.unread_for_tenant) return Response.json({ ticket, unchanged: true });

    const updated = await g.sr.entities.SupportTicket.update(ticket_id, { unread_for_tenant: false });
    return Response.json({ ticket: updated });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
