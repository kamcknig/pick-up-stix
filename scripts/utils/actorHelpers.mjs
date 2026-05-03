import { INTERACTIVE_TYPES } from "../constants.mjs";

export function isInteractiveActor(actor) {
  return !!actor && INTERACTIVE_TYPES.has(actor.type);
}

export function isInteractiveContainer(actor) {
  return isInteractiveActor(actor) && !!actor.system?.isContainer;
}

export function isInteractiveItemMode(actor) {
  return isInteractiveActor(actor) && !actor.system?.isContainer;
}

export function getTokenActor(sceneId, tokenId) {
  const tokenDoc = game.scenes.get(sceneId)?.tokens.get(tokenId);
  if (!tokenDoc?.actor) return null;
  return { actor: tokenDoc.actor, tokenDoc };
}
