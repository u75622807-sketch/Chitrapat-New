/**
 * ⚙️ चित्रपट (Chitrapat) — सारी सेटिंग्स इसी एक फ़ाइल में हैं।
 * Firebase / Cloudinary / डेमो वीडियो वगैरह बदलने के लिए सिर्फ़ यही फ़ाइल बदलें।
 *
 * 🔐 सुरक्षा से जुड़ी ज़रूरी बातें:
 *  - Firebase का यह "web config" पब्लिक होता है, इसे छुपाने की ज़रूरत नहीं होती।
 *    असली सुरक्षा Firestore Security Rules (firestore.rules फ़ाइल) और
 *    Google Cloud Console में API key पर लगी पाबंदी (सिर्फ़ आपका डोमेन) से होती है।
 *  - Cloudinary का API SECRET कभी भी इस फ़ाइल में (या किसी भी फ़्रंटएंड कोड में) न डालें।
 */
export const CONFIG = {
  appName: 'चित्रपट',
  appNameLatin: 'Chitrapat',
  version: '2.0.0',

  // आपकी लाइव साइट का पता (शेयर-लिंक और QR कोड के लिए)
  siteUrl: 'https://u75622807-sketch.github.io/Chitrapat-New/',

  // 🔥 Firebase (Firestore में वीडियो की जानकारी सेव होती है)
  firebase: {
    apiKey: 'AIzaSyB7LMSFYn4KkQXgH95hJJOrXIIlZ_lKQ0k',
    authDomain: 'metube-33da9.firebaseapp.com',
    projectId: 'metube-33da9',
    storageBucket: 'metube-33da9.firebasestorage.app',
    messagingSenderId: '619272225238',
    appId: '1:619272225238:web:e5f22447330dbb7584e477',
    measurementId: 'G-B6B7V6T08Z',
  },
  firebaseSdkVersion: '11.6.1',

  // आपका पुराना डेटा इसी पाथ पर है: artifacts/metube-app-id/public/data/videos
  // (इसे बदलेंगे तो पुराने अपलोड किए हुए वीडियो नहीं दिखेंगे)
  firestoreAppId: 'metube-app-id',

  // ☁️ Cloudinary (असली वीडियो फ़ाइल यहाँ अपलोड होती है — "unsigned" preset)
  cloudinary: {
    cloudName: 'dw1ksfmm7',
    uploadPreset: 'metube_final_video',
  },

  // अपलोड की अधिकतम साइज़ (Cloudinary के फ़्री प्लान में वीडियो की सीमा 100MB है)
  maxUploadMB: 100,

  // true = आपके वीडियो के साथ कुछ डेमो वीडियो भी दिखेंगे,
  // ताकि ऐप कभी खाली न लगे और बिना सर्वर के भी कहीं भी दिखाया जा सके।
  showDemoVideos: true,

  // Google Analytics (खाली '' कर देंगे तो Analytics बंद हो जाएगा)
  analyticsId: 'G-B6B7V6T08Z',

  // सर्वर से जुड़ने के लिए कितनी देर इंतज़ार करें (मिलीसेकंड)
  backendTimeoutMs: 12000,
};
