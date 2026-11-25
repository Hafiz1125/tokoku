import { BADGE_DEFINITIONS } from './constants.js';
import { renderIcon } from './icons.js';
import { escapeHTML, formatRupiah, getLevelInfo } from './utils.js';

let activeModalCleanup = null;

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  let styles = 'bg-slate-900 text-white border-slate-700';
  let iconName = 'info';

  if (type === 'success') {
    styles = 'bg-emerald-700 text-white border-emerald-600';
    iconName = 'check-circle';
  } else if (type === 'error') {
    styles = 'bg-rose-700 text-white border-rose-600';
    iconName = 'alert-circle';
  } else if (type === 'xp') {
    styles = 'bg-amber-400 text-slate-950 border-amber-300 font-bold';
    iconName = 'award';
  }

  toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm transition-all duration-200 ${styles}`;
  toast.innerHTML = `${renderIcon(iconName, 'w-4 h-4 shrink-0')}<span>${escapeHTML(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px)';
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

export function openModal({ title, bodyHTML, footerHTML, onMount }) {
  const modal = document.getElementById('custom-modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const footerEl = document.getElementById('modal-footer');
  if (!modal || !titleEl || !bodyEl || !footerEl) return;

  if (typeof activeModalCleanup === 'function') {
    activeModalCleanup();
    activeModalCleanup = null;
  }

  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHTML;
  footerEl.innerHTML = footerHTML;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  if (typeof onMount === 'function') {
    const cleanup = onMount({ modal, bodyEl, footerEl });
    if (typeof cleanup === 'function') {
      activeModalCleanup = cleanup;
    }
  }

  const firstInput = bodyEl.querySelector('input, select, textarea');
  if (firstInput instanceof HTMLElement) {
    setTimeout(() => firstInput.focus(), 20);
  }
}

export function closeModal() {
  const modal = document.getElementById('custom-modal');
  if (!modal) return;
  if (typeof activeModalCleanup === 'function') {
    activeModalCleanup();
    activeModalCleanup = null;
  }
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

export function initModalChrome() {
  const modal = document.getElementById('custom-modal');
  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) {
    closeBtn.innerHTML = renderIcon('x', 'w-5 h-5');
    closeBtn.addEventListener('click', closeModal);
  }
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });
}

export function updateHeaderAndGamificationUI(appState, currentUser = null) {
  const storeName = appState.storeProfile.storeName || 'Toko Kelontong Sejahtera';
  const ownerName = appState.storeProfile.ownerName || 'Pengelola Toko';

  const storeNameEl = document.getElementById('store-name-display');
  if (storeNameEl) storeNameEl.textContent = storeName;

  const sideStoreNameEl = document.getElementById('sidebar-store-name');
  if (sideStoreNameEl) sideStoreNameEl.textContent = storeName;

  const sideOwnerNameEl = document.getElementById('sidebar-owner-name');
  if (sideOwnerNameEl) {
    sideOwnerNameEl.textContent = currentUser?.username ? `${ownerName} · @${currentUser.username}` : ownerName;
  }

  const sideInitialEl = document.getElementById('sidebar-owner-initial');
  if (sideInitialEl) sideInitialEl.textContent = storeName.trim().charAt(0).toUpperCase() || 'T';

  const currentDay = appState.dailySession?.dayNumber || 1;
  const todayTransactions = (appState.transactions || []).filter(
    (t) => (t.dayNumber || 1) === currentDay
  );
  const dailyTrxEl = document.getElementById('header-daily-transactions');
  if (dailyTrxEl) dailyTrxEl.textContent = `${todayTransactions.length} Transaksi`;

  const todaySalesTransactions = todayTransactions.filter((t) => t.type === 'SALE');
  const todayRevenue = todaySalesTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const todayCashSales = todaySalesTransactions
    .filter((t) => t.paymentMethod !== 'NON_CASH')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const todayNonCashSales = todaySalesTransactions
    .filter((t) => t.paymentMethod === 'NON_CASH')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const headerLevelEl = document.getElementById('header-level-label');
  if (headerLevelEl) headerLevelEl.textContent = 'Pendapatan Hari Ini';

  const headerXpEl = document.getElementById('header-xp-label');
  if (headerXpEl) headerXpEl.textContent = formatRupiah(todayRevenue);

  const headerCashSalesEl = document.getElementById('header-cash-sales');
  if (headerCashSalesEl) headerCashSalesEl.textContent = formatRupiah(todayCashSales);

  const headerNonCashSalesEl = document.getElementById('header-noncash-sales');
  if (headerNonCashSalesEl) headerNonCashSalesEl.textContent = formatRupiah(todayNonCashSales);

  const shiftBtn = document.getElementById('store-shift-btn');
  const shiftIcon = document.getElementById('store-shift-icon');
  const shiftLabel = document.getElementById('store-shift-label');
  if (shiftBtn && shiftIcon && shiftLabel && appState.dailySession) {
    if (appState.dailySession.isOpen) {
      shiftBtn.className =
        'px-4 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 bg-teal-700 hover:bg-teal-800 text-white';
      shiftIcon.innerHTML = renderIcon('sun', 'w-4 h-4 text-amber-300');
      shiftLabel.textContent = `Hari #${appState.dailySession.dayNumber} · Buka`;
    } else {
      shiftBtn.className =
        'px-4 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700';
      shiftIcon.innerHTML = renderIcon('lock', 'w-4 h-4 text-rose-400');
      shiftLabel.textContent = 'Toko Tutup · Buka Hari Baru';
    }
  }
}

export function openBadgesAndProfileModal(ctx) {
  const { appState, persistAndRefresh } = ctx;
  const unlocked = appState.gamification.unlockedBadges || [];
  const lvl = getLevelInfo(appState.gamification.xp);

  const badgesHTML = BADGE_DEFINITIONS.map((badge) => {
    const isUnlocked = unlocked.includes(badge.id);
    return `
      <div class="flex items-start gap-3 p-3 rounded-xl border ${
        isUnlocked ? 'bg-amber-50/70 border-amber-200' : 'bg-slate-50 border-slate-200 opacity-70'
      }">
        <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          isUnlocked ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-500'
        }">
          ${renderIcon(badge.icon, 'w-4 h-4')}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <h5 class="font-bold text-sm text-slate-900">${escapeHTML(badge.title)}</h5>
            <span class="text-xs font-semibold ${isUnlocked ? 'text-emerald-700' : 'text-slate-500'}">
              ${isUnlocked ? 'Terbuka' : 'Terkunci'}
            </span>
          </div>
          <p class="text-xs text-slate-600 mt-0.5">${escapeHTML(badge.desc)}</p>
        </div>
      </div>
    `;
  }).join('');

  const bodyHTML = `
    <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div class="space-y-3">
        <div>
          <label for="profile-store-name" class="block text-xs font-bold text-slate-700 mb-1">Nama Usaha / Toko</label>
          <input
            type="text"
            id="profile-store-name"
            value="${escapeHTML(appState.storeProfile.storeName)}"
            maxlength="48"
            class="w-full px-3.5 py-2 min-h-[42px] border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <div>
          <label for="profile-owner-name" class="block text-xs font-bold text-slate-700 mb-1">Nama Pemilik / Pengelola</label>
          <input
            type="text"
            id="profile-owner-name"
            value="${escapeHTML(appState.storeProfile.ownerName || 'Pengelola Toko')}"
            maxlength="48"
            class="w-full px-3.5 py-2 min-h-[42px] border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <button
          type="button"
          id="save-store-name-btn"
          class="w-full px-4 py-2 min-h-[42px] rounded-xl text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white transition cursor-pointer"
        >Simpan Profil Usaha</button>
      </div>

      <div class="pt-2 border-t border-slate-200">
        <div class="flex items-center justify-between mb-2.5">
          <h4 class="font-bold text-slate-900 text-sm">Lencana Pencapaian Wirausaha</h4>
          <span class="text-xs font-mono tabular-nums text-slate-500">Lv.${lvl.level} &middot; ${appState.gamification.xp} XP</span>
        </div>
        <div class="space-y-2">${badgesHTML}</div>
      </div>
    </div>
  `;

  openModal({
    title: 'Profil Usaha & Lencana',
    bodyHTML,
    footerHTML: `
      <button type="button" id="close-profile-modal-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
        Tutup
      </button>
    `,
    onMount: () => {
      const closeBtn = document.getElementById('close-profile-modal-btn');
      const saveBtn = document.getElementById('save-store-name-btn');
      const storeInput = document.getElementById('profile-store-name');
      const ownerInput = document.getElementById('profile-owner-name');

      closeBtn?.addEventListener('click', closeModal);
      saveBtn?.addEventListener('click', () => {
        const nextStore = storeInput instanceof HTMLInputElement ? storeInput.value.trim() : '';
        const nextOwner = ownerInput instanceof HTMLInputElement ? ownerInput.value.trim() : '';
        if (!nextStore) {
          showToast('Nama usaha tidak boleh kosong.', 'error');
          return;
        }
        appState.storeProfile.storeName = nextStore;
        appState.storeProfile.ownerName = nextOwner || 'Pengelola Toko';
        persistAndRefresh();
        showToast('Profil usaha berhasil diperbarui.', 'success');
        closeModal();
      });
    }
  });
}
