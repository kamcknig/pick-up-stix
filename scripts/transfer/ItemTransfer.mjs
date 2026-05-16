import { getTokenActor, isInteractiveActor } from "../utils/actorHelpers.mjs";
import { getAdapter } from "../adapter/index.mjs";
import { dispatchGM } from "../utils/gmDispatch.mjs";
import { notifyItemAction, notifyTransferError } from "../utils/notify.mjs";
import { validateContainerAccess, validateItemAccess } from "../utils/containerAccess.mjs";
import { dbg } from "../utils/debugLog.mjs";
import { isModuleGM } from "../utils/playerView.mjs";
import { hasLevels, getTokenLevelId } from "../utils/levels.mjs";
import { decrementOrDeleteItem } from "../utils/quantityPrompt.mjs";

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

  // Wrap the raw system-data slice as a duck-typed item so the adapter's
  // getItemUnidentified* methods can read the correct system-specific fields.
  const adapter = getAdapter();
  const embeddedItemLike = embeddedItemData ? { system: embeddedItemData } : null;
  const unidentifiedData = {
    name: (embeddedItemLike && adapter.getItemUnidentifiedName(embeddedItemLike))
      || actor.system.unidentifiedName || actor.name,
    img: actor.system.unidentifiedImage || actor.img,
    description: (embeddedItemLike && adapter.getItemUnidentifiedDescription(embeddedItemLike))
      || actor.system.unidentifiedDescription || identifiedData.description
  };

  // Read identification state through the adapter so the field path is not
  // hard-coded to dnd5e's `system.identified` boolean.
  const isIdentified = embeddedItemLike
    ? adapter.isItemIdentified(embeddedItemLike)
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


/**
 * @param {string} sceneId
 * @param {string} tokenId
 * @param {string} itemId
 * @param {string} targetActorId
 * @param {number|null} [quantity=null] - Optional partial-stack quantity. When
 *   null/undefined the full stack is moved (existing behavior). Clamped to
 *   `[1, source quantity]` server-side.
 * @param {string|null} [contentId=null] - (Generic mode only) When set, pick
 *   up the specific row from the source container's `contents[]` flag array
 *   rather than the whole token. Ignored by model-backed adapters which use
 *   embedded Item documents instead.
 */
export async function pickupItem(sceneId, tokenId, itemId, targetActorId, quantity = null, contentId = null) {
  dbg("xfer:pickupItem", { sceneId, tokenId, itemId, targetActorId, quantity, contentId });
  const result = getTokenActor(sceneId, tokenId);
  const targetActor = game.actors.get(targetActorId);

  if (!result || !targetActor) {
    dbg("xfer:pickupItem", "could not resolve token actor or target actor", { hasResult: !!result, hasTargetActor: !!targetActor });
    notifyTransferError();
    return false;
  }

  const { actor: sourceActor, tokenDoc } = result;
  const adapter = getAdapter();

  // Generic path: actor state lives entirely in flags rather than actor.system
  // and actor.items. Build a stub item from the flag blob and create it on the
  // target — no embedded-item documents to read or delete.
  if (adapter.constructor.SYSTEM_ID === "generic") {
    return _pickupItemGeneric(sourceActor, tokenDoc, targetActor, quantity, { sceneId, tokenId, contentId });
  }

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

  const sourceQty = adapter.getItemQuantity(item);
  // Clamp the requested quantity into [1, sourceQty]. null/undefined means
  // "move the full stack" (legacy behavior).
  const moveQty = quantity == null
    ? sourceQty
    : Math.max(1, Math.min(Math.floor(quantity), sourceQty));
  const isPartial = moveQty < sourceQty;

  dbg("xfer:pickupItem", "preparing item transfer", {
    baseActorId, isEphemeralToken, isContainer: sourceActor.system.isContainer,
    sourceQty, moveQty, isPartial
  });

  const toCreate = await adapter.flattenItemsForCreate([item], {
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

  // Override quantity on the first entry — flattenItemsForCreate yields the
  // source item first; nested container contents (rare on pickup) keep their
  // own quantities.
  if (isPartial && toCreate.length) {
    adapter.setItemDataQuantity(toCreate[0], moveQty);
  }

  dbg("xfer:pickupItem", "creating items on targetActor", { toCreateCount: toCreate.length, targetActorName: targetActor.name, moveQty });
  await CONFIG.Item.documentClass.createDocuments(toCreate, {
    parent: targetActor,
    keepId: true
  });

  if (isPartial) {
    // Partial pickup — decrement, do not delete. The source token stays
    // because the actor's items.size doesn't drop below 1.
    dbg("xfer:pickupItem", "partial pickup, decrementing source item", { moveQty, sourceQty });
    await decrementOrDeleteItem(item, moveQty);
  } else {
    await item.delete({ deleteContents: true });
  }

  if (!sourceActor.system.isContainer && sourceActor.items.size === 0) {
    dbg("xfer:pickupItem", "source actor now empty, deleting token", { tokenId });
    const scene = game.scenes.get(sceneId);
    await scene.deleteEmbeddedDocuments("Token", [tokenId]);
  }

  dbg("xfer:pickupItem", "pickup complete");
  notifyItemAction("PickedUp", itemName);
  return true;
}

/**
 * Build the stub-item data object for a generic pickup. Detects the active
 * system's expected shape for `system.description` by inspecting the data
 * model schema for the configured pickup item type:
 *   - Object-shape (SchemaField): write `{ value: description }`.
 *     This is the dnd5e/pf2e shape (`{value, chat, unidentified, ...}`).
 *   - String/HTML-shape: write the description directly.
 *     This is the Eventide / many other systems' shape.
 *   - No description field declared: skip it entirely.
 *
 * Without this detection, writing the wrong shape into `system.description`
 * causes the system's item sheet to render "[object Object]" (object shape
 * written to a string field) or to drop the description silently (string
 * written to an object field).
 *
 * @param {object} args
 * @param {string} args.name
 * @param {string} args.img
 * @param {string} args.description
 * @param {number} args.quantity
 * @param {string} args.lootType
 * @returns {object}
 */
export function buildGenericStubItem({ name, img, description, quantity, lootType }) {
  const Model = CONFIG.Item.dataModels?.[lootType];
  const descField = Model?.schema?.fields?.description;

  const stubData = {
    name,
    img,
    type: lootType,
    system: { quantity }
  };

  if (descField instanceof foundry.data.fields.SchemaField) {
    // Object shape: { value, chat, ... }. Write to .value.
    stubData.system.description = { value: description ?? "" };
  } else if (descField) {
    // String / HTML field: write the description directly.
    stubData.system.description = description ?? "";
  }
  // else: no description field declared on this item type — skip it.

  return stubData;
}

/**
 * Generic-mode pickup: reads the interactive flag blob from the source actor,
 * builds a stub item of the configured `genericPickupItemType`, creates it on
 * the target actor's inventory, then removes the source token from the scene.
 *
 * Generic actors have no embedded `actor.items` — all state lives in
 * `flags["pick-up-stix"].interactive`. The `description.value` shape is used
 * for the stub because most systems with HTML description fields follow it;
 * on systems that use a different path the description simply lands unset,
 * which is graceful degradation.
 *
 * @param {Actor} sourceActor
 * @param {TokenDocument} tokenDoc
 * @param {Actor} targetActor
 * @param {number|null} quantity
 * @param {object} ids
 * @param {string} ids.sceneId
 * @param {string} ids.tokenId
 * @returns {Promise<boolean>}
 */
async function _pickupItemGeneric(sourceActor, tokenDoc, targetActor, quantity, { sceneId, tokenId, contentId = null }) {
  const adapter = getAdapter();
  const interactiveData = adapter.getInteractiveData(sourceActor);

  dbg("xfer:_pickupItemGeneric", {
    sourceActorName: sourceActor.name, mode: interactiveData.mode,
    hasItemData: !!interactiveData.itemData,
    targetActorName: targetActor.name, contentId
  });

  // Two pickup variants:
  //  - contentId set → pulling a single row out of a container's contents[].
  //    The source remains in place (container token persists, row removed).
  //  - contentId null → whole-token item-mode pickup. Source token is removed.
  if (contentId) {
    return _pickupContentRow(sourceActor, targetActor, contentId, quantity);
  }

  if (interactiveData.mode !== "item" || !interactiveData.itemData) {
    dbg("xfer:_pickupItemGeneric", "source actor is not an item-mode generic interactive, bail");
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoItems"));
    return false;
  }

  // Prefer top-level interactive fields — those reflect the GM's current
  // edits via the config sheet. interactiveData.itemData is the snapshot at
  // drop time and goes stale after any rename / image change. Quantity is
  // only stored in itemData.
  const snapshot = interactiveData.itemData ?? {};
  const name = interactiveData.name || snapshot.name || sourceActor.name;
  const img = interactiveData.img || snapshot.img || sourceActor.img;
  const description = interactiveData.description || snapshot.description || "";
  const flagQty = snapshot.quantity ?? 1;
  const lootType = adapter.defaultLootItemType;

  if (!lootType) {
    dbg("xfer:_pickupItemGeneric", "no loot item type configured, bail");
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TransferError"));
    return false;
  }

  // Clamp the requested quantity into [1, flagQty].
  const moveQty = quantity == null
    ? flagQty
    : Math.max(1, Math.min(Math.floor(quantity), flagQty));

  const stubData = buildGenericStubItem({ name, img, description, quantity: moveQty, lootType });

  dbg("xfer:_pickupItemGeneric", "creating stub item on target", {
    stubName: stubData.name, lootType, moveQty, targetActorName: targetActor.name
  });

  await CONFIG.Item.documentClass.create(stubData, { parent: targetActor });

  const isPartial = moveQty < flagQty;
  if (isPartial) {
    // Partial pickup: decrement the source actor's stored quantity and leave
    // the token in place. The synthetic actor delta isn't relevant here —
    // generic data lives in flags which inherit from base; writing through
    // setInteractiveData on the (synthetic) actor updates the right blob.
    dbg("xfer:_pickupItemGeneric", "partial pickup — decrementing source qty", { flagQty, moveQty, remaining: flagQty - moveQty });
    await adapter.setInteractiveData(sourceActor, {
      itemData: { ...(interactiveData.itemData ?? {}), quantity: flagQty - moveQty }
    });
  } else {
    // Full pickup: remove the source token from the scene. The actor itself
    // may persist as a template — mirrors the model-backed pickup behavior.
    dbg("xfer:_pickupItemGeneric", "full pickup — deleting source token", { tokenId });
    const scene = game.scenes.get(sceneId);
    await scene.deleteEmbeddedDocuments("Token", [tokenId]);
  }

  notifyItemAction("PickedUp", stubData.name);
  dbg("xfer:_pickupItemGeneric", "generic pickup complete");
  return true;
}

/**
 * Pull a single content row out of a generic container's `contents[]` flag
 * array and create a stub item for it on the target actor. Source container
 * token stays in place — only the row is removed.
 *
 * @param {Actor} sourceActor - The container actor (synthetic token actor).
 * @param {Actor} targetActor - The destination character actor.
 * @param {string} contentId  - id of the row to pick up.
 * @param {number|null} quantity - Partial-stack quantity (null = full).
 * @returns {Promise<boolean>}
 */
async function _pickupContentRow(sourceActor, targetActor, contentId, quantity) {
  const adapter = getAdapter();
  const interactiveData = adapter.getInteractiveData(sourceActor);
  const row = (interactiveData.contents ?? []).find(c => c.id === contentId);

  dbg("xfer:_pickupContentRow", {
    sourceActorName: sourceActor.name, contentId,
    rowFound: !!row, targetActorName: targetActor.name
  });

  if (!row) {
    dbg("xfer:_pickupContentRow", "row not found in source contents, bail");
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoItems"));
    return false;
  }

  const lootType = adapter.defaultLootItemType;
  if (!lootType) {
    dbg("xfer:_pickupContentRow", "no loot item type configured, bail");
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TransferError"));
    return false;
  }

  const flagQty = row.quantity ?? 1;
  const moveQty = quantity == null
    ? flagQty
    : Math.max(1, Math.min(Math.floor(quantity), flagQty));

  const stubData = buildGenericStubItem({
    name: row.name || "Item",
    img: row.img,
    description: row.description ?? "",
    quantity: moveQty,
    lootType
  });

  dbg("xfer:_pickupContentRow", "creating stub on target", { stubName: stubData.name, lootType, moveQty });
  await CONFIG.Item.documentClass.create(stubData, { parent: targetActor });

  // Remove the row from the container's contents[]. Partial pickups
  // decrement quantity; full pickups drop the row entirely.
  const newContents = (interactiveData.contents ?? [])
    .map(c => c.id === contentId
      ? (moveQty < flagQty ? { ...c, quantity: flagQty - moveQty } : null)
      : c)
    .filter(c => c != null);
  await adapter.setInteractiveData(sourceActor, { contents: newContents });

  notifyItemAction("PickedUp", stubData.name);
  dbg("xfer:_pickupContentRow", "row pickup complete");
  return true;
}

/**
 * @param {string} sourceActorId
 * @param {string} itemId
 * @param {string} sceneId
 * @param {string} tokenId
 * @param {number|null} [quantity=null] - Optional partial-stack quantity. When
 *   null/undefined the full stack is moved (existing behavior).
 */
export async function depositItem(sourceActorId, itemId, sceneId, tokenId, quantity = null) {
  dbg("xfer:depositItem", { sourceActorId, itemId, sceneId, tokenId, quantity });
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

  // Compute the actual move quantity. If the caller passed null/undefined,
  // we move the full stack (legacy behavior). Otherwise clamp into [1, src].
  const adapter = getAdapter();
  const sourceQty = adapter.getItemQuantity(item);
  const moveQty = quantity == null
    ? sourceQty
    : Math.max(1, Math.min(Math.floor(quantity), sourceQty));

  dbg("xfer:depositItem", "resolved item and actors", {
    itemName: item.name, itemId: item.id,
    sourceActorName: sourceActor.name, targetActorName: targetActor.name,
    targetIsContainer: adapter.isInteractiveContainer(targetActor),
    targetIsLocked: adapter.isInteractiveLocked(targetActor),
    targetIsOpen: adapter.isInteractiveOpen(targetActor),
    sourceQty, moveQty
  });

  // isContainer guard inside validateContainerAccess ensures open is only
  // checked for container-mode actors.
  if (!validateContainerAccess(targetActor, { checkOpen: true })) {
    dbg("xfer:depositItem", "validateContainerAccess failed");
    return false;
  }

  // Generic container target: append a content row to its flag blob rather
  // than creating an embedded Item document (the target has no actor.items
  // collection and the system would reject the create anyway). Source is
  // still decremented on its real actor.
  if (adapter.constructor.SYSTEM_ID === "generic" && adapter.isInteractiveContainer(targetActor)) {
    const row = {
      id: foundry.utils.randomID(),
      name: item.name,
      img: item.img,
      description: item.system?.description?.value ?? item.system?.description ?? "",
      quantity: moveQty
    };
    const current = adapter.getInteractiveData(targetActor);
    dbg("xfer:depositItem", "generic container deposit: appending content row", { rowName: row.name, qty: moveQty });
    await adapter.setInteractiveData(targetActor, {
      contents: [...(current.contents ?? []), row]
    });
    await decrementOrDeleteItem(item, moveQty);
    notifyItemAction("Deposited", item.name);
    return true;
  }

  const toCreate = await adapter.flattenItemsForCreate([item]);

  // Override quantity on the first entry (the source item). flattenItemsForCreate
  // yields the source item first; any nested container contents follow and keep
  // their own quantities.
  if (moveQty !== sourceQty && toCreate.length) {
    adapter.setItemDataQuantity(toCreate[0], moveQty);
  }

  assignContainerParent(targetActor, toCreate);

  dbg("xfer:depositItem", "creating deposited items on targetActor", { toCreateCount: toCreate.length, moveQty, sourceQty });
  await CONFIG.Item.documentClass.createDocuments(toCreate, {
    parent: targetActor,
    keepId: true
  });

  // Decrement or delete the source depending on how much was moved.
  await decrementOrDeleteItem(item, moveQty);

  dbg("xfer:depositItem", "deposit complete", { moveQty, sourceQty });
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

  // v14: a candidate on a different level than the interactive object can never
  // be in interaction or inspection range. Use override.level (animation-safe)
  // when available, else fall back to the live document's _source.level.
  if (hasLevels()) {
    const objectToken = interactiveActor.token
      ? canvas.tokens.get(interactiveActor.token.id)
      : canvas.tokens.placeables.find(t => t.actor?.id === interactiveActor.id);
    const objectLevel = objectToken ? getTokenLevelId(objectToken.document) : null;
    const playerLevel = override?.level ?? getTokenLevelId(playerToken.document);
    if (objectLevel && playerLevel && objectLevel !== playerLevel) {
      dbg("xfer:checkProximity", "level mismatch, fail",
        { actorName: interactiveActor.name, objectLevel, playerLevel });
      if (!silent) ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TooFar"));
      return false;
    }
  }

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
  const adapter = getAdapter();
  const openImage = adapter.getInteractiveOpenImage(actor);
  dbg("xfer:updateContainerTokenImage", {
    tokenId: tokenDoc.id, isOpen, actorName: actor?.name,
    isContainer: adapter.isInteractiveContainer(actor), openImage,
    currentSrc: tokenDoc.texture?.src, actorImg: actor?.img
  });
  if (!adapter.isInteractiveContainer(actor)) {
    dbg("xfer:updateContainerTokenImage", "not a container actor, bail");
    return;
  }
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
  const adapter = getAdapter();
  const currentIsOpen = adapter.isInteractiveOpen(actor);
  const currentIsLocked = adapter.isInteractiveLocked(actor);
  dbg("xfer:setContainerOpen", { actorName: actor.name, actorId: actor.id, currentIsOpen, newIsOpen, isLocked: currentIsLocked, isSynthetic: !!actor.token, isGM: game.user.isGM });
  if (newIsOpen && currentIsLocked) {
    dbg("xfer:setContainerOpen", "actor is locked, cannot open");
    if (!silent) ui.notifications.warn(adapter.getInteractiveLockedMessage(actor));
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
      // Route through the adapter: model-backed adapters write to
      // `system.isOpen`; the generic adapter writes the equivalent flag.
      await adapter.setInteractiveOpenState(actor, newIsOpen);
      if (tokenDoc) await updateContainerTokenImage(tokenDoc, newIsOpen);
    }
  );
  return true;
}

export async function toggleContainerLocked(actor) {
  const adapter = getAdapter();
  const currentIsLocked = adapter.isInteractiveLocked(actor);
  const currentIsOpen = adapter.isInteractiveOpen(actor);
  const wasOpen = !currentIsLocked && currentIsOpen;
  dbg("xfer:toggleContainerLocked", { actorName: actor.name, actorId: actor.id, currentIsLocked, currentIsOpen, wasOpen, newIsLocked: !currentIsLocked });
  // Flip the lock state, and if the container was open also close it so a
  // newly-locked container is also closed (otherwise the open state would
  // remain stuck on a locked container, which is nonsensical).
  await adapter.setInteractiveLockedState(actor, !currentIsLocked);
  if (wasOpen) {
    await adapter.setInteractiveOpenState(actor, false);
  }
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

  dbg("xfer:toggleItemIdentification", "applying identification toggle", { name: data.name, img: data.img, newState });
  await item.update({
    name: data.name,
    img: data.img,
    "system.description.value": data.description,
    "flags.pick-up-stix.tokenState.system.isIdentified": newState
  });
  // Sync the system's native identification field so the game system's own
  // identified/unidentified UI reflects the new state (e.g. dnd5e hides item
  // details from players when system.identified is false).
  await getAdapter().setItemIdentified(item, newState);
  dbg("xfer:toggleItemIdentification", "toggle complete", { newState });
  return newState;
}

/**
 * Assigns the container parent reference on each item data object so that the
 * deposited items appear as children of the destination container in the system's
 * native sheet. Delegates the field write to the adapter so the field path is not
 * hard-coded to dnd5e's `system.container`.
 */
export function assignContainerParent(containerActor, itemDataArray) {
  if (!containerActor.system?.isContainer) return;
  const containerItem = containerActor.system.containerItem;
  if (!containerItem) return;
  const items = Array.isArray(itemDataArray) ? itemDataArray : [itemDataArray];
  for (const itemData of items) {
    getAdapter().setItemContainerId(itemData, containerItem.id);
  }
}

export function buildInteractiveItemData(droppedActor) {
  const sourceItem = droppedActor.system.topLevelItems[0];
  if (!sourceItem) return null;

  const itemData = sourceItem.toObject();
  delete itemData._id;
  // Clear any stale container-parent pointer carried from a prior life.
  // depositCanvasTokenToTarget / depositActorToTarget will set the new
  // parent (if the destination is a container) immediately after this call.
  getAdapter().setItemContainerId(itemData, null);
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
