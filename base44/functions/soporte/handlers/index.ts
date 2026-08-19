import { handle as createTicketSafe } from "./createTicketSafe.ts";
import { handle as replyTicketSafe } from "./replyTicketSafe.ts";
import { handle as markThreadReadSafe } from "./markThreadReadSafe.ts";

type Handler = (req: Request) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  createTicketSafe,
  replyTicketSafe,
  markThreadReadSafe,
};

export function getHandler(action: string): Handler | undefined {
  return HANDLERS[action];
}
