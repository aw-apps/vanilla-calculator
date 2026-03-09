(() => {
  const exprEl = document.getElementById('expr');
  const valueEl = document.getElementById('value');

  const historyListEl = document.getElementById('historyList');
  const historyEmptyEl = document.getElementById('historyEmpty');
  const historyCopyBtn = document.getElementById('historyCopy');
  const historyClearBtn = document.getElementById('historyClear');

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

  function formatNumber(n) {
    if (!Number.isFinite(n)) return '錯誤';
    const s = String(n);
    return s.length > 14 ? n.toPrecision(12).replace(/\.?0+$/, '') : s;
  }

  function safeParseJSON(s) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
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
        id: typeof x.id === 'string' ? x.id : crypto.randomUUID(),
        expr: typeof x.expr === 'string' ? x.expr : '',
        result: typeof x.result === 'string' ? x.result : '',
      }))
      .filter((x) => x.expr && x.result)
      .slice(0, HISTORY_MAX);
  }

  function saveHistory() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
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

  function prettyOp(op) {
    if (op === '*') return '×';
    if (op === '/') return '÷';
    if (op === '-') return '−';
    return op;
  }

  function formatExprFromTokens(list) {
    return list
      .map((t) => (typeof t === 'string' ? prettyOp(t) : String(t)))
      .filter((t) => t !== '')
      .join(' ');
  }

  function addToHistory(expr, result) {
    if (!historyListEl) return;
    const trimmedExpr = String(expr || '').trim();
    const trimmedResult = String(result || '').trim();
    if (!trimmedExpr || !trimmedResult || trimmedResult === '錯誤') return;

    const id = (crypto && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const next = [{ id, expr: trimmedExpr, result: trimmedResult }, ...history];

    // de-dupe consecutive identical entries
    history = next.filter((x, i, arr) => i === 0 || !(x.expr === arr[i - 1].expr && x.result === arr[i - 1].result)).slice(0, HISTORY_MAX);
    saveHistory();
    renderHistory();
  }

  async function copyHistoryToClipboard() {
    const lines = history.map((h) => `${h.expr} = ${h.result}`);
    const text = lines.join('\n');
    if (!text) return;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
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

  function render() {
    const exprText = [...tokens, current].filter((t) => t !== '' && t !== null && t !== undefined).join(' ');
    exprEl.textContent = exprText;
    valueEl.textContent = error ? '錯誤' : (current !== '' ? current : (tokens.length ? String(tokens[tokens.length - 1]) : '0'));
  }

  function resetAll() {
    tokens = [];
    current = '';
    lastWasEquals = false;
    error = false;
    render();
  }

  function ensureNotError() {
    if (!error) return true;
    resetAll();
    return false;
  }

  function appendDigit(d) {
    if (!ensureNotError()) return;
    if (lastWasEquals) {
      tokens = [];
      current = '';
      lastWasEquals = false;
    }
    if (current === '0') current = d;
    else if (current === '-0') current = '-' + d;
    else current += d;
    render();
  }

  function appendDot() {
    if (!ensureNotError()) return;
    if (lastWasEquals) {
      tokens = [];
      current = '';
      lastWasEquals = false;
    }
    if (current === '') current = '0.';
    else if (!current.includes('.')) current += '.';
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

  function setOperator(op) {
    if (!ensureNotError()) return;

    if (lastWasEquals) {
      lastWasEquals = false;
    }

    if (current !== '' && current !== '-') {
      if (!commitCurrentNumber()) return;
    }

    if (tokens.length === 0) {
      // allow starting with negative by typing '-'
      if (op === '-') {
        current = '-';
        render();
      }
      return;
    }

    const last = tokens[tokens.length - 1];
    if (typeof last === 'string') {
      tokens[tokens.length - 1] = op;
    } else {
      tokens.push(op);
    }
    render();
  }

  function backspace() {
    if (!ensureNotError()) return;
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
    if (!ensureNotError()) return;
    if (lastWasEquals) {
      // treat last result as current
      if (tokens.length === 1 && typeof tokens[0] === 'number') {
        current = String(tokens[0]);
        tokens = [];
        lastWasEquals = false;
      }
    }

    if (current === '') current = '-0';
    else if (current === '-') current = '';
    else if (current.startsWith('-')) current = current.slice(1);
    else current = '-' + current;
    render();
  }

  function percent() {
    if (!ensureNotError()) return;
    if (current === '' || current === '-') return;
    const n = Number(current);
    if (!Number.isFinite(n)) {
      error = true;
      render();
      return;
    }
    current = formatNumber(n / 100);
    render();
  }

  function evaluateTokens(list) {
    // list: [number, op, number, op, number ...]
    if (list.length === 0) return 0;
    if (typeof list[0] !== 'number') throw new Error('bad expression');

    const pass1 = [];
    let acc = /** @type {number} */ (list[0]);

    for (let i = 1; i < list.length; i += 2) {
      const op = list[i];
      const n = list[i + 1];
      if (typeof op !== 'string' || typeof n !== 'number') throw new Error('bad expression');

      if (op === '*') acc = acc * n;
      else if (op === '/') {
        if (n === 0) throw new Error('div0');
        acc = acc / n;
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
    if (!ensureNotError()) return;

    if (current !== '' && current !== '-') {
      if (!commitCurrentNumber()) return;
    }

    const exprTokens = tokens.slice();
    if (exprTokens.length && typeof exprTokens[exprTokens.length - 1] === 'string') {
      exprTokens.pop();
    }

    // remove trailing operator
    if (tokens.length && typeof tokens[tokens.length - 1] === 'string') {
      tokens.pop();
    }

    if (!tokens.length) {
      render();
      return;
    }

    try {
      const result = evaluateTokens(tokens);
      const resultText = formatNumber(result);
      const exprText = formatExprFromTokens(exprTokens);

      tokens = [Number(resultText)];
      current = '';
      lastWasEquals = true;
      error = false;
      addToHistory(exprText, resultText);
    } catch {
      error = true;
    }
    render();
  }

  document.querySelector('.keys')?.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target.closest('button') : null);
    if (!btn) return;

    const digit = btn.getAttribute('data-digit');
    if (digit) return appendDigit(digit);

    const op = btn.getAttribute('data-op');
    if (op) return setOperator(op);

    const action = btn.getAttribute('data-action');
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

  loadHistory();
  renderHistory();
  render();
})();
