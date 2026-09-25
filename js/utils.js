// js/utils.js — छोटे-छोटे काम के फ़ंक्शन (DOM, फ़ॉर्मैटिंग, URL सुरक्षा, Cloudinary)

// ─────────────────────────────────────────────────────────────
// DOM हेल्पर
// ⚠️ सुरक्षा: हम कभी भी यूज़र का डेटा innerHTML में नहीं डालते।
//    h() हमेशा textContent / setAttribute इस्तेमाल करता है — इससे XSS नहीं हो सकता।
// ─────────────────────────────────────────────────────────────
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'style' && typeof value === 'object') {
        for (const [prop, val] of Object.entries(value)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, String(val));
          else el.style[prop] = val;
        }
      }
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (['value', 'checked', 'muted', 'playsInline', 'controls', 'autoplay', 'loop', 'disabled', 'selected'].includes(key)) el[key] = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of [children].flat(Infinity)) {
    if (child == null || child === false || child === '') continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** index.html में बने SVG sprite से आइकन बनाता है: icon('home') */
export function icon(name, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ─────────────────────────────────────────────────────────────
// फ़ॉर्मैटिंग (भारतीय अंदाज़: हज़ार / लाख / करोड़)
// ─────────────────────────────────────────────────────────────
function trimNum(n) {
  return (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toString();
}

export function formatCount(num) {
  const n = Math.max(0, Number(num) || 0);
  if (n >= 1e7) return `${trimNum(n / 1e7)} करोड़`;
  if (n >= 1e5) return `${trimNum(n / 1e5)} लाख`;
  if (n >= 1e3) return `${trimNum(n / 1e3)} हज़ार`;
  return String(Math.floor(n));
}

export const formatViews = (n) => `${formatCount(n)} व्यूज़`;

export function toDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts) ? null : ts;
  if (typeof ts.toDate === 'function') return ts.toDate();          // Firestore Timestamp
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d) ? null : d;
}

export function timeAgo(value) {
  const date = toDate(value);
  if (!date) return '';
  const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (s < 45) return 'अभी-अभी';
  const units = [
    [31536000, 'साल'], [2592000, 'महीने'], [604800, 'हफ़्ते'],
    [86400, 'दिन'], [3600, 'घंटे'], [60, 'मिनट'],
  ];
  for (const [sec, label] of units) {
    const v = Math.floor(s / sec);
    if (v >= 1) return `${v} ${label} पहले`;
  }
  return 'अभी-अभी';
}

export function formatDuration(sec) {
  const total = Math.round(Number(sec) || 0);
  if (!total) return '';
  const hrs = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return hrs ? `${hrs}:${String(min).padStart(2, '0')}:${s}` : `${min}:${s}`;
}

export function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

export function formatDate(value) {
  const d = toDate(value);
  if (!d) return '';
  try {
    return d.toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d.toDateString();
  }
}

// ─────────────────────────────────────────────────────────────
// URL सुरक्षा — सिर्फ़ https (और लोकल डेमो के लिए blob:/data:image) की इजाज़त
// ─────────────────────────────────────────────────────────────
export function safeUrl(url, { allowBlob = false, allowDataImage = false } = {}) {
  if (typeof url !== 'string' || !url.trim()) return '';
  const value = url.trim();
  if (allowDataImage && /^data:image\/(png|jpe?g|webp);base64,/i.test(value)) return value;
  try {
    const u = new URL(value, location.href);
    if (u.protocol === 'https:') return u.href;
    if (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)) return u.href;
    if (allowBlob && u.protocol === 'blob:') return value;
  } catch { /* गलत URL */ }
  return '';
}

// ─────────────────────────────────────────────────────────────
// Cloudinary हेल्पर
// पुरानी गड़बड़ी: थंबनेल के लिए '/video/upload/' को '/image/upload/' कर दिया जाता था — जो 404 देता है।
// सही तरीका: '/video/upload/' ही रहने दें, बीच में transformation जोड़ें और एक्सटेंशन '.jpg' कर दें।
// ─────────────────────────────────────────────────────────────
const CLD_VIDEO_RE = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+)$/i;

export function cloudinaryVideoUrl(url, transformation = '', ext = '') {
  const m = typeof url === 'string' && url.match(CLD_VIDEO_RE);
  if (!m) return '';
  let rest = m[2];
  if (ext) rest = /\.[a-z0-9]{2,5}$/i.test(rest) ? rest.replace(/\.[a-z0-9]{2,5}$/i, `.${ext}`) : `${rest}.${ext}`;
  return m[1] + (transformation ? `${transformation}/` : '') + rest;
}

const IMG_RE = /\.(jpe?g|png|webp|avif|gif)(\?.*)?$/i;

/** वीडियो का थंबनेल URL (Cloudinary से अपने-आप बनता है) */
export function thumbOf(video, size = 'card') {
  const saved = safeUrl(video.thumbnailUrl, { allowDataImage: true });
  // पुराने अपलोड में thumbnailUrl गलती से .mp4 था — उसे नज़रअंदाज़ करें
  if (saved && (saved.startsWith('data:image') || IMG_RE.test(saved))) return saved;
  const t = {
    poster: 'so_2,w_1280,h_720,c_pad,b_black,q_auto,f_auto',
    hero: 'so_2,w_1280,h_720,c_fill,q_auto,f_auto',
    small: 'so_2,w_336,h_189,c_fill,q_auto,f_auto',
  }[size] || 'so_2,w_640,h_360,c_fill,q_auto,f_auto';
  return cloudinaryVideoUrl(video.url, t, 'jpg');
}

/** प्लेयर के लिए वीडियो सोर्स (पहला न चले तो ब्राउज़र अपने-आप दूसरा आज़माता है) */
export function sourcesOf(video) {
  if (Array.isArray(video.sources) && video.sources.length) {
    return video.sources.map((u) => safeUrl(u, { allowBlob: true })).filter(Boolean);
  }
  const url = safeUrl(video.url, { allowBlob: true });
  if (!url) return [];
  // .mov / .mkv / .avi जैसी फ़ाइलें हर ब्राउज़र में नहीं चलतीं — Cloudinary से MP4 मँगवाएँ
  if (!/\.(mp4|webm)(\?.*)?$/i.test(url)) {
    const mp4 = cloudinaryVideoUrl(url, '', 'mp4');
    if (mp4 && mp4 !== url) return [mp4, url];
  }
  return [url];
}

// ─────────────────────────────────────────────────────────────
// बाकी छोटे हेल्पर
// ─────────────────────────────────────────────────────────────
/** नाम का पहला अक्षर (हिंदी के लिए सही: "पालतू" → "पा") */
export function firstLetter(str) {
  const s = String(str || '?').trim() || '?';
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter('hi', { granularity: 'grapheme' });
      const first = seg.segment(s)[Symbol.iterator]().next().value;
      if (first) return first.segment.toUpperCase();
    }
  } catch { /* पुराने ब्राउज़र */ }
  return s.charAt(0).toUpperCase();
}

export function hueFrom(str) {
  let hash = 0;
  for (const ch of String(str)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return hash % 360;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function withTimeout(promise, ms, message = 'समय समाप्त') {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]);
}

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* प्राइवेट मोड / स्टोरेज फ़ुल */ }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** खोज के लिए टेक्स्ट को एक जैसा बनाना (छोटे अक्षर, यूनिकोड NFC) */
export function normalizeText(s) {
  return String(s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** विवरण में लिखे https लिंक को क्लिक करने लायक बनाना (सुरक्षित तरीके से) */
export function linkify(text) {
  const parts = [];
  const re = /(https?:\/\/[^\s<>"']+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const url = safeUrl(m[1]);
    parts.push(url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }, m[1]) : m[1]);
    last = m.index + m[1].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function isTyping(target) {
  const el = target || document.activeElement;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}
