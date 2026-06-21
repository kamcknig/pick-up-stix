/**
 * dnd5e item-tooltip concern. Mixed onto Dnd5eAdapter.prototype.
 *
 * Reproduces the native rich item tooltip (icon, name, type, description,
 * property pills) on an arbitrary element by mirroring dnd5e's own wiring: a
 * "loading" section keyed by the item UUID placed in Foundry's `data-tooltip`,
 * plus the dnd5e tooltip classes. dnd5e's global `Tooltips5e` MutationObserver
 * (`game.dnd5e.tooltips`) watches the shared `#tooltip` element, resolves the
 * UUID via `fromUuid` on hover, calls `item.richTooltip()`, and swaps in the
 * real card — so content is built lazily and stays identification-aware,
 * exactly like the inventory rows. Works for embedded vendor items and
 * synthetic-token items alike (both resolve via `fromUuid`).
 */
export const Dnd5eTooltip = {
  applyItemTooltip(element, item) {
    if ( !element || !item?.uuid ) return;
    // Native lazy trigger: Tooltips5e replaces this loading section on hover.
    element.dataset.tooltip =
      `<section class="loading" data-uuid="${item.uuid}">`
      + `<i class="fas fa-spinner fa-spin-pulse"></i></section>`;
    // Version-gated class list (dnd5e): 4.0.0 = "dnd5e2 dnd5e-tooltip item-tooltip";
    // 5.x adds "themed theme-light". The extra theme tokens are inert on 4.0.0,
    // so this superset is safe on both; "item-tooltip" is the load-bearing token
    // dnd5e's _positionItemTooltip keys on.
    element.dataset.tooltipClass = "dnd5e2 dnd5e-tooltip item-tooltip themed theme-light";
    element.dataset.tooltipDirection ??= "LEFT";
  }
};
