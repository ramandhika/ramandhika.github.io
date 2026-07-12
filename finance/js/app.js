const App = (() => {
  let currentView = 'dashboard';
  let barChart = null;
  let pieChart = null;
  let selectedIcon = Store.ICONS[0];
  let selectedColor = Store.COLORS[0];
  let addTrxKantongId = '';
  let chartMonth = new Date().toISOString().slice(0, 7);
  let lockTimer = null;
  const LOCK_MS = 5 * 60 * 1000;

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const fmtRp = Store.fmtRp;
  const today = () => new Date().toISOString().slice(0, 10);

  // ======================== IDR FORMAT ========================

  function formatIdr(v) {
    const raw = v.replace(/[^0-9]/g, '');
    if (!raw) return '';
    return Number(raw).toLocaleString('id-ID');
  }
  function parseIdr(v) { return Number(v.replace(/[^0-9]/g, '')) || 0; }

  // ======================== PIN INPUTS ========================

  function pinFromSel(sel) {
    return Array.from($$(sel + ' .pin-input')).map(i => i.value).join('');
  }
  function clearPins() {
    $$('.pin-input').forEach(i => { i.value = ''; i.classList.remove('filled'); });
  }
  function clearPinsIn(sel) {
    $$(sel + ' .pin-input').forEach(i => { i.value = ''; i.classList.remove('filled'); });
  }
  function setupPinInputs() {
    document.addEventListener('beforeinput', e => {
      if (!e.target.classList.contains('pin-input')) return;
      if (e.inputType === 'insertText' || e.inputType === 'insertReplacementText') {
        if (!e.data || !/^[0-9]$/.test(e.data)) { e.preventDefault(); return; }
        e.preventDefault();
        e.target.value = e.data;
        e.target.classList.add('filled');
        const next = e.target.nextElementSibling;
        if (next && next.classList.contains('pin-input')) next.focus();
      } else if (e.inputType === 'deleteContentBackward') {
        if (!e.target.value) {
          const prev = e.target.previousElementSibling;
          if (prev && prev.classList.contains('pin-input')) { prev.focus(); prev.value = ''; prev.classList.remove('filled'); }
          e.preventDefault();
        }
      }
    });
    document.addEventListener('paste', e => {
      if (!e.target.classList.contains('pin-input')) return;
      const data = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      if (data.length >= 6) {
        e.preventDefault();
        const inputs = e.target.closest('#pin-inputs, #pin-confirm-inputs, #pin-old, #pin-new, #pin-new-confirm')?.querySelectorAll('.pin-input');
        if (inputs) {
          for (let i = 0; i < 6 && i < data.length; i++) { inputs[i].value = data[i]; inputs[i].classList.add('filled'); }
          inputs[5]?.focus();
        }
      }
    });
  }

  // ======================== AUTH / LOCK ========================

  function showAuthScreen(mode) {
    $('#lock-overlay').classList.remove('hidden');
    $('#app').classList.add('hidden');
    const title = $('#auth-title');
    const sub = $('#auth-subtitle');
    const btn = $('#auth-btn');
    const confirm = $('#auth-confirm-group');
    const err = $('#auth-error');
    const loading = $('#auth-loading');

    if (mode === 'setup') {
      title.textContent = 'Buat PIN Kamu';
      sub.textContent = 'PIN 6 digit untuk mengamankan data keuanganmu';
      btn.textContent = 'Buat PIN';
      confirm.classList.remove('hidden');
    } else {
      title.textContent = 'Masukkan PIN';
      sub.textContent = 'PIN 6 digit untuk masuk';
      btn.textContent = 'Masuk';
      confirm.classList.add('hidden');
    }
    err.textContent = '';
    loading.classList.add('hidden');
    btn.classList.remove('hidden');
    clearPins();
  }

  function hideAuthScreen() {
    $('#lock-overlay').classList.add('hidden');
    $('#app').classList.remove('hidden');
  }

  function showLoading(msg) {
    const loading = $('#auth-loading');
    const btn = $('#auth-btn');
    const err = $('#auth-error');
    if (loading) { loading.textContent = msg || 'Memproses...'; loading.classList.remove('hidden'); }
    if (btn) btn.classList.add('hidden');
    if (err) err.textContent = '';
  }

  function hideLoading() {
    const loading = $('#auth-loading');
    const btn = $('#auth-btn');
    if (loading) loading.classList.add('hidden');
    if (btn) btn.classList.remove('hidden');
  }

  async function handleAuth() {
    const isSetup = !Auth.isSetup();
    const pin = pinFromSel('#pin-inputs');
    const err = $('#auth-error');
    if (pin.length !== 6) { err.textContent = 'PIN harus 6 digit'; return; }

    showLoading(isSetup ? 'Membuat PIN...' : 'Memverifikasi...');

    if (isSetup) {
      const confirmPin = pinFromSel('#pin-confirm-inputs');
      if (pin !== confirmPin) { hideLoading(); err.textContent = 'PIN tidak cocok'; clearPins(); return; }
      await Auth.setup(pin);
      hideLoading();
      enterApp();
    } else {
      if (await Auth.init(pin)) {
        hideLoading();
        enterApp();
      } else {
        hideLoading();
        err.textContent = 'PIN salah';
        clearPins();
      }
    }
  }

  async function enterApp() {
    hideAuthScreen();
    showView('dashboard');
    await Store.checkAutoArchive();
    updateNotifBadge();
    resetLockTimer();
  }

  function lockApp() {
    Auth.lock();
    clearTimeout(lockTimer);
    showAuthScreen('login');
  }

  function resetLockTimer() {
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      if (Auth.isUnlocked()) lockApp();
    }, LOCK_MS);
  }

  // ======================== NAVIGATION ========================

  function showView(name) {
    currentView = name;
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${name}`)?.classList.add('active');
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    $(`.nav-item[data-view="${name}"]`)?.classList.add('active');
    const titles = { dashboard: 'KantongKu', kantong: 'Kantong', add: 'Transaksi Baru', chart: 'Grafik', settings: 'Pengaturan' };
    $('#header-title').textContent = titles[name] || 'KantongKu';
    switch (name) {
      case 'dashboard': renderDashboard(); break;
      case 'kantong': renderKantong(); break;
      case 'add': renderAddTrx(); break;
      case 'chart': renderChart(); break;
      case 'settings': renderSettings(); break;
    }
    window.scrollTo(0, 0);
    resetLockTimer();
  }

  // ======================== MODAL ========================

  function showModal(html) {
    $('#modal-container').innerHTML = `<div class="modal-backdrop" onclick="if(event.target===this)App.closeModal()"><div class="modal-content">${html}</div></div>`;
    document.body.style.overflow = 'hidden';
    resetLockTimer();
  }
  function closeModal() { $('#modal-container').innerHTML = ''; document.body.style.overflow = ''; }

  // ======================== DASHBOARD ========================

  function renderDashboard() {
    const kantong = Store.getKantong();
    const total = Store.totalBal();
    const month = new Date().toISOString().slice(0, 7);
    const notifs = Store.getNotifs();

    $('#total-balance').textContent = fmtRp(total);
    $('#total-balance-sign').textContent = total < 0 ? '-' : '';

    const notifEl = $('#notifications');
    if (notifs.length > 0) {
      notifEl.innerHTML = notifs.map(n => `
        <div class="flex items-center gap-3 p-3 rounded-xl ${n.type === 'danger' ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'}">
          <span class="text-lg shrink-0">${n.type === 'danger' ? '🚨' : '⚠️'}</span>
          <span class="text-sm ${n.type === 'danger' ? 'text-red-700' : 'text-amber-700'}">${n.msg}</span>
        </div>`).join('');
    } else { notifEl.innerHTML = ''; }

    const list = $('#kantong-list');
    if (kantong.length === 0) {
      list.innerHTML = `<div class="text-center py-16 text-gray-400"><div class="text-6xl mb-4">💰</div><p class="font-medium text-lg">Belum ada kantong</p><p class="text-sm mt-1">Buat kantong pertamamu!</p></div>`;
    } else {
      list.innerHTML = kantong.map(k => {
        const usage = Store.budgetUse(k.id, month);
        let bHtml = '';
        if (k.budget > 0 && usage) {
          const pct = Math.min(usage.pct, 100);
          const col = usage.remain < 0 ? '#ef4444' : usage.pct >= 80 ? '#f97316' : '#22c55e';
          bHtml = `<div class="mt-3"><div class="budget-bar"><div class="budget-bar-fill" style="width:${pct}%;background:${col}"></div></div><div class="flex justify-between mt-1.5"><span class="text-xs text-gray-400">${fmtRp(usage.used)} / ${fmtRp(k.budget)}</span><span class="text-xs font-medium ${usage.remain < 0 ? 'text-red-500' : 'text-gray-400'}">${usage.remain < 0 ? 'Over ' + fmtRp(Math.abs(usage.remain)) : fmtRp(usage.remain) + ' tersisa'}</span></div></div>`;
        }
        const recent = Store.getTrx().filter(t => t.kantongId === k.id).slice(-1)[0];
        let lastTrx = '';
        if (recent) { const sign = recent.type === 'income' ? '+' : '-'; lastTrx = `<div class="text-xs text-gray-400 mt-1">${sign}${fmtRp(recent.amount)} ${recent.description || ''}</div>`; }
        return `<div class="card cursor-pointer active:scale-[0.98] transition-transform" onclick="App.showKantongDetail('${k.id}')"><div class="flex items-center gap-3"><div class="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style="background:${k.color}18">${k.icon}</div><div class="flex-1 min-w-0"><div class="font-semibold text-gray-800 truncate">${k.name}</div><div class="${k.balance >= 0 ? 'amount-positive' : 'amount-negative'} font-bold text-lg">${k.balance < 0 ? '-' : ''}${fmtRp(k.balance)}</div>${lastTrx}</div><div class="text-gray-300 text-xl">›</div></div>${bHtml}</div>`;
      }).join('');
    }

    renderRiwayat();
  }

  // ======================== RIWAYAT ========================

  function renderRiwayat() {
    const history = Store.getHistory();
    const section = $('#riwayat-section');
    const el = $('#riwayat-list');
    if (!history || history.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    const sorted = [...history].sort((a, b) => b.month.localeCompare(a.month));
    el.innerHTML = sorted.map(h => {
      const inc = h.trx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const exp = h.trx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const label = new Date(h.month + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      return `<div class="card mb-2 cursor-pointer active:scale-[0.98] transition-transform" onclick="App.toggleRiwayat('${h.month}')"><div class="flex items-center justify-between"><div><div class="font-semibold text-gray-800">${label}</div><div class="text-xs text-gray-400">${h.trx.length} transaksi</div></div><div class="text-right"><div class="text-sm amount-positive">+${fmtRp(inc)}</div><div class="text-sm amount-negative">-${fmtRp(exp)}</div></div></div><div id="riw-${h.month}" class="riwayat-detail mt-3 pt-3 border-t border-slate-100"></div></div>`;
    }).join('');
  }

  function toggleRiwayat(month) {
    const el = $(`#riw-${month}`);
    if (el.classList.contains('open')) { el.classList.remove('open'); el.innerHTML = ''; return; }
    const hist = Store.getHistory(month);
    if (!hist) return;
    const cats = Store.getCats();
    const kantong = Store.getKantong();
    const catTotals = {};
    hist.trx.filter(t => t.type === 'expense').forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
    let catHtml = '';
    if (Object.keys(catTotals).length > 0) {
      catHtml = `<h5 class="text-xs font-semibold text-gray-500 mb-1.5 mt-2">Per Kategori</h5>` + Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([catId, total]) => {
        const cat = cats.find(c => c.id === catId);
        return `<div class="flex justify-between text-sm py-1"><span>${cat ? cat.icon + ' ' + cat.name : '📦'}</span><span class="font-medium amount-negative">${fmtRp(total)}</span></div>`;
      }).join('');
    }
    el.innerHTML = catHtml || '<p class="text-sm text-gray-400">Tidak ada pengeluaran</p>';
    el.classList.add('open');
  }

  function showRiwayatDetail(month) { toggleRiwayat(month); }

  // ======================== KANTONG ========================

  function renderKantong() {
    const kantong = Store.getKantong();
    const list = $('#kantong-view-list');
    if (kantong.length === 0) {
      list.innerHTML = `<div class="text-center py-16 text-gray-400"><div class="text-6xl mb-4">🏦</div><p class="font-medium text-lg">Belum ada kantong</p><p class="text-sm mt-1">Tap "Tambah" untuk membuat kantong baru</p></div>`;
      return;
    }
    list.innerHTML = kantong.map(k => `<div class="card mb-3"><div class="flex items-center gap-3"><div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style="background:${k.color}18">${k.icon}</div><div class="flex-1 min-w-0"><div class="font-semibold text-gray-800">${k.name}</div><div class="${k.balance >= 0 ? 'amount-positive' : 'amount-negative'} font-bold">${k.balance < 0 ? '-' : ''}${fmtRp(k.balance)}</div>${k.budget ? `<div class="text-xs text-gray-400 mt-0.5">Budget: ${fmtRp(k.budget)}/bulan</div>` : ''}</div><div class="flex gap-1 shrink-0"><button onclick="App.editKantong('${k.id}')" class="p-2 rounded-lg hover:bg-slate-100 text-lg">✏️</button><button onclick="App.confirmDeleteKantong('${k.id}','${k.name}')" class="p-2 rounded-lg hover:bg-slate-100 text-lg">🗑️</button></div></div></div>`).join('');
  }

  function showAddKantong(edit) {
    const isEdit = !!edit;
    selectedIcon = edit ? edit.icon : Store.ICONS[0];
    selectedColor = edit ? edit.color : Store.COLORS[0];
    showModal(`
      <h3 class="font-semibold text-lg mb-5">${isEdit ? 'Edit' : 'Tambah'} Kantong</h3>
      <div class="space-y-4">
        <div><label class="block text-sm font-medium text-gray-600 mb-1.5">Nama Kantong</label><input id="m-k-name" type="text" class="w-full px-4 py-3 border border-slate-200 rounded-xl" placeholder="Contoh: Dana Darurat" value="${isEdit ? edit.name : ''}"></div>
        <div><label class="block text-sm font-medium text-gray-600 mb-2">Icon</label><div id="icon-picker" class="flex flex-wrap gap-2">${Store.ICONS.map(ic => `<button onclick="App.selectIcon('${ic}',this)" class="icon-btn ${ic === selectedIcon ? 'selected' : ''}">${ic}</button>`).join('')}</div></div>
        <div><label class="block text-sm font-medium text-gray-600 mb-2">Warna</label><div id="color-picker" class="flex flex-wrap gap-2">${Store.COLORS.map(c => `<button onclick="App.selectColor('${c}',this)" class="color-btn ${c === selectedColor ? 'selected' : ''}" style="background:${c}"></button>`).join('')}</div></div>
        <div><label class="block text-sm font-medium text-gray-600 mb-1.5">Budget Bulanan (opsional)</label><input id="m-k-budget" type="text" inputmode="numeric" class="w-full px-4 py-3 border border-slate-200 rounded-xl idr-input" placeholder="0" value="${isEdit && edit.budget ? formatIdr(String(edit.budget)) : ''}" oninput="this.value=formatIdr(this.value)"></div>
        <button onclick="App.saveKantong('${isEdit ? edit.id : ''}')" class="w-full py-3 bg-indigo-500 text-white rounded-xl font-semibold active:scale-[0.98] transition-transform">${isEdit ? 'Simpan Perubahan' : 'Buat Kantong'}</button>
      </div>`);
    setTimeout(() => $('#m-k-name')?.focus(), 200);
  }

  function selectIcon(icon, el) { selectedIcon = icon; $$('#icon-picker .icon-btn').forEach(b => b.classList.remove('selected')); el.classList.add('selected'); }
  function selectColor(color, el) { selectedColor = color; $$('#color-picker .color-btn').forEach(b => b.classList.remove('selected')); el.classList.add('selected'); }

  async function saveKantong(editId) {
    const name = $('#m-k-name').value.trim();
    if (!name) { alert('Nama kantong wajib diisi'); return; }
    const budget = parseIdr($('#m-k-budget').value);
    if (editId) { await Store.updateKantong(editId, { name, icon: selectedIcon, color: selectedColor, budget }); }
    else { await Store.addKantong({ name, icon: selectedIcon, color: selectedColor, budget }); }
    closeModal();
    if (currentView === 'kantong') renderKantong();
    if (currentView === 'dashboard') renderDashboard();
    updateNotifBadge();
  }

  function editKantong(id) { const k = Store.getKantong().find(x => x.id === id); if (k) showAddKantong(k); }

  function confirmDeleteKantong(id, name) {
    showModal(`<div class="text-center py-4"><div class="text-5xl mb-4">🗑️</div><h3 class="font-semibold text-lg mb-2">Hapus Kantong?</h3><p class="text-gray-500 text-sm mb-6">Semua transaksi di <strong>${name}</strong> akan ikut terhapus.</p><div class="flex gap-3"><button onclick="App.closeModal()" class="flex-1 py-3 border border-slate-200 rounded-xl font-medium text-gray-600 active:scale-[0.98] transition-transform">Batal</button><button onclick="App.doDeleteKantong('${id}')" class="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold active:scale-[0.98] transition-transform">Hapus</button></div></div>`);
  }

  async function doDeleteKantong(id) { await Store.deleteKantong(id); closeModal(); if (currentView === 'kantong') renderKantong(); if (currentView === 'dashboard') renderDashboard(); updateNotifBadge(); }

  // ======================== KANTONG DETAIL ========================

  function showKantongDetail(id) {
    const k = Store.getKantong().find(x => x.id === id);
    if (!k) return;
    const trx = Store.getTrx().filter(t => t.kantongId === id).sort((a, b) => b.date.localeCompare(a.date));
    const month = new Date().toISOString().slice(0, 7);
    const usage = Store.budgetUse(id, month);
    const cats = Store.getCats();

    let budgetHtml = '';
    if (k.budget > 0 && usage) {
      const pct = Math.min(usage.pct, 100);
      const col = usage.remain < 0 ? '#ef4444' : usage.pct >= 80 ? '#f97316' : '#22c55e';
      budgetHtml = `<div class="bg-slate-50 rounded-xl p-3 mt-3"><div class="flex justify-between text-sm mb-1.5"><span class="text-gray-500">Budget Bulanan</span><span class="font-medium">${fmtRp(usage.used)} / ${fmtRp(k.budget)}</span></div><div class="budget-bar"><div class="budget-bar-fill" style="width:${pct}%;background:${col}"></div></div><div class="text-xs mt-1.5 ${usage.remain < 0 ? 'text-red-500 font-medium' : 'text-gray-400'}">${usage.remain < 0 ? 'Over budget ' + fmtRp(Math.abs(usage.remain)) : fmtRp(usage.remain) + ' tersisa'}</div></div>`;
    }

    const trxHtml = trx.length === 0 ? '<p class="text-center text-gray-400 py-4 text-sm">Belum ada transaksi</p>'
      : trx.slice(0, 15).map(t => {
        const cat = cats.find(c => c.id === t.category);
        const isIncome = t.type === 'income';
        return `<div class="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0"><div class="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0" style="background:${isIncome ? '#f0fdf4' : '#fef2f2'}">${cat ? cat.icon : '📦'}</div><div class="flex-1 min-w-0"><div class="text-sm font-medium text-gray-800 truncate">${t.description || (cat ? cat.name : 'Transaksi')}</div><div class="text-xs text-gray-400">${t.date}</div></div><div class="text-sm font-bold ${isIncome ? 'amount-positive' : 'amount-negative'} shrink-0">${isIncome ? '+' : '-'}${fmtRp(t.amount)}</div></div>`;
      }).join('');

    showModal(`<div class="text-center mb-4"><div class="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-2" style="background:${k.color}18">${k.icon}</div><h3 class="font-bold text-xl text-gray-800">${k.name}</h3><div class="${k.balance >= 0 ? 'amount-positive' : 'amount-negative'} font-bold text-2xl mt-1">${k.balance < 0 ? '-' : ''}${fmtRp(k.balance)}</div></div>${budgetHtml}<div class="flex gap-2 mt-4"><button onclick="App.closeModal();App.startAddTrxFor('${id}')" class="flex-1 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-semibold active:scale-[0.98] transition-transform">+ Transaksi</button></div><h4 class="font-semibold text-gray-700 mt-5 mb-2">Riwayat Transaksi</h4><div class="max-h-64 overflow-y-auto">${trxHtml}</div>`);
  }

  function startAddTrxFor(kantongId) { addTrxKantongId = kantongId; showView('add'); }

  // ======================== ADD TRANSACTION ========================

  function renderAddTrx() {
    const kantong = Store.getKantong();
    const cats = Store.getCats();
    if (kantong.length === 0) {
      $('#view-add').innerHTML = `<div class="text-center py-16 text-gray-400"><div class="text-6xl mb-4">💸</div><p class="font-medium text-lg">Buat kantong dulu</p><p class="text-sm mt-1">Kamu perlu kantong untuk mencatat transaksi</p><button onclick="App.showView('kantong')" class="mt-4 px-6 py-2.5 bg-indigo-500 text-white rounded-xl font-medium text-sm active:scale-[0.98] transition-transform">Ke Kantong</button></div>`;
      return;
    }
    const sel = addTrxKantongId || kantong[0].id;
    $('#view-add').innerHTML = `
      <div class="space-y-5">
        <div><label class="block text-sm font-medium text-gray-600 mb-2">Tipe Transaksi</label><div class="flex gap-3"><button onclick="App.setTrxType('expense',this)" class="type-btn active-expense" data-type="expense">📉 Pengeluaran</button><button onclick="App.setTrxType('income',this)" class="type-btn" data-type="income">📈 Pemasukan</button></div></div>
        <div><label class="block text-sm font-medium text-gray-600 mb-1.5">Kantong</label><select id="trx-kantong" class="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white">${kantong.map(k => `<option value="${k.id}" ${k.id === sel ? 'selected' : ''}>${k.icon} ${k.name}</option>`).join('')}</select></div>
        <div><label class="block text-sm font-medium text-gray-600 mb-1.5">Nominal</label><input id="trx-amount" type="text" inputmode="numeric" class="w-full px-4 py-3 border border-slate-200 rounded-xl text-2xl font-bold idr-input" placeholder="0" oninput="this.value=formatIdr(this.value)"></div>
        <div><label class="block text-sm font-medium text-gray-600 mb-2">Kategori</label><div id="trx-cats" class="flex flex-wrap gap-2">${cats.map((c, i) => `<button onclick="App.selectTrxCat('${c.id}',this)" class="cat-chip ${i === 0 ? 'selected' : ''}" data-cat="${c.id}">${c.icon} ${c.name}</button>`).join('')}</div></div>
        <div><label class="block text-sm font-medium text-gray-600 mb-1.5">Catatan (opsional)</label><input id="trx-desc" type="text" class="w-full px-4 py-3 border border-slate-200 rounded-xl" placeholder="Contoh: Makan siang"></div>
        <div><label class="block text-sm font-medium text-gray-600 mb-1.5">Tanggal</label><input id="trx-date" type="date" class="w-full px-4 py-3 border border-slate-200 rounded-xl" value="${today()}"></div>
        <button onclick="App.submitTrx()" class="w-full py-3.5 bg-indigo-500 text-white rounded-xl font-semibold text-lg active:scale-[0.98] transition-transform">Simpan Transaksi</button>
      </div>`;
    App._trxType = 'expense';
    App._trxCat = cats[0]?.id || '';
  }

  function setTrxType(type, el) { App._trxType = type; $$('#view-add .type-btn').forEach(b => { b.className = 'type-btn'; }); el.classList.add(type === 'income' ? 'active-income' : 'active-expense'); }
  function selectTrxCat(catId, el) { App._trxCat = catId; $$('#trx-cats .cat-chip').forEach(c => c.classList.remove('selected')); el.classList.add('selected'); }

  async function submitTrx() {
    const kantongId = $('#trx-kantong').value;
    const amount = parseIdr($('#trx-amount').value);
    const desc = $('#trx-desc').value.trim();
    const date = $('#trx-date').value;
    if (!amount || amount <= 0) { alert('Masukkan nominal yang benar'); return; }
    if (!kantongId) { alert('Pilih kantong'); return; }
    await Store.addTrx({ kantongId, type: App._trxType, amount, category: App._trxCat, description: desc, date });
    $('#trx-amount').value = '';
    $('#trx-desc').value = '';
    $('#trx-date').value = today();
    const btn = $('#view-add button[onclick*="submitTrx"]');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Tersimpan!';
      btn.classList.replace('bg-indigo-500', 'bg-green-500');
      setTimeout(() => { btn.textContent = orig; btn.classList.replace('bg-green-500', 'bg-indigo-500'); }, 1200);
    }
    addTrxKantongId = '';
    updateNotifBadge();
  }

  // ======================== CHART ========================

  function renderChart() {
    const kantong = Store.getKantong();
    const cats = Store.getCats();
    const monthLabel = new Date(chartMonth + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const monthTrx = Store.getTrxForMonth(chartMonth);
    const expenses = monthTrx.filter(t => t.type === 'expense');
    const incomes = monthTrx.filter(t => t.type === 'income');

    const catTotals = {};
    expenses.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
    const pieLabels = Object.keys(catTotals).map(id => { const c = cats.find(x => x.id === id); return c ? c.icon + ' ' + c.name : 'Lainnya'; });
    const pieData = Object.values(catTotals);
    const pieColors = ['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#8b5cf6','#ec4899'];

    const kantongTotals = {};
    expenses.forEach(t => { const k = kantong.find(x => x.id === t.kantongId); const name = k ? k.name : '?'; kantongTotals[name] = (kantongTotals[name] || 0) + t.amount; });
    const barLabels = Object.keys(kantongTotals);
    const barData = Object.values(kantongTotals);

    const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
    const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);

    $('#chart-content').innerHTML = `
      <div class="flex items-center justify-between mb-5"><button onclick="App.changeChartMonth('-')" class="p-2 rounded-lg hover:bg-slate-100 text-xl">‹</button><span class="font-semibold text-gray-700">${monthLabel}</span><button onclick="App.changeChartMonth('+')" class="p-2 rounded-lg hover:bg-slate-100 text-xl">›</button></div>
      <div class="grid grid-cols-2 gap-3 mb-5">
        <div class="card text-center"><div class="text-xs text-gray-400 mb-1">Pengeluaran</div><div class="font-bold amount-negative text-lg">${fmtRp(totalExpense)}</div></div>
        <div class="card text-center"><div class="text-xs text-gray-400 mb-1">Pemasukan</div><div class="font-bold amount-positive text-lg">${fmtRp(totalIncome)}</div></div>
      </div>
      <div class="card mb-4"><h4 class="font-semibold text-gray-700 text-sm mb-3">Pengeluaran per Kategori</h4>${pieData.length === 0 ? '<p class="text-center text-gray-400 py-6 text-sm">Tidak ada data</p>' : '<div style="height:220px"><canvas id="pie-chart"></canvas></div>'}</div>
      <div class="card"><h4 class="font-semibold text-gray-700 text-sm mb-3">Pengeluaran per Kantong</h4>${barData.length === 0 ? '<p class="text-center text-gray-400 py-6 text-sm">Tidak ada data</p>' : '<div style="height:220px"><canvas id="bar-chart"></canvas></div>'}</div>`;

    if (pieData.length > 0) {
      const ctx = document.getElementById('pie-chart');
      if (ctx) { if (pieChart) pieChart.destroy(); pieChart = new Chart(ctx, { type: 'doughnut', data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieColors.slice(0, pieData.length), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } } } } }); }
    }
    if (barData.length > 0) {
      const ctx = document.getElementById('bar-chart');
      if (ctx) { if (barChart) barChart.destroy(); barChart = new Chart(ctx, { type: 'bar', data: { labels: barLabels, datasets: [{ data: barData, backgroundColor: '#818cf8', borderRadius: 8, barThickness: 32 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => 'Rp' + (v/1000).toFixed(0) + 'k', font: { size: 11 } }, grid: { color: '#f1f5f9' } }, x: { ticks: { font: { size: 11 } }, grid: { display: false } } } } }); }
    }
  }

  function changeChartMonth(dir) { const d = new Date(chartMonth + '-01'); d.setMonth(d.getMonth() + (dir === '+' ? 1 : -1)); chartMonth = d.toISOString().slice(0, 7); renderChart(); }

  // ======================== SETTINGS ========================

  function renderSettings() {
    const cats = Store.getCats();
    const kantongCount = Store.getKantong().length;
    const trxCount = Store.getTrx().length;
    const histCount = Store.getHistory().length;

    $('#settings-content').innerHTML = `
      <div class="space-y-3">
        <button onclick="App.showChangePin()" class="card w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform"><span class="text-2xl">🔑</span><div><div class="font-semibold text-gray-800">Ganti PIN</div><div class="text-xs text-gray-400">Ubah PIN 6 digit kamu</div></div></button>
        <button onclick="App.showManageCats()" class="card w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform"><span class="text-2xl">🏷️</span><div><div class="font-semibold text-gray-800">Kelola Kategori</div><div class="text-xs text-gray-400">${cats.length} kategori tersedia</div></div></button>
        <button onclick="App.exportData()" class="card w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform"><span class="text-2xl">📤</span><div><div class="font-semibold text-gray-800">Export Data</div><div class="text-xs text-gray-400">Simpan backup ke file JSON</div></div></button>
        <button onclick="App.importData()" class="card w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform"><span class="text-2xl">📥</span><div><div class="font-semibold text-gray-800">Import Data</div><div class="text-xs text-gray-400">Restore dari file JSON</div></div></button>
        <div class="border-t border-slate-100 my-4"></div>
        <div class="card bg-slate-50"><h4 class="font-semibold text-gray-700 text-sm mb-2">Info</h4><div class="text-sm text-gray-500 space-y-1"><div>Kantong: <strong>${kantongCount}</strong></div><div>Transaksi aktif: <strong>${trxCount}</strong></div><div>Riwayat bulanan: <strong>${histCount}</strong></div></div></div>
        <button onclick="App.lockApp()" class="w-full py-3 border-2 border-indigo-200 text-indigo-500 rounded-xl font-semibold active:scale-[0.98] transition-transform">🔒 Kunci Aplikasi</button>
        <button onclick="App.logout()" class="w-full py-3 border-2 border-red-200 text-red-500 rounded-xl font-semibold active:scale-[0.98] transition-transform">Logout & Hapus Data</button>
        <p class="text-center text-xs text-gray-300 mt-4">KantongKu v2.0 • AES-256 Encrypted</p>
      </div>`;
  }

  function showChangePin() {
    showModal(`<h3 class="font-semibold text-lg mb-5">Ganti PIN</h3><div class="space-y-4">
      <div><label class="block text-sm font-medium text-gray-600 mb-1.5">PIN Lama</label><div class="flex justify-center gap-2" id="pin-old">${pinInputsHtml()}</div></div>
      <div><label class="block text-sm font-medium text-gray-600 mb-1.5">PIN Baru</label><div class="flex justify-center gap-2" id="pin-new">${pinInputsHtml()}</div></div>
      <div><label class="block text-sm font-medium text-gray-600 mb-1.5">Konfirmasi PIN Baru</label><div class="flex justify-center gap-2" id="pin-new-confirm">${pinInputsHtml()}</div></div>
      <p id="pin-err" class="text-red-500 text-sm text-center"></p>
      <button onclick="App.doChangePin()" class="w-full py-3 bg-indigo-500 text-white rounded-xl font-semibold active:scale-[0.98] transition-transform">Simpan</button>
    </div>`);
  }

  function pinInputsHtml() { return Array(6).fill(0).map(() => '<input type="text" maxlength="1" inputmode="numeric" autocomplete="one-time-code" autocorrect="off" autocapitalize="off" class="pin-input">').join(''); }

  async function doChangePin() {
    const oldPin = pinFromSel('#pin-old');
    const newPin = pinFromSel('#pin-new');
    const confirmPin = pinFromSel('#pin-new-confirm');
    const errEl = $('#pin-err');
    if (oldPin.length !== 6 || newPin.length !== 6 || confirmPin.length !== 6) { errEl.textContent = 'Semua PIN harus 6 digit'; return; }
    if (newPin !== confirmPin) { errEl.textContent = 'PIN baru tidak cocok'; clearPinsIn('#pin-new'); clearPinsIn('#pin-new-confirm'); return; }
    if (oldPin === newPin) { errEl.textContent = 'PIN baru harus berbeda'; clearPinsIn('#pin-new'); clearPinsIn('#pin-new-confirm'); return; }
    const ok = await Auth.changePin(oldPin, newPin);
    if (ok) { closeModal(); alert('PIN berhasil diubah!'); }
    else { errEl.textContent = 'PIN lama salah'; clearPinsIn('#pin-old'); }
  }

  function showManageCats() {
    const cats = Store.getCats();
    showModal(`<div class="flex items-center justify-between mb-4"><h3 class="font-semibold text-lg">Kategori</h3><button onclick="App.showAddCat()" class="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium">+ Tambah</button></div><div class="space-y-2 max-h-80 overflow-y-auto">${cats.map(c => `<div class="flex items-center gap-3 py-2 px-3 rounded-xl bg-slate-50"><span class="text-xl">${c.icon}</span><span class="flex-1 font-medium text-gray-700">${c.name}</span><button onclick="App.doDeleteCat('${c.id}','${c.name}')" class="text-red-400 hover:text-red-600 p-1">🗑️</button></div>`).join('')}</div>`);
  }

  function showAddCat() {
    const emojis = ['🍽️','🚗','🛍️','🎮','📄','💊','📚','📦','💰','🏠','🎬','✈️','🏋️','🐾','👶','💇','🔧','🎵','☕','🌙'];
    showModal(`<h3 class="font-semibold text-lg mb-4">Tambah Kategori</h3><div class="space-y-4"><div><label class="block text-sm font-medium text-gray-600 mb-2">Icon</label><div class="flex flex-wrap gap-2">${emojis.map(e => `<button onclick="App.selectCatIcon('${e}',this)" class="icon-btn cat-icon-btn ${e === emojis[0] ? 'selected' : ''}">${e}</button>`).join('')}</div></div><div><label class="block text-sm font-medium text-gray-600 mb-1.5">Nama</label><input id="m-cat-name" type="text" class="w-full px-4 py-3 border border-slate-200 rounded-xl" placeholder="Nama kategori"></div><button onclick="App.doAddCat()" class="w-full py-3 bg-indigo-500 text-white rounded-xl font-semibold active:scale-[0.98] transition-transform">Simpan</button></div>`);
    App._catIcon = emojis[0];
    setTimeout(() => $('#m-cat-name')?.focus(), 200);
  }

  function selectCatIcon(icon, el) { App._catIcon = icon; $$('.cat-icon-btn').forEach(b => b.classList.remove('selected')); el.classList.add('selected'); }

  async function doAddCat() {
    const name = $('#m-cat-name').value.trim();
    if (!name) { alert('Nama kategori wajib diisi'); return; }
    await Store.addCat({ name, icon: App._catIcon });
    showManageCats();
  }

  function doDeleteCat(id, name) { if (confirm(`Hapus kategori "${name}"?`)) { Store.delCat(id).then(() => showManageCats()); } }

  // ======================== EXPORT / IMPORT ========================

  function exportData() {
    const data = Store.exportAll();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `kantongku-backup-${today()}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async ev => {
        try { await Store.importAll(ev.target.result); alert('Data berhasil diimport!'); showView(currentView); updateNotifBadge(); }
        catch (err) { alert('Gagal import: file tidak valid'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ======================== NOTIFICATIONS ========================

  function updateNotifBadge() {
    const notifs = Store.getNotifs();
    const btn = $('#notif-btn');
    const badge = $('#notif-badge');
    if (notifs.length > 0) { btn.classList.remove('hidden'); badge.classList.remove('hidden'); badge.textContent = notifs.length; }
    else { btn.classList.add('hidden'); }
  }

  function showNotifPanel() {
    const notifs = Store.getNotifs();
    if (notifs.length === 0) { showModal(`<div class="text-center py-6"><div class="text-4xl mb-3">✅</div><p class="font-medium text-gray-600">Semua budget aman!</p></div>`); return; }
    showModal(`<h3 class="font-semibold text-lg mb-4">Notifikasi</h3><div class="space-y-2">${notifs.map(n => `<div class="flex items-center gap-3 p-3 rounded-xl ${n.type === 'danger' ? 'bg-red-50' : 'bg-amber-50'}"><span class="text-xl">${n.type === 'danger' ? '🚨' : '⚠️'}</span><span class="text-sm ${n.type === 'danger' ? 'text-red-700' : 'text-amber-700'}">${n.msg}</span></div>`).join('')}</div>`);
  }

  // ======================== INIT ========================

  function init() {
    setupPinInputs();
    if (Store.isSetup()) {
      showAuthScreen('login');
    } else {
      showAuthScreen('setup');
    }

    // Activity listeners for auto-lock
    ['click','keydown','touchstart','scroll'].forEach(evt => {
      document.addEventListener(evt, () => { if (Auth.isUnlocked()) resetLockTimer(); }, { passive: true });
    });
  }

  return {
    init, handleAuth, showView, closeModal, lockApp,
    showAddKantong, selectIcon, selectColor, saveKantong,
    editKantong, confirmDeleteKantong, doDeleteKantong, showKantongDetail,
    startAddTrxFor,
    setTrxType, selectTrxCat, submitTrx,
    changeChartMonth,
    showChangePin, doChangePin, showManageCats, showAddCat, selectCatIcon, doAddCat, doDeleteCat,
    exportData, importData,
    showNotifPanel,
    logout: () => { if (confirm('Logout & hapus semua data?')) { Store.clearAll(); location.reload(); } },
    toggleRiwayat, showRiwayatDetail,
    formatIdr,
    _trxType: 'expense', _trxCat: '', _catIcon: '📦',
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
