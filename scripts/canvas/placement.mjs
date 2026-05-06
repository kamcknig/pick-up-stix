import { isInteractiveActor } from "../utils/actorHelpers.mjs";
import { getItemSourceActorId } from "../utils/itemFlags.mjs";
import { dispatchGM } from "../utils/gmDispatch.mjs";
import { notifyItemAction } from "../utils/notify.mjs";
import { getPlayerCandidateTokens, depositItem, buildInteractiveItemData, assignContainerParent } from "../transfer/ItemTransfer.mjs";
import { dbg } from "../utils/debugLog.mjs";
import { dragModifiersHeld } from "../utils/dragModifier.mjs";
import { findCanvasDropTargets, promptDropChoice, PLACE_ON_CANVAS } from "../utils/canvasDropTargets.mjs";
import { hasLevels, getViewedLevelId, getTokenLevelId } from "../utils/levels.mjs";
import { getAdapter } from "../adapter/index.mjs";
import { promptItemQuantity, decrementOrDeleteItem } from "../utils/quantityPrompt.mjs";

const MODULE_ID = "pick-up-stix";

export function registerPlacement() {
  Hooks.on("dropCanvasData", onDropCanvasData);
  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
}

function onDropCanvasData(canvas, data, event) {
  dbg("place:onDropCanvasData", {
    dataType: data.type,
    ctrlHeld: event.ctrlKey || event.metaKey,
    uuid: data.uuid
  });

  if (data.type === "Item") {
    if (!dragModifiersHeld(event)) {
      dbg("place:onDropCanvasData", "Item: required drag modifiers not held, bail");
      return;
    }
    // Fire async without awaiting — must return false synchronously.
    _handleItemDrop(data).catch(err => console.error(`${MODULE_ID} | Drop failed:`, err));
    return false;
  }

  if (data.type === "Actor") {
    const dropped = fromUuidSync(data.uuid);
    if (!isInteractiveActor(dropped)) {
      dbg("place:onDropCanvasData", "Actor: not interactive, let core handle");
      return;
    }
    if (!dragModifiersHeld(event)) {
      dbg("place:onDropCanvasData", "Actor: interactive, modifiers not held, bail",
        { actorName: dropped?.name });
      return false; // cancel core's token-from-actor creation
    }

    const overlapTargets = findCanvasDropTargets(data.x, data.y, { sourceActorId: dropped.id });
    if (!overlapTargets.length) {
      dbg("place:onDropCanvasData", "Actor: interactive, modifiers held, no overlap → core");
      return;
    }

    dbg("place:onDropCanvasData", "Actor: interactive, overlap targets found — block core, prompt",
      { count: overlapTargets.length });
    // Fire async without awaiting — must return false synchronously to block core.
    _handleInteractiveActorDropWithOverlap(dropped, data, overlapTargets)
      .catch(err => console.error(`${MODULE_ID} | Actor drop-target flow failed:`, err));
    return false;
  }

  dbg("place:onDropCanvasData", "non-Item/Actor type, let core handle", { type: data.type });
}

async function _handleItemDrop(data) {
  const item = await fromUuid(data.uuid);
  if (!item) {
    dbg("place:_handleItemDrop", "could not resolve item from uuid, bail", { uuid: data.uuid });
    return;
  }

  const hasSource = !!item.flags?.["pick-up-stix"]?.sourceActorId;
  // Delegate item-type check to the adapter so the literal "container" is not
  // hard-coded to the dnd5e vocabulary.
  const isContainer = getAdapter().isContainerItem(item);
  const isWorldItem = !item.actor; // From Items directory, no parent actor

  let ephemeral = false;

  dbg("place:_handleItemDrop", {
    itemName: item.name, itemUuid: item.uuid, hasSource, isContainer, isWorldItem, isGM: game.user.isGM
  });

  if (!isContainer && !hasSource) {
    if (isWorldItem && game.user.isGM) {
      const createTemplate = await _promptCreateTemplate(item);
      if (createTemplate === null) {
        dbg("place:_handleItemDrop", "template dialog cancelled");
        return;
      }
      ephemeral = !createTemplate;
      dbg("place:_handleItemDrop", "GM world-item drop", { createTemplate, ephemeral });
    } else {
      ephemeral = true;
      dbg("place:_handleItemDrop", "inventory drop without sourceActorId → ephemeral");
    }
  }

  const sourceActorId = item.actor?.id ?? null;
  // On v14, restrict overlap targets to the level the item is being dropped onto.
  // GMs use the viewed level (null → findCanvasDropTargets internal default).
  // Players use their character's level so a stacked-visible container on a different
  // floor doesn't falsely prompt for deposit.
  const dropLevel = game.user.isGM
    ? (data.level ?? null)
    : (() => {
        const ownerToken = item.actor
          ? canvas.tokens.placeables.find(t => t.actor?.id === item.actor.id) ?? null
          : null;
        const playerToken = ownerToken ?? getPlayerCandidateTokens()[0] ?? null;
        return playerToken ? getTokenLevelId(playerToken.document) : null;
      })();
  dbg("place:_handleItemDrop", "resolving overlap targets", { sourceActorId, dropLevel });
  const overlapTargets = findCanvasDropTargets(data.x, data.y, { sourceActorId, level: dropLevel });
  if (overlapTargets.length) {
    dbg("place:_handleItemDrop", "overlap targets found, prompting user",
      { count: overlapTargets.length, names: overlapTargets.map(t => t.actor.name) });
    const result = await promptDropChoice({
      droppedName: item.name,
      targets: overlapTargets,
      topLabel: game.i18n.localize("INTERACTIVE_ITEMS.Dialog.PlaceOnCanvas"),
      hintKey: overlapTargets.length === 1
        ? "INTERACTIVE_ITEMS.Dialog.DropTargetHint"
        : "INTERACTIVE_ITEMS.Dialog.MultiDropTargetHint",
    });
    if (!result) {
      dbg("place:_handleItemDrop", "drop-target dialog cancelled, bail");
      return;
    }
    if (result !== PLACE_ON_CANVAS) {
      // ---------- Quantity prompt (deposit branch) ----------
      // Only prompt when moving from a real inventory source (world items have no
      // source to decrement) and the item is not a container (always quantity 1).
      let depositQty = null;
      if (item.actor && !isContainer) {
        const sourceQty = getAdapter().getItemQuantity(item);
        if (sourceQty > 1) {
          const isInteractiveContainerTarget = result.actor.system?.isContainer === true;
          depositQty = await promptItemQuantity({
            itemName: item.name,
            max: sourceQty,
            actionKey: isInteractiveContainerTarget
              ? "INTERACTIVE_ITEMS.Dialog.QuantityActionDeposit"
              : "INTERACTIVE_ITEMS.Dialog.QuantityActionGive",
            actionFormatArgs: { target: result.actor.name }
          });
          if (depositQty == null) {
            dbg("place:_handleItemDrop", "deposit quantity dialog cancelled, bail");
            return;
          }
          dbg("place:_handleItemDrop", "deposit quantity chosen", { depositQty, sourceQty });
        }
      }
      // ---------- End quantity prompt (deposit branch) ----------
      await depositItemToTarget(item, result, { quantity: depositQty });
      return;
    }
    dbg("place:_handleItemDrop", "user chose PLACE_ON_CANVAS, fall through to placement");
  }

  // ---------- Quantity prompt (canvas placement branch) ----------
  // Only prompt when moving from a real inventory source (world items have no
  // source to decrement) and the item is not a container (always quantity 1).
  let chosenQuantity = null;
  if (item.actor && !isContainer) {
    const sourceQty = getAdapter().getItemQuantity(item);
    if (sourceQty > 1) {
      chosenQuantity = await promptItemQuantity({
        itemName: item.name,
        max: sourceQty,
        actionKey: "INTERACTIVE_ITEMS.Dialog.QuantityActionPlace"
      });
      if (chosenQuantity == null) {
        dbg("place:_handleItemDrop", "quantity dialog cancelled, bail");
        return;
      }
      dbg("place:_handleItemDrop", "quantity chosen", { chosenQuantity, sourceQty });
    }
  }
  // ---------- End quantity prompt (canvas placement branch) ----------

  if (game.user.isGM) {
    dbg("place:_handleItemDrop", "GM path — createInteractiveToken", {
      x: data.x, y: data.y, ephemeral, level: data.level ?? null, chosenQuantity
    });
    await createInteractiveToken(item, data.x, data.y, { ephemeral, level: data.level ?? null, quantity: chosenQuantity });
    // Decrement or delete the source based on how much was placed.
    // World items (no actor) are not decremented — there is no source to split.
    if (item.actor) {
      if (chosenQuantity != null) {
        await decrementOrDeleteItem(item, chosenQuantity);
      } else {
        await item.delete({ deleteContents: true });
      }
    }
  } else {
    // Prefer the owner's canvas token so the item lands at the dragger's position,
    // not the first controlled token.
    const ownerToken = item.actor
      ? canvas.tokens.placeables.find(t => t.actor?.id === item.actor.id) ?? null
      : null;
    const playerToken = ownerToken ?? getPlayerCandidateTokens()[0] ?? null;
    dbg("place:_handleItemDrop", "player path", {
      ownerTokenId: ownerToken?.document?.id, playerTokenId: playerToken?.document?.id, ephemeral
    });
    if (!playerToken) {
      dbg("place:_handleItemDrop", "no player token found, bail");
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoCharacter"));
      return;
    }
    const x = playerToken.document.x;
    const y = playerToken.document.y;
    // Player drops always target the player's character's level, even if the GM
    // is currently viewing a different level.
    const playerLevel = getTokenLevelId(playerToken.document);

    dbg("place:_handleItemDrop", "routing placeItem via socket",
      { x, y, level: playerLevel, ephemeral, itemUuid: data.uuid, chosenQuantity });
    dispatchGM(
      "placeItem",
      {
        itemUuid: data.uuid,
        sourceActorId: item.actor?.id ?? null,
        itemId: item.id,
        x, y,
        level: playerLevel,
        ephemeral,
        quantity: chosenQuantity   // forwarded to GM-side handler
      },
      () => {} // unreachable — game.user.isGM is false in this branch
    );
    notifyItemAction("Placed", item.name);
  }
}

async function _promptCreateTemplate(item) {
  return foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("INTERACTIVE_ITEMS.Dialog.CreateTemplateTitle", { name: item.name }) },
    content: `
      <p>${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.CreateTemplateHint")}</p>
      <dl>
        <dt>${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.CreateTemplateTemplated")}</dt>
        <dd>${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.CreateTemplateTemplatedHint")}</dd>
        <dt>${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.CreateTemplateEphemeral")}</dt>
        <dd>${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.CreateTemplateEphemeralHint")}</dd>
      </dl>
    `,
    buttons: [
      {
        action: "yes",
        label: game.i18n.localize("INTERACTIVE_ITEMS.Dialog.CreateTemplateTemplated"),
        icon: "fa-solid fa-bookmark",
        callback: () => true
      },
      {
        action: "no",
        label: game.i18n.localize("INTERACTIVE_ITEMS.Dialog.CreateTemplateEphemeral"),
        icon: "fa-solid fa-ghost",
        callback: () => false
      }
    ],
    close: () => null
  });
}

/**
 * Deposit `item` into the actor represented by `targetToken`.
 *
 * @param {Item} item
 * @param {Token} targetToken
 * @param {object} [options]
 * @param {number|null} [options.quantity=null] - Optional partial-stack quantity.
 *   When null, the full stack is moved (legacy behavior).
 */
async function depositItemToTarget(item, targetToken, { quantity = null } = {}) {
  const targetActor = targetToken.actor;
  const tokenDoc = targetToken.document;
  const sceneId = tokenDoc.parent.id;
  const tokenId = tokenDoc.id;
  const adapter = getAdapter();
  const sourceQty = adapter.getItemQuantity(item);
  const moveQty = quantity == null
    ? sourceQty
    : Math.max(1, Math.min(Math.floor(quantity), sourceQty));

  dbg("place:depositItemToTarget", {
    itemName: item.name, itemUuid: item.uuid,
    targetName: targetActor.name, targetId: targetActor.id,
    tokenId, sceneId, isGM: game.user.isGM,
    targetIsInteractiveContainer: targetActor.system?.isContainer === true,
    sourceQty, moveQty
  });

  // Players can't remove world items; depositItem requires a source actor.
  if (!game.user.isGM && !item.actor) {
    dbg("place:depositItemToTarget", "player dropping world item onto target, bail");
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TransferError"));
    return;
  }

  if (game.user.isGM) {
    // Use item reference directly — synthetic parent actors aren't in game.actors.
    if (!item.actor) {
      // World items: no source to decrement, quantity override still applies to the created copy.
      const itemData = item.toObject();
      delete itemData._id;
      if (moveQty !== sourceQty) adapter.setItemDataQuantity(itemData, moveQty);
      assignContainerParent(targetActor, itemData);
      dbg("place:depositItemToTarget", "GM world-item path: creating on target", { targetName: targetActor.name, moveQty });
      await CONFIG.Item.documentClass.createDocuments([itemData], { parent: targetActor, keepId: false });
      notifyItemAction("Deposited", item.name);
      return;
    }
    const toCreate = await CONFIG.Item.documentClass.createWithContents([item]);
    // Override quantity on the first entry (the source item); nested contents keep their own.
    if (moveQty !== sourceQty && toCreate.length) {
      adapter.setItemDataQuantity(toCreate[0], moveQty);
    }
    assignContainerParent(targetActor, toCreate);
    dbg("place:depositItemToTarget", "GM inventory-source path: creating on target",
      { sourceActorName: item.actor.name, targetName: targetActor.name, toCreateCount: toCreate.length, moveQty, sourceQty });
    await CONFIG.Item.documentClass.createDocuments(toCreate, { parent: targetActor, keepId: true });
    // Decrement or delete the source based on how much was moved.
    await decrementOrDeleteItem(item, moveQty);
    notifyItemAction("Deposited", item.name);
    return;
  }

  // Player source is always a linked character, so game.actors.get resolves correctly.
  // Forward the chosen quantity so the GM-side handler does the partial-stack split.
  await dispatchGM(
    "depositItem",
    { sourceActorId: item.actor.id, itemId: item.id, sceneId, tokenId, quantity: moveQty },
    async () => depositItem(item.actor.id, item.id, sceneId, tokenId, moveQty)
  );
  notifyItemAction("Deposited", item.name);
}

async function depositActorToTarget(droppedActor, targetToken) {
  const targetActor = targetToken.actor;
  dbg("place:depositActorToTarget", {
    droppedName: droppedActor.name, droppedId: droppedActor.id,
    targetName: targetActor.name, targetId: targetActor.id,
    targetIsContainer: targetActor.system?.isContainer === true
  });

  if (droppedActor.system.isContainer) {
    dbg("place:depositActorToTarget", "dropped actor is container-mode, bail");
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.CannotGiveContainer"));
    return;
  }

  const itemData = buildInteractiveItemData(droppedActor);
  if (!itemData) {
    dbg("place:depositActorToTarget", "buildInteractiveItemData returned null, bail");
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotInitialized"));
    return;
  }

  if (targetActor.system?.isContainer && targetActor.system.containerItem) {
    // Delegate container-parent field write to the adapter so the field path
    // is not hard-coded to dnd5e's `system.container`.
    getAdapter().setItemContainerId(itemData, targetActor.system.containerItem.id);
  }

  if (game.user.isGM) {
    dbg("place:depositActorToTarget", "GM path: createDocuments on target");
    await CONFIG.Item.documentClass.createDocuments([itemData], { parent: targetActor, keepId: false });
    notifyItemAction("Deposited", droppedActor.name);
  } else {
    // Players can't see sidebar actors; no socket action exists for this path.
    dbg("place:depositActorToTarget", "player path blocked (no socket action for actor→target)");
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TransferError"));
  }
}

async function depositCanvasTokenToTarget(tokenDoc, targetToken, { quantity = null } = {}) {
  const sourceActor = tokenDoc.actor;
  const targetActor  = targetToken.actor;
  dbg("place:depositCanvasTokenToTarget", {
    sourceName: sourceActor?.name, sourceId: sourceActor?.id,
    targetName: targetActor.name, targetId: targetActor.id,
    targetIsContainer: targetActor.system?.isContainer === true,
    quantity
  });

  if (!sourceActor) {
    dbg("place:depositCanvasTokenToTarget", "no actor on source token, bail");
    return;
  }

  const adapter = getAdapter();
  const embeddedItem = sourceActor.system?.topLevelItems?.[0] ?? null;
  const sourceQty = embeddedItem ? adapter.getItemQuantity(embeddedItem) : 1;
  const moveQty = quantity == null
    ? sourceQty
    : Math.max(1, Math.min(Math.floor(quantity), sourceQty));
  const isPartial = moveQty < sourceQty;

  const itemData = buildInteractiveItemData(sourceActor);
  if (!itemData) {
    dbg("place:depositCanvasTokenToTarget", "buildInteractiveItemData returned null, bail");
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotInitialized"));
    return;
  }

  if (isPartial) adapter.setItemDataQuantity(itemData, moveQty);

  if (targetActor.system?.isContainer && targetActor.system.containerItem) {
    // Delegate container-parent field write to the adapter so the field path
    // is not hard-coded to dnd5e's `system.container`.
    adapter.setItemContainerId(itemData, targetActor.system.containerItem.id);
  }

  dbg("place:depositCanvasTokenToTarget", "creating item on target", { moveQty, sourceQty, isPartial });
  await CONFIG.Item.documentClass.createDocuments([itemData], { parent: targetActor, keepId: false });

  if (isPartial && embeddedItem) {
    // Partial move — leave the token in place and decrement the embedded item.
    // Skip decrementOrDeleteItem so we never accidentally delete the wrapped
    // item out from under the actor; isPartial guarantees moveQty < sourceQty.
    await embeddedItem.update({ "system.quantity": sourceQty - moveQty });
  } else {
    await tokenDoc.delete();
  }
  notifyItemAction("Deposited", sourceActor.name);
}

export async function _handleTokenMoveWithOverlap(tokenDoc, changes, overlapTargets) {
  const actorName = tokenDoc.actor?.name ?? tokenDoc.name;
  const result = await promptDropChoice({
    droppedName: actorName,
    targets: overlapTargets,
    topLabel:  game.i18n.localize("INTERACTIVE_ITEMS.Dialog.MoveToPosition"),
    topIcon:   "fa-solid fa-arrows-up-down-left-right",
    titleKey:  overlapTargets.length === 1
      ? "INTERACTIVE_ITEMS.Dialog.TokenMoveTitle"
      : "INTERACTIVE_ITEMS.Dialog.TokenMoveTitle",
    hintKey:   overlapTargets.length === 1
      ? "INTERACTIVE_ITEMS.Dialog.TokenMoveHint"
      : "INTERACTIVE_ITEMS.Dialog.TokenMultiMoveHint",
  });

  if (!result) {
    dbg("place:tokenMove", "dialog cancelled, token stays at original position");
    return;
  }
  if (result === PLACE_ON_CANVAS) {
    dbg("place:tokenMove", "user chose MOVE_TO_POSITION, re-applying update");
    // bypassOverlapCheck prevents the preUpdateToken hook from intercepting our own re-apply.
    await tokenDoc.update(changes, { interactiveItems: { bypassOverlapCheck: true } });
    return;
  }
  // Deposit into the chosen target. Prompt for a partial-stack quantity when
  // the source token's embedded item has more than one. Skipped for container
  // tokens (their embedded backpack is a single item, never a stack).
  dbg("place:tokenMove", "user chose deposit target", { targetName: result.actor.name });
  const adapter = getAdapter();
  const sourceActor = tokenDoc.actor;
  const embeddedItem = sourceActor?.system?.topLevelItems?.[0] ?? null;
  const sourceQty = embeddedItem ? adapter.getItemQuantity(embeddedItem) : 1;
  let chosen = null;
  if (embeddedItem && !adapter.isContainerItem(embeddedItem) && sourceQty > 1) {
    const isInteractiveContainerTarget = result.actor.system?.isContainer === true;
    chosen = await promptItemQuantity({
      itemName: sourceActor.name,
      max: sourceQty,
      actionKey: isInteractiveContainerTarget
        ? "INTERACTIVE_ITEMS.Dialog.QuantityActionDeposit"
        : "INTERACTIVE_ITEMS.Dialog.QuantityActionGive",
      actionFormatArgs: { target: result.actor.name }
    });
    if (chosen == null) {
      dbg("place:tokenMove", "quantity dialog cancelled, bail");
      return;
    }
  }
  await depositCanvasTokenToTarget(tokenDoc, result, { quantity: chosen });
}

async function _handleInteractiveActorDropWithOverlap(dropped, data, targets) {
  const result = await promptDropChoice({
    droppedName: dropped.name,
    targets,
    topLabel: game.i18n.localize("INTERACTIVE_ITEMS.Dialog.PlaceOnCanvas"),
    hintKey: targets.length === 1
      ? "INTERACTIVE_ITEMS.Dialog.DropTargetHint"
      : "INTERACTIVE_ITEMS.Dialog.MultiDropTargetHint",
  });

  if (!result) {
    dbg("place:actorDrop", "dialog cancelled, bail");
    return;
  }
  if (result === PLACE_ON_CANVAS) {
    dbg("place:actorDrop", "user chose PLACE_ON_CANVAS, mimic core token creation");
    await createTokenFromActor(dropped, data.x, data.y);
    return;
  }
  // result is the chosen Token placeable
  await depositActorToTarget(dropped, result);
}

/**
 * Creates an interactive token on the canvas for the given item at the given coordinates.
 *
 * On Foundry v14, the token will be assigned to the correct scene level using the
 * following priority order:
 *   1. Explicit `level` argument (forwarded via socket from the player's character level).
 *   2. Saved `tokenState.level` from a previous pickup snapshot (round-trip restore).
 *   3. Currently-viewed level (GM drop default via `canvas.level.id`).
 * On Foundry v13 (no levels system), `level`/`depth` are never written.
 *
 * @param {Item} item - The item to place as an interactive token.
 * @param {number} x - Canvas x coordinate.
 * @param {number} y - Canvas y coordinate.
 * @param {object} [options]
 * @param {boolean} [options.ephemeral=false] - When true, creates an ephemeral (non-template) actor.
 * @param {string|null} [options.level=null] - v14 level id to assign. Null = fall through to snapshot/viewed-level logic.
 * @param {number|null} [options.quantity=null] - Optional quantity override for the embedded item.
 *   When null, the item's current quantity is used unchanged. Container items always ignore this.
 */
async function createInteractiveToken(item, x, y, { ephemeral = false, level = null, quantity = null } = {}) {
  const snapped = canvas.grid.getTopLeftPoint({ x, y });
  x = snapped.x;
  y = snapped.y;

  // Delegate item-type check to the adapter so the literal "container" is not
  // hard-coded to the dnd5e vocabulary.
  const adapter = getAdapter();
  const isContainer = adapter.isContainerItem(item);
  const img = item.img || "icons/svg/item-bag.svg";

  if (isContainer) ephemeral = false; // containers always use templates

  // Compute the actual embedded-item quantity. Container items are always left
  // at their natural quantity (1); the quantity arg is ignored for them.
  const sourceQty = adapter.getItemQuantity(item);
  const moveQty = (!isContainer && quantity != null)
    ? Math.max(1, Math.min(Math.floor(quantity), sourceQty))
    : sourceQty;

  dbg("place:createInteractiveToken", { itemName: item.name, itemUuid: item.uuid, itemImg: item.img, x, y, ephemeral, isContainer, sourceQty, moveQty });

  let actor;

  if (!ephemeral) {
    const sourceUuid = item.actor ? null : item.uuid;
    const sourceActorId = getItemSourceActorId(item);
    dbg("place:createInteractiveToken", "template mode", { sourceActorId, sourceUuid });
    if (sourceActorId) {
      actor = game.actors.get(sourceActorId);
      dbg("place:createInteractiveToken", "reusing actor by sourceActorId", { actorId: actor?.id, actorName: actor?.name, actorImg: actor?.img });
    }
    if (!actor && sourceUuid) {
      actor = game.actors.find(a =>
        isInteractiveActor(a) &&
        a.system.sourceItemUuid === sourceUuid
      );
      if (actor) {
        dbg("place:createInteractiveToken", "reusing actor by sourceItemUuid", { actorId: actor.id, actorName: actor.name, actorImg: actor.img });
      }
    }

    if (!actor) {
      dbg("place:createInteractiveToken", "creating new template actor", { itemName: item.name, initialItemCount: 1 });

      // Inline items on Actor.create so createActor hook sees them and skips its
      // empty-container auto-creation path.
      // Always strip the system's container-parent pointer via the adapter:
      // the embedded item is becoming the top-level item of a new interactive
      // actor, so any stale pointer from its prior life would mis-classify it
      // as a child item in `topLevelItems`.
      const initialItems = [];
      if (isContainer) {
        const containerData = item.toObject();
        delete containerData._id;
        adapter.setItemContainerId(containerData, null);
        initialItems.push(containerData);
      } else {
        const itemData = item.toObject();
        delete itemData._id;
        adapter.setItemContainerId(itemData, null);
        // Apply the quantity override when a partial stack was requested.
        if (moveQty !== sourceQty) adapter.setItemDataQuantity(itemData, moveQty);
        initialItems.push(itemData);
      }

      dbg("place:createInteractiveToken", "items array for Actor.create", { count: initialItems.length, firstItemName: initialItems[0]?.name, firstItemImg: initialItems[0]?.img });
      actor = await CONFIG.Actor.documentClass.create({
        name: item.name,
        type: "pick-up-stix.interactiveItem",
        img: img,
        system: {
          description: item.system.description?.value ?? "",
          sourceItemUuid: sourceUuid ?? ""
        },
        prototypeToken: {
          name: item.name,
          texture: { src: img }
        },
        items: initialItems,
        flags: isContainer ? { [MODULE_ID]: { containerDefault: true } } : {}
      });
      dbg("place:createInteractiveToken", "new template actor created", { actorId: actor?.id, actorImg: actor?.img });

      if (isContainer) {
        // Delegate item-type check and container-parent field write to the adapter
        // so neither is hard-coded to the dnd5e vocabulary.
        const newContainerItem = actor.items.find(i => adapter.isContainerItem(i));
        if (newContainerItem && item.system.contents?.size > 0) {
          const toCreate = await CONFIG.Item.documentClass.createWithContents(
            Array.from(item.system.contents)
          );
          toCreate.forEach(i => {
            adapter.setItemContainerId(i, newContainerItem.id);
          });
          dbg("place:createInteractiveToken", "copying container contents", { contentCount: toCreate.length });
          if (toCreate.length > 0) {
            await CONFIG.Item.documentClass.createDocuments(toCreate, {
              parent: actor, keepId: true
            });
          }
        }
      }
    } else {
      dbg("place:createInteractiveToken", "reusing existing actor, skipping create");
    }
  } else {
    dbg("place:createInteractiveToken", "ephemeral mode — creating ephemeral actor", { itemName: item.name });
    actor = await CONFIG.Actor.documentClass.create({
      name: item.name,
      type: "pick-up-stix.interactiveItem",
      img: img,
      system: {
        description: item.system?.description?.value ?? ""
      },
      prototypeToken: {
        name: item.name,
        texture: { src: img }
      },
      flags: { "pick-up-stix": { ephemeral: true } }
    });
    dbg("place:createInteractiveToken", "ephemeral actor created", { actorId: actor?.id, actorImg: actor?.img });

    const itemData = item.toObject();
    delete itemData._id;
    // Strip stale container-parent pointer — the embedded item becomes the
    // top-level item of this ephemeral actor.
    adapter.setItemContainerId(itemData, null);
    // Apply the quantity override when a partial stack was requested.
    if (moveQty !== sourceQty) adapter.setItemDataQuantity(itemData, moveQty);
    dbg("place:createInteractiveToken", "creating embedded item on ephemeral actor", { itemName: itemData.name, itemImg: itemData.img, moveQty, sourceQty });
    await actor.createEmbeddedDocuments("Item", [itemData]);
  }

  const savedState = item.flags?.["pick-up-stix"]?.tokenState;
  const tokenFlags = { "pick-up-stix": {} };
  if (savedState) tokenFlags["pick-up-stix"].savedState = savedState;
  if (ephemeral) tokenFlags["pick-up-stix"].ephemeral = true;

  dbg("place:createInteractiveToken", "placing token", {
    actorId: actor.id, actorImg: actor.img, x, y,
    hasSavedState: !!savedState, levelArg: level
  });
  const tokenData = foundry.utils.mergeObject(
    actor.prototypeToken.toObject(),
    {
      x, y, actorId: actor.id,
      flags: tokenFlags
    }
  );

  // v14: tokens always land on the currently-active level.
  //   - Explicit `level` arg: player-drop level forwarded via socket (the player's own level).
  //   - Fallback: the GM's currently-viewed level for all other paths.
  //   Snapshot-saved level is intentionally not used — items should appear wherever
  //   they are dropped now, not where they were originally picked up from.
  if (hasLevels()) {
    tokenData.level = level ?? getViewedLevelId();
    dbg("place:createInteractiveToken", "v14 level assigned", {
      level: tokenData.level, fromArg: level !== null
    });
  }

  await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
  dbg("place:createInteractiveToken", "token placed", { actorId: actor.id, ephemeral });

  notifyItemAction("Placed", item.name);
}

/**
 * Creates a token on the canvas from a base actor at the given coordinates.
 * On v14, stamps the currently-viewed level onto the token document so the
 * token lands on the correct floor without relying on core's _onDropActorData.
 *
 * @param {Actor} actor
 * @param {number} x
 * @param {number} y
 */
async function createTokenFromActor(actor, x, y) {
  dbg("place:createTokenFromActor", { actorName: actor.name, actorId: actor.id, x, y });
  const snapped = canvas.grid.getTopLeftPoint({ x, y });
  const data = { x: snapped.x, y: snapped.y };
  if (hasLevels()) {
    data.level = getViewedLevelId();
    dbg("place:createTokenFromActor", "v14 level assigned", { level: data.level });
  }
  const tokenDocument = await actor.getTokenDocument(data);
  return canvas.scene.createEmbeddedDocuments("Token", [tokenDocument.toObject()]);
}

function onGetSceneControlButtons(controls) {
  if (!game.user.isGM) return;

  controls.tokens.tools.interactiveItemsTools = {
    name: "interactiveItemsTools",
    title: game.settings.get(MODULE_ID, "gmOverrideEnabled")
      ? "INTERACTIVE_ITEMS.Controls.DisableGMOverride"
      : "INTERACTIVE_ITEMS.Controls.EnableGMOverride",
    icon: "fa-solid fa-hand-holding-box",
    order: 100,
    toggle: true,
    active: game.settings.get(MODULE_ID, "gmOverrideEnabled"),
    visible: game.user.isGM,
    onChange: async (_event, active) => {
      await game.settings.set(MODULE_ID, "gmOverrideEnabled", active);
    }
  };
}

class PlacementDialog extends foundry.applications.api.DialogV2 {

  static async prompt() {
    const dialog = new PlacementDialog();
    return dialog.render({ force: true });
  }

  constructor() {
    super({
      window: { title: game.i18n.localize("INTERACTIVE_ITEMS.Dialog.PlaceTitle") },
      content: `
        <form class="pick-up-stix-placement">
          <div class="form-group">
            <label>${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.Name")}</label>
            <input type="text" name="name" value="Interactive Object" />
          </div>
          <div class="form-group">
            <label>${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.Type")}</label>
            <select name="objectType">
              <option value="item">${game.i18n.localize("INTERACTIVE_ITEMS.ObjectType.Item")}</option>
              <option value="container">${game.i18n.localize("INTERACTIVE_ITEMS.ObjectType.Container")}</option>
            </select>
          </div>
        </form>
      `,
      buttons: [
        {
          action: "create",
          label: game.i18n.localize("INTERACTIVE_ITEMS.Dialog.Create"),
          default: true,
          callback: async (event, button, dialog) => {
            const form = dialog.querySelector("form");
            const name = form.querySelector('[name="name"]').value || "Interactive Object";
            const objectType = form.querySelector('[name="objectType"]').value;

            const { x, y } = canvas.scene._viewPosition;
            const centerX = x;
            const centerY = y;

            // Use the adapter for item type literals so the placement dialog creates
            // items using the active system's vocabulary rather than dnd5e hard-codes.
            // `objectType` is a picker-dialog token ("container" | "item") — not an
            // item type — so the `objectType === "container"` comparisons stay as-is.
            const fakeItemType = objectType === "container"
              ? getAdapter().containerItemType
              : getAdapter().defaultLootItemType;
            const fakeItem = {
              name,
              type: fakeItemType,
              img: objectType === "container" ? "icons/svg/chest.svg" : "icons/svg/item-bag.svg",
              toObject: () => ({
                name,
                type: fakeItemType,
                img: objectType === "container" ? "icons/svg/chest.svg" : "icons/svg/item-bag.svg"
              }),
              system: { description: { value: "" }, contents: { size: 0 } }
            };

            await createInteractiveToken(fakeItem, centerX, centerY);
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("Cancel")
        }
      ]
    });
  }
}

export { createInteractiveToken, createTokenFromActor, _handleItemDrop as handleItemDrop };
