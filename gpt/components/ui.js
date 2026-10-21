export const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const icons = {
  home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',
  explore: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  portfolio:
    '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V3h8v4M3 13h18M10 13v3h4v-3"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  arrow: '<path d="m8 4 8 8-8 8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${icons[name] || icons.arrow}</svg>`;
export const empty = (title, text) =>
  `<div class="empty"><span class="empty-symbol">◇</span><strong>${title}</strong><p>${text}</p></div>`;
export const section = (eyebrow, title, content, extra = "") =>
  `<section class="panel"><div class="section-head"><div><small class="eyebrow">${eyebrow}</small><h2>${title}</h2></div>${extra}</div>${content}</section>`;
