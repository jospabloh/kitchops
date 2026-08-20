import { handle as createItemSafe } from "./createItemSafe.ts";
import { handle as updateItemSafe } from "./updateItemSafe.ts";
import { handle as ajustarStockSafe } from "./ajustarStockSafe.ts";
import { handle as deleteItemSafe } from "./deleteItemSafe.ts";

type Handler = (req: Request) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  createItemSafe,
  updateItemSafe,
  ajustarStockSafe,
  deleteItemSafe,
};

export function getHandler(action: string): Handler | undefined {
  return HANDLERS[action];
}
