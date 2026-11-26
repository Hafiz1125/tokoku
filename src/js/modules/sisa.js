import { renderIcon } from '../icons.js';
import { closeModal, openModal, showToast } from '../ui.js';
import { calculateROP, escapeHTML, formatRupiah } from '../utils.js';

export function renderSisaStock(ctx) {
  const { appState } = ctx;
  const tbody = document.getElementById('sisa-stock-table-body');
  if (!tbody) return;

  const searchEl = document.getElementById('stock-search-input');
  const statusEl = document.getElementById('stock-status-filter');
  const query = searchEl instanceof HTMLInputElement ? searchEl.value.trim().toLowerCase() : '';
  const statusFilter = statusEl instanceof HTMLSelectElement ? statusEl.value : 'ALL';

  const filtered = appState.products.filter((p) => {
    const rop = calculateROP(p);
    const needsRestock = p.stock <= rop;
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

  if (appState.products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-10 px-4 text-center text-sm text-slate-500">
          Belum ada produk di katalog untuk diaudit.
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
        const rop = calculateROP(p);

        let statusHTML = `<span class="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">${renderIcon(
          'check-circle',
          'w-3.5 h-3.5'
        )} Aman</span>`;

        if (p.stock === 0) {
          statusHTML = `<span class="inline-flex items-center gap-1 text-xs font-bold text-rose-700">${renderIcon(
            'alert-circle',
            'w-3.5 h-3.5'
          )} Habis (0)</span>`;
        } else if (p.stock <= rop) {
          statusHTML = `<span class="inline-flex items-center gap-1 text-xs font-bold text-amber-700">${renderIcon(
            'alert-triangle',
            'w-3.5 h-3.5'
          )} Menipis (&le; ROP)</span>`;
        }

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-3.5 px-4 font-semibold text-slate-900">${escapeHTML(p.name)}</td>
            <td class="py-3.5 px-4 text-center font-extrabold font-mono tabular-nums text-slate-900">${p.stock}</td>
            <td class="py-3.5 px-4 text-center font-mono tabular-nums text-slate-600">${rop}</td>
            <td class="py-3.5 px-4 text-center whitespace-nowrap">${statusHTML}</td>
            <td class="py-3.5 px-4 text-right font-semibold font-mono tabular-nums text-slate-800">${formatRupiah(
              assetVal
            )}</td>
            <td class="py-3.5 px-4 text-center">
              <button
                type="button"
                data-action="open-audit"
                data-id="${escapeHTML(p.id)}"
                class="px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold bg-slate-100 hover:bg-teal-700 hover:text-white text-slate-700 transition cursor-pointer whitespace-nowrap"
              >
                Audit Fisik
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }
}

export function openAuditStockModal(ctx, productId) {
  const { appState, recordDailyTransaction, awardXP, unlockBadge, persistAndRefresh } = ctx;
  const prod = appState.products.find((p) => p.id === productId);
  if (!prod) return;

  const bodyHTML = `
    <p>Produk: <strong>${escapeHTML(prod.name)}</strong></p>
    <p class="text-xs text-slate-600">
      Tercatat di sistem: <strong class="font-mono tabular-nums">${prod.stock} unit</strong>. Masukkan jumlah fisik nyata yang Anda hitung di rak/gudang:
    </p>
    <div class="pt-2">
      <label for="audit-physical-qty" class="block text-xs font-bold text-slate-700 mb-1">Jumlah Fisik Nyata (Unit)</label>
      <input
        type="number"
        id="audit-physical-qty"
        min="0"
        value="${prod.stock}"
        class="w-full px-3.5 py-2 min-h-[42px] border border-slate-300 rounded-xl text-sm font-bold font-mono tabular-nums focus:ring-2 focus:ring-teal-600 focus:outline-none"
      />
    </div>
  `;

  const footerHTML = `
    <button type="button" id="cancel-audit-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
      Batal
    </button>
    <button type="button" id="save-audit-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer">
      Simpan Hasil Audit
    </button>
  `;

  openModal({
    title: 'Audit Sisa Stock (Stock Opname)',
    bodyHTML,
    footerHTML,
    onMount: () => {
      document.getElementById('cancel-audit-btn')?.addEventListener('click', closeModal);
      document.getElementById('save-audit-btn')?.addEventListener('click', () => {
        const input = document.getElementById('audit-physical-qty');
        const physicalQty = Math.max(0, parseInt(input instanceof HTMLInputElement ? input.value : '0', 10) || 0);
        const diff = physicalQty - prod.stock;
        prod.stock = physicalQty;

        const diffText =
          diff === 0 ? 'sesuai (selisih 0)' : diff > 0 ? `lebih +${diff} unit` : `susut ${diff} unit`;

        if (diff !== 0) {
          recordDailyTransaction({
            type: 'AUDIT',
            summary: `Stock Opname ${prod.name}: ${diffText}`,
            amount: 0,
            profit: 0,
            discountPercent: 0
          });
        }

        closeModal();
        persistAndRefresh();
        showToast(`Audit ${prod.name} selesai (${diffText}).`, 'success');
        awardXP(20, 'Melakukan audit fisik sisa stok (Stock Opname)');
        unlockBadge('diligent_auditor');
      });
    }
  });
}
