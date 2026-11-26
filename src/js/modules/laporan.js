import { renderIcon } from '../icons.js';
import { normalizeState } from '../storage.js';
import { closeModal, openModal, showToast, updateRealtimeClockAndShiftUI } from '../ui.js';
import {
  downloadFile,
  escapeHTML,
  formatRealtimeClock,
  formatRealtimeDate,
  formatRupiah,
  getLocalDateKey,
  getLocalTimezoneCode
} from '../utils.js';

function parseRestockItemInfo(trx, products = []) {
  let qty = Number(trx.qty);
  let productName = trx.productName;
  if (!Number.isFinite(qty) || qty <= 0 || !productName) {
    const match = String(trx.summary || '').match(
      /(?:Restock|Tambah stok)\s+\+?(\d+)\s+(.+?)(?:\s+@|\s*\(Grosir|$)/i
    );
    if (match) {
      if (!Number.isFinite(qty) || qty <= 0) qty = parseInt(match[1], 10) || 0;
      if (!productName) productName = match[2].trim();
    }
  }
  const matchedProd =
    products.find((p) => p.id === trx.productId) ||
    products.find((p) => p.name.toLowerCase() === String(productName || '').toLowerCase());
  const finalName = productName || matchedProd?.name || 'Produk Restock';
  const totalCost = Number(trx.amount) || 0;
  let unitPrice = Number(trx.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    unitPrice = qty > 0 && totalCost > 0 ? Math.round(totalCost / qty) : matchedProd?.costPrice || 0;
  }
  const key = trx.productId || finalName.toLowerCase();
  return { key, name: finalName, qty: qty || 0, unitPrice, totalCost };
}

export function renderDailyTransactions(ctx) {
  const { appState } = ctx;
  const listEl = document.getElementById('daily-transactions-list');
  if (!listEl) return;

  const session = appState.dailySession;
  const statusPill = document.getElementById('shift-status-pill');
  const openedInfo = document.getElementById('shift-opened-info');
  const actionBtn = document.getElementById('laporan-shift-action-btn');
  const countBadge = document.getElementById('daily-trx-count-badge');
  const dayFilterEl = document.getElementById('laporan-day-filter');

  const dayNumbers = new Set([session.dayNumber]);
  const dayDateMap = new Map();
  appState.transactions.forEach((t) => {
    const d = t.dayNumber || 1;
    dayNumbers.add(d);
    if (t.date && !dayDateMap.has(d)) dayDateMap.set(d, t.date);
  });
  appState.dailyHistoryArchive.forEach((a) => {
    dayNumbers.add(a.dayNumber);
    if (a.date && !dayDateMap.has(a.dayNumber)) dayDateMap.set(a.dayNumber, a.date);
  });
  if (session.dateKey && !dayDateMap.has(session.dayNumber)) {
    const parsed = new Date(`${session.dateKey}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      dayDateMap.set(
        session.dayNumber,
        parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
      );
    }
  }
  if (appState.dailyAdjustments && typeof appState.dailyAdjustments === 'object') {
    Object.keys(appState.dailyAdjustments).forEach((k) => {
      const n = Number(k);
      if (Number.isFinite(n) && n >= 1) dayNumbers.add(n);
    });
  }
  const sortedDaysDesc = Array.from(dayNumbers).sort((a, b) => b - a);
  const sortedDaysAsc = Array.from(dayNumbers).sort((a, b) => a - b);

  if (dayFilterEl instanceof HTMLSelectElement) {
    const prevVal = dayFilterEl.value || 'CURRENT';
    const currentDateLabel = dayDateMap.get(session.dayNumber);

    dayFilterEl.innerHTML = `
      <option value="CURRENT">Hari #${session.dayNumber} (Aktif${currentDateLabel ? ` · ${currentDateLabel}` : ''})</option>
      <option value="ALL">Semua Hari (Gabungan Bulanan)</option>
      ${sortedDaysDesc
        .filter((d) => d !== session.dayNumber)
        .map((d) => {
          const dt = dayDateMap.get(d);
          return `<option value="${d}">Riwayat Hari #${d}${dt ? ` · ${dt}` : ''}</option>`;
        })
        .join('')}
    `;
    if ([...dayFilterEl.options].some((o) => o.value === prevVal)) {
      dayFilterEl.value = prevVal;
    }
  }

  const selectedFilter = dayFilterEl instanceof HTMLSelectElement ? dayFilterEl.value : 'CURRENT';

  const filteredTransactions = appState.transactions.filter((t) => {
    const tDay = t.dayNumber || 1;
    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'CURRENT') return tDay === session.dayNumber;
    return tDay === Number(selectedFilter);
  });

  if (countBadge) {
    countBadge.textContent = `${filteredTransactions.length} Transaksi`;
  }

  if (statusPill && openedInfo) {
    if (session.isOpen) {
      statusPill.className = 'text-xs font-bold text-emerald-700';
      statusPill.textContent = `Hari #${session.dayNumber} · Toko Buka`;
    } else {
      statusPill.className = 'text-xs font-bold text-rose-700';
      statusPill.textContent = `Hari #${session.dayNumber} · Toko Tutup`;
    }
    updateRealtimeClockAndShiftUI(appState);
  }

  if (actionBtn) {
    if (session.isOpen) {
      actionBtn.className =
        'inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white transition cursor-pointer whitespace-nowrap';
      actionBtn.innerHTML = `${renderIcon('moon', 'w-4 h-4 text-amber-400')}<span>Rekap &amp; Tutup Toko</span>`;
    } else {
      const isSameDay = !session.dateKey || session.dateKey === getLocalDateKey();
      actionBtn.className =
        'inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white transition cursor-pointer whitespace-nowrap';
      actionBtn.innerHTML = `${renderIcon('sun', 'w-4 h-4 text-amber-300')}<span>${
        isSameDay ? `Buka Kembali Hari #${session.dayNumber}` : 'Buka Toko Hari Baru'
      }</span>`;
    }
  }

  let monthlySales = 0;
  let monthlyRestock = 0;
  let monthlyRestockQty = 0;
  const monthlyRestockItems = new Set();
  const recordedDays = new Set([session.dayNumber]);

  appState.transactions.forEach((trx) => {
    recordedDays.add(trx.dayNumber || 1);
    if (trx.type === 'SALE') {
      monthlySales += trx.amount;
    } else if (trx.type === 'RESTOCK') {
      monthlyRestock += Number(trx.amount) || 0;
      const info = parseRestockItemInfo(trx, appState.products);
      monthlyRestockQty += info.qty;
      monthlyRestockItems.add(info.key);
    }
  });

  let totalDailyExpense = 0;
  if (appState.dailyAdjustments && typeof appState.dailyAdjustments === 'object') {
    Object.entries(appState.dailyAdjustments).forEach(([k, adj]) => {
      const dayNum = Number(k);
      if (Number.isFinite(dayNum) && dayNum >= 1) {
        recordedDays.add(dayNum);
      }
      totalDailyExpense += Number(adj?.expense) || 0;
    });
  }

  const monthlyNetIncome = monthlySales - totalDailyExpense;

  const daysBadge = document.getElementById('monthly-days-badge');
  const mSales = document.getElementById('monthly-total-sales');
  const mSalesNote = document.getElementById('monthly-total-sales-note');
  if (daysBadge) daysBadge.textContent = `Total ${recordedDays.size} Hari Tercatat`;
  if (mSales) {
    mSales.textContent = formatRupiah(monthlyNetIncome);
    mSales.className = `text-xl sm:text-2xl font-extrabold font-mono tabular-nums mt-1 block ${
      monthlyNetIncome >= 0 ? 'text-white' : 'text-rose-300'
    }`;
  }
  if (mSalesNote) {
    if (totalDailyExpense > 0) {
      mSalesNote.textContent = `Omzet ${formatRupiah(monthlySales)} · Uang keluar -${formatRupiah(totalDailyExpense)}`;
    } else if (totalDailyExpense < 0) {
      mSalesNote.textContent = `Omzet ${formatRupiah(monthlySales)} · Penambahan +${formatRupiah(
        Math.abs(totalDailyExpense)
      )}`;
    } else {
      mSalesNote.textContent = 'Gabungan pemasukan harian dari Hari #1 s/d sekarang';
    }
  }

  const monthlyDaySelect = document.getElementById('monthly-day-select');
  if (monthlyDaySelect instanceof HTMLSelectElement) {
    const dayOptions = sortedDaysAsc.map((d) => {
      const val = d === session.dayNumber ? 'CURRENT' : String(d);
      const dt = dayDateMap.get(d);
      const label =
        d === session.dayNumber
          ? `Hari #${d} (Aktif${dt ? ` · ${dt}` : ''})`
          : `Hari #${d}${dt ? ` · ${dt}` : ''}`;
      return `<option value="${val}">${label}</option>`;
    });
    dayOptions.push('<option value="ALL">Semua Hari</option>');
    monthlyDaySelect.innerHTML = dayOptions.join('');

    if ([...monthlyDaySelect.options].some((o) => o.value === selectedFilter)) {
      monthlyDaySelect.value = selectedFilter;
    } else {
      monthlyDaySelect.value = 'CURRENT';
    }
  }

  const selectedMonthlyDay =
    selectedFilter === 'CURRENT' || selectedFilter === 'ALL'
      ? session.dayNumber
      : Number(selectedFilter) || session.dayNumber;

  let selectedMonthlyDaySales = 0;
  let selectedDayRestock = 0;
  let selectedDayRestockQty = 0;
  const selectedDayRestockItems = new Set();

  appState.transactions
    .filter((t) => (t.dayNumber || 1) === selectedMonthlyDay)
    .forEach((trx) => {
      if (trx.type === 'SALE') {
        selectedMonthlyDaySales += trx.amount;
      } else if (trx.type === 'RESTOCK') {
        selectedDayRestock += Number(trx.amount) || 0;
        const info = parseRestockItemInfo(trx, appState.products);
        selectedDayRestockQty += info.qty;
        selectedDayRestockItems.add(info.key);
      }
    });

  let selectedSales = 0;
  let selectedCashSales = 0;
  let selectedNonCashSales = 0;
  filteredTransactions.forEach((trx) => {
    if (trx.type === 'SALE') {
      selectedSales += trx.amount;
      if (trx.paymentMethod === 'NON_CASH') {
        selectedNonCashSales += trx.amount;
      } else {
        selectedCashSales += trx.amount;
      }
    }
  });

  const dayKey = String(selectedMonthlyDay);
  const todayAdj = appState.dailyAdjustments?.[dayKey];
  const todayExpense = Number(todayAdj?.expense) || 0;
  const netTodayIncome = selectedMonthlyDaySales - todayExpense;

  const isAllDays = selectedFilter === 'ALL';
  const mRestockLabel = document.getElementById('monthly-restock-label');
  const mRestock = document.getElementById('monthly-total-restock');
  const mRestockNote = document.getElementById('monthly-restock-note');
  const mAllRestockWrap = document.getElementById('monthly-all-days-restock-wrap');
  const mAllRestock = document.getElementById('monthly-all-days-restock');
  const mAllRestockNote = document.getElementById('monthly-all-days-restock-note');

  if (isAllDays) {
    if (mRestockLabel) mRestockLabel.textContent = 'Total Belanja Restock (Semua Hari)';
    if (mRestock) mRestock.textContent = formatRupiah(monthlyRestock);
    if (mRestockNote) {
      mRestockNote.textContent =
        monthlyRestockItems.size > 0
          ? `${monthlyRestockItems.size} item · ${monthlyRestockQty} unit masuk (Semua hari)`
          : 'Belum ada belanja restock';
    }
    if (mAllRestockWrap) mAllRestockWrap.classList.add('hidden');
  } else {
    if (mRestockLabel) {
      mRestockLabel.textContent =
        selectedMonthlyDay === session.dayNumber
          ? `Belanja Restock Hari #${selectedMonthlyDay} (Aktif)`
          : `Belanja Restock Hari #${selectedMonthlyDay}`;
    }
    if (mRestock) mRestock.textContent = formatRupiah(selectedDayRestock);
    if (mRestockNote) {
      mRestockNote.textContent =
        selectedDayRestockItems.size > 0
          ? `${selectedDayRestockItems.size} item · ${selectedDayRestockQty} unit masuk Hari #${selectedMonthlyDay}`
          : `Belum ada restock pada Hari #${selectedMonthlyDay}`;
    }
    if (mAllRestockWrap) mAllRestockWrap.classList.remove('hidden');
    if (mAllRestock) mAllRestock.textContent = formatRupiah(monthlyRestock);
    if (mAllRestockNote) {
      mAllRestockNote.textContent =
        monthlyRestockItems.size > 0
          ? `${monthlyRestockItems.size} item · ${monthlyRestockQty} unit (Grosir/Sales)`
          : 'Belum ada belanja restock';
    }
  }
  const monthlyGrid = document.getElementById('monthly-summary-grid');
  const expenseCard = document.getElementById('monthly-expense-card');
  if (monthlyGrid) {
    monthlyGrid.className = isAllDays
      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4'
      : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4';
  }
  if (expenseCard) {
    expenseCard.classList.toggle('hidden', isAllDays);
    expenseCard.classList.toggle('flex', !isAllDays);
  }

  const mExpenseLabel = document.getElementById('monthly-expense-label');
  const mExpense = document.getElementById('monthly-today-expense');
  const mExpenseNote = document.getElementById('monthly-today-expense-note');
  if (mExpenseLabel) {
    mExpenseLabel.textContent =
      selectedMonthlyDay === session.dayNumber
        ? `Uang Keluar Hari #${selectedMonthlyDay} (Aktif)`
        : `Uang Keluar Hari #${selectedMonthlyDay}`;
  }
  if (mExpense) {
    if (todayExpense > 0) {
      mExpense.textContent = `- ${formatRupiah(todayExpense)}`;
      mExpense.className = 'text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-rose-300 mt-1 block';
    } else if (todayExpense < 0) {
      mExpense.textContent = `+ ${formatRupiah(Math.abs(todayExpense))}`;
      mExpense.className = 'text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-300 mt-1 block';
    } else {
      mExpense.textContent = formatRupiah(0);
      mExpense.className = 'text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-amber-300 mt-1 block';
    }
  }
  if (mExpenseNote) {
    const expenseItems = Array.isArray(todayAdj?.items) ? todayAdj.items : [];
    if (expenseItems.length > 0) {
      const previewTitles = expenseItems
        .slice(0, 2)
        .map((it) => it.title)
        .join(', ');
      const extraCount = expenseItems.length > 2 ? ` +${expenseItems.length - 2} lainnya` : '';
      mExpenseNote.textContent = `${expenseItems.length} pengeluaran: ${previewTitles}${extraCount}`;
    } else if (todayAdj?.note) {
      mExpenseNote.textContent = `Catatan: ${todayAdj.note}`;
    } else if (todayExpense > 0) {
      mExpenseNote.textContent = `Pengeluaran Hari #${selectedMonthlyDay}`;
    } else if (todayExpense < 0) {
      mExpenseNote.textContent = `Penambahan manual Hari #${selectedMonthlyDay}`;
    } else {
      mExpenseNote.textContent = 'Klik Tambah untuk mencatat pengeluaran';
    }
  }

  const mTodayLabel = document.getElementById('monthly-today-income-label');
  const mTodayIncome = document.getElementById('monthly-today-income');
  const mTodayNote = document.getElementById('monthly-today-income-note');
  if (mTodayLabel) {
    mTodayLabel.textContent =
      selectedMonthlyDay === session.dayNumber
        ? `Total Pemasukan Hari #${selectedMonthlyDay} (Aktif)`
        : `Total Pemasukan Hari #${selectedMonthlyDay}`;
  }
  if (mTodayIncome) {
    mTodayIncome.textContent = formatRupiah(netTodayIncome);
    mTodayIncome.className = `text-xl sm:text-2xl font-extrabold font-mono tabular-nums mt-1 block ${
      netTodayIncome >= 0 ? 'text-emerald-300' : 'text-rose-300'
    }`;
  }
  if (mTodayNote) {
    if (todayExpense > 0) {
      mTodayNote.textContent = `Omzet ${formatRupiah(selectedMonthlyDaySales)} - ${formatRupiah(todayExpense)}`;
    } else if (todayExpense < 0) {
      mTodayNote.textContent = `Omzet ${formatRupiah(selectedMonthlyDaySales)} + ${formatRupiah(
        Math.abs(todayExpense)
      )}`;
    } else {
      mTodayNote.textContent = `Sesuai omzet Hari #${selectedMonthlyDay}`;
    }
  }

  const dTrxCount = document.getElementById('daily-trx-count');
  const dTrxSub = document.getElementById('daily-trx-sub');
  const dSalesLabel = document.getElementById('daily-sales-label');
  const dSales = document.getElementById('daily-sales-total');
  const dSalesSub = document.getElementById('daily-sales-sub');
  const dCashSales = document.getElementById('daily-cash-sales');
  const dCashSub = document.getElementById('daily-cash-sub');
  const dNonCashSales = document.getElementById('daily-noncash-sales');
  const dNonCashSub = document.getElementById('daily-noncash-sub');

  const isAllSelected = selectedFilter === 'ALL';
  const activeDayLabel = isAllSelected
    ? 'semua hari'
    : selectedFilter === 'CURRENT' || Number(selectedFilter) === session.dayNumber
      ? `Hari #${session.dayNumber} (Aktif)`
      : `Hari #${Number(selectedFilter)}`;

  if (dTrxCount) dTrxCount.textContent = `${filteredTransactions.length} Transaksi`;
  if (dTrxSub) dTrxSub.textContent = `Jumlah transaksi ${activeDayLabel}`;
  if (dSalesLabel) {
    dSalesLabel.textContent = isAllSelected
      ? 'Pendapatan Semua Hari'
      : selectedFilter === 'CURRENT' || Number(selectedFilter) === session.dayNumber
        ? 'Pendapatan Hari Ini'
        : `Pendapatan Hari #${Number(selectedFilter)}`;
  }
  if (dSales) dSales.textContent = formatRupiah(selectedSales);
  if (dSalesSub) dSalesSub.textContent = `Pemasukan kasir POS ${activeDayLabel}`;
  if (dCashSales) dCashSales.textContent = formatRupiah(selectedCashSales);
  if (dCashSub) dCashSub.textContent = `Pembayaran tunai ${activeDayLabel}`;
  if (dNonCashSales) dNonCashSales.textContent = formatRupiah(selectedNonCashSales);
  if (dNonCashSub) dNonCashSub.textContent = `Pembayaran QRIS / transfer ${activeDayLabel}`;

  const restockBodyEl = document.getElementById('restock-breakdown-body');
  const restockFootEl = document.getElementById('restock-breakdown-foot');
  const restockGrandTotalEl = document.getElementById('restock-breakdown-grand-total');
  const restockSubtitleEl = document.getElementById('restock-breakdown-subtitle');

  const restockMap = new Map();
  let restockGrandQty = 0;
  let restockGrandCost = 0;

  filteredTransactions
    .filter((t) => t.type === 'RESTOCK')
    .forEach((trx) => {
      const info = parseRestockItemInfo(trx, appState.products);
      restockGrandQty += info.qty;
      restockGrandCost += info.totalCost;

      const existing = restockMap.get(info.key);
      if (existing) {
        existing.qty += info.qty;
        existing.totalCost += info.totalCost;
        existing.prices.add(info.unitPrice);
      } else {
        restockMap.set(info.key, {
          name: info.name,
          qty: info.qty,
          totalCost: info.totalCost,
          prices: new Set([info.unitPrice])
        });
      }
    });

  const restockTotalLabelEl = document.getElementById('restock-breakdown-total-label');
  if (restockTotalLabelEl) {
    restockTotalLabelEl.textContent = isAllSelected
      ? 'Total Restock Semua Hari'
      : `Total Restock Hari #${selectedMonthlyDay}`;
  }
  if (restockSubtitleEl) {
    restockSubtitleEl.textContent = `Rekap per barang untuk ${activeDayLabel} (Grosir/Sales)`;
  }
  if (restockGrandTotalEl) {
    restockGrandTotalEl.textContent = formatRupiah(restockGrandCost);
  }
  if (restockBodyEl && restockFootEl) {
    if (restockMap.size === 0) {
      restockBodyEl.innerHTML = `
        <tr>
          <td colspan="4" class="py-8 px-4 text-center text-sm text-slate-500">
            Belum ada catatan belanja restock pada ${escapeHTML(activeDayLabel)}.
          </td>
        </tr>
      `;
      restockFootEl.innerHTML = '';
    } else {
      restockBodyEl.innerHTML = Array.from(restockMap.values())
        .map((item) => {
          const priceList = Array.from(item.prices).sort((a, b) => a - b);
          const priceDisplay =
            priceList.length === 1
              ? formatRupiah(priceList[0])
              : `${formatRupiah(priceList[0])} – ${formatRupiah(priceList[priceList.length - 1])}`;
          return `
            <tr class="hover:bg-slate-50 transition">
              <td class="py-3 px-4 font-semibold text-slate-900">${escapeHTML(item.name)}</td>
              <td class="py-3 px-4 text-center font-mono tabular-nums font-bold text-teal-700">+${item.qty} unit</td>
              <td class="py-3 px-4 text-right font-mono tabular-nums text-slate-700">${priceDisplay}</td>
              <td class="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">${formatRupiah(
                item.totalCost
              )}</td>
            </tr>
          `;
        })
        .join('');
      restockFootEl.innerHTML = `
        <tr>
          <td class="py-3 px-4 text-slate-900">Total Keseluruhan (${restockMap.size} item)</td>
          <td class="py-3 px-4 text-center font-mono tabular-nums text-teal-800">+${restockGrandQty} unit</td>
          <td class="py-3 px-4 text-right text-xs font-medium text-slate-500">Semua item</td>
          <td class="py-3 px-4 text-right font-mono tabular-nums text-amber-700">${formatRupiah(restockGrandCost)}</td>
        </tr>
      `;
    }
  }

  if (filteredTransactions.length === 0) {
    listEl.innerHTML = `<p class="text-sm text-slate-500 text-center py-8">Belum ada transaksi tercatat pada filter hari yang dipilih.</p>`;
  } else {
    listEl.innerHTML = filteredTransactions
      .map((trx) => {
        const isSale = trx.type === 'SALE';
        const isAudit = trx.type === 'AUDIT';
        const tDay = trx.dayNumber || 1;

        let iconWrapClass = 'bg-teal-100 text-teal-800';
        let iconName = 'package';
        let typeLabel = 'STOK MASUK';
        let typeTextClass = 'text-teal-800';
        let rightAmountHTML =
          (Number(trx.amount) || 0) > 0
            ? `<div class="font-extrabold font-mono tabular-nums text-amber-700">${formatRupiah(
                trx.amount
              )}</div><div class="text-[11px] text-slate-500">Belanja Grosir/Sales</div>`
            : `<div class="font-bold text-teal-700 text-xs">Tambah Stok</div><div class="text-[11px] text-slate-500">Non-kas (Grosir/Sales)</div>`;

        if (isSale) {
          iconWrapClass = 'bg-emerald-100 text-emerald-800';
          iconName = 'arrow-down-left';
          typeLabel = 'PENJUALAN';
          typeTextClass = 'text-emerald-800';
          rightAmountHTML = `<div class="font-extrabold font-mono tabular-nums text-emerald-700">+ ${formatRupiah(
            trx.amount
          )}</div><div class="text-[11px] font-mono tabular-nums font-semibold ${
            trx.profit >= 0 ? 'text-teal-700' : 'text-rose-700'
          }">Laba: ${formatRupiah(trx.profit)}</div>`;
        } else if (isAudit) {
          iconWrapClass = 'bg-slate-100 text-slate-700';
          iconName = 'clipboard-check';
          typeLabel = 'AUDIT STOK';
          typeTextClass = 'text-slate-700';
          rightAmountHTML = `<div class="font-bold text-slate-700 text-xs">Penyesuaian Fisik</div><div class="text-[11px] text-slate-500">Non-kas</div>`;
        }

        const paymentBadge = isSale
          ? `<span aria-hidden="true" class="text-slate-300">&middot;</span><span class="font-semibold ${
              trx.paymentMethod === 'NON_CASH' ? 'text-sky-700' : 'text-slate-700'
            }">${trx.paymentMethod === 'NON_CASH' ? 'Non-Cash' : 'Cash'}</span>`
          : '';

        return `
          <div class="py-3.5 flex items-start justify-between gap-4 text-sm">
            <div class="flex items-start gap-3 min-w-0 flex-1">
              <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${iconWrapClass}">
                ${renderIcon(iconName, 'w-4 h-4')}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5 text-xs">
                  <span class="font-bold font-mono tabular-nums text-slate-700">Hari #${tDay}</span>
                  <span aria-hidden="true" class="text-slate-300">&middot;</span>
                  <span class="font-bold ${typeTextClass}">${typeLabel}</span>
                  ${paymentBadge}
                  <span aria-hidden="true" class="text-slate-300">&middot;</span>
                  <span class="text-slate-500 font-mono tabular-nums">${
                    trx.date ? `${escapeHTML(trx.date)} ${escapeHTML(trx.time)}` : escapeHTML(trx.time)
                  }</span>
                </div>
                <p class="mt-1 text-sm font-semibold text-slate-900 leading-snug break-words">${escapeHTML(trx.summary)}</p>
              </div>
            </div>
            <div class="text-right shrink-0">${rightAmountHTML}</div>
          </div>
        `;
      })
      .join('');
  }

  const archiveEl = document.getElementById('daily-archive-list');
  if (archiveEl) {
    if (!appState.dailyHistoryArchive || appState.dailyHistoryArchive.length === 0) {
      archiveEl.innerHTML = `<p class="text-sm text-slate-500 text-center py-6">Belum ada arsip laporan tutup toko. Gunakan tombol Rekap &amp; Tutup Toko di akhir hari untuk mengarsipkan.</p>`;
    } else {
      archiveEl.innerHTML = appState.dailyHistoryArchive
        .map((arc) => {
          const netChange = arc.closingCash - arc.openingCash;
          const salesInfo =
            typeof arc.totalSales === 'number'
              ? ` &middot; Omzet: ${formatRupiah(arc.totalSales)} &middot; Laba: ${formatRupiah(arc.totalProfit || 0)}`
              : '';
          const arcTz = escapeHTML(arc.timezone || getLocalTimezoneCode());
          return `
            <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
              <div>
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <span class="font-bold font-mono tabular-nums text-slate-900">Hari #${arc.dayNumber}</span>
                  <span aria-hidden="true" class="text-slate-300">&middot;</span>
                  <span class="text-slate-600 font-mono tabular-nums">Buka ${escapeHTML(arc.openedAt)} &ndash; Tutup ${escapeHTML(
                    arc.closedAt
                  )} ${arcTz}</span>
                </div>
                <p class="text-xs text-slate-600 mt-1 font-mono tabular-nums">
                  ${arc.transactionCount} transaksi &middot; Kas Awal: ${formatRupiah(arc.openingCash)}${salesInfo}
                </p>
              </div>
              <div class="text-left sm:text-right">
                <div class="font-extrabold font-mono tabular-nums text-slate-900">
                  Kas Akhir: ${formatRupiah(arc.closingCash)}
                </div>
                <div class="text-xs font-semibold font-mono tabular-nums ${
                  netChange >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }">
                  Selisih Kas: ${netChange >= 0 ? '+' : ''}${formatRupiah(netChange)}
                </div>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }
}

export function exportTransactionsCSV(ctx) {
  const { appState } = ctx;
  if (!appState.transactions.length) {
    showToast('Belum ada transaksi untuk diekspor ke CSV.', 'info');
    return;
  }

  const header = ['ID', 'Hari', 'Tanggal', 'Waktu', 'Jenis', 'Metode', 'Ringkasan', 'Nominal (Rp)', 'Laba (Rp)', 'Diskon (%)'];
  const rows = appState.transactions.map((t) => [
    t.id || '',
    t.dayNumber || 1,
    t.date || '',
    t.time || '',
    t.type || '',
    t.type === 'SALE' ? (t.paymentMethod === 'NON_CASH' ? 'Non-Cash' : 'Cash') : '-',
    `"${String(t.summary || '').replace(/"/g, '""')}"`,
    t.amount || 0,
    t.profit || 0,
    t.discountPercent || 0
  ]);

  const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const slug = appState.storeProfile.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  downloadFile(`laporan-${slug}-hari-${appState.dailySession.dayNumber}.csv`, '\ufeff' + csvContent, 'text/csv;charset=utf-8;');
  showToast('Laporan transaksi CSV berhasil diunduh.', 'success');
}

export function openDailyClosingModal(ctx) {
  const { appState, awardXP, persistAndRefresh } = ctx;
  const session = appState.dailySession;

  let salesCount = 0;
  let totalSales = 0;
  let totalRestock = 0;
  let totalProfit = 0;

  appState.transactions
    .filter((t) => (t.dayNumber || 1) === session.dayNumber)
    .forEach((t) => {
      if (t.type === 'SALE') {
        salesCount++;
        totalSales += t.amount;
        totalProfit += t.profit;
      } else if (t.type === 'RESTOCK') {
        totalRestock += t.amount;
      }
    });

  const todayAdj = appState.dailyAdjustments?.[String(session.dayNumber)];
  const todayExpense = Number(todayAdj?.expense) || 0;
  const expectedEndingCash = session.openingCash + totalSales - todayExpense;
  const expenseRowHTML =
    todayExpense !== 0
      ? `
        <div class="flex justify-between text-rose-700">
          <span>(-) Uang Keluar / Kebutuhan Harian${todayAdj?.note ? ` (${escapeHTML(todayAdj.note)})` : ''}:</span>
          <strong class="font-mono tabular-nums">${
            todayExpense > 0 ? `- ${formatRupiah(todayExpense)}` : `+ ${formatRupiah(Math.abs(todayExpense))}`
          }</strong>
        </div>
      `
      : '';

  const now = new Date();
  const tz = getLocalTimezoneCode(now);

  const bodyHTML = `
    <div class="space-y-3">
      <div class="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-950">
        <strong>Konsep Ilmiah Cash Reconciliation (Tutup Kasir):</strong><br />
        <code class="font-mono">Kas Akhir = Kas Awal Buka + Total Penjualan - Uang Keluar</code>
      </div>
      <div class="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2 text-xs">
        <div class="flex justify-between">
          <span class="text-slate-600">Operasional Hari ke-${session.dayNumber} (Buka ${escapeHTML(session.openedAt)} ${escapeHTML(tz)}):</span>
          <strong class="font-mono tabular-nums text-slate-900">${salesCount} Penjualan</strong>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-600">Waktu Tutup (Real-time):</span>
          <strong id="modal-realtime-clock" class="font-mono tabular-nums text-teal-700">${escapeHTML(
            formatRealtimeClock(now)
          )} ${escapeHTML(tz)}</strong>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-600">Kas Awal Saat Buka Toko:</span>
          <strong class="font-mono tabular-nums text-slate-900">${formatRupiah(session.openingCash)}</strong>
        </div>
        <div class="flex justify-between text-emerald-700">
          <span>(+) Pemasukan Penjualan Hari Ini:</span>
          <strong class="font-mono tabular-nums">+ ${formatRupiah(totalSales)}</strong>
        </div>
        <div class="flex justify-between text-amber-700">
          <span>Belanja Restock (Grosir/Sales, Non-laci):</span>
          <strong class="font-mono tabular-nums">${formatRupiah(totalRestock)}</strong>
        </div>
        ${expenseRowHTML}
        <div class="flex justify-between pt-2 border-t border-slate-200 text-sm font-extrabold text-slate-900">
          <span>Saldo Kas Akhir Laci:</span>
          <span class="font-mono tabular-nums">${formatRupiah(expectedEndingCash)}</span>
        </div>
        <div class="flex justify-between text-xs font-bold ${totalProfit >= 0 ? 'text-teal-700' : 'text-rose-700'}">
          <span>Total Laba Kotor Hari Ini:</span>
          <span class="font-mono tabular-nums">${formatRupiah(totalProfit)}</span>
        </div>
      </div>
      <p class="text-xs text-slate-500">
        Jika toko dibuka kembali sebelum pukul 00:00 (hari yang sama), transaksi tetap melanjutkan Hari #${session.dayNumber}. Reset ke hari baru otomatis berlaku setiap pergantian pukul 00:00.
      </p>
    </div>
  `;

  const footerHTML = `
    <button type="button" id="cancel-close-shift-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
      Tetap Buka
    </button>
    <button type="button" id="confirm-close-shift-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white inline-flex items-center gap-1.5 cursor-pointer">
      ${renderIcon('lock', 'w-4 h-4 text-amber-400')}
      <span>Tutup Toko Sekarang (+30 XP)</span>
    </button>
  `;

  openModal({
    title: `Laporan Tutup Toko — Hari #${session.dayNumber}`,
    bodyHTML,
    footerHTML,
    onMount: () => {
      document.getElementById('cancel-close-shift-btn')?.addEventListener('click', closeModal);
      document.getElementById('confirm-close-shift-btn')?.addEventListener('click', () => {
        const closeNow = new Date();
        const nowStr = formatRealtimeClock(closeNow);
        const closeTs = closeNow.getTime();
        const closeTz = getLocalTimezoneCode(closeNow);
        const currentDay = appState.dailySession.dayNumber;
        appState.dailySession.isOpen = false;
        appState.dailySession.closedAt = nowStr;
        appState.dailySession.closedTimestamp = closeTs;
        if (!appState.dailySession.dateKey) {
          appState.dailySession.dateKey = getLocalDateKey(closeNow);
        }

        upsertDayArchive(appState, currentDay, {
          openedAt: appState.dailySession.openedAt,
          openedTimestamp: appState.dailySession.openedTimestamp || null,
          closedAt: nowStr,
          closedTimestamp: closeTs,
          timezone: closeTz,
          openingCash: appState.dailySession.openingCash,
          closingCash: appState.storeProfile.cashBalance
        });

        closeModal();
        persistAndRefresh();
        awardXP(30, `Menyelesaikan rekap tutup toko Hari #${currentDay}`);
      });
    }
  });
}

function upsertDayArchive(appState, dayNumber, meta) {
  const dayTransactions = appState.transactions.filter((t) => (t.dayNumber || 1) === dayNumber);
  let daySales = 0;
  let dayRestock = 0;
  let dayProfit = 0;
  dayTransactions.forEach((t) => {
    if (t.type === 'SALE') {
      daySales += t.amount;
      dayProfit += t.profit;
    } else if (t.type === 'RESTOCK') {
      dayRestock += t.amount;
    }
  });

  const entry = {
    dayNumber,
    openedAt: meta.openedAt,
    openedTimestamp: meta.openedTimestamp || null,
    closedAt: meta.closedAt,
    closedTimestamp: meta.closedTimestamp || null,
    timezone: meta.timezone || getLocalTimezoneCode(),
    openingCash: meta.openingCash,
    closingCash: meta.closingCash,
    totalSales: daySales,
    totalRestock: dayRestock,
    totalProfit: dayProfit,
    dailyExpense: Number(appState.dailyAdjustments?.[String(dayNumber)]?.expense) || 0,
    transactionCount: dayTransactions.length
  };

  if (!Array.isArray(appState.dailyHistoryArchive)) {
    appState.dailyHistoryArchive = [];
  }
  const existingIdx = appState.dailyHistoryArchive.findIndex((a) => a.dayNumber === dayNumber);
  if (existingIdx >= 0) {
    appState.dailyHistoryArchive[existingIdx] = entry;
  } else {
    appState.dailyHistoryArchive.unshift(entry);
  }
}

export function archiveAndRolloverIfMidnight(appState) {
  const session = appState?.dailySession;
  if (!session || !session.dateKey) return false;
  const now = new Date();
  const todayKey = getLocalDateKey(now);
  if (!todayKey || session.dateKey === todayKey) return false;

  if (!session.isOpen) {
    // Store was closed on a previous calendar date; keep closed until owner opens the new day.
    return false;
  }

  const prevDay = session.dayNumber || 1;
  const nextDay = prevDay + 1;
  upsertDayArchive(appState, prevDay, {
    openedAt: session.openedAt,
    openedTimestamp: session.openedTimestamp || null,
    closedAt: '23:59:59',
    closedTimestamp: null,
    timezone: getLocalTimezoneCode(now),
    openingCash: session.openingCash,
    closingCash: appState.storeProfile.cashBalance
  });

  appState.storeProfile.cashBalance = 0;
  appState.dailySession = {
    isOpen: true,
    dayNumber: nextDay,
    dateKey: todayKey,
    openedAt: formatRealtimeClock(now),
    openedTimestamp: now.getTime(),
    reopenedAt: null,
    openingCash: 0,
    closedAt: null,
    closedTimestamp: null
  };
  return true;
}

export function openStartNewDayModal(ctx) {
  const { appState, persistAndRefresh } = ctx;
  const now = new Date();
  const tz = getLocalTimezoneCode(now);
  const todayKey = getLocalDateKey(now);
  const currentSession = appState.dailySession || {};
  const isSameDay = !currentSession.dateKey || currentSession.dateKey === todayKey;
  const targetDay = isSameDay ? currentSession.dayNumber || 1 : (currentSession.dayNumber || 1) + 1;

  openModal({
    title: isSameDay
      ? `Buka Kembali Toko — Hari #${targetDay}`
      : `Buka Operasional Toko — Hari #${targetDay}`,
    bodyHTML: isSameDay
      ? `
      <p>Anda akan membuka kembali <strong>${escapeHTML(
        appState.storeProfile.storeName
      )}</strong> pada hari yang sama (<strong>Hari #${targetDay}</strong>).</p>
      <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
        <div>Waktu Buka Kembali (Real-time): <strong id="modal-realtime-clock" class="font-mono tabular-nums text-teal-800">${escapeHTML(
          formatRealtimeClock(now)
        )} ${escapeHTML(tz)}</strong> <span class="text-emerald-800">(${escapeHTML(formatRealtimeDate(now))})</span></div>
        <div>Transaksi, pengeluaran, dan saldo kas <strong>Hari #${targetDay}</strong> tetap dilanjutkan (reset hari otomatis pukul 00:00).</div>
      </div>
    `
      : `
      <p>Anda akan memulai operasional <strong>Hari #${targetDay}</strong> untuk <strong>${escapeHTML(
        appState.storeProfile.storeName
      )}</strong>.</p>
      <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
        <div>Waktu Buka (Real-time): <strong id="modal-realtime-clock" class="font-mono tabular-nums text-teal-800">${escapeHTML(
          formatRealtimeClock(now)
        )} ${escapeHTML(tz)}</strong> <span class="text-emerald-800">(${escapeHTML(formatRealtimeDate(now))})</span></div>
        <div>Saldo Kas Awal Laci: <strong class="font-mono tabular-nums">${formatRupiah(0)}</strong> (Reset harian setiap pukul 00:00)</div>
        <div>Log transaksi harian baru akan tercatat mulai dari waktu sekarang.</div>
      </div>
    `,
    footerHTML: `
      <button type="button" id="cancel-new-day-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
        Batal
      </button>
      <button type="button" id="confirm-new-day-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer">
        ${isSameDay ? `Buka Kembali Hari #${targetDay}` : `Buka Toko Hari #${targetDay}`}
      </button>
    `,
    onMount: () => {
      document.getElementById('cancel-new-day-btn')?.addEventListener('click', closeModal);
      document.getElementById('confirm-new-day-btn')?.addEventListener('click', () => {
        const openNow = new Date();
        const openClock = formatRealtimeClock(openNow);
        const openKey = getLocalDateKey(openNow);
        const stillSameDay = !currentSession.dateKey || currentSession.dateKey === openKey;

        if (stillSameDay) {
          appState.dailySession = {
            ...currentSession,
            isOpen: true,
            dayNumber: targetDay,
            dateKey: openKey,
            openedAt: currentSession.openedAt || openClock,
            openedTimestamp: currentSession.openedTimestamp || openNow.getTime(),
            reopenedAt: openClock,
            closedAt: null,
            closedTimestamp: null
          };
          closeModal();
          persistAndRefresh();
          showToast(
            `Toko dibuka kembali pada Hari #${targetDay} pukul ${openClock} ${getLocalTimezoneCode(openNow)}!`,
            'success'
          );
        } else {
          appState.storeProfile.cashBalance = 0;
          appState.dailySession = {
            isOpen: true,
            dayNumber: targetDay,
            dateKey: openKey,
            openedAt: openClock,
            openedTimestamp: openNow.getTime(),
            reopenedAt: null,
            openingCash: 0,
            closedAt: null,
            closedTimestamp: null
          };
          closeModal();
          persistAndRefresh();
          showToast(
            `Toko resmi dibuka Hari #${targetDay} pukul ${openClock} ${getLocalTimezoneCode(openNow)}!`,
            'success'
          );
        }
      });
    }
  });
}

export function openBackupRestoreModal(ctx) {
  const { appState, replaceState } = ctx;

  const bodyHTML = `
    <div class="space-y-4">
      <p class="text-xs text-slate-600 leading-relaxed">
        Simpan cadangan seluruh data simulasi (produk, stok, transaksi, XP, dan arsip) ke file JSON atau pulihkan dari cadangan sebelumnya.
      </p>

      <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
        <div>
          <div class="font-bold text-sm text-slate-900">Ekspor Cadangan (JSON)</div>
          <div class="text-xs text-slate-500">${appState.products.length} produk &middot; ${appState.transactions.length} transaksi</div>
        </div>
        <button type="button" id="export-json-btn" class="px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer shrink-0">
          Unduh JSON
        </button>
      </div>

      <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
        <div class="font-bold text-sm text-slate-900">Impor Cadangan (JSON)</div>
        <p class="text-xs text-slate-500">Pilih file cadangan <code>.json</code> TokoKu untuk memulihkan data.</p>
        <input
          type="file"
          id="import-json-input"
          accept="application/json,.json"
          class="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-white file:text-slate-700 hover:file:bg-slate-100 cursor-pointer"
        />
      </div>
    </div>
  `;

  openModal({
    title: 'Ekspor & Impor Data Simulasi',
    bodyHTML,
    footerHTML: `
      <button type="button" id="close-backup-modal-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
        Tutup
      </button>
    `,
    onMount: () => {
      document.getElementById('close-backup-modal-btn')?.addEventListener('click', closeModal);
      document.getElementById('export-json-btn')?.addEventListener('click', () => {
        const slug = appState.storeProfile.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        downloadFile(`backup-tokoku-${slug}.json`, JSON.stringify(appState, null, 2), 'application/json');
        showToast('Cadangan data JSON berhasil diunduh.', 'success');
      });

      const fileInput = document.getElementById('import-json-input');
      fileInput?.addEventListener('change', (event) => {
        const target = event.target;
        const file = target instanceof HTMLInputElement ? target.files?.[0] : null;
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const parsed = JSON.parse(String(e.target?.result || ''));
            const normalized = normalizeState(parsed);
            replaceState(normalized);
            closeModal();
            showToast('Data simulasi berhasil dipulihkan dari file JSON.', 'success');
          } catch {
            showToast('File JSON tidak valid atau rusak.', 'error');
          }
        };
        reader.readAsText(file);
      });
    }
  });
}

function getDayExpenseItems(appState, dayKey) {
  const adj = appState.dailyAdjustments?.[dayKey];
  if (!adj || typeof adj !== 'object') return [];
  if (Array.isArray(adj.items) && adj.items.length > 0) {
    return adj.items.map((it, idx) => ({
      id: it.id || `EXP-${dayKey}-${idx + 1}`,
      title: it.title || 'Pengeluaran Harian',
      amount: Number(it.amount) || 0,
      time: it.time || ''
    }));
  }
  const legacyExp = Number(adj.expense) || 0;
  if (legacyExp !== 0) {
    return [
      {
        id: `EXP-${dayKey}-LEGACY`,
        title: adj.note || 'Pengeluaran Harian',
        amount: legacyExp,
        time: adj.updatedAt || ''
      }
    ];
  }
  return [];
}

export function openEditTodayIncomeModal(ctx) {
  const { appState, persistAndRefresh } = ctx;
  const session = appState.dailySession;
  const monthlyDaySelect = document.getElementById('monthly-day-select');
  const rawVal = monthlyDaySelect instanceof HTMLSelectElement ? monthlyDaySelect.value : 'CURRENT';
  const targetDay =
    rawVal === 'CURRENT' || rawVal === 'ALL'
      ? session.dayNumber
      : Number(rawVal) || session.dayNumber;
  const dayKey = String(targetDay);

  const todaySales = (appState.transactions || [])
    .filter((t) => (t.dayNumber || 1) === targetDay && t.type === 'SALE')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  let items = getDayExpenseItems(appState, dayKey);
  let editingItemId = null;

  const syncExpenseToState = () => {
    const prevExpense = Number(appState.dailyAdjustments?.[dayKey]?.expense) || 0;
    const nextExpense = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
    const deltaExpense = nextExpense - prevExpense;

    if (!appState.dailyAdjustments || typeof appState.dailyAdjustments !== 'object') {
      appState.dailyAdjustments = {};
    }

    if (items.length === 0) {
      delete appState.dailyAdjustments[dayKey];
    } else {
      const summaryNote = items.map((it) => it.title).join(', ').slice(0, 120);
      appState.dailyAdjustments[dayKey] = {
        expense: nextExpense,
        note: summaryNote,
        updatedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        items: items.map((it) => ({ ...it }))
      };
    }

    if (targetDay === session.dayNumber) {
      appState.storeProfile.cashBalance = Math.max(0, appState.storeProfile.cashBalance - deltaExpense);
    }
    const arcEntry = (appState.dailyHistoryArchive || []).find((a) => a.dayNumber === targetDay);
    if (arcEntry) {
      arcEntry.dailyExpense = nextExpense;
    }

    persistAndRefresh();
  };

  const bodyHTML = `
    <div class="space-y-4">
      <div class="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
        <div>
          <span class="text-slate-500 block">Omzet Hari #${targetDay}</span>
          <strong class="font-mono tabular-nums text-sm text-slate-900">${formatRupiah(todaySales)}</strong>
        </div>
        <div>
          <span class="text-slate-500 block">Total Uang Keluar</span>
          <strong id="modal-expense-total" class="font-mono tabular-nums text-sm text-rose-700">Rp 0</strong>
        </div>
        <div>
          <span class="text-slate-500 block">Pemasukan Bersih</span>
          <strong id="modal-net-income-total" class="font-mono tabular-nums text-sm text-emerald-700">Rp 0</strong>
        </div>
      </div>

      <form id="expense-item-form" class="p-3.5 rounded-xl bg-teal-50/60 border border-teal-200 space-y-3">
        <div class="flex items-center justify-between">
          <h5 id="expense-form-heading" class="text-xs font-bold text-teal-900">Tambah Pengeluaran Baru</h5>
          <button
            type="button"
            id="cancel-item-edit-btn"
            class="hidden text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >Batal Ubah</button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
          <div class="sm:col-span-3">
            <label for="new-expense-title" class="block text-[11px] font-bold text-slate-700 mb-1">
              Keperluan / Keterangan
            </label>
            <input
              type="text"
              id="new-expense-title"
              maxlength="100"
              placeholder="Contoh: Beli plastik, bensin, makan siang..."
              class="w-full px-3 py-2 min-h-[40px] bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          <div class="sm:col-span-2">
            <label for="new-expense-amount" class="block text-[11px] font-bold text-slate-700 mb-1">
              Nominal (Rp)
            </label>
            <input
              type="number"
              id="new-expense-amount"
              step="500"
              placeholder="15000"
              class="w-full px-3 py-2 min-h-[40px] bg-white border border-slate-300 rounded-xl text-sm font-mono tabular-nums font-semibold focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
        </div>
        <button
          type="submit"
          id="submit-expense-item-btn"
          class="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white transition cursor-pointer"
        >
          ${renderIcon('plus-circle', 'w-4 h-4')}
          <span id="submit-expense-btn-label">Tambah ke Daftar Pengeluaran</span>
        </button>
      </form>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <h5 class="text-xs font-bold text-slate-700">Daftar Pengeluaran Hari #${targetDay}</h5>
          <span id="modal-expense-count" class="text-xs font-mono tabular-nums text-slate-500">0 item</span>
        </div>
        <div id="expense-items-list" class="divide-y divide-slate-200 max-h-56 overflow-y-auto border border-slate-200 rounded-xl bg-white"></div>
      </div>
    </div>
  `;

  const footerHTML = `
    <button type="button" id="reset-today-income-btn" class="px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer mr-auto">
      Hapus Semua Pengeluaran
    </button>
    <button type="button" id="cancel-edit-income-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer">
      Selesai
    </button>
  `;

  openModal({
    title: `Uang Keluar & Pengeluaran — Hari #${targetDay}`,
    bodyHTML,
    footerHTML,
    onMount: () => {
      const formEl = document.getElementById('expense-item-form');
      const headingEl = document.getElementById('expense-form-heading');
      const cancelEditBtn = document.getElementById('cancel-item-edit-btn');
      const submitBtnLabel = document.getElementById('submit-expense-btn-label');
      const titleInput = document.getElementById('new-expense-title');
      const amountInput = document.getElementById('new-expense-amount');
      const listEl = document.getElementById('expense-items-list');
      const totalExpenseEl = document.getElementById('modal-expense-total');
      const netIncomeEl = document.getElementById('modal-net-income-total');
      const countEl = document.getElementById('modal-expense-count');
      const resetAllBtn = document.getElementById('reset-today-income-btn');

      const resetFormMode = () => {
        editingItemId = null;
        if (headingEl) headingEl.textContent = 'Tambah Pengeluaran Baru';
        if (submitBtnLabel) submitBtnLabel.textContent = 'Tambah ke Daftar Pengeluaran';
        cancelEditBtn?.classList.add('hidden');
        if (titleInput instanceof HTMLInputElement) titleInput.value = '';
        if (amountInput instanceof HTMLInputElement) amountInput.value = '';
      };

      const renderExpenseModalList = () => {
        const totalExp = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
        const netIncome = todaySales - totalExp;

        if (totalExpenseEl) {
          totalExpenseEl.textContent =
            totalExp > 0
              ? `- ${formatRupiah(totalExp)}`
              : totalExp < 0
                ? `+ ${formatRupiah(Math.abs(totalExp))}`
                : formatRupiah(0);
        }
        if (netIncomeEl) {
          netIncomeEl.textContent = formatRupiah(netIncome);
          netIncomeEl.className = `font-mono tabular-nums text-sm ${
            netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700'
          }`;
        }
        if (countEl) countEl.textContent = `${items.length} item`;
        if (resetAllBtn) {
          resetAllBtn.classList.toggle('hidden', items.length === 0);
        }

        if (!listEl) return;
        if (items.length === 0) {
          listEl.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">Belum ada pengeluaran tercatat untuk Hari #${targetDay}. Tambahkan di formulir di atas.</p>`;
          return;
        }

        listEl.innerHTML = items
          .map(
            (it) => `
            <div class="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-slate-900 break-words">${escapeHTML(it.title)}</div>
                ${it.time ? `<div class="text-[11px] text-slate-500 font-mono tabular-nums">${escapeHTML(it.time)} WIB</div>` : ''}
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <strong class="font-mono tabular-nums text-sm ${
                  it.amount >= 0 ? 'text-rose-700' : 'text-emerald-700'
                }">${it.amount >= 0 ? `- ${formatRupiah(it.amount)}` : `+ ${formatRupiah(Math.abs(it.amount))}`}</strong>
                <button
                  type="button"
                  data-action="edit-expense-item"
                  data-id="${escapeHTML(it.id)}"
                  aria-label="Ubah pengeluaran"
                  class="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-slate-100 transition cursor-pointer"
                >${renderIcon('edit-3', 'w-3.5 h-3.5')}</button>
                <button
                  type="button"
                  data-action="delete-expense-item"
                  data-id="${escapeHTML(it.id)}"
                  aria-label="Hapus pengeluaran"
                  class="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                >${renderIcon('trash-2', 'w-3.5 h-3.5')}</button>
              </div>
            </div>
          `
          )
          .join('');
      };

      renderExpenseModalList();

      formEl?.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = titleInput instanceof HTMLInputElement ? titleInput.value.trim() : '';
        const amount = Number(amountInput instanceof HTMLInputElement ? amountInput.value : '');

        if (!title) {
          showToast('Masukkan keterangan keperluan pengeluaran.', 'error');
          if (titleInput instanceof HTMLInputElement) titleInput.focus();
          return;
        }
        if (!Number.isFinite(amount) || amount === 0) {
          showToast('Masukkan nominal pengeluaran yang valid (tidak boleh 0).', 'error');
          if (amountInput instanceof HTMLInputElement) amountInput.focus();
          return;
        }

        const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        if (editingItemId) {
          const targetItem = items.find((it) => it.id === editingItemId);
          if (targetItem) {
            targetItem.title = title;
            targetItem.amount = amount;
            targetItem.time = timeStr;
          }
          showToast(`Pengeluaran "${title}" diperbarui.`, 'success');
        } else {
          items.unshift({
            id: `EXP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            title,
            amount,
            time: timeStr
          });
          showToast(`Ditambahkan: ${title} (${formatRupiah(amount)}).`, 'success');
        }

        resetFormMode();
        syncExpenseToState();
        renderExpenseModalList();
        if (titleInput instanceof HTMLInputElement) titleInput.focus();
      });

      cancelEditBtn?.addEventListener('click', () => {
        resetFormMode();
        if (titleInput instanceof HTMLInputElement) titleInput.focus();
      });

      listEl?.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
        if (!target) return;
        const action = target.getAttribute('data-action');
        const id = target.getAttribute('data-id');
        if (!id) return;

        if (action === 'delete-expense-item') {
          items = items.filter((it) => it.id !== id);
          if (editingItemId === id) resetFormMode();
          syncExpenseToState();
          renderExpenseModalList();
          showToast('Item pengeluaran dihapus.', 'info');
        } else if (action === 'edit-expense-item') {
          const item = items.find((it) => it.id === id);
          if (!item) return;
          editingItemId = item.id;
          if (headingEl) headingEl.textContent = 'Ubah Pengeluaran';
          if (submitBtnLabel) submitBtnLabel.textContent = 'Simpan Perubahan';
          cancelEditBtn?.classList.remove('hidden');
          if (titleInput instanceof HTMLInputElement) {
            titleInput.value = item.title;
            titleInput.focus();
          }
          if (amountInput instanceof HTMLInputElement) {
            amountInput.value = String(item.amount);
          }
        }
      });

      resetAllBtn?.addEventListener('click', () => {
        items = [];
        resetFormMode();
        syncExpenseToState();
        renderExpenseModalList();
        showToast(`Semua pengeluaran Hari #${targetDay} telah dihapus.`, 'info');
      });

      document.getElementById('cancel-edit-income-btn')?.addEventListener('click', closeModal);
    }
  });
}
