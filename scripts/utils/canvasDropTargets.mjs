import { isInteractiveActor, isInteractiveContainer } from "./actorHelpers.mjs";
import { dbg } from "./debugLog.mjs";

export const PLACE_ON_CANVAS = "__place__";

export function findCanvasDropTargets(x, y, { sourceActorId = null } = {}) {
  const size = canvas.grid.size;
  const targets = [];
  for (const t of canvas.tokens?.placeables ?? []) {
    const actor = t.actor;
    if (!actor) continue;
    if (isInteractiveActor(actor) && !isInteractiveContainer(actor)) continue;
    if (sourceActorId && actor.id === sourceActorId) continue;
    const tx = t.document.x;
    const ty = t.document.y;
    const tw = t.document.width * size;
    const th = t.document.height * size;
    if (x < tx || x >= tx + tw || y < ty || y >= ty + th) continue;
    targets.push(t);
  }
  dbg("dropTargets:find", { x, y, sourceActorId, count: targets.length,
    names: targets.map(t => t.actor.name) });
  return targets;
}

export async function promptDropChoice({
  droppedName,
  targets,
  topLabel,
  topIcon = "fa-solid fa-map-pin",
  titleKey = "INTERACTIVE_ITEMS.Dialog.DropTargetTitle",
  hintKey  = "INTERACTIVE_ITEMS.Dialog.DropTargetHint",
}) {
  const isSingle = targets.length === 1;
  const single   = isSingle ? targets[0] : null;

  const singleRow = single ? `
    <div class="ii-actor-list-row" style="pointer-events:none; margin:0.5em 0;">
      <img src="${single.actor.img}" alt="" />
      <span>${single.actor.name}</span>
    </div>` : "";

  const content = `
    <p>${game.i18n.format(hintKey, { name: droppedName })}</p>
    ${singleRow}
  `;

  const depositLabel = isSingle
    ? game.i18n.format("INTERACTIVE_ITEMS.Dialog.DepositToActor", { name: single.actor.name })
    : game.i18n.localize("INTERACTIVE_ITEMS.Dialog.ChooseRecipient");
  const depositIcon = isSingle
    ? "fa-solid fa-arrow-right-to-bracket"
    : "fa-solid fa-list";

  const raw = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.format(titleKey, { name: droppedName }),
      classes: ["ii-pickup-target-dialog"]
    },
    content,
    buttons: [
      {
        action: "top",
        label: topLabel,
        icon: topIcon,
        callback: () => PLACE_ON_CANVAS
      },
      {
        action: "deposit",
        label: depositLabel,
        icon: depositIcon,
        callback: () => isSingle ? single : "__choose__"
      }
    ],
    rejectClose: false
  });

  if (!raw) {
    dbg("dropTargets:promptDropChoice", "cancelled");
    return null;
  }
  if (raw === PLACE_ON_CANVAS) {
    dbg("dropTargets:promptDropChoice", "chose keep-position");
    return PLACE_ON_CANVAS;
  }
  if (raw === "__choose__") {
    // Open the full filterable list — parent dialog already offered "Place on Canvas".
    dbg("dropTargets:promptDropChoice", "escalating to list picker", { count: targets.length });
    return _promptTargetListPicker({ droppedName, targets });
  }
  dbg("dropTargets:promptDropChoice", "chose single target", { name: raw.actor.name });
  return raw;
}

async function _promptTargetListPicker({ droppedName, targets }) {
  // Sort: interactive containers first, then PCs, then NPCs, alpha within group.
  const sorted = [...targets].sort((a, b) => {
    const groupOf = (t) => {
      if (isInteractiveContainer(t.actor)) return 0;
      if (t.actor.type === "character") return 1;
      if (t.actor.type === "npc") return 2;
      return 3;
    };
    const diff = groupOf(a) - groupOf(b);
    return diff !== 0 ? diff : a.actor.name.localeCompare(b.actor.name);
  });

  const rows = sorted.map(t => `
    <div class="ii-actor-list-row" data-token-id="${t.document.id}">
      <img src="${t.actor.img}" alt="" />
      <span>${t.actor.name}</span>
    </div>
  `).join("");

  const content = `
    <div class="form-group">
      <div class="form-fields">
        <input type="search" name="drop-target-search"
               placeholder="${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.PickupTargetSearch")}"
               autocomplete="off" />
      </div>
    </div>
    <div class="ii-actor-list">${rows}</div>
    <input type="hidden" name="choice" value="" />
  `;

  const raw = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.format("INTERACTIVE_ITEMS.Dialog.DropTargetTitle", { name: droppedName }),
      classes: ["ii-pickup-target-dialog"]
    },
    content,
    render: (event, dialog) => {
      const search     = dialog.element.querySelector("[name='drop-target-search']");
      const list       = dialog.element.querySelector(".ii-actor-list");
      const hidden     = dialog.element.querySelector("[name='choice']");
      const confirmBtn = dialog.element.querySelector('[data-action="ok"]');
      if (!search || !list || !hidden) return;

      const first = list.querySelector(".ii-actor-list-row");
      if (first) { first.classList.add("selected"); hidden.value = first.dataset.tokenId; }

      list.addEventListener("click", e => {
        const row = e.target.closest(".ii-actor-list-row");
        if (!row) return;
        list.querySelector(".ii-actor-list-row.selected")?.classList.remove("selected");
        row.classList.add("selected");
        hidden.value = row.dataset.tokenId;
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
            if (firstVisible) { firstVisible.classList.add("selected"); hidden.value = firstVisible.dataset.tokenId; }
            else hidden.value = "";
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
        callback: (event, button) => button.form.elements.choice.value
      },
      {
        action: "cancel",
        label: game.i18n.localize("Cancel"),
        icon: "fa-solid fa-times"
      }
    ],
    rejectClose: false
  });

  if (!raw) { dbg("dropTargets:listPicker", "cancelled"); return null; }
  const chosen = sorted.find(t => t.document.id === raw) ?? null;
  dbg("dropTargets:listPicker", { chosen: chosen?.actor.name });
  return chosen;
}
