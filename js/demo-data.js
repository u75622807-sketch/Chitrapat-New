// js/demo-data.js — डेमो वीडियो और श्रेणियाँ
// डेमो वीडियो Cloudinary के सार्वजनिक "demo" अकाउंट के sample वीडियो हैं (res.cloudinary.com/demo)।
// इनकी वजह से ऐप बिना सर्वर के भी भरा-भरा दिखता है। बंद करने के लिए config.js में showDemoVideos: false करें।

export const CATEGORIES = [
  { id: 'music', label: 'संगीत' },
  { id: 'gaming', label: 'गेमिंग' },
  { id: 'news', label: 'समाचार' },
  { id: 'tech', label: 'टेक्नोलॉजी' },
  { id: 'education', label: 'शिक्षा' },
  { id: 'nature', label: 'प्रकृति' },
  { id: 'sports', label: 'खेल' },
  { id: 'travel', label: 'यात्रा' },
  { id: 'comedy', label: 'मनोरंजन' },
  { id: 'vlog', label: 'व्लॉग' },
  { id: 'other', label: 'अन्य' },
];

export function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || 'अन्य';
}

const CLD = 'https://res.cloudinary.com/demo/video/upload';
const DAY = 24 * 60 * 60 * 1000;
const NOTE = '\n\n— यह एक डेमो वीडियो है (स्रोत: Cloudinary का सार्वजनिक sample वीडियो)।';

function demo({ id, publicId, title, description, category, channel, views, likes, daysAgo, duration, heavy = false }) {
  const original = `${CLD}/${publicId}.mp4`;
  return {
    id: `demo-${id}`,
    demo: true,
    title,
    description: description + NOTE,
    category,
    userName: channel,
    url: original,
    // 4K वाले वीडियो के लिए पहले हल्का (1280px) वर्ज़न, न चले तो ओरिजिनल
    sources: heavy ? [`${CLD}/w_1280,c_limit,q_auto/${publicId}.mp4`, original] : [original],
    views,
    likes,
    duration,
    timestamp: new Date(Date.now() - daysAgo * DAY),
  };
}

export const DEMO_VIDEOS = [
  demo({
    id: 'elephants', publicId: 'elephants', category: 'nature', channel: 'वन्यजीवन भारत',
    title: 'जंगल के सौम्य दिग्गज: हाथियों का झुंड 🐘',
    description: 'हाथियों के एक झुंड का शांत और सुंदर वीडियो। हाथी अपने परिवार के साथ झुंड में रहते हैं और सबसे समझदार जानवरों में गिने जाते हैं।',
    views: 128400, likes: 5400, daysAgo: 6, duration: 52.6,
  }),
  demo({
    id: 'race-car', publicId: 'race_road_car', category: 'sports', channel: 'रफ़्तार',
    title: 'सड़क पर दौड़ती रेसिंग कार — तूफ़ानी रफ़्तार 🏎️',
    description: 'तेज़ रफ़्तार रेसिंग कार का छोटा-सा रोमांचक वीडियो। कार के शौक़ीनों के लिए ख़ास!',
    views: 162000, likes: 8700, daysAgo: 1, duration: 9.7,
  }),
  demo({
    id: 'dog', publicId: 'dog', category: 'comedy', channel: 'पालतू दोस्त',
    title: 'मस्तमौला डॉगी का मज़ेदार अंदाज़ 🐶',
    description: 'हमारे चार पैरों वाले दोस्त का प्यारा-सा वीडियो। देखकर चेहरे पर मुस्कान आ जाएगी!',
    views: 245000, likes: 12800, daysAgo: 12, duration: 13.5,
  }),
  demo({
    id: 'dance', publicId: 'samples/dance-2', category: 'music', channel: 'ताल-सुर', heavy: true,
    title: 'डांस परफ़ॉर्मेंस: ताल पर थिरकते क़दम 💃',
    description: 'एक ऊर्जा से भरी डांस परफ़ॉर्मेंस। संगीत और नृत्य के दीवानों के लिए।',
    views: 98700, likes: 6100, daysAgo: 4, duration: 19.8,
  }),
  demo({
    id: 'sea-turtle', publicId: 'sea_turtle', category: 'nature', channel: 'नीला समंदर',
    title: 'नीले पानी में तैरता समुद्री कछुआ 🐢',
    description: 'समुद्री कछुए की सुकून भरी सैर। क्या आप जानते हैं? समुद्री कछुए हज़ारों किलोमीटर का सफ़र तय करते हैं!',
    views: 86200, likes: 3900, daysAgo: 3, duration: 15.3,
  }),
  demo({
    id: 'rafting', publicId: 'rafting', category: 'travel', channel: 'घुमक्कड़ी',
    title: 'नदी की लहरों पर राफ़्टिंग का रोमांच 🚣',
    description: 'तेज़ बहती नदी में रिवर राफ़्टिंग — एडवेंचर पसंद लोगों के लिए एक शानदार अनुभव।',
    views: 73900, likes: 3300, daysAgo: 2, duration: 34.3,
  }),
  demo({
    id: 'snow-horses', publicId: 'snow_horses', category: 'nature', channel: 'पहाड़ी डायरी',
    title: 'बर्फ़ीले मैदान में दौड़ते घोड़े ❄️',
    description: 'सफ़ेद बर्फ़ के बीच आज़ादी से दौड़ते घोड़ों का अद्भुत नज़ारा।',
    views: 54300, likes: 2100, daysAgo: 9, duration: 12.8,
  }),
  demo({
    id: 'ski-jump', publicId: 'ski_jump', category: 'sports', channel: 'खेल जगत',
    title: 'सिर्फ़ 5 सेकंड का ज़बरदस्त स्की जंप ⛷️',
    description: 'बर्फ़ पर एक शानदार स्की जंप — छोटा है, पर दमदार है!',
    views: 31200, likes: 1500, daysAgo: 20, duration: 5.2,
  }),
  demo({
    id: 'marmots', publicId: 'marmots', category: 'nature', channel: 'वन्यजीवन भारत',
    title: 'पहाड़ों के नन्हे पहरेदार: मार्मोट',
    description: 'ऊँचे पहाड़ों में रहने वाले प्यारे मार्मोट का वीडियो। ये सर्दियों में लंबी नींद (शीतनिद्रा) लेते हैं।',
    views: 19800, likes: 900, daysAgo: 15, duration: 27.2,
  }),
  demo({
    id: 'vlog', publicId: 'docs/walking_talking', category: 'vlog', channel: 'रोज़ का व्लॉग', heavy: true,
    title: 'चलते-चलते बातें: एक छोटा-सा व्लॉग 🎥',
    description: 'चलते-फिरते कैमरे से बातें करता एक छोटा व्लॉग। आप भी अपना व्लॉग "अपलोड" बटन से डाल सकते हैं!',
    views: 12400, likes: 700, daysAgo: 7, duration: 15.0,
  }),
];
