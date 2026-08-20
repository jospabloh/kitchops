import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";

// The tenant's side of the thread. `author_role` is hardcoded to "tenant" here
// and is field-locked to admin writes on the entity itself, so a restaurant
// cannot post a message that renders as an official ACACIA support reply —
// which would otherwise be a convincing way to tell a colleague "soporte dice
// que ya está arreglado".
//
// The operator's side comes in through the acaciaControl bridge
// (tickets.update), never through this function.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { ticket_id } = body;
    if (!ticket_id) return Response.json({ message: "ticket_id es obligatorio." }, { status: 400 });

    const g = await guard(base44, body, "Soporte:create");
    if (!g.ok) return g.response;

    const message = String(body.message ?? "").trim();
    if (!message) return Response.json({ message: "El mensaje no puede ir vacío." }, { status: 400 });

    const ticket = await g.sr.entities.SupportTicket.get(ticket_id).catch(() => null);
    if (!ticket || ticket.business_id !== g.businessId) {
      return Response.json({ message: "Ticket no encontrado." }, { status: 404 });
    }

    const now = new Date().toISOString();
    await g.sr.entities.SupportTicketMessage.create({
      business_id: g.businessId,
      ticket_id,
      body: message,
      author_role: "tenant",
      author_email: g.user.email || "",
      author_name: (g.user.full_name as string) || g.user.email || "",
      sent_at: now,
    });

    // Replying to a resolved ticket reopens it — the alternative is a reply
    // that lands in a closed thread nobody is watching.
    const patch: Record<string, unknown> = {
      last_message_at: now,
      last_message_by_role: "tenant",
      messages_count: Number(ticket.messages_count || 0) + 1,
      unread_for_tenant: false,
    };
    if (ticket.status === "resolved") patch.status = "in_progress";

    const updated = await g.sr.entities.SupportTicket.update(ticket_id, patch);
    return Response.json({ ticket: updated });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
