// js/backend.js — Firebase (Firestore + Anonymous Login) और Cloudinary अपलोड
//
// पुरानी गड़बड़ी: Firebase के import सीधे पेज के ऊपर थे। अगर gstatic.com लोड न हो (धीमा नेट,
// ब्लॉक, ऑफ़लाइन) तो पूरा ऐप "Chitrapat शुरू हो रहा है..." पर हमेशा के लिए अटक जाता था।
// अब Firebase "dynamic import" से पीछे-पीछे लोड होता है — ऐप तुरंत खुलता है, और सर्वर न मिले
// तो डेमो मोड में चलता रहता है।
import { CONFIG } from '../config.js';
import { state, emit, setBackend } from './store.js';
import { safeUrl, toDate, withTimeout } from './utils.js';

let fb = null; // { auth, db, fs, user }
let connecting = null;

const VIDEOS_PATH = () => ['artifacts', CONFIG.firestoreAppId, 'public', 'data', 'videos'];

export function isLive() {
  return state.backend.status === 'live' && !!fb;
}

export function canUploadToServer() {
  return isLive() && !!fb.user && !!CONFIG.cloudinary?.cloudName && !!CONFIG.cloudinary?.uploadPreset;
}

function friendlyError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err || '');
  if (code === 'permission-denied' || /insufficient permissions/i.test(msg)) {
    return 'Firestore Rules ने डेटा पढ़ने की अनुमति नहीं दी (permission-denied)';
  }
  if (code.includes('admin-restricted-operation') || code.includes('operation-not-allowed')) {
    return 'Firebase में Anonymous Sign-in चालू नहीं है';
  }
  if (/dynamically imported module|failed to fetch|importing a module script failed|error loading dynamically/i.test(msg)) {
    return 'Firebase लोड नहीं हो पाया (इंटरनेट धीमा है या कोई ऐड-ब्लॉकर रोक रहा है)';
  }
  if (code === 'unavailable' || /offline|network/i.test(msg)) return 'नेटवर्क उपलब्ध नहीं है';
  return msg.slice(0, 140) || 'अज्ञात त्रुटि';
}

export function connectBackend() {
  if (connecting) return connecting;
  connecting = doConnect().finally(() => { connecting = null; });
  return connecting;
}

async function doConnect() {
  const cfg = CONFIG.firebase;
  if (!cfg?.apiKey || !cfg?.projectId) {
    setBackend('demo', 'Firebase कॉन्फ़िग नहीं मिला');
    return;
  }
  if (!navigator.onLine) {
    setBackend('demo', 'आप ऑफ़लाइन हैं');
    return;
  }
  if (fb) { listenVideos(); return; }

  setBackend('connecting', 'सर्वर से जुड़ रहे हैं…');
  const base = `https://www.gstatic.com/firebasejs/${CONFIG.firebaseSdkVersion}`;
  try {
    const [appMod, authMod, fsMod] = await withTimeout(
      Promise.all([
        import(`${base}/firebase-app.js`),
        import(`${base}/firebase-auth.js`),
        import(`${base}/firebase-firestore.js`),
      ]),
      CONFIG.backendTimeoutMs,
      'Firebase SDK लोड नहीं हो पाया',
    );
    const app = appMod.initializeApp(cfg);
    fb = { auth: authMod.getAuth(app), db: fsMod.getFirestore(app), fs: fsMod, user: null };

    try {
      const cred = await withTimeout(authMod.signInAnonymously(fb.auth), CONFIG.backendTimeoutMs, 'लॉगिन में ज़्यादा समय लगा');
      fb.user = cred.user;
    } catch (err) {
      // लॉगिन न हो तब भी पढ़ने की कोशिश करेंगे (अगर Rules पब्लिक रीड की इजाज़त दें)
      console.warn('[चित्रपट] Anonymous login नहीं हुआ:', err);
      fb.authError = friendlyError(err);
    }
    listenVideos();
  } catch (err) {
    console.warn('[चित्रपट] सर्वर से कनेक्शन नहीं हुआ:', err);
    setBackend('demo', friendlyError(err));
  }
}

function normalize(id, d) {
  const url = safeUrl(d.url);
  if (!url) return null;
  const name = String(d.userName || '').trim();
  return {
    id,
    title: String(d.title || 'बिना शीर्षक').slice(0, 150),
    description: String(d.description || '').slice(0, 5000),
    category: String(d.category || 'other'),
    userId: String(d.userId || ''),
    userName: !name || name === 'Anonymous User' ? 'चित्रपट क्रिएटर' : name.slice(0, 60),
    url,
    thumbnailUrl: typeof d.thumbnailUrl === 'string' ? d.thumbnailUrl : '',
    views: Math.max(0, Number(d.views) || 0),
    likes: Math.max(0, Number(d.likes) || 0),
    duration: Number(d.duration) || null,
    timestamp: toDate(d.timestamp) || new Date(0),
  };
}

function listenVideos() {
  const { fs, db } = fb;
  fb.unsub?.();
  const q = fs.query(fs.collection(db, ...VIDEOS_PATH()), fs.orderBy('timestamp', 'desc'), fs.limit(100));
  let gotFirst = false;
  const timer = setTimeout(() => {
    if (!gotFirst) setBackend('demo', 'सर्वर से जवाब नहीं मिला');
  }, CONFIG.backendTimeoutMs);

  fb.unsub = fs.onSnapshot(q, (snap) => {
    gotFirst = true;
    clearTimeout(timer);
    state.remoteVideos = snap.docs
      .map((doc) => normalize(doc.id, doc.data({ serverTimestamps: 'estimate' })))
      .filter(Boolean);
    const n = state.remoteVideos.length;
    setBackend('live', n ? `सर्वर से जुड़ा • ${n} वीडियो` : 'सर्वर से जुड़ा • अभी कोई वीडियो नहीं');
    emit('videos');
  }, (err) => {
    clearTimeout(timer);
    console.warn('[चित्रपट] Firestore त्रुटि:', err);
    const reason = fb.authError && err?.code === 'permission-denied' ? fb.authError : friendlyError(err);
    setBackend('demo', reason);
  });
}

/** व्यू +1 (हर सेशन में एक वीडियो पर सिर्फ़ एक बार) */
export async function incrementViews(videoId) {
  if (!isLive()) return false;
  const key = `cp_viewed_${videoId}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
  } catch { /* ignore */ }
  const { fs, db } = fb;
  try {
    await fs.updateDoc(fs.doc(db, ...VIDEOS_PATH(), videoId), { views: fs.increment(1) });
    return true;
  } catch (err) {
    console.warn('[चित्रपट] व्यू अपडेट नहीं हुआ:', err);
    return false;
  }
}

/** लाइक +1 / -1 */
export async function changeLikes(videoId, delta) {
  if (!isLive()) return false;
  const { fs, db } = fb;
  try {
    await fs.updateDoc(fs.doc(db, ...VIDEOS_PATH(), videoId), { likes: fs.increment(delta) });
    return true;
  } catch (err) {
    console.warn('[चित्रपट] लाइक अपडेट नहीं हुआ:', err);
    return false;
  }
}

/**
 * Cloudinary पर वीडियो अपलोड (XHR — ताकि प्रगति % दिखा सकें)
 * @returns {{ promise: Promise<object>, abort: () => void }}
 */
export function uploadToCloudinary(file, onProgress) {
  const { cloudName, uploadPreset } = CONFIG.cloudinary;
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', uploadPreset);
    form.append('tags', 'chitrapat');

    const started = Date.now();
    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable) return;
      const secs = Math.max(0.5, (Date.now() - started) / 1000);
      const speed = e.loaded / secs; // bytes/sec
      onProgress?.({
        loaded: e.loaded,
        total: e.total,
        percent: Math.min(100, Math.round((e.loaded / e.total) * 100)),
        speed,
        eta: speed > 0 ? Math.round((e.total - e.loaded) / speed) : null,
      });
    });
    xhr.addEventListener('load', () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300 && data?.secure_url) resolve(data);
      else reject(new Error(`Cloudinary अपलोड विफल (${xhr.status}): ${data?.error?.message || xhr.statusText || 'अज्ञात त्रुटि'}`));
    });
    xhr.addEventListener('error', () => reject(new Error('नेटवर्क की दिक़्क़त से अपलोड नहीं हो पाया')));
    xhr.addEventListener('abort', () => reject(Object.assign(new Error('अपलोड रद्द कर दिया गया'), { name: 'AbortError' })));
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

/** Firestore में वीडियो की जानकारी सेव करें — नए डॉक्यूमेंट की id लौटाता है */
export async function saveVideoDoc(meta) {
  if (!canUploadToServer()) throw new Error('सर्वर से कनेक्शन नहीं है');
  const { fs, db } = fb;
  const ref = await fs.addDoc(fs.collection(db, ...VIDEOS_PATH()), {
    ...meta,
    userId: fb.user.uid,
    views: 0,
    likes: 0,
    timestamp: fs.serverTimestamp(),
  });
  return ref.id;
}
