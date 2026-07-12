const Store = (() => {
  const DATA_KEY = Crypto.DATA_KEY;
  const APP_MARKER = 'kantongku_v2';

  const DEFAULT_CATS = [
    { id: 'c1', name: 'Makanan', icon: '🍽️' },
    { id: 'c2', name: 'Transport', icon: '🚗' },
    { id: 'c3', name: 'Belanja', icon: '🛍️' },
    { id: 'c4', name: 'Hiburan', icon: '🎮' },
    { id: 'c5', name: 'Tagihan', icon: '📄' },
    { id: 'c6', name: 'Kesehatan', icon: '💊' },
    { id: 'c7', name: 'Pendidikan', icon: '📚' },
    { id: 'c8', name: 'Lainnya', icon: '📦' },
  ];

  const ICONS = ['💰','🏦','🎯','🎒','💳','🎁','🏠','🚗','📱','✈️','🎓','💪','🛒','🎮','💼','🏥'];
  const COLORS = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6'];

  let sessionKey = null;
  let data = null;

  function fmtRp(n) { return 'Rp' + Math.abs(n).toLocaleString('id-ID'); }
  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function emptyData() {
    return { _app: APP_MARKER, kantong: [], trx: [], cats: [...DEFAULT_CATS], history: [] };
  }

  async function persist() {
    if (!sessionKey || !data) return;
    const enc = await Crypto.encrypt(sessionKey, data);
    localStorage.setItem(DATA_KEY, enc);
  }

  // ======================== AUTH ========================

  function isSetup() { return localStorage.getItem(DATA_KEY) !== null; }
  function isUnlocked() { return sessionKey !== null && data !== null; }

  async function init(pin) {
    try {
      const key = await Crypto.deriveKey(pin);
      const raw = localStorage.getItem(DATA_KEY);
      if (!raw) return false;
      const d = await Crypto.decrypt(key, raw);
      if (!d || d._app !== APP_MARKER) return false;
      sessionKey = key;
      data = d;
      return true;
    } catch { return false; }
  }

  async function setup(pin) {
    const key = await Crypto.deriveKey(pin);
    sessionKey = key;
    data = emptyData();
    await persist();
  }

  async function changePin(oldPin, newPin) {
    try {
      const oldKey = await Crypto.deriveKey(oldPin);
      const raw = localStorage.getItem(DATA_KEY);
      if (!raw) return false;
      const d = await Crypto.decrypt(oldKey, raw);
      if (!d || d._app !== APP_MARKER) return false;
      const newKey = await Crypto.deriveKey(newPin);
      const enc = await Crypto.encrypt(newKey, d);
      localStorage.setItem(DATA_KEY, enc);
      sessionKey = newKey;
      return true;
    } catch { return false; }
  }

  function lock() { sessionKey = null; data = null; }

  // ======================== KANTONG ========================

  function getKantong() { return data?.kantong || []; }

  async function addKantong(d) {
    const k = { id: genId(), name: d.name, icon: d.icon, color: d.color, budget: Number(d.budget || 0), balance: 0, createdAt: new Date().toISOString() };
    data.kantong.push(k);
    await persist();
    return k;
  }

  async function updateKantong(id, patch) {
    const k = data.kantong.find(x => x.id === id);
    if (!k) return null;
    Object.assign(k, patch);
    await persist();
    return k;
  }

  async function deleteKantong(id) {
    data.kantong = data.kantong.filter(k => k.id !== id);
    data.trx = data.trx.filter(t => t.kantongId !== id);
    await persist();
  }

  // ======================== TRANSACTIONS ========================

  function getTrx() { return data?.trx || []; }

  async function addTrx(d) {
    const t = { id: genId(), kantongId: d.kantongId, type: d.type, amount: Number(d.amount), category: d.category, description: d.description || '', date: d.date || new Date().toISOString().slice(0, 10) };
    data.trx.push(t);
    const k = data.kantong.find(x => x.id === d.kantongId);
    if (k) k.balance += t.type === 'income' ? t.amount : -t.amount;
    await persist();
    return t;
  }

  async function deleteTrx(id) {
    const t = data.trx.find(x => x.id === id);
    if (t) {
      const k = data.kantong.find(x => x.id === t.kantongId);
      if (k) k.balance += t.type === 'income' ? -t.amount : t.amount;
    }
    data.trx = data.trx.filter(x => x.id !== id);
    await persist();
  }

  // ======================== CATEGORIES ========================

  function getCats() { return data?.cats || [...DEFAULT_CATS]; }

  async function addCat(d) {
    const c = { id: genId(), name: d.name, icon: d.icon };
    data.cats.push(c);
    await persist();
    return c;
  }

  async function delCat(id) {
    data.cats = data.cats.filter(c => c.id !== id);
    await persist();
  }

  // ======================== BUDGET ========================

  function budgetUse(kid, month) {
    const k = data.kantong.find(x => x.id === kid);
    if (!k || !k.budget) return null;
    const used = data.trx
      .filter(t => t.kantongId === kid && t.type === 'expense' && t.date.startsWith(month))
      .reduce((s, t) => s + t.amount, 0);
    return { budget: k.budget, used, remain: k.budget - used, pct: k.budget > 0 ? (used / k.budget) * 100 : 0 };
  }

  function getNotifs() {
    const m = new Date().toISOString().slice(0, 7);
    const n = [];
    for (const k of data.kantong) {
      if (!k.budget) continue;
      const u = budgetUse(k.id, m);
      if (!u) continue;
      if (u.remain < 0) n.push({ type: 'danger', kantong: k.name, msg: `Budget ${k.name} over! ${fmtRp(u.used)} / ${fmtRp(k.budget)}` });
      else if (u.pct >= 80) n.push({ type: 'warning', kantong: k.name, msg: `Budget ${k.name} tersisa ${Math.round(100 - u.pct)}%!` });
    }
    return n;
  }

  function totalBal() { return (data?.kantong || []).reduce((s, k) => s + k.balance, 0); }

  // ======================== HISTORY ========================

  function getHistory(month) {
    if (month) return data?.history?.find(h => h.month === month) || null;
    return data?.history || [];
  }

  function getTrxForMonth(month) {
    const active = (data?.trx || []).filter(t => t.date.startsWith(month));
    if (active.length > 0) return active;
    const hist = data?.history?.find(h => h.month === month);
    return hist?.trx || [];
  }

  async function closeMonth(month) {
    const monthTrx = data.trx.filter(t => t.date.startsWith(month));
    if (monthTrx.length === 0) return false;
    const kantongBalances = {};
    for (const t of monthTrx) {
      if (!kantongBalances[t.kantongId]) kantongBalances[t.kantongId] = 0;
      kantongBalances[t.kantongId] += t.type === 'income' ? t.amount : -t.amount;
    }
    data.history.push({ month, trx: monthTrx, kantongBalances, closedAt: new Date().toISOString() });
    data.trx = data.trx.filter(t => !t.date.startsWith(month));
    await persist();
    return true;
  }

  async function checkAutoArchive() {
    if (!data) return;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const months = [...new Set(data.trx.map(t => t.date.slice(0, 7)))].filter(m => m < currentMonth).sort();
    let changed = false;
    for (const m of months) {
      if (data.history.some(h => h.month === m)) continue;
      const monthTrx = data.trx.filter(t => t.date.startsWith(m));
      if (monthTrx.length === 0) continue;
      const kantongBalances = {};
      for (const t of monthTrx) {
        if (!kantongBalances[t.kantongId]) kantongBalances[t.kantongId] = 0;
        kantongBalances[t.kantongId] += t.type === 'income' ? t.amount : -t.amount;
      }
      data.history.push({ month: m, trx: monthTrx, kantongBalances, closedAt: new Date().toISOString() });
      data.trx = data.trx.filter(t => !t.date.startsWith(m));
      changed = true;
    }
    if (changed) await persist();
  }

  // ======================== EXPORT / IMPORT ========================

  function exportAll() {
    return JSON.stringify({
      v: 2, at: new Date().toISOString(),
      kantong: getKantong(), trx: getTrx(), cats: getCats(), history: getHistory()
    }, null, 2);
  }

  async function importAll(jsonStr) {
    const d = JSON.parse(jsonStr);
    if (d.kantong) data.kantong = d.kantong;
    if (d.trx) data.trx = d.trx;
    if (d.cats) data.cats = d.cats;
    if (d.history) data.history = d.history;
    for (const k of data.kantong) {
      k.balance = 0;
    }
    for (const t of data.trx) {
      const k = data.kantong.find(x => x.id === t.kantongId);
      if (k) k.balance += t.type === 'income' ? t.amount : -t.amount;
    }
    await persist();
  }

  function clearAll() { localStorage.removeItem(DATA_KEY); localStorage.removeItem('kku_salt'); }

  return {
    ICONS, COLORS, fmtRp,
    isSetup, isUnlocked, init, setup, changePin, lock,
    getKantong, addKantong, updateKantong, deleteKantong,
    getTrx, addTrx, deleteTrx,
    getCats, addCat, delCat,
    budgetUse, getNotifs, totalBal,
    getHistory, getTrxForMonth, closeMonth, checkAutoArchive,
    exportAll, importAll, clearAll,
  };
})();
