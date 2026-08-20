import { handle as generarAlertasSafe } from "./generarAlertasSafe.ts";
import { handle as markReadSafe } from "./markReadSafe.ts";

type Handler = (req: Request) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  generarAlertasSafe,
  markReadSafe,
};

export function getHandler(action: string): Handler | undefined {
  return HANDLERS[action];
}
