import { isInteractiveActor } from "../utils/actorHelpers.mjs";
import { getItemSourceActorId } from "../utils/itemFlags.mjs";
import { dispatchGM } from "../utils/gmDispatch.mjs";
import { notifyItemAction } from "../utils/notify.mjs";
import { getPlayerCandidateTokens, depositItem, buildInteractiveItemData, assignContainerParent } from "../transfer/ItemTransfer.mjs";
import { dbg } from "../utils/debugLog.mjs";
import { dragModifiersHeld } from "../utils/dragModifier.mjs";
import { findCanvasDropTargets, promptDropChoice, PLACE_ON_CANVAS } from "../utils/canvasDropTargets.mjs";
import { isModuleGM, isPlayerView } from "../utils/playerView.mjs";

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
  const isContainer = item.type === "container";
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
  const overlapTargets = findCanvasDropTargets(data.x, data.y, { sourceActorId });
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
      await depositItemToTarget(item, result);
      return;
    }
    dbg("place:_handleItemDrop", "user chose PLACE_ON_CANVAS, fall through to placement");
  }

  if (isModuleGM()) {
    dbg("place:_handleItemDrop", "GM path — createInteractiveToken", { x: data.x, y: data.y, ephemeral });
    await createInteractiveToken(item, data.x, data.y, { ephemeral });
    if (item.actor) await item.delete({ deleteContents: true });
  } else {
    // Prefer the owner's canvas token so the item lands at the dragger's position,
    // not the first controlled token.
    const ownerToken = item.actor
      ? canvas.tokens.placeables.find(t => t.actor?.id === item.actor.id) ?? null
      : null;
    const playerToken = ownerToken ?? getPlayerCandidateTokens()[0] ?? null;
    dbg("place:_handleItemDrop", "player path", { ownerTokenId: ownerToken?.document?.id, playerTokenId: playerToken?.document?.id, ephemeral });
    if (!playerToken) {
      dbg("place:_handleItemDrop", "no player token found, bail");
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoCharacter"));
      return;
    }
    const x = playerToken.document.x;
    const y = playerToken.document.y;

    dbg("place:_handleItemDrop", "routing placeItem via socket", { x, y, ephemeral, itemUuid: data.uuid });
    dispatchGM(
      "placeItem",
      { itemUuid: data.uuid, sourceActorId: item.actor?.id ?? null, itemId: item.id, x, y, ephemeral },
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

async function depositItemToTarget(item, targetToken) {
  const targetActor = targetToken.actor;
  const tokenDoc = targetToken.document;
  const sceneId = tokenDoc.parent.id;
  const tokenId = tokenDoc.id;

  dbg("place:depositItemToTarget", {
    itemName: item.name, itemUuid: item.uuid,
    targetName: targetActor.name, targetId: targetActor.id,
    tokenId, sceneId, isGM: game.user.isGM,
    targetIsInteractiveContainer: targetActor.system?.isContainer === true
  });

  // Players can't remove world items; depositItem requires a source actor.
  if (isPlayerView() && !item.actor) {
    dbg("place:depositItemToTarget", "player dropping world item onto target, bail");
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TransferError"));
    return;
  }

  if (isModuleGM()) {
    // Use item reference directly — synthetic parent actors aren't in game.actors.
    if (!item.actor) {
      const itemData = item.toObject();
      delete itemData._id;
      assignContainerParent(targetActor, itemData);
      dbg("place:depositItemToTarget", "GM world-item path: creating on target", { targetName: targetActor.name });
      await CONFIG.Item.documentClass.createDocuments([itemData], { parent: targetActor, keepId: false });
      notifyItemAction("Deposited", item.name);
      return;
    }
    const toCreate = await CONFIG.Item.documentClass.createWithContents([item]);
    assignContainerParent(targetActor, toCreate);
    dbg("place:depositItemToTarget", "GM inventory-source path: creating on target, deleting source",
      { sourceActorName: item.actor.name, targetName: targetActor.name, toCreateCount: toCreate.length });
    await CONFIG.Item.documentClass.createDocuments(toCreate, { parent: targetActor, keepId: true });
    await item.delete({ deleteContents: true });
    notifyItemAction("Deposited", item.name);
    return;
  }

  // Player source is always a linked character, so game.actors.get resolves correctly.
  await dispatchGM(
    "depositItem",
    { sourceActorId: item.actor.id, itemId: item.id, sceneId, tokenId },
    async () => depositItem(item.actor.id, item.id, sceneId, tokenId)
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
    itemData.system = itemData.system ?? {};
    itemData.system.container = targetActor.system.containerItem.id;
  }

  if (isModuleGM()) {
    dbg("place:depositActorToTarget", "GM path: createDocuments on target");
    await CONFIG.Item.documentClass.createDocuments([itemData], { parent: targetActor, keepId: false });
    notifyItemAction("Deposited", droppedActor.name);
  } else {
    // Players can't see sidebar actors; no socket action exists for this path.
    dbg("place:depositActorToTarget", "player path blocked (no socket action for actor→target)");
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TransferError"));
  }
}

async function depositCanvasTokenToTarget(tokenDoc, targetToken) {
  const sourceActor = tokenDoc.actor;
  const targetActor  = targetToken.actor;
  dbg("place:depositCanvasTokenToTarget", {
    sourceName: sourceActor?.name, sourceId: sourceActor?.id,
    targetName: targetActor.name, targetId: targetActor.id,
    targetIsContainer: targetActor.system?.isContainer === true
  });

  if (!sourceActor) {
    dbg("place:depositCanvasTokenToTarget", "no actor on source token, bail");
    return;
  }

  const itemData = buildInteractiveItemData(sourceActor);
  if (!itemData) {
    dbg("place:depositCanvasTokenToTarget", "buildInteractiveItemData returned null, bail");
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotInitialized"));
    return;
  }

  if (targetActor.system?.isContainer && targetActor.system.containerItem) {
    itemData.system = itemData.system ?? {};
    itemData.system.container = targetActor.system.containerItem.id;
  }

  dbg("place:depositCanvasTokenToTarget", "creating item on target, deleting source token");
  await CONFIG.Item.documentClass.createDocuments([itemData], { parent: targetActor, keepId: false });
  await tokenDoc.delete();
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
  // Deposit into the chosen target and delete the source token.
  dbg("place:tokenMove", "user chose deposit target", { targetName: result.actor.name });
  await depositCanvasTokenToTarget(tokenDoc, result);
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

async function createInteractiveToken(item, x, y, { ephemeral = false } = {}) {
  const snapped = canvas.grid.getTopLeftPoint({ x, y });
  x = snapped.x;
  y = snapped.y;

  const isContainer = item.type === "container";
  const img = item.img || "icons/svg/item-bag.svg";

  if (isContainer) ephemeral = false; // containers always use templates

  dbg("place:createInteractiveToken", { itemName: item.name, itemUuid: item.uuid, itemImg: item.img, x, y, ephemeral, isContainer });

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
      const initialItems = [];
      if (isContainer) {
        const containerData = item.toObject();
        delete containerData._id;
        delete containerData.system?.container;
        initialItems.push(containerData);
      } else {
        const itemData = item.toObject();
        delete itemData._id;
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
        const newContainerItem = actor.items.find(i => i.type === "container");
        if (newContainerItem && item.system.contents?.size > 0) {
          const toCreate = await CONFIG.Item.documentClass.createWithContents(
            Array.from(item.system.contents)
          );
          toCreate.forEach(i => {
            i.system = i.system ?? {};
            i.system.container = newContainerItem.id;
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
    dbg("place:createInteractiveToken", "creating embedded item on ephemeral actor", { itemName: itemData.name, itemImg: itemData.img });
    await actor.createEmbeddedDocuments("Item", [itemData]);
  }

  const savedState = item.flags?.["pick-up-stix"]?.tokenState;
  const tokenFlags = { "pick-up-stix": {} };
  if (savedState) tokenFlags["pick-up-stix"].savedState = savedState;
  if (ephemeral) tokenFlags["pick-up-stix"].ephemeral = true;

  dbg("place:createInteractiveToken", "placing token", { actorId: actor.id, actorImg: actor.img, x, y, hasSavedState: !!savedState });
  const tokenData = foundry.utils.mergeObject(
    actor.prototypeToken.toObject(),
    {
      x, y, actorId: actor.id,
      flags: tokenFlags
    }
  );
  await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
  dbg("place:createInteractiveToken", "token placed", { actorId: actor.id, ephemeral });

  notifyItemAction("Placed", item.name);
}

async function createTokenFromActor(actor, x, y) {
  dbg("place:createTokenFromActor", { actorName: actor.name, actorId: actor.id, x, y });
  const snapped = canvas.grid.getTopLeftPoint({ x, y });
  const tokenDocument = await actor.getTokenDocument({ x: snapped.x, y: snapped.y });
  return canvas.scene.createEmbeddedDocuments("Token", [tokenDocument.toObject()]);
}

function onGetSceneControlButtons(controls) {
  if (!game.user.isGM) return;

  controls.tokens.tools.interactiveItemsTools = {
    name: "interactiveItemsTools",
    title: "INTERACTIVE_ITEMS.Controls.ToolsTool",
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

            const fakeItem = {
              name,
              type: objectType === "container" ? "container" : "loot",
              img: objectType === "container" ? "icons/svg/chest.svg" : "icons/svg/item-bag.svg",
              toObject: () => ({
                name,
                type: objectType === "container" ? "container" : "loot",
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
