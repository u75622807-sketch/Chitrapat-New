// js/ui.js — बार-बार इस्तेमाल होने वाले UI हिस्से (कार्ड, थंबनेल, टोस्ट, खाली-स्थिति…)
import { h, icon, thumbOf, sourcesOf, formatDuration, formatViews, timeAgo, firstLetter, hueFrom } from './utils.js';
import { viewsOf, isSaved, toggleWatchLater } from './store.js';
import { categoryLabel } from './demo-data.js';

export const watchHref = (v) => `#/watch/${encodeURIComponent(v.id)}`;
export const channelHref = (name) => `#/channel/${encodeURIComponent(name)}`;

// ─── टोस्ट (छोटा संदेश) ─────────────────────────────────────────
export function toast(message, { type = 'info', action, timeout = 3200 } = {}) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const iconName = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info';
  const el = h('div', { class: `toast toast-${type}`, role: 'status' },
    icon(iconName),
    h('span', { class: 'toast-text' }, message),
    action && h('button', {
      class: 'toast-action',
      type: 'button',
      onClick: () => { action.onClick(); el.remove(); },
    }, action.label),
  );
  box.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, action ? timeout + 3000 : timeout);
}

// ─── अवतार (नाम के पहले अक्षर वाला रंगीन गोला) ───────────────────
export function avatar(name, size = 36, asLink = true) {
  const hue = hueFrom(name);
  const props = {
    class: 'avatar',
    style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px`, background: `linear-gradient(135deg, hsl(${hue} 75% 55%), hsl(${(hue + 40) % 360} 70% 42%))` },
    'aria-hidden': 'true',
  };
  if (asLink) {
    return h('a', { ...props, href: channelHref(name), tabindex: '-1' }, firstLetter(name));
  }
  return h('span', props, firstLetter(name));
}

// ─── थंबनेल (इमेज न मिले तो सुंदर ग्रेडिएंट प्लेसहोल्डर) ──────────
export function thumbnail(v, { size = 'card', eager = false } = {}) {
  const hue = hueFrom(v.title || v.id);
  const wrap = h('div', {
    class: 'thumb',
    style: { '--h': hue },
  });
  const fallback = h('div', { class: 'thumb-fallback' },
    h('span', { class: 'thumb-fallback-cat' }, categoryLabel(v.category)),
    icon('play', 'thumb-fallback-icon'),
  );
  wrap.append(fallback);
  const src = thumbOf(v, size);
  if (src) {
    const img = h('img', {
      src,
      alt: '',
      loading: eager ? 'eager' : 'lazy',
      decoding: 'async',
      fetchpriority: eager ? 'high' : null,
      onLoad: () => wrap.classList.add('loaded'),
      onError: () => img.remove(),
    });
    wrap.append(img);
  }
  const dur = formatDuration(v.duration);
  if (dur) wrap.append(h('span', { class: 'badge-duration' }, dur));
  if (v.local) wrap.append(h('span', { class: 'badge-tag' }, 'लोकल'));
  else if (!v.demo && Date.now() - (v.timestamp?.getTime?.() || 0) < 3 * 86400000) wrap.append(h('span', { class: 'badge-tag badge-new' }, 'नया'));
  return wrap;
}

// ─── होवर करने पर वीडियो का छोटा प्रीव्यू (सिर्फ़ माउस वाले डिवाइस पर) ───
const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
function attachHoverPreview(thumbEl, v) {
  if (!canHover || navigator.connection?.saveData) return;
  let timer = null;
  let vid = null;
  const stop = () => {
    clearTimeout(timer);
    if (vid) { vid.pause(); vid.removeAttribute('src'); vid.load(); vid.remove(); vid = null; }
    thumbEl.classList.remove('previewing');
  };
  thumbEl.addEventListener('pointerenter', () => {
    timer = setTimeout(() => {
      const src = sourcesOf(v)[0];
      if (!src) return;
      vid = h('video', { class: 'thumb-preview', muted: true, playsInline: true, loop: true, preload: 'auto', src });
      vid.muted = true;
      vid.addEventListener('playing', () => thumbEl.classList.add('previewing'));
      vid.addEventListener('error', stop);
      thumbEl.append(vid);
      vid.play().catch(stop);
    }, 650);
  });
  thumbEl.addEventListener('pointerleave', stop);
}

function saveButton(v) {
  const btn = h('button', {
    class: `thumb-action${isSaved(v.id) ? ' active' : ''}`,
    type: 'button',
    title: 'बाद में देखें',
    'aria-label': 'बाद में देखें',
    'aria-pressed': String(isSaved(v.id)),
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const on = toggleWatchLater(v.id);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.replaceChildren(icon(on ? 'check' : 'clock'));
      toast(on ? '"बाद में देखें" में जोड़ दिया' : '"बाद में देखें" से हटा दिया', { type: on ? 'success' : 'info' });
    },
  }, icon(isSaved(v.id) ? 'check' : 'clock'));
  return btn;
}

// ─── ग्रिड वाला वीडियो कार्ड ─────────────────────────────────────
export function videoCard(v, { eager = false } = {}) {
  const thumbLink = h('a', { class: 'card-thumb', href: watchHref(v), 'aria-label': v.title }, thumbnail(v, { eager }));
  attachHoverPreview(thumbLink.firstChild, v);
  return h('article', { class: 'card' },
    h('div', { class: 'card-media' }, thumbLink, saveButton(v)),
    h('div', { class: 'card-meta' },
      avatar(v.userName, 36),
      h('div', { class: 'card-text' },
        h('a', { class: 'card-title', href: watchHref(v), title: v.title }, v.title),
        h('a', { class: 'card-channel', href: channelHref(v.userName) }, v.userName),
        h('div', { class: 'card-stats' }, `${formatViews(viewsOf(v))} • ${timeAgo(v.timestamp)}`),
      ),
    ),
  );
}

// ─── लाइन वाला वीडियो (ट्रेंडिंग, खोज, लाइब्रेरी, "आगे देखें") ─────
export function videoRow(v, { rank, compact = false, onRemove, showDesc = !compact } = {}) {
  const thumbLink = h('a', { class: 'row-thumb', href: watchHref(v), 'aria-label': v.title }, thumbnail(v, { size: compact ? 'small' : 'card' }));
  if (!compact) attachHoverPreview(thumbLink.firstChild, v);
  return h('article', { class: `row${compact ? ' row-compact' : ''}` },
    rank != null && h('div', { class: `row-rank${rank <= 3 ? ' top' : ''}` }, `#${rank}`),
    thumbLink,
    h('div', { class: 'row-text' },
      h('a', { class: 'row-title', href: watchHref(v), title: v.title }, v.title),
      h('div', { class: 'row-stats' },
        h('a', { href: channelHref(v.userName) }, v.userName),
        h('span', null, `${formatViews(viewsOf(v))} • ${timeAgo(v.timestamp)}`),
      ),
      showDesc && v.description && h('p', { class: 'row-desc' }, v.description.split('\n')[0].slice(0, 160)),
    ),
    onRemove && h('button', {
      class: 'icon-btn row-remove',
      type: 'button',
      title: 'हटाएँ',
      'aria-label': 'हटाएँ',
      onClick: () => onRemove(v),
    }, icon('x')),
  );
}

export function grid(videos, opts = {}) {
  return h('div', { class: 'grid' }, videos.map((v, i) => videoCard(v, { eager: opts.eager && i < 4 })));
}

export function rows(videos, opts = {}) {
  return h('div', { class: 'rows' }, videos.map((v, i) => videoRow(v, { ...opts, rank: opts.ranked ? i + 1 : undefined })));
}

// ─── लोडिंग स्केलेटन ─────────────────────────────────────────────
export function skeletonGrid(n = 8) {
  return h('div', { class: 'grid', 'aria-busy': 'true', 'aria-label': 'लोड हो रहा है' },
    Array.from({ length: n }, () => h('div', { class: 'card skeleton-card' },
      h('div', { class: 'sk sk-thumb' }),
      h('div', { class: 'card-meta' },
        h('div', { class: 'sk sk-avatar' }),
        h('div', { class: 'card-text' }, h('div', { class: 'sk sk-line' }), h('div', { class: 'sk sk-line short' })),
      ),
    )),
  );
}

// ─── खाली-स्थिति (जब दिखाने को कुछ न हो) ──────────────────────────
export function emptyState({ iconName = 'film', title, text, action }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon(iconName)),
    h('h2', null, title),
    text && h('p', null, text),
    action && h('a', { class: 'btn btn-grad', href: action.href }, action.icon && icon(action.icon), action.label),
  );
}

export function pageHeader(title, { iconName, subtitle, extra } = {}) {
  return h('header', { class: 'page-head' },
    h('div', { class: 'page-head-text' },
      h('h1', { class: 'page-title' }, iconName && h('span', { class: 'page-title-icon' }, icon(iconName)), title),
      subtitle && h('p', { class: 'page-sub' }, subtitle),
    ),
    extra,
  );
}

export function chips(items, activeId, hrefFor) {
  return h('div', { class: 'chips', role: 'tablist' },
    items.map((c) => h('a', {
      class: `chip${c.id === activeId ? ' active' : ''}`,
      href: hrefFor(c.id),
      role: 'tab',
      'aria-selected': String(c.id === activeId),
    }, c.label)),
  );
}

// ─── मोडल (पॉप-अप) ───────────────────────────────────────────────
export function modal({ title, body }) {
  const lastFocus = document.activeElement;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'बंद करें', onClick: () => close() }, icon('x'));
  const dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', null, title), closeBtn),
    h('div', { class: 'modal-body' }, body),
  );
  const overlay = h('div', { class: 'modal-overlay', onClick: (e) => { if (e.target === overlay) close(); } }, dialog);
  function close() {
    overlay.classList.remove('show');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 200);
    lastFocus?.focus?.();
  }
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => overlay.classList.add('show'));
  closeBtn.focus();
  return close;
}

// ─── QR कोड (फ़ोन से स्कैन करके तुरंत खोलें — "कहीं भी दिखाओ") ─────
export async function openQr(url, title = 'फ़ोन पर खोलें') {
  let svg;
  try {
    const { qrcode } = await import('./vendor/qrcode.min.js');
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    const pad = 3;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
    }
    const NS = 'http://www.w3.org/2000/svg';
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${n + pad * 2} ${n + pad * 2}`);
    svg.setAttribute('class', 'qr-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'QR कोड');
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#fff');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', '#111');
    svg.append(bg, path);
  } catch (err) {
    console.warn('[चित्रपट] QR नहीं बन पाया', err);
    toast('QR कोड नहीं बन पाया', { type: 'error' });
    return;
  }
  modal({
    title,
    body: h('div', { class: 'qr-box' },
      svg,
      h('p', { class: 'qr-help' }, 'फ़ोन के कैमरे से स्कैन करें — ऐप तुरंत खुल जाएगा।'),
      h('p', { class: 'qr-url' }, url),
    ),
  });
}
