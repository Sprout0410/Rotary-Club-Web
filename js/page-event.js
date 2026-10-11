/* 單一活動頁 (event.html?id=...)：活動資訊、報名名單、報名表單、相關相簿 */
'use strict';

(function () {
  const esc = RC.esc;
  const root = document.getElementById('eventRoot');
  const eventId = RC.param('id');
  let ev = null;

  RC.ready.then(render);

  async function render() {
    ev = eventId ? await RC.api.events.get(eventId) : null;
    if (!ev) {
      root.innerHTML = `<section class="content-box empty-state"><h3>找不到這個活動</h3>
        <p>活動可能已被刪除。</p><a class="btn btn--primary" href="events.html">回到活動列表</a></section>`;
      return;
    }
    document.title = `${ev.title} | 躍齡扶輪社官方網站`;
    document.getElementById('eventTitle').textContent = ev.title;

    const isAdmin = RC.auth.isAdmin();
    const regs = await RC.api.registrations.listByEvent(ev.id);
    const people = regs.reduce((s, r) => s + (Number(r.headcount) || 1), 0);
    const state = RC.eventState(ev, people);
    const albums = (await RC.api.albums.listWithStats()).filter((a) => (ev.albumIds || []).includes(a.id));

    root.innerHTML = `
      ${isAdmin ? `
        <div class="toolbar">
          <a class="btn btn--sm btn--primary" href="event-edit.html?id=${encodeURIComponent(ev.id)}">編輯活動</a>
          <button type="button" class="btn btn--sm btn--danger" id="deleteEvent">刪除活動</button>
        </div>` : ''}

      <section class="content-box">
        <div class="event-detail-layout">
          <div class="event-poster">
            ${ev.posterImg ? `<img data-img="${esc(ev.posterImg)}" alt="${esc(ev.title)} 海報" id="posterImg">` : '<span class="poster-placeholder">活動海報</span>'}
          </div>
          <div class="event-info">
            ${RC.stateBadge(state)}
            <dl class="info-list">
              <dt>活動時間</dt><dd>${esc(RC.eventWhen(ev))}</dd>
              ${ev.location ? `<dt>活動地點</dt><dd>${esc(ev.location)}</dd>` : ''}
              ${ev.regStartAt && ev.regMode !== 'none' ? `<dt>報名開始</dt><dd>${esc(RC.fmtDateTime(ev.regStartAt))}</dd>` : ''}
              ${ev.deadline ? `<dt>報名截止</dt><dd>${esc(RC.fmtDateTime(ev.deadline))}</dd>` : ''}
              ${ev.regMode === 'internal' ? `<dt>目前報名</dt><dd>${regs.length} 組・${people} 人${ev.capacity ? `（名額 ${ev.capacity} 人，剩餘 ${Math.max(0, ev.capacity - people)} 位）` : ''}</dd>` : ''}
            </dl>
            <p class="event-summary">${RC.nl2br(ev.summary)}</p>
            ${ctaHtml(state)}
          </div>
        </div>
      </section>

      ${ev.content ? `<section class="content-box"><h3>活動內容</h3><div class="rich-text">${RC.nl2br(ev.content)}</div></section>` : ''}

      ${signupSection(state, regs, people)}

      ${albums.length ? `
        <section class="content-box" id="albums">
          <h3>相關活動相簿</h3>
          <div class="album-grid">${albums.map((a) => `
            <a class="album-card" href="album.html?id=${encodeURIComponent(a.id)}">
              <div class="album-card__cover">${a.cover ? `<img data-img="${esc(a.cover)}" alt="">` : '<span>尚無照片</span>'}</div>
              <div class="album-card__meta"><h4 class="mini-title">${esc(a.title)}</h4>
                <span class="meta-text">${a.date ? RC.fmtDate(a.date) + '・' : ''}${a.count} 張照片</span></div>
            </a>`).join('')}</div>
        </section>` : ''}

      ${isAdmin && ev.regMode === 'internal' ? adminTable(regs) : ''}`;

    RC.images.hydrate(root);
    bindEvents(isAdmin, regs);
    RC.scrollToHash();
    scheduleAutoOpen();
  }

  // 頁面開著時剛好到報名開始時間：自動重新整理成可報名狀態（24 小時內才計時）
  let openTimer = null;
  function scheduleAutoOpen() {
    clearTimeout(openTimer);
    const opensAt = RC.parseDate(ev.regStartAt);
    if (ev.status !== 'preparing' || !opensAt) return;
    const wait = opensAt - new Date() + 1000;
    if (wait > 0 && wait < 86400000) openTimer = setTimeout(render, wait);
  }

  function ctaHtml(state) {
    if (ev.regMode === 'external') {
      const url = RC.safeUrl(ev.externalUrl);
      return state.key === 'open' && url
        ? `<a class="btn btn--lg" href="${esc(url)}" target="_blank" rel="noopener">前往報名表單 ➔</a>`
        : `<p class="form-hint">${state.key === 'open' ? '報名連結尚未設定' : '目前' + state.label}</p>`;
    }
    if (ev.regMode === 'internal') {
      return state.key === 'open'
        ? '<a class="btn btn--lg" href="#signup">我要報名 ➔</a>'
        : `<p class="form-hint">目前${state.label}，暫不開放報名</p>`;
    }
    return '<p class="form-hint">此活動不開放線上報名</p>';
  }

  /* 報名狀況：名字遮蔽＋同行人數；可報名時附上表單 */
  function signupSection(state, regs, people) {
    if (ev.regMode !== 'internal') return '';
    const chips = regs.length
      ? `<ul class="registrant-list">${regs.map((r) =>
          `<li class="registrant-chip">${esc(RC.maskName(r.name))}<b>${Number(r.headcount) || 1} 人</b></li>`).join('')}</ul>`
      : '<p class="empty-state">目前還沒有人報名，歡迎成為第一位！</p>';

    return `
      <section class="content-box" id="signup">
        <h3>報名狀況</h3>
        <p class="reg-summary">目前共 <strong>${regs.length}</strong> 組、<strong>${people}</strong> 人報名${ev.capacity ? `（名額 ${ev.capacity} 人）` : ''}</p>
        ${chips}
        <p class="form-hint">為保護個資，名單僅顯示部分姓名；數字為該組的同行總人數。</p>
        ${state.key === 'open' ? signupForm() : ''}
      </section>`;
  }

  function signupForm() {
    const u = RC.auth.current;
    const custom = (ev.fields || []).map((f) => {
      const id = 'q_' + f.id;
      const req = f.required ? ' required' : '';
      const label = `<label for="${id}">${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>`;
      if (f.type === 'textarea') return `<div class="form-group">${label}<textarea id="${id}" name="${id}" class="form-control" rows="3"${req}></textarea></div>`;
      if (f.type === 'select') {
        return `<div class="form-group">${label}<select id="${id}" name="${id}" class="form-control"${req}>
          <option value="">-- 請選擇 --</option>${(f.options || []).map((o) => `<option>${esc(o)}</option>`).join('')}</select></div>`;
      }
      return `<div class="form-group">${label}<input type="text" id="${id}" name="${id}" class="form-control"${req}></div>`;
    }).join('');

    return `
      <div class="form-wrap">
        <h4 class="form-title">填寫報名表</h4>
        <form id="signupForm">
          <div class="form-row">
            <div class="form-group">
              <label for="regName">報名人姓名 <span class="req">*</span></label>
              <input type="text" id="regName" name="name" class="form-control" autocomplete="name" required value="${esc(u ? u.displayName : '')}">
            </div>
            <div class="form-group">
              <label for="regHead">同行總人數（含本人） <span class="req">*</span></label>
              <input type="number" id="regHead" name="headcount" class="form-control" min="1" max="${RC.config.MAX_HEADCOUNT}" value="1" required>
            </div>
          </div>
          <div class="form-group">
            <label for="regContact">聯絡電話或 Email <span class="req">*</span></label>
            <input type="text" id="regContact" name="contact" class="form-control" required value="${esc(u ? (u.phone || u.email || '') : '')}">
            <p class="form-hint">僅供主辦單位聯繫使用，不會公開顯示。</p>
          </div>
          ${custom}
          <div class="form-group">
            <label for="regNote">備註</label>
            <textarea id="regNote" name="note" class="form-control" rows="2" placeholder="例如：同行者姓名、特殊需求"></textarea>
          </div>
          <p class="form-error" id="signupError" hidden></p>
          <div class="form-actions"><button type="submit" class="btn btn--block btn--lg">確認送出報名</button></div>
        </form>
      </div>`;
  }

  function adminTable(regs) {
    const fields = ev.fields || [];
    return `
      <section class="content-box admin-only" id="regAdmin">
        <div class="section-head">
          <h3>報名名單管理（僅管理員可見）</h3>
          <div class="toolbar"><button type="button" class="btn btn--sm btn--ghost" id="exportCsv"${regs.length ? '' : ' disabled'}>匯出 Excel 可開啟的 CSV</button></div>
        </div>
        ${regs.length ? `
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>報名時間</th><th>姓名</th><th>聯絡方式</th><th>人數</th>${fields.map((f) => `<th>${esc(f.label)}</th>`).join('')}<th>備註</th><th></th></tr></thead>
            <tbody>${regs.map((r) => `
              <tr data-id="${r.id}">
                <td>${RC.fmtStamp(r.createdAt)}</td><td>${esc(r.name)}</td><td>${esc(r.contact)}</td><td>${Number(r.headcount) || 1}</td>
                ${fields.map((f) => `<td>${esc((r.answers || {})[f.id] || '')}</td>`).join('')}
                <td>${esc(r.note || '')}</td>
                <td><button type="button" class="btn btn--xs btn--danger" data-act="del">刪除</button></td>
              </tr>`).join('')}</tbody>
          </table></div>` : '<p class="empty-state">尚無報名資料。</p>'}
      </section>`;
  }

  function bindEvents(isAdmin, regs) {
    const poster = document.getElementById('posterImg');
    if (poster) {
      poster.addEventListener('click', async () => RC.lightbox([await RC.images.get(ev.posterImg)], 0, [ev.title]));
    }

    const form = document.getElementById('signupForm');
    if (form) form.addEventListener('submit', (e) => submitSignup(e, form, regs));

    if (!isAdmin) return;
    const del = document.getElementById('deleteEvent');
    if (del) {
      del.addEventListener('click', async () => {
        if (!confirm(`確定刪除活動「${ev.title}」？\n報名資料會一併刪除，此動作無法復原。`)) return;
        await RC.api.events.remove(ev.id);
        RC.toast('活動已刪除', 'success');
        setTimeout(() => { location.href = 'events.html'; }, 500);
      });
    }
    document.querySelectorAll('#regAdmin tr[data-id]').forEach((tr) => {
      tr.querySelector('[data-act="del"]').addEventListener('click', async () => {
        if (!confirm(`確定刪除「${tr.children[1].textContent}」的報名？`)) return;
        await RC.api.registrations.remove(tr.dataset.id);
        RC.toast('已刪除報名', 'success');
        render();
      });
    });
    const exp = document.getElementById('exportCsv');
    if (exp) exp.addEventListener('click', () => exportCsv(regs));
  }

  async function submitSignup(e, form, regs) {
    e.preventDefault();
    const err = document.getElementById('signupError');
    err.hidden = true;
    const f = form.elements;
    const name = f.name.value.trim();
    const contact = f.contact.value.trim();
    const headcount = parseInt(f.headcount.value, 10);

    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    if (!name || !contact) return fail('請填寫姓名與聯絡方式');
    if (!(headcount >= 1 && headcount <= RC.config.MAX_HEADCOUNT)) return fail(`同行人數請填 1 到 ${RC.config.MAX_HEADCOUNT} 人`);

    const answers = {};
    for (const q of ev.fields || []) {
      const v = (f['q_' + q.id].value || '').trim();
      if (q.required && !v) return fail(`請填寫「${q.label}」`);
      answers[q.id] = v;
    }

    const dup = regs.find((r) => r.name === name && r.contact === contact);
    if (dup && !confirm('已經有相同姓名與聯絡方式的報名紀錄，確定要再報名一次嗎？')) return;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await RC.api.registrations.add({ eventId: ev.id, name, contact, headcount, answers, note: f.note.value.trim() });
      RC.toast('報名成功！感謝您的參與', 'success', 4000);
      await render();
      location.hash = '';
      document.getElementById('signup').scrollIntoView();
    } catch (ex) {
      fail(ex.message);
      btn.disabled = false;
    }
  }

  function exportCsv(regs) {
    const fields = ev.fields || [];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['報名時間', '姓名', '聯絡方式', '人數', ...fields.map((f) => f.label), '備註']];
    regs.forEach((r) => rows.push([
      RC.fmtStamp(r.createdAt), r.name, r.contact, r.headcount,
      ...fields.map((f) => (r.answers || {})[f.id] || ''), r.note || ''
    ]));
    const csv = '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
    RC.downloadText(`${ev.title}_報名名單.csv`, csv, 'text/csv');
  }
})();
