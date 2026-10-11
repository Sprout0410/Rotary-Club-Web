/* 活動與展覽 (events.html)：活動列表＋活動相簿 */
'use strict';

(function () {
  const esc = RC.esc;

  RC.ready.then(async () => {
    const isAdmin = RC.auth.isAdmin();
    if (isAdmin) {
      document.getElementById('eventTools').innerHTML = '<a class="btn btn--primary btn--sm" href="event-edit.html">＋ 建立新活動</a>';
      const albumTools = document.getElementById('albumTools');
      albumTools.innerHTML = '<button type="button" class="btn btn--primary btn--sm">＋ 新增相簿</button>';
      albumTools.querySelector('button').addEventListener('click', createAlbum);
    }
    await Promise.all([renderEvents(isAdmin), renderAlbums()]);
    RC.scrollToHash();
  });

  async function renderEvents(isAdmin) {
    const [events, summary] = await Promise.all([RC.api.events.list(), RC.api.registrations.summary()]);
    const current = events.filter((e) => e.status !== 'closed');
    const past = events.filter((e) => e.status === 'closed').reverse();

    const box = document.getElementById('eventList');
    box.innerHTML = current.length
      ? `<div class="event-grid">${current.map((ev) => eventCard(ev, summary[ev.id], isAdmin)).join('')}</div>`
      : '<p class="empty-state">目前沒有進行中的活動，敬請期待！</p>';

    const pastBox = document.getElementById('pastEvents');
    if (past.length) {
      pastBox.innerHTML = `<h4 class="sub-heading">已結束的活動</h4>
        <div class="event-grid event-grid--compact">${past.map((ev) => eventCard(ev, summary[ev.id], isAdmin)).join('')}</div>`;
    }
    RC.images.hydrate(box);
    RC.images.hydrate(pastBox);
  }

  function eventCard(ev, sum = { groups: 0, people: 0 }, isAdmin) {
    const state = RC.eventState(ev, sum.people);
    const link = `event.html?id=${encodeURIComponent(ev.id)}`;
    const regLine = ev.regMode === 'internal'
      ? `<p class="event-meta">已報名：<strong>${sum.groups}</strong> 組・<strong>${sum.people}</strong> 人${ev.capacity ? `（名額 ${ev.capacity} 人）` : ''}</p>`
      : ev.regMode === 'external' ? '<p class="event-meta">使用外部表單報名</p>' : '';
    return `
      <article class="event-card">
        <a class="event-card__poster" href="${link}">
          ${ev.posterImg ? `<img data-img="${esc(ev.posterImg)}" alt="${esc(ev.title)} 海報">` : '<span class="poster-placeholder">活動海報</span>'}
        </a>
        <div class="event-card__body">
          ${RC.stateBadge(state)}
          <h4><a href="${link}">${esc(ev.title)}</a></h4>
          <p class="event-meta">時間：${esc(RC.eventWhen(ev))}</p>
          ${ev.location ? `<p class="event-meta">地點：${esc(ev.location)}</p>` : ''}
          <p class="event-card__summary">${esc(ev.summary)}</p>
          ${regLine}
          <div class="event-card__actions">
            <a class="btn btn--sm btn--primary" href="${link}">${state.key === 'open' && ev.regMode !== 'none' ? '查看與報名' : '查看活動'}</a>
            ${isAdmin ? `<a class="btn btn--sm btn--ghost" href="event-edit.html?id=${encodeURIComponent(ev.id)}">編輯</a>` : ''}
          </div>
        </div>
      </article>`;
  }

  async function renderAlbums() {
    const albums = await RC.api.albums.listWithStats();
    const box = document.getElementById('albumList');
    box.innerHTML = albums.length
      ? `<div class="album-grid">${albums.map(albumCard).join('')}</div>`
      : '<p class="empty-state">目前還沒有相簿。</p>';
    RC.images.hydrate(box);
  }

  function albumCard(a) {
    return `
      <a class="album-card" href="album.html?id=${encodeURIComponent(a.id)}">
        <div class="album-card__cover">
          ${a.cover ? `<img data-img="${esc(a.cover)}" alt="">` : '<span>尚無照片</span>'}
        </div>
        <div class="album-card__meta">
          <h4 class="mini-title">${esc(a.title)}</h4>
          <span class="meta-text">${a.date ? RC.fmtDate(a.date) + '・' : ''}${a.count} 張照片</span>
        </div>
      </a>`;
  }

  function createAlbum() {
    RC.formModal({
      title: '新增相簿',
      submitLabel: '建立並前往上傳照片',
      fields: [
        { name: 'title', label: '相簿名稱', required: true },
        { name: 'date', label: '活動日期', type: 'date' },
        { name: 'description', label: '相簿說明', type: 'textarea', rows: 3 }
      ],
      async onSubmit(v) {
        const album = await RC.api.albums.save({ title: v.title, date: v.date, description: v.description, coverImg: '' });
        location.href = `album.html?id=${encodeURIComponent(album.id)}`;
      }
    });
  }
})();
