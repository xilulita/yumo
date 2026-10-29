/* ============================================================
   事件代理：让页面不依赖内联 onclick
   - 兼容 CSP（script-src 'self' 时内联事件会被拦截）
   - 统一处理 data-act / data-tab 属性
   ============================================================ */
(function () {
  /* 动作名 → 全局函数名 */
  const ACT = {
    'go': 'go',
    'mode': 'setMode',
    'gen': 'generate',
    'export-paper': 'exportPaper',
    'share-paper': 'sharePaper',
    'toggle-answer': 'toggleAnswer',
    'pick-image': 'pickImage',
    'toggle-paste': 'toggleTextPaste',
    'clear-image': 'clearImage',
    'run-grade': 'runGrade',
    'open-student': 'openStudent',
    'add-student': 'openAddStudent',
    'edit-student': 'editStudent',
    'save-student': 'saveStudent',
    'close-modal': 'closeModal',
    'gen-practice': 'genPractice',
    'export-practice': 'exportPractice',
    'export-stu-practice': 'exportStuPractice',
    'grade-for': 'gradeFor',
    'render-grade': 'renderGrade',
    'save-config': 'saveConfig',
    'clear-key': 'clearKey',
    'reset-demo': 'resetDemo',
    'export-data': 'exportData',
    'toggle-guard': 'toggleGuard',
    'print': 'printPage',
    'fill': 'fillSettings',
    'open-report': 'renderGrade',
    'export-stu-practice-enc': 'exportStuPractice'
  };

  /* 特殊动作 */
  function special(act, el) {
    if (act === '__click') {
      const id = (el.dataset.arg || '').replace(/[\[\]"']/g, '');
      const t = document.getElementById(id);
      if (t) t.click();
      return true;
    }
    if (act === '__self-close') {
      if (window.closeModal) window.closeModal();
      return true;
    }
    if (act === '__toggle-self') {
      el.classList.toggle('on');
      return true;
    }
    // 打开某条批改记录的报告（找不到时用 data-rec 备份）
    if (act === 'open-report') {
      const id = (el.dataset.arg || '').replace(/[\[\]"']/g, '');
      let rec = null;
      if (window.findRec) rec = window.findRec(id);
      if (!rec && el.dataset.rec) {
        try { rec = JSON.parse(el.dataset.rec); } catch (e) { rec = null; }
      }
      if (rec && window.renderGrade) window.renderGrade(rec);
      return true;
    }
    // 导出专项卷（数据在 data-enc 里，避免超长参数）
    if (act === 'export-stu-practice-enc') {
      const id = (el.dataset.arg || '').replace(/[\[\]"']/g, '');
      const enc = el.dataset.enc || '';
      if (window.exportStuPractice) window.exportStuPractice(id, enc);
      return true;
    }
    return false;
  }

  const VALID_PAGES = ['home', 'make', 'grade', 'report', 'students', 'settings'];

  function call(name, args) {
    if (name === 'go') {
      const p = Array.isArray(args) ? args[0] : args;
      if (VALID_PAGES.indexOf(String(p)) === -1) {
        console.warn('[事件代理] 非法页面名：' + p);
        args = ['home'];
      }
    }
    const fn = window[name];
    if (typeof fn === 'function') return fn.apply(null, args || []);
    console.warn('[事件代理] 未找到函数：' + name);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    e.preventDefault();
    const act = el.dataset.act;
    if (special(act, el)) return;
    // 带 mode 的快捷入口：先切页再切模式
    if (el.dataset.mode && window.setMode) {
      setTimeout(() => window.setMode(el.dataset.mode), 30);
    }
    const fnName = ACT[act] || act;
    let args = [];
    if (el.dataset.arg) {
      const raw = el.dataset.arg.trim();
      try {
        args = JSON.parse(raw);
      } catch (err) {
        // 兼容 ['xxx'] 这类单引号写法
        try {
          args = JSON.parse(raw.replace(/'/g, '"'));
        } catch (e2) {
          args = [raw];
        }
      }
      if (!Array.isArray(args)) args = [args];
    }
    call(fnName, args);
  });

  /* 弹层遮罩：点空白处关闭 */
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'modal') {
      if (window.closeModal) window.closeModal();
    }
  });

  /* 底栏与桌面侧栏：data-tab 统一绑定（data-act 优先，无则按 tab 跳转） */
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab[data-tab], .rail-item[data-tab]');
    if (!tab || tab.hasAttribute('data-act')) return;
    e.preventDefault();
    call('go', [tab.dataset.tab]);
  });

  /* 输入类控件：data-input="函数名" 时在 input 事件里触发 */
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (!el) return;
    const fn = window[el.dataset.input];
    if (typeof fn === 'function') fn(e);
  });
})();
