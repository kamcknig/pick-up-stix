import { INTERACTIVE_TYPES } from "../constants.mjs";
import { getAdapter } from "../adapter/index.mjs";

export function isInteractiveActor(actor) {
  return !!actor && INTERACTIVE_TYPES.has(actor.type);
}

/**
 * True if the actor is an interactive container.
 *
 * Routes through `adapter.isInteractiveContainer` so generic-mode containers
 * (whose state lives in `flags["pick-up-stix"].interactive` rather than
 * `actor.system.isContainer`) are detected correctly. Falls back to the
 * legacy `actor.system?.isContainer` read if the adapter hasn't loaded yet
 * (which would only happen if called from very early init).
 */
export function isInteractiveContainer(actor) {
  if (!isInteractiveActor(actor)) return false;
  try {
    return getAdapter().isInteractiveContainer(actor);
  } catch {
    return !!actor.system?.isContainer;
  }
}

export function isInteractiveItemMode(actor) {
  if (!isInteractiveActor(actor)) return false;
  try {
    return !getAdapter().isInteractiveContainer(actor);
  } catch {
    return !actor.system?.isContainer;
  }
}

export function getTokenActor(sceneId, tokenId) {
  const tokenDoc = game.scenes.get(sceneId)?.tokens.get(tokenId);
  if (!tokenDoc?.actor) return null;
  return { actor: tokenDoc.actor, tokenDoc };
}
