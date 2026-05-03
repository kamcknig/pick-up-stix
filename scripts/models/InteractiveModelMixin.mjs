import { isModuleGM } from "../utils/playerView.mjs";

export default function InteractiveModelMixin(Base) {
  return class extends Base {

    get displayName() {
      if (isModuleGM() || this.isIdentified) return this.parent.name;
      return this.unidentifiedName || this.parent.name;
    }

    get displayDescription() {
      if (isModuleGM() || this.isIdentified) return this.description || this.unidentifiedDescription;
      return this.unidentifiedDescription;
    }

    resolveTokenName(isIdentified) {
      const identified = isIdentified ?? this.isIdentified;
      if (!identified) {
        if (this.unidentifiedName) return this.unidentifiedName;
        // Fall back to the embedded item's dnd5e unidentified.name so the
        // token tracks names set via dnd5e's native sheet too.
        const itemName = this.embeddedItem?.system?.unidentified?.name;
        if (itemName) return itemName;
      }
      return this.parent.name;
    }

    get topLevelItems() {
      const tokenDoc = this.parent.token;
      if (tokenDoc) {
        const snapshotIds = tokenDoc.flags?.["pick-up-stix"]?.snapshotItemIds;
        const baseActor = game.actors.get(tokenDoc.actorId);
        const baseItemIds = baseActor ? new Set(baseActor.items.keys()) : new Set();
        const allowed = snapshotIds ? new Set(snapshotIds) : new Set();
        return this.parent.items.filter(i =>
          (allowed.has(i.id) || !baseItemIds.has(i.id)) && !i.system.container
        );
      }
      return this.parent.items.filter(i => !i.system.container);
    }
  };
}
