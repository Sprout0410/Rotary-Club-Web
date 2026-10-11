/* 首頁 (index.html)：重大活動展示區、歷任社長輪播、近期相簿、近期活動 */
'use strict';

(function () {
  const esc = RC.esc;

  RC.ready.then(() => {
    RC.editButton(document.getElementById('heroAdmin'), '✎ 編輯展示區', openSlideManager);
    return Promise.all([renderHero(), renderPresidents(), renderAlbums(), renderEvents()]);
  });

  /* =========================================
     重大活動展示區（跑馬燈）
     ========================================= */
  const LINK_PRESETS = [
    ['', '不連結'],
    ['events.html#register', '活動列表（近期活動與報名）'],
    ['events.html#gallery', '活動相簿'],
    ['news.html', '最新消息'],
    ['news.html#meeting', '例會時間與地點'],
    ['about.html', '關於我們'],
    ['contact.html', '聯絡我們']
  ];

  async function slideSrc(s) {
    if (s.photoImg) return RC.images.get(s.photoImg);
    return RC.safeUrl(s.imageUrl);
  }

  async function renderHero() {
    const box = document.getElementById('heroSlides');
    const slides = (await RC.api.slides.list()).filter((s) => s.enabled !== false);
    if (!slides.length) {
      box.innerHTML = `<div class="slide active slide--empty"><div class="slide-content"><h2>躍齡扶輪社</h2>
        ${RC.auth.isAdmin() ? '<p>尚未設定展示內容，請點右上角「編輯展示區」新增。</p>' : ''}</div></div>`;
      RC.heroCarousel.init();
      return;
    }
    box.innerHTML = '';
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const link = RC.safeLink(s.link);
      const el = document.createElement(link ? 'a' : 'div');
      el.className = 'slide' + (i === 0 ? ' active' : '') + (link ? ' slide--link' : '');
      if (link) {
        el.href = link;
        if (RC.isExternal(link)) {
          el.target = '_blank';
          el.rel = 'noopener';
        }
        el.setAttribute('aria-label', s.title || '前往連結');
      }
      const src = await slideSrc(s);
      if (src) el.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`;
      if (s.title || s.buttonText) {
        el.innerHTML = `<div class="slide-content">
          ${s.title ? `<h2>${esc(s.title)}</h2>` : ''}
          ${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ''}
          ${s.buttonText ? `<span class="btn">${esc(s.buttonText)}</span>` : ''}
        </div>`;
      }
      box.appendChild(el);
    }
    RC.heroCarousel.init();
  }

  async function openSlideManager() {
    const slides = await RC.api.slides.list();
    const rows = await Promise.all(slides.map(async (s, i) => {
      const src = await slideSrc(s);
      const link = RC.safeLink(s.link);
      return `
        <div class="slide-row" data-id="${s.id}">
          <div class="slide-row__thumb"${src ? ` style="background-image:url('${src.replace(/'/g, '%27')}')"` : ''}></div>
          <div class="slide-row__info">
            <strong>${esc(s.title || '（無標題文字）')}</strong>
            <span class="meta-text">${link ? '連到：' + esc(link) : '不連結'}</span>
            ${s.enabled === false ? '<span class="status-chip status--disabled">已隱藏</span>' : ''}
          </div>
          <div class="item-actions">
            <button type="button" class="btn btn--xs btn--ghost" data-act="up"${i === 0 ? ' disabled' : ''} aria-label="上移">↑</button>
            <button type="button" class="btn btn--xs btn--ghost" data-act="down"${i === slides.length - 1 ? ' disabled' : ''} aria-label="下移">↓</button>
            <button type="button" class="btn btn--xs btn--ghost" data-act="edit">編輯</button>
            <button type="button" class="btn btn--xs btn--danger" data-act="delete">刪除</button>
          </div>
        </div>`;
    }));

    const m = RC.modal({
      title: '編輯重大活動展示區',
      wide: true,
      body: `<p class="form-hint">依序輪播；點擊照片會開啟設定的連結。建議使用橫式照片（約 16:9）。</p>
        <div class="slide-list">${rows.join('') || '<p class="empty-state">目前沒有任何展示內容。</p>'}</div>`,
      actions: [
        { label: '＋ 新增一張', className: 'btn--primary', onClick: (api) => { api.close(); editSlide(null); } },
        { label: '完成', className: 'btn--ghost', onClick: (api) => api.close() }
      ]
    });

    m.body.querySelectorAll('.slide-row').forEach((row) => {
      const s = slides.find((x) => x.id === row.dataset.id);
      row.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'edit') { m.close(); editSlide(s); return; }
        if (act === 'delete') {
          if (!confirm(`確定刪除「${s.title || '這張展示圖'}」？`)) return;
          await RC.api.slides.remove(s.id);
        }
        if (act === 'up') await RC.api.slides.move(s.id, -1);
        if (act === 'down') await RC.api.slides.move(s.id, 1);
        m.close();
        await renderHero();
        openSlideManager();
      }));
    });
  }

  async function editSlide(slide) {
    const s = slide ? Object.assign({}, slide) : { title: '', subtitle: '', buttonText: '', link: '', imageUrl: '', photoImg: '', enabled: true };
    const events = await RC.api.events.list();
    const presets = LINK_PRESETS.concat(events.map((ev) => [`event.html?id=${ev.id}`, `活動：${ev.title}`]));
    const isPreset = presets.some(([v]) => v === (s.link || ''));

    // 圖片暫存狀態：新上傳的檔案、從相簿挑的圖（已複製成新圖片）
    let newFile = null;
    let pickedImg = '';

    const form = document.createElement('form');
    form.id = RC.uid('form_');
    form.className = 'modal-form';
    form.innerHTML = `
      <div class="form-group">
        <label>展示照片 <span class="req">*</span></label>
        <div class="slide-preview" id="slidePreview"><span>尚未選擇照片</span></div>
        <div class="toolbar toolbar--start">
          <label class="btn btn--sm btn--primary">上傳照片<input type="file" accept="image/*" name="file" hidden></label>
          <button type="button" class="btn btn--sm btn--ghost" data-act="pick">從活動相簿選擇</button>
        </div>
        <input type="url" name="imageUrl" class="form-control" placeholder="或貼上圖片網址 https://..." value="${esc(s.photoImg ? '' : s.imageUrl || '')}">
      </div>
      <div class="form-group">
        <label>標題文字</label>
        <input type="text" name="title" class="form-control" value="${esc(s.title)}" placeholder="留空則只顯示照片">
      </div>
      <div class="form-group">
        <label>副標題</label>
        <input type="text" name="subtitle" class="form-control" value="${esc(s.subtitle || '')}">
      </div>
      <div class="form-group">
        <label>按鈕文字</label>
        <input type="text" name="buttonText" class="form-control" value="${esc(s.buttonText)}" placeholder="例如：立即報名 ➔（留空則不顯示按鈕）">
      </div>
      <div class="form-group">
        <label>點擊照片後連到</label>
        <select name="linkPreset" class="form-control">
          ${presets.map(([v, t]) => `<option value="${esc(v)}"${isPreset && v === (s.link || '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}
          <option value="__custom"${isPreset ? '' : ' selected'}>自訂網址…</option>
        </select>
        <input type="text" name="customLink" class="form-control slide-custom-link" placeholder="https://… 或站內頁面，例如 news.html"
          value="${esc(isPreset ? '' : s.link || '')}"${isPreset ? ' hidden' : ''}>
        <p class="form-hint">外部網址會在新分頁開啟。</p>
      </div>
      <label class="inline-check"><input type="checkbox" name="enabled"${s.enabled === false ? '' : ' checked'}> 顯示在首頁（取消勾選可暫時隱藏）</label>
      <p class="form-error" hidden></p>`;

    let saved = false;
    const m = RC.modal({
      title: slide ? '編輯展示圖' : '新增展示圖',
      body: form,
      actions: [
        { label: '取消', className: 'btn--ghost', onClick: (api) => api.close() },
        { label: '儲存', className: 'btn--primary', type: 'submit', form: form.id }
      ]
    });
    // 取消時清掉挑選後沒用到的圖片
    const obs = new MutationObserver(() => {
      if (document.body.contains(m.el)) return;
      obs.disconnect();
      if (!saved && pickedImg) RC.images.remove(pickedImg);
      if (!saved) openSlideManager();
    });
    obs.observe(document.body, { childList: true });

    const F = form.elements;
    const preview = form.querySelector('#slidePreview');
    async function showPreview() {
      let src = '';
      if (newFile) src = URL.createObjectURL(newFile);
      else if (pickedImg) src = await RC.images.get(pickedImg);
      else if (F.imageUrl.value.trim()) src = RC.safeUrl(F.imageUrl.value.trim());
      else if (s.photoImg) src = await RC.images.get(s.photoImg);
      preview.style.backgroundImage = src ? `url("${src.replace(/"/g, '%22')}")` : '';
      preview.classList.toggle('has-img', !!src);
    }
    showPreview();

    F.file.addEventListener('change', () => {
      if (!F.file.files[0]) return;
      newFile = F.file.files[0];
      if (pickedImg) { RC.images.remove(pickedImg); pickedImg = ''; }
      F.imageUrl.value = '';
      showPreview();
    });
    form.querySelector('[data-act="pick"]').addEventListener('click', async () => {
      const id = await RC.pickAlbumPhoto();
      if (!id) return;
      if (pickedImg) RC.images.remove(pickedImg);
      pickedImg = id;
      newFile = null;
      F.file.value = '';
      F.imageUrl.value = '';
      showPreview();
    });
    F.imageUrl.addEventListener('input', () => {
      if (F.imageUrl.value.trim()) {
        newFile = null;
        F.file.value = '';
      }
      showPreview();
    });
    F.linkPreset.addEventListener('change', () => {
      F.customLink.hidden = F.linkPreset.value !== '__custom';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('.form-error');
      err.hidden = true;
      const fail = (msg) => { err.textContent = msg; err.hidden = false; };

      const link = F.linkPreset.value === '__custom' ? F.customLink.value.trim() : F.linkPreset.value;
      if (link && !RC.safeLink(link)) return fail('連結格式不正確：請輸入 https:// 開頭的網址，或站內頁面名稱（例如 news.html）');
      const imageUrl = F.imageUrl.value.trim();
      if (imageUrl && !RC.safeUrl(imageUrl)) return fail('圖片網址需以 http:// 或 https:// 開頭');
      if (!newFile && !pickedImg && !imageUrl && !s.photoImg) return fail('請選擇一張展示照片');

      try {
        const oldImg = s.photoImg || '';
        if (newFile) s.photoImg = await RC.images.fromFile(newFile);
        else if (pickedImg) s.photoImg = pickedImg;
        else if (imageUrl) s.photoImg = '';
        s.imageUrl = s.photoImg ? '' : imageUrl;
        Object.assign(s, {
          title: F.title.value.trim(),
          subtitle: F.subtitle.value.trim(),
          buttonText: F.buttonText.value.trim(),
          link,
          enabled: F.enabled.checked
        });
        await RC.api.slides.save(s);
        if (oldImg && oldImg !== s.photoImg) await RC.images.remove(oldImg);
        saved = true;
        m.close();
        RC.toast('展示區已更新', 'success');
        await renderHero();
        openSlideManager();
      } catch (ex) {
        fail(ex.message);
      }
    });
  }

  /* =========================================
     歷任社長、相簿、近期活動
     ========================================= */

  async function renderPresidents() {
    const list = await RC.api.presidents.list();
    const box = document.getElementById('presSlides');
    if (!list.length) {
      box.innerHTML = '<p class="empty-state">尚無資料</p>';
      return;
    }
    box.innerHTML = list.map((p, i) => `
      <div class="pres-slide${i === 0 ? ' active' : ''}">
        <div class="pres-avatar" style="--avatar-bg:${RC.safeColor(p.color)}">
          ${p.photoImg ? `<img data-img="${esc(p.photoImg)}" alt="${esc(p.name)}">` : esc(Array.from(p.name)[0] || '')}
        </div>
        <h4 class="pres-name">${esc(p.name)}</h4>
        <p class="pres-desc">${esc(p.term)}${p.years ? '・' + esc(p.years) : ''}</p>
      </div>`).join('');
    RC.images.hydrate(box);
    RC.presCarousel.init();
  }

  async function renderAlbums() {
    const albums = (await RC.api.albums.listWithStats()).slice(0, 4);
    const box = document.getElementById('homeAlbums');
    box.innerHTML = albums.length ? albums.map((a) => `
      <a class="list-item" href="album.html?id=${encodeURIComponent(a.id)}">
        ${a.cover ? `<img data-img="${esc(a.cover)}" alt="">` : '<span class="list-thumb">相簿</span>'}
        <div class="item-info">
          <h4>${esc(a.title)}</h4>
          <p>${a.date ? RC.fmtDate(a.date) + '・' : ''}${a.count} 張照片</p>
        </div>
      </a>`).join('') : '<p class="empty-state">尚無活動相簿</p>';
    RC.images.hydrate(box);
  }

  async function renderEvents() {
    const [events, summary] = await Promise.all([RC.api.events.list(), RC.api.registrations.summary()]);
    const upcoming = events.filter((ev) => ev.status !== 'closed');
    const box = document.getElementById('homeEvents');

    const adminBtn = RC.auth.isAdmin()
      ? '<a class="btn btn--sm btn--primary btn--block home-create" href="event-edit.html">＋ 建立新活動</a>'
      : '';

    if (!upcoming.length) {
      box.innerHTML = adminBtn + '<p class="empty-state">目前沒有近期活動</p>';
      return;
    }

    box.innerHTML = adminBtn + upcoming.map((ev) => {
      const sum = summary[ev.id] || { groups: 0, people: 0 };
      const state = RC.eventState(ev, sum.people);
      const link = `event.html?id=${encodeURIComponent(ev.id)}`;
      const canSignup = state.key === 'open' && ev.regMode !== 'none';
      return `
        <div class="list-item${canSignup ? ' list-item--highlight' : ''}">
          <div class="item-info">
            ${RC.stateBadge(state)}
            <h4><a href="${link}">${esc(ev.title)}</a></h4>
            <p>${esc(RC.eventWhen(ev))}${ev.location ? '・' + esc(ev.location) : ''}</p>
            ${ev.regMode === 'internal' && sum.groups ? `<p>已有 ${sum.groups} 組・${sum.people} 人報名</p>` : ''}
            ${canSignup ? `<a href="${ev.regMode === 'internal' ? link + '#signup' : link}" class="btn btn--sm btn--block">點此報名</a>` : ''}
          </div>
        </div>`;
    }).join('');
  }
})();
