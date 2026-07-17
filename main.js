/* =========================================
   躍齡扶輪社官方網站 - 互動邏輯 (main.js)
   ========================================= */

// --- 1. 首頁幻燈片輪播控制 ---
let currentSlideIndex = 0;
const slides = document.querySelectorAll('.slide');
let slideInterval;

function initSlider() {
  if (slides.length === 0) return;
  startSlideTimer();
}

function changeSlide(direction) {
  if (slides.length === 0) return;
  slides[currentSlideIndex].classList.remove('active');
  currentSlideIndex = (currentSlideIndex + direction + slides.length) % slides.length;
  slides[currentSlideIndex].classList.add('active');
  resetSlideTimer();
}

function startSlideTimer() {
  slideInterval = setInterval(() => {
    changeSlide(1);
  }, 5000);
}

function resetSlideTimer() {
  clearInterval(slideInterval);
  startSlideTimer();
}

// --- 2. 模擬右上角登入與權限控制 ---
let currentUserRole = localStorage.getItem('rotary_user_role') || 'guest';

function updateLoginUI() {
  const avatar = document.getElementById('userAvatar');
  const loginText = document.getElementById('loginStatusText');
  
  if (!avatar || !loginText) return;

  if (currentUserRole === 'president') {
    avatar.textContent = 'Pres';
    avatar.style.backgroundColor = '#F8B400';
    loginText.textContent = '現任會長 / 編輯模式';
  } else if (currentUserRole === 'developer') {
    avatar.textContent = 'Dev';
    avatar.style.backgroundColor = '#0077B6';
    loginText.textContent = '系統開發者 (最高權限)';
  } else {
    avatar.textContent = 'User';
    avatar.style.backgroundColor = '#B0C4DE';
    loginText.textContent = '未登入 / 請登入';
  }
}

function toggleLoginModal() {
  let nextRole = 'guest';
  let message = '';

  if (currentUserRole === 'guest') {
    nextRole = 'president';
    message = '模擬登入成功！您現在身份為【現任社長/副社長】。\n您可以體驗未來後台管理員直接編輯海報、審核活動的功能！';
  } else if (currentUserRole === 'president') {
    nextRole = 'developer';
    message = '切換身份為【開發者 (Developer)】。\n擁有系統底層與資料庫的最高修改權限！';
  } else {
    nextRole = 'guest';
    message = '已登出系統，目前為一般訪客瀏覽模式。';
  }

  currentUserRole = nextRole;
  localStorage.setItem('rotary_user_role', currentUserRole);
  updateLoginUI();
  alert(message);
}

// --- 3. 權限檢查攔截器 ---
function checkMemberAccess(targetPage) {
  if (currentUserRole === 'guest') {
    const wantToLogin = confirm('【社友專區】為限定功能！\n此頁面包含內部通訊錄、財務報表與會議紀錄，需社友登入後方可閱讀。\n\n請問是否要登入?');
    if (wantToLogin) {
      toggleLoginModal();
    }
  } else {
    alert(`驗證成功！您目前的權限為【${currentUserRole === 'president' ? '現任幹部' : '開發者'}】。\n即將為您導向社友專屬的內部管理系統... (階段二將建置此專屬頁面)`);
  }
}

// --- 4. 歷任會長微型輪播控制 ---
let currentPresIndex = 0;
const presSlides = document.querySelectorAll('.pres-slide');
let presInterval;

function initPresSlider() {
  if (presSlides.length === 0) return;
  startPresTimer();
}

function changePresSlide(direction) {
  if (presSlides.length === 0) return;
  presSlides[currentPresIndex].classList.remove('active');
  currentPresIndex = (currentPresIndex + direction + presSlides.length) % presSlides.length;
  presSlides[currentPresIndex].classList.add('active');
  resetPresTimer();
}

function startPresTimer() {
  presInterval = setInterval(() => {
    changePresSlide(1);
  }, 3500);
}

function resetPresTimer() {
  clearInterval(presInterval);
  startPresTimer();
}

// --- 5. 頁面初始化 ---
document.addEventListener('DOMContentLoaded', () => {
  initSlider();
  initPresSlider();
  updateLoginUI();
  console.log("躍齡扶輪社前台系統已成功啟動！");
});