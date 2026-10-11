/* 登入／申請帳號頁 (login.html) */
'use strict';

(function () {
  const box = document.querySelector('.auth-box');
  const activate = RC.bindTabs(box);
  if (location.hash === '#register') activate('register');

  const next = RC.safeNext(RC.param('next')) || 'index.html';
  document.getElementById('pwRule').textContent =
    `至少 ${RC.config.PASSWORD_MIN_LENGTH} 碼，且必須同時包含英文字母與數字`;

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = !msg;
  }

  /* ----- 登入 ----- */
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(loginError, '');
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await RC.ready;
      const u = await RC.auth.login(loginForm.username.value, loginForm.password.value);
      RC.toast(`歡迎回來，${u.displayName}！`, 'success');
      setTimeout(() => { location.href = next; }, 500);
    } catch (ex) {
      showError(loginError, ex.message);
      btn.disabled = false;
    }
  });

  /* ----- 申請帳號 ----- */
  const regForm = document.getElementById('registerForm');
  const regError = document.getElementById('registerError');
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(regError, '');
    const btn = regForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await RC.ready;
      const f = regForm.elements;
      const u = await RC.auth.register({
        username: f.username.value,
        displayName: f.displayName.value,
        password: f.password.value,
        password2: f.password2.value,
        email: f.email.value,
        phone: f.phone.value
      });
      const to = u.email ? `Email（${u.email}）` : `手機簡訊（${u.phone}）`;
      regForm.hidden = true;
      const done = document.getElementById('registerDone');
      done.innerHTML = `
        <div class="notice notice--success">
          <h4>申請已送出！</h4>
          <p>帳號「${RC.esc(u.username)}」目前為<strong>待審核</strong>狀態。</p>
          <p>管理員審核後，結果會以 ${RC.esc(to)} 通知您，通過後即可登入。</p>
        </div>
        <a class="btn btn--ghost" href="index.html">回到首頁</a>`;
      done.hidden = false;
    } catch (ex) {
      showError(regError, ex.message);
    } finally {
      btn.disabled = false;
    }
  });

  /* 已登入時提示 */
  RC.ready.then(() => {
    const u = RC.auth.current;
    if (!u) return;
    document.getElementById('alreadyIn').innerHTML = `
      <div class="notice">
        您目前已登入為 <strong>${RC.esc(u.displayName)}</strong>（${RC.ROLE_LABEL[u.role]}）。
        <a href="${RC.esc(next)}">繼續瀏覽</a>，或點右上角登出後切換帳號。
      </div>`;
  });
})();
