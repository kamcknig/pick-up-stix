/**
 * Dnd5eInteractiveItemConfigSheet — ApplicationV2 GM config dialog for
 * pick-up-stix interactive object actors on dnd5e.
 *
 * Matches dnd5e's own AppV2 sheet conventions (HandlebarsApplicationMixin,
 * `static actions`, `<file-picker>` / `<prose-mirror>` custom elements,
 * `_prepareSubmitData`). Constructed by `Dnd5eAdapter.renderConfigSheet()`
 * and cached per-actor in `#instances` so repeated clicks on the same actor
 * reuse the open window.
 */

import { getAdapter } from "../index.mjs";
import { setContainerOpen, toggleContainerLocked } from "../../transfer/ItemTransfer.mjs";
import { createStateToggleButton } from "../../utils/domButtons.mjs";
import { dbg } from "../../utils/debugLog.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const ActorSheetV2 = foundry.applications.sheets.ActorSheetV2;

/**
 * dnd5e GM-only config sheet for `pick-up-stix.interactiveItem` actors.
 */
export default class Dnd5eInteractiveItemConfigSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** Per-actor singleton cache so repeat opens reuse the existing window. */
  static #instances = new Map();

  /**
   * Resolve the config sheet for a given actor, creating one on first call
   * and returning the cached instance on subsequent calls.
   *
   * @param {Actor} actor
   * @returns {Dnd5eInteractiveItemConfigSheet}
   */
  static forActor(actor) {
    const key = actor.uuid;
    let sheet = Dnd5eInteractiveItemConfigSheet.#instances.get(key);
    if (!sheet) {
      sheet = new Dnd5eInteractiveItemConfigSheet({ document: actor });
      Dnd5eInteractiveItemConfigSheet.#instances.set(key, sheet);
    }
    return sheet;
  }

  #editingDescriptionTarget = null;

  #expandedSections = {};

  static DEFAULT_OPTIONS = {
    classes: ["pick-up-stix", "interactive-item-sheet", "dnd5e2", "sheet", "item", "standard-form"],
    position: { width: 400, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      openItemSheet: Dnd5eInteractiveItemConfigSheet.#onOpenItemSheet,
      openContainerSheet: Dnd5eInteractiveItemConfigSheet.#onOpenContainerSheet,
      editActorImage: Dnd5eInteractiveItemConfigSheet.#onEditActorImage,
      toggleOpen: Dnd5eInteractiveItemConfigSheet.#onToggleOpen,
      toggleIdentified: Dnd5eInteractiveItemConfigSheet.#onToggleIdentified,
      toggleLock: Dnd5eInteractiveItemConfigSheet.#onToggleLock,
      editDescription: Dnd5eInteractiveItemConfigSheet.#onEditDescription,
      toggleCollapsed: Dnd5eInteractiveItemConfigSheet.#onToggleCollapsed
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

  async close(options = {}) {
    dbg("dnd5e-config:close", { actorName: this.actor?.name, actorId: this.actor?.id });
    const actor = this.actor;
    Dnd5eInteractiveItemConfigSheet.#instances.delete(actor?.uuid);
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
      if (header) this.#injectHeaderToggles(header);
    }
  }

  _canDragDrop(_selector) {
    return true;
  }

  _onDropStackConsumables() {
    return null;
  }

  /**
   * Inject prototypeToken.texture.src whenever `img` or `system.unidentifiedImage`
   * changes so the placed token's portrait stays in sync with the configured
   * identified/unidentified image.
   */
  _prepareSubmitData(event, form, formData) {
    const data = super._prepareSubmitData(event, form, formData);
    dbg("dnd5e-config:_prepareSubmitData", {
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
      }
    }
    if ("system.unidentifiedImage" in data && !this.actor.system.isIdentified) {
      const newUnidentifiedImage = data["system.unidentifiedImage"];
      if (newUnidentifiedImage) {
        data["prototypeToken.texture.src"] = newUnidentifiedImage;
      } else {
        data["prototypeToken.texture.src"] = data.img || this.actor.img;
      }
    }
    return data;
  }

  static #onEditActorImage(event, _target) {
    event.preventDefault();
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: this.actor.img,
      callback: (path) => this.actor.system.updateImage(path)
    });
    fp.render(true);
  }

  static async #onOpenItemSheet(_event, _target) {
    const item = this.actor.items.contents[0];
    if (!item) return;
    await this.#syncItemImage(item);
    await this.close();
    await getAdapter().renderItemView(this.actor);
  }

  static async #onOpenContainerSheet(_event, _target) {
    if (!this.containerItem) return;
    await this.close();
    await getAdapter().renderContainerView(this.actor);
  }

  /**
   * If the embedded item's image has drifted from the actor's resolved image
   * (identified vs unidentified), push the actor's resolved image down to the
   * item before opening its sheet. GM-only.
   */
  async #syncItemImage(item) {
    if (!game.user.isGM) return;
    const system = this.actor.system;
    const expectedImg = system.resolveImage();
    if (item.img !== expectedImg) {
      await item.update({ img: expectedImg });
    }
  }

  static async #onToggleOpen(_event, _target) {
    await setContainerOpen(this.actor, !this.actor.system.isOpen);
  }

  static async #onToggleIdentified(_event, _target) {
    const item = this.actor.system.embeddedItem;
    const adapter = getAdapter();
    const currentIdentified = item ? adapter.isItemIdentified(item) : undefined;
    if (!item || currentIdentified === undefined) return;
    await adapter.performIdentifyToggle(item);
  }

  static async #onToggleLock(_event, _target) {
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

  /**
   * Inject Open/Close (containers only), Lock, and Identify toggles into the
   * config window's own header. Buttons are removed and re-added on every
   * render so their on/off state stays in sync with `system.isOpen`/`isLocked`/
   * `isIdentified`. Inserted immediately after `.window-title` so they sit
   * left of dnd5e/V2's right-aligned system controls (ellipsis, close).
   */
  #injectHeaderToggles(header) {
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

    const identCfg = getAdapter().getIdentifyButtonConfig(system.isIdentified);
    buttons.push(createStateToggleButton({
      extraClass: "ii-config-toggle",
      active: system.isIdentified,
      iconOn: identCfg.iconOn,
      iconFamilyOn: identCfg.iconFamilyOn,
      iconOff: identCfg.iconOff,
      iconFamilyOff: identCfg.iconFamilyOff,
      labelOnKey: identCfg.labelOnKey,
      labelOffKey: identCfg.labelOffKey,
      action: "toggleIdentified"
    }));

    const title = header.querySelector(".window-title");
    if (title) title.after(...buttons);
    else header.prepend(...buttons);
  }

  /**
   * Drop handler for assigning the actor's embedded item. Mirrors the original
   * InteractiveItemSheet._onDrop verbatim — system-specific fields are routed
   * through the adapter so this implementation works for any system whose
   * config sheet extends from this one (currently only dnd5e).
   */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    dbg("dnd5e-config:_onDrop", { dataType: data.type, uuid: data.uuid });
    if (data.type !== "Item") return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    const adapter = getAdapter();
    if (!adapter.isPhysicalItem(item)) {
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotPhysical"));
      return;
    }

    if (!game.user.isGM) return;
    const itemData = item.toObject();
    delete itemData._id;

    // Stamp identified before creation so updateItem doesn't fire mid-update.
    adapter.stampNewItemIdentified(itemData, true);

    if (this.actor.items.size > 0) {
      const ids = this.actor.items.map(i => i.id);
      await this.actor.deleteEmbeddedDocuments("Item", ids);
    }

    const updates = {
      name: item.name,
      img: item.img,
      "prototypeToken.name": item.name,
      "prototypeToken.texture.src": item.img
    };
    if (item.system.description?.value) {
      updates["system.description"] = item.system.description.value;
    }
    const droppedUnidentifiedName = adapter.getItemUnidentifiedName(item);
    const droppedUnidentifiedDescription = adapter.getItemUnidentifiedDescription(item);
    if (droppedUnidentifiedName) updates["system.unidentifiedName"] = droppedUnidentifiedName;
    if (droppedUnidentifiedDescription) updates["system.unidentifiedDescription"] = droppedUnidentifiedDescription;

    await this.actor.update(updates);

    const [createdItem] = await this.actor.createEmbeddedDocuments("Item", [itemData]);

    if (createdItem) {
      const allIdentificationChanges = {
        isIdentified: true,
        unidentifiedName: this.actor.system.unidentifiedName,
        description: this.actor.system.description,
        unidentifiedDescription: this.actor.system.unidentifiedDescription
      };
      const itemUpdates = adapter.buildItemIdentificationUpdate(this.actor, allIdentificationChanges);
      if (Object.keys(itemUpdates).length > 0) await createdItem.update(itemUpdates);
    }

    ui.notifications.info(game.i18n.format("INTERACTIVE_ITEMS.Notify.Deposited", { name: item.name }));
  }
}
