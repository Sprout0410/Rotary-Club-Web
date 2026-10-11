/* 聯絡我們 (contact.html)：例會地點、交通指南、地圖；管理員可編輯 */
'use strict';

(function () {
  RC.ready.then(async () => {
    RC.editButton(document.getElementById('meetingTools'), '✎ 編輯', () => RC.editMeeting(renderMeeting));
    RC.editButton(document.getElementById('trafficTools'), '✎ 編輯', () =>
      RC.editTextBlock('contact.traffic', '編輯交通與停車指南', renderTraffic));
    await Promise.all([renderMeeting(), renderTraffic()]);
    RC.scrollToHash();
  });

  async function renderMeeting() {
    const m = await RC.api.blocks.get('meeting');
    document.getElementById('meetingBody').innerHTML = RC.meetingHtml(m);
    renderMap(m);
  }

  async function renderTraffic() {
    const b = await RC.api.blocks.get('contact.traffic');
    document.getElementById('trafficBody').innerHTML = b.body ? RC.textToHtml(b.body) : '<p class="text-muted">尚未填寫。</p>';
  }

  // 依例會地址自動嵌入 Google 地圖（不需要 API 金鑰）
  function renderMap(m) {
    const box = document.getElementById('mapBox');
    const query = (m.address || m.place || '').trim();
    if (!query) {
      box.innerHTML = `<div class="map-placeholder"><strong>【 Google 地圖 】</strong>
        <span>${RC.auth.isAdmin() ? '在例會資訊填入「地址」後，地圖會自動顯示在這裡' : '地圖資訊準備中'}</span></div>`;
      return;
    }
    const q = encodeURIComponent(query);
    box.innerHTML = `
      <iframe class="map-frame" title="例會地點地圖" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
        src="https://maps.google.com/maps?q=${q}&hl=zh-TW&z=16&output=embed"></iframe>
      <p class="map-link"><a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">在 Google 地圖開啟／規劃路線 ➔</a></p>`;
  }
})();
