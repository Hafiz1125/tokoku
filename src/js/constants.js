import { formatRealtimeClock, getLocalDateKey } from './utils.js';

export const STORAGE_KEY = 'tokoku_app_state_v2';

export const PRODUCT_CATEGORIES = [
  'Sembako',
  'Bumbu Dapur',
  'Minuman',
  'Makanan Ringan',
  'Kebersihan',
  'Rokok'
];

export const PRODUCT_IMAGE_PRESETS = [
  { id: 'beras', label: 'Beras', url: '/src/assets/images/beras_sembako_1795771101383.jpg' },
  { id: 'minyak', label: 'Minyak', url: '/src/assets/images/minyak_goreng_1795771102260.jpg' },
  { id: 'gula', label: 'Gula', url: '/src/assets/images/gula_pasir_1795771102370.jpg' },
  { id: 'telur', label: 'Telur', url: '/src/assets/images/telur_ayam_1795771102692.jpg' },
  { id: 'kopi', label: 'Kopi', url: '/src/assets/images/kopi_bubuk_1795771104246.jpg' },
  { id: 'mie', label: 'Mi Instan', url: '/src/assets/images/mi_instan_1795771104234.jpg' },
  { id: 'sabun', label: 'Sabun', url: '/src/assets/images/sabun_kebersihan_1795771104149.jpg' },
  { id: 'minuman', label: 'Minuman', url: '/src/assets/images/minuman_botol_1795771104214.jpg' },
  { id: 'bumbu', label: 'Bumbu', url: '/src/assets/images/bumbu_dapur_1795771105352.jpg' },
  { id: 'galon', label: 'Air Galon', url: '/src/assets/images/air_galon_1795771148273.jpg' },
  { id: 'snack', label: 'Snack', url: '/src/assets/images/snack_biskuit_1795771186536.jpg' },
  { id: 'rokok', label: 'Rokok', url: '/src/assets/images/rokok_kemasan_1795771106937.jpg' }
];

export function getCategoryFallbackImage(category) {
  const map = {
    Sembako: PRODUCT_IMAGE_PRESETS[0].url,
    'Bumbu Dapur': PRODUCT_IMAGE_PRESETS[8].url,
    Minuman: PRODUCT_IMAGE_PRESETS[7].url,
    'Makanan Ringan': PRODUCT_IMAGE_PRESETS[10].url,
    Kebersihan: PRODUCT_IMAGE_PRESETS[6].url,
    Rokok: PRODUCT_IMAGE_PRESETS[11].url
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
    desc: 'Melakukan restock barang tepat waktu saat stok menipis',
    icon: 'truck'
  },
  {
    id: 'diligent_auditor',
    title: 'Pengelola Stok Teliti',
    desc: 'Menyesuaikan dan merapikan data sisa stok barang',
    icon: 'clipboard-check'
  }
];

export const DEFAULT_COMMON_PRODUCTS = [
  // Sembako
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
    id: 'PRD-007',
    name: 'Tepung Terigu Segitiga Biru 1kg',
    category: 'Sembako',
    imageUrl: PRODUCT_IMAGE_PRESETS[0].url,
    costPrice: 11000,
    sellPrice: 13500,
    stock: 18,
    dailySalesAvg: 3,
    leadTimeDays: 2,
    safetyStock: 5
  },
  {
    id: 'PRD-008',
    name: 'Gas LPG 3kg (Isi Ulang)',
    category: 'Sembako',
    imageUrl: PRODUCT_IMAGE_PRESETS[2].url,
    costPrice: 19000,
    sellPrice: 22000,
    stock: 12,
    dailySalesAvg: 4,
    leadTimeDays: 1,
    safetyStock: 4
  },
  // Bumbu Dapur
  {
    id: 'PRD-009',
    name: 'Kecap Manis Bango 520ml',
    category: 'Bumbu Dapur',
    imageUrl: PRODUCT_IMAGE_PRESETS[8].url,
    costPrice: 21000,
    sellPrice: 25000,
    stock: 14,
    dailySalesAvg: 2,
    leadTimeDays: 2,
    safetyStock: 4
  },
  {
    id: 'PRD-010',
    name: 'Garam Dapur Halus 500g',
    category: 'Bumbu Dapur',
    imageUrl: PRODUCT_IMAGE_PRESETS[8].url,
    costPrice: 3500,
    sellPrice: 5000,
    stock: 25,
    dailySalesAvg: 3,
    leadTimeDays: 2,
    safetyStock: 6
  },
  {
    id: 'PRD-011',
    name: 'Saus Sambal ABC 335ml',
    category: 'Bumbu Dapur',
    imageUrl: PRODUCT_IMAGE_PRESETS[8].url,
    costPrice: 13000,
    sellPrice: 16000,
    stock: 14,
    dailySalesAvg: 2,
    leadTimeDays: 2,
    safetyStock: 4
  },
  {
    id: 'PRD-012',
    name: 'Penyedap Rasa Masako (1 Renteng)',
    category: 'Bumbu Dapur',
    imageUrl: PRODUCT_IMAGE_PRESETS[8].url,
    costPrice: 4500,
    sellPrice: 6000,
    stock: 30,
    dailySalesAvg: 5,
    leadTimeDays: 2,
    safetyStock: 8
  },
  // Minuman
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
    id: 'PRD-013',
    name: 'Air Mineral Galon 19L',
    category: 'Minuman',
    imageUrl: PRODUCT_IMAGE_PRESETS[9].url,
    costPrice: 17000,
    sellPrice: 21000,
    stock: 15,
    dailySalesAvg: 4,
    leadTimeDays: 1,
    safetyStock: 5
  },
  {
    id: 'PRD-014',
    name: 'Air Mineral Botol 600ml',
    category: 'Minuman',
    imageUrl: PRODUCT_IMAGE_PRESETS[9].url,
    costPrice: 2500,
    sellPrice: 4000,
    stock: 36,
    dailySalesAvg: 6,
    leadTimeDays: 2,
    safetyStock: 10
  },
  {
    id: 'PRD-015',
    name: 'Teh Celup Sariwangi (25 Kantong)',
    category: 'Minuman',
    imageUrl: PRODUCT_IMAGE_PRESETS[4].url,
    costPrice: 5500,
    sellPrice: 7500,
    stock: 20,
    dailySalesAvg: 3,
    leadTimeDays: 2,
    safetyStock: 5
  },
  {
    id: 'PRD-016',
    name: 'Susu Kental Manis Kaleng 370g',
    category: 'Minuman',
    imageUrl: PRODUCT_IMAGE_PRESETS[7].url,
    costPrice: 11000,
    sellPrice: 13500,
    stock: 18,
    dailySalesAvg: 3,
    leadTimeDays: 2,
    safetyStock: 5
  },
  {
    id: 'PRD-017',
    name: 'Teh Pucuk Harum 350ml',
    category: 'Minuman',
    imageUrl: PRODUCT_IMAGE_PRESETS[7].url,
    costPrice: 3000,
    sellPrice: 4500,
    stock: 30,
    dailySalesAvg: 5,
    leadTimeDays: 2,
    safetyStock: 8
  },
  // Makanan Ringan
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
  },
  {
    id: 'PRD-018',
    name: 'Mi Instan Goreng (Satuan)',
    category: 'Makanan Ringan',
    imageUrl: PRODUCT_IMAGE_PRESETS[5].url,
    costPrice: 2700,
    sellPrice: 3500,
    stock: 48,
    dailySalesAvg: 8,
    leadTimeDays: 2,
    safetyStock: 12
  },
  {
    id: 'PRD-019',
    name: 'Biskuit Roma Kelapa 300g',
    category: 'Makanan Ringan',
    imageUrl: PRODUCT_IMAGE_PRESETS[10].url,
    costPrice: 9500,
    sellPrice: 12000,
    stock: 16,
    dailySalesAvg: 2,
    leadTimeDays: 2,
    safetyStock: 4
  },
  {
    id: 'PRD-020',
    name: 'Roti Tawar Kupas',
    category: 'Makanan Ringan',
    imageUrl: PRODUCT_IMAGE_PRESETS[10].url,
    costPrice: 11500,
    sellPrice: 14500,
    stock: 10,
    dailySalesAvg: 3,
    leadTimeDays: 1,
    safetyStock: 3
  },
  {
    id: 'PRD-021',
    name: 'Keripik Kentang Chitato 68g',
    category: 'Makanan Ringan',
    imageUrl: PRODUCT_IMAGE_PRESETS[10].url,
    costPrice: 8500,
    sellPrice: 11000,
    stock: 20,
    dailySalesAvg: 3,
    leadTimeDays: 2,
    safetyStock: 5
  },
  // Kebersihan
  {
    id: 'PRD-022',
    name: 'Sabun Mandi Lifebuoy 110g',
    category: 'Kebersihan',
    imageUrl: PRODUCT_IMAGE_PRESETS[6].url,
    costPrice: 3500,
    sellPrice: 5000,
    stock: 24,
    dailySalesAvg: 3,
    leadTimeDays: 2,
    safetyStock: 6
  },
  {
    id: 'PRD-023',
    name: 'Deterjen Bubuk Rinso 770g',
    category: 'Kebersihan',
    imageUrl: PRODUCT_IMAGE_PRESETS[6].url,
    costPrice: 18500,
    sellPrice: 22500,
    stock: 14,
    dailySalesAvg: 2,
    leadTimeDays: 2,
    safetyStock: 4
  },
  {
    id: 'PRD-024',
    name: 'Sabun Cuci Piring Sunlight 650ml',
    category: 'Kebersihan',
    imageUrl: PRODUCT_IMAGE_PRESETS[6].url,
    costPrice: 12500,
    sellPrice: 15500,
    stock: 16,
    dailySalesAvg: 2,
    leadTimeDays: 2,
    safetyStock: 4
  },
  {
    id: 'PRD-025',
    name: 'Pasta Gigi Pepsodent 190g',
    category: 'Kebersihan',
    imageUrl: PRODUCT_IMAGE_PRESETS[6].url,
    costPrice: 11500,
    sellPrice: 14500,
    stock: 15,
    dailySalesAvg: 2,
    leadTimeDays: 2,
    safetyStock: 4
  },
  {
    id: 'PRD-026',
    name: 'Sampo Sunsilk Sachet (1 Renteng)',
    category: 'Kebersihan',
    imageUrl: PRODUCT_IMAGE_PRESETS[6].url,
    costPrice: 9500,
    sellPrice: 12000,
    stock: 18,
    dailySalesAvg: 3,
    leadTimeDays: 2,
    safetyStock: 5
  },
  // Rokok
  {
    id: 'PRD-027',
    name: 'Sampoerna A Mild 16 Batang',
    category: 'Rokok',
    imageUrl: PRODUCT_IMAGE_PRESETS[11].url,
    costPrice: 29500,
    sellPrice: 33000,
    stock: 16,
    dailySalesAvg: 4,
    leadTimeDays: 2,
    safetyStock: 5
  },
  {
    id: 'PRD-028',
    name: 'Gudang Garam Surya 12',
    category: 'Rokok',
    imageUrl: PRODUCT_IMAGE_PRESETS[11].url,
    costPrice: 23500,
    sellPrice: 26500,
    stock: 18,
    dailySalesAvg: 4,
    leadTimeDays: 2,
    safetyStock: 5
  }
];

export function getDefaultState() {
  const now = new Date();
  return {
    storeProfile: {
      storeName: 'Toko Kelontong Sejahtera',
      ownerName: 'Pengelola Toko',
      cashBalance: 0
    },
    dailySession: {
      isOpen: true,
      dayNumber: 1,
      dateKey: getLocalDateKey(now),
      openedAt: formatRealtimeClock(now),
      openedTimestamp: now.getTime(),
      reopenedAt: null,
      openingCash: 0,
      closedAt: null,
      closedTimestamp: null
    },
    gamification: {
      xp: 50,
      unlockedBadges: ['first_step']
    },
    products: DEFAULT_COMMON_PRODUCTS.map((p) => ({ ...p })),
    transactions: [],
    dailyHistoryArchive: [],
    dailyAdjustments: {},
    customCategories: []
  };
}
