/* ============================================================
   语墨 · 主逻辑
   状态全部落 localStorage；未配置接口时不出题、不批改
   ============================================================ */
(function(){
const { PRESETS, PROMPTS, callAI, parseJSONLoose, testConnection } = window.YW_API;
const YW = window.YW = window.YW || {};
const renderStudents = (...a) => YW.renderStudents(...a);

const LS = {
  cfg: 'yw.config.v1',
  data: 'yw.data.v1'
};

const IMG_MAX_SIDE = 1600;

/* ---------------- 状态 ---------------- */
let S = {
  cfg: { provider: 'dashscope', baseUrl: '', model: '', apiKey: '', temp: 0.6, timeout: 90, guarded: true },
  students: [],
  history: [],      // 批改记录
  papers: []        // 生成记录
};
let ui = {
  mode: 'reading',
  genres: ['写人记事'],
  passages: 1,
  perPassage: 3,
  readTypes: ['填空题', '简答题'],
  basisCount: 7,
  diff: '适中',
  basisTypes: ['看拼音写词语', '多音字辨析', '词语搭配', '近反义词'],
  src: 'out',
  image: null,      // {dataUrl, name, w, h}
  currentStudent: null,
  lastGrade: null,
  lastPaper: null
};

function loadState() {
  try {
    const c = JSON.parse(localStorage.getItem(LS.cfg) || 'null');
    if (c) S.cfg = Object.assign(S.cfg, c);
    const d = JSON.parse(localStorage.getItem(LS.data) || 'null');
    if (d) {
      S.students = d.students || [];
      S.history = d.history || [];
      S.papers = d.papers || [];
    }
  } catch (e) { console.warn('读取本地数据失败', e); }
}
function saveCfg() { try { localStorage.setItem(LS.cfg, JSON.stringify(S.cfg)); } catch (e) {} }
function saveData() {
  try {
    localStorage.setItem(LS.data, JSON.stringify({ students: S.students, history: S.history, papers: S.papers }));
  } catch (e) { toast('本地存储写入失败：' + e.message, true); }
}

/* ---------------- 小工具 ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const nowStr = (t = Date.now()) => {
  const d = new Date(t);
  const p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let toastTimer = null;
function toast(msg, isErr) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
}

function go(page) {
  $$('.page').forEach(p => p.classList.toggle('on', p.id === 'page-' + page));
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === page));
  $('#body').scrollTop = 0;
  if (page === 'students') renderStudents();
  if (page === 'home') renderHome();
  if (page === 'settings') YW.fillSettings && YW.fillSettings();
}

function fillStudentSelect(preferId) {
  const sel = $('#gradeStudent');
  const keep = preferId || ui.currentStudent || sel.value;
  sel.innerHTML = S.students.length
    ? S.students.map(s => `<option value="${s.id}">${esc(s.name)}${s.cls ? ' · ' + esc(s.cls) : ''}</option>`).join('')
    : '<option value="">（尚未添加学生）</option>';
  if (keep && S.students.some(s => s.id === keep)) sel.value = keep;
  ui.currentStudent = sel.value;
}

const num = (v, d) => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? d : Number(v);
const str = (v) => v == null ? '' : String(v).trim();
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

function findRec(id) {
  const r = S.history.find(x => x.id === id);
  if (r) return r;
  for (const s of S.students) { const x = (s.logs || []).find(l => l.id === id); if (x) return x; }
  return null;
}

/* ---------------- 接口状态 ---------------- */
const hasKey = () => !!(S.cfg.apiKey && S.cfg.baseUrl && S.cfg.model);

function syncApiState() {
  const ok = hasKey();
  const txt = ok ? '接口已就绪' : '接口未配置';
  $('#heroLive').textContent = ok ? '接口已就绪 · 可直接生成' : '接口未配置 · 设置后可生成';
  $('#sideApiTxt').textContent = ok ? `已连接 · ${S.cfg.model}` : '接口未配置';
  $('#sideLed').className = 'led ' + (ok ? 'ok' : 'no');
  $('#sideApi').querySelector('button').textContent = ok ? '查看' : '去配置';
  $('#apiDot').style.display = ok ? 'none' : 'block';
  const badge = $('#cfgBadge');
  if (badge) {
    badge.textContent = ok ? '已配置' : '未连接';
    badge.className = 'key-state ' + (ok ? 'ok' : 'no');
    $('#cfgState').textContent = ok ? `${S.cfg.model} · ${S.cfg.baseUrl}` : '未配置：出题与批改会被阻止';
  }
  const btn = $('#gradeBtn');
  if (btn && !btn.dataset.busy) {
    btn.disabled = false;
    btn.innerHTML = iconCheck() + '开始批改并生成学情';
  }
}
const iconCheck = () => '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>';

/* ---------------- 首页 ---------------- */
function renderHome() {
  $('#stQ').textContent = S.papers.length;
  $('#stG').textContent = S.history.length;
  $('#stS').textContent = S.students.length;

  const box = $('#homeRecent');
  if (!S.history.length) {
    box.innerHTML = '<div class="empty" style="padding:18px 6px">还没有批改记录。<br/>学生作业交上来后，拍照上传即可生成学情报告。</div>';
    return;
  }
  const list = S.history.slice(0, 4).map(h => {
    const st = S.students.find(s => s.id === h.studentId);
    return `<button class="st-row" onclick="openStudent('${h.studentId}')">
      ${avatarHTML(st)}
      <div class="st-i">
        <div class="st-n">${esc(st ? st.name : (h.studentName || '未命名'))}<span class="cls">${esc(h.title || '作业')}</span></div>
        <div class="st-s">${esc(nowStr(h.time))}${h.errors && h.errors.length ? ' · ' + h.errors.length + ' 处需订正' : ' · 全部正确'}</div>
      </div>
      <span class="badge-err">${h.score}<small style="opacity:.65">分</small></span>
    </button>`;
  }).join('');
  box.innerHTML = list;
}

function avatarHTML(st, size) {
  const idx = st ? (st.color || 1) : 1;
  const ch = st ? (st.name || '生').slice(-1) : '生';
  return `<div class="avatar a${((idx - 1) % 6) + 1}" ${size ? `style="width:${size}px;height:${size}px;font-size:${Math.round(size / 2.5)}px"` : ''}>${esc(ch)}</div>`;
}

/* ---------------- 出题：表单 ---------------- */
const GENRES = ['写人记事', '写景状物', '童话寓言', '科普说明', '古诗文'];

function setMode(m) {
  ui.mode = m;
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#readingOpts').style.display = m === 'reading' ? '' : 'none';
  $('#basisOpts').style.display = m === 'basis' ? '' : 'none';
  $('#focusLb').textContent = m === 'basis' ? '薄弱点（选填）' : '想考查的能力（选填）';
}

/* 文体随篇数联动：N 篇 = 恰好选 N 种，点满后其余置灰 */
function syncGenres() {
  const n = ui.passages;
  const chosen = ui.genres;
  if (chosen.length > n) ui.genres = chosen.slice(0, n);
  const cur = ui.genres;
  $$('#genreChips .chip').forEach(c => {
    const on = cur.includes(c.dataset.v);
    c.classList.toggle('on', on);
    c.disabled = !on && cur.length >= n;
    c.classList.toggle('disabled', !on && cur.length >= n);
  });
  $('#genreHint').textContent = cur.length === n
    ? `${n} 篇已对应 ${n} 种文体`
    : `还需选 ${n - cur.length} 种（共 ${n} 篇）`;
}

function syncReadTypes() {
  const hasSel = ui.readTypes.includes('选择题');
  const notice = $('#readTypeNotice');
  if (!hasSel) {
    notice.textContent = '默认不出选择题，阅读题以填空、简答为主。';
    notice.className = 'notice';
  } else if (ui.readTypes.length === 1) {
    notice.textContent = '仅勾选选择题：本篇将以选择题为主。';
    notice.className = 'notice warn';
  } else {
    notice.textContent = '已允许选择题：每篇最多 1 道，其余仍为填空/简答。';
    notice.className = 'notice';
  }
}

function bindMakeForm() {
  $$('#modeSeg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));

  $$('#passageSeg button').forEach(b => b.onclick = () => {
    $$('#passageSeg button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    const n = Number(b.dataset.n);
    ui.passages = n;
    // 升篇数时自动补足到 N 种，降篇数时保留前 N 种
    const rest = GENRES.filter(g => !ui.genres.includes(g));
    while (ui.genres.length < n && rest.length) ui.genres.push(rest.shift());
    syncGenres();
  });

  $$('#genreChips .chip').forEach(c => c.onclick = () => {
    if (c.disabled) return;
    const v = c.dataset.v;
    const i = ui.genres.indexOf(v);
    if (i >= 0) {
      // 已选满 N 种时，先点掉一种会空出一格，用户随后点新文体即可替换
      ui.genres.splice(i, 1);
    } else {
      if (ui.genres.length >= ui.passages) {
        // 超额时替换最早选中的一种，始终保持 N 种
        ui.genres.shift();
      }
      ui.genres.push(v);
    }
    syncGenres();
  });

  $$('#readTypeGrid .pick').forEach(p => p.onclick = () => {
    p.classList.toggle('on');
    ui.readTypes = $$('#readTypeGrid .pick.on').map(x => x.dataset.t);
    if (!ui.readTypes.length) { p.classList.add('on'); ui.readTypes = [p.dataset.t]; }
    syncReadTypes();
  });

  $$('#countSeg button').forEach(b => b.onclick = () => {
    $$('#countSeg button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); ui.perPassage = Number(b.dataset.c);
  });

  $$('#basisCountSeg button').forEach(b => b.onclick = () => {
    $$('#basisCountSeg button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); ui.basisCount = Number(b.dataset.c);
  });

  $$('#basisGrid .pick').forEach(p => p.onclick = () => {
    p.classList.toggle('on');
    ui.basisTypes = $$('#basisGrid .pick.on').map(x => x.dataset.t);
    if (!ui.basisTypes.length) { p.classList.add('on'); ui.basisTypes = [p.dataset.t]; }
  });

  $$('#srcSeg button').forEach(b => b.onclick = () => {
    $$('#srcSeg button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); ui.src = b.dataset.s;
  });

  setMode('reading');
  syncGenres();
  syncReadTypes();
}

function collectMakeOpts() {
  const grade = $('#grade').value;
  const gradeNum = { '一年级': 1, '二年级': 2, '三年级': 3, '四年级': 4, '五年级': 5, '六年级': 6 }[grade] || 3;
  const base = {
    grade,
    diff: $('#diff').value,
    unit: $('#unit').value.trim(),
    focus: $('#focus').value.trim(),
    types: ui.basisTypes.length ? ui.basisTypes.slice() : ['字词基础']
  };
  if (ui.mode === 'reading') {
    const genres = ui.genres.slice(0, ui.passages);
    return Object.assign(base, {
      passages: ui.passages,
      perPassage: ui.perPassage,
      genres,
      genre: genres.join('、'),
      words: [150, 220, 300, 380, 450, 520][gradeNum - 1],
      types: ui.readTypes.slice()
    });
  }
  return Object.assign(base, { count: ui.basisCount });
}

async function generate() {
  if (!hasKey()) {
    toast('还没有配置 AI 接口，无法出题。请先到「设置」填写 Base URL、模型与密钥。', true);
    go('settings');
    return;
  }
  const btn = $('#genBtn');
  if (btn.dataset.busy) return;

  const opts = collectMakeOpts();
  const isReading = ui.mode === 'reading';
  if (isReading && opts.genres.length !== opts.passages) {
    toast(`已选 ${opts.passages} 篇，请先选满 ${opts.passages} 种文体`, true);
    return;
  }
  const prompt = isReading ? PROMPTS.makeReading(opts) : PROMPTS.makeBasis(opts);
  const totalQ = isReading ? opts.passages * opts.perPassage : opts.count;

  btn.dataset.busy = '1';
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> 正在命题…';
  $('#genOut').innerHTML = `<div class="card fadeup"><div class="muted" style="font-size:12.5px">${esc(opts.grade)} · ${isReading ? opts.passages + ' 篇 · 每篇 ' + opts.perPassage + ' 题' : '基础训练 · ' + opts.count + ' 题'} · ${esc(opts.diff)}</div>
    <div class="loading-lines"><div class="skel" style="width:82%"></div><div class="skel" style="width:96%"></div><div class="skel" style="width:70%"></div><div class="skel" style="width:88%"></div></div></div>`;

  const t0 = performance.now();
  try {
    const text = await callAI(S.cfg, [
      { role: 'system', content: '你是中国小学语文教研员，只输出符合要求的 JSON。' },
      { role: 'user', content: prompt }
    ], { maxTokens: 6000 });
    const data = parseJSONLoose(text);
    const questions = Array.isArray(data.questions) ? data.questions : [];
    if (!questions.length) throw new Error('模型没有返回题目，请调整要求后重试。');

    // 篇章归一化：支持 passages 数组，也兼容只有 passage 的旧结构
    let passages = [];
    if (Array.isArray(data.passages) && data.passages.length) {
      passages = data.passages.map((p, i) => ({
        no: i + 1,
        genre: str(p.genre) || (opts.genres ? opts.genres[i] : '') || '',
        title: str(p.title),
        text: str(p.text || p.passage)
      }));
    } else if (data.passage) {
      passages = [{ no: 1, genre: str(data.genre), title: '', text: str(data.passage) }];
    }

    // 题号重排 + 归属校验
    const norm = questions.map((q, i) => ({
      no: i + 1,
      passage: Number(q.passage || 1),
      type: str(q.type) || '简答',
      stem: str(q.stem),
      options: Array.isArray(q.options) ? q.options.filter(o => str(o)) : [],
      answer: str(q.answer),
      analysis: str(q.analysis)
    }));
    // 若模型未给 passage 字段，按题量均分到各篇
    if (norm.length && passages.length && !questions.some(q => q.passage)) {
      const per = Math.ceil(norm.length / passages.length);
      norm.forEach((q, i) => { q.passage = Math.min(passages.length, Math.floor(i / per) + 1); });
    }

    // 未勾选选择题时丢弃模型多给的选择题，并提示补题
    let dropped = 0;
    let kept = norm;
    if (isReading && !opts.types.includes('选择题')) {
      kept = norm.filter(q => {
        const isChoice = q.options.length > 0 || /选择/.test(q.type);
        if (isChoice) dropped++;
        return !isChoice;
      });
      if (!kept.length) kept = norm.map(q => Object.assign({}, q, { options: [], type: /选择/.test(q.type) ? '简答' : q.type }));
    }
    // 题号连续重排（丢题后不留空号）
    kept.forEach((q, i) => { q.no = i + 1; });

    const secs = Math.max(0.1, (performance.now() - t0) / 1000).toFixed(1);
    ui.lastPaper = {
      id: uid(), time: Date.now(), mode: ui.mode, grade: opts.grade, diff: opts.diff,
      title: data.title || '语文练习',
      genre: passages.map(p => p.genre).filter(Boolean).join('、') || (data.genre || ''),
      passages, questions: kept, seconds: Number(secs),
      withAnswer: false,      // 默认导出/展示不带答案：先做题，答案在卷末
      dropped
    };
    S.papers.unshift({ id: ui.lastPaper.id, time: ui.lastPaper.time, title: ui.lastPaper.title, grade: opts.grade, count: norm.length, mode: ui.mode });
    S.papers = S.papers.slice(0, 60);
    saveData();
    renderPaper(ui.lastPaper);
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg> 重新生成';
    toast(`生成完成，共 ${kept.length} 题${dropped ? '（已剔除 ' + dropped + ' 道不符合题型要求的选择题）' : ''}，用时 ${secs} 秒`);
  } catch (err) {
    $('#genOut').innerHTML = errorCard(err, '出题失败');
    toast('出题失败：' + err.message.slice(0, 60), true);
    btn.innerHTML = '重试生成';
  } finally {
    delete btn.dataset.busy;
    btn.disabled = false;
  }
}

function errorCard(err, title) {
  return `<div class="card fadeup" style="border-left:3px solid var(--seal)">
    <div style="font-size:14px;font-weight:800;color:var(--seal-d);margin-bottom:6px">${esc(title)}</div>
    <div class="muted" style="font-size:12.5px;color:var(--ink-2);word-break:break-word">${esc(err.message)}</div>
    <button class="btn ghost btn-sm" style="margin-top:10px" onclick="go('settings')">检查接口设置</button>
  </div>`;
}

/* ---------- 试卷渲染：题面在前，答案统一置后 ---------- */
function qStem(q) {
  return esc(q.stem || '').replace(/____+/g, '<span class="blank"></span>');
}

function qBody(q, withAnswer) {
  const opts = Array.isArray(q.options) ? q.options : [];
  const optsHTML = opts.length
    ? `<div class="opts">${opts.map(o => `<div class="opt">${esc(o)}</div>`).join('')}</div>`
    : '';
  const answerHTML = withAnswer
    ? `<div class="answer-box"><div class="ans-h">参考答案 · 解析</div>
        <div><b>${esc(q.answer || '略')}</b>${q.analysis ? '　' + esc(q.analysis) : ''}</div></div>`
    : '';
  const lines = (!opts.length && !withAnswer) ? '<div class="answer-lines"><i></i><i></i></div>' : '';
  return `<div class="qitem">
    <div class="qhead"><span class="qno">${esc(q.no)}</span><span class="qtag">${esc(q.type || '题目')}</span></div>
    <div class="qtext">${qStem(q)}</div>
    ${optsHTML}${lines}${answerHTML}
  </div>`;
}

function renderPaper(p) {
  const withAnswer = p.withAnswer !== false;
  const passages = Array.isArray(p.passages) && p.passages.length
    ? p.passages
    : (p.passage ? [{ no: 1, genre: p.genre, title: '', text: p.passage }] : []);

  let bodyHTML = '';
  if (passages.length) {
    bodyHTML = passages.map((ps, i) => {
      const own = p.questions.filter(q => Number(q.passage || 1) === i + 1);
      const extra = i === passages.length - 1
        ? p.questions.filter(q => Number(q.passage || 1) > passages.length)
        : [];
      const list = own.concat(extra);
      const text = esc(ps.text || '').split('\n').filter(Boolean)
        .map(t => `<p style="margin:0 0 6px">${t}</p>`).join('');
      return `<div class="passage-block">
        ${passages.length > 1 ? `<div class="pno">阅读（${['一', '二', '三'][i] || i + 1}）${ps.genre ? `<span>${esc(ps.genre)}</span>` : ''}</div>` : ''}
        ${ps.title ? `<div class="ptitle">${esc(ps.title)}</div>` : ''}
        <div class="passage">${text}</div>
        ${list.map(q => qBody(q, withAnswer)).join('')}
      </div>`;
    }).join('');
  } else {
    bodyHTML = p.questions.map(q => qBody(q, withAnswer)).join('');
  }

  const answerSheet = withAnswer ? `
    <div class="answersheet">
      <div class="as-hd"><span>参考答案</span><small>共 ${p.questions.length} 题</small></div>
      ${p.questions.map(q => `<div class="as-row">
        <span class="as-no">${esc(q.no)}</span>
        <div class="as-c"><b>${esc(q.answer || '略')}</b>${q.analysis ? `<span class="as-an">${esc(q.analysis)}</span>` : ''}</div>
      </div>`).join('')}
    </div>` : '';

  $('#genOut').innerHTML = `<div class="fadeup">
    <div class="paper">
      <div class="ttl">${esc(p.title)}</div>
      <div class="meta">${esc(p.grade)} · ${esc(p.diff)} · ${passages.length > 1 ? passages.length + ' 篇 · ' : ''}${p.questions.length} 题${p.genre ? ' · ' + esc(p.genre) : ''}</div>
      ${bodyHTML}
      ${answerSheet}
    </div>
    <div class="hintline" style="justify-content:center">本次生成 ${p.seconds} 秒</div>
    <div class="card" style="margin-top:12px;padding:12px 14px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:800">导出时附带答案</div>
          <div style="font-size:11.5px;color:var(--ink-3);margin-top:2px">开启后答案单独排在卷末，不混在题里</div>
        </div>
        <button class="switch ${withAnswer ? 'on' : ''}" id="answerSwitch" onclick="toggleAnswer()" aria-label="导出带答案"></button>
      </div>
    </div>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn ghost" onclick="exportPaper()">导出 ${withAnswer ? '含答案' : '练习卷'}</button>
      <button class="btn primary" onclick="go('grade')">去批改这份卷</button>
    </div>
  </div>`;
}

function toggleAnswer() {
  if (!ui.lastPaper) return;
  ui.lastPaper.withAnswer = ui.lastPaper.withAnswer === false;
  renderPaper(ui.lastPaper);
  toast(ui.lastPaper.withAnswer ? '答案区已显示' : '答案区已隐藏');
}

/* ---------- 导出：可含 / 不含答案 ---------- */
function exportPaper() {
  const p = ui.lastPaper;
  if (!p) { toast('还没有生成试卷', true); return; }
  const withAnswer = p.withAnswer !== false;
  const passages = Array.isArray(p.passages) && p.passages.length
    ? p.passages
    : (p.passage ? [{ no: 1, genre: p.genre, title: '', text: p.passage }] : []);

  const stemBlock = (q) => {
    const hasOpts = (q.options || []).length > 0;
    const opts = hasOpts
      ? `<ol class="opts">${q.options.map(o => `<li>${esc(o)}</li>`).join('')}</ol>`
      : '<div class="lines"><i></i><i></i><i></i></div>';
    return `<section class="q">
      <div class="qmeta"><span class="qno">${esc(q.no)}</span><span class="qtype">${esc(q.type || '')}</span></div>
      <h4>${esc(q.stem || '').replace(/____+/g, '<span class="b"></span>')}</h4>
      ${opts}
    </section>`;
  };

  const bodyHTML = passages.length
    ? passages.map((ps, i) => {
        const own = p.questions.filter(q => Number(q.passage || 1) === i + 1);
        const extra = i === passages.length - 1 ? p.questions.filter(q => Number(q.passage || 1) > passages.length) : [];
        return `<div class="passage-wrap">
          ${passages.length > 1 ? `<div class="pno">阅读（${['一', '二', '三'][i] || i + 1}）${ps.genre ? ' · ' + esc(ps.genre) : ''}</div>` : ''}
          ${ps.title ? `<div class="ptitle">${esc(ps.title)}</div>` : ''}
          <div class="p">${esc(ps.text || '').split('\n').filter(Boolean).map(t => `<p>${t}</p>`).join('')}</div>
          ${own.concat(extra).map(stemBlock).join('')}
        </div>`;
      }).join('')
    : p.questions.map(stemBlock).join('');

  const answerHTML = withAnswer ? `<div class="answer-sheet">
    <h3>参考答案</h3>
    ${p.questions.map(q => `<div class="a-row"><span class="a-no">${esc(q.no)}</span>
      <div><b>${esc(q.answer || '略')}</b>${q.analysis ? `<span class="a-an">${esc(q.analysis)}</span>` : ''}</div></div>`).join('')}
  </div>` : '';

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}${withAnswer ? '' : '（练习卷）'}</title>
<style>
  body{font-family:"Songti SC","SimSun",serif;max-width:780px;margin:40px auto;padding:0 30px;color:#2B2A28;line-height:1.95;font-size:16px}
  h1{text-align:center;letter-spacing:3px;font-size:24px;margin:0 0 8px}
  .meta{text-align:center;color:#8C857A;font-size:13px;margin-bottom:8px}
  .line{text-align:center;color:#B4ACA0;font-size:13px;margin-bottom:26px}
  .passage-wrap{margin-bottom:30px}
  .pno{font-size:14px;color:#A8402C;letter-spacing:2px;margin-bottom:8px}
  .ptitle{text-align:center;font-size:17px;margin-bottom:8px}
  .p{text-indent:2em;text-align:justify;margin-bottom:14px}
  .p p{margin:0 0 6px}
  .q{padding-top:16px;margin-top:14px;border-top:1px dashed #E0D6C0}
  .qmeta{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;color:#8C857A}
  .qno{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border-radius:6px;background:#C8553D;color:#fff;font-family:sans-serif;font-size:12px;padding:0 5px}
  .q h4{margin:0 0 6px;font-size:16px;font-weight:normal;line-height:1.9}
  ol.opts{margin:0;padding-left:6px;list-style:none}
  ol.opts li{margin:2px 0}
  .lines{margin-top:6px}
  .lines i{display:block;border-bottom:1px solid #D9CFBA;height:28px}
  .b{display:inline-block;min-width:56px;border-bottom:1px solid #8C857A;margin:0 3px}
  .answer-sheet{margin-top:36px;border-top:2px solid #C8553D;padding-top:14px}
  .answer-sheet h3{font-size:16px;letter-spacing:2px;margin:0 0 10px}
  .a-row{display:flex;gap:10px;padding:7px 0;border-bottom:1px dashed #E7DFCF;font-size:14px;line-height:1.85}
  .a-no{flex:0 0 22px;color:#A8402C;font-weight:bold;font-family:sans-serif}
  .a-an{color:#6B6459;margin-left:6px}
  @media print{body{margin:0;padding:0 12mm}.answer-sheet{page-break-before:always}}
  @media (max-width:520px){body{padding:0 16px;font-size:15px}}
</style></head>
<body>
  <h1>${esc(p.title)}</h1>
  <div class="meta">${esc(p.grade)} · ${esc(p.diff)} · 共 ${p.questions.length} 题${withAnswer ? ' · 附参考答案' : ''}</div>
  <div class="line">班级__________　姓名__________　得分__________</div>
  ${bodyHTML}
  ${answerHTML}
</body></html>`;

  const name = `${p.title || '语文练习'}${withAnswer ? '-含答案' : '-练习卷'}.html`;
  download(name, html, 'text/html');
  toast(withAnswer ? '已导出：含答案版' : '已导出：纯练习卷');
}

/* 下载/保存：APK 内走系统文件选择器，浏览器内走 <a download> */
function download(name, content, type) {
  const safeName = name.replace(/[\\/:*?"<>|]/g, '_');
  const mime = (type || 'application/json').replace(';charset=utf-8', '');
  const N = window.YW_API.NATIVE;
  if (N) {
    try {
      // 中文需先转 UTF-8 再 base64，避免原生解码乱码
      const bytes = new TextEncoder().encode(content);
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      }
      N.saveFile(safeName, mime, btoa(bin));
      toast('请选择保存位置');
      return;
    } catch (e) {
      toast('保存失败：' + e.message, true);
      return;
    }
  }
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safeName;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
}

/* 原生保存回调 */
window.YW.onSaveResult = function (ok, msg) {
  if (typeof toast === 'function') toast(msg || (ok ? '已保存' : '保存失败'), !ok);
};


/* ---- 暴露给后续模块 ---- */
window.setMode = setMode; window.exportPaper = exportPaper;
Object.assign(YW, {
  $, $$, esc, toast, go, syncApiState, fillStudentSelect, exportPaper, setMode, bindMakeForm, iconCheck, renderPaper, toggleAnswer, generate, renderHome, syncApiState, saveCfg,
  num, str, clamp, uid, nowStr, avatarHTML, download, errorCard, hasKey, findRec, loadState, saveData,
  getS: () => S, getUi: () => ui, saveData
});
})();
