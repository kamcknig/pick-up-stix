import { checkProximity, setContainerOpen, toggleContainerLocked } from "../transfer/ItemTransfer.mjs";
import { createStateToggleButton } from "../utils/domButtons.mjs";
import { dbg } from "../utils/debugLog.mjs";
import { isModuleGM, isPlayerView } from "../utils/playerView.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const ActorSheetV2 = foundry.applications.sheets.ActorSheetV2;

export default class InteractiveItemSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static pendingPicker = new Set();

  static limitedDialogs = new Map();

  static async showLimitedDialog(actor) {
    dbg("sheet:showLimitedDialog", { actorName: actor.name, actorUuid: actor.uuid, isContainer: actor.system.isContainer });
    const key = actor.uuid;
    const existing = InteractiveItemSheet.limitedDialogs.get(key);
    if (existing) {
      dbg("sheet:showLimitedDialog", "closing existing dialog for actor", { actorUuid: key });
      await existing.close();
    }

    const system = actor.system;
    const title = system.limitedDisplayName;
    const body = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.limitedDisplayDescription,
      { async: true }
    );

    const dialog = new foundry.applications.api.DialogV2({
      window: { title },
      content: `<div class="pick-up-stix limited-view">${body}</div>`,
      buttons: [{
        action: "ok",
        label: game.i18n.localize("INTERACTIVE_ITEMS.Dialog.Close"),
        default: true
      }]
    });

    dialog.interactiveActor = actor;
    InteractiveItemSheet.limitedDialogs.set(key, dialog);
    const originalClose = dialog.close.bind(dialog);
    dialog.close = async (...args) => {
      InteractiveItemSheet.limitedDialogs.delete(key);
      return originalClose(...args);
    };

    await dialog.render({ force: true });
  }

  static async refreshLimitedDialog(actor) {
    dbg("sheet:refreshLimitedDialog", { actorName: actor.name, actorUuid: actor.uuid, hasDialog: InteractiveItemSheet.limitedDialogs.has(actor.uuid) });
    const dialog = InteractiveItemSheet.limitedDialogs.get(actor.uuid);
    if (!dialog?.element) {
      dbg("sheet:refreshLimitedDialog", "no active dialog to refresh");
      return;
    }

    const titleEl = dialog.element.querySelector(".window-title");
    if (titleEl) titleEl.textContent = actor.system.limitedDisplayName;

    const contentEl = dialog.element.querySelector(".limited-view");
    if (contentEl) {
      contentEl.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        actor.system.limitedDisplayDescription,
        { async: true }
      );
    }
  }

  static async promoteLimitedDialogsInRange() {
    dbg("sheet:promoteLimitedDialogsInRange", { openDialogCount: InteractiveItemSheet.limitedDialogs.size });
    // Snapshot — dialog.close() mutates the Map during iteration.
    const entries = Array.from(InteractiveItemSheet.limitedDialogs);
    for (const [, dialog] of entries) {
      const actor = dialog.interactiveActor;
      if (!actor) continue;
      const inRange = checkProximity(actor, { silent: true, range: "inspection" });
      dbg("sheet:promoteLimitedDialogsInRange", { actorName: actor.name, inRange });
      if (!inRange) continue;

      const rect = dialog.element?.getBoundingClientRect();
      const hasPosition = rect && rect.width > 0;

      dialog.close();

      // Render the embedded item's sheet directly — our actor sheet gates would
      // re-block it. The renderContainerSheet hook hides contents when inaccessible.
      const embedded = actor.system.embeddedItem;
      if (!embedded) continue;
      const realSheet = embedded.sheet;
      await realSheet.render({ force: true });

      if (!hasPosition) continue;
      const el = realSheet.element;
      if (!el) continue;

      const appRect = el.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - appRect.width);
      const maxTop = Math.max(0, window.innerHeight - appRect.height);
      const left = Math.max(0, Math.min(rect.left, maxLeft));
      const top = Math.max(0, Math.min(rect.top, maxTop));

      realSheet.setPosition({ left, top });
    }
  }

  #configMode = false;

  #editingDescriptionTarget = null;

  #expandedSections = {};

  static DEFAULT_OPTIONS = {
    classes: ["pick-up-stix", "interactive-item-sheet", "dnd5e2", "sheet", "item", "standard-form"],
    position: { width: 400, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      openItemSheet: InteractiveItemSheet.#onOpenItemSheet,
      openContainerSheet: InteractiveItemSheet.#onOpenContainerSheet,
      editActorImage: InteractiveItemSheet.#onEditActorImage,
      toggleOpen: InteractiveItemSheet.#onToggleOpen,
      toggleIdentified: InteractiveItemSheet.#onToggleIdentified,
      toggleLock: InteractiveItemSheet.#onToggleLock,
      editDescription: InteractiveItemSheet.#onEditDescription,
      toggleCollapsed: InteractiveItemSheet.#onToggleCollapsed
    }
  };

  static PARTS = {
    config: {
      template: "modules/pick-up-stix/templates/item-config.hbs"
    }
  };

  get title() {
    return `${game.i18n.localize("INTERACTIVE_ITEMS.Sheet.Configure")}: ${this.actor.system.displayName}`;
  }

  get containerItem() {
    return this.actor.system.containerItem;
  }

  get _tokenDoc() {
    return this.actor.token ?? null;
  }

  async render(options = {}, _options = {}) {
    dbg("sheet:render", {
      actorName: this.actor?.name,
      actorId: this.actor?.id,
      configMode: this.#configMode,
      tokenDocId: this._tokenDoc?.id,
      isGM: isModuleGM(),
      isContainer: this.actor?.system?.isContainer,
      pendingPicker: InteractiveItemSheet.pendingPicker.has(this.actor?.id)
    });
    if (InteractiveItemSheet.pendingPicker.has(this.actor.id)) {
      dbg("sheet:render", "pendingPicker active, suppressing render");
      return this;
    }

    // Blank actor with no creation marker: either the picker hasn't populated
    // flags yet (suppress the empty-sheet flash) or a creation we don't own.
    if (!this.#configMode && !this._tokenDoc && this.actor.items.size === 0) {
      const MODULE_ID = "pick-up-stix";
      const hasMarker = this.actor.getFlag(MODULE_ID, "containerDefault")
        || this.actor.getFlag(MODULE_ID, "createKindConfirmed")
        || this.actor.getFlag(MODULE_ID, "ephemeral")
        || this.actor.system.sourceItemUuid;
      if (!hasMarker) return this;
    }

    if (this.#configMode || !this._tokenDoc) {
      dbg("sheet:render", "config mode or base actor → rendering config form");
      return super.render(options, _options);
    }

    const system = this.actor.system;

    if (system.isContainer) {
      if (isPlayerView() && !checkProximity(this.actor, { silent: true, range: "inspection" })) {
        dbg("sheet:render", "container: player out of inspection range → showLimitedDialog");
        InteractiveItemSheet.showLimitedDialog(this.actor);
        return this;
      }
      const item = this.containerItem;
      if (item) {
        dbg("sheet:render", "container: delegating to ContainerSheet", { itemId: item.id, itemName: item.name });
        await item.sheet.render({ force: true });
        return this;
      }
    } else {
      if (isPlayerView() && !checkProximity(this.actor, { silent: true, range: "inspection" })) {
        dbg("sheet:render", "item: player out of inspection range → showLimitedDialog");
        InteractiveItemSheet.showLimitedDialog(this.actor);
        return this;
      }
      const item = this.actor.items.contents[0];
      if (item) {
        dbg("sheet:render", "item: delegating to ItemSheet5e", { itemId: item.id, itemName: item.name, itemImg: item.img });
        await this.#syncItemImage(item);
        await item.sheet.render({ force: true });
        return this;
      }
    }

    dbg("sheet:render", "no embedded item → falling back to config form");
    return super.render(options, _options);
  }

  async close(options = {}) {
    dbg("sheet:close", { actorName: this.actor?.name, actorId: this.actor?.id, configMode: this.#configMode });
    const actor = this.actor;
    this.#configMode = false;
    const result = await super.close(options);

    // Item-kind actors abandoned in the picker (no item ever dropped) — delete.
    const MODULE_ID = "pick-up-stix";
    if (actor && game.actors.has(actor.id) && !actor.token && game.user.isGM
      && actor.getFlag(MODULE_ID, "createKindConfirmed")
      && actor.items.size === 0) {
      await actor.delete();
    }
    return result;
  }

  renderConfig() {
    dbg("sheet:renderConfig", { actorName: this.actor?.name, actorId: this.actor?.id });
    this.#configMode = true;
    return super.render({ force: true });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    context.actor = this.actor;
    context.system = system;
    context.isEditable = this.isEditable;
    context.isContainer = system.isContainer;
    context.needsItem = this.actor.items.size === 0 && !this._tokenDoc;
    context.isIdentified = system.isIdentified;
    context.displayName = system.displayName;

    if (system.isContainer) {
      const item = this.containerItem;
      context.hasContainerItem = !!item;
      context.containerName = system.resolveTokenName();
      context.containerImg = (system.isOpen && system.openImage)
        ? system.openImage
        : (item?.img ?? this.actor.img);
    } else {
      const item = this.actor.items.contents[0];
      context.hasItem = !!item;
      context.itemName = system.resolveTokenName();
      context.itemImg = system.resolveImage();
    }

    if (this.isEditable) {
      context.source = this.actor._source;
    }
    context.editingDescriptionTarget = this.#editingDescriptionTarget;
    context.expanded = this.#expandedSections;
    context.descriptionEnriched = !!system.description;
    context.unidentifiedDescriptionEnriched = !!system.unidentifiedDescription;
    context.limitedDescriptionEnriched = !!system.limitedDescription;

    if (this.#editingDescriptionTarget) {
      const parts = this.#editingDescriptionTarget.split(".");
      let value = this.actor._source;
      for (const part of parts) value = value?.[part];
      context.editingDescriptionValue = value ?? "";
    }
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll("prose-mirror").forEach(editor => {
      editor.addEventListener("save", () => {
        this.#editingDescriptionTarget = null;
        this.render();
      });
    });

    if (this.isEditable) {
      const header = this.element.querySelector(".window-header");
      if (header) {
        const closeBtn = header.querySelector("button.close, [data-action='close']");
        this.#injectHeaderToggles(header, closeBtn);
      }
    }
  }

  _canDragDrop(selector) {
    return true;
  }

  _onDropStackConsumables() {
    return null;
  }

  _prepareSubmitData(event, form, formData) {
    const data = super._prepareSubmitData(event, form, formData);
    dbg("sheet:_prepareSubmitData", {
      incomingKeys: Object.keys(data),
      imgInData: "img" in data,
      dataImg: data.img,
      actorImg: this.actor.img,
      isIdentified: this.actor.system.isIdentified,
      unidentifiedImage: this.actor.system.unidentifiedImage,
      unidentifiedImageInData: "system.unidentifiedImage" in data
    });
    if (data.img && data.img !== this.actor.img) {
      if (this.actor.system.isIdentified || !this.actor.system.unidentifiedImage) {
        data["prototypeToken.texture.src"] = data.img;
        dbg("sheet:_prepareSubmitData", "syncing prototypeToken.texture.src to new img", { src: data.img });
      }
    }
    if ("system.unidentifiedImage" in data && !this.actor.system.isIdentified) {
      const newUnidentifiedImage = data["system.unidentifiedImage"];
      if (newUnidentifiedImage) {
        data["prototypeToken.texture.src"] = newUnidentifiedImage;
        dbg("sheet:_prepareSubmitData", "syncing prototypeToken.texture.src to unidentifiedImage", { src: newUnidentifiedImage });
      } else {
        data["prototypeToken.texture.src"] = data.img || this.actor.img;
        dbg("sheet:_prepareSubmitData", "unidentifiedImage cleared, using actor img", { src: data["prototypeToken.texture.src"] });
      }
    }
    dbg("sheet:_prepareSubmitData", "final submit keys", Object.keys(data));
    return data;
  }

  static #onEditActorImage(event, target) {
    dbg("sheet:#onEditActorImage", { actorName: this.actor?.name, currentImg: this.actor?.img });
    event.preventDefault();
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: this.actor.img,
      callback: (path) => {
        dbg("sheet:#onEditActorImage:callback", { chosenPath: path, actorName: this.actor?.name });
        this.actor.system.updateImage(path);
      }
    });
    fp.render(true);
  }

  static async #onOpenItemSheet(event, target) {
    const item = this.actor.items.contents[0];
    if (!item) return;
    await this.#syncItemImage(item);
    await this.close();
    item.sheet.render({ force: true });
  }

  static async #onOpenContainerSheet(event, target) {
    const item = this.containerItem;
    if (!item) return;
    await this.close();
    item.sheet.render({ force: true });
  }

  async #syncItemImage(item) {
    dbg("sheet:#syncItemImage", {
      actorName: this.actor?.name,
      itemName: item?.name,
      itemImg: item?.img,
      isGM: game.user.isGM
    });
    if (!game.user.isGM) {
      dbg("sheet:#syncItemImage", "not GM, bail");
      return;
    }
    const system = this.actor.system;
    const expectedImg = system.resolveImage();
    dbg("sheet:#syncItemImage", {
      expectedImg,
      isIdentified: system.isIdentified,
      unidentifiedImage: system.unidentifiedImage,
      actorImg: this.actor.img,
      needsUpdate: item.img !== expectedImg
    });
    if (item.img !== expectedImg) {
      dbg("sheet:#syncItemImage", "updating item.img", { from: item.img, to: expectedImg });
      await item.update({ img: expectedImg });
    } else {
      dbg("sheet:#syncItemImage", "item.img already matches, no update needed");
    }
  }

  static async #onToggleOpen(event, target) {
    dbg("sheet:#onToggleOpen", { actorName: this.actor?.name, currentIsOpen: this.actor?.system?.isOpen, newIsOpen: !this.actor?.system?.isOpen });
    await setContainerOpen(this.actor, !this.actor.system.isOpen);
  }

  static async #onToggleIdentified(event, target) {
    const item = this.actor.system.embeddedItem;
    dbg("sheet:#onToggleIdentified", { actorName: this.actor?.name, embeddedItemId: item?.id, currentIdentified: item?.system?.identified, newIdentified: !item?.system?.identified });
    if (!item || item.system?.identified === undefined) return;
    await item.update({ "system.identified": !item.system.identified });
  }

  static async #onToggleLock(event, target) {
    dbg("sheet:#onToggleLock", { actorName: this.actor?.name, currentIsLocked: this.actor?.system?.isLocked });
    await toggleContainerLocked(this.actor);
  }

  static #onEditDescription(event, target) {
    event.stopPropagation();
    this.#editingDescriptionTarget = target.dataset.target;
    this.render();
  }

  static #onToggleCollapsed(event, target) {
    if (event.target.closest(".collapsible-content")) return;
    const expandId = target.dataset.expandId;
    if (expandId) this.#expandedSections[expandId] = !this.#expandedSections[expandId];
    target.classList.toggle("collapsed");
  }

  #injectHeaderToggles(header, closeBtn) {
    header.querySelectorAll(".ii-config-toggle").forEach(el => el.remove());

    const system = this.actor.system;
    const buttons = [];

    if (system.isContainer) {
      buttons.push(createStateToggleButton({
        extraClass: "ii-config-toggle",
        active: system.isOpen,
        iconOn: "fa-box-open",
        iconOff: "fa-box",
        labelOnKey: "INTERACTIVE_ITEMS.Sheet.StateOpened",
        labelOffKey: "INTERACTIVE_ITEMS.Sheet.StateClosed",
        action: "toggleOpen"
      }));
    }

    buttons.push(createStateToggleButton({
      extraClass: "ii-config-toggle",
      active: system.isLocked,
      iconOn: "fa-lock",
      iconOff: "fa-lock-open",
      labelOnKey: "INTERACTIVE_ITEMS.Sheet.StateLocked",
      labelOffKey: "INTERACTIVE_ITEMS.Sheet.StateUnlocked",
      action: "toggleLock"
    }));

    buttons.push(createStateToggleButton({
      extraClass: "ii-config-toggle",
      active: system.isIdentified,
      iconOn: "fa-wand-sparkles",
      iconOff: "fa-wand-sparkles",
      labelOnKey: "INTERACTIVE_ITEMS.Sheet.Identified",
      labelOffKey: "INTERACTIVE_ITEMS.Sheet.Unidentified",
      action: "toggleIdentified"
    }));

    if (closeBtn) closeBtn.before(...buttons);
    else header.append(...buttons);
  }

  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    dbg("sheet:_onDrop", { dataType: data.type, uuid: data.uuid });
    if (data.type !== "Item") {
      dbg("sheet:_onDrop", "not an Item drop, bail");
      return;
    }

    const item = await fromUuid(data.uuid);
    if (!item) {
      dbg("sheet:_onDrop", "could not resolve item from uuid, bail", { uuid: data.uuid });
      return;
    }

    dbg("sheet:_onDrop", "resolved dropped item", { itemName: item.name, itemImg: item.img, itemUuid: item.uuid, itemType: item.type });

    if (!("quantity" in (item.system ?? {}))) {
      dbg("sheet:_onDrop", "item is not a physical item (no quantity), bail");
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotPhysical"));
      return;
    }

    if (!game.user.isGM) {
      dbg("sheet:_onDrop", "not GM, bail");
      return;
    }

    const itemData = item.toObject();
    delete itemData._id;

    // Set before creation so the updateItem hook doesn't fire for this change
    // while actor.img is still the old value.
    if (itemData.system && "identified" in itemData.system) {
      itemData.system.identified = true;
    }

    // Interactive actors hold exactly one embedded item.
    if (this.actor.items.size > 0) {
      const ids = this.actor.items.map(i => i.id);
      dbg("sheet:_onDrop", "clearing existing embedded items", { ids });
      await this.actor.deleteEmbeddedDocuments("Item", ids);
    }

    // Update actor first so actor.img is correct before item hooks fire.
    const updates = {
      name: item.name,
      img: item.img,
      "prototypeToken.name": item.name,
      "prototypeToken.texture.src": item.img
    };
    if (item.system.description?.value) {
      updates["system.description"] = item.system.description.value;
    }
    if (item.system.unidentified?.name) {
      updates["system.unidentifiedName"] = item.system.unidentified.name;
    }
    if (item.system.unidentified?.description) {
      updates["system.unidentifiedDescription"] = item.system.unidentified.description;
    }
    dbg("sheet:_onDrop", "firing actor.update with metadata", { updates });
    await this.actor.update(updates);
    dbg("sheet:_onDrop", "actor.update complete", { actorImg: this.actor.img });

    dbg("sheet:_onDrop", "firing createEmbeddedDocuments", { itemDataImg: itemData.img });
    const [createdItem] = await this.actor.createEmbeddedDocuments("Item", [itemData]);
    dbg("sheet:_onDrop", "createEmbeddedDocuments complete", { createdItemId: createdItem?.id, createdItemImg: createdItem?.img });

    if (createdItem && "identified" in (createdItem.system ?? {})) {
      const itemUpdates = {};
      if (this.actor.system.unidentifiedName) {
        itemUpdates["system.unidentified.name"] = this.actor.system.unidentifiedName;
      }
      if (this.actor.system.unidentifiedDescription) {
        itemUpdates["system.unidentified.description"] = this.actor.system.unidentifiedDescription;
      }
      if (this.actor.system.description) {
        itemUpdates["system.description.value"] = this.actor.system.description;
      }
      if (Object.keys(itemUpdates).length > 0) {
        dbg("sheet:_onDrop", "syncing unidentified fields on createdItem", { itemUpdates });
        await createdItem.update(itemUpdates);
      }
    }

    dbg("sheet:_onDrop", "drop complete", { finalActorImg: this.actor.img, finalCreatedItemImg: createdItem?.img });
    ui.notifications.info(game.i18n.format("INTERACTIVE_ITEMS.Notify.Deposited", { name: item.name }));
  }
}
