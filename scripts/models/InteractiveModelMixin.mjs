import { isModuleGM } from "../utils/playerView.mjs";
import { getAdapter } from "../adapter/index.mjs";

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
        // Fall back to the embedded item's system-specific unidentified name so
        // the token tracks names set via the native item sheet too.
        const itemName = getAdapter().getItemUnidentifiedName(this.embeddedItem);
        if (itemName) return itemName;
      }
      return this.parent.name;
    }

    get topLevelItems() {
      // An item is "top-level" when its container-parent pointer is null OR
      // points to a sibling that doesn't exist in this actor. The latter
      // catches stale pointers preserved from a prior inventory life — without
      // this, an item dragged out of a container and re-wrapped as an
      // interactive actor would be filtered out as a phantom child.
      const localIds = new Set(this.parent.items.map(i => i.id));
      const isTopLevel = (i) => {
        const cid = getAdapter().getItemContainerId(i);
        return !cid || !localIds.has(cid);
      };
      const tokenDoc = this.parent.token;
      if (tokenDoc) {
        const snapshotIds = tokenDoc.flags?.["pick-up-stix"]?.snapshotItemIds;
        const baseActor = game.actors.get(tokenDoc.actorId);
        const baseItemIds = baseActor ? new Set(baseActor.items.keys()) : new Set();
        const allowed = snapshotIds ? new Set(snapshotIds) : new Set();
        return this.parent.items.filter(i =>
          (allowed.has(i.id) || !baseItemIds.has(i.id)) && isTopLevel(i)
        );
      }
      return this.parent.items.filter(isTopLevel);
    }
  };
}
