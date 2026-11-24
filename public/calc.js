/* Start screen: a real working calculator. 67670 then = opens UnStevened Social. "Math Games" opens the learning games. */
(() => {
  try { if (sessionStorage.getItem('uss_calc_ok') === '1') return; } catch {}
  const realTitle = document.title; document.title = 'Calculator Fun for Kids';
  const el = document.createElement('div'); el.id = 'calc';
  el.innerHTML = `<div class="c-wrap"><div class="c-top"><span>Calculator</span><a href="games.html" class="c-games">Math Games</a></div>
    <div class="c-disp"><div class="c-expr" id="cExpr"></div><div class="c-val" id="cVal">0</div></div>
    <div class="c-keys">${['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='].map(k => `<button data-k="${k}" class="${/[÷×−+=]/.test(k) ? 'op' : /[C±%⌫]/.test(k) ? 'fn' : ''}">${k}</button>`).join('')}</div></div>`;
  document.documentElement.appendChild(el);
  let cur = '0', prev = null, op = null, fresh = false, typed = '';
  const $ = (s) => el.querySelector(s), show = () => { $('#cVal').textContent = cur.length > 12 ? Number(cur).toPrecision(9) : cur; $('#cExpr').textContent = prev !== null && op ? `${prev} ${op}` : ''; };
  const calc = (a, b, o) => { a = +a; b = +b; const r = o === '+' ? a + b : o === '−' ? a - b : o === '×' ? a * b : b === 0 ? NaN : a / b; return isFinite(r) ? String(+r.toPrecision(12)) : 'Error'; };
  const unlock = () => { try { sessionStorage.setItem('uss_calc_ok', '1'); } catch {} document.title = realTitle; el.classList.add('out'); setTimeout(() => el.remove(), 350); };
  const press = (k) => {
    if (/[0-9]/.test(k)) { cur = fresh || cur === '0' ? k : cur + k; fresh = false; typed = (typed + k).slice(-8); }
    else if (k === '.') { if (fresh) { cur = '0'; fresh = false; } if (!cur.includes('.')) cur += '.'; typed = ''; }
    else if (k === 'C') { cur = '0'; prev = null; op = null; typed = ''; }
    else if (k === '⌫') { cur = cur.length > 1 ? cur.slice(0, -1) : '0'; typed = typed.slice(0, -1); }
    else if (k === '±') cur = cur.startsWith('-') ? cur.slice(1) : cur === '0' ? '0' : '-' + cur;
    else if (k === '%') { cur = String(+cur / 100); typed = ''; }
    else if ('÷×−+'.includes(k)) { if (prev !== null && op && !fresh) cur = calc(prev, cur, op); prev = cur; op = k; fresh = true; typed = ''; }
    else if (k === '=') {
      if (!op && cur === '67670' && typed.endsWith('67670')) return unlock();
      if (prev !== null && op) { cur = calc(prev, cur, op); prev = null; op = null; fresh = true; } typed = '';
    }
    show();
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
  addEventListener('keydown', e => { if (!el.isConnected) return; const m = { '/': '÷', '*': '×', '-': '−', '+': '+', Enter: '=', '=': '=', Backspace: '⌫', Escape: 'C', '.': '.', '%': '%' }; const k = /^[0-9]$/.test(e.key) ? e.key : m[e.key]; if (k) { e.preventDefault(); press(k); } });
  show();
})();
