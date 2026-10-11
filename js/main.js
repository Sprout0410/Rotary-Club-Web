/* =========================================
   躍齡扶輪社官方網站 - 核心程式 (js/main.js)
   全站共用：工具函式、資料庫、登入驗證、頁首頁尾、彈窗、提示、輪播
   各頁專屬功能放在 js/page-*.js
   -----------------------------------------
   ⚠ 目前為「單機示範版」：資料存在瀏覽器的 IndexedDB，
     只有同一台電腦、同一個瀏覽器看得到。
     正式上線改接後端（建議 Supabase）時，只需改寫「4. 資料庫」區塊，
     其餘 RC.api 介面與各頁面都不用動。
   ========================================= */
'use strict';

const RC = (window.RC = {});

/* =========================================
   0. 設定
   ========================================= */
RC.config = {
  PASSWORD_MIN_LENGTH: 6,   // 一般帳號密碼最短長度（另需同時含英文字母與數字）
  IMAGE_MAX_SIZE: 1600,     // 上傳圖片自動縮到最長邊 1600px，節省空間
  IMAGE_QUALITY: 0.85,
  MAX_HEADCOUNT: 20         // 單筆報名同行人數上限
};

RC.ROLE_LABEL = { developer: '開發者', admin: '管理員', member: '一般會員' };
RC.STATUS_LABEL = { pending: '待審核', active: '已啟用', rejected: '未通過', disabled: '已停用' };
RC.EVENT_STATUS_LABEL = { preparing: '籌備中', open: '開放報名', closed: '已結束' };

/* =========================================
   1. 工具函式
   ========================================= */
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
RC.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
RC.nl2br = (s) => RC.esc(s).replace(/\n/g, '<br>');
RC.uid = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
RC.now = () => new Date().toISOString();
RC.param = (name) => new URLSearchParams(location.search).get(name);
RC.safeColor = (c, fallback = '#3E6B89') => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : fallback);
RC.safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
// 連結可以是外部網址（http/https）或站內頁面（例如 event.html?id=...）
RC.safeLink = (u) => (/^https?:\/\//i.test(u || '') || /^[\w-]+\.html([?#].*)?$/.test(u || '') ? u : '');
RC.isExternal = (u) => /^https?:\/\//i.test(u || '');
// 純文字轉 HTML：保留換行、網址自動變成連結
RC.textToHtml = (s) => RC.nl2br(s).replace(/(https?:\/\/[^\s<]+)/g, (m) => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`);

const pad2 = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' 以本地時間解析（避免被當成 UTC 而差一天）
RC.parseDate = function (s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return isNaN(d) ? null : d;
};

RC.fmtDate = function (s) {
  const d = RC.parseDate(s);
  return d ? `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}` : '';
};

RC.fmtDateTime = function (s) {
  const d = RC.parseDate(s);
  if (!d) return '';
  const week = '日一二三四五六'[d.getDay()];
  const time = String(s).includes('T') ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '';
  return `${RC.fmtDate(s)}（${week}）${time}`;
};

RC.fmtStamp = function (iso) {
  const d = RC.parseDate(iso);
  return d ? `${RC.fmtDate(iso)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '';
};

RC.eventWhen = function (ev) {
  if (!ev.startAt) return '時間未定';
  let text = RC.fmtDateTime(ev.startAt);
  if (ev.endAt) {
    const s = RC.parseDate(ev.startAt);
    const e = RC.parseDate(ev.endAt);
    if (s && e && s.toDateString() === e.toDateString() && ev.endAt.includes('T')) {
      text += ` – ${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
    } else {
      text += ` ～ ${RC.fmtDateTime(ev.endAt)}`;
    }
  }
  return text;
};

// 報名名單遮蔽：中文「王小明→王O明」「王明→王O」「歐陽小明→歐OO明」；英文「John→J**n」
RC.maskName = function (raw) {
  const name = String(raw || '').trim();
  if (!name) return '匿名';
  if (/[㐀-鿿豈-﫿]/.test(name)) {
    const c = Array.from(name.replace(/\s+/g, ''));
    if (c.length === 1) return 'O';
    if (c.length === 2) return c[0] + 'O';
    return c[0] + 'O'.repeat(c.length - 2) + c[c.length - 1];
  }
  return name.split(/\s+/).map((w) => {
    const c = Array.from(w);
    if (c.length <= 2) return c[0] + '*'.repeat(c.length - 1);
    return c[0] + '*'.repeat(c.length - 2) + c[c.length - 1];
  }).join(' ');
};

// 只允許站內頁面當作登入後的導回目標，避免被拿來導向外部網站
RC.safeNext = function (next) {
  return /^[\w-]+\.html([?#][^:]*)?$/.test(next || '') ? next : '';
};

RC.currentPath = function () {
  const file = location.pathname.split('/').pop() || 'index.html';
  return file + location.search + location.hash;
};

RC.loginHref = () => 'login.html?next=' + encodeURIComponent(RC.currentPath());

// 動態內容渲染完後，補做一次錨點捲動（例如 about.html#members）
RC.scrollToHash = function () {
  if (!location.hash) return;
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target) target.scrollIntoView();
};

RC.downloadText = function (filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};

/* localStorage 在無痕模式／封鎖 Cookie 時可能丟錯，包一層避免整站中斷 */
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* 忽略 */ } },
  remove(key) { try { localStorage.removeItem(key); } catch (e) { /* 忽略 */ } }
};

/* =========================================
   2. SHA-256（純 JS 實作，file:// 與 http 都能用）
   ========================================= */
RC.sha256 = (function () {
  const K = [];
  for (let n = 2; K.length < 64; n++) {
    let prime = true;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) { prime = false; break; }
    if (prime) K.push((Math.pow(n, 1 / 3) * 4294967296) | 0);
  }
  const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const ror = (x, n) => (x >>> n) | (x << (32 - n));

  return function (str) {
    const bytes = new TextEncoder().encode(String(str));
    const len = bytes.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor((len * 8) / 4294967296));
    dv.setUint32(total - 4, (len * 8) >>> 0);

    const H = H0.slice();
    const w = new Int32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getInt32(off + t * 4);
      for (let t = 16; t < 64; t++) {
        const a = w[t - 15], b = w[t - 2];
        w[t] = (w[t - 16] + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + w[t - 7] + (ror(b, 17) ^ ror(b, 19) ^ (b >>> 10))) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
        const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  };
})();

/* =========================================
   3. 圖片處理：上傳時自動壓縮
   ========================================= */
RC.compressImage = function (file, maxSize = RC.config.IMAGE_MAX_SIZE, quality = RC.config.IMAGE_QUALITY) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) {
      reject(new Error(`「${file ? file.name : ''}」不是圖片檔`));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';   // 透明 PNG 轉 JPG 時用白底
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`「${file.name}」讀取失敗（可能是 HEIC 等瀏覽器不支援的格式，請先轉成 JPG）`));
    };
    img.src = url;
  });
};

/* =========================================
   4. 資料庫（IndexedDB 單機版）
   每個 store 對應未來後端的一張資料表：
   users / notifications / events / registrations /
   albums / photos / images / members / presidents / meta
   ========================================= */
const DB = (function () {
  const NAME = 'yueling-rotary-demo';
  const VERSION = 2;   // 第 2 版新增 slides / blocks / calendar
  const STORES = ['users', 'notifications', 'events', 'registrations', 'albums', 'photos', 'images', 'members', 'presidents',
    'slides', 'blocks', 'calendar', 'meta'];

  // 極少數瀏覽器沒有 IndexedDB 時退回記憶體（重新整理就會消失）
  function memoryDB() {
    const m = {};
    STORES.forEach((s) => { m[s] = new Map(); });
    const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
    return {
      STORES,
      persistent: false,
      all: async (s) => [...m[s].values()].map(clone),
      get: async (s, id) => clone(m[s].get(id)),
      put: async (s, obj) => { m[s].set(obj.id, clone(obj)); return obj; },
      del: async (s, id) => { m[s].delete(id); },
      clear: async (s) => { m[s].clear(); }
    };
  }

  if (!('indexedDB' in window)) return memoryDB();

  let dbPromise = null;
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((s) => {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      let result;
      if (req) req.onsuccess = () => { result = req.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('資料寫入失敗（可能是瀏覽器儲存空間不足）'));
    });
  }

  return {
    STORES,
    persistent: true,
    all: (s) => tx(s, 'readonly', (st) => st.getAll()).then((r) => r || []),
    get: (s, id) => tx(s, 'readonly', (st) => st.get(id)),
    put: (s, obj) => tx(s, 'readwrite', (st) => st.put(obj)).then(() => obj),
    del: (s, id) => tx(s, 'readwrite', (st) => st.delete(id)),
    clear: (s) => tx(s, 'readwrite', (st) => st.clear())
  };
})();

/* =========================================
   5. 預設資料（第一次開啟網站時建立）
   ========================================= */
const DEV_ACCOUNT_ID = 'u_dev_sprout';

// 開發者帳號 Sprout / 890410 —— 程式碼內只存雜湊值，不存明碼
function devAccount() {
  return {
    id: DEV_ACCOUNT_ID,
    username: 'Sprout',
    displayName: 'Sprout',
    email: '',
    phone: '',
    salt: 'sprout-dev-2026',
    passwordHash: 'ceda1894ef1d03b7a3dd51773f21f8bfe1de3acd5470efd70ddd5ff4b33d9500',
    role: 'developer',
    status: 'active',
    createdAt: RC.now()
  };
}

function placeholderImage(text, color) {
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 640;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 960, 640);
  grd.addColorStop(0, color);
  grd.addColorStop(1, '#00246B');
  g.fillStyle = grd;
  g.fillRect(0, 0, 960, 640);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.font = 'bold 54px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 480, 320);
  return c.toDataURL('image/jpeg', 0.8);
}

async function seedDemoData() {
  const t = RC.now();

  const presidents = [
    ['創社社長', '蒙其·D·魯夫', '#3E6B89'],
    ['第 2 屆社長', '紅髮香克斯', '#D9822B'],
    ['第 3 屆社長', '愛德華·紐蓋特', '#2E8B57'],
    ['第 4 屆社長', '千兩小丑巴其', '#8E44AD'],
    ['第 5 屆社長', '百獸凱多', '#C0392B']
  ];
  for (let i = 0; i < presidents.length; i++) {
    const [term, name, color] = presidents[i];
    await DB.put('presidents', { id: 'pres_' + (i + 1), term, name, years: '任期欄位', color, photoImg: '', order: i + 1, createdAt: t });
  }

  const memberNames = ['A', 'B', 'C', 'D', 'E', 'F'];
  for (let i = 0; i < memberNames.length; i++) {
    await DB.put('members', { id: 'mem_' + (i + 1), name: '社員 ' + memberNames[i], title: '職稱 / 職業欄位', photoImg: '', order: i + 1, createdAt: t });
  }

  // 示範相簿：去年同一活動的照片
  const albumId = 'alb_demo_2025';
  await DB.put('albums', {
    id: albumId, title: '2025 蛋糕島跨社聯誼', date: '2025-11-16',
    description: '去年同一活動的照片（示範資料，可刪除）', coverImg: '', createdAt: t
  });
  const colors = ['#D9822B', '#2E8B57', '#8E44AD'];
  for (let i = 0; i < 3; i++) {
    const imgId = 'img_demo_' + (i + 1);
    await DB.put('images', { id: imgId, dataUrl: placeholderImage(`示範照片 ${i + 1}`, colors[i]), createdAt: t });
    await DB.put('photos', { id: 'pho_demo_' + (i + 1), albumId, imageId: imgId, caption: '', createdAt: t });
  }

  const nextYear = new Date().getFullYear() + (new Date().getMonth() >= 10 ? 1 : 0);
  await DB.put('events', {
    id: 'ev_demo_1',
    title: '蛋糕島大戰：茶會救援跨社聯誼',
    status: 'open',
    summary: '年度跨社聯誼茶會，歡迎社友攜家帶眷參加！（示範資料，可編輯或刪除）',
    content: '活動流程：\n14:00 報到\n14:30 開場致詞\n15:00 茶會與交流\n17:00 合照與賦歸',
    startAt: `${nextYear}-11-15T14:00`,
    endAt: `${nextYear}-11-15T17:00`,
    location: '地點資訊欄位',
    deadline: '',
    capacity: 60,
    posterImg: '',
    regMode: 'internal',
    externalUrl: '',
    fields: [{ id: 'f_diet', label: '飲食需求', type: 'select', options: ['葷食', '素食'], required: true }],
    albumIds: [albumId],
    createdAt: t,
    updatedAt: t
  });
  await DB.put('events', {
    id: 'ev_demo_2',
    title: '和之國文化體驗暨武士道交流',
    status: 'preparing',
    summary: '活動籌備中，詳細資訊將於近期公布。（示範資料）',
    content: '',
    startAt: `${nextYear + 1}-01-10T10:00`,
    endAt: '',
    location: '',
    deadline: '',
    capacity: 0,
    posterImg: '',
    regMode: 'none',
    externalUrl: '',
    fields: [],
    albumIds: [],
    createdAt: t,
    updatedAt: t
  });

  const demoRegs = [['王小明', 3], ['陳美玲', 1], ['林志豪', 2]];
  for (let i = 0; i < demoRegs.length; i++) {
    await DB.put('registrations', {
      id: 'reg_demo_' + (i + 1), eventId: 'ev_demo_1', name: demoRegs[i][0], contact: '0900-000-00' + i,
      headcount: demoRegs[i][1], answers: { f_diet: '葷食' }, note: '', userId: '', createdAt: t
    });
  }
}

// 第 2 版：首頁展示區、可編輯文字區塊、重大行事曆
async function seedV2Data() {
  const t = RC.now();
  const slides = [
    ['【 重大活動展示區 A 】', '瞭解更多資訊 ➔', 'news.html', 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1600&auto=format&fit=crop&q=80'],
    ['【 重大活動展示區 B 】', '瞭解更多資訊 ➔', 'news.html', 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1600&auto=format&fit=crop&q=80'],
    ['【 重大活動展示區 C 】', '前往報名', 'events.html#register', 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1600&auto=format&fit=crop&q=80']
  ];
  for (let i = 0; i < slides.length; i++) {
    const [title, buttonText, link, imageUrl] = slides[i];
    await DB.put('slides', { id: 'sld_' + (i + 1), title, buttonText, link, imageUrl, photoImg: '', enabled: true, order: i + 1, createdAt: t });
  }

  await DB.put('blocks', { id: 'about.history', body: '【 文字內容放置區塊 】\n（管理員登入後，點右上角「編輯」即可修改這段內容）', updatedAt: t });
  await DB.put('blocks', {
    id: 'meeting',
    time: '每月第一、三週 星期○ 晚上 7:00（示範資料）',
    place: '例會地點名稱',
    address: '',
    contact: '',
    note: '如遇國定假日或特殊活動，例會時間將另行公告。',
    updatedAt: t
  });
  await DB.put('blocks', { id: 'contact.traffic', body: '【 交通與停車指南 】\n捷運：\n公車：\n停車：', updatedAt: t });

  const cal = [['2026 年度 Q3', 'A'], ['2026 年度 Q3', 'B'], ['2026 年度 Q4', 'C'], ['2026 年度 Q4', 'D']];
  for (let i = 0; i < cal.length; i++) {
    await DB.put('calendar', {
      id: 'cal_' + (i + 1), dateLabel: cal[i][0], title: `【 季度重大行事曆項目 ${cal[i][1]} 】`,
      description: '標籤欄位 / 說明文字放置區', link: '', order: i + 1, createdAt: t
    });
  }
}

async function seed() {
  const meta = await DB.get('meta', 'seed');
  if (!meta) {
    await seedDemoData();
  }
  if (!meta || (meta.version || 1) < 2) {
    await seedV2Data();
    await DB.put('meta', { id: 'seed', version: 2, at: RC.now() });
  }
  // 開發者帳號一律存在（被誤刪時自動補回）
  if (!(await DB.get('users', DEV_ACCOUNT_ID))) await DB.put('users', devAccount());
}

/* =========================================
   6. 登入驗證
   ========================================= */
const SESSION_KEY = 'rc_session_user';

RC.auth = {
  current: null,

  isAdmin(u = this.current) { return !!u && (u.role === 'admin' || u.role === 'developer'); },
  isDeveloper(u = this.current) { return !!u && u.role === 'developer'; },

  hash: (salt, password) => RC.sha256(salt + ':' + password),

  validatePassword(pw) {
    const min = RC.config.PASSWORD_MIN_LENGTH;
    if (!pw || pw.length < min) return `密碼至少需要 ${min} 碼`;
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return '密碼必須同時包含英文字母與數字';
    return '';
  },

  async load() {
    const id = storage.get(SESSION_KEY);
    if (!id) return null;
    const u = await DB.get('users', id);
    if (!u || u.status !== 'active') {
      storage.remove(SESSION_KEY);
      return null;
    }
    this.current = u;
    return u;
  },

  async login(username, password) {
    const name = String(username || '').trim().toLowerCase();
    const users = await DB.all('users');
    const u = users.find((x) => x.username.toLowerCase() === name);
    if (!u || u.passwordHash !== this.hash(u.salt, password)) throw new Error('帳號或密碼錯誤');
    if (u.status === 'pending') throw new Error('此帳號仍在審核中，審核完成後會通知您');
    if (u.status === 'rejected') throw new Error('此帳號申請未通過審核，如有疑問請聯絡本社');
    if (u.status === 'disabled') throw new Error('此帳號已被停用，請聯絡管理員');
    u.lastLoginAt = RC.now();
    await DB.put('users', u);
    storage.set(SESSION_KEY, u.id);
    this.current = u;
    return u;
  },

  logout() {
    storage.remove(SESSION_KEY);
    this.current = null;
  },

  async register(data) {
    const username = String(data.username || '').trim();
    const displayName = String(data.displayName || '').trim();
    const email = String(data.email || '').trim();
    const phone = String(data.phone || '').trim();

    if (!/^[A-Za-z0-9_.-]{3,20}$/.test(username)) throw new Error('帳號需為 3–20 個英文字母、數字或 _ . -');
    if (!displayName) throw new Error('請填寫姓名');
    const pwErr = this.validatePassword(data.password);
    if (pwErr) throw new Error(pwErr);
    if (data.password !== data.password2) throw new Error('兩次輸入的密碼不一致');
    if (!email && !phone) throw new Error('Email 與手機號碼請至少填寫一項，以便通知審核結果');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email 格式不正確');
    if (phone && !/^[0-9+\-\s()]{8,20}$/.test(phone)) throw new Error('手機號碼格式不正確');

    const users = await DB.all('users');
    if (users.some((x) => x.username.toLowerCase() === username.toLowerCase())) throw new Error('此帳號名稱已被使用，請換一個');

    const salt = RC.uid('s');
    const user = {
      id: RC.uid('u_'), username, displayName, email, phone, salt,
      passwordHash: this.hash(salt, data.password),
      role: 'member', status: 'pending', createdAt: RC.now()
    };
    await DB.put('users', user);
    return user;
  }
};

function requireAdmin() {
  if (!RC.auth.isAdmin()) throw new Error('此操作需要管理員權限');
}

/* =========================================
   7. 圖片存取
   ========================================= */
RC.images = {
  cache: new Map(),
  async save(dataUrl) {
    const id = RC.uid('img_');
    await DB.put('images', { id, dataUrl, createdAt: RC.now() });
    this.cache.set(id, dataUrl);
    return id;
  },
  async fromFile(file) {
    return this.save(await RC.compressImage(file));
  },
  async get(id) {
    if (!id) return null;
    if (this.cache.has(id)) return this.cache.get(id);
    const rec = await DB.get('images', id);
    const url = rec ? rec.dataUrl : null;
    this.cache.set(id, url);
    return url;
  },
  async remove(id) {
    if (!id) return;
    this.cache.delete(id);
    await DB.del('images', id);
  },
  // 把 <img data-img="圖片ID"> 換成實際圖片
  async hydrate(root = document) {
    const imgs = Array.from(root.querySelectorAll('img[data-img]'));
    await Promise.all(imgs.map(async (img) => {
      const url = await this.get(img.dataset.img);
      img.removeAttribute('data-img');
      if (url) img.src = url;
      else img.classList.add('img-missing');
    }));
  }
};

/* =========================================
   8. 資料存取介面（RC.api）
   頁面只透過這裡讀寫資料；改接後端時只要改這層
   ========================================= */
const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
const byCreated = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt));

RC.api = {
  /* ----- 帳號 ----- */
  users: {
    async list() {
      requireAdmin();
      return (await DB.all('users')).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
    async review(userId, approve, { role = 'member', reason = '' } = {}) {
      requireAdmin();
      const u = await DB.get('users', userId);
      if (!u) throw new Error('找不到此帳號');
      u.status = approve ? 'active' : 'rejected';
      if (approve) u.role = role === 'admin' ? 'admin' : 'member';
      u.reviewedAt = RC.now();
      u.reviewedBy = RC.auth.current.username;
      u.reviewNote = reason;
      await DB.put('users', u);
      await RC.api.notifications.createReview(u, approve, reason);
      return u;
    },
    async update(userId, changes) {
      requireAdmin();
      const u = await DB.get('users', userId);
      if (!u) throw new Error('找不到此帳號');
      if (u.role === 'developer') throw new Error('開發者帳號受保護，無法修改');
      if (u.id === RC.auth.current.id) throw new Error('不能修改自己的權限或狀態');
      if (changes.role && !['admin', 'member'].includes(changes.role)) throw new Error('身分不正確');
      if (changes.status && !['active', 'disabled'].includes(changes.status)) throw new Error('狀態不正確');
      Object.assign(u, changes, { updatedAt: RC.now() });
      await DB.put('users', u);
      return u;
    },
    async resetPassword(userId, newPassword) {
      requireAdmin();
      const u = await DB.get('users', userId);
      if (!u) throw new Error('找不到此帳號');
      if (u.role === 'developer' && !RC.auth.isDeveloper()) throw new Error('開發者帳號受保護，無法修改');
      if (u.role !== 'developer') {
        const err = RC.auth.validatePassword(newPassword);
        if (err) throw new Error(err);
      }
      u.salt = RC.uid('s');
      u.passwordHash = RC.auth.hash(u.salt, newPassword);
      await DB.put('users', u);
    },
    async remove(userId) {
      requireAdmin();
      const u = await DB.get('users', userId);
      if (!u) return;
      if (u.role === 'developer') throw new Error('開發者帳號受保護，無法刪除');
      if (u.id === RC.auth.current.id) throw new Error('不能刪除自己的帳號');
      await DB.del('users', userId);
    }
  },

  /* ----- 審核結果通知 ----- */
  notifications: {
    async list() {
      requireAdmin();
      return (await DB.all('notifications')).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
    async createReview(u, approve, reason) {
      const channel = u.email ? 'email' : 'sms';
      const subject = `【躍齡扶輪社】帳號申請審核結果：${approve ? '通過' : '未通過'}`;
      const body = approve
        ? `${u.displayName} 您好：\n\n您於躍齡扶輪社網站申請的帳號「${u.username}」已審核通過，現在即可登入使用。\n\n躍齡扶輪社 敬上`
        : `${u.displayName} 您好：\n\n很抱歉，您於躍齡扶輪社網站申請的帳號「${u.username}」未通過審核。${reason ? '\n原因：' + reason : ''}\n如有疑問，歡迎與本社聯繫。\n\n躍齡扶輪社 敬上`;
      return DB.put('notifications', {
        id: RC.uid('n_'), userId: u.id, username: u.username, displayName: u.displayName,
        channel, to: channel === 'email' ? u.email : u.phone,
        subject, body, sent: false, createdAt: RC.now()
      });
    },
    async setSent(id, sent) {
      requireAdmin();
      const n = await DB.get('notifications', id);
      if (!n) return;
      n.sent = sent;
      n.sentAt = sent ? RC.now() : '';
      await DB.put('notifications', n);
    },
    async remove(id) {
      requireAdmin();
      await DB.del('notifications', id);
    }
  },

  /* ----- 活動 ----- */
  events: {
    async list() {
      const list = await DB.all('events');
      for (const ev of list) await autoOpen(ev);
      return list.sort((a, b) => String(a.startAt || '9').localeCompare(String(b.startAt || '9')));
    },
    async get(id) {
      const ev = await DB.get('events', id);
      if (ev) await autoOpen(ev);
      return ev;
    },
    async save(ev) {
      requireAdmin();
      ev.updatedAt = RC.now();
      if (!ev.id) {
        ev.id = RC.uid('ev_');
        ev.createdAt = ev.updatedAt;
      }
      return DB.put('events', ev);
    },
    async remove(id) {
      requireAdmin();
      const ev = await DB.get('events', id);
      if (!ev) return;
      const regs = (await DB.all('registrations')).filter((r) => r.eventId === id);
      for (const r of regs) await DB.del('registrations', r.id);
      await RC.images.remove(ev.posterImg);
      await DB.del('events', id);
    }
  },

  /* ----- 報名 ----- */
  registrations: {
    async listByEvent(eventId) {
      return (await DB.all('registrations')).filter((r) => r.eventId === eventId).sort(byCreated);
    },
    // { eventId: { groups, people } }
    async summary() {
      const map = {};
      (await DB.all('registrations')).forEach((r) => {
        const s = (map[r.eventId] = map[r.eventId] || { groups: 0, people: 0 });
        s.groups += 1;
        s.people += Number(r.headcount) || 1;
      });
      return map;
    },
    async add(reg) {
      const ev = await RC.api.events.get(reg.eventId);
      if (!ev) throw new Error('找不到此活動');
      const regs = await this.listByEvent(ev.id);
      const people = regs.reduce((sum, r) => sum + (Number(r.headcount) || 1), 0);
      const state = RC.eventState(ev, people);
      if (state.key !== 'open' || ev.regMode !== 'internal') throw new Error('此活動目前' + state.label + '，無法報名');
      if (ev.capacity && people + reg.headcount > ev.capacity) {
        throw new Error(`名額不足：目前剩餘 ${Math.max(0, ev.capacity - people)} 位`);
      }
      const rec = Object.assign({ id: RC.uid('reg_'), createdAt: RC.now(), userId: RC.auth.current ? RC.auth.current.id : '' }, reg);
      return DB.put('registrations', rec);
    },
    async remove(id) {
      requireAdmin();
      await DB.del('registrations', id);
    }
  },

  /* ----- 相簿與照片 ----- */
  albums: {
    async list() {
      return (await DB.all('albums')).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    },
    // 附上照片數與封面圖片 ID
    async listWithStats() {
      const [albums, photos] = await Promise.all([this.list(), DB.all('photos')]);
      return albums.map((a) => {
        const own = photos.filter((p) => p.albumId === a.id).sort(byCreated);
        return Object.assign({}, a, { count: own.length, cover: a.coverImg || (own[0] ? own[0].imageId : '') });
      });
    },
    get: (id) => DB.get('albums', id),
    async save(album) {
      requireAdmin();
      if (!album.id) {
        album.id = RC.uid('alb_');
        album.createdAt = RC.now();
      }
      return DB.put('albums', album);
    },
    async remove(id) {
      requireAdmin();
      const photos = (await DB.all('photos')).filter((p) => p.albumId === id);
      for (const p of photos) {
        await RC.images.remove(p.imageId);
        await DB.del('photos', p.id);
      }
      // 從各活動的相簿連結中移除
      for (const ev of await DB.all('events')) {
        if ((ev.albumIds || []).includes(id)) {
          ev.albumIds = ev.albumIds.filter((x) => x !== id);
          await DB.put('events', ev);
        }
      }
      await DB.del('albums', id);
    }
  },

  photos: {
    async listByAlbum(albumId) {
      return (await DB.all('photos')).filter((p) => p.albumId === albumId).sort(byCreated);
    },
    async add(albumId, file) {
      requireAdmin();
      const imageId = await RC.images.fromFile(file);
      const photo = { id: RC.uid('pho_'), albumId, imageId, caption: '', createdAt: RC.now() };
      await DB.put('photos', photo);
      return photo;
    },
    async remove(photo) {
      requireAdmin();
      await RC.images.remove(photo.imageId);
      await DB.del('photos', photo.id);
      const album = await DB.get('albums', photo.albumId);
      if (album && album.coverImg === photo.imageId) {
        album.coverImg = '';
        await DB.put('albums', album);
      }
    }
  },

  /* ----- 社友名錄、歷屆社長（同一套排序／照片邏輯） ----- */
  members: orderedCollection('members', 'mem_'),
  presidents: orderedCollection('presidents', 'pres_'),
  slides: orderedCollection('slides', 'sld_'),        // 首頁重大活動展示區
  calendar: orderedCollection('calendar', 'cal_'),    // 重大行事曆

  /* ----- 可編輯的文字區塊（創社歷史、例會公告、交通指南…） ----- */
  blocks: {
    async get(id) { return (await DB.get('blocks', id)) || { id }; },
    async save(id, data) {
      requireAdmin();
      return DB.put('blocks', Object.assign({}, data, { id, updatedAt: RC.now(), updatedBy: RC.auth.current.username }));
    }
  },

  /* ----- 資料備份 ----- */
  backup: {
    async exportAll() {
      requireAdmin();
      const data = {};
      for (const s of DB.STORES) data[s] = await DB.all(s);
      return JSON.stringify({ app: 'yueling-rotary', version: 1, exportedAt: RC.now(), data });
    },
    async importAll(json) {
      if (!RC.auth.isDeveloper()) throw new Error('只有開發者可以匯入資料');
      const parsed = JSON.parse(json);
      if (!parsed || parsed.app !== 'yueling-rotary' || !parsed.data) throw new Error('檔案格式不正確');
      for (const s of DB.STORES) {
        await DB.clear(s);
        for (const rec of parsed.data[s] || []) await DB.put(s, rec);
      }
      RC.images.cache.clear();
      await seed();
    },
    async resetDemo() {
      if (!RC.auth.isDeveloper()) throw new Error('只有開發者可以重設資料');
      for (const s of DB.STORES) await DB.clear(s);
      RC.images.cache.clear();
      await seed();
    }
  }
};

function orderedCollection(store, prefix) {
  return {
    async list() { return (await DB.all(store)).sort(byOrder); },
    async save(item) {
      requireAdmin();
      if (!item.id) {
        const all = await DB.all(store);
        item.id = RC.uid(prefix);
        item.order = all.reduce((m, x) => Math.max(m, x.order || 0), 0) + 1;
        item.createdAt = RC.now();
      }
      return DB.put(store, item);
    },
    async move(id, step) {
      requireAdmin();
      const all = (await DB.all(store)).sort(byOrder);
      const i = all.findIndex((x) => x.id === id);
      const j = i + step;
      if (i < 0 || j < 0 || j >= all.length) return;
      [all[i], all[j]] = [all[j], all[i]];
      for (let k = 0; k < all.length; k++) {
        all[k].order = k + 1;
        await DB.put(store, all[k]);
      }
    },
    async remove(id) {
      requireAdmin();
      const item = await DB.get(store, id);
      if (!item) return;
      await RC.images.remove(item.photoImg);
      await DB.del(store, id);
    }
  };
}

// 「籌備中」的活動到了報名開始時間，自動改為「開放報名」並存回資料庫
async function autoOpen(ev) {
  const opensAt = RC.parseDate(ev.regStartAt);
  if (ev.status === 'preparing' && opensAt && opensAt <= new Date()) {
    ev.status = 'open';
    ev.autoOpenedAt = RC.now();
    await DB.put('events', ev);
  }
  return ev;
}

// 活動目前的狀態（綜合管理員設定、報名開始／截止時間、名額）
RC.eventState = function (ev, people = 0) {
  if (ev.status === 'closed') return { key: 'closed', label: '已結束' };
  if (ev.status === 'preparing') {
    const opensAt = RC.parseDate(ev.regStartAt);
    return { key: 'preparing', label: opensAt ? `籌備中・${RC.fmtDateTime(ev.regStartAt)}開放報名` : '籌備中' };
  }
  const deadline = RC.parseDate(ev.deadline);
  if (deadline && deadline < new Date()) return { key: 'deadline', label: '報名已截止' };
  if (ev.capacity && people >= ev.capacity) return { key: 'full', label: '名額已滿' };
  return { key: 'open', label: '開放報名中' };
};

RC.stateBadge = (state) => `<span class="badge state--${state.key}">${state.label}</span>`;

/* =========================================
   9. 介面元件：提示、彈窗、表單彈窗、燈箱、分頁籤
   ========================================= */
RC.toast = function (msg, type = 'info', ms = 2800) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    wrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = 'toast toast--' + type;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => {
    t.classList.add('toast--out');
    setTimeout(() => t.remove(), 300);
  }, ms);
};

RC.modal = function ({ title, body, actions = [], wide = false }) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal${wide ? ' modal--wide' : ''}" role="dialog" aria-modal="true" aria-label="${RC.esc(title)}">
      <div class="modal__head"><h3>${RC.esc(title)}</h3><button type="button" class="modal__close" aria-label="關閉">×</button></div>
      <div class="modal__body"></div>
      <div class="modal__foot"></div>
    </div>`;
  const bodyEl = back.querySelector('.modal__body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);

  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() {
    back.remove();
    document.removeEventListener('keydown', onKey);
    if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('modal-open');
  }
  const api = { el: back, body: bodyEl, close };

  const foot = back.querySelector('.modal__foot');
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.type = a.type || 'button';
    b.className = 'btn ' + (a.className || '');
    b.textContent = a.label;
    if (a.form) b.setAttribute('form', a.form);
    if (a.onClick) b.addEventListener('click', () => a.onClick(api));
    foot.appendChild(b);
  });
  if (!actions.length) foot.remove();

  back.querySelector('.modal__close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  document.body.classList.add('modal-open');
  const first = bodyEl.querySelector('input, select, textarea');
  if (first) first.focus();
  return api;
};

/* 用欄位設定產生表單彈窗
   fields: [{ name, label, type, value, required, options, hint, rows, currentImg }] */
RC.formModal = function ({ title, fields, submitLabel = '儲存', onSubmit }) {
  const form = document.createElement('form');
  form.id = RC.uid('form_');
  form.className = 'modal-form';
  form.innerHTML = fields.map(fieldHtml).join('') + '<p class="form-error" hidden></p>';

  const m = RC.modal({
    title,
    body: form,
    actions: [
      { label: '取消', className: 'btn--ghost', onClick: (api) => api.close() },
      { label: submitLabel, className: 'btn--primary', type: 'submit', form: form.id }
    ]
  });
  RC.images.hydrate(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    const submitBtn = m.el.querySelector('button[type="submit"]');
    const values = {};
    fields.forEach((f) => {
      const el = form.elements[f.name];
      if (f.type === 'image') {
        values[f.name] = el.files[0] || null;
        const rm = form.elements[f.name + '__remove'];
        values[f.name + '__remove'] = !!(rm && rm.checked);
      } else {
        values[f.name] = el.value.trim();
      }
    });
    err.hidden = true;
    submitBtn.disabled = true;
    try {
      await onSubmit(values);
      m.close();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });
  return m;
};

function fieldHtml(f) {
  const id = RC.uid('fld_');
  const req = f.required ? ' required' : '';
  const label = `<label for="${id}">${RC.esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>`;
  const hint = f.hint ? `<p class="form-hint">${RC.esc(f.hint)}</p>` : '';
  const val = RC.esc(f.value ?? '');
  let control;
  switch (f.type) {
    case 'textarea':
      control = `<textarea id="${id}" name="${f.name}" class="form-control" rows="${f.rows || 4}"${req}>${val}</textarea>`;
      break;
    case 'select':
      control = `<select id="${id}" name="${f.name}" class="form-control"${req}>${(f.options || []).map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const t = typeof o === 'string' ? o : o.label;
        return `<option value="${RC.esc(v)}"${String(v) === String(f.value ?? '') ? ' selected' : ''}>${RC.esc(t)}</option>`;
      }).join('')}</select>`;
      break;
    case 'image':
      control = `
        ${f.currentImg ? `<div class="current-img"><img data-img="${RC.esc(f.currentImg)}" alt="目前圖片"><label class="inline-check"><input type="checkbox" name="${f.name}__remove"> 移除目前圖片</label></div>` : ''}
        <input type="file" id="${id}" name="${f.name}" class="form-control" accept="image/*">`;
      break;
    default:
      control = `<input type="${f.type || 'text'}" id="${id}" name="${f.name}" class="form-control" value="${val}"${req}>`;
  }
  return `<div class="form-group">${label}${control}${hint}</div>`;
}

RC.lightbox = function (srcs, start = 0, captions = []) {
  if (!srcs.length) return;
  let i = start;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `
    <button type="button" class="lightbox__close" aria-label="關閉">×</button>
    <button type="button" class="lightbox__nav lightbox__prev" aria-label="上一張">&#10094;</button>
    <figure><img alt=""><figcaption></figcaption></figure>
    <button type="button" class="lightbox__nav lightbox__next" aria-label="下一張">&#10095;</button>`;
  const img = box.querySelector('img');
  const cap = box.querySelector('figcaption');
  const single = srcs.length < 2;
  box.querySelectorAll('.lightbox__nav').forEach((b) => { b.hidden = single; });

  function show() {
    img.src = srcs[i];
    cap.textContent = single ? (captions[i] || '') : `${i + 1} / ${srcs.length}${captions[i] ? '　' + captions[i] : ''}`;
  }
  function go(step) { i = (i + step + srcs.length) % srcs.length; show(); }
  function close() { box.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  }
  box.querySelector('.lightbox__close').addEventListener('click', close);
  box.querySelector('.lightbox__prev').addEventListener('click', () => go(-1));
  box.querySelector('.lightbox__next').addEventListener('click', () => go(1));
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
  show();
};

/* 從活動相簿挑一張照片；回傳複製後的新圖片 ID（原照片之後被刪也不受影響） */
RC.pickAlbumPhoto = function () {
  return new Promise(async (resolve) => {
    const [albums, photos] = await Promise.all([RC.api.albums.list(), DB.all('photos')]);
    const groups = albums.map((a) => ({ a, list: photos.filter((p) => p.albumId === a.id) })).filter((g) => g.list.length);
    const body = groups.length
      ? groups.map((g) => `
          <h4 class="picker-album">${RC.esc(g.a.title)}</h4>
          <div class="picker-grid">${g.list.map((p) =>
            `<button type="button" class="picker-item" data-img="${RC.esc(p.imageId)}"><img data-img="${RC.esc(p.imageId)}" alt=""></button>`).join('')}</div>`).join('')
      : '<p class="empty-state">相簿裡還沒有照片。</p>';
    let picked = false;
    const m = RC.modal({ title: '從活動相簿選擇照片', body, wide: true,
      actions: [{ label: '取消', className: 'btn--ghost', onClick: (api) => api.close() }] });
    RC.images.hydrate(m.body);
    m.body.addEventListener('click', async (e) => {
      const item = e.target.closest('.picker-item');
      if (!item || picked) return;
      picked = true;
      const url = await RC.images.get(item.dataset.img);
      m.close();
      resolve(url ? await RC.images.save(url) : '');
    });
    // 關閉時若沒選，回傳空字串
    const obs = new MutationObserver(() => {
      if (!document.body.contains(m.el)) { obs.disconnect(); if (!picked) resolve(''); }
    });
    obs.observe(document.body, { childList: true });
  });
};

/* ----- 可編輯文字區塊（純文字，換行保留、網址自動變連結） ----- */
RC.editTextBlock = async function (id, title, rerender) {
  const b = await RC.api.blocks.get(id);
  RC.formModal({
    title,
    fields: [{ name: 'body', label: '內容', type: 'textarea', rows: 10, value: b.body || '',
      hint: '直接換行即可分段；貼上的網址會自動變成連結。' }],
    async onSubmit(v) {
      await RC.api.blocks.save(id, { body: v.body });
      RC.toast('已儲存', 'success');
      rerender();
    }
  });
};

/* ----- 例會時間與地點（最新消息、聯絡我們共用同一份資料） ----- */
RC.meetingHtml = function (m) {
  const rows = [['例會時間', m.time], ['例會地點', m.place], ['地址', m.address], ['聯絡窗口', m.contact]]
    .filter(([, v]) => v)
    .map(([k, v]) => `<dt>${k}</dt><dd>${RC.textToHtml(v)}</dd>`).join('');
  if (!rows && !m.note) return '<p class="empty-state">尚未設定例會資訊。</p>';
  return `${rows ? `<dl class="info-list">${rows}</dl>` : ''}${m.note ? `<p class="block-note">${RC.textToHtml(m.note)}</p>` : ''}`;
};

RC.editMeeting = async function (rerender) {
  const m = await RC.api.blocks.get('meeting');
  RC.formModal({
    title: '編輯例會時間與地點',
    fields: [
      { name: 'time', label: '例會時間', value: m.time, hint: '例如：每月第一、三週 星期二 晚上 7:00' },
      { name: 'place', label: '例會地點', value: m.place, hint: '例如：○○飯店 3 樓宴會廳' },
      { name: 'address', label: '地址', value: m.address, hint: '「聯絡我們」頁的地圖會依這個地址自動顯示' },
      { name: 'contact', label: '聯絡窗口', value: m.contact, hint: '例如：秘書 王○○ 0912-345-678' },
      { name: 'note', label: '補充說明／臨時異動公告', type: 'textarea', rows: 4, value: m.note }
    ],
    async onSubmit(v) {
      await RC.api.blocks.save('meeting', v);
      RC.toast('例會資訊已更新', 'success');
      rerender();
    }
  });
};

// 「編輯」小按鈕（管理員專用，放在可編輯區塊的右上角）
RC.editButton = function (container, label, onClick) {
  if (!container || !RC.auth.isAdmin()) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn--sm btn--primary';
  b.textContent = label;
  b.addEventListener('click', onClick);
  container.appendChild(b);
};

// 分頁籤：root 內的 .tab-btn[data-tab] 對應 [data-panel]
RC.bindTabs = function (root, onChange) {
  const buttons = Array.from(root.querySelectorAll('.tab-btn[data-tab]'));
  function activate(name) {
    buttons.forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    root.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    if (onChange) onChange(name);
  }
  buttons.forEach((b) => b.addEventListener('click', () => activate(b.dataset.tab)));
  return activate;
};

// 頁面需要管理員權限時使用；沒有權限就顯示提示並回傳 false
RC.guardAdmin = function (container) {
  if (RC.auth.isAdmin()) return true;
  container.innerHTML = `
    <section class="content-box empty-state">
      <h3>需要管理員權限</h3>
      <p>此頁面僅限管理員使用。</p>
      ${RC.auth.current ? '' : `<a class="btn btn--primary" href="${RC.loginHref()}">前往登入</a>`}
    </section>`;
  return false;
};

/* =========================================
   10. 頁首、頁尾、右上角登入區
   導覽列只在這裡維護一份，所有頁面共用
   ========================================= */
const NAV = [
  { key: 'about', href: 'about.html', label: '關於我們 (About Us)',
    sub: [['about.html#history', '創社歷史與宗旨'], ['about.html#presidents', '歷屆社長與幹部'], ['about.html#members', '現任社友名錄']] },
  { key: 'news', href: 'news.html', label: '最新消息 (News)',
    sub: [['news.html#meeting', '例會時間與地點公告'], ['news.html#calendar', '重大行事曆']] },
  { key: 'events', href: 'events.html', label: '活動與展覽 (Events)',
    sub: [['events.html#register', '近期活動與線上報名'], ['events.html#gallery', '活動相簿']] },
  { key: 'portal', href: '#', action: 'portal', label: '社友專區 (Members Portal)' },
  { key: 'contact', href: 'contact.html', label: '聯絡我們 (Contact)' }
];

const AVATAR_COLOR = { guest: '#B0C4DE', member: '#2E8B57', admin: '#F8B400', developer: '#0077B6' };

function renderHeader() {
  const el = document.getElementById('siteHeader');
  if (!el) return;
  const page = document.body.dataset.page || '';
  const navHtml = NAV.map((n) => {
    const active = n.key === page ? ' class="active" aria-current="page"' : '';
    const action = n.action ? ` data-action="${n.action}"` : '';
    const sub = n.sub ? `<ul class="dropdown">${n.sub.map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul>` : '';
    return `<li class="nav-item"><a href="${n.href}"${active}${action}>${n.label}${n.sub ? ' ▾' : ''}</a>${sub}</li>`;
  }).join('');

  el.innerHTML = `
    <div class="header-top">
      <div class="logo">
        <a href="index.html">
          <div class="logo-img">Rotary</div>
          <span>躍齡扶輪社 Official Club</span>
        </a>
      </div>
      <div class="user-login-area" id="loginBtnWrap" role="button" tabindex="0" aria-haspopup="menu">
        <div class="avatar" id="userAvatar">User</div>
        <span class="login-text" id="loginStatusText">未登入 / 請登入</span>
      </div>
    </div>
    <nav><ul class="nav-list">${navHtml}</ul></nav>`;

  el.querySelector('[data-action="portal"]').addEventListener('click', (e) => {
    e.preventDefault();
    checkMemberAccess();
  });
  el.querySelector('#loginBtnWrap').addEventListener('click', toggleUserMenu);
}

function renderFooter() {
  const el = document.getElementById('siteFooter');
  if (!el) return;
  el.innerHTML = `
    <p>© 2026 躍齡扶輪社官方網站示範平台 | Yue-Ling Rotary Club Demonstration Website</p>
    <p class="footer-note">本系統架構由開發者設計，提供現任會長與幹部最便捷的內容維護體驗。</p>`;
}

function updateLoginUI() {
  const avatar = document.getElementById('userAvatar');
  const text = document.getElementById('loginStatusText');
  if (!avatar || !text) return;
  const u = RC.auth.current;
  if (!u) {
    avatar.textContent = 'User';
    avatar.style.backgroundColor = AVATAR_COLOR.guest;
    text.textContent = '未登入 / 請登入';
    return;
  }
  avatar.textContent = Array.from(u.displayName || u.username)[0].toUpperCase();
  avatar.style.backgroundColor = AVATAR_COLOR[u.role] || AVATAR_COLOR.member;
  text.textContent = `${u.displayName}（${RC.ROLE_LABEL[u.role]}）`;
}

// 未登入：跳到登入頁；已登入：展開個人選單
function toggleUserMenu() {
  const u = RC.auth.current;
  if (!u) {
    location.href = RC.loginHref();
    return;
  }
  const wrap = document.getElementById('loginBtnWrap');
  const existing = document.getElementById('userMenu');
  if (existing) {
    existing.remove();
    return;
  }
  const menu = document.createElement('div');
  menu.id = 'userMenu';
  menu.className = 'user-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <div class="user-menu__head">
      <strong>${RC.esc(u.displayName)}</strong>
      <span class="role-chip role--${u.role}">${RC.ROLE_LABEL[u.role]}</span>
      <small>帳號：${RC.esc(u.username)}</small>
    </div>
    ${RC.auth.isAdmin(u) ? `
      <a href="admin.html" role="menuitem">帳號審核與權限管理</a>
      <a href="index.html#heroSlider" role="menuitem">編輯首頁展示區</a>
      <a href="news.html" role="menuitem">編輯例會公告／行事曆</a>
      <a href="event-edit.html" role="menuitem">建立新活動</a>
      <a href="events.html#gallery" role="menuitem">管理活動相簿</a>
      <a href="about.html#members" role="menuitem">編輯社友名錄／歷屆社長</a>` : ''}
    <button type="button" data-act="logout" role="menuitem">登出</button>`;
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('[data-act="logout"]')) {
      RC.auth.logout();
      RC.toast('已登出');
      setTimeout(() => location.reload(), 400);
    }
  });
  wrap.appendChild(menu);
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('userMenu');
  if (menu && !e.target.closest('#loginBtnWrap')) menu.remove();
});

// 社友專區入口
function checkMemberAccess() {
  const u = RC.auth.current;
  if (!u) {
    if (confirm('【社友專區】需登入後才能使用。\n\n是否前往登入頁面？')) location.href = RC.loginHref();
    return;
  }
  if (RC.auth.isAdmin(u)) {
    location.href = 'admin.html';
    return;
  }
  alert('社友專區功能建置中，目前一般會員尚未開放專屬功能，敬請期待！');
}

/* 無障礙：role="button" 的元素支援 Enter / 空白鍵 */
document.addEventListener('keydown', (event) => {
  const el = event.target;
  if (!(el instanceof HTMLElement) || el.getAttribute('role') !== 'button') return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    el.click();
  }
});

/* 錨點跳轉時避開固定導覽列 */
function syncHeaderOffset() {
  const header = document.querySelector('header');
  if (header) document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
}

/* =========================================
   11. 輪播（首頁大輪播、歷任社長小輪播）
   ========================================= */
function createCarousel(selector, intervalMs) {
  let items = [];
  let index = 0;
  let timer = null;

  function show(next) {
    if (!items.length) return;
    items[index].classList.remove('active');
    index = (next + items.length) % items.length;
    items[index].classList.add('active');
  }
  function start() {
    clearInterval(timer);
    if (items.length > 1) timer = setInterval(() => show(index + 1), intervalMs);
  }
  return {
    // 內容由程式產生的輪播，渲染完要再呼叫一次 init
    init() {
      items = Array.from(document.querySelectorAll(selector));
      index = Math.max(0, items.findIndex((el) => el.classList.contains('active')));
      if (items.length && !items[index].classList.contains('active')) items[index].classList.add('active');
      start();
    },
    move(step) {
      if (!items.length) return;
      show(index + step);
      start();
    }
  };
}

RC.heroCarousel = createCarousel('.slide', 5000);
RC.presCarousel = createCarousel('.pres-slide', 3500);

// 供 HTML onclick 使用
function changeSlide(direction) { RC.heroCarousel.move(direction); }
function changePresSlide(direction) { RC.presCarousel.move(direction); }

/* =========================================
   12. 啟動
   ========================================= */
renderHeader();
renderFooter();
syncHeaderOffset();
window.addEventListener('resize', syncHeaderOffset);
RC.heroCarousel.init();

RC.ready = (async () => {
  try {
    await seed();
    await RC.auth.load();
    if (!DB.persistent) RC.toast('此瀏覽器不支援本機資料庫，資料重新整理後會消失', 'error', 6000);
  } catch (e) {
    console.error(e);
    RC.toast('資料庫初始化失敗：' + e.message, 'error', 6000);
  }
  updateLoginUI();
  syncHeaderOffset();
})();
