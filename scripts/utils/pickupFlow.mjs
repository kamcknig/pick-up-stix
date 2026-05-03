import { INTERACTIVE_TYPES } from "../constants.mjs";
import {
  getPlayerCharacter,
  promptGMPickupTarget,
  promptPlayerPickupTarget
} from "../transfer/ItemTransfer.mjs";
import { dbg } from "./debugLog.mjs";
import { isModuleGM, isPlayerView } from "./playerView.mjs";

export async function resolvePickupTarget(interactiveActor) {
  dbg("flow:resolvePickupTarget", { actorName: interactiveActor.name, isGM: isModuleGM() });

  if (isPlayerView()) {
    dbg("flow:resolvePickupTarget", "player path → promptPlayerPickupTarget");
    return promptPlayerPickupTarget(interactiveActor);
  }

  const controlled = (canvas.tokens?.controlled ?? [])
    .filter(t => t.actor && !INTERACTIVE_TYPES.has(t.actor.type))
    .map(t => t.actor);

  dbg("flow:resolvePickupTarget", "GM path", { controlledNonInteractiveCount: controlled.length, controlledNames: controlled.map(a => a.name) });

  if (controlled.length > 1) {
    dbg("flow:resolvePickupTarget", "multiple controlled tokens → promptGMPickupTarget (limited to controlled)");
    return promptGMPickupTarget(controlled);
  }

  const fallback = getPlayerCharacter();
  dbg("flow:resolvePickupTarget", "single/zero controlled, using getPlayerCharacter fallback", { fallbackName: fallback?.name ?? "null" });
  if (fallback) return fallback;

  dbg("flow:resolvePickupTarget", "no character fallback → promptGMPickupTarget (scene-wide)");
  return promptGMPickupTarget();
}
