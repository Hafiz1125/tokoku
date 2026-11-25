import { renderIcon } from '../icons.js';
import { showToast } from '../ui.js';
import { calculateROP, escapeHTML, formatRupiah } from '../utils.js';

export function renderStockCards(ctx) {
  const { appState } = ctx;
  const grid = document.getElementById('stock-cards-grid');
  if (!grid) return;

  if (appState.products.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-2xl border border-slate-200 py-12 px-6 text-center">
        <p class="text-sm text-slate-600">Belum ada produk di katalog. Tambahkan produk di menu Produk &amp; Margin untuk mengelola stok.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = appState.products
    .map((p) => {
      const rop = calculateROP(p);
      const needsRestock = p.stock <= rop;
      const recommendedQty = Math.max(10, rop * 2 - p.stock);

      return `
        <article class="bg-white rounded-2xl border ${
          needsRestock ? 'border-amber-400' : 'border-slate-200'
        } p-5 flex flex-col justify-between gap-4">
          <div>
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <span class="text-xs font-medium text-slate-500">${escapeHTML(p.category)}</span>
                <h4 class="font-bold text-slate-900 text-base truncate">${escapeHTML(p.name)}</h4>
              </div>
              ${
                needsRestock
                  ? `<span class="inline-flex items-center gap-1 text-xs font-bold text-amber-800 shrink-0">${renderIcon(
                      'alert-triangle',
                      'w-3.5 h-3.5 text-amber-600'
                    )} Perlu Restock</span>`
                  : `<span class="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 shrink-0">${renderIcon(
                      'check-circle',
                      'w-3.5 h-3.5 text-emerald-600'
                    )} Stok Aman</span>`
              }
            </div>

            <div class="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 text-slate-600">
              <div class="flex justify-between">
                <span>Stok Saat Ini</span>
                <strong class="font-mono tabular-nums text-slate-900">${p.stock} unit</strong>
              </div>
              <div class="flex justify-between">
                <span>Titik Pesan Ulang (ROP)</span>
                <strong class="font-mono tabular-nums text-teal-700">${rop} unit</strong>
              </div>
              <div class="flex justify-between">
                <span>Harga Beli (HPP) / unit</span>
                <strong class="font-mono tabular-nums text-slate-800">${formatRupiah(p.costPrice)}</strong>
              </div>
              <div class="text-[11px] text-slate-500 pt-1.5 border-t border-slate-200 font-mono tabular-nums">
                ROP = (${p.dailySalesAvg}/hari &times; ${p.leadTimeDays} hari) + ${p.safetyStock} safety
              </div>
            </div>
          </div>

          <div class="flex items-end gap-2 pt-2 border-t border-slate-200">
            <div class="flex-1 min-w-0">
              <label for="restock-qty-${escapeHTML(p.id)}" class="block text-[11px] font-semibold text-slate-600 mb-1">
                Jumlah Masuk (Saran: +${recommendedQty})
              </label>
              <input
                type="number"
                id="restock-qty-${escapeHTML(p.id)}"
                min="1"
                value="${recommendedQty}"
                class="w-full px-3 py-2 min-h-[42px] border border-slate-300 rounded-xl text-sm font-semibold font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <button
              type="button"
              data-action="execute-restock"
              data-id="${escapeHTML(p.id)}"
              class="px-4 py-2 min-h-[42px] bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold rounded-xl transition shrink-0 whitespace-nowrap cursor-pointer"
            >
              + Beli Stok
            </button>
          </div>
        </article>
      `;
    })
    .join('');
}

export function executeRestock(ctx, productId) {
  const { appState, recordDailyTransaction, awardXP, unlockBadge, persistAndRefresh } = ctx;
  const prod = appState.products.find((p) => p.id === productId);
  const qtyInput = document.getElementById(`restock-qty-${productId}`);
  const qty = parseInt(qtyInput instanceof HTMLInputElement ? qtyInput.value : '0', 10);

  if (!prod || isNaN(qty) || qty <= 0) {
    showToast('Masukkan jumlah stok masuk yang valid.', 'error');
    return;
  }

  const totalCost = qty * prod.costPrice;
  if (appState.storeProfile.cashBalance < totalCost) {
    showToast(`Kas toko tidak mencukupi! Butuh ${formatRupiah(totalCost)}.`, 'error');
    return;
  }

  const wasBelowROP = prod.stock <= calculateROP(prod);
  appState.storeProfile.cashBalance -= totalCost;
  prod.stock += qty;

  recordDailyTransaction({
    type: 'RESTOCK',
    summary: `Restock +${qty} ${prod.name}`,
    amount: totalCost,
    profit: 0,
    discountPercent: 0
  });

  persistAndRefresh();
  showToast(`Berhasil restock +${qty} ${prod.name} (${formatRupiah(totalCost)}).`, 'success');

  if (wasBelowROP) {
    awardXP(25, 'Restock tepat waktu saat menyentuh titik ROP');
    unlockBadge('stock_master');
  }
}
