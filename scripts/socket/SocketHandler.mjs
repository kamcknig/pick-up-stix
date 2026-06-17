import { pickupItem, depositItem, setContainerOpen, purchaseItem } from "../transfer/ItemTransfer.mjs";
import { createInteractiveToken, splitInteractiveToken } from "../canvas/placement.mjs";
import { getTokenActor } from "../utils/actorHelpers.mjs";
import { dbg } from "../utils/debugLog.mjs";
import { decrementOrDeleteItem } from "../utils/quantityPrompt.mjs";
import { setInitiator, clearInitiator } from "../utils/notify.mjs";

const SOCKET_NAME = "module.pick-up-stix";

export function registerSocket() {
  game.socket.on(SOCKET_NAME, async (payload) => {
    dbg("socket:received", { action: payload.action, data: payload.data, isGM: game.user.isGM });

    // Broadcast actions handled by every client (not just the GM).
    if (payload.action === "closeTokenHud") {
      closeTokenHudIfMatching(payload.data?.sceneId, payload.data?.tokenId);
      return;
    }

    // Only the active GM processes the remaining socket requests
    if (!game.user.isGM) {
      dbg("socket:received", "not GM, ignoring socket event");
      return;
    }

    // Stamp the initiating user for downstream notifyItemAction calls so the
    // GM's notifications include the player's name.
    setInitiator(payload.data?._initiatorUserId ?? null);
    try {
      await _dispatch(payload);
    } finally {
      clearInitiator();
    }
  });
}

async function _dispatch(payload) {
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
      case "purchaseItem": {
        if (!game.user.isActiveGM) break;       // currency safety: single processor for sockets
        const { vendorActorId, itemId, buyerActorId, quantity } = payload.data ?? {};
        await purchaseItem(vendorActorId, itemId, buyerActorId, quantity ?? 1);
        break;
      }
    }
}

export function emitSocketEvent(action, data) {
  dbg("socket:emit", { action, data });
  game.socket.emit(SOCKET_NAME, { action, data });
}

// Close the Token HUD on this client if it's currently bound to the given
// scene/token. `game.socket.emit` does not echo to the sender, so the emitter
// must also invoke this directly when it wants its own HUD dismissed.
export function closeTokenHudIfMatching(sceneId, tokenId) {
  const hud = canvas?.tokens?.hud;
  const hudToken = hud?.object;
  if (hud?.rendered && hudToken?.document?.id === tokenId && hudToken?.scene?.id === sceneId) {
    dbg("socket:closeTokenHud", "closing HUD on this client", { sceneId, tokenId });
    hud.clear();
  }
}
