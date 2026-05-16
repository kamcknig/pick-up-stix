import { pickupItem, depositItem, setContainerOpen } from "../transfer/ItemTransfer.mjs";
import { createInteractiveToken, splitInteractiveToken } from "../canvas/placement.mjs";
import { getTokenActor } from "../utils/actorHelpers.mjs";
import { dbg } from "../utils/debugLog.mjs";
import { decrementOrDeleteItem } from "../utils/quantityPrompt.mjs";

const SOCKET_NAME = "module.pick-up-stix";

export function registerSocket() {
  game.socket.on(SOCKET_NAME, async (payload) => {
    dbg("socket:received", { action: payload.action, data: payload.data, isGM: game.user.isGM });
    // Only the active GM processes socket requests
    if (!game.user.isGM) {
      dbg("socket:received", "not GM, ignoring socket event");
      return;
    }

    switch (payload.action) {
      case "pickupItem":
        await pickupItem(
          payload.data.sceneId,
          payload.data.tokenId,
          payload.data.itemId,
          payload.data.targetActorId,
          payload.data.quantity ?? null,  // optional partial-stack quantity
          payload.data.contentId ?? null  // optional (generic) container-row id
        );
        break;
      case "depositItem":
        await depositItem(
          payload.data.sourceActorId,
          payload.data.itemId,
          payload.data.sceneId,
          payload.data.tokenId,
          payload.data.quantity ?? null  // optional partial-stack quantity
        );
        break;
      case "toggleOpen": {
        const result = getTokenActor(payload.data.sceneId, payload.data.tokenId);
        if (result?.actor) {
          await setContainerOpen(result.actor, payload.data.isOpen, { silent: true });
        }
        break;
      }
      case "placeItem": {
        const item = await fromUuid(payload.data.itemUuid);
        if (!item) break;
        const quantity = payload.data.quantity ?? null;
        await createInteractiveToken(item, payload.data.x, payload.data.y, {
          ephemeral: !!payload.data.ephemeral,
          level: payload.data.level ?? null,  // forward player-supplied level (v14)
          quantity                            // forward player-chosen partial-stack quantity
        });
        // Decrement or delete the source based on how much was placed.
        // When quantity is null the full stack was moved, so delete outright.
        if (payload.data.sourceActorId && payload.data.itemId) {
          const sourceActor = game.actors.get(payload.data.sourceActorId);
          const sourceItem = sourceActor?.items.get(payload.data.itemId);
          if (sourceItem) {
            if (quantity != null) {
              await decrementOrDeleteItem(sourceItem, quantity);
            } else {
              await sourceItem.delete({ deleteContents: true });
            }
          }
        }
        break;
      }
      case "splitItem":
        await splitInteractiveToken(
          payload.data.sceneId,
          payload.data.tokenId,
          payload.data.splitQty
        );
        break;
    }
  });
}

export function emitSocketEvent(action, data) {
  dbg("socket:emit", { action, data });
  game.socket.emit(SOCKET_NAME, { action, data });
}
