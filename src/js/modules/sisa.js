import { renderIcon } from '../icons.js';
import { closeModal, openModal, showToast } from '../ui.js';
import { escapeHTML, formatRupiah, getMinStockThreshold } from '../utils.js';

const ADJUST_REASONS = [
  'Hitung ulang di rak',
  'Barang rusak / kedaluwarsa',
  'Dipakai toko / pribadi',
  'Retur / salah catat'
];

export function renderSisaStock(ctx) {
  const { appState } = ctx;
  const tbody = document.getElementById('sisa-stock-table-body');
  const totalAssetEl = document.getElementById('sisa-total-asset-value');
  if (!tbody) return;

  const searchEl = document.getElementById('stock-search-input');
  const statusEl = document.getElementById('stock-status-filter');
  const query = searchEl instanceof HTMLInputElement ? searchEl.value.trim().toLowerCase() : '';
  const statusFilter = statusEl instanceof HTMLSelectElement ? statusEl.value : 'ALL';

  const filtered = appState.products.filter((p) => {
    const minStock = getMinStockThreshold(p);
    const needsRestock = p.stock <= minStock;
    const matchQuery =
      !query ||
      p.name.toLowerCase().includes(query) ||
      (p.category || '').toLowerCase().includes(query);
    const matchStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'LOW' && needsRestock) ||
      (statusFilter === 'SAFE' && !needsRestock);
    return matchQuery && matchStatus;
  });

  if (totalAssetEl) {
    const totalAsset = filtered.reduce((sum, p) => sum + p.stock * p.costPrice, 0);
    totalAssetEl.textContent = formatRupiah(totalAsset);
  }

  if (appState.products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-10 px-4 text-center text-sm text-slate-500">
          Belum ada produk di katalog untuk dikelola stoknya.
        </td>
      </tr>
    `;
  } else if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-8 px-4 text-center text-sm text-slate-500">
          Tidak ada produk yang cocok dengan filter stok.
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = filtered
      .map((p) => {
        const assetVal = p.stock * p.costPrice;
        const minStock = getMinStockThreshold(p);
        const safeId = escapeHTML(p.id);

        let statusHTML = `<span class="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">${renderIcon(
          'check-circle',
          'w-3.5 h-3.5'
        )} Aman</span>`;

        if (p.stock === 0) {
          statusHTML = `<span class="inline-flex items-center gap-1 text-xs font-bold text-rose-700">${renderIcon(
            'alert-circle',
            'w-3.5 h-3.5'
          )} Habis (0)</span>`;
        } else if (p.stock <= minStock) {
          statusHTML = `<span class="inline-flex items-center gap-1 text-xs font-bold text-amber-700">${renderIcon(
            'alert-triangle',
            'w-3.5 h-3.5'
          )} Stok Menipis</span>`;
        }

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-3.5 px-4">
              <div class="font-semibold text-slate-900">${escapeHTML(p.name)}</div>
              <div class="text-xs text-slate-500">${escapeHTML(p.category || 'Umum')}</div>
            </td>
            <td class="py-3.5 px-4 text-center font-extrabold font-mono tabular-nums text-slate-900">${p.stock}</td>
            <td class="py-3.5 px-4 text-center font-mono tabular-nums text-slate-600">${minStock}</td>
            <td class="py-3.5 px-4 text-center whitespace-nowrap">${statusHTML}</td>
            <td class="py-3.5 px-4 text-right font-semibold font-mono tabular-nums text-slate-800">${formatRupiah(
              assetVal
            )}</td>
            <td class="py-3.5 px-4">
              <div class="flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  data-action="quick-stock-step"
                  data-id="${safeId}"
                  data-delta="-1"
                  aria-label="Kurangi 1 stok ${escapeHTML(p.name)}"
                  title="Kurangi 1 unit"
                  ${p.stock <= 0 ? 'disabled' : ''}
                  class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 font-bold text-base hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
                >
                  &minus;
                </button>
                <button
                  type="button"
                  data-action="quick-stock-step"
                  data-id="${safeId}"
                  data-delta="1"
                  aria-label="Tambah 1 stok ${escapeHTML(p.name)}"
                  title="Tambah 1 unit"
                  class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 font-bold text-base hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 transition cursor-pointer shrink-0"
                >
                  +
                </button>
                <button
                  type="button"
                  data-action="open-adjust-stock"
                  data-id="${safeId}"
                  class="px-3 h-9 inline-flex items-center gap-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-teal-700 hover:text-white text-slate-700 transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  ${renderIcon('edit-3', 'w-3.5 h-3.5')}
                  <span>Atur</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }
}

export function quickAdjustStock(ctx, productId, delta) {
  const { appState, recordDailyTransaction, persistAndRefresh } = ctx;
  const prod = appState.products.find((p) => p.id === productId);
  if (!prod || !Number.isFinite(delta) || delta === 0) return;

  const prevStock = prod.stock;
  const nextStock = Math.max(0, prevStock + delta);
  const actualDelta = nextStock - prevStock;
  if (actualDelta === 0) {
    showToast(`Stok ${prod.name} sudah 0 unit.`, 'info');
    return;
  }

  prod.stock = nextStock;

  const currentDay = appState.dailySession?.dayNumber || 1;
  const latestTrx = appState.transactions[0];
  const canMergeRecentQuickStep =
    latestTrx &&
    latestTrx.type === 'AUDIT' &&
    latestTrx.productId === prod.id &&
    latestTrx.dayNumber === currentDay &&
    typeof latestTrx.summary === 'string' &&
    latestTrx.summary.startsWith('Penyesuaian cepat ') &&
    Number.isFinite(latestTrx.qty);

  if (canMergeRecentQuickStep) {
    const mergedDelta = latestTrx.qty + actualDelta;
    if (mergedDelta === 0) {
      appState.transactions.shift();
    } else {
      const mergedText = mergedDelta > 0 ? `+${mergedDelta} unit` : `${mergedDelta} unit`;
      latestTrx.qty = mergedDelta;
      latestTrx.summary = `Penyesuaian cepat ${prod.name}: ${mergedText} (menjadi ${nextStock} unit)`;
      latestTrx.time = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
  } else {
    const diffText = actualDelta > 0 ? `+${actualDelta} unit` : `${actualDelta} unit`;
    recordDailyTransaction({
      type: 'AUDIT',
      summary: `Penyesuaian cepat ${prod.name}: ${diffText} (menjadi ${nextStock} unit)`,
      amount: 0,
      profit: 0,
      discountPercent: 0,
      productId: prod.id,
      productName: prod.name,
      qty: actualDelta
    });
  }

  persistAndRefresh();
  const sign = actualDelta > 0 ? `+${actualDelta}` : `${actualDelta}`;
  showToast(`Stok ${prod.name} (${sign}) menjadi ${nextStock} unit.`, 'success');
}

export function openAdjustStockModal(ctx, productId) {
  const { appState, recordDailyTransaction, awardXP, unlockBadge, persistAndRefresh } = ctx;
  const prod = appState.products.find((p) => p.id === productId);
  if (!prod) return;

  let activeMode = 'set'; // 'set' | 'sub' | 'add'

  const bodyHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
        <div class="min-w-0">
          <div class="text-xs text-slate-500">${escapeHTML(prod.category || 'Produk')}</div>
          <div class="font-bold text-slate-900 truncate">${escapeHTML(prod.name)}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-[11px] text-slate-500">Stok Saat Ini</div>
          <div class="font-extrabold font-mono tabular-nums text-slate-900">${prod.stock} unit</div>
        </div>
      </div>

      <div>
        <span class="block text-xs font-bold text-slate-700 mb-1.5">Cara Penyesuaian</span>
        <div class="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            data-adjust-mode="set"
            class="px-2.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer bg-white text-teal-800 shadow-sm whitespace-nowrap"
          >
            Set Jumlah
          </button>
          <button
            type="button"
            data-adjust-mode="sub"
            class="px-2.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer text-slate-600 hover:text-slate-900 whitespace-nowrap"
          >
            Kurangi (&minus;)
          </button>
          <button
            type="button"
            data-adjust-mode="add"
            class="px-2.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer text-slate-600 hover:text-slate-900 whitespace-nowrap"
          >
            Tambah (+)
          </button>
        </div>
      </div>

      <div>
        <label for="adjust-stock-input" id="adjust-stock-label" class="block text-xs font-bold text-slate-700 mb-1.5">
          Jumlah Stok Baru (Unit)
        </label>
        <div class="flex items-center gap-2">
          <input
            type="number"
            id="adjust-stock-input"
            min="0"
            value="${prod.stock}"
            class="flex-1 px-3.5 py-2 min-h-[42px] border border-slate-300 rounded-xl text-sm font-bold font-mono tabular-nums focus:ring-2 focus:ring-teal-600 focus:outline-none"
          />
          <button
            type="button"
            data-nudge="-5"
            class="px-2.5 min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold font-mono text-slate-700 cursor-pointer shrink-0"
          >-5</button>
          <button
            type="button"
            data-nudge="-1"
            class="px-2.5 min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold font-mono text-slate-700 cursor-pointer shrink-0"
          >-1</button>
          <button
            type="button"
            data-nudge="1"
            class="px-2.5 min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold font-mono text-slate-700 cursor-pointer shrink-0"
          >+1</button>
          <button
            type="button"
            data-nudge="5"
            class="px-2.5 min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold font-mono text-slate-700 cursor-pointer shrink-0"
          >+5</button>
        </div>
      </div>

      <div id="adjust-preview-bar" class="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-teal-50 border border-teal-200 text-xs">
        <span class="text-slate-600 font-medium">Perkiraan Stok Akhir</span>
        <span id="adjust-preview-value" class="font-extrabold font-mono tabular-nums text-teal-800">${prod.stock} unit (tetap)</span>
      </div>

      <div>
        <label for="adjust-reason-input" class="block text-xs font-bold text-slate-700 mb-1.5">
          Alasan / Catatan <span class="font-normal text-slate-500">(opsional)</span>
        </label>
        <div class="flex flex-wrap gap-1.5 mb-2">
          ${ADJUST_REASONS.map(
            (reason) => `
              <button
                type="button"
                data-reason-preset="${escapeHTML(reason)}"
                class="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-800 text-xs font-medium text-slate-700 transition cursor-pointer"
              >
                ${escapeHTML(reason)}
              </button>
            `
          ).join('')}
        </div>
        <input
          type="text"
          id="adjust-reason-input"
          maxlength="80"
          placeholder="Contoh: Kemasan bocor, dipakai sendiri, atau hitung ulang rak"
          class="w-full px-3.5 py-2 min-h-[40px] border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
        />
      </div>
    </div>
  `;

  const footerHTML = `
    <button type="button" id="cancel-adjust-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
      Batal
    </button>
    <button type="button" id="save-adjust-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer">
      Simpan Perubahan
    </button>
  `;

  openModal({
    title: 'Atur Sisa Stock',
    bodyHTML,
    footerHTML,
    onMount: () => {
      const qtyInput = document.getElementById('adjust-stock-input');
      const labelEl = document.getElementById('adjust-stock-label');
      const previewBar = document.getElementById('adjust-preview-bar');
      const previewVal = document.getElementById('adjust-preview-value');
      const reasonInput = document.getElementById('adjust-reason-input');

      const computeNextStock = () => {
        const raw = Math.max(0, parseInt(qtyInput instanceof HTMLInputElement ? qtyInput.value : '0', 10) || 0);
        if (activeMode === 'sub') return Math.max(0, prod.stock - raw);
        if (activeMode === 'add') return prod.stock + raw;
        return raw;
      };

      const updatePreview = () => {
        if (!previewVal || !previewBar) return;
        const nextStock = computeNextStock();
        const diff = nextStock - prod.stock;
        const diffLabel =
          diff === 0 ? 'tidak berubah' : diff > 0 ? `+${diff} unit` : `${diff} unit`;

        previewVal.textContent = `${nextStock} unit (${diffLabel})`;

        previewBar.classList.remove(
          'bg-teal-50',
          'border-teal-200',
          'bg-rose-50',
          'border-rose-200',
          'bg-slate-50',
          'border-slate-200'
        );
        previewVal.classList.remove('text-teal-800', 'text-rose-700', 'text-slate-700');

        if (diff > 0) {
          previewBar.classList.add('bg-teal-50', 'border-teal-200');
          previewVal.classList.add('text-teal-800');
        } else if (diff < 0) {
          previewBar.classList.add('bg-rose-50', 'border-rose-200');
          previewVal.classList.add('text-rose-700');
        } else {
          previewBar.classList.add('bg-slate-50', 'border-slate-200');
          previewVal.classList.add('text-slate-700');
        }
      };

      const setMode = (nextMode) => {
        activeMode = nextMode;
        document.querySelectorAll('[data-adjust-mode]').forEach((btn) => {
          const isMatch = btn.getAttribute('data-adjust-mode') === nextMode;
          if (isMatch) {
            btn.classList.add('bg-white', 'text-teal-800', 'shadow-sm');
            btn.classList.remove('text-slate-600', 'hover:text-slate-900');
          } else {
            btn.classList.remove('bg-white', 'text-teal-800', 'shadow-sm');
            btn.classList.add('text-slate-600', 'hover:text-slate-900');
          }
        });

        if (labelEl) {
          if (nextMode === 'sub') labelEl.textContent = 'Jumlah yang Dikurangi (Unit)';
          else if (nextMode === 'add') labelEl.textContent = 'Jumlah yang Ditambahkan (Unit)';
          else labelEl.textContent = 'Jumlah Stok Baru (Unit)';
        }

        if (qtyInput instanceof HTMLInputElement) {
          qtyInput.value = nextMode === 'set' ? String(prod.stock) : '1';
          qtyInput.focus();
          qtyInput.select();
        }
        updatePreview();
      };

      document.querySelectorAll('[data-adjust-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const m = btn.getAttribute('data-adjust-mode');
          if (m === 'set' || m === 'sub' || m === 'add') {
            setMode(m);
          }
        });
      });

      document.querySelectorAll('[data-nudge]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!(qtyInput instanceof HTMLInputElement)) return;
          const nudge = parseInt(btn.getAttribute('data-nudge') || '0', 10) || 0;
          const current = Math.max(0, parseInt(qtyInput.value || '0', 10) || 0);
          qtyInput.value = String(Math.max(0, current + nudge));
          updatePreview();
        });
      });

      document.querySelectorAll('[data-reason-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const text = btn.getAttribute('data-reason-preset') || '';
          if (reasonInput instanceof HTMLInputElement) {
            reasonInput.value = text;
          }
        });
      });

      qtyInput?.addEventListener('input', updatePreview);
      updatePreview();

      document.getElementById('cancel-adjust-btn')?.addEventListener('click', closeModal);
      document.getElementById('save-adjust-btn')?.addEventListener('click', () => {
        const nextStock = computeNextStock();
        const diff = nextStock - prod.stock;
        const reason = reasonInput instanceof HTMLInputElement ? reasonInput.value.trim() : '';

        if (diff === 0) {
          closeModal();
          showToast(`Stok ${prod.name} tetap ${prod.stock} unit.`, 'info');
          return;
        }

        prod.stock = nextStock;
        const diffText = diff > 0 ? `+${diff} unit` : `${diff} unit`;
        const reasonSuffix = reason ? ` · ${reason}` : '';

        recordDailyTransaction({
          type: 'AUDIT',
          summary: `Penyesuaian Stok ${prod.name}: ${diffText} (menjadi ${nextStock} unit)${reasonSuffix}`,
          amount: 0,
          profit: 0,
          discountPercent: 0,
          productId: prod.id,
          productName: prod.name,
          qty: diff
        });

        closeModal();
        persistAndRefresh();
        showToast(`Stok ${prod.name} diperbarui (${diffText}, sekarang ${nextStock} unit).`, 'success');
        awardXP(20, 'Menyesuaikan dan merapikan data sisa stok');
        unlockBadge('diligent_auditor');
      });
    }
  });
}

export const openAuditStockModal = openAdjustStockModal;
