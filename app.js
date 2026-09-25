// app.js — चित्रपट ऐप की शुरुआत: राउटर (पेज बदलना), हेडर/साइडबार, थीम, सर्च, ऑफ़लाइन, PWA
//
// पेज बदलने के लिए "hash" URL इस्तेमाल होते हैं, जैसे:
//   #/                  होम          #/trending        ट्रेंडिंग
//   #/watch/<id>        वीडियो       #/upload          अपलोड
//   #/search?q=...      खोज          #/library/history लाइब्रेरी
// इनका फ़ायदा: GitHub Pages पर बिना किसी सर्वर सेटिंग के हर लिंक शेयर किया जा सकता है।
import { CONFIG } from './config.js';
import { $, $$, debounce, isTyping } from './js/utils.js';
import { state, subscribe } from './js/store.js';
import { connectBackend, isLive } from './js/backend.js';
import { toast } from './js/ui.js';
import { initPwa, onInstallChange, promptInstall } from './js/pwa.js';
import * as pages from './js/pages.js';

const ROUTES = [
  ['/', pages.homePage],
  ['/trending', pages.trendingPage],
  ['/subscriptions', pages.subscriptionsPage],
  ['/library', pages.libraryPage],
  ['/library/:tab', pages.libraryPage],
  ['/upload', pages.uploadPage],
  ['/watch/:id', pages.watchPage],
  ['/search', pages.searchPage],
  ['/channel/:name', pages.channelPage],
  ['/about', pages.aboutPage],
];

const view = $('#view');
let current = null;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, qs = ''] = raw.split('?');
  const path = `/${pathPart.replace(/^\/+|\/+$/g, '')}`;
  return { path, query: new URLSearchParams(qs) };
}

function matchRoute(path) {
  const parts = path.split('/').filter(Boolean);
  for (const [pattern, page] of ROUTES) {
    const pp = pattern.split('/').filter(Boolean);
    if (pp.length !== parts.length) continue;
    const params = {};
    const ok = pp.every((seg, i) => {
      if (seg.startsWith(':')) {
        try { params[seg.slice(1)] = decodeURIComponent(parts[i]); } catch { params[seg.slice(1)] = parts[i]; }
        return true;
      }
      return seg === parts[i];
    });
    if (ok) return { page, params };
  }
  return { page: pages.notFoundPage, params: {} };
}

function render() {
  const { path, query } = parseHash();
  const { page, params } = matchRoute(path);
  try { current?.destroy?.(); } catch (err) { console.error(err); }

  let result;
  try {
    result = page({ params, query, path });
  } catch (err) {
    console.error('[चित्रपट] पेज बनाने में त्रुटि:', err);
    result = pages.errorPage(err);
  }
  current = result;
  view.replaceChildren(result.node);

  if (result.title !== undefined) {
    document.title = result.title ? `${result.title} • ${CONFIG.appName}` : `${CONFIG.appName} — भारत का अपना वीडियो ऐप`;
  }
  setActiveNav(path);
  closeDrawer();
  closeMobileSearch();
  if (path !== '/search') $('#searchInput').value = '';
  window.scrollTo(0, 0);
  trackPageView();
}

function setActiveNav(path) {
  const active = path === '/library' ? '/library/history' : path;
  $$('[data-route]').forEach((a) => {
    const r = a.dataset.route;
    const on = r === '/' ? active === '/' : active === r || active.startsWith(`${r}/`);
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

// ─── साइडबार (मोबाइल पर दराज़ / drawer) ─────────────────────────
const wide = matchMedia('(min-width: 1100px)');
function openDrawer() {
  document.body.classList.add('drawer-open');
  $('#backdrop').hidden = false;
  $('#menuBtn').setAttribute('aria-expanded', 'true');
}
function closeDrawer() {
  document.body.classList.remove('drawer-open');
  $('#backdrop').hidden = true;
  $('#menuBtn').setAttribute('aria-expanded', 'false');
}
function toggleMenu() {
  if (wide.matches) {
    document.body.classList.toggle('sidebar-collapsed');
  } else if (document.body.classList.contains('drawer-open')) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

// ─── सर्च ────────────────────────────────────────────────────────
function openMobileSearch() {
  document.body.classList.add('search-open');
  $('#searchInput').focus();
}
function closeMobileSearch() {
  document.body.classList.remove('search-open');
}
function goSearch(q, replace = false) {
  const hash = q ? `#/search?q=${encodeURIComponent(q)}` : '#/search';
  if (replace) {
    history.replaceState(null, '', hash);
    render();
  } else {
    location.hash = hash;
  }
}

// ─── थीम (डार्क / लाइट) ──────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('cp_theme', theme); } catch { /* ignore */ }
  $('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f6fa' : '#0b0b10');
  $('#themeBtn use')?.setAttribute('href', theme === 'light' ? '#i-moon' : '#i-sun');
  $('#themeBtn')?.setAttribute('aria-label', theme === 'light' ? 'डार्क थीम चालू करें' : 'लाइट थीम चालू करें');
}

// ─── सर्वर स्टेटस (साइडबार में छोटा बिंदु) ───────────────────────
function paintStatus() {
  const el = $('#backendStatus');
  if (!el) return;
  const { status, message } = state.backend;
  el.dataset.status = status;
  $('.status-text', el).textContent = status === 'connecting'
    ? 'सर्वर से जुड़ रहे हैं…'
    : status === 'live' ? message : `डेमो मोड • ${message || 'सर्वर से कनेक्शन नहीं'}`;
  el.title = message;
}

function paintOnline() {
  $('#offlineBar').hidden = navigator.onLine;
}

// ─── Google Analytics (सिर्फ़ असली साइट पर) ───────────────────────
function loadAnalytics() {
  const id = CONFIG.analyticsId;
  if (!id || ['localhost', '127.0.0.1'].includes(location.hostname)) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
  window.gtag('js', new Date());
  window.gtag('config', id, { send_page_view: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(s);
}
function trackPageView() {
  window.gtag?.('event', 'page_view', { page_title: document.title, page_location: location.href });
}

// ─── पुराने लिंक (?source=trending / ?source=upload) को नए पेज पर भेजें ──
function handleLegacyLinks() {
  const source = new URLSearchParams(location.search).get('source');
  if (!location.hash && (source === 'trending' || source === 'upload')) {
    history.replaceState(null, '', `${location.pathname}#/${source}`);
  }
}

function bindUI() {
  $('#menuBtn').addEventListener('click', toggleMenu);
  $('#backdrop').addEventListener('click', closeDrawer);
  wide.addEventListener?.('change', closeDrawer);

  $('#themeBtn').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  });

  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#searchInput').value.trim();
    goSearch(q);
    $('#searchInput').blur();
  });
  $('#searchInput').addEventListener('input', debounce(() => {
    // सर्च पेज पर हों तो टाइप करते-करते नतीजे बदलें
    if (parseHash().path === '/search') goSearch($('#searchInput').value.trim(), true);
  }, 350));
  $('#searchOpen').addEventListener('click', openMobileSearch);
  $('#searchBack').addEventListener('click', closeMobileSearch);

  onInstallChange((can) => { $('#installBtn').hidden = !can; });
  $('#installBtn').addEventListener('click', () => promptInstall());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDrawer();
      closeMobileSearch();
    } else if (e.key === '/' && !isTyping(e.target) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (getComputedStyle($('#searchOpen')).display !== 'none') openMobileSearch();
      else $('#searchInput').focus();
    }
  });

  window.addEventListener('online', () => {
    paintOnline();
    toast('आप फिर से ऑनलाइन हैं ✅', { type: 'success' });
    if (!isLive()) connectBackend();
  });
  window.addEventListener('offline', () => {
    paintOnline();
    toast('इंटरनेट बंद है — ऐप ऑफ़लाइन मोड में है', { type: 'error' });
  });
}

// ─── शुरुआत ──────────────────────────────────────────────────────
subscribe((type) => {
  if (type === 'backend') paintStatus();
  try { current?.onData?.(type); } catch (err) { console.error('[चित्रपट] अपडेट त्रुटि:', err); }
});

applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
bindUI();
paintStatus();
paintOnline();
handleLegacyLinks();
window.addEventListener('hashchange', render);
render();
document.body.classList.add('ready');
initPwa();
connectBackend();
loadAnalytics();
