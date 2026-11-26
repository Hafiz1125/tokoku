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

export function parseRestockItemInfo(trx, products = []) {
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

export const CALENDAR_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const ID_MONTH_MAP = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  mei: 5,
  may: 5,
  jun: 6,
  jul: 7,
  agu: 8,
  aug: 8,
  sep: 9,
  okt: 10,
  oct: 10,
  nov: 11,
  des: 12,
  dec: 12
};

function parseIndonesianDateToKey(dateStr) {
  const match = String(dateStr || '')
    .trim()
    .match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return '';
  const day = parseInt(match[1], 10);
  const month = ID_MONTH_MAP[match[2].toLowerCase()];
  const year = parseInt(match[3], 10);
  if (!day || !month || !year) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateKeyToShort(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return '';
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  const parsed = new Date(y, m - 1, d, 12, 0, 0);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function shiftDateKey(dateKey, deltaDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return '';
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  const shifted = new Date(y, m - 1, d + deltaDays, 12, 0, 0);
  return getLocalDateKey(shifted);
}

export function buildDayDateIndex(appState) {
  const session = appState.dailySession;
  const dayNumbers = new Set([session.dayNumber]);
  const dayToDateKey = new Map();

  if (session.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(session.dateKey)) {
    dayToDateKey.set(session.dayNumber, session.dateKey);
  }

  (appState.dailyHistoryArchive || []).forEach((a) => {
    const d = Number(a.dayNumber);
    if (!Number.isFinite(d) || d < 1) return;
    dayNumbers.add(d);
    if (!dayToDateKey.has(d)) {
      const key =
        a.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(a.dateKey)
          ? a.dateKey
          : parseIndonesianDateToKey(a.date);
      if (key) dayToDateKey.set(d, key);
    }
  });

  (appState.transactions || []).forEach((t) => {
    const d = t.dayNumber || 1;
    dayNumbers.add(d);
    if (!dayToDateKey.has(d) && t.date) {
      const key = parseIndonesianDateToKey(t.date);
      if (key) dayToDateKey.set(d, key);
    }
  });

  if (appState.dailyAdjustments && typeof appState.dailyAdjustments === 'object') {
    Object.keys(appState.dailyAdjustments).forEach((k) => {
      const n = Number(k);
      if (Number.isFinite(n) && n >= 1) dayNumbers.add(n);
    });
  }

  const anchorKey = dayToDateKey.get(session.dayNumber) || getLocalDateKey();
  dayNumbers.forEach((d) => {
    if (!dayToDateKey.has(d) && anchorKey) {
      dayToDateKey.set(d, shiftDateKey(anchorKey, d - session.dayNumber));
    }
  });

  const sortedDaysAsc = Array.from(dayNumbers).sort((a, b) => a - b);
  const sortedDaysDesc = [...sortedDaysAsc].reverse();

  const dateKeyToDay = new Map();
  const dayDateLabelMap = new Map();
  sortedDaysAsc.forEach((d) => {
    const key = dayToDateKey.get(d);
    if (key) {
      dateKeyToDay.set(key, d);
      dayDateLabelMap.set(d, formatDateKeyToShort(key));
    }
  });

  return { dayNumbers, sortedDaysAsc, sortedDaysDesc, dayToDateKey, dateKeyToDay, dayDateLabelMap };
}

function getSelectionDateLabel(selectedFilter, session, dayDateLabelMap) {
  if (selectedFilter === 'ALL') {
    return 'Semua Tanggal';
  }
  const targetDay =
    selectedFilter === 'CURRENT' ? session.dayNumber : Number(selectedFilter) || session.dayNumber;
  const dateLabel = dayDateLabelMap.get(targetDay) || formatDateKeyToShort(session.dateKey || getLocalDateKey());
  return dateLabel || `Hari #${targetDay}`;
}

function getSelectionDayNumberLabel(selectedFilter, session) {
  if (selectedFilter === 'ALL') {
    return 'Semua Hari';
  }
  const targetDay =
    selectedFilter === 'CURRENT' ? session.dayNumber : Number(selectedFilter) || session.dayNumber;
  return targetDay === session.dayNumber ? `Hari #${targetDay} (Aktif)` : `Hari #${targetDay}`;
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

  const { dayNumbers: recordedDays, sortedDaysAsc, sortedDaysDesc, dayToDateKey, dayDateLabelMap } =
    buildDayDateIndex(appState);

  if (dayFilterEl instanceof HTMLSelectElement) {
    const prevVal = dayFilterEl.value || 'CURRENT';
    const currentDateLabel = dayDateLabelMap.get(session.dayNumber) || formatDateKeyToShort(session.dateKey || getLocalDateKey());

    dayFilterEl.innerHTML = `
      <option value="CURRENT">${escapeHTML(currentDateLabel)}</option>
      <option value="ALL">Semua Tanggal</option>
      ${sortedDaysDesc
        .filter((d) => d !== session.dayNumber)
        .map((d) => {
          const dt = dayDateLabelMap.get(d) || `Hari #${d}`;
          return `<option value="${d}">${escapeHTML(dt)}</option>`;
        })
        .join('')}
    `;
    if ([...dayFilterEl.options].some((o) => o.value === prevVal)) {
      dayFilterEl.value = prevVal;
    }
  }

  const selectedFilter = dayFilterEl instanceof HTMLSelectElement ? dayFilterEl.value : 'CURRENT';
  const pickerDateLabel = getSelectionDateLabel(selectedFilter, session, dayDateLabelMap);
  const pickerDayLabel = getSelectionDayNumberLabel(selectedFilter, session);
  const monthlyPickerLabelEl = document.getElementById('monthly-day-picker-label');
  const laporanPickerLabelEl = document.getElementById('laporan-day-picker-label');
  const monthlySelectedDayEl = document.getElementById('monthly-selected-day-label');
  const laporanSelectedDayEl = document.getElementById('laporan-selected-day-label');
  if (monthlyPickerLabelEl) monthlyPickerLabelEl.textContent = pickerDateLabel;
  if (laporanPickerLabelEl) laporanPickerLabelEl.textContent = pickerDateLabel;
  if (monthlySelectedDayEl) monthlySelectedDayEl.textContent = pickerDayLabel;
  if (laporanSelectedDayEl) laporanSelectedDayEl.textContent = pickerDayLabel;

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
      statusPill.textContent = `Toko Buka · Hari #${session.dayNumber}`;
    } else {
      statusPill.className = 'text-xs font-bold text-rose-700';
      statusPill.textContent = `Toko Tutup · Hari #${session.dayNumber}`;
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

  const selectedMonthlyDay =
    selectedFilter === 'CURRENT' || selectedFilter === 'ALL'
      ? session.dayNumber
      : Number(selectedFilter) || session.dayNumber;

  const anchorDateKey = dayToDateKey.get(selectedMonthlyDay) || session.dateKey || getLocalDateKey();
  const targetYear = anchorDateKey ? anchorDateKey.slice(0, 4) : String(new Date().getFullYear());
  const targetMonthKey = anchorDateKey ? anchorDateKey.slice(0, 7) : getLocalDateKey().slice(0, 7);
  const targetMonthIdx = Math.max(0, Math.min(11, (parseInt(targetMonthKey.slice(5, 7), 10) || 1) - 1));
  const targetMonthLabel = `${CALENDAR_MONTH_NAMES[targetMonthIdx]} ${targetYear}`;

  let allTimeSales = 0;
  let allTimeExpense = 0;
  let allTimeRestock = 0;
  let allTimeRestockQty = 0;
  const allTimeRestockItems = new Set();

  let monthSales = 0;
  let monthGrossProfit = 0;
  let monthExpense = 0;
  let monthRestock = 0;
  let monthRestockQty = 0;
  const monthRestockItems = new Set();

  appState.transactions.forEach((trx) => {
    const tDay = trx.dayNumber || 1;
    const tDateKey = dayToDateKey.get(tDay) || '';
    const isTargetMonth = tDateKey.startsWith(targetMonthKey);

    if (trx.type === 'SALE') {
      const amt = Number(trx.amount) || 0;
      const prf = Number(trx.profit) || 0;
      allTimeSales += amt;
      if (isTargetMonth) {
        monthSales += amt;
        monthGrossProfit += prf;
      }
    } else if (trx.type === 'RESTOCK') {
      const amt = Number(trx.amount) || 0;
      const info = parseRestockItemInfo(trx, appState.products);
      allTimeRestock += amt;
      allTimeRestockQty += info.qty;
      allTimeRestockItems.add(info.key);
      if (isTargetMonth) {
        monthRestock += amt;
        monthRestockQty += info.qty;
        monthRestockItems.add(info.key);
      }
    }
  });

  if (appState.dailyAdjustments && typeof appState.dailyAdjustments === 'object') {
    Object.entries(appState.dailyAdjustments).forEach(([k, adj]) => {
      const dayNum = Number(k);
      const exp = Number(adj?.expense) || 0;
      allTimeExpense += exp;
      const dDateKey = Number.isFinite(dayNum) ? dayToDateKey.get(dayNum) || '' : '';
      if (dDateKey.startsWith(targetMonthKey)) {
        monthExpense += exp;
      }
    });
  }

  const allTimeNetIncome = allTimeSales - allTimeExpense;
  const monthNetIncome = monthSales - monthExpense;
  const monthNetProfit = monthGrossProfit - monthExpense;

  const daysBadge = document.getElementById('monthly-days-badge');
  if (daysBadge) daysBadge.textContent = `Total ${recordedDays.size} Hari Tercatat`;

  const monthlyDaySelect = document.getElementById('monthly-day-select');
  if (monthlyDaySelect instanceof HTMLSelectElement) {
    const dayOptions = sortedDaysAsc.map((d) => {
      const val = d === session.dayNumber ? 'CURRENT' : String(d);
      const dt = dayDateLabelMap.get(d) || `Hari #${d}`;
      return `<option value="${val}">${escapeHTML(dt)}</option>`;
    });
    dayOptions.push('<option value="ALL">Semua Tanggal</option>');
    monthlyDaySelect.innerHTML = dayOptions.join('');

    if ([...monthlyDaySelect.options].some((o) => o.value === selectedFilter)) {
      monthlyDaySelect.value = selectedFilter;
    } else {
      monthlyDaySelect.value = 'CURRENT';
    }
  }

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

  const dailySummarySection = document.getElementById('daily-summary-section');
  const dailySectionHeading = document.getElementById('daily-section-heading');
  const dailySectionDayTag = document.getElementById('daily-section-day-tag');
  if (dailySummarySection) {
    dailySummarySection.classList.remove('hidden');
  }
  const selectedDateShort = dayDateLabelMap.get(selectedMonthlyDay) || '';
  if (dailySectionHeading) {
    dailySectionHeading.textContent = isAllDays
      ? 'Rekap Gabungan Semua Tanggal'
      : selectedDateShort
        ? `Laporan Harian — ${selectedDateShort}`
        : 'Laporan Harian';
  }
  if (dailySectionDayTag) {
    dailySectionDayTag.textContent = isAllDays
      ? `Total ${recordedDays.size} Hari`
      : selectedMonthlyDay === session.dayNumber
        ? `Hari #${selectedMonthlyDay} (Aktif)`
        : `Hari #${selectedMonthlyDay}`;
  }

  const mTodayLabel = document.getElementById('monthly-today-income-label');
  const mTodayIncome = document.getElementById('monthly-today-income');
  const mTodayNote = document.getElementById('monthly-today-income-note');
  const displayNetIncome = isAllDays ? allTimeNetIncome : netTodayIncome;
  const displaySales = isAllDays ? allTimeSales : selectedMonthlyDaySales;
  const displayExpense = isAllDays ? allTimeExpense : todayExpense;

  if (mTodayLabel) {
    mTodayLabel.textContent = isAllDays
      ? 'Pemasukan Bersih Semua Hari'
      : selectedMonthlyDay === session.dayNumber
        ? `Pemasukan Bersih Hari #${selectedMonthlyDay} (Aktif)`
        : `Pemasukan Bersih Hari #${selectedMonthlyDay}`;
  }
  if (mTodayIncome) {
    mTodayIncome.textContent = formatRupiah(displayNetIncome);
    mTodayIncome.className = `text-xl sm:text-2xl font-extrabold font-mono tabular-nums mt-1 block whitespace-nowrap ${
      displayNetIncome >= 0 ? 'text-emerald-300' : 'text-rose-300'
    }`;
  }
  if (mTodayNote) {
    if (displayExpense > 0) {
      mTodayNote.textContent = `Omzet ${formatRupiah(displaySales)} - ${formatRupiah(displayExpense)}`;
    } else if (displayExpense < 0) {
      mTodayNote.textContent = `Omzet ${formatRupiah(displaySales)} + ${formatRupiah(
        Math.abs(displayExpense)
      )}`;
    } else {
      mTodayNote.textContent = isAllDays
        ? `Akumulasi ${recordedDays.size} hari operasional`
        : `Sesuai omzet Hari #${selectedMonthlyDay}`;
    }
  }

  const mExpenseLabel = document.getElementById('monthly-expense-label');
  const mExpense = document.getElementById('monthly-today-expense');
  const mExpenseNote = document.getElementById('monthly-today-expense-note');
  const expenseActionsEl = document.getElementById('daily-expense-actions');
  if (expenseActionsEl) {
    expenseActionsEl.classList.toggle('hidden', isAllDays);
  }

  if (mExpenseLabel) {
    mExpenseLabel.textContent = isAllDays
      ? 'Total Uang Keluar'
      : selectedMonthlyDay === session.dayNumber
        ? `Uang Keluar Hari #${selectedMonthlyDay} (Aktif)`
        : `Uang Keluar Hari #${selectedMonthlyDay}`;
  }
  if (mExpense) {
    if (displayExpense > 0) {
      mExpense.textContent = `- ${formatRupiah(displayExpense)}`;
      mExpense.className =
        'text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-rose-300 mt-1 block whitespace-nowrap';
    } else if (displayExpense < 0) {
      mExpense.textContent = `+ ${formatRupiah(Math.abs(displayExpense))}`;
      mExpense.className =
        'text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-300 mt-1 block whitespace-nowrap';
    } else {
      mExpense.textContent = formatRupiah(0);
      mExpense.className =
        'text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-amber-300 mt-1 block whitespace-nowrap';
    }
  }
  if (mExpenseNote) {
    if (isAllDays) {
      mExpenseNote.textContent = 'Total pengeluaran harian gabungan';
    } else {
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
  }

  const mRestockLabel = document.getElementById('monthly-restock-label');
  const mRestock = document.getElementById('monthly-total-restock');
  const mRestockNote = document.getElementById('monthly-restock-note');
  const displayRestock = isAllDays ? allTimeRestock : selectedDayRestock;
  const displayRestockItemCount = isAllDays ? allTimeRestockItems.size : selectedDayRestockItems.size;
  const displayRestockQty = isAllDays ? allTimeRestockQty : selectedDayRestockQty;

  if (mRestockLabel) {
    mRestockLabel.textContent = isAllDays
      ? 'Total Belanja Restock'
      : selectedMonthlyDay === session.dayNumber
        ? `Belanja Restock Hari #${selectedMonthlyDay} (Aktif)`
        : `Belanja Restock Hari #${selectedMonthlyDay}`;
  }
  if (mRestock) mRestock.textContent = formatRupiah(displayRestock);
  if (mRestockNote) {
    mRestockNote.textContent =
      displayRestockItemCount > 0
        ? `${displayRestockItemCount} item · ${displayRestockQty} unit masuk`
        : isAllDays
          ? 'Belum ada catatan belanja restock'
          : `Belum ada restock pada Hari #${selectedMonthlyDay}`;
  }

  // Baris 2: Rekap Bulan Terpilih (Pemasukan, Keuntungan, Belanja Restock)
  const monthlySectionHeading = document.getElementById('monthly-section-heading');
  if (monthlySectionHeading) {
    monthlySectionHeading.textContent = `Rekap Bulan ${targetMonthLabel}`;
  }

  const mSalesLabel = document.getElementById('monthly-total-sales-label');
  const mSales = document.getElementById('monthly-total-sales');
  const mSalesNote = document.getElementById('monthly-total-sales-note');
  if (mSalesLabel) mSalesLabel.textContent = `Pemasukan Bulan ${targetMonthLabel}`;
  if (mSales) {
    mSales.textContent = formatRupiah(monthNetIncome);
    mSales.className = `text-lg sm:text-xl font-extrabold font-mono tabular-nums mt-1 block whitespace-nowrap ${
      monthNetIncome >= 0 ? 'text-white' : 'text-rose-300'
    }`;
  }
  if (mSalesNote) {
    if (monthExpense > 0) {
      mSalesNote.textContent = `Omzet ${formatRupiah(monthSales)} - Keluar ${formatRupiah(monthExpense)}`;
    } else if (monthExpense < 0) {
      mSalesNote.textContent = `Omzet ${formatRupiah(monthSales)} + ${formatRupiah(Math.abs(monthExpense))}`;
    } else {
      mSalesNote.textContent = `Khusus bulan ${targetMonthLabel}`;
    }
  }

  const mProfitLabel = document.getElementById('monthly-total-profit-label');
  const mProfit = document.getElementById('monthly-total-profit');
  const mProfitNote = document.getElementById('monthly-total-profit-note');
  if (mProfitLabel) mProfitLabel.textContent = `Keuntungan Bulan ${targetMonthLabel}`;
  if (mProfit) {
    mProfit.textContent = formatRupiah(monthNetProfit);
    mProfit.className = `text-lg sm:text-xl font-extrabold font-mono tabular-nums mt-1 block whitespace-nowrap ${
      monthNetProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
    }`;
  }
  if (mProfitNote) {
    if (monthExpense > 0) {
      mProfitNote.textContent = `Laba jual ${formatRupiah(monthGrossProfit)} - Keluar ${formatRupiah(monthExpense)}`;
    } else if (monthExpense < 0) {
      mProfitNote.textContent = `Laba jual ${formatRupiah(monthGrossProfit)} + ${formatRupiah(Math.abs(monthExpense))}`;
    } else {
      mProfitNote.textContent = `Laba kotor penjualan ${targetMonthLabel}`;
    }
  }

  const mPeriodRestockLabel = document.getElementById('monthly-period-restock-label');
  const mAllRestock = document.getElementById('monthly-all-days-restock');
  const mAllRestockNote = document.getElementById('monthly-all-days-restock-note');
  if (mPeriodRestockLabel) mPeriodRestockLabel.textContent = `Belanja Restock ${targetMonthLabel}`;
  if (mAllRestock) mAllRestock.textContent = formatRupiah(monthRestock);
  if (mAllRestockNote) {
    mAllRestockNote.textContent =
      monthRestockItems.size > 0
        ? `${monthRestockItems.size} item · ${monthRestockQty} unit masuk`
        : `Belum ada restock di ${targetMonthLabel}`;
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
    const MAX_RENDERED_TRX = 150;
    const visibleTransactions = filteredTransactions.slice(0, MAX_RENDERED_TRX);
    const hiddenTrxCount = filteredTransactions.length - visibleTransactions.length;
    const trxHTML = visibleTransactions
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
          iconName = 'edit-3';
          typeLabel = 'ATUR STOK';
          typeTextClass = 'text-slate-700';
          rightAmountHTML = `<div class="font-bold text-slate-700 text-xs">Penyesuaian Stok</div><div class="text-[11px] text-slate-500">Non-kas</div>`;
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
    const moreTrxNotice =
      hiddenTrxCount > 0
        ? `<p class="py-3 text-center text-xs text-slate-500">Menampilkan ${visibleTransactions.length} transaksi terbaru dari ${filteredTransactions.length} transaksi. Pilih tanggal tertentu di kalender atau klik Unduh CSV untuk melihat semua.</p>`
        : '';
    listEl.innerHTML = trxHTML + moreTrxNotice;
  }

  const archiveEl = document.getElementById('daily-archive-list');
  if (archiveEl) {
    if (!appState.dailyHistoryArchive || appState.dailyHistoryArchive.length === 0) {
      archiveEl.innerHTML = `<p class="text-sm text-slate-500 text-center py-6">Belum ada arsip laporan tutup toko. Gunakan tombol Rekap &amp; Tutup Toko di akhir hari untuk mengarsipkan.</p>`;
    } else {
      const MAX_ARCHIVE_ROWS = 60;
      const visibleArchives = appState.dailyHistoryArchive.slice(0, MAX_ARCHIVE_ROWS);
      const hiddenArcCount = appState.dailyHistoryArchive.length - visibleArchives.length;
      const archiveHTML = visibleArchives
        .map((arc) => {
          const netChange = arc.closingCash - arc.openingCash;
          const salesInfo =
            typeof arc.totalSales === 'number'
              ? ` &middot; Omzet: ${formatRupiah(arc.totalSales)} &middot; Laba: ${formatRupiah(arc.totalProfit || 0)}`
              : '';
          const arcTz = escapeHTML(arc.timezone || getLocalTimezoneCode());
          const arcDateHTML = arc.date
            ? `<span class="font-bold text-slate-900">${escapeHTML(arc.date)}</span><span aria-hidden="true" class="text-slate-300">&middot;</span>`
            : '';
          return `
            <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
              <div>
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  ${arcDateHTML}
                  <span class="font-bold font-mono tabular-nums text-slate-700">Hari #${arc.dayNumber}</span>
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
      const moreArcNotice =
        hiddenArcCount > 0
          ? `<p class="py-3 text-center text-xs text-slate-500">Menampilkan ${visibleArchives.length} arsip hari terbaru dari total ${appState.dailyHistoryArchive.length} hari arsip. Pilih tanggal lama lewat tombol kalender di atas.</p>`
          : '';
      archiveEl.innerHTML = archiveHTML + moreArcNotice;
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
          dateKey: appState.dailySession.dateKey || getLocalDateKey(closeNow),
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

  const resolvedDateKey = meta.dateKey || appState.dailySession?.dateKey || getLocalDateKey();
  const resolvedDateLabel = formatDateKeyToShort(resolvedDateKey);

  const entry = {
    dayNumber,
    dateKey: resolvedDateKey,
    ...(resolvedDateLabel ? { date: resolvedDateLabel } : {}),
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
    dateKey: session.dateKey,
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

const FULL_MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
];

export function openCalendarDayPickerModal(ctx) {
  const { appState } = ctx;
  const session = appState.dailySession;
  const { dayNumbers, dayToDateKey, dateKeyToDay, dayDateLabelMap } = buildDayDateIndex(appState);

  const dayFilterEl = document.getElementById('laporan-day-filter');
  const monthlySelectEl = document.getElementById('monthly-day-select');
  const currentSelection =
    (dayFilterEl instanceof HTMLSelectElement ? dayFilterEl.value : '') ||
    (monthlySelectEl instanceof HTMLSelectElement ? monthlySelectEl.value : '') ||
    'CURRENT';

  const todayKey = session.dateKey || getLocalDateKey();
  const currentMonthYearMatch = String(todayKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const todayYear = currentMonthYearMatch ? parseInt(currentMonthYearMatch[1], 10) : new Date().getFullYear();
  const todayMonthIdx = currentMonthYearMatch ? parseInt(currentMonthYearMatch[2], 10) - 1 : new Date().getMonth();

  const selectedDayNum =
    currentSelection === 'ALL'
      ? null
      : currentSelection === 'CURRENT'
        ? session.dayNumber
        : Number(currentSelection) || session.dayNumber;
  const selectedDateKey = selectedDayNum ? dayToDateKey.get(selectedDayNum) || todayKey : '';
  const initialMatch = String(selectedDateKey || todayKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  let displayYear = initialMatch ? parseInt(initialMatch[1], 10) : todayYear;
  let displayMonth = initialMatch ? parseInt(initialMatch[2], 10) - 1 : todayMonthIdx;
  let viewMode = 'month'; // 'month' | 'year'

  const applyFilterChoice = (value) => {
    if (dayFilterEl instanceof HTMLSelectElement) dayFilterEl.value = value;
    if (monthlySelectEl instanceof HTMLSelectElement) monthlySelectEl.value = value;
    closeModal();
    renderDailyTransactions(ctx);
  };

  const renderMonthViewHTML = () => {
    const firstWeekday = new Date(displayYear, displayMonth, 1).getDay();
    const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
    const weekdayHeaders = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
      .map(
        (w, i) =>
          `<div class="text-center text-[11px] font-bold py-1 ${
            i === 0 ? 'text-rose-600' : 'text-slate-500'
          }">${w}</div>`
      )
      .join('');

    const emptyCells = Array.from({ length: firstWeekday }, () => '<div aria-hidden="true"></div>').join('');
    let recordedInMonth = 0;

    const dayCells = Array.from({ length: daysInMonth }, (_, idx) => {
      const day = idx + 1;
      const dateKey = `${displayYear}-${String(displayMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const recordedDay = dateKeyToDay.get(dateKey);
      const isToday = dateKey === todayKey;
      const isSelected = currentSelection !== 'ALL' && dateKey === selectedDateKey;

      if (recordedDay) {
        recordedInMonth++;
        const dateTitle = dayDateLabelMap.get(recordedDay) || dateKey;
        const activeLabel = recordedDay === session.dayNumber ? ' (Aktif)' : '';
        let cellClasses =
          'min-h-[46px] sm:min-h-[50px] rounded-xl flex flex-col items-center justify-center gap-1 transition cursor-pointer tabular-nums ';
        let dotHTML = '<span class="w-1.5 h-1.5 rounded-full bg-teal-600"></span>';

        if (isSelected) {
          cellClasses += 'bg-teal-700 text-white shadow-xs hover:bg-teal-800';
          if (isToday) cellClasses += ' ring-2 ring-amber-400';
          dotHTML = '<span class="w-1.5 h-1.5 rounded-full bg-teal-100"></span>';
        } else if (isToday) {
          cellClasses += 'bg-rose-50 text-rose-700 ring-2 ring-rose-500 hover:bg-rose-100';
          dotHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-600"></span>';
        } else {
          cellClasses += 'bg-slate-50 hover:bg-teal-50 text-slate-900 border border-slate-200 hover:border-teal-300';
        }

        return `
          <button
            type="button"
            data-cal-day="${recordedDay}"
            title="${escapeHTML(dateTitle)} · Hari #${recordedDay}${activeLabel}"
            aria-label="Pilih ${escapeHTML(dateTitle)} (Hari #${recordedDay})"
            class="${cellClasses}"
          >
            <span class="text-sm font-bold leading-none">${day}</span>
            ${dotHTML}
          </button>
        `;
      }

      return `
        <div class="min-h-[46px] sm:min-h-[50px] rounded-xl flex items-center justify-center text-sm text-slate-300 tabular-nums select-none">
          ${day}
        </div>
      `;
    }).join('');

    return `
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              id="cal-prev-month-btn"
              aria-label="Bulan sebelumnya"
              class="min-w-[38px] min-h-[38px] inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >${renderIcon('chevron-left', 'w-4 h-4')}</button>
            <button
              type="button"
              id="cal-zoom-year-btn"
              title="Lihat ringkasan 12 bulan"
              class="px-3 py-1.5 min-h-[38px] rounded-xl text-base sm:text-lg font-extrabold text-slate-900 hover:bg-slate-100 transition cursor-pointer whitespace-nowrap"
            >${FULL_MONTH_NAMES_ID[displayMonth]} ${displayYear}</button>
            <button
              type="button"
              id="cal-next-month-btn"
              aria-label="Bulan berikutnya"
              class="min-w-[38px] min-h-[38px] inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >${renderIcon('chevron-right', 'w-4 h-4')}</button>
          </div>
          <span class="text-xs font-medium text-slate-500 whitespace-nowrap">${recordedInMonth} hari ada data</span>
        </div>

        <div class="grid grid-cols-7 gap-1.5">
          ${weekdayHeaders}
          ${emptyCells}
          ${dayCells}
        </div>
      </div>
    `;
  };

  const renderYearViewHTML = () => {
    const miniWeekdays = ['M', 'S', 'S', 'R', 'K', 'J', 'S']
      .map((w, i) => `<span class="${i === 0 ? 'text-rose-500' : 'text-slate-400'} font-bold">${w}</span>`)
      .join('');

    const monthsHTML = CALENDAR_MONTH_NAMES.map((monthName, monthIdx) => {
      const firstWeekday = new Date(displayYear, monthIdx, 1).getDay();
      const daysInMonth = new Date(displayYear, monthIdx + 1, 0).getDate();
      const isCurrentRealMonth = displayYear === todayYear && monthIdx === todayMonthIdx;
      const monthKeyPrefix = `${displayYear}-${String(monthIdx + 1).padStart(2, '0')}-`;
      let monthRecordedCount = 0;

      const emptyCells = Array.from({ length: firstWeekday }, () => '<span aria-hidden="true"></span>').join('');
      const dayCells = Array.from({ length: daysInMonth }, (_, idx) => {
        const day = idx + 1;
        const dateKey = `${monthKeyPrefix}${String(day).padStart(2, '0')}`;
        const recordedDay = dateKeyToDay.get(dateKey);
        const isToday = dateKey === todayKey;
        const isSelected = currentSelection !== 'ALL' && dateKey === selectedDateKey;

        if (recordedDay) {
          monthRecordedCount++;
          const dateTitle = dayDateLabelMap.get(recordedDay) || dateKey;
          const activeLabel = recordedDay === session.dayNumber ? ' (Aktif)' : '';
          let cellClass =
            'w-6 h-6 mx-auto rounded-full flex flex-col items-center justify-center relative transition cursor-pointer ';
          let dotHTML = '';

          if (isSelected) {
            cellClass += 'bg-teal-700 text-white font-bold shadow-xs';
          } else if (isToday) {
            cellClass += 'ring-1 ring-rose-500 text-rose-600 font-bold hover:bg-rose-50';
          } else {
            cellClass += 'text-slate-800 font-semibold hover:bg-teal-50 hover:text-teal-800';
            dotHTML = '<span class="w-1 h-1 rounded-full bg-teal-600 absolute bottom-0.5"></span>';
          }

          return `<button type="button" data-cal-day="${recordedDay}" title="Hari #${recordedDay}${activeLabel} · ${escapeHTML(
            dateTitle
          )}" aria-label="Pilih Hari #${recordedDay} (${escapeHTML(dateTitle)})" class="${cellClass}"><span>${day}</span>${dotHTML}</button>`;
        }

        const plainClasses = isToday
          ? 'w-6 h-6 mx-auto rounded-full flex items-center justify-center text-rose-600 ring-1 ring-rose-400 font-bold'
          : 'w-6 h-6 mx-auto rounded-full flex items-center justify-center text-slate-300';
        return `<span class="${plainClasses}">${day}</span>`;
      }).join('');

      return `
        <div class="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50">
          <button
            type="button"
            data-cal-month="${monthIdx}"
            class="w-full flex items-center justify-between gap-2 mb-1.5 text-left group cursor-pointer"
          >
            <span class="text-sm font-extrabold ${
              isCurrentRealMonth ? 'text-rose-600' : 'text-slate-900 group-hover:text-teal-700'
            }">${monthName}</span>
            <span class="text-[10px] font-mono tabular-nums text-slate-500">${monthRecordedCount} hr</span>
          </button>
          <div class="grid grid-cols-7 gap-y-0.5 text-center text-[9px] mb-1">
            ${miniWeekdays}
          </div>
          <div class="grid grid-cols-7 gap-y-0.5 text-center text-[11px] leading-none tabular-nums">
            ${emptyCells}
            ${dayCells}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              id="cal-prev-year-btn"
              aria-label="Tahun sebelumnya"
              class="min-w-[38px] min-h-[38px] inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >${renderIcon('chevron-left', 'w-4 h-4')}</button>
            <span class="px-2 text-xl font-extrabold text-rose-600 tracking-tight tabular-nums">${displayYear}</span>
            <button
              type="button"
              id="cal-next-year-btn"
              aria-label="Tahun berikutnya"
              class="min-w-[38px] min-h-[38px] inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >${renderIcon('chevron-right', 'w-4 h-4')}</button>
          </div>
          <span class="text-xs text-slate-500">Klik nama bulan atau tanggal yang bertanda titik</span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          ${monthsHTML}
        </div>
      </div>
    `;
  };

  const renderCalendarMarkup = () => {
    const dateSummary = getSelectionDateLabel(currentSelection, session, dayDateLabelMap);
    const daySummary = getSelectionDayNumberLabel(currentSelection, session);
    const isAllActive = currentSelection === 'ALL';
    const isTodayActive = currentSelection === 'CURRENT' || Number(currentSelection) === session.dayNumber;

    return `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 class="text-base sm:text-lg font-bold text-slate-900">Pilih Tanggal Laporan</h3>
            <p class="text-xs text-slate-500">${dayNumbers.size} hari operasional tercatat</p>
          </div>
          <div class="flex items-center gap-2">
            <div class="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
              <button
                type="button"
                id="cal-mode-month-btn"
                class="px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  viewMode === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }"
              >Bulan</button>
              <button
                type="button"
                id="cal-mode-year-btn"
                class="px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  viewMode === 'year' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }"
              >1 Tahun</button>
            </div>
            <button
              type="button"
              id="cal-close-btn"
              aria-label="Tutup kalender"
              class="min-w-[38px] min-h-[38px] inline-flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            >${renderIcon('x', 'w-5 h-5')}</button>
          </div>
        </div>

        ${viewMode === 'month' ? renderMonthViewHTML() : renderYearViewHTML()}

        <div class="pt-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            id="cal-today-btn"
            class="px-4 py-2 min-h-[40px] rounded-xl border text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              isTodayActive
                ? 'bg-teal-700 border-teal-700 text-white'
                : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
            }"
          >Hari Ini</button>

          <div class="text-xs text-center flex items-center justify-center gap-2">
            <span class="font-bold text-slate-900">${escapeHTML(dateSummary)}</span>
            <span aria-hidden="true" class="text-slate-300">&middot;</span>
            <span class="font-mono tabular-nums font-semibold text-slate-600">${escapeHTML(daySummary)}</span>
          </div>

          <button
            type="button"
            id="cal-all-btn"
            class="px-4 py-2 min-h-[40px] rounded-xl border text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
              isAllActive
                ? 'bg-teal-700 border-teal-700 text-white'
                : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
            }"
          >Semua Hari</button>
        </div>
      </div>
    `;
  };

  openModal({
    title: 'Kalender Laporan Toko',
    hideHeader: true,
    panelClass:
      'bg-white text-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full p-5 sm:p-6 border border-slate-200 tab-panel max-h-[92vh] overflow-y-auto',
    bodyHTML: renderCalendarMarkup(),
    onMount: ({ bodyEl }) => {
      const redraw = () => {
        bodyEl.innerHTML = renderCalendarMarkup();
        bindCalendarHandlers();
      };

      const bindCalendarHandlers = () => {
        bodyEl.querySelector('#cal-mode-month-btn')?.addEventListener('click', () => {
          viewMode = 'month';
          redraw();
        });
        bodyEl.querySelector('#cal-mode-year-btn')?.addEventListener('click', () => {
          viewMode = 'year';
          redraw();
        });
        bodyEl.querySelector('#cal-zoom-year-btn')?.addEventListener('click', () => {
          viewMode = 'year';
          redraw();
        });

        bodyEl.querySelector('#cal-prev-month-btn')?.addEventListener('click', () => {
          displayMonth -= 1;
          if (displayMonth < 0) {
            displayMonth = 11;
            displayYear -= 1;
          }
          redraw();
        });
        bodyEl.querySelector('#cal-next-month-btn')?.addEventListener('click', () => {
          displayMonth += 1;
          if (displayMonth > 11) {
            displayMonth = 0;
            displayYear += 1;
          }
          redraw();
        });

        bodyEl.querySelector('#cal-prev-year-btn')?.addEventListener('click', () => {
          displayYear -= 1;
          redraw();
        });
        bodyEl.querySelector('#cal-next-year-btn')?.addEventListener('click', () => {
          displayYear += 1;
          redraw();
        });

        bodyEl.querySelector('#cal-close-btn')?.addEventListener('click', closeModal);
        bodyEl.querySelector('#cal-today-btn')?.addEventListener('click', () => applyFilterChoice('CURRENT'));
        bodyEl.querySelector('#cal-all-btn')?.addEventListener('click', () => applyFilterChoice('ALL'));

        bodyEl.querySelectorAll('[data-cal-month]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const m = Number(btn.getAttribute('data-cal-month'));
            if (Number.isFinite(m) && m >= 0 && m <= 11) {
              displayMonth = m;
              viewMode = 'month';
              redraw();
            }
          });
        });

        bodyEl.querySelectorAll('[data-cal-day]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const rawDay = btn.getAttribute('data-cal-day');
            if (!rawDay) return;
            const dayNum = Number(rawDay);
            applyFilterChoice(dayNum === session.dayNumber ? 'CURRENT' : String(dayNum));
          });
        });
      };

      bindCalendarHandlers();
    }
  });
}
