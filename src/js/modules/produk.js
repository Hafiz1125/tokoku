import { PRODUCT_CATEGORIES, PRODUCT_IMAGE_PRESETS, getCategoryFallbackImage } from '../constants.js';
import { renderIcon } from '../icons.js';
import { closeModal, openModal, showToast } from '../ui.js';
import { calculateMargin, compressImageFile, escapeHTML, formatRupiah } from '../utils.js';

export function renderProductsGrid(ctx) {
  const { appState } = ctx;
  const grid = document.getElementById('products-cards-grid');
  if (!grid) return;

  const searchInput = document.getElementById('search-product-input');
  const categorySelect = document.getElementById('filter-category-select');
  const query = (searchInput instanceof HTMLInputElement ? searchInput.value : '').toLowerCase().trim();
  const category = categorySelect instanceof HTMLSelectElement ? categorySelect.value : 'ALL';

  const filtered = appState.products.filter((p) => {
    const matchName = p.name.toLowerCase().includes(query);
    const matchCat = category === 'ALL' || p.category === category;
    return matchName && matchCat;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-2xl border border-slate-200 py-12 px-6 text-center space-y-3">
        <p class="text-sm font-medium text-slate-600">Tidak ada produk yang cocok dengan filter atau pencarian Anda.</p>
        <button type="button" data-action="reset-product-filter" class="px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 transition cursor-pointer">
          Tampilkan Semua Produk
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .map((p) => {
      const margin = calculateMargin(p.costPrice, p.sellPrice);
      const profitUnit = p.sellPrice - p.costPrice;
      const fallbackImg = getCategoryFallbackImage(p.category);
      const imgSrc = p.imageUrl || fallbackImg;

      let marginTextClass = 'text-emerald-700';
      let marginStatusLabel = 'Sehat';
      if (margin < 10 && margin > 0) {
        marginTextClass = 'text-amber-700';
        marginStatusLabel = 'Tipis';
      } else if (margin <= 0) {
        marginTextClass = 'text-rose-700';
        marginStatusLabel = 'Rugi';
      }

      return `
        <article class="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col justify-between hover:border-teal-400 transition">
          <div>
            <div class="h-40 bg-slate-100 overflow-hidden border-b border-slate-200">
              <img
                src="${escapeHTML(imgSrc)}"
                alt="${escapeHTML(p.name)}"
                referrerpolicy="no-referrer"
                data-fallback="${escapeHTML(fallbackImg)}"
                class="product-card-img w-full h-full object-cover"
              />
            </div>

            <div class="p-4 space-y-3">
              <div>
                <div class="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>${escapeHTML(p.category)}</span>
                  <span class="font-mono tabular-nums font-bold ${marginTextClass}">
                    Margin ${margin.toFixed(1)}% &middot; ${marginStatusLabel}
                  </span>
                </div>
                <h4 class="font-bold text-slate-900 text-base mt-1 truncate" title="${escapeHTML(p.name)}">
                  ${escapeHTML(p.name)}
                </h4>
              </div>

              <div class="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <span class="text-slate-500 block">HPP (Modal)</span>
                  <strong class="font-mono tabular-nums text-slate-800 font-semibold">${formatRupiah(p.costPrice)}</strong>
                </div>
                <div class="text-right">
                  <span class="text-slate-500 block">Harga Jual</span>
                  <strong class="font-mono tabular-nums text-teal-700 font-extrabold text-sm">${formatRupiah(p.sellPrice)}</strong>
                </div>
              </div>

              <div class="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span>
                  Laba/unit:
                  <strong class="font-mono tabular-nums ${profitUnit >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
                    ${formatRupiah(profitUnit)}
                  </strong>
                </span>
                <span>
                  Stok: <strong class="font-mono tabular-nums text-slate-900">${p.stock} unit</strong>
                </span>
              </div>
            </div>
          </div>

          <div class="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              data-action="edit-product"
              data-id="${escapeHTML(p.id)}"
              class="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:border-teal-600 hover:text-teal-700 transition cursor-pointer"
            >
              ${renderIcon('edit-3', 'w-3.5 h-3.5')}
              <span>Edit Produk</span>
            </button>
            <button
              type="button"
              data-action="delete-product"
              data-id="${escapeHTML(p.id)}"
              aria-label="Hapus ${escapeHTML(p.name)}"
              class="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer"
            >
              ${renderIcon('trash-2', 'w-4 h-4')}
            </button>
          </div>
        </article>
      `;
    })
    .join('');

  grid.querySelectorAll('.product-card-img').forEach((img) => {
    img.addEventListener('error', () => {
      const fb = img.getAttribute('data-fallback');
      if (fb && img.getAttribute('src') !== fb) {
        img.setAttribute('src', fb);
      }
    });
  });
}

export function openProductFormModal(ctx, productId = null) {
  const { appState, awardXP, unlockBadge, persistAndRefresh } = ctx;
  const isEdit = Boolean(productId);
  const existing = isEdit ? appState.products.find((p) => p.id === productId) : null;
  const prod = existing || {
    name: '',
    category: 'Sembako',
    imageUrl: PRODUCT_IMAGE_PRESETS[0].url,
    costPrice: 10000,
    sellPrice: 12500,
    stock: 10,
    dailySalesAvg: 2,
    leadTimeDays: 2,
    safetyStock: 3
  };

  const initialImage = prod.imageUrl || getCategoryFallbackImage(prod.category);

  const bodyHTML = `
    <form id="product-form" class="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1">
      <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
        <div class="flex items-center gap-3">
          <img
            id="prod-image-preview"
            src="${escapeHTML(initialImage)}"
            alt="Pratinjau Produk"
            referrerpolicy="no-referrer"
            class="w-20 h-16 rounded-xl object-cover border border-slate-300 bg-white shrink-0"
          />
          <div class="flex-1 min-w-0">
            <span class="block text-xs font-bold text-slate-700 mb-1.5">Gambar Produk (Preset / Unggah / URL)</span>
            <div class="flex flex-wrap items-center gap-2">
              <label class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg bg-white border border-slate-300 hover:border-teal-600 text-xs font-semibold text-slate-700 transition">
                ${renderIcon('upload', 'w-3.5 h-3.5 text-teal-700')}
                <span>Unggah Foto</span>
                <input type="file" id="prod-image-file" accept="image/*" class="hidden" />
              </label>
              <span class="text-[11px] text-slate-500">atau pilih ikon preset</span>
            </div>
          </div>
        </div>

        <div id="prod-preset-buttons" class="flex flex-wrap gap-1.5">
          ${PRODUCT_IMAGE_PRESETS.map(
            (preset) => `
              <button
                type="button"
                data-preset-url="${escapeHTML(preset.url)}"
                class="preset-img-btn px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-slate-200 hover:border-teal-600 hover:bg-teal-50 text-slate-700 transition cursor-pointer"
              >
                ${escapeHTML(preset.label)}
              </button>
            `
          ).join('')}
        </div>

        <div>
          <label for="prod-image-url" class="sr-only">URL Gambar Produk</label>
          <input
            type="text"
            id="prod-image-url"
            value="${escapeHTML(initialImage)}"
            placeholder="Atau tempel URL gambar produk..."
            class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-teal-600 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label for="prod-name" class="block text-xs font-bold text-slate-700 mb-1">Nama Produk Kelontong</label>
        <input
          type="text"
          id="prod-name"
          value="${escapeHTML(prod.name)}"
          required
          placeholder="Contoh: Kopi Kapal Api 165g"
          class="w-full px-3.5 py-2 min-h-[42px] border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="prod-category" class="block text-xs font-bold text-slate-700 mb-1">Kategori</label>
          <select
            id="prod-category"
            class="w-full px-3.5 py-2 min-h-[42px] border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
          >
            ${PRODUCT_CATEGORIES.map(
              (c) => `<option value="${c}" ${prod.category === c ? 'selected' : ''}>${c}</option>`
            ).join('')}
          </select>
        </div>
        <div>
          <label for="prod-stock" class="block text-xs font-bold text-slate-700 mb-1">Stok Awal (Unit)</label>
          <input
            type="number"
            id="prod-stock"
            min="0"
            value="${prod.stock}"
            required
            class="w-full px-3.5 py-2 min-h-[42px] border border-slate-300 rounded-xl text-sm font-mono tabular-nums focus:ring-2 focus:ring-teal-600 focus:outline-none"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="prod-cost" class="block text-xs font-bold text-slate-700 mb-1">Harga Modal / HPP (Rp)</label>
          <input
            type="number"
            id="prod-cost"
            min="100"
            step="100"
            value="${prod.costPrice}"
            required
            class="w-full px-3.5 py-2 min-h-[42px] border border-slate-300 rounded-xl text-sm font-mono tabular-nums focus:ring-2 focus:ring-teal-600 focus:outline-none"
          />
        </div>
        <div>
          <label for="prod-sell" class="block text-xs font-bold text-slate-700 mb-1">Harga Jual (Rp)</label>
          <input
            type="number"
            id="prod-sell"
            min="100"
            step="100"
            value="${prod.sellPrice}"
            required
            class="w-full px-3.5 py-2 min-h-[42px] border border-slate-300 rounded-xl text-sm font-mono tabular-nums focus:ring-2 focus:ring-teal-600 focus:outline-none"
          />
        </div>
      </div>

      <div id="form-margin-preview" class="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 font-medium">
        Estimasi Margin Laba Kotor:
        <strong class="font-mono tabular-nums">${calculateMargin(prod.costPrice, prod.sellPrice).toFixed(1)}%</strong>
      </div>

      <div class="grid grid-cols-3 gap-2 pt-1">
        <div>
          <label for="prod-daily" class="block text-[11px] font-bold text-slate-600 mb-1">Laku/Hari</label>
          <input
            type="number"
            id="prod-daily"
            min="1"
            value="${prod.dailySalesAvg}"
            class="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono tabular-nums"
          />
        </div>
        <div>
          <label for="prod-lead" class="block text-[11px] font-bold text-slate-600 mb-1">Lead Time (Hari)</label>
          <input
            type="number"
            id="prod-lead"
            min="1"
            value="${prod.leadTimeDays}"
            class="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono tabular-nums"
          />
        </div>
        <div>
          <label for="prod-safety" class="block text-[11px] font-bold text-slate-600 mb-1">Safety Stock</label>
          <input
            type="number"
            id="prod-safety"
            min="0"
            value="${prod.safetyStock}"
            class="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono tabular-nums"
          />
        </div>
      </div>
    </form>
  `;

  const footerHTML = `
    <button type="button" id="cancel-prod-modal-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
      Batal
    </button>
    <button type="button" id="save-prod-modal-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer">
      Simpan Produk
    </button>
  `;

  openModal({
    title: isEdit ? 'Edit Data Produk' : 'Tambah Produk Kelontong Baru',
    bodyHTML,
    footerHTML,
    onMount: () => {
      const previewImg = document.getElementById('prod-image-preview');
      const urlInput = document.getElementById('prod-image-url');
      const fileInput = document.getElementById('prod-image-file');
      const costInput = document.getElementById('prod-cost');
      const sellInput = document.getElementById('prod-sell');
      const marginPreviewBox = document.getElementById('form-margin-preview');

      const updateMarginPreview = () => {
        if (!marginPreviewBox) return;
        const cost = Number(costInput instanceof HTMLInputElement ? costInput.value : 0);
        const sell = Number(sellInput instanceof HTMLInputElement ? sellInput.value : 0);
        const margin = calculateMargin(cost, sell);

        if (sell <= cost) {
          marginPreviewBox.className =
            'p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-medium';
          marginPreviewBox.innerHTML = `Peringatan: Harga jual lebih rendah atau sama dengan HPP (Margin: <strong class="font-mono tabular-nums">${margin.toFixed(
            1
          )}%</strong>).`;
        } else {
          marginPreviewBox.className =
            'p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 font-medium';
          marginPreviewBox.innerHTML = `Estimasi Margin Laba Kotor: <strong class="font-mono tabular-nums">${margin.toFixed(
            1
          )}%</strong> (Laba ${formatRupiah(sell - cost)}/unit)`;
        }
      };

      updateMarginPreview();

      costInput?.addEventListener('input', updateMarginPreview);
      sellInput?.addEventListener('input', updateMarginPreview);

      urlInput?.addEventListener('input', () => {
        if (previewImg instanceof HTMLImageElement && urlInput instanceof HTMLInputElement && urlInput.value.trim()) {
          previewImg.src = urlInput.value.trim();
        }
      });

      previewImg?.addEventListener('error', () => {
        if (previewImg instanceof HTMLImageElement) {
          previewImg.src = PRODUCT_IMAGE_PRESETS[0].url;
        }
      });

      document.querySelectorAll('.preset-img-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const url = btn.getAttribute('data-preset-url') || '';
          if (urlInput instanceof HTMLInputElement) urlInput.value = url;
          if (previewImg instanceof HTMLImageElement) previewImg.src = url;
        });
      });

      fileInput?.addEventListener('change', async (event) => {
        const target = event.target;
        const file = target instanceof HTMLInputElement ? target.files?.[0] : null;
        if (!file) return;
        try {
          const compressed = await compressImageFile(file);
          if (urlInput instanceof HTMLInputElement) urlInput.value = compressed;
          if (previewImg instanceof HTMLImageElement) previewImg.src = compressed;
          showToast('Foto produk berhasil dimuat dan dioptimalkan.', 'success');
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Gagal memuat foto produk.', 'error');
        }
      });

      document.getElementById('cancel-prod-modal-btn')?.addEventListener('click', closeModal);
      document.getElementById('save-prod-modal-btn')?.addEventListener('click', () => {
        const name = (document.getElementById('prod-name')?.value || '').trim();
        const category = document.getElementById('prod-category')?.value || 'Sembako';
        const rawImg = (document.getElementById('prod-image-url')?.value || '').trim();
        const imageUrl = rawImg || getCategoryFallbackImage(category);
        const stock = Math.max(0, parseInt(document.getElementById('prod-stock')?.value || '0', 10) || 0);
        const costPrice = Math.max(100, parseInt(document.getElementById('prod-cost')?.value || '0', 10) || 0);
        const sellPrice = Math.max(100, parseInt(document.getElementById('prod-sell')?.value || '0', 10) || 0);
        const dailySalesAvg = Math.max(1, parseInt(document.getElementById('prod-daily')?.value || '1', 10) || 1);
        const leadTimeDays = Math.max(1, parseInt(document.getElementById('prod-lead')?.value || '1', 10) || 1);
        const safetyStock = Math.max(0, parseInt(document.getElementById('prod-safety')?.value || '0', 10) || 0);

        if (!name) {
          showToast('Nama produk wajib diisi.', 'error');
          return;
        }

        if (isEdit && existing) {
          Object.assign(existing, {
            name,
            category,
            imageUrl,
            stock,
            costPrice,
            sellPrice,
            dailySalesAvg,
            leadTimeDays,
            safetyStock
          });
          showToast(`Produk "${name}" berhasil diperbarui.`, 'success');
        } else {
          appState.products.push({
            id: 'PRD-' + Date.now().toString().slice(-5),
            name,
            category,
            imageUrl,
            stock,
            costPrice,
            sellPrice,
            dailySalesAvg,
            leadTimeDays,
            safetyStock
          });
          awardXP(20, 'Menambahkan produk baru ke katalog');
          unlockBadge('smart_pricer');
        }

        closeModal();
        persistAndRefresh();
      });
    }
  });
}

export function openDeleteProductModal(ctx, productId) {
  const { appState, posCart, persistAndRefresh } = ctx;
  const prod = appState.products.find((p) => p.id === productId);
  if (!prod) return;

  openModal({
    title: 'Hapus Produk?',
    bodyHTML: `<p>Apakah Anda yakin ingin menghapus <strong>${escapeHTML(prod.name)}</strong> dari katalog toko?</p>`,
    footerHTML: `
      <button type="button" id="cancel-del-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">Batal</button>
      <button type="button" id="confirm-del-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-rose-700 hover:bg-rose-800 text-white cursor-pointer">Ya, Hapus</button>
    `,
    onMount: () => {
      document.getElementById('cancel-del-btn')?.addEventListener('click', closeModal);
      document.getElementById('confirm-del-btn')?.addEventListener('click', () => {
        appState.products = appState.products.filter((p) => p.id !== productId);
        delete posCart[productId];
        closeModal();
        persistAndRefresh();
        showToast('Produk dihapus dari katalog.', 'info');
      });
    }
  });
}
