import { handle as createGastoSafe } from "./createGastoSafe.ts";
import { handle as updateGastoSafe } from "./updateGastoSafe.ts";
import { handle as deleteGastoSafe } from "./deleteGastoSafe.ts";

type Handler = (req: Request) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  createGastoSafe,
  updateGastoSafe,
  deleteGastoSafe,
};

export function getHandler(action: string): Handler | undefined {
  return HANDLERS[action];
}
