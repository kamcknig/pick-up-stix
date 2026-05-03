import { emitSocketEvent } from "../socket/SocketHandler.mjs";
import { dbg } from "./debugLog.mjs";

export async function dispatchGM(action, data, gmFn) {
  dbg("gmDispatch:dispatchGM", { action, isGM: game.user.isGM, data });
  if (game.user.isGM) {
    dbg("gmDispatch:dispatchGM", "executing directly as GM");
    await gmFn();
    return true;
  }
  dbg("gmDispatch:dispatchGM", "routing via socket (player)");
  emitSocketEvent(action, data);
  return true;
}
