/* 建立／編輯活動 (event-edit.html[?id=...])：管理員以上可用 */
'use strict';

(function () {
  const esc = RC.esc;
  const root = document.getElementById('editRoot');
  const editId = RC.param('id');

  let ev = null;            // 編輯中的活動
  let fields = [];          // 自訂報名題目
  let posterFile = null;    // 新選的海報檔
  let removePoster = false;

  const TYPE_LABEL = { text: '簡答', textarea: '詳答（多行）', select: '下拉選單' };

  RC.ready.then(async () => {
    if (!RC.guardAdmin(root)) return;
    if (editId) {
      ev = await RC.api.events.get(editId);
      if (!ev) {
        root.innerHTML = '<section class="content-box empty-state"><h3>找不到這個活動</h3><a class="btn btn--primary" href="events.html">回到活動列表</a></section>';
        return;
      }
      document.getElementById('editTitle').textContent = '編輯活動';
      document.title = '編輯活動 | 躍齡扶輪社官方網站';
    } else {
      ev = {
        title: '', status: 'open', summary: '', content: '', startAt: '', endAt: '', location: '', regStartAt: '', deadline: '',
        capacity: 0, posterImg: '', regMode: 'internal', externalUrl: '', fields: [], albumIds: []
      };
    }
    fields = JSON.parse(JSON.stringify(ev.fields || []));
    await fillForm();
    bind();
  });

  async function fillForm() {
    const f = document.getElementById('eventForm').elements;
    ['title', 'status', 'summary', 'content', 'startAt', 'endAt', 'location', 'regStartAt', 'deadline', 'externalUrl'].forEach((k) => {
      f[k].value = ev[k] || '';
    });
    f.capacity.value = ev.capacity || '';
    f.regMode.value = ev.regMode || 'internal';
    toggleRegMode();
    await renderPoster();
    renderFields();

    const albums = await RC.api.albums.list();
    const box = document.getElementById('albumChecks');
    box.innerHTML = albums.length
      ? albums.map((a) => `
          <label class="check-item">
            <input type="checkbox" name="albumIds" value="${esc(a.id)}"${(ev.albumIds || []).includes(a.id) ? ' checked' : ''}>
            <span>${esc(a.title)}${a.date ? `<small>${RC.fmtDate(a.date)}</small>` : ''}</span>
          </label>`).join('')
      : '<p class="empty-state">目前還沒有相簿，可先到「活動相簿」新增。</p>';

    document.getElementById('deleteBtn').hidden = !ev.id;
  }

  async function renderPoster() {
    const box = document.getElementById('posterPreview');
    let src = '';
    if (posterFile) src = URL.createObjectURL(posterFile);
    else if (ev.posterImg && !removePoster) src = await RC.images.get(ev.posterImg);
    box.innerHTML = src ? `<img src="${src}" alt="海報預覽">` : '<span class="poster-placeholder">尚未上傳海報</span>';
    document.getElementById('removePoster').hidden = !src;
  }

  function toggleRegMode() {
    const mode = document.getElementById('eventForm').elements.regMode.value;
    document.querySelectorAll('[data-mode]').forEach((el) => { el.hidden = el.dataset.mode !== mode; });
    document.getElementById('externalUrl').required = mode === 'external';
  }

  /* ----- 自訂報名題目 ----- */
  function renderFields() {
    const box = document.getElementById('fieldList');
    if (!fields.length) {
      box.innerHTML = '<p class="form-hint">尚未新增自訂題目（例如：飲食需求、是否需要接駁、T 恤尺寸）。</p>';
      return;
    }
    box.innerHTML = fields.map((q, i) => `
      <div class="field-row" data-i="${i}">
        <input type="text" class="form-control" data-k="label" placeholder="題目名稱，例如：飲食需求" value="${esc(q.label)}">
        <select class="form-control" data-k="type">
          ${Object.entries(TYPE_LABEL).map(([v, t]) => `<option value="${v}"${q.type === v ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
        <input type="text" class="form-control" data-k="options" placeholder="選項，用逗號分隔：葷食, 素食"
          value="${esc((q.options || []).join(', '))}"${q.type === 'select' ? '' : ' hidden'}>
        <label class="inline-check"><input type="checkbox" data-k="required"${q.required ? ' checked' : ''}> 必填</label>
        <button type="button" class="btn btn--xs btn--ghost" data-act="up" aria-label="上移"${i === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" class="btn btn--xs btn--ghost" data-act="down" aria-label="下移"${i === fields.length - 1 ? ' disabled' : ''}>↓</button>
        <button type="button" class="btn btn--xs btn--danger" data-act="remove">刪除</button>
      </div>`).join('');
  }

  function bind() {
    const form = document.getElementById('eventForm');

    form.querySelectorAll('input[name="regMode"]').forEach((r) => r.addEventListener('change', toggleRegMode));

    document.getElementById('posterInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        RC.toast('請選擇圖片檔', 'error');
        e.target.value = '';
        return;
      }
      posterFile = file;
      removePoster = false;
      await renderPoster();
    });
    document.getElementById('removePoster').addEventListener('click', async () => {
      posterFile = null;
      removePoster = true;
      document.getElementById('posterInput').value = '';
      await renderPoster();
    });

    document.getElementById('addField').addEventListener('click', () => {
      fields.push({ id: RC.uid('f_'), label: '', type: 'text', options: [], required: false });
      renderFields();
      const rows = document.querySelectorAll('.field-row');
      rows[rows.length - 1].querySelector('input').focus();
    });

    const list = document.getElementById('fieldList');
    list.addEventListener('input', syncField);
    list.addEventListener('change', syncField);
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const i = Number(btn.closest('.field-row').dataset.i);
      if (btn.dataset.act === 'remove') fields.splice(i, 1);
      if (btn.dataset.act === 'up' && i > 0) [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]];
      if (btn.dataset.act === 'down' && i < fields.length - 1) [fields[i + 1], fields[i]] = [fields[i], fields[i + 1]];
      renderFields();
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      location.href = ev.id ? `event.html?id=${encodeURIComponent(ev.id)}` : 'events.html';
    });
    document.getElementById('deleteBtn').addEventListener('click', async () => {
      if (!confirm(`確定刪除活動「${ev.title}」？\n報名資料會一併刪除，此動作無法復原。`)) return;
      await RC.api.events.remove(ev.id);
      RC.toast('活動已刪除', 'success');
      setTimeout(() => { location.href = 'events.html'; }, 500);
    });

    form.addEventListener('submit', save);
  }

  function syncField(e) {
    const el = e.target;
    const row = el.closest('.field-row');
    if (!row || !el.dataset.k) return;
    const q = fields[Number(row.dataset.i)];
    const k = el.dataset.k;
    if (k === 'required') q.required = el.checked;
    else if (k === 'options') q.options = el.value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
    else q[k] = el.value;
    if (k === 'type') row.querySelector('[data-k="options"]').hidden = el.value !== 'select';
  }

  async function save(e) {
    e.preventDefault();
    const form = e.target;
    const f = form.elements;
    const err = document.getElementById('formError');
    const fail = (msg) => {
      err.textContent = msg;
      err.hidden = false;
      err.scrollIntoView({ block: 'center' });
    };
    err.hidden = true;

    const data = {
      title: f.title.value.trim(),
      status: f.status.value,
      summary: f.summary.value.trim(),
      content: f.content.value.trim(),
      startAt: f.startAt.value,
      endAt: f.endAt.value,
      location: f.location.value.trim(),
      regStartAt: f.regStartAt.value,
      deadline: f.deadline.value,
      capacity: parseInt(f.capacity.value, 10) || 0,
      regMode: f.regMode.value,
      externalUrl: f.externalUrl.value.trim(),
      albumIds: Array.from(form.querySelectorAll('input[name="albumIds"]:checked')).map((c) => c.value)
    };

    if (!data.title) return fail('請填寫活動名稱');
    if (!data.summary) return fail('請填寫活動大綱');
    if (!data.startAt) return fail('請填寫活動開始時間');
    if (data.endAt && data.endAt < data.startAt) return fail('結束時間不能早於開始時間');
    if (data.regStartAt && data.deadline && data.deadline <= data.regStartAt) return fail('報名截止時間必須晚於報名開始時間');
    if (data.status === 'preparing' && data.regStartAt && data.regMode === 'none') return fail('已設定報名開始時間，請選擇報名方式（本網站表單或外部連結）');
    if (data.regMode === 'external' && !RC.safeUrl(data.externalUrl)) return fail('外部報名連結需以 http:// 或 https:// 開頭');

    const cleanFields = fields.map((q) => Object.assign({}, q, { label: (q.label || '').trim() })).filter((q) => q.label);
    const badSelect = cleanFields.find((q) => q.type === 'select' && !(q.options || []).length);
    if (badSelect) return fail(`題目「${badSelect.label}」是下拉選單，請填寫選項`);
    data.fields = cleanFields;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = '儲存中…';
    try {
      const oldPoster = ev.posterImg;
      if (posterFile) data.posterImg = await RC.images.fromFile(posterFile);
      else if (removePoster) data.posterImg = '';
      else data.posterImg = oldPoster || '';

      const saved = await RC.api.events.save(Object.assign(ev, data));
      if (oldPoster && oldPoster !== saved.posterImg) await RC.images.remove(oldPoster);

      RC.toast('活動已儲存', 'success');
      setTimeout(() => { location.href = `event.html?id=${encodeURIComponent(saved.id)}`; }, 400);
    } catch (ex) {
      fail(ex.message);
      btn.disabled = false;
      btn.textContent = '儲存活動';
    }
  }
})();
