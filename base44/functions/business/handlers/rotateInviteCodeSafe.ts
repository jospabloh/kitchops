import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";

// Rotate (or switch off) the invite code.
//
// An invite code is a bearer credential: whoever has it becomes staff of this
// restaurant and can read every expense in it. Codes get shared in group chats
// and screenshots and outlive the person they were meant for, so the owner
// needs a way to invalidate one without deleting the tenant — this is it.
function randomInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin caracteres ambiguos
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { active } = body;

    const g = await guard(base44, body, "Cuenta:manage_members");
    if (!g.ok) return g.response;

    // active === false turns the door off without minting a new key; anything
    // else rotates and leaves it open.
    const patch = active === false
      ? { invite_code_active: false }
      : { invite_code: randomInviteCode(), invite_code_active: true };

    const updated = await g.sr.entities.Business.update(g.businessId, patch);

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Cuenta:manage_members",
      entity: "Business",
      entityId: g.businessId,
      summary: active === false
        ? "Desactivó el código de invitación del negocio."
        : "Generó un código de invitación nuevo (el anterior dejó de servir).",
    });

    return Response.json({
      invite_code: updated.invite_code,
      invite_code_active: updated.invite_code_active,
    });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
