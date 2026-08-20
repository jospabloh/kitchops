import { handle as saveConfigSafe } from "./saveConfigSafe.ts";
import { handle as saveNumerosSafe } from "./saveNumerosSafe.ts";
import { handle as sendTestSafe } from "./sendTestSafe.ts";

type Handler = (req: Request) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  saveConfigSafe,
  saveNumerosSafe,
  sendTestSafe,
};

export function getHandler(action: string): Handler | undefined {
  return HANDLERS[action];
}
