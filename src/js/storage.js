import { STORAGE_KEY, getCategoryFallbackImage, getDefaultState } from './constants.js';

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
    cashBalance: Number.isFinite(Number(candidate.storeProfile?.cashBalance))
      ? Number(candidate.storeProfile.cashBalance)
      : defaults.storeProfile.cashBalance
  };

  const dailySession = {
    isOpen:
      typeof candidate.dailySession?.isOpen === 'boolean'
        ? candidate.dailySession.isOpen
        : defaults.dailySession.isOpen,
    dayNumber: Math.max(1, parseInt(candidate.dailySession?.dayNumber || '1', 10) || 1),
    openedAt:
      typeof candidate.dailySession?.openedAt === 'string' && candidate.dailySession.openedAt
        ? candidate.dailySession.openedAt
        : defaults.dailySession.openedAt,
    openingCash: Number.isFinite(Number(candidate.dailySession?.openingCash))
      ? Number(candidate.dailySession.openingCash)
      : storeProfile.cashBalance,
    closedAt: candidate.dailySession?.closedAt || null
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

  return {
    storeProfile,
    dailySession,
    gamification,
    products,
    transactions,
    dailyHistoryArchive
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
