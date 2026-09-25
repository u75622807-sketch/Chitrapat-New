// js/store.js — ऐप का सारा डेटा (state) और यूज़र की पसंद (localStorage में सेव)
import { CONFIG } from '../config.js';
import { DEMO_VIDEOS, categoryLabel } from './demo-data.js';
import { load, save, normalizeText, toDate } from './utils.js';

const listeners = new Set();

export const state = {
  remoteVideos: [],                 // Firestore से आए असली वीडियो
  localVideos: [],                  // डेमो-मोड में अपलोड (सिर्फ़ इसी टैब में)
  backend: { status: 'connecting', message: 'सर्वर से जुड़ रहे हैं…' }, // connecting | live | demo
  history: load('cp_history', []),        // [{ id, t }]
  watchLater: load('cp_watch_later', []), // [id]
  liked: load('cp_liked', []),            // [id]
  subs: load('cp_subs', []),              // [channelName]
  localViews: load('cp_local_views', {}), // { id: extraViews } — डेमो वीडियो के लिए
  autoplay: load('cp_autoplay', true),
};

/** type: 'videos' | 'backend' | 'local' */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit(type) {
  for (const fn of listeners) {
    try { fn(type); } catch (e) { console.error('[चित्रपट] listener error', e); }
  }
}

// ─── वीडियो की लिस्ट ───────────────────────────────────────────
export function allVideos() {
  const list = [...state.localVideos, ...state.remoteVideos];
  if (CONFIG.showDemoVideos) list.push(...DEMO_VIDEOS);
  return list;
}

export function getVideo(id) {
  return allVideos().find((v) => v.id === id) || null;
}

export function viewsOf(v) {
  return (Number(v.views) || 0) + (v.demo || v.local ? state.localViews[v.id] || 0 : 0);
}

export function likesOf(v) {
  const base = Number(v.likes) || 0;
  // सर्वर वाले वीडियो में आपकी पसंद पहले से गिनती में जुड़ चुकी होती है
  return v.demo || v.local ? base + (isLiked(v.id) ? 1 : 0) : base;
}

const time = (v) => toDate(v.timestamp)?.getTime() || 0;

export function latest(list = allVideos()) {
  return [...list].sort((a, b) => time(b) - time(a));
}

export function trending(list = allVideos()) {
  return [...list].sort((a, b) => viewsOf(b) - viewsOf(a));
}

export function channels() {
  const map = new Map();
  for (const v of allVideos()) {
    const name = v.userName;
    if (!name) continue;
    const c = map.get(name) || { name, count: 0, views: 0 };
    c.count += 1;
    c.views += viewsOf(v);
    map.set(name, c);
  }
  return [...map.values()].sort((a, b) => b.views - a.views);
}

export function searchVideos(query) {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  if (!terms.length) return [];
  return latest().filter((v) => {
    const hay = normalizeText(`${v.title} ${v.description} ${v.userName} ${categoryLabel(v.category)} ${v.category}`);
    return terms.every((t) => hay.includes(t));
  });
}

export function upNext(current, limit = 12) {
  const others = allVideos().filter((v) => v.id !== current.id);
  const same = trending(others.filter((v) => v.category === current.category));
  const rest = latest(others.filter((v) => v.category !== current.category));
  return [...same, ...rest].slice(0, limit);
}

// ─── यूज़र की पसंद (localStorage) ────────────────────────────────
export const isLiked = (id) => state.liked.includes(id);
export const isSaved = (id) => state.watchLater.includes(id);
export const isSubscribed = (name) => state.subs.includes(name);

function toggleIn(key, arrKey, value) {
  const arr = state[arrKey];
  const i = arr.indexOf(value);
  if (i >= 0) arr.splice(i, 1); else arr.unshift(value);
  save(key, arr);
  emit('local');
  return i < 0;
}

export const toggleLike = (id) => toggleIn('cp_liked', 'liked', id);
export const toggleWatchLater = (id) => toggleIn('cp_watch_later', 'watchLater', id);
export const toggleSubscribe = (name) => toggleIn('cp_subs', 'subs', name);

export function addToHistory(id) {
  state.history = [{ id, t: Date.now() }, ...state.history.filter((x) => x.id !== id)].slice(0, 100);
  save('cp_history', state.history);
}

export function clearHistory() {
  state.history = [];
  save('cp_history', state.history);
  emit('local');
}

export function removeFromHistory(id) {
  state.history = state.history.filter((x) => x.id !== id);
  save('cp_history', state.history);
  emit('local');
}

export function addLocalView(id) {
  state.localViews[id] = (state.localViews[id] || 0) + 1;
  save('cp_local_views', state.localViews);
}

export function setAutoplay(on) {
  state.autoplay = !!on;
  save('cp_autoplay', state.autoplay);
}

export function setBackend(status, message = '') {
  state.backend = { status, message };
  emit('backend');
}

/** id की लिस्ट से वीडियो ऑब्जेक्ट (जो वीडियो अब मौजूद नहीं, उन्हें छोड़ दें) */
export function resolve(ids) {
  const map = new Map(allVideos().map((v) => [v.id, v]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}
