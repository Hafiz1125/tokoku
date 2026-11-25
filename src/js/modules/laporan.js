import { renderIcon } from '../icons.js';
import { normalizeState } from '../storage.js';
import { closeModal, openModal, showToast } from '../ui.js';
import { downloadFile, escapeHTML, formatRupiah } from '../utils.js';

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
  appState.transactions.forEach((t) => dayNumbers.add(t.dayNumber || 1));
  appState.dailyHistoryArchive.forEach((a) => dayNumbers.add(a.dayNumber));
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

    dayFilterEl.innerHTML = `
      <option value="CURRENT">Hari #${session.dayNumber} (Aktif)</option>
      <option value="ALL">Semua Hari (Gabungan Bulanan)</option>
      ${sortedDaysDesc
        .filter((d) => d !== session.dayNumber)
        .map((d) => `<option value="${d}">Riwayat Hari #${d}</option>`)
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
      openedInfo.textContent = `Dibuka pukul ${session.openedAt} WIB · Kas Awal: ${formatRupiah(session.openingCash)}`;
    } else {
      statusPill.className = 'text-xs font-bold text-rose-700';
      statusPill.textContent = `Hari #${session.dayNumber} · Toko Tutup`;
      openedInfo.textContent = `Ditutup pukul ${session.closedAt || '-'} WIB · Buka hari baru untuk mencatat transaksi berikutnya`;
    }
  }

  if (actionBtn) {
    if (session.isOpen) {
      actionBtn.className =
        'inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white transition cursor-pointer whitespace-nowrap';
      actionBtn.innerHTML = `${renderIcon('moon', 'w-4 h-4 text-amber-400')}<span>Rekap &amp; Tutup Toko</span>`;
    } else {
      actionBtn.className =
        'inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white transition cursor-pointer whitespace-nowrap';
      actionBtn.innerHTML = `${renderIcon('sun', 'w-4 h-4 text-amber-300')}<span>Buka Toko Hari Baru</span>`;
    }
  }

  let monthlySales = 0;
  let monthlyRestock = 0;
  let monthlyProfit = 0;
  const recordedDays = new Set([session.dayNumber]);

  appState.transactions.forEach((trx) => {
    recordedDays.add(trx.dayNumber || 1);
    if (trx.type === 'SALE') {
      monthlySales += trx.amount;
      monthlyProfit += trx.profit;
    } else if (trx.type === 'RESTOCK') {
      monthlyRestock += trx.amount;
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
  const mRestock = document.getElementById('monthly-total-restock');
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
  if (mRestock) mRestock.textContent = formatRupiah(monthlyRestock);

  const monthlyDaySelect = document.getElementById('monthly-day-select');
  if (monthlyDaySelect instanceof HTMLSelectElement) {
    const dayOptions = sortedDaysAsc.map((d) => {
      const val = d === session.dayNumber ? 'CURRENT' : String(d);
      const label = d === session.dayNumber ? `Hari #${d} (Aktif)` : `Hari #${d}`;
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
  appState.transactions
    .filter((t) => (t.dayNumber || 1) === selectedMonthlyDay)
    .forEach((trx) => {
      if (trx.type === 'SALE') {
        selectedMonthlyDaySales += trx.amount;
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
    if (todayAdj?.note) {
      mExpenseNote.textContent = `Catatan: ${todayAdj.note}`;
    } else if (todayExpense > 0) {
      mExpenseNote.textContent = `Pengeluaran Hari #${selectedMonthlyDay}`;
    } else if (todayExpense < 0) {
      mExpenseNote.textContent = `Penambahan manual Hari #${selectedMonthlyDay}`;
    } else {
      mExpenseNote.textContent = 'Klik Edit untuk mencatat uang keluar';
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

  if (filteredTransactions.length === 0) {
    listEl.innerHTML = `<p class="text-sm text-slate-500 text-center py-8">Belum ada transaksi tercatat pada filter hari yang dipilih.</p>`;
  } else {
    listEl.innerHTML = filteredTransactions
      .map((trx) => {
        const isSale = trx.type === 'SALE';
        const isAudit = trx.type === 'AUDIT';
        const tDay = trx.dayNumber || 1;

        let iconWrapClass = 'bg-amber-100 text-amber-800';
        let iconName = 'arrow-up-right';
        let typeLabel = 'BELANJA STOK';
        let typeTextClass = 'text-amber-800';
        let rightAmountHTML = `<div class="font-extrabold font-mono tabular-nums text-rose-700">- ${formatRupiah(
          trx.amount
        )}</div><div class="text-[11px] text-slate-500">Modal Masuk Stok</div>`;

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
        } else if (trx.type === 'RESTOCK' && (Number(trx.amount) || 0) === 0) {
          iconWrapClass = 'bg-teal-100 text-teal-800';
          iconName = 'package';
          typeLabel = 'STOK MASUK';
          typeTextClass = 'text-teal-800';
          rightAmountHTML = `<div class="font-bold text-teal-700 text-xs">Tambah Stok</div><div class="text-[11px] text-slate-500">Non-kas (Grosir/Sales)</div>`;
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
          return `
            <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
              <div>
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <span class="font-bold font-mono tabular-nums text-slate-900">Hari #${arc.dayNumber}</span>
                  <span aria-hidden="true" class="text-slate-300">&middot;</span>
                  <span class="text-slate-600 font-mono tabular-nums">Buka ${escapeHTML(arc.openedAt)} &ndash; Tutup ${escapeHTML(
                    arc.closedAt
                  )} WIB</span>
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
  const expectedEndingCash = session.openingCash + totalSales - totalRestock - todayExpense;
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

  const bodyHTML = `
    <div class="space-y-3">
      <div class="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-950">
        <strong>Konsep Ilmiah Cash Reconciliation (Tutup Kasir):</strong><br />
        <code class="font-mono">Kas Akhir = Kas Awal Buka + Total Penjualan - Pengeluaran Restock - Uang Keluar</code>
      </div>
      <div class="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2 text-xs">
        <div class="flex justify-between">
          <span class="text-slate-600">Operasional Hari ke-${session.dayNumber} (Buka ${escapeHTML(session.openedAt)}):</span>
          <strong class="font-mono tabular-nums text-slate-900">${salesCount} Penjualan</strong>
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
          <span>(-) Pengeluaran Belanja Stok:</span>
          <strong class="font-mono tabular-nums">- ${formatRupiah(totalRestock)}</strong>
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
        Menutup toko akan mengarsipkan laporan hari ini dan mengunci kasir hingga Anda membuka toko pada hari berikutnya.
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
        const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const currentDay = appState.dailySession.dayNumber;
        appState.dailySession.isOpen = false;
        appState.dailySession.closedAt = nowStr;

        const dayTransactions = appState.transactions.filter((t) => (t.dayNumber || 1) === currentDay);
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

        appState.dailyHistoryArchive.unshift({
          dayNumber: currentDay,
          openedAt: appState.dailySession.openedAt,
          closedAt: nowStr,
          openingCash: appState.dailySession.openingCash,
          closingCash: appState.storeProfile.cashBalance,
          totalSales: daySales,
          totalRestock: dayRestock,
          totalProfit: dayProfit,
          dailyExpense: Number(appState.dailyAdjustments?.[String(currentDay)]?.expense) || 0,
          transactionCount: dayTransactions.length
        });

        closeModal();
        persistAndRefresh();
        awardXP(30, `Menyelesaikan rekap tutup toko Hari #${currentDay}`);
      });
    }
  });
}

export function openStartNewDayModal(ctx) {
  const { appState, persistAndRefresh } = ctx;
  const nextDay = (appState.dailySession?.dayNumber || 1) + 1;

  openModal({
    title: `Buka Operasional Toko — Hari #${nextDay}`,
    bodyHTML: `
      <p>Anda akan memulai operasional <strong>Hari #${nextDay}</strong> untuk <strong>${escapeHTML(
      appState.storeProfile.storeName
    )}</strong>.</p>
      <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
        <div>Saldo Kas Awal Laci: <strong class="font-mono tabular-nums">${formatRupiah(0)}</strong> (Direset ke 0 setiap buka toko)</div>
        <div>Log transaksi harian baru akan dimulai dari pukul sekarang.</div>
      </div>
    `,
    footerHTML: `
      <button type="button" id="cancel-new-day-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
        Batal
      </button>
      <button type="button" id="confirm-new-day-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer">
        Buka Toko Hari #${nextDay}
      </button>
    `,
    onMount: () => {
      document.getElementById('cancel-new-day-btn')?.addEventListener('click', closeModal);
      document.getElementById('confirm-new-day-btn')?.addEventListener('click', () => {
        appState.storeProfile.cashBalance = 0;
        appState.dailySession = {
          isOpen: true,
          dayNumber: nextDay,
          openedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          openingCash: 0,
          closedAt: null
        };
        closeModal();
        persistAndRefresh();
        showToast(`Toko resmi dibuka untuk Hari #${nextDay}! Kas toko direset menjadi Rp 0.`, 'success');
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

  const currentAdj = appState.dailyAdjustments?.[dayKey];
  const currentExpense = Number(currentAdj?.expense) || 0;
  const currentNetIncome = todaySales - currentExpense;

  openModal({
    title: `Edit Total Pemasukan — Hari #${targetDay}`,
    bodyHTML: `
      <div class="space-y-4">
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
          <span class="text-slate-600 font-medium">Total Omzet Penjualan Hari #${targetDay}:</span>
          <strong class="font-mono tabular-nums text-sm text-slate-900">${formatRupiah(todaySales)}</strong>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="edit-income-expense-input" class="block text-xs font-bold text-slate-700 mb-1">
              Uang Keluar / Kebutuhan (Rp)
            </label>
            <input
              type="number"
              id="edit-income-expense-input"
              step="500"
              value="${currentExpense}"
              class="w-full px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-xl text-sm font-mono tabular-nums font-semibold focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          <div>
            <label for="edit-income-total-input" class="block text-xs font-bold text-slate-700 mb-1">
              Total Pemasukan Hari #${targetDay} (Rp)
            </label>
            <input
              type="number"
              id="edit-income-total-input"
              step="500"
              value="${currentNetIncome}"
              class="w-full px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-xl text-sm font-mono tabular-nums font-bold text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
        </div>

        <div>
          <label for="edit-income-note-input" class="block text-xs font-bold text-slate-700 mb-1">
            Catatan Uang Keluar / Kebutuhan (Opsional)
          </label>
          <input
            type="text"
            id="edit-income-note-input"
            maxlength="120"
            value="${escapeHTML(currentAdj?.note || '')}"
            placeholder="Contoh: Beli plastik, makan siang, bensin, dll."
            class="w-full px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <p class="text-xs text-slate-500 leading-relaxed">
          Anda dapat mengisi nominal <strong>Uang Keluar</strong> atau langsung mengubah angka <strong>Total Pemasukan Hari #${targetDay}</strong>. Total Pemasukan Bulan Ini akan ikut menyesuaikan selisihnya secara otomatis.
        </p>
      </div>
    `,
    footerHTML: `
      <button type="button" id="reset-today-income-btn" class="px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 cursor-pointer mr-auto">
        Reset ke Omzet Asli
      </button>
      <button type="button" id="cancel-edit-income-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
        Batal
      </button>
      <button type="button" id="save-edit-income-btn" class="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer">
        Simpan Pemasukan
      </button>
    `,
    onMount: () => {
      const expenseInput = document.getElementById('edit-income-expense-input');
      const totalInput = document.getElementById('edit-income-total-input');
      const noteInput = document.getElementById('edit-income-note-input');

      expenseInput?.addEventListener('input', () => {
        if (!(expenseInput instanceof HTMLInputElement) || !(totalInput instanceof HTMLInputElement)) return;
        const expVal = Number(expenseInput.value);
        if (Number.isFinite(expVal)) {
          totalInput.value = String(todaySales - expVal);
        }
      });

      totalInput?.addEventListener('input', () => {
        if (!(expenseInput instanceof HTMLInputElement) || !(totalInput instanceof HTMLInputElement)) return;
        const totalVal = Number(totalInput.value);
        if (Number.isFinite(totalVal)) {
          expenseInput.value = String(todaySales - totalVal);
        }
      });

      document.getElementById('cancel-edit-income-btn')?.addEventListener('click', closeModal);

      document.getElementById('reset-today-income-btn')?.addEventListener('click', () => {
        if (expenseInput instanceof HTMLInputElement) expenseInput.value = '0';
        if (totalInput instanceof HTMLInputElement) totalInput.value = String(todaySales);
        if (noteInput instanceof HTMLInputElement) noteInput.value = '';
      });

      document.getElementById('save-edit-income-btn')?.addEventListener('click', () => {
        const nextTotal = Number(totalInput instanceof HTMLInputElement ? totalInput.value : todaySales);
        if (!Number.isFinite(nextTotal)) {
          showToast('Masukkan nominal total pemasukan yang valid.', 'error');
          return;
        }
        const nextExpense = todaySales - nextTotal;
        const nextNote = noteInput instanceof HTMLInputElement ? noteInput.value.trim() : '';
        const deltaExpense = nextExpense - currentExpense;

        if (!appState.dailyAdjustments || typeof appState.dailyAdjustments !== 'object') {
          appState.dailyAdjustments = {};
        }

        if (nextExpense === 0 && !nextNote) {
          delete appState.dailyAdjustments[dayKey];
        } else {
          appState.dailyAdjustments[dayKey] = {
            expense: nextExpense,
            note: nextNote,
            updatedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          };
        }

        if (targetDay === session.dayNumber) {
          appState.storeProfile.cashBalance = Math.max(0, appState.storeProfile.cashBalance - deltaExpense);
        }
        const arcEntry = (appState.dailyHistoryArchive || []).find((a) => a.dayNumber === targetDay);
        if (arcEntry) {
          arcEntry.dailyExpense = nextExpense;
        }

        closeModal();
        persistAndRefresh();
        showToast(
          `Total pemasukan Hari #${targetDay} disimpan: ${formatRupiah(nextTotal)}.`,
          'success'
        );
      });
    }
  });
}
