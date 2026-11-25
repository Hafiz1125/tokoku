export const STORAGE_KEY = 'tokoku_app_state_v2';

export const PRODUCT_CATEGORIES = [
  'Sembako',
  'Minuman',
  'Makanan Ringan',
  'Kebersihan'
];

export function createProductSVG(type, bgHex, accentHex, labelText) {
  const icons = {
    beras: `<rect x="65" y="32" width="70" height="86" rx="12" fill="#ffffff" stroke="${accentHex}" stroke-width="4"/><path d="M65 52h70" stroke="${accentHex}" stroke-width="3"/><circle cx="100" cy="76" r="14" fill="${bgHex}"/><path d="M95 76c3-6 7-6 10 0M100 68v16" stroke="${accentHex}" stroke-width="2.5" stroke-linecap="round"/>`,
    minyak: `<rect x="74" y="42" width="52" height="76" rx="10" fill="#fef08a" stroke="${accentHex}" stroke-width="4"/><rect x="88" y="28" width="24" height="14" rx="4" fill="${accentHex}"/><path d="M126 54h10v24h-10" fill="none" stroke="${accentHex}" stroke-width="4" stroke-linejoin="round"/><circle cx="100" cy="80" r="12" fill="#ffffff" opacity="0.85"/>`,
    gula: `<rect x="68" y="36" width="64" height="82" rx="10" fill="#ffffff" stroke="${accentHex}" stroke-width="4"/><rect x="82" y="56" width="16" height="16" rx="3" fill="${bgHex}" stroke="${accentHex}" stroke-width="2"/><rect x="102" y="56" width="16" height="16" rx="3" fill="${bgHex}" stroke="${accentHex}" stroke-width="2"/><rect x="92" y="76" width="16" height="16" rx="3" fill="${bgHex}" stroke="${accentHex}" stroke-width="2"/>`,
    telur: `<rect x="56" y="64" width="88" height="36" rx="8" fill="#fed7aa" stroke="${accentHex}" stroke-width="3.5"/><ellipse cx="76" cy="58" rx="11" ry="15" fill="#fff7ed" stroke="${accentHex}" stroke-width="3"/><ellipse cx="100" cy="56" rx="11" ry="15" fill="#fff7ed" stroke="${accentHex}" stroke-width="3"/><ellipse cx="124" cy="58" rx="11" ry="15" fill="#fff7ed" stroke="${accentHex}" stroke-width="3"/>`,
    kopi: `<rect x="70" y="34" width="60" height="84" rx="10" fill="#78350f" stroke="${accentHex}" stroke-width="3.5"/><ellipse cx="100" cy="74" rx="14" ry="18" fill="#fef3c7"/><path d="M100 58c-4 10 4 22 0 32" stroke="#78350f" stroke-width="3" fill="none"/>`,
    mie: `<rect x="60" y="42" width="80" height="68" rx="10" fill="#ffffff" stroke="${accentHex}" stroke-width="4"/><path d="M74 68c12-10 20 10 32 0s16 8 20 0M74 82c12-10 20 10 32 0s16 8 20 0" stroke="#f59e0b" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    sabun: `<rect x="76" y="46" width="48" height="72" rx="12" fill="#ffffff" stroke="${accentHex}" stroke-width="4"/><path d="M94 46V32h16M88 32h16" stroke="${accentHex}" stroke-width="4" stroke-linecap="round"/><circle cx="100" cy="82" r="12" fill="${bgHex}"/>`,
    minuman: `<rect x="78" y="44" width="44" height="74" rx="10" fill="#ffffff" stroke="${accentHex}" stroke-width="4"/><rect x="88" y="30" width="24" height="14" rx="3" fill="${accentHex}"/><path d="M78 72h44" stroke="${accentHex}" stroke-width="3"/>`
  };
  const shape = icons[type] || icons.beras;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140"><rect width="200" height="140" fill="${bgHex}"/>${shape}<text x="100" y="131" font-family="sans-serif" font-size="11" font-weight="700" fill="${accentHex}" text-anchor="middle">${labelText}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export const PRODUCT_IMAGE_PRESETS = [
  { id: 'beras', label: 'Beras', url: createProductSVG('beras', '#dcfce7', '#15803d', 'SEMBAKO BERAS') },
  { id: 'minyak', label: 'Minyak', url: createProductSVG('minyak', '#fef9c3', '#a16207', 'MINYAK GORENG') },
  { id: 'gula', label: 'Gula', url: createProductSVG('gula', '#e0f2fe', '#0369a1', 'GULA PASIR') },
  { id: 'telur', label: 'Telur', url: createProductSVG('telur', '#ffedd5', '#c2410c', 'TELUR SEGAR') },
  { id: 'kopi', label: 'Kopi', url: createProductSVG('kopi', '#fef3c7', '#92400e', 'KOPI & TEH') },
  { id: 'mie', label: 'Mi Instan', url: createProductSVG('mie', '#fee2e2', '#b91c1c', 'MI INSTAN') },
  { id: 'sabun', label: 'Sabun', url: createProductSVG('sabun', '#ccfbf1', '#0f766e', 'KEBERSIHAN') },
  { id: 'minuman', label: 'Minuman', url: createProductSVG('minuman', '#e0e7ff', '#4338ca', 'MINUMAN') }
];

export function getCategoryFallbackImage(category) {
  const map = {
    Sembako: PRODUCT_IMAGE_PRESETS[0].url,
    Minuman: PRODUCT_IMAGE_PRESETS[7].url,
    'Makanan Ringan': PRODUCT_IMAGE_PRESETS[5].url,
    Kebersihan: PRODUCT_IMAGE_PRESETS[6].url
  };
  return map[category] || PRODUCT_IMAGE_PRESETS[0].url;
}

export const BADGE_DEFINITIONS = [
  {
    id: 'first_step',
    title: 'Langkah Perintis',
    desc: 'Memulai simulasi manajemen Toko Kelontong Sejahtera',
    icon: 'store'
  },
  {
    id: 'smart_pricer',
    title: 'Ahli Penetapan Harga',
    desc: 'Menambahkan produk baru dengan perhitungan margin',
    icon: 'tag'
  },
  {
    id: 'stock_master',
    title: 'Penjaga Rantai Pasok',
    desc: 'Melakukan restock barang tepat waktu saat menyentuh titik ROP',
    icon: 'truck'
  },
  {
    id: 'diligent_auditor',
    title: 'Auditor Teliti',
    desc: 'Menyelesaikan audit fisik sisa stok (Stock Opname)',
    icon: 'clipboard-check'
  }
];

export function getDefaultState() {
  return {
    storeProfile: {
      storeName: 'Toko Kelontong Sejahtera',
      cashBalance: 5000000
    },
    dailySession: {
      isOpen: true,
      dayNumber: 1,
      openedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      openingCash: 5000000,
      closedAt: null
    },
    gamification: {
      xp: 50,
      unlockedBadges: ['first_step']
    },
    products: [
      {
        id: 'PRD-001',
        name: 'Beras Pandan Wangi 5kg',
        category: 'Sembako',
        imageUrl: PRODUCT_IMAGE_PRESETS[0].url,
        costPrice: 62000,
        sellPrice: 72000,
        stock: 16,
        dailySalesAvg: 3,
        leadTimeDays: 2,
        safetyStock: 5
      },
      {
        id: 'PRD-002',
        name: 'Minyak Goreng Sawit 2L',
        category: 'Sembako',
        imageUrl: PRODUCT_IMAGE_PRESETS[1].url,
        costPrice: 31000,
        sellPrice: 36000,
        stock: 9,
        dailySalesAvg: 4,
        leadTimeDays: 2,
        safetyStock: 4
      },
      {
        id: 'PRD-003',
        name: 'Gula Pasir Putih 1kg',
        category: 'Sembako',
        imageUrl: PRODUCT_IMAGE_PRESETS[2].url,
        costPrice: 14500,
        sellPrice: 17500,
        stock: 22,
        dailySalesAvg: 5,
        leadTimeDays: 1,
        safetyStock: 6
      },
      {
        id: 'PRD-004',
        name: 'Telur Ayam Negeri 1 Tray',
        category: 'Sembako',
        imageUrl: PRODUCT_IMAGE_PRESETS[3].url,
        costPrice: 48000,
        sellPrice: 55000,
        stock: 11,
        dailySalesAvg: 3,
        leadTimeDays: 2,
        safetyStock: 4
      },
      {
        id: 'PRD-005',
        name: 'Kopi Bubuk Robusta 250g',
        category: 'Minuman',
        imageUrl: PRODUCT_IMAGE_PRESETS[4].url,
        costPrice: 16000,
        sellPrice: 20000,
        stock: 15,
        dailySalesAvg: 2,
        leadTimeDays: 3,
        safetyStock: 4
      },
      {
        id: 'PRD-006',
        name: 'Mi Instan Goreng (1 Dus)',
        category: 'Makanan Ringan',
        imageUrl: PRODUCT_IMAGE_PRESETS[5].url,
        costPrice: 102000,
        sellPrice: 118000,
        stock: 7,
        dailySalesAvg: 2,
        leadTimeDays: 3,
        safetyStock: 3
      }
    ],
    transactions: [],
    dailyHistoryArchive: []
  };
}
