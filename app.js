(() => {
  const exprEl = document.getElementById('expr');
  const valueEl = document.getElementById('value');

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
      tokens = [Number(formatNumber(result))];
      current = '';
      lastWasEquals = true;
      error = false;
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

  render();
})();
