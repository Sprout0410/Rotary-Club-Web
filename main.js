/* =========================================
   躍齡扶輪社官方網站 - 互動邏輯 (main.js)
   HTML 內 inline onclick 會呼叫的全域函式：
   changeSlide / changePresSlide / toggleLoginModal / checkMemberAccess
   ========================================= */
'use strict';

// --- 0. 共用工具 ---

// localStorage 在無痕模式、封鎖 Cookie 或本機 file:// 開啟時可能丟錯，
// 包一層避免整支 JS 因此中斷（失敗時只是登入狀態無法跨頁記憶）
const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) { /* 忽略 */ }
  }
};

// 把頂部導覽列實際高度寫進 CSS 變數，讓錨點跳轉不會被固定導覽列蓋住
function syncHeaderOffset() {
  const header = document.querySelector('header');
  if (header) {
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  }
}

// --- 1. 通用輪播（首頁大輪播、歷任社長小輪播共用） ---
function createCarousel(slideSelector, intervalMs) {
  const items = Array.from(document.querySelectorAll(slideSelector));
  let index = Math.max(0, items.findIndex(el => el.classList.contains('active')));
  let timer = null;

  function show(next) {
    items[index].classList.remove('active');
    index = (next + items.length) % items.length;
    items[index].classList.add('active');
  }

  function start() {
    clearInterval(timer);
    timer = setInterval(() => show(index + 1), intervalMs);
  }

  return {
    init() {
      if (items.length > 1) start();
    },
    // 手動切換後重新計時，避免剛按完就被自動切走
    move(step) {
      if (items.length === 0) return;
      show(index + step);
      start();
    }
  };
}

const heroCarousel = createCarousel('.slide', 5000);
const presCarousel = createCarousel('.pres-slide', 3500);

function changeSlide(direction) {
  heroCarousel.move(direction);
}

function changePresSlide(direction) {
  presCarousel.move(direction);
}

// --- 2. 模擬右上角登入與權限控制 ---
// 點擊頭像依序切換：guest → president → developer → guest
const ROLE_STORAGE_KEY = 'rotary_user_role';

const ROLES = {
  guest: {
    avatar: 'User',
    color: '#B0C4DE',
    label: '未登入 / 請登入',
    next: 'president',
    enterMessage: '已登出系統，目前為一般訪客瀏覽模式。'
  },
  president: {
    avatar: 'Pres',
    color: '#F8B400',
    label: '現任會長 / 編輯模式',
    accessName: '現任幹部',
    next: 'developer',
    enterMessage: '模擬登入成功！您現在身份為【現任社長/副社長】。\n您可以體驗未來後台管理員直接編輯海報、審核活動的功能！'
  },
  developer: {
    avatar: 'Dev',
    color: '#0077B6',
    label: '系統開發者 (最高權限)',
    accessName: '開發者',
    next: 'guest',
    enterMessage: '切換身份為【開發者 (Developer)】。\n擁有系統底層與資料庫的最高修改權限！'
  }
};

// 若儲存值被竄改或是舊版本留下的未知值，一律回到訪客
let currentUserRole = storage.get(ROLE_STORAGE_KEY, 'guest');
if (!ROLES[currentUserRole]) currentUserRole = 'guest';

function updateLoginUI() {
  const avatar = document.getElementById('userAvatar');
  const loginText = document.getElementById('loginStatusText');
  if (!avatar || !loginText) return;

  const role = ROLES[currentUserRole];
  avatar.textContent = role.avatar;
  avatar.style.backgroundColor = role.color;
  loginText.textContent = role.label;
}

function toggleLoginModal() {
  currentUserRole = ROLES[currentUserRole].next;
  storage.set(ROLE_STORAGE_KEY, currentUserRole);
  updateLoginUI();
  alert(ROLES[currentUserRole].enterMessage);
}

// --- 3. 權限檢查攔截器 ---
// targetPage 預留給階段二：依不同目標頁導向
function checkMemberAccess(targetPage) {
  if (currentUserRole === 'guest') {
    const wantToLogin = confirm('【社友專區】為限定功能！\n此頁面包含內部通訊錄、財務報表與會議紀錄，需社友登入後方可閱讀。\n\n請問是否要登入?');
    if (wantToLogin) {
      toggleLoginModal();
    }
  } else {
    alert(`驗證成功！您目前的權限為【${ROLES[currentUserRole].accessName}】。\n即將為您導向社友專屬的內部管理系統... (階段二將建置此專屬頁面)`);
  }
}

// --- 4. 無障礙：role="button" 的元素（右上角登入區）支援 Enter / 空白鍵 ---
document.addEventListener('keydown', (event) => {
  const el = event.target;
  if (!(el instanceof HTMLElement) || el.getAttribute('role') !== 'button') return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    el.click();
  }
});

// --- 5. 頁面初始化 ---
// script 放在 </body> 前，header 已解析完成，先同步高度讓錨點定位正確
syncHeaderOffset();
window.addEventListener('resize', syncHeaderOffset);

document.addEventListener('DOMContentLoaded', () => {
  heroCarousel.init();
  presCarousel.init();
  updateLoginUI();
  syncHeaderOffset();
  console.log('躍齡扶輪社前台系統已成功啟動！');
});
