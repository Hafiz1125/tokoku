import { STORAGE_KEY, getCategoryFallbackImage, getDefaultState } from './constants.js';
import { getLocalDateKey } from './utils.js';

export function normalizeState(candidate) {
  const defaults = getDefaultState();
  if (!candidate || typeof candidate !== 'object') {
    return defaults;
  }

  const storeProfile = {
    storeName:
      typeof candidate.storeProfile?.storeName === 'string' && candidate.storeProfile.storeName.trim()
        ? candidate.storeProfile.storeName.trim()
        : defaults.storeProfile.storeName,
    ownerName:
      typeof candidate.storeProfile?.ownerName === 'string' && candidate.storeProfile.ownerName.trim()
        ? candidate.storeProfile.ownerName.trim()
        : defaults.storeProfile.ownerName,
    cashBalance: Number.isFinite(Number(candidate.storeProfile?.cashBalance))
      ? Number(candidate.storeProfile.cashBalance)
      : defaults.storeProfile.cashBalance
  };

  const rawDateKey = candidate.dailySession?.dateKey;
  const validDateKey =
    typeof rawDateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDateKey)
      ? rawDateKey
      : getLocalDateKey();

  const rawOpenedTs = candidate.dailySession?.openedTimestamp;
  const openedTimestamp =
    rawOpenedTs !== null && rawOpenedTs !== undefined && rawOpenedTs !== '' && Number(rawOpenedTs) > 0
      ? Number(rawOpenedTs)
      : null;

  const rawClosedTs = candidate.dailySession?.closedTimestamp;
  const closedTimestamp =
    rawClosedTs !== null && rawClosedTs !== undefined && rawClosedTs !== '' && Number(rawClosedTs) > 0
      ? Number(rawClosedTs)
      : null;

  const dailySession = {
    isOpen:
      typeof candidate.dailySession?.isOpen === 'boolean'
        ? candidate.dailySession.isOpen
        : defaults.dailySession.isOpen,
    dayNumber: Math.max(1, parseInt(candidate.dailySession?.dayNumber || '1', 10) || 1),
    dateKey: validDateKey,
    openedAt:
      typeof candidate.dailySession?.openedAt === 'string' && candidate.dailySession.openedAt
        ? candidate.dailySession.openedAt
        : defaults.dailySession.openedAt,
    openedTimestamp,
    reopenedAt:
      typeof candidate.dailySession?.reopenedAt === 'string' && candidate.dailySession.reopenedAt
        ? candidate.dailySession.reopenedAt
        : null,
    openingCash: Number.isFinite(Number(candidate.dailySession?.openingCash))
      ? Number(candidate.dailySession.openingCash)
      : storeProfile.cashBalance,
    closedAt: candidate.dailySession?.closedAt || null,
    closedTimestamp
  };

  const gamification = {
    xp: Math.max(0, Number(candidate.gamification?.xp) || 0),
    unlockedBadges: Array.isArray(candidate.gamification?.unlockedBadges)
      ? [...new Set(candidate.gamification.unlockedBadges.filter((b) => typeof b === 'string'))]
      : ['first_step']
  };

  const products = Array.isArray(candidate.products)
    ? candidate.products.map((p, index) => ({
        id: typeof p.id === 'string' && p.id ? p.id : `PRD-${index + 1}`,
        name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Produk Tanpa Nama',
        category: typeof p.category === 'string' && p.category ? p.category : 'Sembako',
        imageUrl: p.imageUrl || getCategoryFallbackImage(p.category),
        costPrice: Math.max(0, Number(p.costPrice) || 0),
        sellPrice: Math.max(0, Number(p.sellPrice) || 0),
        stock: Math.max(0, parseInt(p.stock ?? 0, 10) || 0),
        dailySalesAvg: Math.max(1, parseInt(p.dailySalesAvg ?? 1, 10) || 1),
        leadTimeDays: Math.max(1, parseInt(p.leadTimeDays ?? 1, 10) || 1),
        safetyStock: Math.max(0, parseInt(p.safetyStock ?? 0, 10) || 0)
      }))
    : defaults.products;

  const transactions = Array.isArray(candidate.transactions) ? candidate.transactions : [];
  const dailyHistoryArchive = Array.isArray(candidate.dailyHistoryArchive)
    ? candidate.dailyHistoryArchive
    : [];

  const dailyAdjustments = {};
  if (candidate.dailyAdjustments && typeof candidate.dailyAdjustments === 'object') {
    Object.entries(candidate.dailyAdjustments).forEach(([dayKey, adj]) => {
      if (!adj || typeof adj !== 'object') return;
      const rawItems = Array.isArray(adj.items) ? adj.items : [];
      const items = rawItems
        .filter((it) => it && typeof it === 'object' && Number.isFinite(Number(it.amount)))
        .map((it, idx) => ({
          id: typeof it.id === 'string' && it.id ? it.id : `EXP-${dayKey}-${idx + 1}`,
          title:
            typeof it.title === 'string' && it.title.trim()
              ? it.title.trim().slice(0, 120)
              : 'Pengeluaran Harian',
          amount: Number(it.amount) || 0,
          time: typeof it.time === 'string' ? it.time : ''
        }));

      let expense = Number.isFinite(Number(adj.expense)) ? Number(adj.expense) : 0;
      if (items.length > 0) {
        expense = items.reduce((sum, it) => sum + it.amount, 0);
      } else if (expense !== 0) {
        items.push({
          id: `EXP-${dayKey}-LEGACY`,
          title:
            typeof adj.note === 'string' && adj.note.trim()
              ? adj.note.trim().slice(0, 120)
              : 'Pengeluaran Harian',
          amount: expense,
          time: typeof adj.updatedAt === 'string' ? adj.updatedAt : ''
        });
      }

      if (items.length > 0 || expense !== 0) {
        dailyAdjustments[String(dayKey)] = {
          expense,
          note: typeof adj.note === 'string' ? adj.note.trim().slice(0, 120) : '',
          updatedAt: typeof adj.updatedAt === 'string' ? adj.updatedAt : '',
          items
        };
      }
    });
  }

  return {
    storeProfile,
    dailySession,
    gamification,
    products,
    transactions,
    dailyHistoryArchive,
    dailyAdjustments
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = getDefaultState();
      saveState(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (err) {
    console.error('Gagal membaca localStorage, menggunakan data awal:', err);
    return getDefaultState();
  }
}

export function saveState(stateToSave) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    return true;
  } catch (err) {
    console.error('Gagal menyimpan state ke localStorage:', err);
    return false;
  }
}
