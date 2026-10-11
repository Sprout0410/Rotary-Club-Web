/* 相簿頁 (album.html?id=...)：瀏覽照片；管理員可上傳、刪除、設封面、編輯相簿 */
'use strict';

(function () {
  const esc = RC.esc;
  const root = document.getElementById('albumRoot');
  const albumId = RC.param('id');
  let album = null;
  let photos = [];
  let uploading = false;

  RC.ready.then(render);

  async function render() {
    album = albumId ? await RC.api.albums.get(albumId) : null;
    if (!album) {
      root.innerHTML = `<section class="content-box empty-state"><h3>找不到這本相簿</h3>
        <a class="btn btn--primary" href="events.html#gallery">回到活動相簿</a></section>`;
      return;
    }
    document.title = `${album.title} | 躍齡扶輪社官方網站`;
    document.getElementById('albumTitle').textContent = album.title;

    const isAdmin = RC.auth.isAdmin();
    photos = await RC.api.photos.listByAlbum(album.id);
    const cover = album.coverImg || (photos[0] ? photos[0].imageId : '');
    const linked = (await RC.api.events.list()).filter((ev) => (ev.albumIds || []).includes(album.id));

    root.innerHTML = `
      <section class="content-box">
        <div class="section-head">
          <div>
            <p class="meta-text">${album.date ? RC.fmtDate(album.date) + '・' : ''}共 ${photos.length} 張照片</p>
            ${album.description ? `<p>${RC.nl2br(album.description)}</p>` : ''}
            ${linked.length ? `<p class="linked-events">相關活動：${linked.map((ev) =>
              `<a href="event.html?id=${encodeURIComponent(ev.id)}">${esc(ev.title)}</a>`).join('、')}</p>` : ''}
          </div>
          ${isAdmin ? `
            <div class="toolbar">
              <label class="btn btn--sm btn--primary">＋ 上傳照片<input type="file" accept="image/*" multiple hidden id="uploadInput"></label>
              <button type="button" class="btn btn--sm btn--ghost" id="editAlbum">編輯相簿資訊</button>
              <button type="button" class="btn btn--sm btn--danger" id="deleteAlbum">刪除相簿</button>
            </div>` : ''}
        </div>
        <p class="upload-status" id="uploadStatus" hidden></p>
        ${photos.length ? `
          <div class="photo-grid">${photos.map((p, i) => `
            <figure class="photo-item" data-i="${i}">
              <button type="button" class="photo-item__open" aria-label="放大第 ${i + 1} 張"><img data-img="${esc(p.imageId)}" alt="" loading="lazy"></button>
              ${p.imageId === cover ? '<span class="photo-item__cover">封面</span>' : ''}
              ${isAdmin ? `
                <div class="photo-item__actions">
                  ${p.imageId === cover ? '' : '<button type="button" class="btn btn--xs btn--ghost" data-act="cover">設為封面</button>'}
                  <button type="button" class="btn btn--xs btn--danger" data-act="delete">刪除</button>
                </div>` : ''}
            </figure>`).join('')}</div>`
          : `<p class="empty-state">${isAdmin ? '這本相簿還沒有照片，點右上角「上傳照片」開始新增（可一次選多張）。' : '這本相簿還沒有照片。'}</p>`}
      </section>
      <p><a href="events.html#gallery">← 回到所有相簿</a></p>`;

    RC.images.hydrate(root);
    bind(isAdmin);
  }

  function bind(isAdmin) {
    root.querySelectorAll('.photo-item__open').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const i = Number(btn.closest('.photo-item').dataset.i);
        const srcs = await Promise.all(photos.map((p) => RC.images.get(p.imageId)));
        RC.lightbox(srcs, i);
      });
    });
    if (!isAdmin) return;

    document.getElementById('uploadInput').addEventListener('change', (e) => upload(Array.from(e.target.files)));
    document.getElementById('editAlbum').addEventListener('click', editAlbum);
    document.getElementById('deleteAlbum').addEventListener('click', async () => {
      if (!confirm(`確定刪除相簿「${album.title}」？\n裡面 ${photos.length} 張照片會一併刪除，此動作無法復原。`)) return;
      await RC.api.albums.remove(album.id);
      RC.toast('相簿已刪除', 'success');
      setTimeout(() => { location.href = 'events.html#gallery'; }, 500);
    });

    root.querySelectorAll('.photo-item').forEach((item) => {
      const photo = photos[Number(item.dataset.i)];
      const coverBtn = item.querySelector('[data-act="cover"]');
      if (coverBtn) {
        coverBtn.addEventListener('click', async () => {
          album.coverImg = photo.imageId;
          await RC.api.albums.save(album);
          RC.toast('已設為封面', 'success');
          render();
        });
      }
      item.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (!confirm('確定刪除這張照片？')) return;
        await RC.api.photos.remove(photo);
        RC.toast('照片已刪除', 'success');
        render();
      });
    });
  }

  async function upload(files) {
    if (!files.length || uploading) return;
    uploading = true;
    const status = document.getElementById('uploadStatus');
    status.hidden = false;
    let ok = 0;
    const errors = [];
    for (let i = 0; i < files.length; i++) {
      status.textContent = `上傳中… ${i + 1} / ${files.length}（照片會自動壓縮）`;
      try {
        await RC.api.photos.add(album.id, files[i]);
        ok++;
      } catch (ex) {
        errors.push(ex.message);
      }
    }
    uploading = false;
    if (ok) RC.toast(`已上傳 ${ok} 張照片`, 'success');
    if (errors.length) RC.toast(`${errors.length} 張失敗：${errors[0]}`, 'error', 6000);
    render();
  }

  function editAlbum() {
    RC.formModal({
      title: '編輯相簿資訊',
      fields: [
        { name: 'title', label: '相簿名稱', required: true, value: album.title },
        { name: 'date', label: '活動日期', type: 'date', value: album.date },
        { name: 'description', label: '相簿說明', type: 'textarea', rows: 3, value: album.description }
      ],
      async onSubmit(v) {
        Object.assign(album, v);
        await RC.api.albums.save(album);
        RC.toast('已更新相簿資訊', 'success');
        render();
      }
    });
  }
})();
