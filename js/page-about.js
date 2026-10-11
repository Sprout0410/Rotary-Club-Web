/* 關於我們 (about.html)：創社歷史、歷屆社長、社友名錄；管理員可新增／編輯／排序／刪除 */
'use strict';

(function () {
  const esc = RC.esc;

  RC.ready.then(async () => {
    const isAdmin = RC.auth.isAdmin();
    if (isAdmin) {
      addButton('presidentTools', '＋ 新增社長／幹部', () => editPresident(null));
      addButton('memberTools', '＋ 新增社友', () => editMember(null));
    }
    RC.editButton(document.getElementById('historyTools'), '✎ 編輯', () =>
      RC.editTextBlock('about.history', '編輯創社歷史與宗旨', renderHistory));
    await Promise.all([renderHistory(), renderPresidents(isAdmin), renderMembers(isAdmin)]);
    RC.scrollToHash();
  });

  function addButton(id, text, onClick) {
    const box = document.getElementById(id);
    box.innerHTML = `<button type="button" class="btn btn--sm btn--primary">${text}</button>`;
    box.querySelector('button').addEventListener('click', onClick);
  }

  const adminActions = (i, total) => `
    <div class="item-actions">
      <button type="button" class="btn btn--xs btn--ghost" data-act="up" aria-label="上移"${i === 0 ? ' disabled' : ''}>↑</button>
      <button type="button" class="btn btn--xs btn--ghost" data-act="down" aria-label="下移"${i === total - 1 ? ' disabled' : ''}>↓</button>
      <button type="button" class="btn btn--xs btn--ghost" data-act="edit">編輯</button>
      <button type="button" class="btn btn--xs btn--danger" data-act="delete">刪除</button>
    </div>`;

  function bindActions(container, list, api, onEdit, rerender) {
    container.querySelectorAll('[data-id]').forEach((el) => {
      const item = list.find((x) => x.id === el.dataset.id);
      el.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const act = btn.dataset.act;
          if (act === 'edit') return onEdit(item);
          if (act === 'delete' && !confirm(`確定刪除「${item.name}」？`)) return;
          if (act === 'delete') await api.remove(item.id);
          if (act === 'up') await api.move(item.id, -1);
          if (act === 'down') await api.move(item.id, 1);
          rerender();
        });
      });
    });
  }

  /* ---------- 創社歷史與宗旨 ---------- */
  async function renderHistory() {
    const b = await RC.api.blocks.get('about.history');
    document.getElementById('historyBody').innerHTML = b.body ? RC.textToHtml(b.body) : '<p class="text-muted">尚未填寫。</p>';
  }

  /* ---------- 歷屆社長與幹部 ---------- */
  async function renderPresidents(isAdmin = RC.auth.isAdmin()) {
    const list = await RC.api.presidents.list();
    const box = document.getElementById('presidentList');
    box.innerHTML = list.length ? list.map((p, i) => `
      <div class="list-item list-item--plain" data-id="${p.id}">
        <div class="mini-avatar" style="--avatar-bg:${RC.safeColor(p.color)}">
          ${p.photoImg ? `<img data-img="${esc(p.photoImg)}" alt="">` : esc(Array.from(p.name)[0] || '')}
        </div>
        <div class="item-info">
          <h4>${esc(p.term)} - ${esc(p.name)}</h4>
          ${p.years ? `<p>${esc(p.years)}</p>` : ''}
        </div>
        ${isAdmin ? adminActions(i, list.length) : ''}
      </div>`).join('') : '<p class="empty-state">尚未建立歷屆社長資料。</p>';
    RC.images.hydrate(box);
    if (isAdmin) bindActions(box, list, RC.api.presidents, editPresident, renderPresidents);
  }

  function editPresident(p) {
    RC.formModal({
      title: p ? '編輯社長／幹部' : '新增社長／幹部',
      fields: [
        { name: 'term', label: '屆別／職稱', required: true, value: p ? p.term : '', hint: '例如：第 6 屆社長、創社秘書' },
        { name: 'name', label: '姓名', required: true, value: p ? p.name : '' },
        { name: 'years', label: '任期', value: p ? p.years : '', hint: '例如：2025–2026' },
        { name: 'color', label: '無照片時的代表色', type: 'color', value: p ? RC.safeColor(p.color) : '#3E6B89' },
        { name: 'photo', label: '照片', type: 'image', currentImg: p ? p.photoImg : '' }
      ],
      async onSubmit(v) {
        const item = p || {};
        Object.assign(item, { term: v.term, name: v.name, years: v.years, color: RC.safeColor(v.color) });
        await applyPhoto(item, v.photo, v.photo__remove);
        await RC.api.presidents.save(item);
        RC.toast('已儲存', 'success');
        renderPresidents();
      }
    });
  }

  /* ---------- 現任社友名錄 ---------- */
  async function renderMembers(isAdmin = RC.auth.isAdmin()) {
    const list = await RC.api.members.list();
    const box = document.getElementById('memberGrid');
    box.innerHTML = list.length ? list.map((m, i) => `
      <div class="member-card-clean" data-id="${m.id}">
        <div class="photo-placeholder">${m.photoImg ? `<img data-img="${esc(m.photoImg)}" alt="${esc(m.name)}">` : '照片區'}</div>
        <h4 class="mini-title">${esc(m.name)}</h4>
        <span class="meta-text">${esc(m.title)}</span>
        ${isAdmin ? adminActions(i, list.length) : ''}
      </div>`).join('') : '<p class="empty-state">尚未建立社友資料。</p>';
    RC.images.hydrate(box);
    if (isAdmin) bindActions(box, list, RC.api.members, editMember, renderMembers);
  }

  function editMember(m) {
    RC.formModal({
      title: m ? '編輯社友' : '新增社友',
      fields: [
        { name: 'name', label: '姓名', required: true, value: m ? m.name : '' },
        { name: 'title', label: '職稱／職業', value: m ? m.title : '' },
        { name: 'photo', label: '照片', type: 'image', currentImg: m ? m.photoImg : '' }
      ],
      async onSubmit(v) {
        const item = m || {};
        Object.assign(item, { name: v.name, title: v.title });
        await applyPhoto(item, v.photo, v.photo__remove);
        await RC.api.members.save(item);
        RC.toast('已儲存', 'success');
        renderMembers();
      }
    });
  }

  // 處理照片欄位：換新圖或移除時，順便刪掉舊圖
  async function applyPhoto(item, file, remove) {
    const old = item.photoImg || '';
    if (file) item.photoImg = await RC.images.fromFile(file);
    else if (remove) item.photoImg = '';
    if (old && old !== item.photoImg) await RC.images.remove(old);
  }
})();
