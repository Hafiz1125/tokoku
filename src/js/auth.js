import { escapeHTML } from './utils.js';

// Token sesi disimpan strictly di memori JS (tidak di localStorage/sessionStorage)
let authToken = null;
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
}

export function clearAuthSession() {
  authToken = null;
  currentUser = null;
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

export async function loginUser({ username, password }) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  setAuthSession(data.token, data.user);
  return data;
}

export async function registerUser({ role, username, password, ownerName, storeName, storeId }) {
  const data = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ role, username, password, ownerName, storeName, storeId })
  });
  setAuthSession(data.token, data.user);
  return data;
}

export async function saveStoreToServer(storeState) {
  if (!authToken) return null;
  const data = await apiRequest('/api/store', {
    method: 'PUT',
    body: JSON.stringify({ storeState })
  });
  if (data.user) {
    currentUser = data.user;
  }
  return data;
}

export async function fetchShopCatalog() {
  return apiRequest('/api/shop/catalog', { method: 'GET' });
}

export async function fetchBuyerOrders() {
  return apiRequest('/api/shop/orders', { method: 'GET' });
}

export async function submitBuyerCheckout({ items, paymentMethod }) {
  return apiRequest('/api/shop/checkout', {
    method: 'POST',
    body: JSON.stringify({ items, paymentMethod })
  });
}

export function initAuthScreen({ onAuthenticated }) {
  let mode = 'login'; // 'login' | 'register'
  let registerRole = 'admin'; // 'admin' | 'pembeli'
  let passwordVisible = false;
  let availableStores = [];

  const loginTabBtn = document.getElementById('auth-tab-login');
  const registerTabBtn = document.getElementById('auth-tab-register');
  const registerFields = document.getElementById('auth-register-fields');
  const roleAdminBtn = document.getElementById('auth-role-admin');
  const roleBuyerBtn = document.getElementById('auth-role-buyer');
  const adminFields = document.getElementById('auth-admin-fields');
  const buyerFields = document.getElementById('auth-buyer-fields');
  const noStoreNote = document.getElementById('auth-no-store-note');
  const form = document.getElementById('auth-form');
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const ownerInput = document.getElementById('auth-owner-name');
  const storeInput = document.getElementById('auth-store-name');
  const buyerNameInput = document.getElementById('auth-buyer-name');
  const targetStoreSelect = document.getElementById('auth-target-store');
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

  function renderStoreOptions(stores) {
    availableStores = Array.isArray(stores) ? stores : [];
    if (targetStoreSelect instanceof HTMLSelectElement) {
      if (availableStores.length === 0) {
        targetStoreSelect.innerHTML = '<option value="">Belum ada toko tersedia</option>';
        targetStoreSelect.disabled = true;
      } else {
        targetStoreSelect.disabled = false;
        targetStoreSelect.innerHTML = availableStores
          .map(
            (s) =>
              `<option value="${escapeHTML(s.id)}">${escapeHTML(s.storeName)} (${s.isOpen ? 'Buka' : 'Tutup'})</option>`
          )
          .join('');
      }
    }
    if (noStoreNote) {
      noStoreNote.classList.toggle('hidden', availableStores.length > 0);
    }
  }

  function updateFieldRequirements() {
    const isReg = mode === 'register';
    const isAdminReg = isReg && registerRole === 'admin';
    const isBuyerReg = isReg && registerRole === 'pembeli';

    if (adminFields) adminFields.classList.toggle('hidden', !isAdminReg);
    if (buyerFields) buyerFields.classList.toggle('hidden', !isBuyerReg);

    if (ownerInput instanceof HTMLInputElement) ownerInput.required = isAdminReg;
    if (storeInput instanceof HTMLInputElement) storeInput.required = isAdminReg;
    if (buyerNameInput instanceof HTMLInputElement) buyerNameInput.required = isBuyerReg;
    if (targetStoreSelect instanceof HTMLSelectElement) {
      targetStoreSelect.required = isBuyerReg && availableStores.length > 0;
    }

    if (submitBtn) {
      if (!isReg) {
        submitBtn.textContent = 'Masuk ke TokoKu';
      } else {
        submitBtn.textContent =
          registerRole === 'pembeli' ? 'Daftar & Mulai Belanja' : 'Daftar & Kelola Toko';
      }
    }
  }

  function setRegisterRole(nextRole) {
    registerRole = nextRole === 'pembeli' ? 'pembeli' : 'admin';
    setError('');

    const activeClass =
      'py-2.5 px-3 min-h-[42px] rounded-xl text-xs font-bold border border-teal-700 bg-teal-50 text-teal-800 transition cursor-pointer';
    const inactiveClass =
      'py-2.5 px-3 min-h-[42px] rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:border-slate-300 transition cursor-pointer';

    if (roleAdminBtn && roleBuyerBtn) {
      if (registerRole === 'admin') {
        roleAdminBtn.className = activeClass;
        roleAdminBtn.setAttribute('aria-pressed', 'true');
        roleBuyerBtn.className = inactiveClass;
        roleBuyerBtn.setAttribute('aria-pressed', 'false');
      } else {
        roleBuyerBtn.className = activeClass;
        roleBuyerBtn.setAttribute('aria-pressed', 'true');
        roleAdminBtn.className = inactiveClass;
        roleAdminBtn.setAttribute('aria-pressed', 'false');
      }
    }

    updateFieldRequirements();
  }

  function setMode(nextMode) {
    mode = nextMode;
    setError('');

    const isReg = mode === 'register';
    if (registerFields) {
      registerFields.classList.toggle('hidden', !isReg);
    }

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

    updateFieldRequirements();
  }

  async function syncAuthStatus(preferAutoMode = false) {
    try {
      const status = await fetchAuthStatus();
      renderStoreOptions(status.stores);
      if (preferAutoMode) {
        if (!status.hasUsers) {
          firstRunNote?.classList.remove('hidden');
          setRegisterRole('admin');
          setMode('register');
        } else {
          firstRunNote?.classList.add('hidden');
          setMode('login');
        }
      }
    } catch {
      if (preferAutoMode) setMode('login');
    }
  }

  loginTabBtn?.addEventListener('click', () => setMode('login'));
  registerTabBtn?.addEventListener('click', () => {
    setMode('register');
    syncAuthStatus(false);
  });
  roleAdminBtn?.addEventListener('click', () => setRegisterRole('admin'));
  roleBuyerBtn?.addEventListener('click', () => setRegisterRole('pembeli'));

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

  setRegisterRole('admin');
  syncAuthStatus(true);

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');

    const username = usernameInput instanceof HTMLInputElement ? usernameInput.value.trim() : '';
    const password = passwordInput instanceof HTMLInputElement ? passwordInput.value : '';
    const adminOwnerName = ownerInput instanceof HTMLInputElement ? ownerInput.value.trim() : '';
    const storeName = storeInput instanceof HTMLInputElement ? storeInput.value.trim() : '';
    const buyerFullName = buyerNameInput instanceof HTMLInputElement ? buyerNameInput.value.trim() : '';
    const selectedStoreId =
      targetStoreSelect instanceof HTMLSelectElement ? targetStoreSelect.value : '';

    if (mode === 'register' && registerRole === 'pembeli' && availableStores.length === 0) {
      setError('Belum ada toko admin yang tersedia. Silakan daftar sebagai Admin Toko terlebih dahulu.');
      return;
    }

    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = true;
      submitBtn.textContent = mode === 'register' ? 'Mendaftarkan akun...' : 'Memeriksa akun...';
    }

    try {
      const payload =
        mode === 'register'
          ? await registerUser({
              role: registerRole,
              username,
              password,
              ownerName: registerRole === 'pembeli' ? buyerFullName : adminOwnerName,
              storeName,
              storeId: selectedStoreId
            })
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
        updateFieldRequirements();
      }
    }
  });

  return {
    resetToLogin: async () => {
      setError('');
      if (passwordInput instanceof HTMLInputElement) passwordInput.value = '';
      await syncAuthStatus(true);
    }
  };
}
