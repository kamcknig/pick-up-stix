export function createStateToggleButton({
  extraClass, active, iconOn, iconOff,
  iconFamilyOn = "fa-solid", iconFamilyOff = "fa-solid",
  labelOnKey, labelOffKey, action, onClick
}) {
  const icon = active ? iconOn : iconOff;
  const family = active ? iconFamilyOn : iconFamilyOff;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `header-control pseudo-header-control state-toggle ${family} icon ${extraClass} ${icon}`;
  btn.classList.toggle("active", active);
  const key = active ? labelOnKey : labelOffKey;
  btn.setAttribute("aria-label", game.i18n.localize(key));
  btn.dataset.tooltip = key;
  btn.dataset.tooltipDirection = "DOWN";
  if (action) btn.dataset.action = action;
  if (onClick) btn.addEventListener("click", onClick);
  return btn;
}

/**
 * Create a header button whose DOM shape matches the active system's sheet
 * conventions. dnd5e produces a V2 `<button class="header-control ...">`;
 * pf2e produces a V1 `<a class="header-button">`. The adapter's `cssClasses`
 * supplies both the wrapper class (`stateToggle` / `configButton`) and the
 * `headerElementType` discriminator.
 *
 * Supports both toggle (pass `iconOff`) and single-state (omit `iconOff`)
 * buttons — the latter is used for the gear / configure control.
 *
 * @param {object} opts
 * @param {object} opts.adapter - Result of `getAdapter()`.
 * @param {"state"|"config"} [opts.kind="state"] - Picks `cssClasses.stateToggle` vs `configButton`.
 * @param {string} [opts.extraClass=""] - Caller's identifying class (e.g. "ii-lock-toggle-btn").
 * @param {boolean} [opts.active] - Toggle on/off state. Omit for non-toggle buttons.
 * @param {string} opts.iconOn
 * @param {string} [opts.iconOff] - Omit for single-state buttons (uses iconOn always).
 * @param {string} [opts.iconFamilyOn="fa-solid"]
 * @param {string} [opts.iconFamilyOff="fa-solid"]
 * @param {string} [opts.labelOnKey]
 * @param {string} [opts.labelOffKey]
 * @param {Function} [opts.onClick]
 * @returns {HTMLElement}
 */
export function createAdapterHeaderButton({
  adapter, kind = "state", extraClass = "",
  active, iconOn, iconOff,
  iconFamilyOn = "fa-solid", iconFamilyOff = "fa-solid",
  labelOnKey, labelOffKey,
  onClick
}) {
  const isToggle = iconOff !== undefined;
  const icon = isToggle && active === false ? iconOff : iconOn;
  const family = isToggle && active === false ? iconFamilyOff : iconFamilyOn;
  const labelKey = (isToggle && active === false ? labelOffKey : labelOnKey) ?? null;
  const cls = adapter.cssClasses;
  const baseClass = kind === "config" ? cls.configButton : cls.stateToggle;
  const useAnchor = cls.headerElementType === "a";

  if (useAnchor) {
    // V1 — `<a class="header-button {extraClass}"><i class="..."></i></a>`
    const btn = document.createElement("a");
    btn.className = `${baseClass} ${extraClass}`.trim();
    if (isToggle) btn.classList.toggle("active", !!active);
    if (labelKey) {
      const label = game.i18n.localize(labelKey);
      btn.dataset.tooltip = label;
      btn.setAttribute("aria-label", label);
    }
    btn.innerHTML = `<i class="${family} ${icon}"></i>`;
    if (onClick) {
      // Foundry's V1 sheet binds a delegated `.header-button` click handler at
      // render time. When we inject our own `<a class="header-button">` after
      // render, that handler still fires on it but tries to look the descriptor
      // up in `windowData.headerButtons` (where ours don't exist) — crashing
      // with "Cannot read properties of undefined (reading 'onclick')". Use
      // `stopImmediatePropagation` to short-circuit the delegated handler.
      btn.addEventListener("click", (ev) => {
        ev.stopImmediatePropagation();
        return onClick(ev);
      });
    }
    return btn;
  }

  // V2 — `<button class="header-control pseudo-header-control state-toggle ...">`
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${baseClass} ${family} icon ${extraClass} ${icon}`.trim();
  if (isToggle) btn.classList.toggle("active", !!active);
  if (labelKey) {
    btn.setAttribute("aria-label", game.i18n.localize(labelKey));
    btn.dataset.tooltip = labelKey;
    btn.dataset.tooltipDirection = "DOWN";
  }
  if (onClick) btn.addEventListener("click", onClick);
  return btn;
}

export function insertHeaderButton(header, btn, closeBtn) {
  const identifiedToggle = header.querySelector(".toggle-identified");
  if (identifiedToggle) identifiedToggle.before(btn);
  // Fall back to scanning the header in case the caller failed to resolve the
  // close button under the system's specific markup. pf2e V1 sheets render
  // close as `<a class="header-button close">` while dnd5e V2 uses
  // `<button data-action="close">`.
  const close = closeBtn ?? header.querySelector("button.close, a.close, [data-action='close']");
  if (close) close.before(btn);
  else header.appendChild(btn);
}

export function createRowControl({ iconClass, titleKey, onClick, extraClass = "", active = false }) {
  const btn = document.createElement("a");
  btn.className = `ii-row-control ${extraClass}`.trim();
  btn.classList.toggle("active", active);
  btn.title = game.i18n.localize(titleKey);
  btn.innerHTML = `<i class="${iconClass}"></i>`;
  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    await onClick(ev);
  });
  return btn;
}
