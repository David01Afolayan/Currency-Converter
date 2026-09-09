// Currency list (20+). Map currency code -> {name, flag}
const currencies = {
  USD: { name: 'US Dollar', flag: '🇺🇸' },
  EUR: { name: 'Euro', flag: '🇪🇺' },
  GBP: { name: 'British Pound', flag: '🇬🇧' },
  JPY: { name: 'Japanese Yen', flag: '🇯🇵' },
  AUD: { name: 'Australian Dollar', flag: '🇦🇺' },
  CAD: { name: 'Canadian Dollar', flag: '🇨🇦' },
  CHF: { name: 'Swiss Franc', flag: '🇨🇭' },
  CNY: { name: 'Chinese Yuan', flag: '🇨🇳' },
  HKD: { name: 'Hong Kong Dollar', flag: '🇭🇰' },
  NZD: { name: 'New Zealand Dollar', flag: '🇳🇿' },
  SEK: { name: 'Swedish Krona', flag: '🇸🇪' },
  NOK: { name: 'Norwegian Krone', flag: '🇳🇴' },
  DKK: { name: 'Danish Krone', flag: '🇩🇰' },
  INR: { name: 'Indian Rupee', flag: '🇮🇳' },
  RUB: { name: 'Russian Ruble', flag: '🇷🇺' },
  BRL: { name: 'Brazilian Real', flag: '🇧🇷' },
  ZAR: { name: 'South African Rand', flag: '🇿🇦' },
  SGD: { name: 'Singapore Dollar', flag: '🇸🇬' },
  KRW: { name: 'South Korean Won', flag: '🇰🇷' },
  MXN: { name: 'Mexican Peso', flag: '🇲🇽' },
  TRY: { name: 'Turkish Lira', flag: '🇹🇷' },
  IDR: { name: 'Indonesian Rupiah', flag: '🇮🇩' },
  THB: { name: 'Thai Baht', flag: '🇹🇭' },
  PLN: { name: 'Polish Zloty', flag: '🇵🇱' },
  HUF: { name: 'Hungarian Forint', flag: '🇭🇺' },
  CZK: { name: 'Czech Koruna', flag: '🇨🇿' },
  ILS: { name: 'Israeli Shekel', flag: '🇮🇱' },
  AED: { name: 'UAE Dirham', flag: '🇦🇪' },
  SAR: { name: 'Saudi Riyal', flag: '🇸🇦' },
  COP: { name: 'Colombian Peso', flag: '🇨🇴' }
};

// DOM refs (declared here and assigned after DOM is ready)
let amountEl, fromEl, toEl, convertBtn, resultEl, resultMain, rateInfo, swapBtn, historyList, clearHistoryBtn, copyResultBtn, converterForm, exportHistoryBtn;

// Settings UI refs
let openSettingsBtn, settingsDialog, precisionInput, cacheTtlInput, saveSettingsBtn, closeSettingsBtn;

// Simple in-memory cache for rates per base
const rateCache = {}; // { base: { ts, rates, fetchedAt } }
let CACHE_TTL_MINUTES = 10; // default minutes, can be changed via settings
let DECIMAL_PRECISION = 4; // default
// Replace this placeholder with your ExchangeRate-API key.
const API_KEY = 'da1336403a3b7eefb52d9885';

// Local storage key
const HISTORY_KEY = 'conversionHistory';
const SETTINGS_KEY = 'converterSettings';

function normalizeApiKey(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getApiErrorMessage(payload) {
  if (!payload || typeof payload !== 'object') return 'Unknown API error';
  const error = payload.error || {};
  if (error.info) return error.info;
  if (error.type) return error.type;
  return 'API request failed';
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      persistSettings();
      return;
    }
    const s = JSON.parse(raw);
    if (typeof s.cacheTtlMinutes === 'number') CACHE_TTL_MINUTES = s.cacheTtlMinutes;
    if (typeof s.precision === 'number') DECIMAL_PRECISION = s.precision;
  } catch (e) {
    persistSettings();
  }
}

function persistSettings() {
  const s = { cacheTtlMinutes: CACHE_TTL_MINUTES, precision: DECIMAL_PRECISION };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function populateCurrencySelects() {
  Object.entries(currencies).forEach(([code, meta]) => {
    const label = `${meta.flag} ${code} — ${meta.name}`;
    const o1 = new Option(label, code);
    const o2 = new Option(label, code);
    fromEl.add(o1);
    toEl.add(o2);
  });
  // sensible defaults
  fromEl.value = 'USD';
  toEl.value = 'EUR';
}

async function fetchRates(base) {
  const now = Date.now();
  const cached = rateCache[base];
  const ttlMs = CACHE_TTL_MINUTES * 60 * 1000;
  if (cached && (now - cached.ts) < ttlMs) return cached.rates;

  const url = new URL(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${base}`);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const json = await res.json();
    if (!json || json.result !== 'success') {
      throw new Error(`API error: ${json?.['error-type'] || 'Invalid response from rates API'}`);
    }
    rateCache[base] = { ts: now, rates: json.conversion_rates, fetchedAt: json.time_last_update_utc || now };
    return json.conversion_rates;
  } catch (err) {
    console.error('fetchRates error for base', base, err);
    throw err;
  }
}

function saveHistoryItem(item) {
  const hist = loadHistory();
  hist.unshift(item);
  // keep latest 50
  const trimmed = hist.slice(0, 50);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  renderHistory(trimmed);
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function renderHistory(list) {
  historyList.innerHTML = '';
  if (!list || list.length === 0) {
    historyList.innerHTML = '<li>No history yet</li>';
    return;
  }
  list.forEach(item => {
    const li = document.createElement('li');
    const fromFlag = (currencies[item.from] && currencies[item.from].flag) || '';
    const toFlag = (currencies[item.to] && currencies[item.to].flag) || '';
    const time = new Date(item.ts).toLocaleString();
    li.textContent = `${time} — ${fromFlag} ${item.amount} ${item.from} → ${toFlag} ${item.converted} ${item.to} (rate: ${item.rate.toFixed(6)})`;
    historyList.appendChild(li);
  });
}

function setLoading(isLoading) {
  if (isLoading) {
    convertBtn.disabled = true;
    convertBtn.textContent = 'Converting…';
  } else {
    convertBtn.disabled = false;
    convertBtn.textContent = 'Convert';
  }
}

async function convert() {
  const amount = parseFloat(amountEl.value);
  if (!(amount > 0)) {
    alert('Enter a valid amount greater than 0');
    amountEl.focus();
    return;
  }
  const from = fromEl.value;
  const to = toEl.value;
  setLoading(true);
  rateInfo.textContent = '';
  try {
    const rates = await fetchRates(from);
    const rate = rates && rates[to];
    if (rate) {
      const converted = + (amount * rate).toFixed(DECIMAL_PRECISION);
      resultMain.textContent = `${amount} ${from} = ${converted} ${to}`;
      rateInfo.textContent = `Rate: ${rate.toFixed(6)}`;
      const histItem = { ts: Date.now(), from, to, amount, converted, rate };
      saveHistoryItem(histItem);
    } else {
      throw new Error(`API error: no rate available for ${to}`);
    }
  } catch (err) {
    console.error('Conversion failed:', err);
    const message = err && err.message ? err.message : 'Unknown conversion error';
    resultMain.textContent = message.startsWith('API error:')
      ? `API error — ${message.replace('API error: ', '')}`
      : 'Conversion error — try again (see console)';
    rateInfo.textContent = message.startsWith('API error:')
      ? 'Check your API key in Settings.'
      : '';
  } finally {
    setLoading(false);
  }
}

function copyResultToClipboard() {
  const text = resultMain.textContent || '';
  if (!text) return;
  navigator.clipboard?.writeText(text).then(() => {
    copyResultBtn.textContent = 'Copied';
    setTimeout(() => (copyResultBtn.textContent = 'Copy'), 1500);
  }).catch(() => {
    alert('Copy failed');
  });
}

function exportHistory() {
  const hist = loadHistory();
  const blob = new Blob([JSON.stringify(hist, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'conversion-history.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setupEventListeners() {
  convertBtn.addEventListener('click', convert);

  // allow Enter to submit conversion
  converterForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    convert();
  });

  swapBtn.addEventListener('click', () => {
    const a = fromEl.value;
    fromEl.value = toEl.value;
    toEl.value = a;
    // trigger a conversion when swapping
    convert();
  });

  fromEl.addEventListener('change', () => fetchRates(fromEl.value).catch(()=>{}));

  clearHistoryBtn.addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory([]);
  });

  copyResultBtn?.addEventListener('click', copyResultToClipboard);

  exportHistoryBtn?.addEventListener('click', exportHistory);

  // settings
  openSettingsBtn?.addEventListener('click', () => {
    if (settingsDialog.showModal) {
      precisionInput.value = DECIMAL_PRECISION;
      cacheTtlInput.value = CACHE_TTL_MINUTES;
      settingsDialog.showModal();
    } else {
      // fallback: toggle visibility
      settingsDialog.style.display = settingsDialog.style.display === 'block' ? 'none' : 'block';
    }
  });

  saveSettingsBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    const p = parseInt(precisionInput.value, 10);
    const t = parseInt(cacheTtlInput.value, 10);
    if (!Number.isFinite(p) || p < 0) return alert('Precision must be a non-negative integer');
    if (!Number.isFinite(t) || t < 0) return alert('Cache TTL must be a non-negative integer');
    DECIMAL_PRECISION = Math.min(8, Math.max(0, p));
    CACHE_TTL_MINUTES = Math.min(1440, Math.max(0, t));
    persistSettings();
    if (settingsDialog.close) settingsDialog.close();
  });

  closeSettingsBtn?.addEventListener('click', () => settingsDialog.close());

  // keyboard shortcuts: Ctrl+K to focus amount
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      amountEl.focus();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // assign DOM refs now that the document is ready
  amountEl = document.getElementById('amount');
  fromEl = document.getElementById('from');
  toEl = document.getElementById('to');
  convertBtn = document.getElementById('convertBtn');
  resultEl = document.getElementById('result');
  resultMain = document.querySelector('.result-main');
  rateInfo = document.getElementById('rateInfo');
  swapBtn = document.getElementById('swap');
  historyList = document.getElementById('historyList');
  clearHistoryBtn = document.getElementById('clearHistory');
  copyResultBtn = document.getElementById('copyResult');
  converterForm = document.getElementById('converterForm');
  exportHistoryBtn = document.getElementById('exportHistory');

  openSettingsBtn = document.getElementById('openSettings');
  settingsDialog = document.getElementById('settingsDialog');
  precisionInput = document.getElementById('precision');
  cacheTtlInput = document.getElementById('cacheTtl');
  saveSettingsBtn = document.getElementById('saveSettings');
  closeSettingsBtn = document.getElementById('closeSettings');

  loadSettings();
  populateCurrencySelects();
  setupEventListeners();
  renderHistory(loadHistory());
});