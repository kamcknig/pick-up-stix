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
  // Inject the initiating user's id so the GM-side handler can attribute the
  // resulting notification to the player who triggered the action.
  emitSocketEvent(action, { ...data, _initiatorUserId: game.user.id });
  return true;
}
