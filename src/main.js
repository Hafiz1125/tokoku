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
  openStartNewDayModal,
  renderDailyTransactions
} from './js/modules/laporan.js';
import {
  openDeleteProductModal,
  openProductFormModal,
  renderProductsGrid
} from './js/modules/produk.js';
import { openAuditStockModal, renderSisaStock } from './js/modules/sisa.js';
import { executeRestock, renderStockCards } from './js/modules/stock.js';
import { loadState, saveState } from './js/storage.js';
import {
  closeModal,
  initModalChrome,
  openBadgesAndProfileModal,
  openModal,
  showToast,
  updateHeaderAndGamificationUI
} from './js/ui.js';
import { getLevelInfo } from './js/utils.js';

let appState = loadState();
let activeTab = 'produk';
const posCart = {};

function renderActiveTab() {
  if (activeTab === 'produk') renderProductsGrid(ctx);
  if (activeTab === 'stock') renderStockCards(ctx);
  if (activeTab === 'harga') {
    renderPOSProducts(ctx);
    renderCart(ctx);
  }
  if (activeTab === 'sisa') renderSisaStock(ctx);
  if (activeTab === 'laporan') renderDailyTransactions(ctx);
}

function persistAndRefresh() {
  if (!saveState(appState)) {
    showToast('Gagal menyimpan data ke penyimpanan browser.', 'error');
  }
  updateHeaderAndGamificationUI(appState);
  renderActiveTab();
}

function replaceState(nextState) {
  appState = nextState;
  ctx.appState = appState;
  Object.keys(posCart).forEach((k) => delete posCart[k]);
  persistAndRefresh();
}

function recordDailyTransaction({ type, summary, amount, profit, discountPercent }) {
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
    discountPercent: discountPercent || 0
  });
}

function awardXP(amount, reasonText) {
  const oldLevel = getLevelInfo(appState.gamification.xp).level;
  appState.gamification.xp += amount;
  const newLevelInfo = getLevelInfo(appState.gamification.xp);

  saveState(appState);
  updateHeaderAndGamificationUI(appState);
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
    saveState(appState);
    updateHeaderAndGamificationUI(appState);
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
  activeTab = tabName;

  document.querySelectorAll('main section[id^="tab-"]').forEach((sec) => {
    sec.classList.add('hidden');
  });

  const target = document.getElementById(`tab-${tabName}`);
  target?.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const isActive = btn.getAttribute('data-nav') === tabName;
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
    const isActive = btn.getAttribute('data-nav') === tabName;
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
        replaceState(getDefaultState());
        closeModal();
        showToast('Data simulasi berhasil diatur ulang ke kondisi awal.', 'info');
      });
    }
  });
}

function wireStaticListeners() {
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

  // Tab 5: Laporan
  document.getElementById('laporan-day-filter')?.addEventListener('change', () => renderDailyTransactions(ctx));
}

window.addEventListener('DOMContentLoaded', () => {
  wireStaticListeners();
  updateHeaderAndGamificationUI(appState);
  switchTab('produk');
});
