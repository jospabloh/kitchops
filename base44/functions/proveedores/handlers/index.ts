import { handle as createProveedorSafe } from "./createProveedorSafe.ts";
import { handle as updateProveedorSafe } from "./updateProveedorSafe.ts";
import { handle as deleteProveedorSafe } from "./deleteProveedorSafe.ts";

type Handler = (req: Request) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  createProveedorSafe,
  updateProveedorSafe,
  deleteProveedorSafe,
};

export function getHandler(action: string): Handler | undefined {
  return HANDLERS[action];
}
