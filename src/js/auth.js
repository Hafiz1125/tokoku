import { escapeHTML } from './utils.js';

const AUTH_TOKEN_STORAGE_KEY = 'tokoku_auth_token_v1';

function readStoredToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

let authToken = readStoredToken();
let currentUser = null;

export function getAuthToken() {
  return authToken;
}

export function getCurrentUser() {
  return currentUser;
}

export function setAuthSession(token, user) {
  authToken = token || null;
  currentUser = user || null;
  writeStoredToken(authToken);
}

export function clearAuthSession() {
  authToken = null;
  currentUser = null;
  writeStoredToken(null);
}

async function apiRequest(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Permintaan gagal (${response.status}).`);
  }
  return data;
}

export async function fetchAuthStatus() {
  return apiRequest('/api/auth/status', { method: 'GET' });
}

export async function restoreAuthSession() {
  const stored = readStoredToken();
  if (!stored) return null;
  authToken = stored;
  try {
    const data = await apiRequest('/api/auth/me', { method: 'GET' });
    if (data?.user && data?.storeState) {
      currentUser = data.user;
      return data;
    }
  } catch {
    clearAuthSession();
  }
  return null;
}

export async function loginUser({ username, password }) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  setAuthSession(data.token, data.user);
  return data;
}

export async function registerUser({ username, password, ownerName, storeName }) {
  const data = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, ownerName, storeName })
  });
  setAuthSession(data.token, data.user);
  return data;
}

export async function saveStoreToServer(storeState, { keepalive = false } = {}) {
  if (!authToken) return null;
  const body = JSON.stringify({
    storeState,
    syncSource: keepalive ? 'pagehide' : 'action'
  });
  const useKeepalive = Boolean(keepalive && body.length < 60000);
  const data = await apiRequest('/api/store', {
    method: 'PUT',
    keepalive: useKeepalive,
    body
  });
  if (data.user) {
    currentUser = data.user;
  }
  return data;
}

export function initAuthScreen({ onAuthenticated }) {
  let mode = 'login'; // 'login' | 'register'
  let passwordVisible = false;

  const loginTabBtn = document.getElementById('auth-tab-login');
  const registerTabBtn = document.getElementById('auth-tab-register');
  const registerFields = document.getElementById('auth-register-fields');
  const form = document.getElementById('auth-form');
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const ownerInput = document.getElementById('auth-owner-name');
  const storeInput = document.getElementById('auth-store-name');
  const togglePwdBtn = document.getElementById('auth-toggle-password');
  const errorBox = document.getElementById('auth-error-box');
  const firstRunNote = document.getElementById('auth-firstrun-note');
  const submitBtn = document.getElementById('auth-submit-btn');

  function setError(message) {
    if (!errorBox) return;
    if (!message) {
      errorBox.classList.add('hidden');
      errorBox.textContent = '';
      return;
    }
    errorBox.classList.remove('hidden');
    errorBox.innerHTML = escapeHTML(message);
  }

  function setMode(nextMode) {
    mode = nextMode;
    setError('');

    const isReg = mode === 'register';
    if (registerFields) {
      registerFields.classList.toggle('hidden', !isReg);
    }
    if (ownerInput instanceof HTMLInputElement) ownerInput.required = isReg;
    if (storeInput instanceof HTMLInputElement) storeInput.required = isReg;

    if (loginTabBtn && registerTabBtn) {
      if (isReg) {
        registerTabBtn.className =
          'flex-1 py-2 px-3 min-h-[40px] rounded-lg text-xs sm:text-sm font-bold bg-white text-slate-900 shadow-xs transition cursor-pointer';
        loginTabBtn.className =
          'flex-1 py-2 px-3 min-h-[40px] rounded-lg text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer';
      } else {
        loginTabBtn.className =
          'flex-1 py-2 px-3 min-h-[40px] rounded-lg text-xs sm:text-sm font-bold bg-white text-slate-900 shadow-xs transition cursor-pointer';
        registerTabBtn.className =
          'flex-1 py-2 px-3 min-h-[40px] rounded-lg text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer';
      }
    }

    if (submitBtn) {
      submitBtn.textContent = isReg ? 'Daftar & Masuk ke Toko' : 'Masuk ke TokoKu';
    }
  }

  loginTabBtn?.addEventListener('click', () => setMode('login'));
  registerTabBtn?.addEventListener('click', () => setMode('register'));

  togglePwdBtn?.addEventListener('click', () => {
    passwordVisible = !passwordVisible;
    if (passwordInput instanceof HTMLInputElement) {
      passwordInput.type = passwordVisible ? 'text' : 'password';
    }
    const eyeSpan = togglePwdBtn.querySelector('[data-eye-icon]');
    if (eyeSpan) {
      eyeSpan.setAttribute('data-icon', passwordVisible ? 'eye-off' : 'eye');
    }
    window.dispatchEvent(new CustomEvent('tokoku:refresh-icons'));
  });

  // Cek apakah sudah ada akun terdaftar untuk memandu pengguna baru
  fetchAuthStatus()
    .then(({ hasUsers }) => {
      if (!hasUsers) {
        firstRunNote?.classList.remove('hidden');
        setMode('register');
      } else {
        firstRunNote?.classList.add('hidden');
        setMode('login');
      }
    })
    .catch(() => {
      setMode('login');
    });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');

    const username = usernameInput instanceof HTMLInputElement ? usernameInput.value.trim() : '';
    const password = passwordInput instanceof HTMLInputElement ? passwordInput.value : '';
    const ownerName = ownerInput instanceof HTMLInputElement ? ownerInput.value.trim() : '';
    const storeName = storeInput instanceof HTMLInputElement ? storeInput.value.trim() : '';

    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = true;
      submitBtn.textContent = mode === 'register' ? 'Mendaftarkan akun...' : 'Memeriksa akun...';
    }

    try {
      const payload =
        mode === 'register'
          ? await registerUser({ username, password, ownerName, storeName })
          : await loginUser({ username, password });

      if (passwordInput instanceof HTMLInputElement) {
        passwordInput.value = '';
      }
      onAuthenticated(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke sistem.');
    } finally {
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'register' ? 'Daftar & Masuk ke Toko' : 'Masuk ke TokoKu';
      }
    }
  });

  return {
    resetToLogin: async () => {
      setError('');
      if (passwordInput instanceof HTMLInputElement) passwordInput.value = '';
      try {
        const { hasUsers } = await fetchAuthStatus();
        firstRunNote?.classList.toggle('hidden', hasUsers);
        setMode(hasUsers ? 'login' : 'register');
      } catch {
        setMode('login');
      }
    }
  };
}
