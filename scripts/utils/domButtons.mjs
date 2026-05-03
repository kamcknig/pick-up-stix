export function createStateToggleButton({
  extraClass, active, iconOn, iconOff,
  labelOnKey, labelOffKey, action, onClick
}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `header-control pseudo-header-control state-toggle fa-solid icon ${extraClass} ${active ? iconOn : iconOff}`;
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
  else if (closeBtn) closeBtn.before(btn);
  else header.appendChild(btn);
}

export function createRowControl({ iconClass, titleKey, onClick, extraClass = "" }) {
  const btn = document.createElement("a");
  btn.className = `ii-row-control ${extraClass}`.trim();
  btn.title = game.i18n.localize(titleKey);
  btn.innerHTML = `<i class="${iconClass}"></i>`;
  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    await onClick(ev);
  });
  return btn;
}
