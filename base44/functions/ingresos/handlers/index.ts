import { handle as createIngresoSafe } from "./createIngresoSafe.ts";
import { handle as updateIngresoSafe } from "./updateIngresoSafe.ts";
import { handle as conciliarIngresoSafe } from "./conciliarIngresoSafe.ts";
import { handle as deleteIngresoSafe } from "./deleteIngresoSafe.ts";

type Handler = (req: Request) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  createIngresoSafe,
  updateIngresoSafe,
  conciliarIngresoSafe,
  deleteIngresoSafe,
};

export function getHandler(action: string): Handler | undefined {
  return HANDLERS[action];
}
