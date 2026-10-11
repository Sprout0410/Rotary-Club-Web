/* 最新消息 (news.html)：例會時間與地點公告、重大行事曆；管理員可編輯 */
'use strict';

(function () {
  const esc = RC.esc;

  RC.ready.then(async () => {
    RC.editButton(document.getElementById('meetingTools'), '✎ 編輯例會資訊', () => RC.editMeeting(renderMeeting));
    RC.editButton(document.getElementById('calendarTools'), '＋ 新增行事曆項目', () => editItem(null));
    await Promise.all([renderMeeting(), renderCalendar()]);
    RC.scrollToHash();
  });

  async function renderMeeting() {
    const m = await RC.api.blocks.get('meeting');
    document.getElementById('meetingBody').innerHTML = RC.meetingHtml(m);
    document.getElementById('meetingUpdated').textContent = m.updatedAt ? `最後更新：${RC.fmtStamp(m.updatedAt)}` : '';
  }

  async function renderCalendar() {
    const isAdmin = RC.auth.isAdmin();
    const list = await RC.api.calendar.list();
    const box = document.getElementById('calendarList');
    box.innerHTML = list.length ? list.map((c, i) => {
      const link = RC.safeLink(c.link);
      const title = link
        ? `<a href="${esc(link)}"${RC.isExternal(link) ? ' target="_blank" rel="noopener"' : ''}>${esc(c.title)}</a>`
        : esc(c.title);
      return `
        <div class="calendar-item-clean" data-id="${c.id}">
          <div class="date-badge">${esc(c.dateLabel)}</div>
          <div class="event-detail">
            <h4>${title}</h4>
            ${c.description ? `<span>${esc(c.description)}</span>` : ''}
          </div>
          ${isAdmin ? `
            <div class="item-actions calendar-actions">
              <button type="button" class="btn btn--xs btn--ghost" data-act="up" aria-label="上移"${i === 0 ? ' disabled' : ''}>↑</button>
              <button type="button" class="btn btn--xs btn--ghost" data-act="down" aria-label="下移"${i === list.length - 1 ? ' disabled' : ''}>↓</button>
              <button type="button" class="btn btn--xs btn--ghost" data-act="edit">編輯</button>
              <button type="button" class="btn btn--xs btn--danger" data-act="delete">刪除</button>
            </div>` : ''}
        </div>`;
    }).join('') : '<p class="empty-state">目前沒有行事曆項目。</p>';

    if (!isAdmin) return;
    box.querySelectorAll('[data-id]').forEach((row) => {
      const item = list.find((x) => x.id === row.dataset.id);
      row.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'edit') return editItem(item);
        if (act === 'delete') {
          if (!confirm(`確定刪除「${item.title}」？`)) return;
          await RC.api.calendar.remove(item.id);
        }
        if (act === 'up') await RC.api.calendar.move(item.id, -1);
        if (act === 'down') await RC.api.calendar.move(item.id, 1);
        renderCalendar();
      }));
    });
  }

  function editItem(item) {
    RC.formModal({
      title: item ? '編輯行事曆項目' : '新增行事曆項目',
      fields: [
        { name: 'dateLabel', label: '日期／期間', required: true, value: item ? item.dateLabel : '', hint: '例如：2026/12/20、2026 年度 Q4、12 月中旬' },
        { name: 'title', label: '項目名稱', required: true, value: item ? item.title : '' },
        { name: 'description', label: '說明', value: item ? item.description : '' },
        { name: 'link', label: '相關連結（選填）', value: item ? item.link : '', hint: '可填活動頁網址或外部網址，例如 event.html?id=… 或 https://…' }
      ],
      async onSubmit(v) {
        if (v.link && !RC.safeLink(v.link)) throw new Error('連結格式不正確：請輸入 https:// 開頭的網址或站內頁面名稱');
        await RC.api.calendar.save(Object.assign(item || {}, v));
        RC.toast('已儲存', 'success');
        renderCalendar();
      }
    });
  }
})();
