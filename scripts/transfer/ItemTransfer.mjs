import { getTokenActor, isInteractiveActor } from "../utils/actorHelpers.mjs";
import { dispatchGM } from "../utils/gmDispatch.mjs";
import { notifyItemAction, notifyTransferError } from "../utils/notify.mjs";
import { validateContainerAccess, validateItemAccess } from "../utils/containerAccess.mjs";
import { dbg } from "../utils/debugLog.mjs";
import { isModuleGM } from "../utils/playerView.mjs";

const MODULE_ID = "pick-up-stix";

function stripEquipmentState(itemData) {
  if (!itemData.system) return;
  delete itemData.system.equipped;
  delete itemData.system.attuned;
  delete itemData.system.prepared;
}

function stampInteractiveIdentity(itemData, actor, { embeddedItemData } = {}) {
  const descriptionValue = itemData.system?.description?.value ?? "";

  const identifiedData = {
    name: actor.name,
    img: actor.img,
    description: actor.system.description || descriptionValue
  };

  const unidentifiedData = {
    name: embeddedItemData?.unidentified?.name || actor.system.unidentifiedName || actor.name,
    img: actor.system.unidentifiedImage || actor.img,
    description: embeddedItemData?.unidentified?.description || actor.system.unidentifiedDescription || identifiedData.description
  };

  const isIdentified = embeddedItemData
    ? (embeddedItemData.identified !== false)
    : actor.system.isIdentified;

  const display = isIdentified ? identifiedData : unidentifiedData;
  itemData.name = display.name;
  itemData.img = display.img;
  itemData.system = itemData.system ?? {};
  itemData.system.description = itemData.system.description ?? {};
  itemData.system.description.value = display.description;

  const tokenSystem = actor.toObject().system;
  itemData.flags = itemData.flags ?? {};
  itemData.flags["pick-up-stix"] = {
    sourceActorId: actor.id,
    identifiedData,
    unidentifiedData,
    tokenState: {
      name: actor.name,
      img: actor.img,
      system: tokenSystem
    }
  };

  return itemData;
}

const _playerPositionOverrides = new Map();

export function setPlayerPositionOverride(tokenId, position) {
  if (!tokenId) return;
  if (position) _playerPositionOverrides.set(tokenId, position);
  else _playerPositionOverrides.delete(tokenId);
}

function getPlayerPositionOverride(tokenId) {
  return _playerPositionOverrides.get(tokenId) ?? null;
}


export async function pickupItem(sceneId, tokenId, itemId, targetActorId) {
  dbg("xfer:pickupItem", { sceneId, tokenId, itemId, targetActorId });
  const result = getTokenActor(sceneId, tokenId);
  const targetActor = game.actors.get(targetActorId);

  if (!result || !targetActor) {
    dbg("xfer:pickupItem", "could not resolve token actor or target actor", { hasResult: !!result, hasTargetActor: !!targetActor });
    notifyTransferError();
    return false;
  }

  const { actor: sourceActor, tokenDoc } = result;
  dbg("xfer:pickupItem", "resolved actors", {
    sourceActorName: sourceActor.name, sourceActorId: sourceActor.id, sourceActorImg: sourceActor.img,
    isContainer: sourceActor.system.isContainer, targetActorName: targetActor.name, targetActorId: targetActor.id
  });

  // validateContainerAccess is a no-op for non-container actors (open check
  // only fires when sys.isContainer is true).
  if (!validateContainerAccess(sourceActor)) {
    dbg("xfer:pickupItem", "validateContainerAccess failed");
    return false;
  }

  const item = itemId ? sourceActor.items.get(itemId) : null;
  if (!item) {
    dbg("xfer:pickupItem", "item not found on sourceActor", { itemId });
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoItems"));
    return false;
  }

  dbg("xfer:pickupItem", "item found", { itemName: item.name, itemId: item.id, itemImg: item.img });

  if (!validateItemAccess(item)) {
    dbg("xfer:pickupItem", "validateItemAccess failed (item locked)");
    return false;
  }

  const itemName = item.name;

  const baseActorId = tokenDoc.actorId;
  const isEphemeralToken = !!tokenDoc.flags?.["pick-up-stix"]?.ephemeral;
  dbg("xfer:pickupItem", "preparing item transfer", { baseActorId, isEphemeralToken, isContainer: sourceActor.system.isContainer });

  const toCreate = await CONFIG.Item.documentClass.createWithContents([item], {
    transformAll: (itemData) => {
      if (itemData instanceof foundry.abstract.Document) itemData = itemData.toObject();
      stripEquipmentState(itemData);

      // Ephemeral tokens have no persistent template — their items return as plain items.
      // Container items keep their own identity regardless of source.
      const isEphemeral = tokenDoc.flags?.["pick-up-stix"]?.ephemeral;
      if (!sourceActor.system.isContainer && !isEphemeral) {
        dbg("xfer:pickupItem", "stamping interactive identity onto item", { itemDataName: itemData.name, itemDataImg: itemData.img });
        stampInteractiveIdentity(itemData, sourceActor, { embeddedItemData: itemData.system });
        // Use base actor id, not synthetic token actor id, so round-trips resolve correctly.
        itemData.flags["pick-up-stix"].sourceActorId = baseActorId;
        dbg("xfer:pickupItem", "post-stamp item data", { name: itemData.name, img: itemData.img, sourceActorId: itemData.flags?.["pick-up-stix"]?.sourceActorId });
      } else {
        dbg("xfer:pickupItem", "skipping identity stamp (container item or ephemeral)", { isContainer: sourceActor.system.isContainer, isEphemeral });
      }
      return itemData;
    }
  });

  dbg("xfer:pickupItem", "creating items on targetActor", { toCreateCount: toCreate.length, targetActorName: targetActor.name });
  await CONFIG.Item.documentClass.createDocuments(toCreate, {
    parent: targetActor,
    keepId: true
  });

  await item.delete({ deleteContents: true });

  if (!sourceActor.system.isContainer && sourceActor.items.size === 0) {
    dbg("xfer:pickupItem", "source actor now empty, deleting token", { tokenId });
    const scene = game.scenes.get(sceneId);
    await scene.deleteEmbeddedDocuments("Token", [tokenId]);
  }

  dbg("xfer:pickupItem", "pickup complete");
  notifyItemAction("PickedUp", itemName);
  return true;
}

export async function depositItem(sourceActorId, itemId, sceneId, tokenId) {
  dbg("xfer:depositItem", { sourceActorId, itemId, sceneId, tokenId });
  const sourceActor = game.actors.get(sourceActorId);
  const result = getTokenActor(sceneId, tokenId);

  if (!sourceActor || !result) {
    dbg("xfer:depositItem", "could not resolve source actor or target token", { hasSourceActor: !!sourceActor, hasResult: !!result });
    notifyTransferError();
    return false;
  }

  const { actor: targetActor } = result;
  const item = sourceActor.items.get(itemId);

  if (!item) {
    dbg("xfer:depositItem", "item not found on sourceActor", { itemId });
    notifyTransferError();
    return false;
  }

  dbg("xfer:depositItem", "resolved item and actors", {
    itemName: item.name, itemId: item.id,
    sourceActorName: sourceActor.name, targetActorName: targetActor.name,
    targetIsContainer: targetActor.system?.isContainer, targetIsLocked: targetActor.system?.isLocked, targetIsOpen: targetActor.system?.isOpen
  });

  // isContainer guard inside validateContainerAccess ensures open is only
  // checked for container-mode actors.
  if (!validateContainerAccess(targetActor, { checkOpen: true })) {
    dbg("xfer:depositItem", "validateContainerAccess failed");
    return false;
  }

  const toCreate = await CONFIG.Item.documentClass.createWithContents([item]);

  assignContainerParent(targetActor, toCreate);

  dbg("xfer:depositItem", "creating deposited items on targetActor", { toCreateCount: toCreate.length });
  await CONFIG.Item.documentClass.createDocuments(toCreate, {
    parent: targetActor,
    keepId: true
  });

  await item.delete({ deleteContents: true });

  dbg("xfer:depositItem", "deposit complete");
  notifyItemAction("Deposited", item.name);
  return true;
}

export function checkProximity(interactiveActor, { silent = false, range = "interaction", playerToken = null } = {}) {
  if (isModuleGM()) return true;

  const rangeField = range === "inspection" ? "inspectionRange" : "interactionRange";
  const maxRange = interactiveActor.system[rangeField] ?? (range === "inspection" ? 4 : 1);
  if (maxRange === 0) {
    dbg("xfer:checkProximity", "range is 0 (unlimited), pass", { actorName: interactiveActor.name, range });
    return true;
  }

  if (!playerToken) {
    const candidates = getPlayerCandidateTokens();
    if (!candidates.length) {
      dbg("xfer:checkProximity", "no candidate tokens, pass by default", { actorName: interactiveActor.name });
      return true; // No player position at all — don't block UI.
    }
    dbg("xfer:checkProximity", "checking candidates", { actorName: interactiveActor.name, range, maxRange, candidateCount: candidates.length });
    for (const t of candidates) {
      if (checkProximity(interactiveActor, { silent: true, range, playerToken: t })) return true;
    }
    dbg("xfer:checkProximity", "all candidates out of range", { actorName: interactiveActor.name, range, maxRange });
    if (!silent) ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TooFar"));
    return false;
  }

  // Specific-token path: prefer the recorded override for this token (set by
  // the updateToken / controlToken hooks) over the live document coords, which
  // Foundry's animation system overwrites mid-flight.
  const override = getPlayerPositionOverride(playerToken.document.id);
  const source = override ?? {
    x: playerToken.document.x,
    y: playerToken.document.y,
    width: playerToken.document.width,
    height: playerToken.document.height
  };
  const playerCenter = {
    x: source.x + (source.width * canvas.grid.size) / 2,
    y: source.y + (source.height * canvas.grid.size) / 2
  };

  // For synthetic actors (unlinked tokens), use the specific token
  let objectToken;
  const tokenDoc = interactiveActor.token;
  if (tokenDoc) {
    objectToken = canvas.tokens.get(tokenDoc.id);
  } else {
    objectToken = canvas.tokens.placeables.find(t => t.actor?.id === interactiveActor.id);
  }
  if (!objectToken) {
    dbg("xfer:checkProximity", "no objectToken found for interactive actor, pass", { actorName: interactiveActor.name });
    return true;
  }

  const objectCenter = {
    x: objectToken.document.x + (objectToken.document.width * canvas.grid.size) / 2,
    y: objectToken.document.y + (objectToken.document.height * canvas.grid.size) / 2
  };
  const distance = canvas.grid.measurePath([playerCenter, objectCenter]).distance;
  const gridDistance = distance / canvas.dimensions.distance;

  dbg("xfer:checkProximity", "distance measured", {
    actorName: interactiveActor.name, range, maxRange, gridDistance,
    playerTokenId: playerToken.document.id, usedOverride: !!override,
    playerCenter, objectCenter, pass: gridDistance <= maxRange
  });

  if (gridDistance > maxRange) {
    if (!silent) ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TooFar"));
    return false;
  }
  return true;
}

export async function updateContainerTokenImage(tokenDoc, isOpen) {
  const actor = tokenDoc.actor;
  dbg("xfer:updateContainerTokenImage", {
    tokenId: tokenDoc.id, isOpen, actorName: actor?.name,
    isContainer: actor?.system?.isContainer, openImage: actor?.system?.openImage,
    currentSrc: tokenDoc.texture?.src, actorImg: actor?.img
  });
  if (!actor?.system?.isContainer) {
    dbg("xfer:updateContainerTokenImage", "not a container actor, bail");
    return;
  }
  const openImage = actor.system.openImage;
  if (!openImage) {
    dbg("xfer:updateContainerTokenImage", "no openImage configured, bail");
    return;
  }
  const newSrc = isOpen ? openImage : actor.img;
  dbg("xfer:updateContainerTokenImage", "computed newSrc", { newSrc, currentSrc: tokenDoc.texture.src, needsUpdate: tokenDoc.texture.src !== newSrc });
  if (tokenDoc.texture.src !== newSrc) {
    dbg("xfer:updateContainerTokenImage", "updating token texture.src", { from: tokenDoc.texture.src, to: newSrc });
    await tokenDoc.update({"texture.src": newSrc}, {animation: {duration: 500}});
  } else {
    dbg("xfer:updateContainerTokenImage", "token texture.src already matches, no update needed");
  }
}

export async function setContainerOpen(actor, newIsOpen, { silent = false } = {}) {
  dbg("xfer:setContainerOpen", { actorName: actor.name, actorId: actor.id, currentIsOpen: actor.system.isOpen, newIsOpen, isLocked: actor.system.isLocked, isSynthetic: !!actor.token, isGM: game.user.isGM });
  if (newIsOpen && actor.system.isLocked) {
    dbg("xfer:setContainerOpen", "actor is locked, cannot open");
    if (!silent) ui.notifications.warn(actor.system.lockedDisplayMessage);
    return false;
  }
  const tokenDoc = actor.token;
  if (!game.user.isGM && !tokenDoc) {
    dbg("xfer:setContainerOpen", "not GM and no tokenDoc, bail");
    return false;
  }
  dbg("xfer:setContainerOpen", "dispatching toggleOpen", { tokenId: tokenDoc?.id, newIsOpen });
  await dispatchGM(
    "toggleOpen",
    { sceneId: tokenDoc?.parent.id, tokenId: tokenDoc?.id, isOpen: newIsOpen },
    async () => {
      await actor.update({ "system.isOpen": newIsOpen });
      if (tokenDoc) await updateContainerTokenImage(tokenDoc, newIsOpen);
    }
  );
  return true;
}

export async function toggleContainerLocked(actor) {
  const sys = actor.system;
  const wasOpen = !sys.isLocked && sys.isOpen;
  dbg("xfer:toggleContainerLocked", { actorName: actor.name, actorId: actor.id, currentIsLocked: sys.isLocked, currentIsOpen: sys.isOpen, wasOpen, newIsLocked: !sys.isLocked });
  const updates = { "system.isLocked": !sys.isLocked };
  if (wasOpen) updates["system.isOpen"] = false;
  dbg("xfer:toggleContainerLocked", "firing actor.update", { updates });
  await actor.update(updates);
  if (wasOpen && actor.token) {
    dbg("xfer:toggleContainerLocked", "container was open, updating token image to closed");
    await updateContainerTokenImage(actor.token, false);
  }
}

export async function updateItemTokenImage(tokenDoc, isIdentified) {
  const actor = tokenDoc.actor;
  dbg("xfer:updateItemTokenImage", {
    tokenId: tokenDoc.id, isIdentified, actorName: actor?.name,
    isContainer: actor?.system?.isContainer, unidentifiedImage: actor?.system?.unidentifiedImage,
    currentSrc: tokenDoc.texture?.src, actorImg: actor?.img
  });
  if (!actor?.system || actor.system.isContainer) {
    dbg("xfer:updateItemTokenImage", "no system or is container, bail");
    return;
  }
  const unidentifiedImage = actor.system.unidentifiedImage;
  if (!unidentifiedImage) {
    dbg("xfer:updateItemTokenImage", "no unidentifiedImage, bail");
    return;
  }
  const newSrc = isIdentified ? actor.img : unidentifiedImage;
  dbg("xfer:updateItemTokenImage", "computed newSrc", { newSrc, currentSrc: tokenDoc.texture.src, needsUpdate: tokenDoc.texture.src !== newSrc });
  if (tokenDoc.texture.src !== newSrc) {
    dbg("xfer:updateItemTokenImage", "updating token texture.src", { from: tokenDoc.texture.src, to: newSrc });
    await tokenDoc.update({"texture.src": newSrc});
  } else {
    dbg("xfer:updateItemTokenImage", "token texture.src already matches, no update needed");
  }
}

export async function toggleItemIdentification(item) {
  dbg("xfer:toggleItemIdentification", { itemName: item.name, itemId: item.id, itemImg: item.img });
  const flags = item.flags?.["pick-up-stix"];
  if (!flags?.sourceActorId) {
    dbg("xfer:toggleItemIdentification", "item has no sourceActorId flag, bail");
    return null;
  }

  const currentState = flags.tokenState?.system?.isIdentified ?? true;
  const newState = !currentState;
  const data = newState ? flags.identifiedData : flags.unidentifiedData;
  dbg("xfer:toggleItemIdentification", { currentState, newState, hasData: !!data, identifiedData: flags.identifiedData, unidentifiedData: flags.unidentifiedData });
  if (!data) {
    dbg("xfer:toggleItemIdentification", "no identification data found, bail");
    return null;
  }

  dbg("xfer:toggleItemIdentification", "applying identification toggle", { name: data.name, img: data.img });
  await item.update({
    name: data.name,
    img: data.img,
    "system.description.value": data.description,
    "flags.pick-up-stix.tokenState.system.isIdentified": newState
  });
  dbg("xfer:toggleItemIdentification", "toggle complete", { newState });
  return newState;
}

export function assignContainerParent(containerActor, itemDataArray) {
  if (!containerActor.system?.isContainer) return;
  const containerItem = containerActor.system.containerItem;
  if (!containerItem) return;
  const items = Array.isArray(itemDataArray) ? itemDataArray : [itemDataArray];
  for (const itemData of items) {
    itemData.system = itemData.system ?? {};
    itemData.system.container = containerItem.id;
  }
}

export function buildInteractiveItemData(droppedActor) {
  const sourceItem = droppedActor.system.topLevelItems[0];
  if (!sourceItem) return null;

  const itemData = sourceItem.toObject();
  delete itemData._id;
  stripEquipmentState(itemData);
  stampInteractiveIdentity(itemData, droppedActor);

  return itemData;
}

export function getPlayerCharacter() {
  dbg("xfer:getPlayerCharacter", {
    userName: game.user.name,
    characterName: game.user.character?.name ?? "null",
    characterId: game.user.character?.id ?? game.user._source?.character ?? "none",
    controlledTokenCount: canvas.tokens?.controlled?.length ?? 0
  });

  if (game.user.character) return game.user.character;

  const controlled = canvas.tokens?.controlled?.[0];
  if (controlled?.actor && !isInteractiveActor(controlled.actor)) {
    return controlled.actor;
  }

  return null;
}

export function getPlayerCandidateTokens() {
  const controlled = (canvas.tokens?.controlled ?? [])
    .filter(t => t.actor && !isInteractiveActor(t.actor));
  if (controlled.length) return controlled;

  const character = game.user.character;
  if (!character) return [];
  const token = canvas.tokens.placeables.find(t => t.actor?.id === character.id);
  return token ? [token] : [];
}

export async function promptPlayerPickupTarget(interactiveActor) {
  const candidates = getPlayerCandidateTokens();
  if (!candidates.length) {
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoCharacter"));
    return null;
  }

  const inRange = candidates.filter(t =>
    checkProximity(interactiveActor, { silent: true, playerToken: t })
  );

  if (!inRange.length) {
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TooFar"));
    return null;
  }

  if (inRange.length === 1) return inRange[0].actor;

  return promptGMPickupTarget(inRange.map(t => t.actor));
}

export async function promptGMPickupTarget(candidates = null) {
  let actors;
  if (candidates) {
    actors = [...candidates];
  } else {
    const tokens = canvas.scene?.tokens.contents ?? [];
    const seen = new Set();
    actors = [];
    for (const t of tokens) {
      const a = t.actor;
      if (!a || isInteractiveActor(a) || seen.has(a.id)) continue;
      seen.add(a.id);
      actors.push(a);
    }
    if (!actors.length) {
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoSceneActors"));
      return null;
    }
  }

  actors.sort((a, b) => {
    const order = { character: 0, npc: 1 };
    const ao = order[a.type] ?? 2;
    const bo = order[b.type] ?? 2;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });

  const rows = actors.map((a, i) => `
    <div class="ii-actor-list-row${i === 0 ? " selected" : ""}" data-actor-id="${a.id}">
      <img src="${a.img}" alt="" />
      <span>${a.name}</span>
    </div>
  `).join("");

  const content = `
    <div class="form-group">
      <div class="form-fields">
        <input type="search" name="pickup-target-search"
               placeholder="${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.PickupTargetSearch")}"
               autocomplete="off" />
      </div>
    </div>
    <div class="ii-actor-list">${rows}</div>
    <input type="hidden" name="targetActorId" value="${actors[0].id}" />
  `;

  const actorId = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("INTERACTIVE_ITEMS.Dialog.PickupTargetTitle"),
      classes: ["ii-pickup-target-dialog"]
    },
    content,
    render: (event, dialog) => {
      const search = dialog.element.querySelector("[name='pickup-target-search']");
      const list = dialog.element.querySelector(".ii-actor-list");
      const hidden = dialog.element.querySelector("[name='targetActorId']");
      const confirmBtn = dialog.element.querySelector('[data-action="ok"]');
      if (!search || !list || !hidden) return;

      list.addEventListener("click", e => {
        const row = e.target.closest(".ii-actor-list-row");
        if (!row) return;
        list.querySelector(".ii-actor-list-row.selected")?.classList.remove("selected");
        row.classList.add("selected");
        hidden.value = row.dataset.actorId;
        if (confirmBtn) confirmBtn.disabled = false;
      });

      let debounceTimer;
      search.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (!list.isConnected) return;
          const term = search.value.toLowerCase();
          let firstVisible = null;
          for (const row of list.querySelectorAll(".ii-actor-list-row")) {
            const match = !term || row.querySelector("span").textContent.toLowerCase().includes(term);
            row.hidden = !match;
            if (match && !firstVisible) firstVisible = row;
          }
          const selected = list.querySelector(".ii-actor-list-row.selected");
          if (selected?.hidden) {
            selected.classList.remove("selected");
            if (firstVisible) {
              firstVisible.classList.add("selected");
              hidden.value = firstVisible.dataset.actorId;
            } else {
              hidden.value = "";
            }
          }
          if (confirmBtn) confirmBtn.disabled = !list.querySelector(".ii-actor-list-row.selected:not([hidden])");
        }, 150);
      });
    },
    buttons: [
      {
        action: "ok",
        label: game.i18n.localize("Confirm"),
        icon: "fa-solid fa-check",
        callback: (event, button) => button.form.elements.targetActorId.value
      },
      {
        action: "cancel",
        label: game.i18n.localize("Cancel"),
        icon: "fa-solid fa-times"
      }
    ],
    rejectClose: false
  });

  return actorId ? (game.actors.get(actorId) ?? null) : null;
}
