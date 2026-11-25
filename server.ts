import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { getDefaultState } from './src/js/constants.js';
import { normalizeState } from './src/js/storage.js';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const ROOT_DIR = process.cwd();
const DATA_DIR = path.resolve(ROOT_DIR, 'data');
const DB_FILE = path.resolve(DATA_DIR, 'tokoku-users.json');

if (!DB_FILE.startsWith(DATA_DIR + path.sep)) {
  throw new Error('Invalid database path configuration.');
}

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

type UserRole = 'admin' | 'pembeli';
type PaymentMethod = 'Tunai' | 'QRIS' | 'Transfer Bank';

interface BuyerOrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
}

interface BuyerOrder {
  id: string;
  storeId: string;
  storeName: string;
  createdAt: string;
  date: string;
  time: string;
  paymentMethod: PaymentMethod;
  items: BuyerOrderItem[];
  totalAmount: number;
  status: 'Lunas';
}

interface UserRecord {
  id: string;
  role?: UserRole;
  username: string;
  usernameLower: string;
  ownerName: string;
  storeName: string;
  targetStoreId?: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
  storeState?: ReturnType<typeof getDefaultState>;
  orderHistory?: BuyerOrder[];
}

interface UsersDatabase {
  users: UserRecord[];
}

interface AuthenticatedRequest extends Request {
  authUser?: UserRecord;
}

const VALID_PAYMENT_METHODS: PaymentMethod[] = ['Tunai', 'QRIS', 'Transfer Bank'];

function getUserRole(user: UserRecord): UserRole {
  return user.role === 'pembeli' ? 'pembeli' : 'admin';
}

function getAdminStores(db: UsersDatabase): UserRecord[] {
  return db.users.filter((u) => getUserRole(u) === 'admin');
}

function getAdminStoresSummary(db: UsersDatabase) {
  return getAdminStores(db).map((adminUser) => {
    const storeState = normalizeState(adminUser.storeState);
    return {
      id: adminUser.id,
      storeName: storeState.storeProfile.storeName || adminUser.storeName,
      ownerName: storeState.storeProfile.ownerName || adminUser.ownerName,
      isOpen: Boolean(storeState.dailySession?.isOpen),
      dayNumber: Number(storeState.dailySession?.dayNumber) || 1
    };
  });
}

interface StoreProductRecord {
  id: string;
  name: string;
  category: string;
  imageUrl?: string;
  costPrice: number;
  sellPrice: number;
  stock: number;
}

function sanitizeCatalogForBuyer(adminUser: UserRecord) {
  const storeState = normalizeState(adminUser.storeState) as ReturnType<typeof getDefaultState>;
  const productsList = storeState.products as StoreProductRecord[];
  return {
    store: {
      id: adminUser.id,
      storeName: storeState.storeProfile.storeName || adminUser.storeName,
      ownerName: storeState.storeProfile.ownerName || adminUser.ownerName,
      isOpen: Boolean(storeState.dailySession?.isOpen),
      dayNumber: Number(storeState.dailySession?.dayNumber) || 1
    },
    products: productsList.map((p: StoreProductRecord) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      imageUrl: p.imageUrl,
      sellPrice: Number(p.sellPrice) || 0,
      stock: Math.max(0, Number(p.stock) || 0)
    }))
  };
}

function resolveTargetAdminStore(db: UsersDatabase, buyerUser: UserRecord): UserRecord | undefined {
  const admins = getAdminStores(db);
  if (admins.length === 0) return undefined;
  if (buyerUser.targetStoreId) {
    const matched = admins.find((u) => u.id === buyerUser.targetStoreId);
    if (matched) return matched;
  }
  return admins[0];
}

function ensureDatabase(): UsersDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial: UsersDatabase = { users: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<UsersDatabase>;
    if (!parsed || !Array.isArray(parsed.users)) {
      return { users: [] };
    }
    return { users: parsed.users };
  } catch {
    return { users: [] };
  }
}

function saveDatabase(db: UsersDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tempPath = path.resolve(DATA_DIR, `tokoku-users.${process.pid}.tmp`);
  if (!tempPath.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Invalid temp file path.');
  }
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tempPath, DB_FILE);
}

function hashPassword(password: string, saltHex: string): string {
  return crypto.scryptSync(password, saltHex, 64).toString('hex');
}

function verifyPassword(password: string, saltHex: string, expectedHashHex: string): boolean {
  const derived = crypto.scryptSync(password, saltHex, 64);
  const expected = Buffer.from(expectedHashHex, 'hex');
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

function createAuthToken(userId: string): string {
  const payloadObj = {
    sub: userId,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyAuthToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, providedSig] = parts;
  if (!payloadB64 || !providedSig) return null;

  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
    if (!parsed.sub || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed.sub;
  } catch {
    return null;
  }
}

function toPublicUser(user: UserRecord) {
  const role = getUserRole(user);
  return {
    id: user.id,
    role,
    username: user.username,
    ownerName: user.ownerName,
    storeName: user.storeName,
    ...(role === 'pembeli' && user.targetStoreId ? { targetStoreId: user.targetStoreId } : {})
  };
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan masuk terlebih dahulu.' });
    return;
  }
  const token = header.slice(7).trim();
  const userId = verifyAuthToken(token);
  if (!userId) {
    res.status(401).json({ error: 'Sesi sudah berakhir atau tidak valid. Silakan masuk kembali.' });
    return;
  }

  const db = ensureDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    res.status(401).json({ error: 'Akun pengguna tidak ditemukan.' });
    return;
  }

  req.authUser = user;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser || getUserRole(req.authUser) !== 'admin') {
    res.status(403).json({ error: 'Akses ditolak. Fitur ini hanya tersedia untuk Admin Toko.' });
    return;
  }
  next();
}

function requireBuyer(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser || getUserRole(req.authUser) !== 'pembeli') {
    res.status(403).json({ error: 'Akses ditolak. Fitur ini hanya tersedia untuk akun Pembeli.' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/auth/status', (_req, res) => {
    const db = ensureDatabase();
    const stores = getAdminStoresSummary(db);
    res.json({
      hasUsers: db.users.length > 0,
      hasAdminStores: stores.length > 0,
      stores
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const rawRole = body.role === undefined ? 'admin' : body.role;
    if (rawRole !== 'admin' && rawRole !== 'pembeli') {
      res.status(400).json({ error: 'Peran akun tidak valid. Pilih Admin atau Pembeli.' });
      return;
    }
    const role: UserRole = rawRole;

    const rawUsername = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    const storeName = typeof body.storeName === 'string' ? body.storeName.trim() : '';
    const requestedStoreId = typeof body.storeId === 'string' ? body.storeId.trim() : '';

    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(rawUsername)) {
      res.status(400).json({
        error: 'Username harus 3–32 karakter (huruf, angka, titik, garis bawah, atau tanda hubung).'
      });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'Kata sandi harus terdiri dari 6 hingga 128 karakter.' });
      return;
    }

    const db = ensureDatabase();
    const usernameLower = rawUsername.toLowerCase();
    if (db.users.some((u) => u.usernameLower === usernameLower)) {
      res.status(409).json({ error: 'Username sudah terdaftar. Gunakan username lain atau masuk.' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');

    if (role === 'admin') {
      if (!ownerName || ownerName.length > 48) {
        res.status(400).json({ error: 'Nama pemilik usaha wajib diisi (maksimal 48 karakter).' });
        return;
      }
      if (!storeName || storeName.length > 48) {
        res.status(400).json({ error: 'Nama usaha / toko wajib diisi (maksimal 48 karakter).' });
        return;
      }

      const initialStore = getDefaultState();
      initialStore.storeProfile.storeName = storeName;
      initialStore.storeProfile.ownerName = ownerName;

      const newAdmin: UserRecord = {
        id: 'USR-' + crypto.randomUUID(),
        role: 'admin',
        username: rawUsername,
        usernameLower,
        ownerName,
        storeName,
        passwordSalt: salt,
        passwordHash: hashPassword(password, salt),
        createdAt: new Date().toISOString(),
        storeState: initialStore
      };

      db.users.push(newAdmin);
      saveDatabase(db);

      const token = createAuthToken(newAdmin.id);
      res.status(201).json({
        token,
        user: toPublicUser(newAdmin),
        storeState: newAdmin.storeState
      });
      return;
    }

    // Registrasi akun Pembeli
    if (!ownerName || ownerName.length > 48) {
      res.status(400).json({ error: 'Nama lengkap pembeli wajib diisi (maksimal 48 karakter).' });
      return;
    }

    const admins = getAdminStores(db);
    if (admins.length === 0) {
      res.status(400).json({
        error: 'Belum ada toko admin yang terdaftar. Daftarkan akun Admin Toko terlebih dahulu.'
      });
      return;
    }

    const targetAdmin = requestedStoreId
      ? admins.find((u) => u.id === requestedStoreId)
      : admins[0];

    if (!targetAdmin) {
      res.status(400).json({ error: 'Toko tujuan yang dipilih tidak ditemukan.' });
      return;
    }

    const targetStoreState = normalizeState(targetAdmin.storeState);
    const resolvedStoreName = targetStoreState.storeProfile.storeName || targetAdmin.storeName;

    const newBuyer: UserRecord = {
      id: 'USR-' + crypto.randomUUID(),
      role: 'pembeli',
      username: rawUsername,
      usernameLower,
      ownerName,
      storeName: resolvedStoreName,
      targetStoreId: targetAdmin.id,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
      createdAt: new Date().toISOString(),
      orderHistory: []
    };

    db.users.push(newBuyer);
    saveDatabase(db);

    const token = createAuthToken(newBuyer.id);
    res.status(201).json({
      token,
      user: toPublicUser(newBuyer),
      shopData: sanitizeCatalogForBuyer(targetAdmin),
      orders: []
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const rawUsername = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!rawUsername || !password) {
      res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
      return;
    }

    const db = ensureDatabase();
    const user = db.users.find((u) => u.usernameLower === rawUsername);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      res.status(401).json({ error: 'Username atau kata sandi salah.' });
      return;
    }

    const token = createAuthToken(user.id);
    if (getUserRole(user) === 'pembeli') {
      const targetAdmin = resolveTargetAdminStore(db, user);
      res.json({
        token,
        user: toPublicUser(user),
        shopData: targetAdmin ? sanitizeCatalogForBuyer(targetAdmin) : null,
        orders: Array.isArray(user.orderHistory) ? user.orderHistory : []
      });
      return;
    }

    const normalizedStore = normalizeState(user.storeState);
    res.json({
      token,
      user: toPublicUser(user),
      storeState: normalizedStore
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    if (getUserRole(user) === 'pembeli') {
      const db = ensureDatabase();
      const targetAdmin = resolveTargetAdminStore(db, user);
      res.json({
        user: toPublicUser(user),
        shopData: targetAdmin ? sanitizeCatalogForBuyer(targetAdmin) : null,
        orders: Array.isArray(user.orderHistory) ? user.orderHistory : []
      });
      return;
    }

    res.json({
      user: toPublicUser(user),
      storeState: normalizeState(user.storeState)
    });
  });

  app.get('/api/store', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    res.json({ storeState: normalizeState(user.storeState) });
  });

  app.put('/api/store', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser!;
    const body = req.body as { storeState?: unknown };
    if (!body || !body.storeState || typeof body.storeState !== 'object') {
      res.status(400).json({ error: 'Format data toko tidak valid.' });
      return;
    }

    const normalized = normalizeState(body.storeState);
    const db = ensureDatabase();
    const idx = db.users.findIndex((u) => u.id === authUser.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Akun pengguna tidak ditemukan.' });
      return;
    }

    db.users[idx].storeState = normalized;
    db.users[idx].storeName = normalized.storeProfile.storeName;
    db.users[idx].ownerName = normalized.storeProfile.ownerName;
    saveDatabase(db);

    res.json({
      ok: true,
      user: toPublicUser(db.users[idx]),
      storeState: normalized
    });
  });

  app.get('/api/shop/catalog', requireAuth, requireBuyer, (req: AuthenticatedRequest, res) => {
    const buyer = req.authUser!;
    const db = ensureDatabase();
    const targetAdmin = resolveTargetAdminStore(db, buyer);
    if (!targetAdmin) {
      res.status(404).json({ error: 'Toko tujuan belum tersedia saat ini.' });
      return;
    }
    res.json(sanitizeCatalogForBuyer(targetAdmin));
  });

  app.get('/api/shop/orders', requireAuth, requireBuyer, (req: AuthenticatedRequest, res) => {
    const buyer = req.authUser!;
    res.json({
      orders: Array.isArray(buyer.orderHistory) ? buyer.orderHistory : []
    });
  });

  app.post('/api/shop/checkout', requireAuth, requireBuyer, (req: AuthenticatedRequest, res) => {
    const buyerAuth = req.authUser!;
    const body = req.body as {
      items?: unknown;
      paymentMethod?: unknown;
    };

    const paymentMethod = body?.paymentMethod;
    if (
      typeof paymentMethod !== 'string' ||
      !VALID_PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)
    ) {
      res.status(400).json({ error: 'Pilih metode pembayaran yang valid (Tunai, QRIS, atau Transfer Bank).' });
      return;
    }

    if (!Array.isArray(body?.items) || body.items.length === 0 || body.items.length > 50) {
      res.status(400).json({ error: 'Keranjang belanja kosong atau tidak valid.' });
      return;
    }

    const mergedQtyByProduct = new Map<string, number>();
    for (const rawItem of body.items) {
      if (!rawItem || typeof rawItem !== 'object') {
        res.status(400).json({ error: 'Format item keranjang tidak valid.' });
        return;
      }
      const productId = typeof (rawItem as { productId?: unknown }).productId === 'string'
        ? (rawItem as { productId: string }).productId.trim()
        : '';
      const qtyRaw = Number((rawItem as { qty?: unknown }).qty);
      if (!productId || !Number.isInteger(qtyRaw) || qtyRaw <= 0 || qtyRaw > 1000) {
        res.status(400).json({ error: 'Jumlah barang harus berupa bilangan bulat positif.' });
        return;
      }
      mergedQtyByProduct.set(productId, (mergedQtyByProduct.get(productId) || 0) + qtyRaw);
    }

    const db = ensureDatabase();
    const buyerIdx = db.users.findIndex((u) => u.id === buyerAuth.id);
    if (buyerIdx === -1) {
      res.status(404).json({ error: 'Akun pembeli tidak ditemukan.' });
      return;
    }
    const buyerUser = db.users[buyerIdx];
    const targetAdmin = resolveTargetAdminStore(db, buyerUser);
    if (!targetAdmin) {
      res.status(404).json({ error: 'Toko tujuan tidak ditemukan.' });
      return;
    }
    const adminIdx = db.users.findIndex((u) => u.id === targetAdmin.id);
    if (adminIdx === -1) {
      res.status(404).json({ error: 'Toko tujuan tidak ditemukan.' });
      return;
    }

    const adminStore = normalizeState(db.users[adminIdx].storeState) as ReturnType<typeof getDefaultState>;
    const adminProducts = adminStore.products as StoreProductRecord[];
    if (!adminStore.dailySession.isOpen) {
      res.status(400).json({ error: 'Toko sedang tutup. Checkout tidak dapat diproses saat ini.' });
      return;
    }

    const orderItems: BuyerOrderItem[] = [];
    let totalAmount = 0;
    let totalProfit = 0;

    for (const [productId, qty] of mergedQtyByProduct.entries()) {
      const product = adminProducts.find((p: StoreProductRecord) => p.id === productId);
      if (!product) {
        res.status(400).json({ error: 'Salah satu produk di keranjang sudah tidak tersedia.' });
        return;
      }
      if (product.stock < qty) {
        res.status(400).json({
          error: `Stok ${product.name} tidak mencukupi (tersisa ${product.stock} unit).`
        });
        return;
      }
      const unitPrice = Math.max(0, Number(product.sellPrice) || 0);
      const unitCost = Math.max(0, Number(product.costPrice) || 0);
      const subtotal = unitPrice * qty;
      const itemProfit = (unitPrice - unitCost) * qty;

      totalAmount += subtotal;
      totalProfit += itemProfit;
      orderItems.push({
        productId: product.id,
        name: product.name,
        qty,
        unitPrice,
        subtotal
      });
    }

    // Kurangi stok secara atomik setelah semua validasi lolos
    for (const item of orderItems) {
      const product = adminProducts.find((p: StoreProductRecord) => p.id === item.productId);
      if (product) {
        product.stock = Math.max(0, product.stock - item.qty);
      }
    }

    adminStore.storeProfile.cashBalance += totalAmount;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const dateStr = now.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    const itemSummary = orderItems.map((i) => `${i.name} x${i.qty}`).join(', ');
    const orderId = 'ORD-' + crypto.randomUUID().slice(0, 8).toUpperCase();

    const transactionsList = adminStore.transactions as Array<{
      id: string;
      dayNumber: number;
      date: string;
      time: string;
      type: string;
      summary: string;
      amount: number;
      profit: number;
      discountPercent: number;
    }>;

    transactionsList.unshift({
      id: 'TRX-' + now.getTime().toString().slice(-6),
      dayNumber: adminStore.dailySession.dayNumber,
      date: dateStr,
      time: timeStr,
      type: 'SALE',
      summary: `[Pembeli: ${buyerUser.ownerName} · ${paymentMethod}] ${itemSummary}`,
      amount: totalAmount,
      profit: totalProfit,
      discountPercent: 0
    });

    const newOrder: BuyerOrder = {
      id: orderId,
      storeId: targetAdmin.id,
      storeName: adminStore.storeProfile.storeName || targetAdmin.storeName,
      createdAt: now.toISOString(),
      date: dateStr,
      time: timeStr,
      paymentMethod: paymentMethod as PaymentMethod,
      items: orderItems,
      totalAmount,
      status: 'Lunas'
    };

    db.users[adminIdx].storeState = adminStore;
    if (!Array.isArray(buyerUser.orderHistory)) {
      buyerUser.orderHistory = [];
    }
    buyerUser.orderHistory.unshift(newOrder);
    buyerUser.targetStoreId = targetAdmin.id;
    buyerUser.storeName = newOrder.storeName;

    saveDatabase(db);

    const catalogPayload = sanitizeCatalogForBuyer(db.users[adminIdx]);
    res.json({
      ok: true,
      order: newOrder,
      store: catalogPayload.store,
      products: catalogPayload.products,
      orders: buyerUser.orderHistory
    });
  });

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TokoKu server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TokoKu server:', err);
  process.exit(1);
});
