let dataLoaded = false;

let codeToIpMap = new Map();      // sites.csv: код -> IP
let lncelMap = new Map();         // LNCEL_KR_RO.csv: код -> массив строк
let config2gMap = new Map();      // Config_2G.csv: код -> массив строк
let ant4gMap = new Map();         // 4G_ANT.csv: X-ключ -> массив строк {A,C,D,E}
let optSpeedMap = new Map();      // OPT_Speed.csv: ключ (Z) -> массив строк {M,H}

// Индекс колонки admin state в таблице 2G (по массиву cells ниже)
// cells = [idx, code, E, G, H, I, J, K, L, O, P, N]
//         0    1    2  3  4  5  6  7  8  9 10 11
const ADMIN_STATE_CELL_INDEX_2G = 4; // сейчас считаем, что admin state = H

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('codeInput');
  const ipBtn = document.getElementById('ipBtn');
  const buildBtn = document.getElementById('buildBtn');
  const status = document.getElementById('status');

  // Сразу ставим фокус в поле ввода
  if (input) {
    input.focus();
    input.select();
  }

  // Загружаем все CSV
  loadCsv()
    .then(() => {
      dataLoaded = true;
      status.textContent = 'Данные загружены. Введите код.';
    })
    .catch(err => {
      console.error('Ошибка загрузки CSV:', err);
      status.textContent = 'Ошибка загрузки данных. Проверьте CSV-файлы.';
    });

  ipBtn.addEventListener('click', () => {
    handleSearch({ openIp: true, showBuild: false });
  });

  buildBtn.addEventListener('click', () => {
    handleSearch({ openIp: false, showBuild: true });
  });

  // Горячие клавиши:
  // Enter        -> IP
  // Ctrl + Enter -> Build
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey) {
        handleSearch({ openIp: false, showBuild: true });
      } else {
        handleSearch({ openIp: true, showBuild: false });
      }
    }
  });

  function handleSearch({ openIp, showBuild }) {
    const rawCode = input.value.trim();
    const code = rawCode.toUpperCase();
    status.textContent = '';
    clearResults();

    if (!dataLoaded) {
      status.textContent = 'Подождите, данные ещё загружаются…';
      return;
    }

    const re = /^[A-Z]{2}\d{4}$/;
    if (!re.test(code)) {
      status.textContent = 'Неверный формат. Нужно XXYYYY (2 буквы + 4 цифры).';
      return;
    }

    // --- IP из sites.csv ---
    const ipRaw = codeToIpMap.get(code);
    let ip = null;
    let url = null;

    if (ipRaw) {
      ip = normalizeIp(ipRaw);
      if (ip) {
        url = /^https?:\/\//i.test(ip) ? ip : 'http://' + ip;
      } else {
        status.textContent = 'IP найден, но некорректен.';
      }
    } else {
      status.textContent = 'Совпадение по IP не найдено в sites.csv.';
    }

    // --- Build: LNCEL + 2G + 4G_ANT + OPT_Speed ---
    if (showBuild) {
      if (url) {
        status.textContent = (status.textContent ? status.textContent + '\n' : '') +
          'IP: ' + ip + '\nURL: ' + url;
      }
      renderLncelResults(code);
      renderConfig2gResults(code);
      renderAnt4gResults(code);
    }

    // --- Открыть IP ---
    if (openIp) {
      if (!url) {
        status.textContent = (status.textContent ? status.textContent + '\n' : '') +
          'Не удалось открыть IP: URL не сформирован.';
        return;
      }
      status.textContent = 'Открываю: ' + url;
      chrome.tabs.create({ url: url }, () => {
        if (chrome.runtime.lastError) {
          console.error('Ошибка при открытии URL:', chrome.runtime.lastError);
          status.textContent = 'Ошибка при открытии URL. См. консоль.';
        }
      });
    }
  }
});

/* ================== Общие утилиты ================== */

function clearResults() {
  ['lncelContainer', 'config2gContainer', 'ant4gContainer'].forEach(id => {
    const c = document.getElementById(id);
    if (c) c.innerHTML = '';
  });
}

function detectDelimiter(headerLine) {
  const semi = (headerLine.match(/;/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  return semi >= comma ? ';' : ',';
}

function splitCsvLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function removeBomAndTrim(str) {
  return String(str).replace(/\uFEFF/g, '').trim();
}

function normalizeIp(ipRaw) {
  if (!ipRaw) return '';

  let ip = String(ipRaw).trim();

  const hyperlinkMatch = ip.match(/HYPERLINK\("([^"]+)"/i);
  if (hyperlinkMatch && hyperlinkMatch[1]) {
    ip = hyperlinkMatch[1];
  }

  ip = ip.replace(/^"+|"+$/g, '');
  ip = ip.split(/\s+/)[0];
  ip = ip.replace(/[;,]+$/g, '');

  return ip.trim();
}

/* ================== LNCEL TABLE ================== */

function renderLncelResults(code) {
  const container = document.getElementById('lncelContainer');
  if (!container) return;

  container.innerHTML = '';

  const matches = lncelMap.get(code) || [];

  if (matches.length === 0) {
    container.textContent = 'Нет совпадений в LNCEL.';
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  const lncelHeaders = [
    'test_idx',   // порядковый номер (скрыт)
    'test_code',  // код XXYYYY
    'test_x',     // X
    'test_u',     // U
    'test_h',     // H
    'test_w',     // W
    'test_aa',    // AA
    'test_j'      // J
  ];

  lncelHeaders.forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (i === 0) th.classList.add('col-idx'); // скрываем первую колонку
    headRow.appendChild(th);
  });

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  matches.forEach((row, idx) => {
    const tr = document.createElement('tr');

    const cells = [
      idx + 1,
      code,
      row.X,
      row.U,
      row.H,
      row.W,
      row.AA,
      row.J
    ];

    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v || '';
      if (i === 0) td.classList.add('col-idx'); // скрываем индекс
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

/* ================== 2G TABLE ================== */

function renderConfig2gResults(code) {
  const container = document.getElementById('config2gContainer');
  if (!container) return;

  container.innerHTML = '';

  const matches = config2gMap.get(code) || [];

  if (matches.length === 0) {
    container.textContent = 'Нет совпадений в Config_2G.';
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  const cfg2gHeaders = [
    'test_idx',   // #
    'test_code',  // код XXYYYY
    'test_e',     // E
    'test_g',     // G
    'test_h',     // H (admin state)
    'test_i',     // I
    'test_j',     // J
    'test_k',     // K
    'test_l',     // L
    'test_o',     // O
    'test_p',     // P
    'test_n'      // N
  ];

  cfg2gHeaders.forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (i === 0) th.classList.add('col-idx'); // скрываем индекс
    headRow.appendChild(th);
  });

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  matches.forEach((row, idx) => {
    const tr = document.createElement('tr');
    const cells = [
      idx + 1,
      code,
      row.E, row.G, row.H, row.I,
      row.J, row.K, row.L,
      row.O, row.P, row.N
    ];
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v || '';

      // скрываем индекс
      if (i === 0) {
        td.classList.add('col-idx');
      }

      // подсветка admin state
      if (i === ADMIN_STATE_CELL_INDEX_2G) {
        const val = String(v || '').trim();
        if (val === '1') {
          td.style.backgroundColor = '#bbf7d0'; // зелёный
          td.style.color = '#166534';
          td.style.fontWeight = '600';
        } else if (val === '0') {
          td.style.backgroundColor = '#fecaca'; // красный
          td.style.color = '#991b1b';
          td.style.fontWeight = '600';
        }
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

/* ========== X (LNCEL) -> ключ для 4G_ANT ========== */
/**
 * XXYYYY_ZZZ -> XXYYYY_ZZ (обрезаем первый символ из ZZZ)
 * ST1216_011 -> ST1216_11
 */
function toAntKeyFromX(xVal) {
  if (!xVal) return xVal;
  const m = xVal.match(/^(.+_)(\d{3})$/);
  if (!m) return xVal;
  const prefix = m[1];
  const suffix3 = m[2];
  const suffix2 = suffix3.slice(1);
  return prefix + suffix2;
}

/* ================== 4G ANT + OPT_Speed TABLE ================== */

function renderAnt4gResults(code) {
  const container = document.getElementById('ant4gContainer');
  if (!container) return;

  container.innerHTML = '';

  const lncelMatches = lncelMap.get(code) || [];
  if (lncelMatches.length === 0) {
    container.textContent = 'Нет X в LNCEL — нечего искать в 4G_ANT.';
    return;
  }

  const xSet = new Set();
  lncelMatches.forEach(r => {
    const xVal = (r.X || '').trim();
    if (xVal) xSet.add(xVal);
  });

  if (xSet.size === 0) {
    container.textContent = 'LNCEL найден, но X пустые.';
    return;
  }

  const xList = Array.from(xSet);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  const ant4gHeaders = [
    'test_idx',       // #
    'test_x',         // X из LNCEL
    'test_ant',       // C сгруппированные (ant)
    'test_rmod',      // D
    'test_rmode',     // E
    'test_sfp_cap',   // M из OPT_Speed
    'test_sfp_len'    // H из OPT_Speed
  ];

  ant4gHeaders.forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (i === 0) th.classList.add('col-idx'); // скрываем индекс
    headRow.appendChild(th);
  });

  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  xList.forEach((xVal, idx) => {
    const antKey = toAntKeyFromX(xVal);
    const rows = ant4gMap.get(antKey) || [];

    const tr = document.createElement('tr');

    if (rows.length === 0) {
      const cells = [idx + 1, xVal, '-', '-', '-', '-', '-'];
      cells.forEach((v, i) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (i === 0) td.classList.add('col-idx');
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
      return;
    }

    const ants = Array.from(new Set(rows.map(r => r.C).filter(Boolean))).join('.');
    const rmods = Array.from(new Set(rows.map(r => r.D).filter(Boolean))).join('/');
    const rmodes = Array.from(new Set(rows.map(r => r.E).filter(Boolean))).join('/');

    const aVals = Array.from(new Set(rows.map(r => r.A).filter(Boolean)));

    const capSet = new Set();
    const lenSet = new Set();

    aVals.forEach(aVal => {
      const optRows = optSpeedMap.get(aVal) || [];
      optRows.forEach(o => {
        if (o.M) capSet.add(o.M);
        if (o.H) lenSet.add(o.H);
      });
    });

    const cap = Array.from(capSet).join('/');
    const len = Array.from(lenSet).join('/');

    const cells = [
      idx + 1,
      xVal,
      ants,
      rmods,
      rmodes,
      cap,
      len
    ];

    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v || '';
      if (i === 0) td.classList.add('col-idx');
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

/* ================== ЗАГРУЗКА CSV ================== */

async function loadCsv() {
  await Promise.all([
    loadSitesCsv(),
    loadLncelCsv(),
    loadConfig2gCsv(),
    loadAnt4gCsv(),
    loadOptSpeedCsv()
  ]);
}

async function loadSitesCsv() {
  const url = chrome.runtime.getURL('sites.csv');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Не удалось загрузить sites.csv');
  const text = await resp.text();
  parseSitesCsv(text);
}

async function loadLncelCsv() {
  const url = chrome.runtime.getURL('LNCEL_KR_RO.csv');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Не удалось загрузить LNCEL_KR_RO.csv');
  const text = await resp.text();
  parseLncelCsv(text);
}

async function loadConfig2gCsv() {
  const url = chrome.runtime.getURL('Config_2G.csv');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Не удалось загрузить Config_2G.csv');
  const text = await resp.text();
  parseConfig2gCsv(text);
}

async function loadAnt4gCsv() {
  const url = chrome.runtime.getURL('4G_ANT.csv');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Не удалось загрузить 4G_ANT.csv');
  const text = await resp.text();
  parseAnt4gCsv(text);
}

async function loadOptSpeedCsv() {
  const url = chrome.runtime.getURL('OPT_Speed.csv');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Не удалось загрузить OPT_Speed.csv');
  const text = await resp.text();
  parseOptSpeedCsv(text);
}

/* ================== PARSERS ================== */

function parseSitesCsv(t) {
  const lines = t.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return;
  const delim = detectDelimiter(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i], delim);
    if (c.length < 19) continue;
    let code = removeBomAndTrim(c[7]).toUpperCase();  // H
    let ip = removeBomAndTrim(c[18]);                 // S
    if (code && ip) codeToIpMap.set(code, ip);
  }
}

function parseLncelCsv(t) {
  const lines = t.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return;
  const delim = detectDelimiter(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i], delim);
    if (c.length < 27) continue;

    const code = removeBomAndTrim(c[1]).toUpperCase(); // B
    if (!code) continue;

    const row = {
      H: removeBomAndTrim(c[7]),
      J: removeBomAndTrim(c[9]),
      U: removeBomAndTrim(c[20]),
      V: removeBomAndTrim(c[21]),
      W: removeBomAndTrim(c[22]),
      X: removeBomAndTrim(c[23]),
      AA: removeBomAndTrim(c[26])
    };

    if (!lncelMap.has(code)) lncelMap.set(code, []);
    lncelMap.get(code).push(row);
  }
}

function parseConfig2gCsv(t) {
  const lines = t.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return;
  const delim = detectDelimiter(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i], delim);
    if (c.length < 16) continue;

    let code = removeBomAndTrim(c[3]).toUpperCase(); // D
    if (!code) continue;

    const row = {
      E: removeBomAndTrim(c[4]),
      G: removeBomAndTrim(c[6]),
      H: removeBomAndTrim(c[7]),
      I: removeBomAndTrim(c[8]),
      J: removeBomAndTrim(c[9]),
      K: removeBomAndTrim(c[10]),
      L: removeBomAndTrim(c[11]),
      O: removeBomAndTrim(c[14]),
      P: removeBomAndTrim(c[15]),
      N: removeBomAndTrim(c[13])
    };

    if (!config2gMap.has(code)) config2gMap.set(code, []);
    config2gMap.get(code).push(row);
  }
}

function parseAnt4gCsv(t) {
  const lines = t.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return;
  const delim = detectDelimiter(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i], delim);
    if (c.length < 5) continue;

    const x = removeBomAndTrim(c[1]); // B
    if (!x) continue;

    const row = {
      A: removeBomAndTrim(c[0]), // A
      C: removeBomAndTrim(c[2]), // C
      D: removeBomAndTrim(c[3]), // D
      E: removeBomAndTrim(c[4])  // E
    };

    if (!ant4gMap.has(x)) ant4gMap.set(x, []);
    ant4gMap.get(x).push(row);
  }
}

function parseOptSpeedCsv(t) {
  const lines = t.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return;
  const delim = detectDelimiter(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i], delim);
    if (c.length < 26) continue;

    const key = removeBomAndTrim(c[25]); // Z
    if (!key) continue;

    const row = {
      M: removeBomAndTrim(c[12]), // M -> SFP cap
      H: removeBomAndTrim(c[7])   // H -> SFP length
    };

    if (!optSpeedMap.has(key)) optSpeedMap.set(key, []);
    optSpeedMap.get(key).push(row);
  }
}
