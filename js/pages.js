// js/pages.js — ऐप के सारे पेज (होम, ट्रेंडिंग, वीडियो प्लेयर, अपलोड, लाइब्रेरी…)
// हर पेज एक फ़ंक्शन है जो { node, title, onData, destroy } लौटाता है।
import { CONFIG } from '../config.js';
import {
  h, icon, formatViews, formatCount, timeAgo, formatDate, formatBytes, thumbOf, sourcesOf,
  cloudinaryVideoUrl, linkify, copyText, isTyping, load, save, hueFrom,
} from './utils.js';
import * as store from './store.js';
import { state } from './store.js';
import { CATEGORIES, DEMO_VIDEOS, categoryLabel } from './demo-data.js';
import { isLive, canUploadToServer, incrementViews, changeLikes, uploadToCloudinary, saveVideoDoc } from './backend.js';
import {
  toast, avatar, thumbnail, videoRow, grid, rows, skeletonGrid, emptyState, pageHeader, chips,
  watchHref, channelHref, openQr,
} from './ui.js';
import { canInstall, promptInstall, isStandalone, isIOS, onInstallChange } from './pwa.js';

// ─── सामान्य पेज: डेटा बदलने पर अपने-आप दोबारा बनता है ────────────────
function simple(build, { title, events = ['videos'] } = {}) {
  const node = h('div', { class: 'page' });
  let cleanups = [];
  const track = (fn) => { if (typeof fn === 'function') cleanups.push(fn); };
  const runCleanups = () => {
    cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    cleanups = [];
  };
  const draw = () => {
    runCleanups();
    node.replaceChildren(...[build(track)].flat(Infinity).filter(Boolean));
  };
  draw();
  return { node, title, onData: (type) => { if (events.includes(type)) draw(); }, destroy: runCleanups };
}

const appUrl = () => `${location.origin}${location.pathname}`;
const videoUrl = (v) => `${appUrl()}#/watch/${encodeURIComponent(v.id)}`;
const catHref = (id) => (id === 'all' ? '#/' : `#/?c=${encodeURIComponent(id)}`);

function section(title, ...content) {
  return h('section', { class: 'section' }, h('h2', { class: 'section-title' }, title), content);
}

function subscribeButton(name) {
  const btn = h('button', { class: 'btn btn-sub', type: 'button' });
  const paint = () => {
    const on = store.isSubscribed(name);
    btn.classList.toggle('subscribed', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.replaceChildren(icon(on ? 'check' : 'bell'), on ? 'सब्सक्राइब्ड' : 'सब्सक्राइब');
  };
  btn.addEventListener('click', () => {
    const on = store.toggleSubscribe(name);
    paint();
    toast(on ? `"${name}" को सब्सक्राइब किया 🔔` : `"${name}" से अनसब्सक्राइब किया`, { type: on ? 'success' : 'info' });
  });
  paint();
  return btn;
}

async function toggleLikeFor(v) {
  const on = store.toggleLike(v.id);
  if (!v.demo && !v.local) {
    const ok = await changeLikes(v.id, on ? 1 : -1);
    if (!ok) {
      store.toggleLike(v.id); // वापस पहले जैसा
      toast('पसंद सर्वर पर सेव नहीं हो पाई', { type: 'error' });
      return !on;
    }
  }
  return on;
}

async function shareVideo(v) {
  if (v.local) {
    toast('लोकल (डेमो) वीडियो शेयर नहीं हो सकता — सर्वर पर अपलोड करें', { type: 'error' });
    return;
  }
  const url = videoUrl(v);
  if (navigator.share) {
    try {
      await navigator.share({ title: v.title, text: `${v.title} — चित्रपट पर देखें`, url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  const ok = await copyText(url);
  toast(ok ? 'लिंक कॉपी हो गया — अब कहीं भी पेस्ट करें 📋' : url, { type: ok ? 'success' : 'info' });
}

// ═════════════════════════════════════════════════════════════
// होम
// ═════════════════════════════════════════════════════════════
function pickFeatured(list) {
  const fresh = list.find((v) => !v.demo && Date.now() - (v.timestamp?.getTime?.() || 0) < 30 * 86400000);
  return fresh || store.trending(list)[0];
}

function hero(v) {
  const saveBtn = h('button', { class: 'btn btn-glass', type: 'button' });
  const paint = () => {
    const on = store.isSaved(v.id);
    saveBtn.replaceChildren(icon(on ? 'check' : 'clock'), on ? 'सेव है' : 'बाद में देखें');
  };
  saveBtn.addEventListener('click', () => {
    const on = store.toggleWatchLater(v.id);
    paint();
    toast(on ? '"बाद में देखें" में जोड़ दिया' : '"बाद में देखें" से हटा दिया', { type: on ? 'success' : 'info' });
  });
  paint();
  return h('section', { class: 'hero', style: { '--h': hueFrom(v.title) } },
    h('a', { class: 'hero-media', href: watchHref(v), tabindex: '-1', 'aria-hidden': 'true' }, thumbnail(v, { size: 'hero', eager: true })),
    h('div', { class: 'hero-shade' }),
    h('div', { class: 'hero-body' },
      h('span', { class: 'hero-kicker' }, icon('zap'), v.demo ? 'आज का ख़ास वीडियो' : 'ताज़ा अपलोड'),
      h('h2', { class: 'hero-title' }, h('a', { href: watchHref(v) }, v.title)),
      h('p', { class: 'hero-meta' }, `${v.userName} • ${formatViews(store.viewsOf(v))} • ${timeAgo(v.timestamp)}`),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'btn btn-grad', href: watchHref(v) }, icon('play'), 'अभी देखें'),
        saveBtn,
      ),
    ),
  );
}

export function homePage(ctx) {
  const cat = ctx.query.get('c') || 'all';
  return simple(() => {
    const all = store.latest();
    if (!all.length) {
      if (state.backend.status === 'connecting') return skeletonGrid(8);
      return emptyState({
        iconName: 'film',
        title: 'अभी कोई वीडियो नहीं है',
        text: 'पहला वीडियो अपलोड करके शुरुआत करें!',
        action: { href: '#/upload', label: 'वीडियो अपलोड करें', icon: 'upload' },
      });
    }
    const present = CATEGORIES.filter((c) => all.some((v) => v.category === c.id));
    const featured = cat === 'all' ? pickFeatured(all) : null;
    const list = cat === 'all' ? all.filter((v) => v !== featured) : all.filter((v) => v.category === cat);
    return [
      featured && hero(featured),
      chips([{ id: 'all', label: 'सभी' }, ...present], cat, catHref),
      list.length
        ? grid(list, { eager: cat !== 'all' })
        : emptyState({ iconName: 'film', title: `"${categoryLabel(cat)}" में अभी कोई वीडियो नहीं`, action: { href: '#/', label: 'सभी वीडियो देखें', icon: 'home' } }),
    ];
  }, { title: cat === 'all' ? '' : categoryLabel(cat) });
}

// ═════════════════════════════════════════════════════════════
// ट्रेंडिंग
// ═════════════════════════════════════════════════════════════
export function trendingPage() {
  return simple(() => {
    const list = store.trending().slice(0, 50);
    return [
      pageHeader('ट्रेंडिंग', { iconName: 'trending', subtitle: 'इस समय सबसे ज़्यादा देखे जा रहे वीडियो' }),
      list.length ? rows(list, { ranked: true }) : state.backend.status === 'connecting' ? skeletonGrid(6) : emptyState({ iconName: 'trending', title: 'अभी कुछ ट्रेंडिंग नहीं' }),
    ];
  }, { title: 'ट्रेंडिंग' });
}

// ═════════════════════════════════════════════════════════════
// सब्सक्रिप्शन
// ═════════════════════════════════════════════════════════════
function channelList(list) {
  return h('div', { class: 'channel-list' }, list.map((c) => h('div', { class: 'channel-item' },
    h('a', { class: 'channel-item-link', href: channelHref(c.name) },
      avatar(c.name, 48, false),
      h('div', null, h('strong', null, c.name), h('small', null, `${c.count} वीडियो • ${formatViews(c.views)}`)),
    ),
    subscribeButton(c.name),
  )));
}

export function subscriptionsPage() {
  return simple(() => {
    const subs = state.subs;
    const head = pageHeader('सब्सक्रिप्शन', { iconName: 'bell', subtitle: 'आपके पसंदीदा चैनलों के वीडियो — एक ही जगह' });
    const others = store.channels().filter((c) => !subs.includes(c.name)).slice(0, 12);
    const suggest = others.length && section(subs.length ? 'और चैनल' : 'इन चैनलों को सब्सक्राइब करें', channelList(others));
    if (!subs.length) {
      return [head, emptyState({ iconName: 'bell', title: 'अभी कोई सब्सक्रिप्शन नहीं', text: 'किसी चैनल को सब्सक्राइब करें — उसके सारे वीडियो यहाँ दिखेंगे।' }), suggest];
    }
    const vids = store.latest().filter((v) => subs.includes(v.userName));
    return [
      head,
      h('div', { class: 'sub-strip' }, subs.map((name) => h('a', { class: 'sub-pill', href: channelHref(name) }, avatar(name, 28, false), h('span', null, name)))),
      vids.length ? grid(vids) : emptyState({ iconName: 'film', title: 'इन चैनलों पर अभी कोई वीडियो नहीं' }),
      suggest,
    ];
  }, { title: 'सब्सक्रिप्शन', events: ['videos', 'local'] });
}

// ═════════════════════════════════════════════════════════════
// चैनल
// ═════════════════════════════════════════════════════════════
export function channelPage(ctx) {
  const name = ctx.params.name || '';
  return simple(() => {
    const vids = store.latest().filter((v) => v.userName === name);
    if (!vids.length) {
      if (state.backend.status === 'connecting') return skeletonGrid(4);
      return emptyState({ iconName: 'user', title: 'यह चैनल नहीं मिला', action: { href: '#/', label: 'होम पर जाएँ', icon: 'home' } });
    }
    const total = vids.reduce((sum, v) => sum + store.viewsOf(v), 0);
    return [
      h('section', { class: 'channel-hero', style: { '--h': hueFrom(name) } },
        avatar(name, 88, false),
        h('div', { class: 'channel-hero-text' },
          h('h1', null, name),
          h('p', null, `${vids.length} वीडियो • कुल ${formatViews(total)}`),
        ),
        subscribeButton(name),
      ),
      grid(vids),
    ];
  }, { title: name });
}

// ═════════════════════════════════════════════════════════════
// लाइब्रेरी (इतिहास / बाद में देखें / पसंद किए गए)
// ═════════════════════════════════════════════════════════════
const LIB_TABS = [
  { id: 'history', label: 'इतिहास', icon: 'history' },
  { id: 'later', label: 'बाद में देखें', icon: 'clock' },
  { id: 'liked', label: 'पसंद किए गए', icon: 'thumbs-up' },
];

export function libraryPage(ctx) {
  const tab = LIB_TABS.some((t) => t.id === ctx.params.tab) ? ctx.params.tab : 'history';
  const tabInfo = LIB_TABS.find((t) => t.id === tab);
  return simple(() => {
    const lists = {
      history: store.resolve(state.history.map((x) => x.id)),
      later: store.resolve(state.watchLater),
      liked: store.resolve(state.liked),
    };
    const list = lists[tab];
    const config = {
      history: {
        onRemove: (v) => store.removeFromHistory(v.id),
        empty: { iconName: 'history', title: 'अभी इतिहास खाली है', text: 'आप जो वीडियो देखेंगे, वो यहाँ दिखेंगे।', action: { href: '#/', label: 'वीडियो देखें', icon: 'home' } },
      },
      later: {
        onRemove: (v) => { store.toggleWatchLater(v.id); toast('"बाद में देखें" से हटा दिया'); },
        empty: { iconName: 'clock', title: 'कोई वीडियो सेव नहीं है', text: 'किसी भी वीडियो पर ⏰ बटन दबाकर उसे बाद के लिए सेव करें।', action: { href: '#/', label: 'वीडियो देखें', icon: 'home' } },
      },
      liked: {
        onRemove: (v) => { toggleLikeFor(v); },
        empty: { iconName: 'thumbs-up', title: 'अभी कोई पसंदीदा वीडियो नहीं', text: 'वीडियो पर 👍 दबाएँ — वो यहाँ दिखेगा।', action: { href: '#/trending', label: 'ट्रेंडिंग देखें', icon: 'trending' } },
      },
    }[tab];

    const clearBtn = tab === 'history' && list.length && h('button', {
      class: 'btn btn-ghost',
      type: 'button',
      onClick: () => {
        if (confirm('क्या आप पूरा इतिहास मिटाना चाहते हैं?')) {
          store.clearHistory();
          toast('इतिहास साफ़ कर दिया');
        }
      },
    }, icon('trash'), 'इतिहास साफ़ करें');

    return [
      pageHeader('लाइब्रेरी', { iconName: 'layers', subtitle: 'यह जानकारी सिर्फ़ इसी डिवाइस/ब्राउज़र में सेव रहती है', extra: clearBtn }),
      h('div', { class: 'tabs', role: 'tablist' }, LIB_TABS.map((t) => h('a', {
        class: `tab${t.id === tab ? ' active' : ''}`,
        href: `#/library/${t.id}`,
        role: 'tab',
        'aria-selected': String(t.id === tab),
      }, icon(t.icon), h('span', null, t.label), h('span', { class: 'tab-count' }, String(lists[t.id].length))))),
      list.length ? rows(list, { onRemove: config.onRemove }) : emptyState(config.empty),
    ];
  }, { title: tabInfo.label, events: ['videos', 'local'] });
}

// ═════════════════════════════════════════════════════════════
// खोज
// ═════════════════════════════════════════════════════════════
function categoryShortcuts() {
  const present = CATEGORIES.filter((c) => store.allVideos().some((v) => v.category === c.id));
  return present.length && section('श्रेणियाँ', chips(present, null, catHref));
}

export function searchPage(ctx) {
  const q = (ctx.query.get('q') || '').trim();
  return simple(() => {
    if (!q) {
      return [
        pageHeader('खोजें', { iconName: 'search' }),
        emptyState({ iconName: 'search', title: 'क्या देखना चाहेंगे?', text: 'ऊपर सर्च बॉक्स में वीडियो का नाम, चैनल या श्रेणी लिखें — हिंदी या English दोनों चलेंगे।' }),
        categoryShortcuts(),
      ];
    }
    const results = store.searchVideos(q);
    return [
      pageHeader(`“${q}” के नतीजे`, { iconName: 'search', subtitle: results.length ? `${results.length} वीडियो मिले` : 'कोई वीडियो नहीं मिला' }),
      results.length
        ? rows(results)
        : emptyState({ iconName: 'search', title: 'कुछ नहीं मिला 😕', text: 'दूसरे शब्दों से खोजकर देखें, या नीचे कोई श्रेणी चुनें।' }),
      !results.length && categoryShortcuts(),
    ];
  }, { title: q ? `${q} — खोज` : 'खोजें' });
}

// ═════════════════════════════════════════════════════════════
// वीडियो प्लेयर (Watch)
// ═════════════════════════════════════════════════════════════
function watchSkeleton() {
  return h('div', { class: 'watch', 'aria-busy': 'true' },
    h('div', { class: 'watch-main' },
      h('div', { class: 'player sk' }),
      h('div', { class: 'sk sk-line', style: { width: '70%', height: '22px', marginTop: '16px' } }),
      h('div', { class: 'sk sk-line short', style: { marginTop: '10px' } }),
    ),
  );
}

function descriptionBox(v) {
  const text = v.description || 'इस वीडियो का कोई विवरण नहीं है।';
  const box = h('div', { class: 'desc' },
    h('div', { class: 'desc-meta' },
      h('span', { class: 'desc-stats' }, `${formatViews(store.viewsOf(v))} • ${formatDate(v.timestamp)}`),
      h('a', { class: 'desc-cat', href: catHref(v.category) }, `#${categoryLabel(v.category)}`),
    ),
    h('div', { class: 'desc-body' }, linkify(text)),
  );
  if (text.length > 220 || text.split('\n').length > 4) {
    box.classList.add('collapsed');
    const more = h('button', {
      class: 'desc-more',
      type: 'button',
      onClick: () => {
        const collapsed = box.classList.toggle('collapsed');
        more.textContent = collapsed ? 'और पढ़ें' : 'कम दिखाएँ';
      },
    }, 'और पढ़ें');
    box.append(more);
  }
  return box;
}

function autoplaySwitch() {
  const input = h('input', { type: 'checkbox', checked: state.autoplay, 'aria-label': 'ऑटोप्ले' });
  input.addEventListener('change', () => {
    store.setAutoplay(input.checked);
    toast(input.checked ? 'ऑटोप्ले चालू — अगला वीडियो अपने-आप चलेगा' : 'ऑटोप्ले बंद');
  });
  return h('label', { class: 'switch', title: 'वीडियो ख़त्म होने पर अगला अपने-आप चले' },
    h('span', null, 'ऑटोप्ले'), input, h('span', { class: 'switch-track', 'aria-hidden': 'true' }));
}

export function watchPage(ctx) {
  const id = ctx.params.id;
  const node = h('div', { class: 'page page-watch' });
  const cleanups = [];
  let built = false;
  let refs = {};

  function build() {
    const v = store.getVideo(id);
    if (!v) {
      node.replaceChildren(state.backend.status === 'connecting'
        ? watchSkeleton()
        : emptyState({ iconName: 'film', title: 'यह वीडियो नहीं मिला', text: 'हो सकता है वीडियो हटा दिया गया हो या लिंक ग़लत हो।', action: { href: '#/', label: 'होम पर जाएँ', icon: 'home' } }));
      return;
    }
    built = true;
    document.title = `${v.title} • ${CONFIG.appName}`;
    store.addToHistory(v.id);

    // ── प्लेयर ──
    const video = h('video', { class: 'player-video', controls: true, playsInline: true, preload: 'metadata', poster: thumbOf(v, 'poster') || null });
    video.setAttribute('playsinline', '');
    const sources = sourcesOf(v);
    sources.forEach((src) => video.append(h('source', { src })));
    const player = h('div', { class: 'player' }, video);

    const lastSource = video.lastElementChild;
    lastSource?.addEventListener('error', () => {
      if (player.querySelector('.player-error')) return;
      const box = h('div', { class: 'player-error', role: 'alert' }, icon('alert'),
        h('p', null, 'यह वीडियो अभी चल नहीं पा रहा। इंटरनेट कनेक्शन चेक करके दोबारा कोशिश करें।'),
        h('button', {
          class: 'btn btn-glass',
          type: 'button',
          onClick: () => { box.remove(); video.load(); video.play().catch(() => {}); },
        }, 'दोबारा कोशिश करें'));
      player.append(box);
    });

    let counted = false;
    video.addEventListener('play', () => {
      if (counted) return;
      counted = true;
      if (v.demo || v.local) {
        store.addLocalView(v.id);
        paintStats(store.getVideo(id) || v);
      } else {
        incrementViews(v.id);
      }
    });
    video.addEventListener('loadedmetadata', () => {
      if (!v.duration && Number.isFinite(video.duration)) v.duration = video.duration;
    });

    // ── वीडियो ख़त्म होने पर अगला वीडियो (ऑटोप्ले) ──
    video.addEventListener('ended', () => {
      if (!state.autoplay) return;
      const next = store.upNext(v, 1)[0];
      if (!next) return;
      let n = 5;
      const counter = h('strong', null, String(n));
      const overlay = h('div', { class: 'next-overlay' },
        h('p', { class: 'next-kicker' }, 'अगला वीडियो ', counter, ' सेकंड में'),
        h('p', { class: 'next-title' }, next.title),
        h('div', { class: 'next-actions' },
          h('button', { class: 'btn btn-glass', type: 'button', onClick: () => cancel() }, 'रद्द करें'),
          h('a', { class: 'btn btn-grad', href: watchHref(next) }, icon('play'), 'अभी चलाएँ'),
        ),
      );
      player.append(overlay);
      const timer = setInterval(() => {
        n -= 1;
        counter.textContent = String(n);
        if (n <= 0) { clearInterval(timer); location.hash = watchHref(next); }
      }, 1000);
      function cancel() { clearInterval(timer); overlay.remove(); }
      cleanups.push(cancel);
    });

    // ── कीबोर्ड शॉर्टकट ──
    const onKey = (e) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const onVideo = e.target === video;
      if (key === 'k' || (key === ' ' && !onVideo && !['BUTTON', 'A'].includes(e.target.tagName))) {
        e.preventDefault();
        if (video.paused) video.play().catch(() => {}); else video.pause();
      } else if (key === 'f') {
        e.preventDefault();
        if (document.fullscreenElement) document.exitFullscreen?.();
        else if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
        else video.webkitEnterFullscreen?.();
      } else if (key === 'm') {
        video.muted = !video.muted;
        toast(video.muted ? 'आवाज़ बंद 🔇' : 'आवाज़ चालू 🔊');
      } else if (key === 'arrowright' && !onVideo) {
        video.currentTime = Math.min(video.duration || video.currentTime + 5, video.currentTime + 5);
      } else if (key === 'arrowleft' && !onVideo) {
        video.currentTime = Math.max(0, video.currentTime - 5);
      }
    };
    document.addEventListener('keydown', onKey);
    cleanups.push(() => document.removeEventListener('keydown', onKey));

    // ── जानकारी + बटन ──
    const statsEl = h('span', { class: 'watch-stats' });
    const likeCount = h('span', { class: 'action-count' });
    const likeBtn = h('button', { class: 'action-btn', type: 'button', 'aria-label': 'पसंद करें' }, icon('thumbs-up'), likeCount);
    likeBtn.addEventListener('click', async () => {
      likeBtn.disabled = true;
      const on = await toggleLikeFor(v);
      likeBtn.disabled = false;
      paintLike(store.getVideo(id) || v);
      if (on) toast('आपको यह वीडियो पसंद आया 👍', { type: 'success' });
    });

    const saveBtn = h('button', { class: 'action-btn', type: 'button' });
    const paintSave = () => {
      const on = store.isSaved(v.id);
      saveBtn.classList.toggle('active', on);
      saveBtn.setAttribute('aria-pressed', String(on));
      saveBtn.replaceChildren(icon(on ? 'check' : 'clock'), h('span', null, on ? 'सेव है' : 'बाद में देखें'));
    };
    saveBtn.addEventListener('click', () => {
      const on = store.toggleWatchLater(v.id);
      paintSave();
      toast(on ? '"बाद में देखें" में जोड़ दिया' : '"बाद में देखें" से हटा दिया', { type: on ? 'success' : 'info' });
    });
    paintSave();

    const shareBtn = h('button', { class: 'action-btn', type: 'button', onClick: () => shareVideo(v) }, icon('share'), h('span', null, 'शेयर'));
    const qrBtn = !v.local && h('button', {
      class: 'action-btn',
      type: 'button',
      title: 'QR कोड — फ़ोन से स्कैन करके यही वीडियो खोलें',
      onClick: () => openQr(videoUrl(v), 'फ़ोन पर यह वीडियो खोलें'),
    }, icon('smartphone'), h('span', null, 'QR'));

    const channelCount = store.allVideos().filter((x) => x.userName === v.userName).length;
    const upnextList = h('div', { class: 'upnext-list' });

    refs = { statsEl, likeBtn, likeCount, upnextList, video };

    node.replaceChildren(h('div', { class: 'watch' },
      h('div', { class: 'watch-main' },
        player,
        h('div', { class: 'watch-info' },
          h('h1', { class: 'watch-title' }, v.title),
          h('div', { class: 'watch-sub' }, statsEl, v.local && h('span', { class: 'pill-warn' }, 'लोकल डेमो — सिर्फ़ इस टैब में')),
          h('div', { class: 'watch-bar' },
            h('div', { class: 'watch-channel' },
              avatar(v.userName, 44),
              h('div', { class: 'watch-channel-text' },
                h('a', { class: 'watch-channel-name', href: channelHref(v.userName) }, v.userName),
                h('small', null, `${channelCount} वीडियो`),
              ),
              subscribeButton(v.userName),
            ),
            h('div', { class: 'watch-actions' }, likeBtn, saveBtn, shareBtn, qrBtn),
          ),
          descriptionBox(v),
        ),
      ),
      h('aside', { class: 'watch-side', 'aria-label': 'आगे देखें' },
        h('div', { class: 'upnext-head' }, h('h2', null, 'आगे देखें'), autoplaySwitch()),
        upnextList,
      ),
    ));

    paintStats(v);
    paintLike(v);
    paintUpNext(v);
    requestAnimationFrame(() => video.play().catch(() => { /* ऑटोप्ले ब्लॉक — यूज़र ख़ुद ▶ दबाएगा */ }));
  }

  function paintStats(v) {
    refs.statsEl.textContent = `${formatViews(store.viewsOf(v))} • ${timeAgo(v.timestamp)}`;
  }
  function paintLike(v) {
    const on = store.isLiked(v.id);
    refs.likeBtn.classList.toggle('active', on);
    refs.likeBtn.setAttribute('aria-pressed', String(on));
    refs.likeCount.textContent = formatCount(store.likesOf(v));
  }
  function paintUpNext(v) {
    refs.upnextList.replaceChildren(...store.upNext(v).map((x) => videoRow(x, { compact: true })));
  }

  build();
  return {
    node,
    onData(type) {
      if (!built) {
        if (type === 'videos' || type === 'backend') build();
        return;
      }
      if (type === 'videos') {
        const v = store.getVideo(id);
        if (v) { paintStats(v); paintLike(v); paintUpNext(v); }
      }
    },
    destroy() {
      cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
      const video = refs.video;
      if (video) {
        video.pause();
        video.querySelectorAll('source').forEach((s) => s.remove());
        video.removeAttribute('src');
        video.load();
      }
    },
  };
}

// ═════════════════════════════════════════════════════════════
// अपलोड
// ═════════════════════════════════════════════════════════════
function field(id, label, input, extra) {
  return h('div', { class: 'field' }, h('label', { for: id }, label, extra), input);
}

function etaText(sec) {
  if (sec == null) return '';
  if (sec < 60) return `${sec} सेकंड`;
  return `${Math.ceil(sec / 60)} मिनट`;
}

export function uploadPage() {
  const node = h('div', { class: 'page page-upload' });
  const maxBytes = CONFIG.maxUploadMB * 1024 * 1024;
  let alive = true;
  let file = null;
  let objectUrl = null;
  let urlInUse = false;
  let job = null;
  let meta = {};
  let localThumb = '';

  // सर्वर जुड़ा है या नहीं — उसी हिसाब से संदेश और बटन (सर्वर बाद में जुड़े तो अपने-आप बदलता है)
  const modeNote = h('div', { class: 'note' });
  function paintMode() {
    const serverMode = canUploadToServer();
    modeNote.className = `note ${serverMode ? 'note-ok' : 'note-warn'}`;
    modeNote.replaceChildren(...(serverMode
      ? [icon('check'), h('span', null, 'सर्वर जुड़ा है — आपका वीडियो Cloudinary पर अपलोड होकर सबको दिखेगा।')]
      : [icon('info'), h('span', null,
        h('strong', null, 'डेमो मोड: '),
        `${state.backend.status === 'connecting' ? 'सर्वर से अभी जुड़ रहे हैं…' : `${state.backend.message || 'सर्वर से कनेक्शन नहीं है'}।`} `,
        h('br'),
        'फिर भी आप अपलोड आज़मा सकते हैं — वीडियो सिर्फ़ इसी ब्राउज़र टैब में (लोकल) दिखेगा।')]));
    submitBtn.replaceChildren(icon('upload'), serverMode ? 'अपलोड करें' : 'लोकल डेमो में जोड़ें');
  }

  // ── फ़ाइल चुनना / ड्रैग-ड्रॉप ──
  const fileInput = h('input', { type: 'file', accept: 'video/*', hidden: true });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) pick(fileInput.files[0]); fileInput.value = ''; });

  const drop = h('div', { class: 'dropzone', tabindex: '0', role: 'button', 'aria-label': 'वीडियो फ़ाइल चुनें' },
    h('div', { class: 'dropzone-icon' }, icon('upload-cloud')),
    h('h2', null, 'वीडियो फ़ाइल यहाँ खींचकर छोड़ें'),
    h('p', null, 'या'),
    h('span', { class: 'btn btn-grad' }, icon('film'), 'फ़ाइल चुनें'),
    h('p', { class: 'dropzone-hint' }, `MP4, WebM, MOV • अधिकतम ${CONFIG.maxUploadMB}MB`),
  );
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'dragend'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) pick(f);
  });
  // पेज पर कहीं और फ़ाइल गिरे तो ब्राउज़र उसे खोल न दे
  const stopDrop = (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); };
  window.addEventListener('dragover', stopDrop);
  window.addEventListener('drop', stopDrop);

  // ── फ़ॉर्म ──
  const titleIn = h('input', { id: 'upTitle', type: 'text', maxlength: '100', required: true, placeholder: 'वीडियो का आकर्षक शीर्षक', autocomplete: 'off' });
  const titleCount = h('small', { class: 'count' }, '0/100');
  const syncCount = () => { titleCount.textContent = `${titleIn.value.length}/100`; };
  titleIn.addEventListener('input', syncCount);
  const descIn = h('textarea', { id: 'upDesc', rows: '4', maxlength: '2000', placeholder: 'वीडियो के बारे में कुछ बताएँ (ज़रूरी नहीं)' });
  const catSel = h('select', { id: 'upCat', required: true },
    h('option', { value: '' }, 'श्रेणी चुनें'),
    CATEGORIES.map((c) => h('option', { value: c.id }, c.label)));
  const chanIn = h('input', { id: 'upChannel', type: 'text', maxlength: '40', required: true, placeholder: 'जैसे: उत्कर्ष व्लॉग्स', autocomplete: 'off' });
  chanIn.value = load('cp_channel', '');

  const preview = h('video', { class: 'upload-preview', controls: true, muted: true, playsInline: true, preload: 'metadata' });
  const fileInfo = h('div', { class: 'file-info' });
  const changeBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => fileInput.click() }, icon('film'), 'दूसरी फ़ाइल चुनें');

  const bar = h('div', { class: 'progress-fill' });
  const pct = h('strong', null, '0%');
  const detail = h('span', null, '');
  const progress = h('div', { class: 'progress', hidden: true, 'aria-live': 'polite' },
    h('div', { class: 'progress-top' }, pct, detail),
    h('div', { class: 'progress-bar' }, bar));

  const submitBtn = h('button', { class: 'btn btn-grad', type: 'submit' });
  const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button' }, 'रद्द करें');

  const form = h('form', { class: 'upload-form', hidden: true, novalidate: true },
    h('div', { class: 'upload-grid' },
      h('div', { class: 'upload-side' }, preview, fileInfo, changeBtn),
      h('div', { class: 'upload-fields' },
        field('upTitle', 'शीर्षक *', titleIn, titleCount),
        field('upDesc', 'विवरण', descIn),
        h('div', { class: 'field-row' }, field('upCat', 'श्रेणी *', catSel), field('upChannel', 'चैनल का नाम *', chanIn)),
      ),
    ),
    progress,
    h('div', { class: 'form-actions' }, cancelBtn, submitBtn),
  );

  const warnLeave = (e) => { e.preventDefault(); e.returnValue = ''; };

  function setBusy(busy) {
    [titleIn, descIn, catSel, chanIn, submitBtn, changeBtn].forEach((el) => { el.disabled = busy; });
    progress.hidden = !busy && !job;
    cancelBtn.textContent = busy ? 'अपलोड रोकें' : 'रद्द करें';
    if (busy) window.addEventListener('beforeunload', warnLeave);
    else window.removeEventListener('beforeunload', warnLeave);
  }

  function reset() {
    if (objectUrl && !urlInUse) URL.revokeObjectURL(objectUrl);
    file = null; objectUrl = null; urlInUse = false; meta = {}; localThumb = '';
    preview.removeAttribute('src');
    preview.load();
    form.reset();
    chanIn.value = load('cp_channel', '');
    syncCount();
    bar.style.width = '0%';
    pct.textContent = '0%';
    detail.textContent = '';
    progress.hidden = true;
    form.hidden = true;
    drop.hidden = false;
  }

  function captureThumb() {
    const t = Math.min(1.5, (preview.duration || 3) / 3);
    const onSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 480; canvas.height = 270;
        const g = canvas.getContext('2d');
        const vw = preview.videoWidth || 16;
        const vh = preview.videoHeight || 9;
        const scale = Math.max(480 / vw, 270 / vh);
        g.drawImage(preview, (480 - vw * scale) / 2, (270 - vh * scale) / 2, vw * scale, vh * scale);
        localThumb = canvas.toDataURL('image/jpeg', 0.72);
      } catch { localThumb = ''; }
      preview.currentTime = 0;
    };
    preview.addEventListener('seeked', onSeeked, { once: true });
    preview.currentTime = t;
  }

  function pick(f) {
    if (job) return;
    const isVideo = f.type ? f.type.startsWith('video/') : /\.(mp4|webm|mov|mkv|avi|m4v|3gp)$/i.test(f.name);
    if (!isVideo) { toast('यह वीडियो फ़ाइल नहीं है — कृपया MP4, WebM या MOV चुनें', { type: 'error' }); return; }
    if (f.size > maxBytes) { toast(`फ़ाइल बहुत बड़ी है (${formatBytes(f.size)}) — अधिकतम ${CONFIG.maxUploadMB}MB`, { type: 'error' }); return; }
    if (objectUrl && !urlInUse) URL.revokeObjectURL(objectUrl);
    file = f;
    objectUrl = URL.createObjectURL(f);
    urlInUse = false;
    meta = {};
    localThumb = '';
    preview.src = objectUrl;
    preview.addEventListener('loadedmetadata', () => {
      meta = { duration: preview.duration, width: preview.videoWidth, height: preview.videoHeight };
      captureThumb();
    }, { once: true });
    fileInfo.replaceChildren(icon('film'), h('div', null, h('strong', null, f.name), h('small', null, formatBytes(f.size))));
    if (!titleIn.value) {
      titleIn.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 100);
      syncCount();
    }
    drop.hidden = true;
    form.hidden = false;
    titleIn.focus();
  }

  function addLocal({ title, description, category, channel }) {
    const v = {
      id: `local-${Date.now().toString(36)}`,
      local: true,
      title,
      description,
      category,
      userName: channel,
      url: objectUrl,
      sources: [objectUrl],
      thumbnailUrl: localThumb,
      views: 0,
      likes: 0,
      duration: meta.duration || null,
      timestamp: new Date(),
    };
    urlInUse = true;
    state.localVideos.unshift(v);
    store.emit('videos');
    toast('वीडियो लोकल डेमो में जुड़ गया ✅ (सिर्फ़ इस टैब में)', { type: 'success' });
    file = null;
    objectUrl = null;
    location.hash = watchHref(v);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!file || job) return;
    const title = titleIn.value.trim();
    const description = descIn.value.trim();
    const category = catSel.value;
    const channel = chanIn.value.trim();
    if (!title) { titleIn.focus(); toast('शीर्षक लिखना ज़रूरी है', { type: 'error' }); return; }
    if (!category) { catSel.focus(); toast('कृपया श्रेणी चुनें', { type: 'error' }); return; }
    if (!channel) { chanIn.focus(); toast('चैनल का नाम लिखें', { type: 'error' }); return; }
    save('cp_channel', channel);

    if (!canUploadToServer()) { addLocal({ title, description, category, channel }); return; }

    progress.hidden = false;
    job = uploadToCloudinary(file, (p) => {
      bar.style.width = `${p.percent}%`;
      pct.textContent = `${p.percent}%`;
      detail.textContent = `${formatBytes(p.loaded)} / ${formatBytes(p.total)} • ${formatBytes(p.speed)}/s${p.eta != null && p.percent < 100 ? ` • लगभग ${etaText(p.eta)} बाकी` : ''}`;
    });
    setBusy(true);
    try {
      const res = await job.promise;
      pct.textContent = '100%';
      detail.textContent = 'डेटाबेस में सेव हो रहा है…';
      const docId = await saveVideoDoc({
        title,
        description,
        category,
        userName: channel,
        url: res.secure_url,
        publicId: res.public_id || '',
        thumbnailUrl: cloudinaryVideoUrl(res.secure_url, 'so_2,w_640,h_360,c_fill,q_auto,f_auto', 'jpg'),
        duration: Number(res.duration) || meta.duration || null,
        width: Number(res.width) || meta.width || null,
        height: Number(res.height) || meta.height || null,
        bytes: Number(res.bytes) || file.size,
        format: String(res.format || ''),
      });
      job = null;
      setBusy(false);
      if (alive) {
        toast('वीडियो प्रकाशित हो गया! 🎉', { type: 'success' });
        reset();
        location.hash = `#/watch/${encodeURIComponent(docId)}`;
      } else {
        toast('आपका वीडियो प्रकाशित हो गया 🎉', { type: 'success', action: { label: 'देखें', onClick: () => { location.hash = `#/watch/${encodeURIComponent(docId)}`; } } });
      }
    } catch (err) {
      job = null;
      setBusy(false);
      if (err?.name === 'AbortError') {
        toast('अपलोड रोक दिया गया');
        bar.style.width = '0%';
        pct.textContent = '0%';
        detail.textContent = '';
      } else {
        console.error('[चित्रपट] अपलोड त्रुटि:', err);
        toast(err?.message || 'अपलोड नहीं हो पाया', { type: 'error', timeout: 7000 });
        detail.textContent = err?.message || '';
      }
    }
  }

  form.addEventListener('submit', onSubmit);
  cancelBtn.addEventListener('click', () => {
    if (job) { job.abort(); return; }
    reset();
  });

  paintMode();
  node.append(
    pageHeader('वीडियो अपलोड करें', { iconName: 'upload', subtitle: 'अपना वीडियो दुनिया के साथ शेयर करें' }),
    h('div', { class: 'upload-card' }, modeNote, fileInput, drop, form),
  );

  return {
    node,
    title: 'अपलोड',
    onData(type) {
      if (type === 'backend' && !job) paintMode();
    },
    destroy() {
      alive = false;
      window.removeEventListener('dragover', stopDrop);
      window.removeEventListener('drop', stopDrop);
      if (!job) {
        window.removeEventListener('beforeunload', warnLeave);
        if (objectUrl && !urlInUse) URL.revokeObjectURL(objectUrl);
      }
    },
  };
}

// ═════════════════════════════════════════════════════════════
// ऐप के बारे में (दिखाने/प्रेज़ेंट करने के लिए बढ़िया पेज)
// ═════════════════════════════════════════════════════════════
const FEATURES = [
  ['play', 'वीडियो देखें', 'तेज़ प्लेयर, "आगे देखें" लिस्ट, ऑटोप्ले और कीबोर्ड शॉर्टकट'],
  ['upload-cloud', 'वीडियो अपलोड', 'Cloudinary पर अपलोड, लाइव प्रगति %, स्पीड और बचा हुआ समय'],
  ['search', 'खोज और श्रेणियाँ', 'हिंदी/English में खोजें, श्रेणी से फ़िल्टर करें'],
  ['thumbs-up', 'पसंद, सेव, इतिहास', 'लाइक करें, बाद में देखने के लिए सेव करें, इतिहास देखें'],
  ['bell', 'सब्सक्राइब', 'पसंदीदा चैनल सब्सक्राइब करें और उनके वीडियो एक जगह देखें'],
  ['share', 'शेयर और QR', 'किसी भी वीडियो का लिंक या QR कोड — फ़ोन से स्कैन करके खोलें'],
  ['smartphone', 'मोबाइल ऐप की तरह', 'इंस्टॉल करें (PWA) — ऑफ़लाइन भी खुलता है'],
  ['moon', 'डार्क / लाइट थीम', 'आँखों के आराम के लिए दोनों थीम'],
];

function installBlock(track) {
  const wrap = h('div', { class: 'install-block' });
  const paint = () => {
    if (isStandalone()) {
      wrap.replaceChildren(h('span', { class: 'pill-ok' }, icon('check'), 'ऐप इंस्टॉल है'));
    } else if (canInstall()) {
      wrap.replaceChildren(h('button', {
        class: 'btn btn-grad',
        type: 'button',
        onClick: async () => { const ok = await promptInstall(); if (ok) toast('इंस्टॉल हो रहा है…', { type: 'success' }); },
      }, icon('download'), 'ऐप इंस्टॉल करें'));
    } else {
      wrap.replaceChildren();
    }
  };
  track(onInstallChange(paint));
  return wrap;
}

export function aboutPage() {
  const shareApp = async () => {
    const url = appUrl();
    if (navigator.share) {
      try { await navigator.share({ title: 'चित्रपट — भारत का अपना वीडियो ऐप', url }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    const ok = await copyText(url);
    toast(ok ? 'ऐप का लिंक कॉपी हो गया 📋' : url, { type: ok ? 'success' : 'info' });
  };

  return simple((track) => {
    const live = isLive();
    const remote = state.remoteVideos.length;
    const demos = CONFIG.showDemoVideos ? DEMO_VIDEOS.length : 0;
    return [
      h('section', { class: 'about-hero' },
        h('img', { class: 'about-logo', src: 'icons/icon.svg', alt: '', width: '104', height: '104' }),
        h('h1', null, h('span', { class: 'grad-text' }, 'चित्रपट'), h('small', null, 'Chitrapat • वर्ज़न ' + CONFIG.version)),
        h('p', null, 'भारत का अपना हल्का-फुल्का वीडियो ऐप — वीडियो देखें, अपलोड करें और शेयर करें। मोबाइल, टैबलेट और कंप्यूटर — हर जगह चलता है।'),
        h('div', { class: 'about-actions' },
          installBlock(track),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openQr(appUrl(), 'फ़ोन पर चित्रपट खोलें') }, icon('smartphone'), 'फ़ोन पर खोलें (QR)'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: shareApp }, icon('share'), 'ऐप शेयर करें'),
        ),
      ),
      section('क्या-क्या है इसमें?',
        h('div', { class: 'features' }, FEATURES.map(([ic, title, text]) => h('div', { class: 'feature' },
          h('span', { class: 'feature-icon' }, icon(ic)),
          h('div', null, h('strong', null, title), h('p', null, text)),
        ))),
      ),
      section('सर्वर की स्थिति',
        h('div', { class: 'status-card' },
          h('div', { class: 'kv' }, h('span', null, 'Firebase (डेटाबेस)'), h('strong', { class: live ? 'ok' : 'warn' }, live ? '🟢 जुड़ा हुआ' : state.backend.status === 'connecting' ? '🟡 जुड़ रहा है…' : '🟠 डेमो मोड')),
          h('div', { class: 'kv' }, h('span', null, 'विवरण'), h('strong', null, state.backend.message || '—')),
          h('div', { class: 'kv' }, h('span', null, 'Cloudinary (वीडियो स्टोरेज)'), h('strong', null, CONFIG.cloudinary.cloudName)),
          h('div', { class: 'kv' }, h('span', null, 'वीडियो'), h('strong', null, `${remote} आपके सर्वर से • ${demos} डेमो`)),
        ),
      ),
      section('मोबाइल पर ऐप की तरह इंस्टॉल करें',
        h('ol', { class: 'steps' },
          isIOS()
            ? [h('li', null, 'iPhone पर यह साइट Safari में खोलें।'), h('li', null, 'नीचे "शेयर" (⬆️) बटन दबाएँ।'), h('li', null, '"Add to Home Screen" चुनें — बस! 🎉')]
            : [h('li', null, 'Android पर यह साइट Chrome में खोलें।'), h('li', null, 'ऊपर ⋮ मेन्यू दबाएँ।'), h('li', null, '"ऐप इंस्टॉल करें" / "होम स्क्रीन पर जोड़ें" चुनें — बस! 🎉')],
        ),
      ),
      section('कीबोर्ड शॉर्टकट (कंप्यूटर पर)',
        h('div', { class: 'kbd-list' },
          [['/', 'खोज बॉक्स'], ['K / Space', 'चलाएँ / रोकें'], ['F', 'फ़ुल स्क्रीन'], ['M', 'आवाज़ बंद/चालू'], ['← / →', '5 सेकंड पीछे/आगे'], ['Esc', 'मेन्यू/पॉप-अप बंद']]
            .map(([k, t]) => h('div', { class: 'kbd-item' }, h('kbd', null, k), h('span', null, t))),
        ),
      ),
      section('बनाने वाले',
        h('div', { class: 'credits' },
          h('p', null, h('strong', null, 'Utkarsh Maurya'), ' • © 2025–2026 • सर्वाधिकार सुरक्षित'),
          h('p', { class: 'muted' }, 'बनाया गया: HTML, CSS, JavaScript (बिना किसी फ़्रेमवर्क), Firebase Firestore, Cloudinary, PWA।'),
          h('p', { class: 'muted' }, 'आभार: Mukta फ़ॉन्ट (SIL OFL), Feather आइकन (MIT), qrcode-generator (MIT), डेमो वीडियो — Cloudinary के सार्वजनिक samples।'),
        ),
      ),
    ];
  }, { title: 'ऐप के बारे में', events: ['backend', 'videos'] });
}

// ═════════════════════════════════════════════════════════════
// 404 / त्रुटि
// ═════════════════════════════════════════════════════════════
export function notFoundPage() {
  return simple(() => emptyState({
    iconName: 'alert',
    title: 'यह पेज नहीं मिला',
    text: 'लगता है आप किसी ग़लत लिंक पर आ गए हैं।',
    action: { href: '#/', label: 'होम पर जाएँ', icon: 'home' },
  }), { title: 'पेज नहीं मिला', events: [] });
}

export function errorPage(err) {
  return simple(() => [
    emptyState({ iconName: 'alert', title: 'कुछ गड़बड़ हो गई 😕', text: String(err?.message || err || '') }),
    h('div', { style: { textAlign: 'center' } }, h('button', { class: 'btn btn-grad', type: 'button', onClick: () => location.reload() }, 'पेज दोबारा लोड करें')),
  ], { title: 'त्रुटि', events: [] });
}
