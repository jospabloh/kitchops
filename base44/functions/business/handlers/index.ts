import { handle as updateBusinessSafe } from "./updateBusinessSafe.ts";
import { handle as saveAppSettingsSafe } from "./saveAppSettingsSafe.ts";
import { handle as rotateInviteCodeSafe } from "./rotateInviteCodeSafe.ts";

type Handler = (req: Request) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  updateBusinessSafe,
  saveAppSettingsSafe,
  rotateInviteCodeSafe,
};

export function getHandler(action: string): Handler | undefined {
  return HANDLERS[action];
}
