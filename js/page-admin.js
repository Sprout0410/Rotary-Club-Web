/* 帳號審核與權限管理 (admin.html)：管理員以上可用 */
'use strict';

(function () {
  const root = document.getElementById('adminRoot');
  const esc = RC.esc;

  RC.ready.then(() => {
    if (!RC.guardAdmin(root)) return;
    const activate = RC.bindTabs(root, (name) => { if (name === 'backup') renderBackup(); });
    if (location.hash) activate(location.hash.slice(1));
    document.getElementById('accountSearch').addEventListener('input', renderAccounts);
    refreshAll();
  });

  async function refreshAll() {
    await Promise.all([renderPending(), renderAccounts(), renderNotices()]);
  }

  const contactHtml = (u) => [
    u.email ? `<div>✉ ${esc(u.email)}</div>` : '',
    u.phone ? `<div>☎ ${esc(u.phone)}</div>` : ''
  ].join('') || '<span class="text-muted">—</span>';

  function setCount(id, n) {
    const el = document.getElementById(id);
    el.textContent = n || '';
    el.hidden = !n;
  }

  /* ---------- 待審核申請 ---------- */
  async function renderPending() {
    const box = document.getElementById('pendingList');
    const pending = (await RC.api.users.list()).filter((u) => u.status === 'pending');
    setCount('pendingCount', pending.length);
    if (!pending.length) {
      box.innerHTML = '<p class="empty-state">目前沒有待審核的帳號申請。</p>';
      return;
    }
    box.innerHTML = `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>申請時間</th><th>帳號</th><th>姓名</th><th>聯絡方式</th><th>核准為</th><th>審核</th></tr></thead>
        <tbody>${pending.map((u) => `
          <tr data-id="${u.id}">
            <td>${RC.fmtStamp(u.createdAt)}</td>
            <td>${esc(u.username)}</td>
            <td>${esc(u.displayName)}</td>
            <td>${contactHtml(u)}</td>
            <td><select class="form-control form-control--sm" data-role>
              <option value="member">一般會員</option><option value="admin">管理員</option></select></td>
            <td class="cell-actions">
              <button type="button" class="btn btn--xs btn--success" data-act="approve">通過</button>
              <button type="button" class="btn btn--xs btn--danger" data-act="reject">退回</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>`;

    box.querySelectorAll('tr[data-id]').forEach((tr) => {
      const id = tr.dataset.id;
      tr.querySelector('[data-act="approve"]').addEventListener('click', async () => {
        const role = tr.querySelector('[data-role]').value;
        await run(() => RC.api.users.review(id, true, { role }), '已核准，審核結果通知已建立，請到「審核通知寄送」寄出');
      });
      tr.querySelector('[data-act="reject"]').addEventListener('click', async () => {
        const reason = prompt('請輸入退回原因（會寫在通知內容中，可留空）：', '');
        if (reason === null) return;
        await run(() => RC.api.users.review(id, false, { reason: reason.trim() }), '已退回，審核結果通知已建立');
      });
    });
  }

  /* ---------- 全部帳號 ---------- */
  async function renderAccounts() {
    const box = document.getElementById('accountList');
    const keyword = document.getElementById('accountSearch').value.trim().toLowerCase();
    const me = RC.auth.current;
    const users = (await RC.api.users.list()).filter((u) =>
      !keyword || [u.username, u.displayName, u.email, u.phone].some((v) => String(v || '').toLowerCase().includes(keyword)));

    if (!users.length) {
      box.innerHTML = '<p class="empty-state">找不到符合的帳號。</p>';
      return;
    }
    box.innerHTML = `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>帳號</th><th>姓名</th><th>聯絡方式</th><th>身分</th><th>狀態</th><th>最後登入</th><th>操作</th></tr></thead>
        <tbody>${users.map((u) => {
          const locked = u.role === 'developer' || u.id === me.id;
          const roleCell = locked || u.status !== 'active'
            ? `<span class="role-chip role--${u.role}">${RC.ROLE_LABEL[u.role]}</span>`
            : `<select class="form-control form-control--sm" data-act="role">
                 <option value="member"${u.role === 'member' ? ' selected' : ''}>一般會員</option>
                 <option value="admin"${u.role === 'admin' ? ' selected' : ''}>管理員</option>
               </select>`;
          let actions = '';
          if (u.role === 'developer') actions = '<span class="text-muted">受保護</span>';
          else if (u.id === me.id) actions = '<span class="text-muted">（您自己）</span>';
          else {
            if (u.status === 'active') actions += '<button type="button" class="btn btn--xs btn--ghost" data-act="disable">停用</button>';
            if (u.status === 'disabled') actions += '<button type="button" class="btn btn--xs btn--success" data-act="enable">啟用</button>';
            if (u.status === 'rejected' || u.status === 'pending') actions += '<button type="button" class="btn btn--xs btn--success" data-act="approve">改為通過</button>';
            actions += '<button type="button" class="btn btn--xs btn--ghost" data-act="password">重設密碼</button>';
            actions += '<button type="button" class="btn btn--xs btn--danger" data-act="delete">刪除</button>';
          }
          return `
            <tr data-id="${u.id}">
              <td>${esc(u.username)}</td>
              <td>${esc(u.displayName)}</td>
              <td>${contactHtml(u)}</td>
              <td>${roleCell}</td>
              <td><span class="status-chip status--${u.status}">${RC.STATUS_LABEL[u.status]}</span></td>
              <td>${u.lastLoginAt ? RC.fmtStamp(u.lastLoginAt) : '<span class="text-muted">—</span>'}</td>
              <td class="cell-actions">${actions}</td>
            </tr>`;
        }).join('')}</tbody>
      </table></div>`;

    box.querySelectorAll('tr[data-id]').forEach((tr) => {
      const id = tr.dataset.id;
      const name = tr.children[0].textContent;
      const on = (act, fn) => {
        const el = tr.querySelector(`[data-act="${act}"]`);
        if (el) el.addEventListener(act === 'role' ? 'change' : 'click', fn);
      };
      on('role', (e) => run(() => RC.api.users.update(id, { role: e.target.value }), `已將 ${name} 設為${RC.ROLE_LABEL[e.target.value]}`));
      on('disable', () => confirm(`確定停用帳號「${name}」？停用後將無法登入。`) &&
        run(() => RC.api.users.update(id, { status: 'disabled' }), '已停用'));
      on('enable', () => run(() => RC.api.users.update(id, { status: 'active' }), '已重新啟用'));
      on('approve', () => run(() => RC.api.users.review(id, true, { role: 'member' }), '已改為通過，審核通知已建立'));
      on('delete', () => confirm(`確定刪除帳號「${name}」？此動作無法復原。`) &&
        run(() => RC.api.users.remove(id), '已刪除帳號'));
      on('password', () => {
        const pw = prompt(`請輸入「${name}」的新密碼（${RC.config.PASSWORD_MIN_LENGTH} 碼以上，需含英文字母與數字）：`);
        if (pw) run(() => RC.api.users.resetPassword(id, pw), '密碼已重設，請將新密碼告知該社友');
      });
    });
  }

  /* ---------- 審核通知寄送 ---------- */
  async function renderNotices() {
    const box = document.getElementById('noticeList');
    const list = await RC.api.notifications.list();
    setCount('noticeCount', list.filter((n) => !n.sent).length);
    if (!list.length) {
      box.innerHTML = '<p class="empty-state">目前沒有審核通知。審核帳號後會自動產生。</p>';
      return;
    }
    box.innerHTML = list.map((n) => {
      const sendHref = n.channel === 'email'
        ? `mailto:${encodeURIComponent(n.to)}?subject=${encodeURIComponent(n.subject)}&body=${encodeURIComponent(n.body)}`
        : `sms:${encodeURIComponent(n.to)}?body=${encodeURIComponent(n.subject + '\n' + n.body)}`;
      return `
        <article class="notice-card${n.sent ? ' notice-card--sent' : ''}" data-id="${n.id}">
          <div class="notice-card__head">
            <div>
              <strong>${esc(n.subject)}</strong>
              <div class="meta-text">收件：${esc(n.displayName)}・${n.channel === 'email' ? 'Email' : '簡訊'} ${esc(n.to)}・建立於 ${RC.fmtStamp(n.createdAt)}</div>
            </div>
            <span class="status-chip ${n.sent ? 'status--active' : 'status--pending'}">${n.sent ? '已寄出' : '尚未寄出'}</span>
          </div>
          <pre class="notice-card__body">${esc(n.body)}</pre>
          <div class="cell-actions">
            <a class="btn btn--xs btn--primary" href="${sendHref}">${n.channel === 'email' ? '開啟郵件軟體寄出' : '開啟簡訊寄出'}</a>
            <button type="button" class="btn btn--xs btn--ghost" data-act="copy">複製內容</button>
            <button type="button" class="btn btn--xs btn--ghost" data-act="sent">${n.sent ? '改回未寄出' : '標記為已寄出'}</button>
            <button type="button" class="btn btn--xs btn--danger" data-act="delete">刪除</button>
          </div>
        </article>`;
    }).join('');

    box.querySelectorAll('.notice-card').forEach((card) => {
      const n = list.find((x) => x.id === card.dataset.id);
      card.querySelector('[data-act="copy"]').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(`${n.subject}\n\n${n.body}`);
          RC.toast('已複製通知內容', 'success');
        } catch (e) {
          RC.toast('瀏覽器不允許自動複製，請手動選取文字', 'error');
        }
      });
      card.querySelector('[data-act="sent"]').addEventListener('click', () =>
        run(() => RC.api.notifications.setSent(n.id, !n.sent), n.sent ? '已改回未寄出' : '已標記為寄出'));
      card.querySelector('[data-act="delete"]').addEventListener('click', () =>
        confirm('確定刪除這則通知紀錄？') && run(() => RC.api.notifications.remove(n.id), '已刪除'));
    });
  }

  /* ---------- 資料備份 ---------- */
  function renderBackup() {
    const box = document.getElementById('backupPanel');
    const dev = RC.auth.isDeveloper();
    box.innerHTML = `
      <p>示範版的資料只存在這台電腦的瀏覽器。換電腦或清除瀏覽器資料前，請先匯出備份。</p>
      <div class="toolbar toolbar--start">
        <button type="button" class="btn btn--primary" data-act="export">匯出全部資料（JSON）</button>
        ${dev ? `
          <label class="btn btn--ghost">匯入備份檔<input type="file" accept="application/json,.json" data-act="import" hidden></label>
          <button type="button" class="btn btn--danger" data-act="reset">清空並重設為示範資料</button>` : ''}
      </div>
      ${dev ? '' : '<p class="form-hint">匯入與重設僅開放給開發者帳號。</p>'}`;

    box.querySelector('[data-act="export"]').addEventListener('click', async () => {
      const json = await RC.api.backup.exportAll();
      const d = new Date();
      RC.downloadText(`躍齡扶輪社備份_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`, json, 'application/json');
    });
    if (!dev) return;
    box.querySelector('[data-act="import"]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !confirm('匯入會「覆蓋」目前所有資料，確定繼續？')) return;
      try {
        await RC.api.backup.importAll(await file.text());
        RC.toast('匯入完成', 'success');
        setTimeout(() => location.reload(), 600);
      } catch (ex) {
        RC.toast('匯入失敗：' + ex.message, 'error', 5000);
      }
    });
    box.querySelector('[data-act="reset"]').addEventListener('click', async () => {
      if (!confirm('確定清空「所有」帳號、活動、報名與相簿，重設為示範資料？此動作無法復原。')) return;
      await run(() => RC.api.backup.resetDemo(), '已重設');
      setTimeout(() => location.reload(), 600);
    });
  }

  // 執行操作 → 顯示結果 → 重新整理列表
  async function run(fn, okMsg) {
    try {
      await fn();
      if (okMsg) RC.toast(okMsg, 'success', 3500);
    } catch (ex) {
      RC.toast(ex.message, 'error', 4000);
    }
    await refreshAll();
  }
})();
