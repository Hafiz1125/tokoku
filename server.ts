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

interface UserRecord {
  id: string;
  role?: string;
  username: string;
  usernameLower: string;
  ownerName: string;
  storeName: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
  storeState: ReturnType<typeof getDefaultState>;
}

interface UsersDatabase {
  users: UserRecord[];
}

interface AuthenticatedRequest extends Request {
  authUser?: UserRecord;
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
  return {
    id: user.id,
    username: user.username,
    ownerName: user.ownerName,
    storeName: user.storeName
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
  const user = db.users.find((u) => u.id === userId && u.role !== 'pembeli');
  if (!user) {
    res.status(401).json({ error: 'Akun pengguna tidak ditemukan.' });
    return;
  }

  req.authUser = user;
  next();
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/auth/status', (_req, res) => {
    const db = ensureDatabase();
    res.json({ hasUsers: db.users.some((u) => u.role !== 'pembeli') });
  });

  app.post('/api/auth/register', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const rawUsername = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    const storeName = typeof body.storeName === 'string' ? body.storeName.trim() : '';

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
    if (!ownerName || ownerName.length > 48) {
      res.status(400).json({ error: 'Nama pemilik usaha wajib diisi (maksimal 48 karakter).' });
      return;
    }
    if (!storeName || storeName.length > 48) {
      res.status(400).json({ error: 'Nama usaha / toko wajib diisi (maksimal 48 karakter).' });
      return;
    }

    const db = ensureDatabase();
    const usernameLower = rawUsername.toLowerCase();
    if (db.users.some((u) => u.usernameLower === usernameLower)) {
      res.status(409).json({ error: 'Username sudah terdaftar. Gunakan username lain atau masuk.' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const initialStore = getDefaultState();
    initialStore.storeProfile.storeName = storeName;
    initialStore.storeProfile.ownerName = ownerName;

    const newUser: UserRecord = {
      id: 'USR-' + crypto.randomUUID(),
      username: rawUsername,
      usernameLower,
      ownerName,
      storeName,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
      createdAt: new Date().toISOString(),
      storeState: initialStore
    };

    db.users.push(newUser);
    saveDatabase(db);

    const token = createAuthToken(newUser.id);
    res.status(201).json({
      token,
      user: toPublicUser(newUser),
      storeState: newUser.storeState
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
    if (user.role === 'pembeli') {
      res.status(403).json({ error: 'Akun pembeli sudah dinonaktifkan. Gunakan akun kasir / pengelola toko.' });
      return;
    }

    const normalizedStore = normalizeState(user.storeState);
    const token = createAuthToken(user.id);
    res.json({
      token,
      user: toPublicUser(user),
      storeState: normalizedStore
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    res.json({
      user: toPublicUser(user),
      storeState: normalizeState(user.storeState)
    });
  });

  app.get('/api/store', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    res.json({ storeState: normalizeState(user.storeState) });
  });

  app.put('/api/store', requireAuth, (req: AuthenticatedRequest, res) => {
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
