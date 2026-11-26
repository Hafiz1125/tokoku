import {
  clearAuthSession,
  getAuthToken,
  getCurrentUser,
  initAuthScreen,
  saveStoreToServer
} from './js/auth.js';
import { BADGE_DEFINITIONS, getDefaultState } from './js/constants.js';
import { hydrateStaticIcons, renderIcon } from './js/icons.js';
import {
  addToCart,
  checkoutCart,
  clearCart,
  renderCart,
  renderPOSProducts,
  updateCartQty
} from './js/modules/harga.js';
import {
  exportTransactionsCSV,
  openBackupRestoreModal,
  openDailyClosingModal,
  openEditTodayIncomeModal,
  openStartNewDayModal,
  renderDailyTransactions
} from './js/modules/laporan.js';
import {
  openDeleteProductModal,
  openProductFormModal,
  renderProductsGrid
} from './js/modules/produk.js';
import { openAuditStockModal, renderSisaStock } from './js/modules/sisa.js';
import { executeRestock, renderStockCards, updateRestockSubtotal } from './js/modules/stock.js';
import { normalizeState } from './js/storage.js';
import {
  closeModal,
  initModalChrome,
  openBadgesAndProfileModal,
  openModal,
  showToast,
  updateHeaderAndGamificationUI,
  updateRealtimeClockAndShiftUI
} from './js/ui.js';
import { getLevelInfo } from './js/utils.js';

let appState = getDefaultState();
let activeTab = 'produk';
let authController = null;
const posCart = {};

function showAuthScreen() {
  const authScreen = document.getElementById('auth-screen');
  const appShell = document.getElementById('app-shell');
  authScreen?.classList.remove('hidden');
  appShell?.classList.add('hidden');
  appShell?.classList.remove('flex');
}

function showAppShell() {
  const authScreen = document.getElementById('auth-screen');
  const appShell = document.getElementById('app-shell');
  authScreen?.classList.add('hidden');
  appShell?.classList.remove('hidden');
  appShell?.classList.add('flex');
}

function renderActiveTab() {
  if (activeTab === 'produk') renderProductsGrid(ctx);
  if (activeTab === 'stock') {
    renderStockCards(ctx);
    renderSisaStock(ctx);
  }
  if (activeTab === 'harga') {
    renderPOSProducts(ctx);
    renderCart(ctx);
  }
  if (activeTab === 'laporan') renderDailyTransactions(ctx);
}

function persistAndRefresh() {
  updateHeaderAndGamificationUI(appState, getCurrentUser());
  renderActiveTab();

  if (getAuthToken()) {
    saveStoreToServer(appState).catch((err) => {
      showToast(err instanceof Error ? err.message : 'Gagal menyinkronkan data ke server.', 'error');
    });
  }
}

function replaceState(nextState) {
  appState = normalizeState(nextState);
  ctx.appState = appState;
  Object.keys(posCart).forEach((k) => delete posCart[k]);
  persistAndRefresh();
}

function recordDailyTransaction({
  type,
  summary,
  amount,
  profit,
  discountPercent,
  paymentMethod,
  productId,
  productName,
  qty,
  unitPrice
}) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const dateStr = now.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  appState.transactions.unshift({
    id: 'TRX-' + now.getTime().toString().slice(-6),
    dayNumber: appState.dailySession.dayNumber,
    date: dateStr,
    time: timeStr,
    type,
    summary,
    amount,
    profit,
    discountPercent: discountPercent || 0,
    paymentMethod: paymentMethod || (type === 'SALE' ? 'CASH' : null),
    ...(productId ? { productId } : {}),
    ...(productName ? { productName } : {}),
    ...(Number.isFinite(qty) ? { qty } : {}),
    ...(Number.isFinite(unitPrice) ? { unitPrice } : {})
  });
}

function awardXP(amount, reasonText) {
  const oldLevel = getLevelInfo(appState.gamification.xp).level;
  appState.gamification.xp += amount;
  const newLevelInfo = getLevelInfo(appState.gamification.xp);

  updateHeaderAndGamificationUI(appState, getCurrentUser());
  if (getAuthToken()) {
    saveStoreToServer(appState).catch(() => {});
  }
  showToast(`+${amount} XP: ${reasonText}`, 'xp');

  if (newLevelInfo.level > oldLevel) {
    setTimeout(() => {
      showToast(`Selamat! Anda naik ke Level ${newLevelInfo.level}: ${newLevelInfo.title}!`, 'success');
    }, 350);
  }
}

function unlockBadge(badgeId) {
  if (!Array.isArray(appState.gamification.unlockedBadges)) {
    appState.gamification.unlockedBadges = [];
  }
  if (!appState.gamification.unlockedBadges.includes(badgeId)) {
    appState.gamification.unlockedBadges.push(badgeId);
    const badge = BADGE_DEFINITIONS.find((b) => b.id === badgeId);
    updateHeaderAndGamificationUI(appState, getCurrentUser());
    if (getAuthToken()) {
      saveStoreToServer(appState).catch(() => {});
    }
    if (badge) {
      setTimeout(() => {
        showToast(`Lencana Terbuka: ${badge.title}!`, 'success');
      }, 280);
    }
  }
}

function openShiftActionModal() {
  if (appState.dailySession.isOpen) {
    openDailyClosingModal(ctx);
  } else {
    openStartNewDayModal(ctx);
  }
}

const ctx = {
  appState,
  posCart,
  persistAndRefresh,
  replaceState,
  recordDailyTransaction,
  awardXP,
  unlockBadge,
  openShiftActionModal
};

function switchTab(tabName) {
  activeTab = tabName === 'sisa' ? 'stock' : tabName;

  document.querySelectorAll('main section[id^="tab-"]').forEach((sec) => {
    sec.classList.add('hidden');
  });

  const target = document.getElementById(`tab-${activeTab}`);
  target?.classList.remove('hidden');

  const kasirMetricsEl = document.getElementById('header-kasir-metrics');
  if (kasirMetricsEl) {
    if (activeTab === 'harga') {
      kasirMetricsEl.classList.remove('hidden');
      kasirMetricsEl.classList.add('flex');
    } else {
      kasirMetricsEl.classList.add('hidden');
      kasirMetricsEl.classList.remove('flex');
    }
  }

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const isActive = btn.getAttribute('data-nav') === activeTab;
    if (isActive) {
      btn.classList.add('bg-teal-50', 'text-teal-800');
      btn.classList.remove('text-slate-600', 'hover:bg-slate-50');
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.classList.remove('bg-teal-50', 'text-teal-800');
      btn.classList.add('text-slate-600', 'hover:bg-slate-50');
      btn.removeAttribute('aria-current');
    }
  });

  document.querySelectorAll('.nav-btn-mobile').forEach((btn) => {
    const isActive = btn.getAttribute('data-nav') === activeTab;
    if (isActive) {
      btn.classList.add('text-teal-700', 'bg-teal-50');
      btn.classList.remove('text-slate-600');
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.classList.remove('text-teal-700', 'bg-teal-50');
      btn.classList.add('text-slate-600');
      btn.removeAttribute('aria-current');
    }
  });

  renderActiveTab();
}

function openConfirmResetModal() {
  openModal({
    title: 'Reset Data Simulasi TokoKu?',
    bodyHTML:
      '<p>Seluruh progres XP, lencana, stok, transaksi, dan produk akan dikembalikan ke pengaturan awal <strong>Toko Kelontong Sejahtera</strong>.</p>',
    footerHTML: `
      <button type="button" id="cancel-reset-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">Batal</button>
      <button type="button" id="confirm-reset-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-rose-700 hover:bg-rose-800 text-white cursor-pointer">Reset Sekarang</button>
    `,
    onMount: () => {
      document.getElementById('cancel-reset-btn')?.addEventListener('click', closeModal);
      document.getElementById('confirm-reset-btn')?.addEventListener('click', () => {
        const fresh = getDefaultState();
        fresh.storeProfile.storeName = appState.storeProfile.storeName;
        fresh.storeProfile.ownerName = appState.storeProfile.ownerName;
        replaceState(fresh);
        closeModal();
        showToast('Data simulasi berhasil diatur ulang ke kondisi awal.', 'info');
      });
    }
  });
}

function handleLogout() {
  clearAuthSession();
  Object.keys(posCart).forEach((k) => delete posCart[k]);
  appState = getDefaultState();
  ctx.appState = appState;
  closeModal();
  showAuthScreen();
  authController?.resetToLogin();
  showToast('Anda telah keluar dari akun.', 'info');
}

function wireStaticListeners() {
  const authBrandLogo = document.getElementById('auth-brand-icon');
  if (authBrandLogo) authBrandLogo.innerHTML = renderIcon('store', 'w-6 h-6');

  const brandLogo = document.getElementById('brand-logo-icon');
  if (brandLogo) brandLogo.innerHTML = renderIcon('store', 'w-5 h-5');

  const mobileBrandLogo = document.getElementById('mobile-brand-icon');
  if (mobileBrandLogo) mobileBrandLogo.innerHTML = renderIcon('store', 'w-5 h-5');

  const editProfileBtn = document.getElementById('edit-store-profile-btn');
  if (editProfileBtn) {
    editProfileBtn.innerHTML = renderIcon('edit-3', 'w-3.5 h-3.5');
    editProfileBtn.addEventListener('click', () => openBadgesAndProfileModal(ctx));
  }

  hydrateStaticIcons();
  window.addEventListener('tokoku:refresh-icons', hydrateStaticIcons);
  initModalChrome();

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-nav');
      if (targetTab) switchTab(targetTab);
    });
  });

  document.getElementById('store-shift-btn')?.addEventListener('click', openShiftActionModal);
  document.getElementById('laporan-shift-action-btn')?.addEventListener('click', openShiftActionModal);
  document.getElementById('open-badges-btn')?.addEventListener('click', () => openBadgesAndProfileModal(ctx));
  document.getElementById('header-gamification-btn')?.addEventListener('click', () => switchTab('laporan'));
  document.getElementById('open-backup-btn')?.addEventListener('click', () => openBackupRestoreModal(ctx));
  document.getElementById('reset-data-btn')?.addEventListener('click', openConfirmResetModal);
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('mobile-logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('export-csv-btn')?.addEventListener('click', () => exportTransactionsCSV(ctx));

  // Tab 1: Produk
  document.getElementById('add-product-btn')?.addEventListener('click', () => openProductFormModal(ctx));
  document.getElementById('search-product-input')?.addEventListener('input', () => renderProductsGrid(ctx));
  document.getElementById('filter-category-select')?.addEventListener('change', () => renderProductsGrid(ctx));

  document.getElementById('products-cards-grid')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;
    const action = target.getAttribute('data-action');
    const id = target.getAttribute('data-id');
    if (action === 'edit-product' && id) openProductFormModal(ctx, id);
    if (action === 'delete-product' && id) openDeleteProductModal(ctx, id);
    if (action === 'reset-product-filter') {
      const searchEl = document.getElementById('search-product-input');
      const catEl = document.getElementById('filter-category-select');
      if (searchEl instanceof HTMLInputElement) searchEl.value = '';
      if (catEl instanceof HTMLSelectElement) catEl.value = 'ALL';
      renderProductsGrid(ctx);
    }
  });

  // Tab 2: Stock
  document.getElementById('stock-cards-grid')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;
    if (target.getAttribute('data-action') === 'execute-restock') {
      const id = target.getAttribute('data-id');
      if (id) executeRestock(ctx, id);
    }
  });
  document.getElementById('stock-cards-grid')?.addEventListener('input', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-restock-input]') : null;
    if (!target) return;
    const id = target.getAttribute('data-restock-input');
    if (id) updateRestockSubtotal(id);
  });

  // Tab 3: Harga & POS
  document.getElementById('pos-products-grid')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;
    if (target.getAttribute('data-action') === 'add-to-cart') {
      const id = target.getAttribute('data-id');
      if (id) addToCart(ctx, id);
    }
  });

  document.getElementById('pos-cart-items')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;
    const action = target.getAttribute('data-action');
    const id = target.getAttribute('data-id');
    if (!id) return;
    if (action === 'cart-dec') updateCartQty(ctx, id, -1);
    if (action === 'cart-inc') updateCartQty(ctx, id, 1);
  });

  document.getElementById('pos-clear-cart-btn')?.addEventListener('click', () => clearCart(ctx));
  document.getElementById('pos-discount-input')?.addEventListener('input', () => renderCart(ctx));
  document.getElementById('pos-checkout-btn')?.addEventListener('click', () => checkoutCart(ctx));

  // Tab 4: Sisa Stock
  document.getElementById('sisa-stock-table-body')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;
    if (target.getAttribute('data-action') === 'open-audit') {
      const id = target.getAttribute('data-id');
      if (id) openAuditStockModal(ctx, id);
    }
  });

  // Tab 4: Laporan
  document.getElementById('monthly-day-select')?.addEventListener('change', (event) => {
    const sel = event.target;
    const dayFilterEl = document.getElementById('laporan-day-filter');
    if (sel instanceof HTMLSelectElement && dayFilterEl instanceof HTMLSelectElement) {
      dayFilterEl.value = sel.value;
    }
    renderDailyTransactions(ctx);
  });
  document.getElementById('laporan-day-filter')?.addEventListener('change', (event) => {
    const sel = event.target;
    const monthlyDaySelect = document.getElementById('monthly-day-select');
    if (sel instanceof HTMLSelectElement && monthlyDaySelect instanceof HTMLSelectElement) {
      monthlyDaySelect.value = sel.value;
    }
    renderDailyTransactions(ctx);
  });
  document.getElementById('add-expense-btn')?.addEventListener('click', () => openEditTodayIncomeModal(ctx));
  document.getElementById('edit-today-income-btn')?.addEventListener('click', () => openEditTodayIncomeModal(ctx));
}

window.addEventListener('DOMContentLoaded', () => {
  wireStaticListeners();
  showAuthScreen();

  updateRealtimeClockAndShiftUI(appState);
  window.setInterval(() => {
    updateRealtimeClockAndShiftUI(appState);
  }, 1000);

  authController = initAuthScreen({
    onAuthenticated: ({ user, storeState }) => {
      appState = normalizeState(storeState);
      ctx.appState = appState;
      Object.keys(posCart).forEach((k) => delete posCart[k]);
      showAppShell();
      updateHeaderAndGamificationUI(appState, user);
      switchTab('produk');
      showToast(`Selamat datang, ${user.ownerName}!`, 'success');
    }
  });
});
