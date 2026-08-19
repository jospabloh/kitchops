import { handle as savePermissionProfileSafe } from "./savePermissionProfileSafe.ts";

type Handler = (req: Request) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  savePermissionProfileSafe,
};

export function getHandler(action: string): Handler | undefined {
  return HANDLERS[action];
}
