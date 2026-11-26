import { escapeHTML, formatRupiah, getLocalDateKey } from '../utils.js';
import { buildDayDateIndex, CALENDAR_MONTH_NAMES, parseRestockItemInfo } from './laporan.js';

export function renderAnnualReport(ctx) {
  const { appState } = ctx;
  const yearFilterEl = document.getElementById('annual-year-filter');
  const monthlyBodyEl = document.getElementById('annual-monthly-table-body');
  const monthlyFootEl = document.getElementById('annual-monthly-table-foot');
  const yearsBodyEl = document.getElementById('annual-years-table-body');
  const yearsFootEl = document.getElementById('annual-years-table-foot');
  if (!monthlyBodyEl) return;

  const { dayToDateKey, sortedDaysAsc } = buildDayDateIndex(appState);

  const monthBuckets = new Map();
  const yearBuckets = new Map();

  const ensureMonthBucket = (monthKey) => {
    if (!monthBuckets.has(monthKey)) {
      const year = monthKey.slice(0, 4);
      const monthIdx = Math.max(0, Math.min(11, (parseInt(monthKey.slice(5, 7), 10) || 1) - 1));
      monthBuckets.set(monthKey, {
        monthKey,
        year,
        monthIdx,
        label: `${CALENDAR_MONTH_NAMES[monthIdx]} ${year}`,
        days: new Set(),
        latestDay: 0,
        sales: 0,
        cashSales: 0,
        nonCashSales: 0,
        expense: 0,
        restock: 0,
        restockQty: 0,
        restockItems: new Set()
      });
    }
    return monthBuckets.get(monthKey);
  };

  const ensureYearBucket = (year) => {
    if (!yearBuckets.has(year)) {
      yearBuckets.set(year, {
        year,
        days: new Set(),
        sales: 0,
        cashSales: 0,
        nonCashSales: 0,
        expense: 0,
        restock: 0,
        restockQty: 0,
        restockItems: new Set()
      });
    }
    return yearBuckets.get(year);
  };

  sortedDaysAsc.forEach((d) => {
    const dk = dayToDateKey.get(d);
    if (!dk || dk.length < 7) return;
    const mk = dk.slice(0, 7);
    const y = dk.slice(0, 4);
    const mb = ensureMonthBucket(mk);
    mb.days.add(d);
    if (d > mb.latestDay) mb.latestDay = d;
    ensureYearBucket(y).days.add(d);
  });

  (appState.transactions || []).forEach((trx) => {
    const tDay = trx.dayNumber || 1;
    const dk = dayToDateKey.get(tDay) || getLocalDateKey();
    const mk = dk.slice(0, 7);
    const y = dk.slice(0, 4);
    const mb = ensureMonthBucket(mk);
    const yb = ensureYearBucket(y);
    mb.days.add(tDay);
    if (tDay > mb.latestDay) mb.latestDay = tDay;
    yb.days.add(tDay);

    if (trx.type === 'SALE') {
      const amt = Number(trx.amount) || 0;
      mb.sales += amt;
      yb.sales += amt;
      if (trx.paymentMethod === 'NON_CASH') {
        mb.nonCashSales += amt;
        yb.nonCashSales += amt;
      } else {
        mb.cashSales += amt;
        yb.cashSales += amt;
      }
    } else if (trx.type === 'RESTOCK') {
      const amt = Number(trx.amount) || 0;
      const info = parseRestockItemInfo(trx, appState.products);
      mb.restock += amt;
      mb.restockQty += info.qty;
      mb.restockItems.add(info.key);
      yb.restock += amt;
      yb.restockQty += info.qty;
      yb.restockItems.add(info.key);
    }
  });

  if (appState.dailyAdjustments && typeof appState.dailyAdjustments === 'object') {
    Object.entries(appState.dailyAdjustments).forEach(([k, adj]) => {
      const dayNum = Number(k);
      const exp = Number(adj?.expense) || 0;
      const dk = (Number.isFinite(dayNum) ? dayToDateKey.get(dayNum) : '') || getLocalDateKey();
      const mk = dk.slice(0, 7);
      const y = dk.slice(0, 4);
      ensureMonthBucket(mk).expense += exp;
      ensureYearBucket(y).expense += exp;
    });
  }

  const availableYears = Array.from(yearBuckets.keys()).sort((a, b) => b.localeCompare(a));
  const fallbackYear = (appState.dailySession?.dateKey || getLocalDateKey()).slice(0, 4);
  if (availableYears.length === 0) availableYears.push(fallbackYear);

  let selectedYear = availableYears[0];
  if (yearFilterEl instanceof HTMLSelectElement) {
    const prevVal = yearFilterEl.value;
    yearFilterEl.innerHTML = [
      ...availableYears.map((y) => `<option value="${y}">Tahun ${y}</option>`),
      '<option value="ALL">Semua Tahun</option>'
    ].join('');
    if (prevVal && [...yearFilterEl.options].some((o) => o.value === prevVal)) {
      yearFilterEl.value = prevVal;
    } else {
      yearFilterEl.value = availableYears[0];
    }
    selectedYear = yearFilterEl.value;
  }

  const isAllYears = selectedYear === 'ALL';
  const visibleMonths = Array.from(monthBuckets.values())
    .filter((m) => isAllYears || m.year === selectedYear)
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const totals = visibleMonths.reduce(
    (acc, m) => {
      acc.days += m.days.size;
      acc.sales += m.sales;
      acc.cashSales += m.cashSales;
      acc.nonCashSales += m.nonCashSales;
      acc.expense += m.expense;
      acc.restock += m.restock;
      acc.restockQty += m.restockQty;
      m.restockItems.forEach((k) => acc.restockItems.add(k));
      return acc;
    },
    {
      days: 0,
      sales: 0,
      cashSales: 0,
      nonCashSales: 0,
      expense: 0,
      restock: 0,
      restockQty: 0,
      restockItems: new Set()
    }
  );
  const totalNetIncome = totals.sales - totals.expense;

  const heroTitleEl = document.getElementById('annual-hero-title');
  const heroDaysEl = document.getElementById('annual-hero-days');
  const heroNetEl = document.getElementById('annual-net-income');
  const heroNetNoteEl = document.getElementById('annual-net-income-note');
  const heroSalesEl = document.getElementById('annual-gross-sales');
  const heroSalesNoteEl = document.getElementById('annual-gross-sales-note');
  const heroExpenseEl = document.getElementById('annual-total-expense');
  const heroExpenseNoteEl = document.getElementById('annual-total-expense-note');
  const heroRestockEl = document.getElementById('annual-total-restock');
  const heroRestockNoteEl = document.getElementById('annual-total-restock-note');

  if (heroTitleEl) {
    heroTitleEl.textContent = isAllYears
      ? 'Ringkasan Keuangan Semua Tahun'
      : `Ringkasan Keuangan Tahun ${selectedYear}`;
  }
  if (heroDaysEl) {
    heroDaysEl.textContent = `${visibleMonths.length} bulan · ${totals.days} hari tercatat`;
  }
  if (heroNetEl) {
    heroNetEl.textContent = formatRupiah(totalNetIncome);
    heroNetEl.className = `text-xl sm:text-2xl font-extrabold font-mono tabular-nums mt-1 block whitespace-nowrap ${
      totalNetIncome >= 0 ? 'text-emerald-300' : 'text-rose-300'
    }`;
  }
  if (heroNetNoteEl) {
    heroNetNoteEl.textContent = `Omzet ${formatRupiah(totals.sales)} − Keluar ${formatRupiah(totals.expense)}`;
  }
  if (heroSalesEl) heroSalesEl.textContent = formatRupiah(totals.sales);
  if (heroSalesNoteEl) {
    heroSalesNoteEl.textContent = `Cash ${formatRupiah(totals.cashSales)} · Non-Cash ${formatRupiah(
      totals.nonCashSales
    )}`;
  }
  if (heroExpenseEl) heroExpenseEl.textContent = formatRupiah(totals.expense);
  if (heroExpenseNoteEl) {
    heroExpenseNoteEl.textContent = isAllYears
      ? 'Total uang keluar seluruh periode'
      : `Total uang keluar tahun ${selectedYear}`;
  }
  if (heroRestockEl) heroRestockEl.textContent = formatRupiah(totals.restock);
  if (heroRestockNoteEl) {
    heroRestockNoteEl.textContent =
      totals.restockItems.size > 0
        ? `${totals.restockItems.size} item · ${totals.restockQty} unit masuk`
        : 'Belum ada belanja restock';
  }

  const monthTableSubEl = document.getElementById('annual-monthly-subtitle');
  if (monthTableSubEl) {
    monthTableSubEl.textContent = isAllYears
      ? 'Rincian pemasukan dan belanja per bulan di semua tahun'
      : `Rincian pemasukan dan belanja per bulan sepanjang tahun ${selectedYear}`;
  }

  if (visibleMonths.length === 0) {
    monthlyBodyEl.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 px-4 text-center text-sm text-slate-500">
          Belum ada data transaksi tercatat pada tahun ini.
        </td>
      </tr>
    `;
    if (monthlyFootEl) monthlyFootEl.innerHTML = '';
  } else {
    monthlyBodyEl.innerHTML = visibleMonths
      .map((m) => {
        const net = m.sales - m.expense;
        const targetDayVal = m.latestDay === appState.dailySession?.dayNumber ? 'CURRENT' : String(m.latestDay);
        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">${escapeHTML(m.label)}</td>
            <td class="py-3.5 px-4 text-center font-mono tabular-nums text-slate-600">${m.days.size} hr</td>
            <td class="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">${formatRupiah(
              m.sales
            )}</td>
            <td class="py-3.5 px-4 text-right font-mono tabular-nums text-rose-700 whitespace-nowrap">${
              m.expense > 0 ? `- ${formatRupiah(m.expense)}` : formatRupiah(0)
            }</td>
            <td class="py-3.5 px-4 text-right font-mono tabular-nums text-amber-700 whitespace-nowrap">${formatRupiah(
              m.restock
            )}</td>
            <td class="py-3.5 px-4 text-right font-extrabold font-mono tabular-nums whitespace-nowrap ${
              net >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }">${formatRupiah(net)}</td>
            <td class="py-3.5 px-4 text-center">
              <button
                type="button"
                data-action="open-month-in-daily"
                data-day="${escapeHTML(targetDayVal)}"
                class="px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-semibold bg-slate-100 hover:bg-teal-700 hover:text-white text-slate-700 transition cursor-pointer whitespace-nowrap"
              >
                Cek Harian
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    if (monthlyFootEl) {
      monthlyFootEl.innerHTML = `
        <tr>
          <td class="py-3.5 px-4 text-slate-900">Total ${isAllYears ? 'Semua Tahun' : selectedYear}</td>
          <td class="py-3.5 px-4 text-center font-mono tabular-nums text-slate-700">${totals.days} hr</td>
          <td class="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">${formatRupiah(
            totals.sales
          )}</td>
          <td class="py-3.5 px-4 text-right font-mono tabular-nums text-rose-700 whitespace-nowrap">${
            totals.expense > 0 ? `- ${formatRupiah(totals.expense)}` : formatRupiah(0)
          }</td>
          <td class="py-3.5 px-4 text-right font-mono tabular-nums text-amber-700 whitespace-nowrap">${formatRupiah(
            totals.restock
          )}</td>
          <td class="py-3.5 px-4 text-right font-extrabold font-mono tabular-nums whitespace-nowrap ${
            totalNetIncome >= 0 ? 'text-teal-700' : 'text-rose-700'
          }">${formatRupiah(totalNetIncome)}</td>
          <td class="py-3.5 px-4"></td>
        </tr>
      `;
    }
  }

  if (yearsBodyEl && yearsFootEl) {
    const sortedYears = Array.from(yearBuckets.values()).sort((a, b) => b.year.localeCompare(a.year));
    const grandAll = sortedYears.reduce(
      (acc, y) => {
        acc.days += y.days.size;
        acc.sales += y.sales;
        acc.expense += y.expense;
        acc.restock += y.restock;
        return acc;
      },
      { days: 0, sales: 0, expense: 0, restock: 0 }
    );
    const grandNetAll = grandAll.sales - grandAll.expense;

    yearsBodyEl.innerHTML = sortedYears
      .map((y) => {
        const net = y.sales - y.expense;
        const isCurrentFilter = selectedYear === y.year;
        return `
          <tr class="hover:bg-slate-50 transition ${isCurrentFilter ? 'bg-teal-50/50' : ''}">
            <td class="py-3.5 px-4 font-bold text-slate-900 font-mono tabular-nums">
              <button
                type="button"
                data-action="select-annual-year"
                data-year="${escapeHTML(y.year)}"
                class="hover:text-teal-700 underline-offset-2 hover:underline cursor-pointer"
              >
                Tahun ${escapeHTML(y.year)}
              </button>
            </td>
            <td class="py-3.5 px-4 text-center font-mono tabular-nums text-slate-600">${y.days.size} hr</td>
            <td class="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">${formatRupiah(
              y.sales
            )}</td>
            <td class="py-3.5 px-4 text-right font-mono tabular-nums text-rose-700 whitespace-nowrap">${
              y.expense > 0 ? `- ${formatRupiah(y.expense)}` : formatRupiah(0)
            }</td>
            <td class="py-3.5 px-4 text-right font-mono tabular-nums text-amber-700 whitespace-nowrap">${formatRupiah(
              y.restock
            )}</td>
            <td class="py-3.5 px-4 text-right font-extrabold font-mono tabular-nums whitespace-nowrap ${
              net >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }">${formatRupiah(net)}</td>
          </tr>
        `;
      })
      .join('');

    yearsFootEl.innerHTML = `
      <tr>
        <td class="py-3.5 px-4 text-slate-900">Total Keseluruhan</td>
        <td class="py-3.5 px-4 text-center font-mono tabular-nums text-slate-700">${grandAll.days} hr</td>
        <td class="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">${formatRupiah(
          grandAll.sales
        )}</td>
        <td class="py-3.5 px-4 text-right font-mono tabular-nums text-rose-700 whitespace-nowrap">${
          grandAll.expense > 0 ? `- ${formatRupiah(grandAll.expense)}` : formatRupiah(0)
        }</td>
        <td class="py-3.5 px-4 text-right font-mono tabular-nums text-amber-700 whitespace-nowrap">${formatRupiah(
          grandAll.restock
        )}</td>
        <td class="py-3.5 px-4 text-right font-extrabold font-mono tabular-nums whitespace-nowrap ${
          grandNetAll >= 0 ? 'text-teal-700' : 'text-rose-700'
        }">${formatRupiah(grandNetAll)}</td>
      </tr>
    `;
  }
}
