(() => {
  const exprEl = document.getElementById('expr');
  const valueEl = document.getElementById('value');
  const valueCopyBtn = document.getElementById('valueCopy');
  const memEl = document.getElementById('mem');

  const historyListEl = document.getElementById('historyList');
  const historyEmptyEl = document.getElementById('historyEmpty');
  const historyCopyBtn = document.getElementById('historyCopy');
  const historyClearBtn = document.getElementById('historyClear');

  const MEMORY_KEY = 'calcMemory:v1';
  const HISTORY_KEY = 'calcHistory:v1';
  const HISTORY_MAX = 10;

  /** @typedef {{ id: string; expr: string; result: string }} HistoryItem */

  /** @type {HistoryItem[]} */
  let history = [];

  /** @type {(number|string)[]} */
  let tokens = [];
  let current = '';
  let lastWasEquals = false;
  let error = false;

  let memory = 0;

  const ERROR_TEXT = '錯誤';
  const MAX_DISPLAY_CHARS = 14;

  function safeParseJSON(s) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  function stripMantissaZeros(s) {
    const parts = String(s).split(/e/i);
    const mantissa = parts[0].replace(/\.?0+$/, '').replace(/\.$/, '');
    if (parts.length === 1) return mantissa;
    const exp = parts[1].replace(/^\+/, '');
    return `${mantissa}e${exp}`;
  }

  function formatNumberForDisplay(n) {
    if (!Number.isFinite(n)) return ERROR_TEXT;
    if (Object.is(n, -0)) n = 0;

    let s = stripMantissaZeros(String(n));
    if (s.length <= MAX_DISPLAY_CHARS) return s;

    for (const sig of [12, 10, 8, 6]) {
      s = stripMantissaZeros(n.toPrecision(sig));
      if (s.length <= MAX_DISPLAY_CHARS + 4) return s;
    }

    return stripMantissaZeros(n.toExponential(6));
  }

  function formatInputForDisplay(text) {
    if (text === '') return '0';
    if (text === '-') return '-';
    if (text.length <= MAX_DISPLAY_CHARS) return text;

    const n = Number(text);
    if (!Number.isFinite(n)) return text.slice(0, MAX_DISPLAY_CHARS);
    return formatNumberForDisplay(n);
  }

  async function copyTextToClipboard(text) {
    const t = String(text || '').trim();
    if (!t) return;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(t);
      return;
    }

    const ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  function loadMemory() {
    try {
      const raw = localStorage.getItem(MEMORY_KEY);
      const n = raw === null ? 0 : Number(raw);
      memory = Number.isFinite(n) ? n : 0;
    } catch {
      memory = 0;
    }
  }

  function saveMemory() {
    try {
      if (memory === 0) localStorage.removeItem(MEMORY_KEY);
      else localStorage.setItem(MEMORY_KEY, String(memory));
    } catch {
      // ignore
    }
  }

  function clearMemory() {
    memory = 0;
    saveMemory();
  }

  function renderMemory() {
    if (!memEl) return;
    const active = memory !== 0;
    memEl.classList.toggle('active', active);
    memEl.textContent = active ? `M ${formatNumberForDisplay(memory)}` : 'M';
  }

  function loadHistory() {
    if (!historyListEl) return;
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? safeParseJSON(raw) : null;
    if (!Array.isArray(parsed)) {
      history = [];
      return;
    }

    history = parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        id: typeof x.id === 'string' ? x.id : makeId(),
        expr: typeof x.expr === 'string' ? x.expr : '',
        result: typeof x.result === 'string' ? x.result : '',
      }))
      .filter((x) => x.expr && x.result)
      .slice(0, HISTORY_MAX);
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
    } catch {
      // ignore
    }
  }

  function setHistoryEmptyState() {
    if (!historyEmptyEl || !historyListEl) return;
    const isEmpty = history.length === 0;
    historyEmptyEl.style.display = isEmpty ? 'block' : 'none';
    historyListEl.style.display = isEmpty ? 'none' : 'grid';
  }

  function renderHistory() {
    if (!historyListEl) return;
    historyListEl.innerHTML = '';

    for (const item of history) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-item';
      btn.setAttribute('data-id', item.id);
      btn.setAttribute('aria-label', `Restore ${item.result}`);

      const exprSpan = document.createElement('span');
      exprSpan.className = 'history-expr';
      exprSpan.textContent = item.expr;

      const resultSpan = document.createElement('span');
      resultSpan.className = 'history-result';
      resultSpan.textContent = item.result;

      btn.append(exprSpan, resultSpan);
      li.appendChild(btn);
      historyListEl.appendChild(li);
    }

    setHistoryEmptyState();
  }

  function makeId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function prettyOp(op) {
    if (op === '*') return '×';
    if (op === '/') return '÷';
    if (op === '-') return '−';
    return op;
  }

  function formatExprFromTokens(list) {
    return list
      .map((t) => {
        if (typeof t === 'string') return prettyOp(t);
        return formatNumberForDisplay(t);
      })
      .filter((t) => t !== '')
      .join(' ');
  }

  function addToHistory(expr, result) {
    if (!historyListEl) return;
    const trimmedExpr = String(expr || '').trim();
    const trimmedResult = String(result || '').trim();
    if (!trimmedExpr || !trimmedResult || trimmedResult === ERROR_TEXT) return;

    const id = makeId();
    const next = [{ id, expr: trimmedExpr, result: trimmedResult }, ...history];
    history = next
      .filter((x, i, arr) => i === 0 || !(x.expr === arr[i - 1].expr && x.result === arr[i - 1].result))
      .slice(0, HISTORY_MAX);

    saveHistory();
    renderHistory();
  }

  async function copyHistoryToClipboard() {
    const lines = history.map((h) => `${h.expr} = ${h.result}`);
    const text = lines.join('\n');
    await copyTextToClipboard(text);
  }

  function restoreFromHistoryItem(item) {
    const n = Number(item.result);
    if (!Number.isFinite(n)) return;
    tokens = [n];
    current = '';
    lastWasEquals = true;
    error = false;
    render();
  }

  function clearErrorForInput() {
    if (!error) return;
    tokens = [];
    current = '';
    lastWasEquals = false;
    error = false;
  }

  function render() {
    if (!exprEl || !valueEl) return;

    const exprParts = [...tokens, current].filter((t) => t !== '' && t !== null && t !== undefined);
    exprEl.textContent = formatExprFromTokens(exprParts);

    if (error) {
      valueEl.textContent = ERROR_TEXT;
    } else if (current !== '') {
      valueEl.textContent = formatInputForDisplay(current);
    } else if (tokens.length) {
      const last = tokens[tokens.length - 1];
      valueEl.textContent = typeof last === 'number' ? formatNumberForDisplay(last) : '0';
    } else {
      valueEl.textContent = '0';
    }

    renderMemory();
  }

  function resetAll() {
    tokens = [];
    current = '';
    lastWasEquals = false;
    error = false;
    render();
  }

  function commitCurrentNumber() {
    if (current === '' || current === '-') return false;
    const n = Number(current);
    if (!Number.isFinite(n)) {
      error = true;
      render();
      return false;
    }
    tokens.push(n);
    current = '';
    return true;
  }

  function appendDigit(d) {
    clearErrorForInput();

    if (lastWasEquals) {
      tokens = [];
      current = '';
      lastWasEquals = false;
    }

    if (current === '0') current = d;
    else if (current === '-0') current = `-${d}`;
    else current += d;

    render();
  }

  function appendDot() {
    clearErrorForInput();

    if (lastWasEquals) {
      tokens = [];
      current = '';
      lastWasEquals = false;
    }

    if (current === '') current = '0.';
    else if (current === '-') current = '-0.';
    else if (!current.includes('.')) current += '.';

    render();
  }

  function setOperator(op) {
    if (error) return;

    if (lastWasEquals) lastWasEquals = false;

    if (current !== '' && current !== '-') {
      if (!commitCurrentNumber()) return;
    }

    if (tokens.length === 0) {
      if (op === '-') {
        current = '-';
        render();
      }
      return;
    }

    const last = tokens[tokens.length - 1];
    if (typeof last === 'string') tokens[tokens.length - 1] = op;
    else tokens.push(op);

    render();
  }

  function backspace() {
    if (error) return;
    if (lastWasEquals) return;

    if (current !== '') {
      current = current.slice(0, -1);
      render();
      return;
    }

    if (tokens.length === 0) return;
    const last = tokens.pop();
    if (typeof last === 'number') {
      current = String(last).slice(0, -1);
    }
    render();
  }

  function toggleSign() {
    if (error) return;

    if (lastWasEquals) {
      if (tokens.length === 1 && typeof tokens[0] === 'number') {
        current = stripMantissaZeros(String(tokens[0]));
        tokens = [];
        lastWasEquals = false;
      }
    }

    if (current === '') current = '-0';
    else if (current === '-') current = '';
    else if (current.startsWith('-')) current = current.slice(1);
    else current = `-${current}`;

    render();
  }

  function getCurrentOrLastNumber() {
    if (current !== '' && current !== '-') {
      const n = Number(current);
      return Number.isFinite(n) ? n : null;
    }

    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      if (typeof t === 'number') return t;
    }

    return 0;
  }

  function percent() {
    if (error) return;
    if (current === '' || current === '-') return;
    const n = Number(current);
    if (!Number.isFinite(n)) {
      error = true;
      render();
      return;
    }
    current = stripMantissaZeros(String(n / 100));
    render();
  }

  function evaluateTokens(list) {
    if (list.length === 0) return 0;
    if (typeof list[0] !== 'number') throw new Error('bad expression');

    const pass1 = [];
    let acc = /** @type {number} */ (list[0]);

    for (let i = 1; i < list.length; i += 2) {
      const op = list[i];
      const n = list[i + 1];
      if (typeof op !== 'string' || typeof n !== 'number') throw new Error('bad expression');

      if (op === '*') acc *= n;
      else if (op === '/') {
        if (n === 0) throw new Error('div0');
        acc /= n;
      } else {
        pass1.push(acc, op);
        acc = n;
      }
    }
    pass1.push(acc);

    let result = /** @type {number} */ (pass1[0]);
    for (let i = 1; i < pass1.length; i += 2) {
      const op = pass1[i];
      const n = pass1[i + 1];
      if (typeof op !== 'string' || typeof n !== 'number') throw new Error('bad expression');

      if (op === '+') result += n;
      else if (op === '-') result -= n;
      else throw new Error('bad op');
    }

    return result;
  }

  function equals() {
    if (error) return;

    if (current !== '' && current !== '-') {
      if (!commitCurrentNumber()) return;
    }

    const exprTokens = tokens.slice();
    if (exprTokens.length && typeof exprTokens[exprTokens.length - 1] === 'string') exprTokens.pop();

    if (tokens.length && typeof tokens[tokens.length - 1] === 'string') tokens.pop();

    if (!tokens.length) {
      render();
      return;
    }

    try {
      const result = evaluateTokens(tokens);
      const resultText = formatNumberForDisplay(result);
      const exprText = formatExprFromTokens(exprTokens);

      tokens = [result];
      current = '';
      lastWasEquals = true;
      error = false;
      addToHistory(exprText, resultText);
    } catch {
      error = true;
    }

    render();
  }

  function memClear() {
    clearErrorForInput();
    clearMemory();
    render();
  }

  function memRecall() {
    clearErrorForInput();

    if (lastWasEquals) {
      tokens = [];
      current = '';
      lastWasEquals = false;
    }

    current = stripMantissaZeros(String(memory));
    render();
  }

  function memAdd() {
    clearErrorForInput();
    const n = getCurrentOrLastNumber();
    if (n === null) return;
    memory += n;
    saveMemory();
    renderMemory();
  }

  function memSub() {
    clearErrorForInput();
    const n = getCurrentOrLastNumber();
    if (n === null) return;
    memory -= n;
    saveMemory();
    renderMemory();
  }

  function getCopyableValue() {
    if (!valueEl) return '';
    const text = String(valueEl.textContent || '').trim();
    if (!text || text === ERROR_TEXT) return '';
    return text;
  }

  async function copyDisplayedValue() {
    const text = getCopyableValue();
    if (!text) return;
    await copyTextToClipboard(text);
  }

  document.querySelector('.keys')?.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target.closest('button') : null);
    if (!btn) return;

    const digit = btn.getAttribute('data-digit');
    if (digit) return appendDigit(digit);

    const op = btn.getAttribute('data-op');
    if (op) return setOperator(op);

    const action = btn.getAttribute('data-action');
    if (action === 'memClear') return memClear();
    if (action === 'memRecall') return memRecall();
    if (action === 'memAdd') return memAdd();
    if (action === 'memSub') return memSub();
    if (action === 'clear') return resetAll();
    if (action === 'backspace') return backspace();
    if (action === 'equals') return equals();
    if (action === 'dot') return appendDot();
    if (action === 'toggleSign') return toggleSign();
    if (action === 'percent') return percent();
  });

  historyListEl?.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target.closest('button.history-item') : null);
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (!id) return;
    const item = history.find((h) => h.id === id);
    if (!item) return;
    restoreFromHistoryItem(item);
  });

  historyClearBtn?.addEventListener('click', () => {
    history = [];
    saveHistory();
    renderHistory();
  });

  historyCopyBtn?.addEventListener('click', async () => {
    try {
      await copyHistoryToClipboard();
      if (historyCopyBtn) {
        const original = historyCopyBtn.textContent;
        historyCopyBtn.textContent = '已複製';
        setTimeout(() => {
          historyCopyBtn.textContent = original || '複製';
        }, 900);
      }
    } catch {
      // ignore
    }
  });

  valueCopyBtn?.addEventListener('click', async () => {
    try {
      await copyDisplayedValue();
      if (valueCopyBtn) {
        const original = valueCopyBtn.textContent;
        valueCopyBtn.textContent = '已複製';
        setTimeout(() => {
          valueCopyBtn.textContent = original || '複製';
        }, 900);
      }
    } catch {
      // ignore
    }
  });

  valueEl?.addEventListener('click', async () => {
    try {
      await copyDisplayedValue();
    } catch {
      // ignore
    }
  });

  window.addEventListener('keydown', (e) => {
    const k = e.key;

    if (k >= '0' && k <= '9') {
      e.preventDefault();
      return appendDigit(k);
    }
    if (k === '.') {
      e.preventDefault();
      return appendDot();
    }
    if (k === '+' || k === '-' || k === '*' || k === '/') {
      e.preventDefault();
      return setOperator(k);
    }
    if (k === 'Enter' || k === '=') {
      e.preventDefault();
      return equals();
    }
    if (k === 'Backspace') {
      e.preventDefault();
      return backspace();
    }
    if (k === 'Escape') {
      e.preventDefault();
      return resetAll();
    }
  });

  loadMemory();
  loadHistory();
  renderHistory();
  render();
})();
