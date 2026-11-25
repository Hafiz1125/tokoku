import { fetchBuyerOrders, fetchShopCatalog, submitBuyerCheckout } from '../auth.js';
import { getCategoryFallbackImage } from '../constants.js';
import { renderIcon } from '../icons.js';
import { closeModal, openModal, showToast } from '../ui.js';
import { escapeHTML, formatRupiah } from '../utils.js';

const PAYMENT_METHODS = [
  { id: 'Tunai', label: 'Tunai (COD / Di Kasir)', desc: 'Bayar langsung di toko saat ambil barang' },
  { id: 'QRIS', label: 'QRIS', desc: 'Pembayaran instan via kode QR' },
  { id: 'Transfer Bank', label: 'Transfer Bank', desc: 'Transfer ke rekening toko' }
];

let buyerState = {
  user: null,
  store: null,
  products: [],
  orders: [],
  cart: {},
  paymentMethod: 'Tunai',
  isSubmitting: false
};

export function resetBuyerState() {
  buyerState = {
    user: null,
    store: null,
    products: [],
    orders: [],
    cart: {},
    paymentMethod: 'Tunai',
    isSubmitting: false
  };
}

export function setBuyerSessionData({ user, shopData, orders }) {
  buyerState.user = user || null;
  buyerState.store = shopData?.store || null;
  buyerState.products = Array.isArray(shopData?.products) ? shopData.products : [];
  buyerState.orders = Array.isArray(orders) ? orders : [];
  buyerState.cart = {};
  buyerState.paymentMethod = 'Tunai';
  buyerState.isSubmitting = false;
  renderBuyerView();
}

function renderBuyerHeader() {
  const storeNameEl = document.getElementById('buyer-store-name');
  const storeStatusEl = document.getElementById('buyer-store-status');
  const userNameEl = document.getElementById('buyer-user-name');
  const closedBanner = document.getElementById('buyer-closed-banner');

  const store = buyerState.store;
  const user = buyerState.user;

  if (storeNameEl) {
    storeNameEl.textContent = store ? store.storeName : user?.storeName || 'Toko Belum Tersedia';
  }
  if (userNameEl) {
    userNameEl.textContent = user ? `${user.ownerName} (@${user.username})` : 'Pembeli';
  }
  if (storeStatusEl) {
    if (!store) {
      storeStatusEl.textContent = 'Toko Tidak Tersedia';
      storeStatusEl.className = 'text-xs font-semibold text-rose-700';
    } else if (store.isOpen) {
      storeStatusEl.textContent = `Toko Buka · Hari #${store.dayNumber}`;
      storeStatusEl.className = 'text-xs font-semibold text-emerald-700';
    } else {
      storeStatusEl.textContent = `Toko Tutup · Hari #${store.dayNumber}`;
      storeStatusEl.className = 'text-xs font-semibold text-rose-700';
    }
  }
  if (closedBanner) {
    closedBanner.classList.toggle('hidden', Boolean(store && store.isOpen));
  }
}

function renderBuyerProducts() {
  const grid = document.getElementById('buyer-products-grid');
  if (!grid) return;

  if (!buyerState.store) {
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
        <p class="text-sm font-bold text-slate-900">Belum ada toko yang terhubung.</p>
        <p class="text-xs text-slate-500">Hubungi pengelola toko untuk memastikan toko sudah aktif.</p>
      </div>
    `;
    return;
  }

  const searchInput = document.getElementById('buyer-search-input');
  const categorySelect = document.getElementById('buyer-category-select');
  const query = (searchInput instanceof HTMLInputElement ? searchInput.value : '').toLowerCase().trim();
  const category = categorySelect instanceof HTMLSelectElement ? categorySelect.value : 'ALL';

  const filtered = buyerState.products.filter((p) => {
    const matchName = p.name.toLowerCase().includes(query);
    const matchCat = category === 'ALL' || p.category === category;
    return matchName && matchCat;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-2xl border border-slate-200 py-10 px-6 text-center space-y-3">
        <p class="text-sm font-medium text-slate-600">Tidak ada barang yang cocok dengan pencarian Anda.</p>
        <button
          type="button"
          data-buyer-action="reset-filter"
          class="px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 transition cursor-pointer"
        >
          Tampilkan Semua Barang
        </button>
      </div>
    `;
    return;
  }

  const isStoreOpen = Boolean(buyerState.store.isOpen);

  grid.innerHTML = filtered
    .map((p) => {
      const inCartQty = buyerState.cart[p.id] || 0;
      const remaining = Math.max(0, p.stock - inCartQty);
      const canAdd = isStoreOpen && remaining > 0;
      const fallbackImg = getCategoryFallbackImage(p.category);
      const imgSrc = p.imageUrl || fallbackImg;

      let buttonLabel = '+ Keranjang';
      if (!isStoreOpen) buttonLabel = 'Toko Tutup';
      else if (p.stock <= 0) buttonLabel = 'Stok Habis';
      else if (remaining <= 0) buttonLabel = 'Maks. di Keranjang';

      return `
        <article class="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col justify-between hover:border-teal-400 transition">
          <div>
            <div class="h-36 bg-slate-100 overflow-hidden border-b border-slate-200">
              <img
                src="${escapeHTML(imgSrc)}"
                alt="${escapeHTML(p.name)}"
                referrerpolicy="no-referrer"
                data-fallback="${escapeHTML(fallbackImg)}"
                class="buyer-product-img w-full h-full object-cover"
              />
            </div>

            <div class="p-4 space-y-2">
              <div class="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>${escapeHTML(p.category)}</span>
                <span class="font-mono tabular-nums ${p.stock > 0 ? 'text-slate-600' : 'text-rose-700 font-semibold'}">
                  Stok: ${p.stock}
                </span>
              </div>
              <h4 class="font-bold text-slate-900 text-sm sm:text-base line-clamp-2" title="${escapeHTML(p.name)}">
                ${escapeHTML(p.name)}
              </h4>
              <div class="pt-1 flex items-baseline justify-between gap-2">
                <strong class="font-mono tabular-nums text-teal-700 font-extrabold text-base">
                  ${formatRupiah(p.sellPrice)}
                </strong>
                ${
                  inCartQty > 0
                    ? `<span class="text-xs font-mono tabular-nums font-bold text-emerald-700">${inCartQty} di keranjang</span>`
                    : ''
                }
              </div>
            </div>
          </div>

          <div class="px-4 py-3 bg-slate-50 border-t border-slate-200">
            <button
              type="button"
              data-buyer-action="add-to-cart"
              data-id="${escapeHTML(p.id)}"
              ${canAdd ? '' : 'disabled'}
              class="w-full min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition ${
                canAdd
                  ? 'bg-teal-700 hover:bg-teal-800 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }"
            >
              ${renderIcon('shopping-cart', 'w-3.5 h-3.5')}
              <span>${escapeHTML(buttonLabel)}</span>
            </button>
          </div>
        </article>
      `;
    })
    .join('');

  grid.querySelectorAll('.buyer-product-img').forEach((imgEl) => {
    imgEl.addEventListener('error', () => {
      const fb = imgEl.getAttribute('data-fallback');
      if (fb && imgEl.getAttribute('src') !== fb) {
        imgEl.setAttribute('src', fb);
      }
    });
  });
}

function renderBuyerCart() {
  const cartContainer = document.getElementById('buyer-cart-items');
  const totalEl = document.getElementById('buyer-cart-total');
  const itemCountEl = document.getElementById('buyer-cart-count');
  const checkoutBtn = document.getElementById('buyer-checkout-btn');
  const paymentSelect = document.getElementById('buyer-payment-method');

  if (!cartContainer) return;

  if (paymentSelect instanceof HTMLSelectElement) {
    paymentSelect.value = buyerState.paymentMethod;
  }

  const entries = Object.entries(buyerState.cart).filter(([, qty]) => qty > 0);
  let totalAmount = 0;
  let totalUnits = 0;

  if (entries.length === 0) {
    cartContainer.innerHTML =
      '<p class="text-sm text-slate-500 text-center py-6">Keranjang masih kosong. Pilih barang di samping.</p>';
  } else {
    cartContainer.innerHTML = entries
      .map(([productId, qty]) => {
        const product = buyerState.products.find((p) => p.id === productId);
        if (!product) return '';
        const subtotal = product.sellPrice * qty;
        totalAmount += subtotal;
        totalUnits += qty;

        return `
          <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <div class="min-w-0 flex-1">
              <div class="text-xs font-bold text-slate-900 truncate">${escapeHTML(product.name)}</div>
              <div class="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                ${formatRupiah(product.sellPrice)} &times; ${qty} =
                <strong class="text-slate-900">${formatRupiah(subtotal)}</strong>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button
                type="button"
                data-buyer-action="cart-dec"
                data-id="${escapeHTML(product.id)}"
                aria-label="Kurangi ${escapeHTML(product.name)}"
                class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-100 cursor-pointer"
              >-</button>
              <span class="w-6 text-center text-xs font-mono tabular-nums font-bold">${qty}</span>
              <button
                type="button"
                data-buyer-action="cart-inc"
                data-id="${escapeHTML(product.id)}"
                aria-label="Tambah ${escapeHTML(product.name)}"
                class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-100 cursor-pointer"
              >+</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  if (totalEl) totalEl.textContent = formatRupiah(totalAmount);
  if (itemCountEl) itemCountEl.textContent = `${totalUnits} Barang`;

  if (checkoutBtn instanceof HTMLButtonElement) {
    const canCheckout =
      Boolean(buyerState.store?.isOpen) && entries.length > 0 && !buyerState.isSubmitting;
    checkoutBtn.disabled = !canCheckout;
    checkoutBtn.textContent = buyerState.isSubmitting
      ? 'Memproses Pembayaran...'
      : `Bayar Sekarang · ${formatRupiah(totalAmount)}`;
  }
}

function renderBuyerOrders() {
  const listEl = document.getElementById('buyer-orders-list');
  const countEl = document.getElementById('buyer-orders-count');
  if (!listEl) return;

  const orders = buyerState.orders || [];
  if (countEl) {
    countEl.textContent = `${orders.length} Pesanan`;
  }

  if (orders.length === 0) {
    listEl.innerHTML = `
      <p class="text-sm text-slate-500 text-center py-6">
        Belum ada riwayat belanja. Tambahkan barang ke keranjang lalu lakukan checkout pembayaran.
      </p>
    `;
    return;
  }

  listEl.innerHTML = orders
    .map((order) => {
      const itemsText = (order.items || [])
        .map((item) => `${escapeHTML(item.name)} &times;${item.qty}`)
        .join(', ');
      return `
        <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="font-mono font-bold text-slate-900">${escapeHTML(order.id)}</span>
              <span class="text-slate-400">&middot;</span>
              <span class="text-slate-500">${escapeHTML(order.date)} ${escapeHTML(order.time)}</span>
              <span class="text-slate-400">&middot;</span>
              <span class="font-semibold text-teal-700">${escapeHTML(order.paymentMethod)}</span>
            </div>
            <p class="text-xs sm:text-sm text-slate-700">${itemsText}</p>
          </div>
          <div class="text-left sm:text-right shrink-0">
            <div class="font-mono tabular-nums font-extrabold text-sm text-slate-900">
              ${formatRupiah(order.totalAmount)}
            </div>
            <div class="text-[11px] font-semibold text-emerald-700">${escapeHTML(order.status || 'Lunas')}</div>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderBuyerView() {
  renderBuyerHeader();
  renderBuyerProducts();
  renderBuyerCart();
  renderBuyerOrders();
}

function addItemToBuyerCart(productId) {
  if (!buyerState.store?.isOpen) {
    showToast('Toko sedang tutup. Pembelian belum dapat dilakukan.', 'error');
    return;
  }
  const product = buyerState.products.find((p) => p.id === productId);
  if (!product) return;

  const currentQty = buyerState.cart[productId] || 0;
  if (currentQty >= product.stock) {
    showToast(`Stok ${product.name} hanya tersisa ${product.stock} unit.`, 'error');
    return;
  }

  buyerState.cart[productId] = currentQty + 1;
  renderBuyerProducts();
  renderBuyerCart();
}

function updateBuyerCartQty(productId, delta) {
  const product = buyerState.products.find((p) => p.id === productId);
  const currentQty = buyerState.cart[productId] || 0;
  const nextQty = currentQty + delta;

  if (nextQty <= 0) {
    delete buyerState.cart[productId];
  } else if (product && nextQty > product.stock) {
    showToast(`Stok ${product.name} hanya tersisa ${product.stock} unit.`, 'error');
    return;
  } else {
    buyerState.cart[productId] = nextQty;
  }

  renderBuyerProducts();
  renderBuyerCart();
}

function clearBuyerCart() {
  if (Object.keys(buyerState.cart).length === 0) return;
  buyerState.cart = {};
  renderBuyerProducts();
  renderBuyerCart();
  showToast('Keranjang belanja dikosongkan.', 'info');
}

function openReceiptModal(order) {
  const rowsHTML = (order.items || [])
    .map(
      (item) => `
        <div class="flex justify-between gap-3 text-xs py-1">
          <span class="text-slate-700">${escapeHTML(item.name)} &times; ${item.qty}</span>
          <span class="font-mono tabular-nums font-semibold text-slate-900">${formatRupiah(item.subtotal)}</span>
        </div>
      `
    )
    .join('');

  openModal({
    title: 'Pembayaran Berhasil',
    bodyHTML: `
      <div class="space-y-3">
        <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
          Pesanan Anda pada <strong>${escapeHTML(order.storeName)}</strong> telah dicatat dengan status <strong>${escapeHTML(order.status)}</strong>.
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
          <div class="flex justify-between text-xs text-slate-500">
            <span>Nomor Pesanan</span>
            <span class="font-mono font-bold text-slate-900">${escapeHTML(order.id)}</span>
          </div>
          <div class="flex justify-between text-xs text-slate-500">
            <span>Metode Pembayaran</span>
            <span class="font-semibold text-teal-700">${escapeHTML(order.paymentMethod)}</span>
          </div>
          <div class="border-t border-slate-200 pt-2 divide-y divide-slate-100">
            ${rowsHTML}
          </div>
          <div class="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-900">
            <span>Total Dibayar</span>
            <span class="font-mono tabular-nums text-teal-700">${formatRupiah(order.totalAmount)}</span>
          </div>
        </div>
      </div>
    `,
    footerHTML: `
      <button type="button" id="close-receipt-modal-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer">
        Tutup Struk
      </button>
    `,
    onMount: () => {
      document.getElementById('close-receipt-modal-btn')?.addEventListener('click', closeModal);
    }
  });
}

async function handleBuyerCheckout() {
  const entries = Object.entries(buyerState.cart).filter(([, qty]) => qty > 0);
  if (entries.length === 0) {
    showToast('Tambahkan minimal 1 barang ke keranjang terlebih dahulu.', 'error');
    return;
  }
  if (!buyerState.store?.isOpen) {
    showToast('Toko sedang tutup. Checkout belum dapat diproses.', 'error');
    return;
  }

  const items = entries.map(([productId, qty]) => ({ productId, qty }));
  buyerState.isSubmitting = true;
  renderBuyerCart();

  try {
    const result = await submitBuyerCheckout({
      items,
      paymentMethod: buyerState.paymentMethod
    });

    buyerState.store = result.store || buyerState.store;
    buyerState.products = Array.isArray(result.products) ? result.products : buyerState.products;
    buyerState.orders = Array.isArray(result.orders) ? result.orders : buyerState.orders;
    buyerState.cart = {};
    buyerState.isSubmitting = false;

    renderBuyerView();
    showToast(`Pembayaran ${formatRupiah(result.order.totalAmount)} berhasil!`, 'success');
    openReceiptModal(result.order);
  } catch (err) {
    buyerState.isSubmitting = false;
    renderBuyerCart();
    showToast(err instanceof Error ? err.message : 'Checkout gagal diproses.', 'error');
  }
}

async function refreshBuyerCatalog() {
  try {
    const [catalog, ordersRes] = await Promise.all([fetchShopCatalog(), fetchBuyerOrders()]);
    buyerState.store = catalog.store;
    buyerState.products = Array.isArray(catalog.products) ? catalog.products : [];
    buyerState.orders = Array.isArray(ordersRes.orders) ? ordersRes.orders : buyerState.orders;

    // Pastikan qty di keranjang tidak melebihi stok terbaru
    Object.keys(buyerState.cart).forEach((pid) => {
      const prod = buyerState.products.find((p) => p.id === pid);
      if (!prod || prod.stock <= 0) {
        delete buyerState.cart[pid];
      } else if (buyerState.cart[pid] > prod.stock) {
        buyerState.cart[pid] = prod.stock;
      }
    });

    renderBuyerView();
    showToast('Katalog toko berhasil diperbarui.', 'info');
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Gagal memuat katalog toko.', 'error');
  }
}

export function wireBuyerListeners({ onLogout }) {
  const brandIcon = document.getElementById('buyer-brand-icon');
  if (brandIcon) brandIcon.innerHTML = renderIcon('store', 'w-5 h-5');

  const paymentSelect = document.getElementById('buyer-payment-method');
  if (paymentSelect instanceof HTMLSelectElement) {
    paymentSelect.innerHTML = PAYMENT_METHODS.map(
      (m) => `<option value="${escapeHTML(m.id)}">${escapeHTML(m.label)}</option>`
    ).join('');
    paymentSelect.addEventListener('change', () => {
      buyerState.paymentMethod = paymentSelect.value;
    });
  }

  document.getElementById('buyer-search-input')?.addEventListener('input', renderBuyerProducts);
  document.getElementById('buyer-category-select')?.addEventListener('change', renderBuyerProducts);
  document.getElementById('buyer-clear-cart-btn')?.addEventListener('click', clearBuyerCart);
  document.getElementById('buyer-checkout-btn')?.addEventListener('click', handleBuyerCheckout);
  document.getElementById('buyer-refresh-btn')?.addEventListener('click', refreshBuyerCatalog);
  document.getElementById('buyer-logout-btn')?.addEventListener('click', onLogout);

  document.getElementById('buyer-products-grid')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-buyer-action]') : null;
    if (!target) return;
    const action = target.getAttribute('data-buyer-action');
    if (action === 'add-to-cart') {
      const id = target.getAttribute('data-id');
      if (id) addItemToBuyerCart(id);
    } else if (action === 'reset-filter') {
      const searchEl = document.getElementById('buyer-search-input');
      const catEl = document.getElementById('buyer-category-select');
      if (searchEl instanceof HTMLInputElement) searchEl.value = '';
      if (catEl instanceof HTMLSelectElement) catEl.value = 'ALL';
      renderBuyerProducts();
    }
  });

  document.getElementById('buyer-cart-items')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-buyer-action]') : null;
    if (!target) return;
    const action = target.getAttribute('data-buyer-action');
    const id = target.getAttribute('data-id');
    if (!id) return;
    if (action === 'cart-dec') updateBuyerCartQty(id, -1);
    if (action === 'cart-inc') updateBuyerCartQty(id, 1);
  });
}
