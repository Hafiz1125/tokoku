import { getCategoryFallbackImage } from '../constants.js';
import { showToast } from '../ui.js';
import { escapeHTML, formatRupiah } from '../utils.js';

export function renderPOSProducts(ctx) {
  const { appState } = ctx;
  const grid = document.getElementById('pos-products-grid');
  const shiftHint = document.getElementById('pos-shift-hint');
  if (shiftHint) {
    shiftHint.textContent = appState.dailySession.isOpen
      ? `Sesi Hari #${appState.dailySession.dayNumber} Aktif`
      : 'Toko Sedang Tutup';
    shiftHint.className = appState.dailySession.isOpen
      ? 'text-xs font-semibold text-emerald-700'
      : 'text-xs font-semibold text-rose-700';
  }
  if (!grid) return;

  if (appState.products.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-2xl border border-slate-200 py-10 px-6 text-center text-sm text-slate-600">
        Belum ada produk tersedia untuk dijual. Tambahkan produk di tab Produk &amp; Margin.
      </div>
    `;
    return;
  }

  grid.innerHTML = appState.products
    .map((p) => {
      const outOfStock = p.stock <= 0;
      const fallbackImg = getCategoryFallbackImage(p.category);
      const imgSrc = p.imageUrl || fallbackImg;
      return `
        <div class="bg-white p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <img
              src="${escapeHTML(imgSrc)}"
              alt="${escapeHTML(p.name)}"
              referrerpolicy="no-referrer"
              data-fallback="${escapeHTML(fallbackImg)}"
              class="pos-item-img w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0 bg-slate-50"
            />
            <div class="min-w-0">
              <div class="font-bold text-slate-900 text-sm truncate">${escapeHTML(p.name)}</div>
              <div class="text-xs font-mono tabular-nums text-teal-700 font-extrabold mt-0.5">
                ${formatRupiah(p.sellPrice)}
              </div>
              <div class="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                Sisa stok: ${p.stock} unit
              </div>
            </div>
          </div>
          <button
            type="button"
            data-action="add-to-cart"
            data-id="${escapeHTML(p.id)}"
            ${outOfStock ? 'disabled' : ''}
            class="px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold transition shrink-0 whitespace-nowrap ${
              outOfStock
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-teal-50 text-teal-800 hover:bg-teal-700 hover:text-white border border-teal-200 cursor-pointer'
            }"
          >
            ${outOfStock ? 'Habis' : '+ Keranjang'}
          </button>
        </div>
      `;
    })
    .join('');

  grid.querySelectorAll('.pos-item-img').forEach((img) => {
    img.addEventListener('error', () => {
      const fb = img.getAttribute('data-fallback');
      if (fb && img.getAttribute('src') !== fb) {
        img.setAttribute('src', fb);
      }
    });
  });
}

export function addToCart(ctx, productId) {
  const { appState, posCart } = ctx;
  const prod = appState.products.find((p) => p.id === productId);
  if (!prod || prod.stock <= 0) return;

  const currentQty = posCart[productId] || 0;
  if (currentQty >= prod.stock) {
    showToast(`Stok ${prod.name} hanya tersisa ${prod.stock} unit.`, 'error');
    return;
  }

  posCart[productId] = currentQty + 1;
  renderCart(ctx);
}

export function updateCartQty(ctx, productId, delta) {
  const { appState, posCart } = ctx;
  const prod = appState.products.find((p) => p.id === productId);
  if (!prod) return;

  const nextQty = (posCart[productId] || 0) + delta;
  if (nextQty <= 0) {
    delete posCart[productId];
  } else if (nextQty > prod.stock) {
    showToast(`Maksimal stok tersedia: ${prod.stock} unit.`, 'error');
    return;
  } else {
    posCart[productId] = nextQty;
  }
  renderCart(ctx);
}

export function clearCart(ctx) {
  const { posCart } = ctx;
  Object.keys(posCart).forEach((k) => delete posCart[k]);
  const discountInput = document.getElementById('pos-discount-input');
  if (discountInput instanceof HTMLInputElement) discountInput.value = '0';
  renderCart(ctx);
}

export function renderCart(ctx) {
  const { appState, posCart } = ctx;
  const container = document.getElementById('pos-cart-items');
  const discountInput = document.getElementById('pos-discount-input');
  const discountLabel = document.getElementById('pos-discount-label');
  const subtotalEl = document.getElementById('pos-subtotal');
  const discountAmtEl = document.getElementById('pos-discount-amount');
  const totalEl = document.getElementById('pos-total');
  const profitEl = document.getElementById('pos-profit-estimate');
  const warningBox = document.getElementById('pos-margin-warning');

  if (!container) return;

  const discountPercent = parseInt(discountInput instanceof HTMLInputElement ? discountInput.value : '0', 10) || 0;
  if (discountLabel) discountLabel.textContent = `${discountPercent}%`;

  const entries = Object.entries(posCart);
  if (entries.length === 0) {
    container.innerHTML = `<p class="text-sm text-slate-500 text-center py-6">Belum ada barang di keranjang</p>`;
    if (subtotalEl) subtotalEl.textContent = 'Rp 0';
    if (discountAmtEl) discountAmtEl.textContent = '- Rp 0';
    if (totalEl) totalEl.textContent = 'Rp 0';
    if (profitEl) {
      profitEl.textContent = 'Rp 0';
      profitEl.className = 'font-mono tabular-nums text-emerald-700';
    }
    warningBox?.classList.add('hidden');
    return;
  }

  let subtotal = 0;
  let totalCost = 0;

  container.innerHTML = entries
    .map(([id, qty]) => {
      const prod = appState.products.find((p) => p.id === id);
      if (!prod) return '';
      subtotal += prod.sellPrice * qty;
      totalCost += prod.costPrice * qty;
      const fallbackImg = getCategoryFallbackImage(prod.category);
      const imgSrc = prod.imageUrl || fallbackImg;

      return `
        <div class="flex items-center justify-between gap-2.5 text-sm bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <img
            src="${escapeHTML(imgSrc)}"
            alt="${escapeHTML(prod.name)}"
            referrerpolicy="no-referrer"
            data-fallback="${escapeHTML(fallbackImg)}"
            class="cart-item-img w-11 h-11 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
          />
          <div class="min-w-0 flex-1">
            <div class="font-semibold text-slate-900 truncate">${escapeHTML(prod.name)}</div>
            <div class="text-xs font-mono tabular-nums text-slate-500">${formatRupiah(prod.sellPrice)} &times; ${qty}</div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-action="cart-dec"
              data-id="${escapeHTML(id)}"
              aria-label="Kurangi ${escapeHTML(prod.name)}"
              class="w-8 h-8 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >-</button>
            <span class="w-6 text-center font-bold font-mono tabular-nums text-xs">${qty}</span>
            <button
              type="button"
              data-action="cart-inc"
              data-id="${escapeHTML(id)}"
              aria-label="Tambah ${escapeHTML(prod.name)}"
              class="w-8 h-8 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >+</button>
          </div>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('.cart-item-img').forEach((img) => {
    img.addEventListener('error', () => {
      const fb = img.getAttribute('data-fallback');
      if (fb && img.getAttribute('src') !== fb) {
        img.setAttribute('src', fb);
      }
    });
  });

  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  const finalTotal = subtotal - discountAmount;
  const netProfit = finalTotal - totalCost;

  if (subtotalEl) subtotalEl.textContent = formatRupiah(subtotal);
  if (discountAmtEl) discountAmtEl.textContent = `- ${formatRupiah(discountAmount)}`;
  if (totalEl) totalEl.textContent = formatRupiah(finalTotal);

  if (profitEl && warningBox) {
    if (netProfit < 0) {
      profitEl.textContent = `${formatRupiah(netProfit)} (RUGI)`;
      profitEl.className = 'font-mono tabular-nums text-rose-700 font-extrabold';
      warningBox.classList.remove('hidden');
      warningBox.innerHTML = `<strong>Peringatan Ilmiah:</strong> Diskon ${discountPercent}% membuat harga jual (${formatRupiah(
        finalTotal
      )}) lebih rendah daripada total modal HPP (${formatRupiah(totalCost)}).`;
    } else {
      profitEl.textContent = `+ ${formatRupiah(netProfit)}`;
      profitEl.className = 'font-mono tabular-nums text-emerald-700 font-bold';
      warningBox.classList.add('hidden');
    }
  }
}

export function checkoutCart(ctx) {
  const { appState, posCart, recordDailyTransaction, awardXP, persistAndRefresh, openShiftActionModal } = ctx;

  if (!appState.dailySession?.isOpen) {
    showToast('Toko sedang tutup. Silakan buka hari baru terlebih dahulu.', 'error');
    openShiftActionModal();
    return;
  }

  const entries = Object.entries(posCart);
  if (entries.length === 0) {
    showToast('Tambahkan barang ke keranjang terlebih dahulu.', 'error');
    return;
  }

  const discountInput = document.getElementById('pos-discount-input');
  const discountPercent = parseInt(discountInput instanceof HTMLInputElement ? discountInput.value : '0', 10) || 0;

  let subtotal = 0;
  let totalCost = 0;
  const itemDescriptions = [];

  for (const [id, qty] of entries) {
    const prod = appState.products.find((p) => p.id === id);
    if (!prod || prod.stock < qty) {
      showToast('Stok salah satu barang tidak mencukupi.', 'error');
      return;
    }
    subtotal += prod.sellPrice * qty;
    totalCost += prod.costPrice * qty;
    itemDescriptions.push(`${qty}x ${prod.name}`);
  }

  const finalTotal = subtotal - Math.round(subtotal * (discountPercent / 100));
  const profit = finalTotal - totalCost;

  for (const [id, qty] of entries) {
    const prod = appState.products.find((p) => p.id === id);
    if (prod) prod.stock -= qty;
  }
  appState.storeProfile.cashBalance += finalTotal;

  recordDailyTransaction({
    type: 'SALE',
    summary: itemDescriptions.join(', '),
    amount: finalTotal,
    profit,
    discountPercent
  });

  Object.keys(posCart).forEach((k) => delete posCart[k]);
  if (discountInput instanceof HTMLInputElement) discountInput.value = '0';

  persistAndRefresh();

  if (profit >= 0) {
    showToast(`Transaksi berhasil! Omzet ${formatRupiah(finalTotal)} (Laba ${formatRupiah(profit)}).`, 'success');
    awardXP(15, 'Menyelesaikan transaksi penjualan sehat');
  } else {
    showToast(`Transaksi selesai dengan rugi ${formatRupiah(Math.abs(profit))}. Evaluasi diskon Anda!`, 'error');
  }
}
