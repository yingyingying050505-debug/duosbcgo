// =============================================================
//  Firebase 設定
//  呢段 config（包埋 apiKey）放喺前端係正常做法——真正保護資料
//  嘅係 Firestore Security Rules，唔係呢段 config 嘅保密。
// =============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDW2mHH1N_3OrP_FK1kCWv_5z32hMTcioA",
  authDomain: "duosbcgo.firebaseapp.com",
  projectId: "duosbcgo",
  storageBucket: "duosbcgo.firebasestorage.app",
  messagingSenderId: "1033478386913",
  appId: "1:1033478386913:web:c1dcc43b822f80488533a0",
  measurementId: "G-3TZ2V1TN4Q",
};

// 用 compat SDK（冇 build step）。如果 SDK load 唔到（例如首次離線），
// 就退返做純本地模式，apps 照用。
let db = null;
try {
  if (window.firebase) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  }
} catch (e) {
  console.warn("Firebase init 失敗，用純本地模式", e);
  db = null;
}
window.db = db;
