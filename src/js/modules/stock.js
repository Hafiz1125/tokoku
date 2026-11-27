import { renderIcon } from '../icons.js';
import { showToast } from '../ui.js';
import { escapeHTML, formatRupiah, getMinStockThreshold } from '../utils.js';

export function renderStockCards(ctx) {
  const { appState } = ctx;
  const grid = document.getElementById('stock-cards-grid');
  if (!grid) return;

  const searchEl = document.getElementById('stock-search-input');
  const statusEl = document.getElementById('stock-status-filter');
  const query = searchEl instanceof HTMLInputElement ? searchEl.value.trim().toLowerCase() : '';
  const statusFilter = statusEl instanceof HTMLSelectElement ? statusEl.value : 'ALL';

  const countSummaryEl = document.getElementById('stock-summary-count');
  const lowSummaryEl = document.getElementById('stock-summary-low');
  const assetSummaryEl = document.getElementById('stock-summary-asset');

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

  if (countSummaryEl) {
    countSummaryEl.textContent = `${filtered.length} barang`;
  }
  if (lowSummaryEl) {
    const lowCount = filtered.filter((p) => p.stock <= getMinStockThreshold(p)).length;
    lowSummaryEl.textContent = `${lowCount} barang`;
    lowSummaryEl.className = `text-sm font-extrabold font-mono tabular-nums mt-0.5 ${
      lowCount > 0 ? 'text-amber-700' : 'text-emerald-700'
    }`;
  }
  if (assetSummaryEl) {
    const totalAsset = filtered.reduce((sum, p) => sum + p.stock * p.costPrice, 0);
    assetSummaryEl.textContent = formatRupiah(totalAsset);
  }

  if (appState.products.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-2xl border border-slate-200 py-12 px-6 text-center">
        <p class="text-sm text-slate-600">Belum ada produk di katalog. Tambahkan produk di menu Produk &amp; Margin untuk mengelola stok.</p>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-2xl border border-slate-200 py-10 px-6 text-center">
        <p class="text-sm text-slate-600">Tidak ada barang yang cocok dengan pencarian atau filter stok.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .map((p) => {
      const safeId = escapeHTML(p.id);
      const minStock = getMinStockThreshold(p);
      const needsRestock = p.stock <= minStock;
      const assetVal = p.stock * p.costPrice;
      const recommendedQty = Math.max(10, minStock * 3 - p.stock);

      let statusHTML = `<span class="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 shrink-0">${renderIcon(
        'check-circle',
        'w-3.5 h-3.5 text-emerald-600'
      )} Stok Aman</span>`;

      if (p.stock === 0) {
        statusHTML = `<span class="inline-flex items-center gap-1 text-xs font-bold text-rose-700 shrink-0">${renderIcon(
          'alert-circle',
          'w-3.5 h-3.5 text-rose-600'
        )} Habis (0)</span>`;
      } else if (needsRestock) {
        statusHTML = `<span class="inline-flex items-center gap-1 text-xs font-bold text-amber-800 shrink-0">${renderIcon(
          'alert-triangle',
          'w-3.5 h-3.5 text-amber-600'
        )} Perlu Restock</span>`;
      }

      return `
        <article class="bg-white rounded-2xl border ${
          p.stock === 0 ? 'border-rose-300' : needsRestock ? 'border-amber-300' : 'border-slate-200'
        } p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h4 class="font-bold text-slate-900 text-base truncate" title="${escapeHTML(p.name)}">${escapeHTML(
        p.name
      )}</h4>
              <p class="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                ${escapeHTML(p.category || 'Umum')} &middot; Modal ${formatRupiah(p.costPrice)}/unit
              </p>
            </div>
            ${statusHTML}
          </div>

          <div class="bg-slate-50 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-baseline gap-2 flex-wrap">
                <span class="text-2xl font-extrabold font-mono tabular-nums text-slate-900">${p.stock}</span>
                <span class="text-xs font-semibold text-slate-600">unit tersisa</span>
                <span aria-hidden="true" class="text-slate-300">&middot;</span>
                <span class="text-xs text-slate-500 font-mono tabular-nums">Min. ${minStock}</span>
              </div>
              <div class="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                Nilai aset stok: <strong class="text-slate-800">${formatRupiah(assetVal)}</strong>
              </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-action="quick-stock-step"
                data-id="${safeId}"
                data-delta="-1"
                aria-label="Kurangi 1 stok ${escapeHTML(p.name)}"
                title="Kurangi 1 unit"
                ${p.stock <= 0 ? 'disabled' : ''}
                class="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-base hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
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
                class="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-base hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 transition cursor-pointer shrink-0"
              >
                +
              </button>
              <button
                type="button"
                data-action="open-adjust-stock"
                data-id="${safeId}"
                class="px-3 h-9 inline-flex items-center gap-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:bg-teal-700 hover:border-teal-700 hover:text-white text-slate-700 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                ${renderIcon('edit-3', 'w-3.5 h-3.5')}
                <span>Atur</span>
              </button>
            </div>
          </div>

          <div class="space-y-2.5 pt-3 border-t border-slate-100">
            <div class="flex items-center justify-between gap-2 text-xs">
              <span class="font-bold text-slate-700">Belanja Stok Masuk</span>
              <span class="text-slate-500 font-mono tabular-nums">Saran: +${recommendedQty} unit</span>
            </div>
            <div class="grid grid-cols-2 gap-2.5">
              <div class="min-w-0">
                <label for="restock-qty-${safeId}" class="block text-[11px] font-semibold text-slate-500 mb-1">
                  Jumlah Masuk
                </label>
                <input
                  type="number"
                  id="restock-qty-${safeId}"
                  data-restock-input="${safeId}"
                  min="1"
                  value="${recommendedQty}"
                  class="w-full px-3 py-2 min-h-[40px] bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-sm font-semibold font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600 transition"
                />
              </div>
              <div class="min-w-0">
                <label for="restock-price-${safeId}" class="block text-[11px] font-semibold text-slate-500 mb-1">
                  Harga Beli / Unit (Rp)
                </label>
                <input
                  type="number"
                  id="restock-price-${safeId}"
                  data-restock-input="${safeId}"
                  min="0"
                  step="100"
                  value="${p.costPrice}"
                  class="w-full px-3 py-2 min-h-[40px] bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-sm font-semibold font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600 transition"
                />
              </div>
            </div>
            <div class="flex items-center justify-between gap-2 pt-0.5">
              <div class="text-xs text-slate-600">
                Total Belanja:
                <strong id="restock-subtotal-${safeId}" class="font-mono tabular-nums text-amber-700">${formatRupiah(
                  recommendedQty * p.costPrice
                )}</strong>
              </div>
              <button
                type="button"
                data-action="execute-restock"
                data-id="${safeId}"
                class="px-4 py-2 min-h-[40px] bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-bold rounded-xl transition shrink-0 whitespace-nowrap cursor-pointer"
              >
                + Tambah Stok
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

export function updateRestockSubtotal(productId) {
  const qtyInput = document.getElementById(`restock-qty-${productId}`);
  const priceInput = document.getElementById(`restock-price-${productId}`);
  const subtotalEl = document.getElementById(`restock-subtotal-${productId}`);
  if (!subtotalEl) return;

  const qty = Math.max(0, parseInt(qtyInput instanceof HTMLInputElement ? qtyInput.value : '0', 10) || 0);
  const unitPrice = Math.max(0, Number(priceInput instanceof HTMLInputElement ? priceInput.value : '0') || 0);
  subtotalEl.textContent = formatRupiah(qty * unitPrice);
}

export function executeRestock(ctx, productId) {
  const { appState, recordDailyTransaction, awardXP, unlockBadge, persistAndRefresh } = ctx;
  const prod = appState.products.find((p) => p.id === productId);
  const qtyInput = document.getElementById(`restock-qty-${productId}`);
  const priceInput = document.getElementById(`restock-price-${productId}`);
  const qty = parseInt(qtyInput instanceof HTMLInputElement ? qtyInput.value : '0', 10);
  const unitPriceRaw = priceInput instanceof HTMLInputElement ? Number(priceInput.value) : prod?.costPrice;
  const unitPrice = Number.isFinite(unitPriceRaw) && unitPriceRaw >= 0 ? unitPriceRaw : prod?.costPrice || 0;

  if (!prod || isNaN(qty) || qty <= 0) {
    showToast('Masukkan jumlah stok masuk yang valid.', 'error');
    return;
  }

  const totalCost = qty * unitPrice;
  const wasLowStock = prod.stock <= getMinStockThreshold(prod);
  prod.stock += qty;

  recordDailyTransaction({
    type: 'RESTOCK',
    summary: `Tambah stok +${qty} ${prod.name} @ ${formatRupiah(unitPrice)} (Grosir/Sales)`,
    amount: totalCost,
    profit: 0,
    discountPercent: 0,
    productId: prod.id,
    productName: prod.name,
    qty,
    unitPrice
  });

  persistAndRefresh();
  showToast(`Berhasil menambah +${qty} stok ${prod.name} (${formatRupiah(totalCost)}).`, 'success');

  if (wasLowStock) {
    awardXP(25, 'Menambah stok tepat waktu saat stok menipis');
    unlockBadge('stock_master');
  }
}
