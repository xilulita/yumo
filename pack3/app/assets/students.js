(function(){
const { $, $$, esc, toast, go, syncApiState, fillStudentSelect, loadState, saveData, bindMakeForm, bindGradeForm, renderHome, saveCfg, num, str, clamp, uid, nowStr, avatarHTML, download, errorCard, hasKey, findRec } = YW;
const S = YW.getS(), ui = YW.getUi();
const { callAI, parseJSONLoose, testConnection, PRESETS } = window.YW_API;
/* ============================================================
   学生档案 · 设置 · 数据
   ============================================================ */

function renderStudents() {
  const grid = $('#stuGrid');
  $('#stuEmpty').style.display = S.students.length ? 'none' : '';
  grid.innerHTML = S.students.map(s => {
    const logs = (s.logs || []);
    const bars = logs.slice(0, 6).reverse().map(l => {
      const rate = l.total ? l.score / l.total * 100 : l.score;
      const cls = rate >= 85 ? 'hi' : rate >= 65 ? 'mid' : 'lo';
      return `<i class="${cls}" style="height:${Math.max(18, Math.min(100, rate))}%"></i>`;
    }).join('');
    const errs = logs.reduce((n, l) => n + (l.errors ? l.errors.length : 0), 0);
    return `<button class="stu-card" data-act="open-student" data-arg="['${s.id}']">
      <div class="top">${avatarHTML(s)}
        ${errs ? `<span class="tag-tiny">${errs} 处错题</span>` : `<span class="tag-tiny" style="background:var(--jade-soft);color:var(--jade-d)">暂无错题</span>`}
      </div>
      <div class="nm">${esc(s.name)}</div>
      <div class="meta2">${esc(s.cls || '未分班')}${s.no ? ' · ' + esc(s.no) + '号' : ''}</div>
      ${bars ? `<div class="mini-bars">${bars}</div>` : `<div class="mini-bars empty-bars"><i></i><i></i><i></i><i></i><i></i><i></i></div>`}
      <div class="foot"><span>${logs.length ? logs.length + ' 次批改' : '还没有作业'}</span><span>${s.lastScore != null ? s.lastScore + ' 分' : '—'}</span></div>
    </button>`;
  }).join('');
  renderStudentDetail();
}

function openStudent(id) {
  ui.currentStudent = id;
  go('students');
  setTimeout(() => {
    const el = $('#stuDetail');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

function renderStudentDetail() {
  const box = $('#stuDetail');
  const s = S.students.find(x => x.id === ui.currentStudent);
  if (!s) { box.innerHTML = ''; return; }
  const logs = (s.logs || []).slice().sort((a, b) => b.time - a.time);
  const errs = [];
  logs.forEach(l => (l.errors || []).forEach(e => errs.push({ ...e, when: l.time, logId: l.id })));
  const typeCount = {};
  errs.forEach(e => { const k = e.type || '其他'; typeCount[k] = (typeCount[k] || 0) + 1; });
  const topTypes = Object.entries(typeCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const avg = logs.length ? Math.round(logs.reduce((a, l) => a + (l.total ? l.score / l.total * 100 : l.score), 0) / logs.length) : 0;

  const logHTML = logs.length ? logs.map(l => `
    <button class="card" style="margin-top:10px;padding:13px 14px;width:100%;text-align:left;border:0;font:inherit;color:inherit;cursor:pointer;display:block"
      data-act="open-report" data-arg="['${l.id}']" data-rec='${esc(JSON.stringify(l))}'>
      <div style="display:flex;align-items:center;gap:9px">
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:800">${esc(l.title || '作业')}</div>
          <div style="font-size:11px;color:var(--ink-3);margin-top:2px">${esc(nowStr(l.time))} · 用时 ${l.seconds ? l.seconds.toFixed(1) : '—'}s</div>
        </div>
        <span class="badge-err">${l.score}<small style="opacity:.65">分</small></span>
      </div>
      ${l.summary ? `<div class="muted" style="font-size:12px;margin-top:7px;color:var(--ink-2)">${esc(l.summary)}</div>` : ''}
      <div style="font-size:11px;color:var(--ochre);margin-top:7px;font-weight:700">查看报告 ›</div>
    </button>`).join('') : '<div class="empty" style="padding:16px">这位学生还没有批改记录。</div>';

  box.innerHTML = `<div class="card fadeup" style="background:linear-gradient(160deg,#FFFDF7,#FBF3E4)">
    <div style="display:flex;align-items:center;gap:12px">
      ${avatarHTML(s, 52)}
      <div style="flex:1">
        <div style="font-size:17px;font-weight:800">${esc(s.name)}</div>
        <div style="font-size:11.5px;color:var(--ink-3);margin-top:3px">${esc(s.cls || '未分班')}${s.note ? ' · ' + esc(s.note) : ''}</div>
      </div>
      <button class="btn ghost btn-sm" data-act="edit-student" data-arg="['${s.id}']" style="min-height:34px;padding:7px 12px">编辑</button>
    </div>
    <div class="stats" style="margin-top:14px">
      <div class="stat" style="box-shadow:var(--shadow-in-sm)"><b>${logs.length}</b><span>批改次数</span></div>
      <div class="stat" style="box-shadow:var(--shadow-in-sm)"><b style="color:var(--jade)">${logs.length ? avg + '<span style="font-size:12px;font-weight:700">%</span>' : '—'}</b><span>平均得分率</span></div>
      <div class="stat" style="box-shadow:var(--shadow-in-sm)"><b style="color:var(--seal)">${errs.length}</b><span>累计错题</span></div>
    </div>
    ${topTypes.length ? `<div style="margin-top:13px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:11.5px;color:var(--ink-3);letter-spacing:.5px">高频薄弱点</span>
        <span style="font-size:11px;color:var(--ink-4)">按错题次数排序</span>
      </div>
      <div class="chips">${topTypes.map(([k, v], i) => `<span class="chip ${i === 0 ? 'on seal' : ''}" style="pointer-events:none;min-height:30px;padding:5px 11px;font-size:12px">${esc(k)} <span class="mini" style="opacity:.75">${v} 次</span></span>`).join('')}</div>
    </div>` : ''}
  </div>

  <div class="sec-hd" style="margin:18px 2px 4px"><h3>错题档案</h3><span class="muted" style="font-size:11.5px">${errs.length} 条</span></div>
  ${errs.length ? errs.slice(0, 8).map((e, i) => `
    <div class="err-card" style="margin-top:9px">
      <div class="eh"><span class="no">${esc(e.no)}</span><span class="et">${esc(e.question || '题目')}</span><span class="ep">${esc(e.type || '')}</span></div>
      <div class="ec"><span class="lbl r">作答</span>${esc(e.studentAnswer || '—')}</div>
      <div class="ec"><span class="lbl">应为</span>${esc(e.correctAnswer || '—')}</div>
      <div class="ec" style="margin-top:3px"><span class="lbl">思路</span>${esc(e.fix || e.reason || '—')}</div>
    </div>`).join('') : '<div class="card" style="text-align:center;color:var(--ink-3);font-size:12.5px">暂无错题，优秀。</div>'}

  <div class="btn-row" style="margin-top:14px">
    <button class="btn ghost" data-act="gen-practice" data-arg="['${s.id}']">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      生成专项卷
    </button>
    <button class="btn primary" data-act="grade-for" data-arg="['${s.id}']">批改其作业</button>
  </div>
  <div id="stuPracOut" style="margin-top:12px"></div>

  <div class="sec-hd" style="margin:18px 2px 0"><h3>批改记录</h3></div>
  ${logHTML}`;
}

function gradeFor(id) {
  ui.currentStudent = id;
  go('grade');
  fillStudentSelect(id);
  $('#gradeStudent').value = id;
}

/* ---------- 专项卷（基于该生错题） ---------- */
async function genPractice(studentId) {
  const s = S.students.find(x => x.id === studentId);
  if (!s) return;
  if (!hasKey()) { toast('生成专项卷需要 AI 接口，请先配置。', true); go('settings'); return; }
  const errs = [];
  (s.logs || []).forEach(l => (l.errors || []).forEach(e => errs.push(e)));
  if (!errs.length) { toast('这位学生还没有错题记录，先批改一份作业吧', true); return; }

  const out = $('#stuPracOut');
  out.innerHTML = `<div class="card"><div class="muted" style="font-size:12.5px">正在根据 ${errs.length} 处错题命题…</div>
    <div class="loading-lines"><div class="skel" style="width:88%"></div><div class="skel" style="width:72%"></div><div class="skel" style="width:92%"></div></div></div>`;

  const brief = errs.slice(0, 12).map((e, i) => `${i + 1}. [${e.type || '题型'}] ${e.question || ''}；学生答：${e.studentAnswer || '—'}；正确：${e.correctAnswer || '—'}；错因：${e.reason || '—'}`).join('\n');
  const prompt = `你是小学语文老师。下面是一位学生（${s.name}，${s.cls || '小学'}）近期的错题清单：
${brief}

请针对这些薄弱点命制一份《${s.name} 的专项巩固卷》，共 6 题，覆盖清单里出现频次最高、最关键的 3 个能力点，题目不得与原题重复，难度略低于原题以帮助建立信心。
另外：第 6 题后附一段 2 句以内的鼓励语。
只输出 JSON，不要 Markdown：
{"title":"专项巩固卷","focus":["薄弱点1","薄弱点2"],"items":[{"type":"题型","stem":"题干","answer":"答案","tip":"解题思路"}],"encourage":"鼓励语"}`;

  try {
    const raw = await callAI(S.cfg, [
      { role: 'system', content: '你是小学语文教研员，只输出合规 JSON。' },
      { role: 'user', content: prompt }
    ], { maxTokens: 3000 });
    const d = parseJSONLoose(raw);
    const items = Array.isArray(d.items) ? d.items : [];
    if (!items.length) throw new Error('模型未返回题目');
    out.innerHTML = `<div class="paper fadeup">
      <div class="ttl">${esc(d.title || '专项巩固卷')}</div>
      <div class="meta">${esc(s.name)} · 针对 ${(d.focus || []).map(esc).join('、') || '薄弱点'}</div>
      ${items.map((it, i) => `<div class="qitem" style="padding:12px 0 8px">
        <span class="qtag">${i + 1} · ${esc(it.type || '练习')}</span>
        <div class="qtext" style="font-size:14px">${esc(it.stem || '').replace(/____/g, '<span class="blank"></span>')}</div>
        <div class="answer-box" style="margin-top:8px"><div class="ans-h">答案 · 思路</div><div><b>${esc(it.answer || '略')}</b>${it.tip ? '　' + esc(it.tip) : ''}</div></div>
      </div>`).join('')}
      ${d.encourage ? `<div style="margin-top:12px;font-size:13px;color:var(--jade-d);text-align:center;font-family:var(--serif)">—— ${esc(d.encourage)}</div>` : ''}
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn ghost" data-act="export-stu-practice-enc" data-arg="['${s.id}']" data-enc="${encodeURIComponent(JSON.stringify(d))}">导出文件</button>
      <button class="btn primary" data-act="grade-for" data-arg="['${s.id}']">批改练习</button>
    </div>`;
    ui['prac_' + s.id] = d;
  } catch (err) {
    out.innerHTML = errorCard(err, '生成专项卷失败');
  }
}

function exportStuPractice(id, enc) {
  const s = S.students.find(x => x.id === id);
  let d;
  try { d = JSON.parse(decodeURIComponent(enc)); } catch (e) { return toast('数据异常', true); }
  const name = `${s ? s.name : ''} 的专项巩固卷`;
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(name)}</title>
  <style>body{font-family:"Songti SC","SimSun",serif;max-width:720px;margin:40px auto;padding:0 28px;color:#2B2A28;line-height:2}
  h1{text-align:center;font-size:22px;letter-spacing:3px;margin-bottom:4px}.meta{text-align:center;color:#8C857A;font-size:13px;margin-bottom:24px}
  .q{border-top:1px dashed #D9CFBA;padding-top:12px;margin-top:16px}.q h4{margin:4px 0;font-size:15.5px;font-weight:normal}
  .tag{display:inline-block;font-size:11px;color:#A8402C;background:#F7E3DB;border-radius:4px;padding:1px 6px}
  .ans{font-size:13px;color:#5B564F;background:#F6F2E8;padding:7px 11px;border-radius:5px;margin-top:6px}
  .b{display:inline-block;width:52px;border-bottom:1px solid #B4ACA0}@media print{.ans{display:none}}
  .end{text-align:center;margin-top:26px;color:#3E7E66;font-size:14px}</style></head>
  <body><h1>${esc(name)}</h1><div class="meta">${esc(s ? s.cls || '' : '')} · 姓名______ · ${new Date().toLocaleDateString('zh-CN')}</div>
  ${(d.items || []).map((it, i) => `<div class="q"><span class="tag">第 ${i + 1} 题 · ${esc(it.type || '')}</span>
  <h4>${esc(it.stem).replace(/____/g, '<span class="b"></span>')}</h4>
  <div class="ans">答案：${esc(it.answer)}${it.tip ? '　思路：' + esc(it.tip) : ''}</div></div>`).join('')}
  ${d.encourage ? `<div class="end">${esc(d.encourage)}</div>` : ''}</body></html>`;
  download(name + '.html', html, 'text/html');
  toast('已导出专项卷文件');
}

/* ---------- 学生增删改 ---------- */
let editingId = null;
function openAddStudent() {
  editingId = null;
  $('#sheetTitle').textContent = '新增学生';
  $('#sheetSub').textContent = '学生档案用于归档错题与生成专项练习。';
  $('#mName').value = ''; $('#mClass').value = ''; $('#mNo').value = ''; $('#mNote').value = '';
  $('#modal').classList.add('on');
  setTimeout(() => $('#mName').focus(), 120);
}
function editStudent(id) {
  const s = S.students.find(x => x.id === id);
  if (!s) return;
  editingId = id;
  $('#sheetTitle').textContent = '编辑档案';
  $('#sheetSub').textContent = '修改只会更新档案信息，历史错题保留。';
  $('#mName').value = s.name || ''; $('#mClass').value = s.cls || '';
  $('#mNo').value = s.no || ''; $('#mNote').value = s.note || '';
  $('#modal').classList.add('on');
}
function closeModal() { $('#modal').classList.remove('on'); }
function saveStudent() {
  const name = $('#mName').value.trim();
  if (!name) { toast('请填写姓名', true); $('#mName').focus(); return; }
  if (editingId) {
    const s = S.students.find(x => x.id === editingId);
    Object.assign(s, { name, cls: $('#mClass').value.trim(), no: $('#mNo').value.trim(), note: $('#mNote').value.trim() });
  } else {
    S.students.push({
      id: uid(), name, cls: $('#mClass').value.trim(), no: $('#mNo').value.trim(),
      note: $('#mNote').value.trim(), color: (S.students.length % 6) + 1, logs: [], createdAt: Date.now()
    });
    ui.currentStudent = S.students[S.students.length - 1].id;
  }
  saveData();
  closeModal();
  fillStudentSelect();
  renderStudents();
  renderHome();
  toast(editingId ? '档案已更新' : '已添加学生');
}

/* ---------- 设置 ---------- */
const PROVIDER_OF = (base) => {
  const b = (base || '').toLowerCase();
  if (b.includes('dashscope')) return 'dashscope';
  if (b.includes('openai.com')) return 'openai';
  if (b.includes('moonshot')) return 'moonshot';
  if (b.includes('bigmodel')) return 'zhipu';
  if (b.includes('deepseek')) return 'deepseek';
  return 'custom';
};

function fillSettings() {
  const set = (sel, v) => { const el = $(sel); if (el) el.value = v; };
  set('#provider', S.cfg.provider || 'dashscope');
  set('#baseUrl', S.cfg.baseUrl || '');
  set('#model', S.cfg.model || '');
  set('#apiKey', S.cfg.apiKey || '');
  set('#temp', S.cfg.temp);
  set('#timeout', S.cfg.timeout);
  const gs = $('#guardSwitch');
  if (gs) gs.classList.toggle('on', S.cfg.guarded !== false);
  syncApiState();
}

function bindSettings() {
  $('#provider').onchange = () => {
    const p = PRESETS[$('#provider').value];
    if ($('#provider').value !== 'custom') {
      $('#baseUrl').value = p.base;
      $('#model').value = p.model;
    } else {
      $('#baseUrl').value = $('#baseUrl').value || '';
    }
  };
  $('#baseUrl').addEventListener('blur', () => {
    const p = PROVIDER_OF($('#baseUrl').value);
    $('#provider').value = p;
    if (p !== 'custom' && !$('#model').value) $('#model').value = PRESETS[p].model;
  });
  ['baseUrl', 'model', 'apiKey'].forEach(id => $('#' + id).addEventListener('input', () => saveConfig(false)));
}

function saveConfig(notify) {
  S.cfg.provider = $('#provider').value;
  S.cfg.baseUrl = $('#baseUrl').value.trim();
  S.cfg.model = $('#model').value.trim();
  S.cfg.apiKey = $('#apiKey').value.trim();
  S.cfg.temp = Number($('#temp').value) || 0.6;
  S.cfg.timeout = Number($('#timeout').value) || 90;
  saveCfg();
  syncApiState();
  if (!notify) return;
  if (!hasKey()) { toast('还差一步：请填写 Base URL、模型名和 API Key', true); return; }
  testNow();
}

async function testNow() {
  const badge = $('#cfgBadge');
  badge.textContent = '测试中';
  badge.className = 'key-state no';
  $('#cfgState').textContent = '正在发送一次最小请求…';
  try {
    const reply = await testConnection(S.cfg);
    badge.textContent = '已连接';
    badge.className = 'key-state ok';
    $('#cfgState').textContent = `连通正常 · 模型回复「${String(reply).slice(0, 20)}」`;
    toast('接口连通，可以开始出题了');
  } catch (err) {
    badge.textContent = '连接失败';
    badge.className = 'key-state no';
    $('#cfgState').textContent = err.message;
    toast('连接失败：' + err.message.slice(0, 70), true);
    return;
  }
  syncApiState();
}

function clearKey() {
  S.cfg.apiKey = '';
  $('#apiKey').value = '';
  saveCfg();
  syncApiState();
  $('#cfgBadge').textContent = '未连接';
  $('#cfgBadge').className = 'key-state no';
  $('#cfgState').textContent = '未配置：出题与批改会被阻止';
  toast('已清除本地密钥');
}

function toggleGuard() {
  S.cfg.guarded = !$('#guardSwitch').classList.contains('on') ? true : false;
  $('#guardSwitch').classList.toggle('on', S.cfg.guarded);
  saveCfg();
}

/* ---------- 备份 ---------- */
function exportData() {
  const payload = { app: 'yuwencraft', version: 1, exportedAt: Date.now(), students: S.students, history: S.history, papers: S.papers };
  download(`语墨备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('备份已导出（不含密钥）');
}

function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.students)) throw new Error('文件结构不符');
      if (!confirm(`将导入 ${d.students.length} 位学生与 ${(d.history || []).length} 条批改记录，当前数据会被覆盖。继续？`)) return;
      S.students = d.students; S.history = d.history || []; S.papers = d.papers || [];
      saveData(); renderStudents(); renderHome(); fillStudentSelect();
      toast('导入完成');
    } catch (e) { toast('导入失败：' + e.message, true); }
  };
  r.readAsText(file);
}

function resetDemo() {
  if (!confirm('将清空所有学生、错题与批改记录，恢复初始示例数据。继续？')) return;
  S.students = seedStudents(); S.history = []; S.papers = [];
  saveData(); ui.currentStudent = null;
  fillStudentSelect(); renderStudents(); renderHome();
  toast('已重置');
}

/* ---------- 首次数据（仅名单，无任何伪造成绩） ---------- */
function seedStudents() {
  return [
    { id: uid(), name: '林小禾', cls: '三（2）班', no: '12', note: '阅读速度快，答题偏简洁', color: 1, logs: [] },
    { id: uid(), name: '周予安', cls: '三（2）班', no: '23', note: '字词基础扎实', color: 2, logs: [] },
    { id: uid(), name: '陈砚知', cls: '三（2）班', no: '07', note: '需加强概括能力', color: 3, logs: [] },
    { id: uid(), name: '许南舟', cls: '三（2）班', no: '31', note: '书写工整，审题易粗心', color: 4, logs: [] }
  ];
}

/* ---------- 启动 ---------- */
function boot() {
  loadState();
  if (!S.students.length) { S.students = seedStudents(); saveData(); }
  bindMakeForm();
  bindGradeForm();
  bindSettings();
  fillSettings();
  fillStudentSelect();
  renderHome();
  renderStudents();
  syncApiState();

  const tickClock = () => {
    const el = $('#sbClock');
    if (!el) return;
    const d = new Date();
    el.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  tickClock(); setInterval(tickClock, 30000);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  console.log('[语墨] 初始化完成 · 接口' + (hasKey() ? '已配置' : '未配置'));
}

const origGo = YW.go;
YW.go = (page) => { origGo(page); if (page === 'settings') fillSettings(); };
window.fillSettings = () => fillSettings();
window.addEventListener('load', boot);


Object.assign(YW, { openStudent, renderStudentDetail, genPractice, exportStuPractice, openAddStudent, editStudent, closeModal,
  saveStudent, fillSettings, saveConfig, clearKey, toggleGuard, exportData, importData, resetDemo, boot,
  gradeFor, renderStudents, findRec, fillSettings, saveCfg, __S: S, __ui: ui });

/* ---- 全局事件桥接（供 HTML 内联 onclick 使用） ---- */
window.go = (...a) => YW.go(...a);
const fn = (n) => (...a) => { const f = YW[n]; if (typeof f !== 'function') throw new Error('未导出: ' + n); return f(...a); };
Object.assign(window, {
  go: fn('go'), setMode: fn('setMode'), openStudent: fn('openStudent'),
  openAddStudent: fn('openAddStudent'), editStudent: fn('editStudent'),
  saveStudent: fn('saveStudent'), closeModal: fn('closeModal'),
  exportPaper: fn('exportPaper'), sharePaper: (...a) => YW.sharePaper(...a), exportPractice: fn('exportPractice'),
  genPractice: fn('genPractice'), exportStuPractice: fn('exportStuPractice'),
  generate: fn('generate'), runGrade: fn('runGrade'), gradeFor: fn('gradeFor'),
  saveConfig: fn('saveConfig'), clearKey: fn('clearKey'), resetDemo: fn('resetDemo'),
  exportData: fn('exportData'), pickImage: fn('pickImage'),
  toggleTextPaste: fn('toggleTextPaste'), clearImage: fn('clearImage'),
  toggleGuard: fn('toggleGuard'), renderGrade: fn('renderGrade'), findRec: fn('findRec'),
  renderPaper: fn('renderPaper'), toggleAnswer: fn('toggleAnswer')
});
})();
