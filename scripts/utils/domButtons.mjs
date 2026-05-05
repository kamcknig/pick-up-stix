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
