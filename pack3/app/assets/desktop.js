/* ============================================================
   桌面端（Electron）适配 —— 独立桌面外壳
   - 接管保存 / 选图 / 菜单
   - 桌面不需要手机版的首屏收口逻辑
   ============================================================ */
(function () {
  const D = window.YWDesktop;
  if (!D) return;

  document.documentElement.classList.add('desktop');
  window.YW = window.YW || {};

  /* ---- 保存：系统另存为 ---- */
  window.YW.download = async function (name, content, type) {
    const mime = (type || 'application/json').replace(';charset=utf-8', '');
    const r = await D.saveFile(name, content, mime);
    if (r && r.ok) {
      if (typeof window.toast === 'function') window.toast('已保存到 ' + r.path);
      return;
    }
    if (r && r.cancelled) return;
    if (typeof window.toast === 'function') window.toast('保存失败：' + (r && r.error ? r.error : '未知错误'), true);
  };
  window.download = window.YW.download;

  /* ---- 选图：系统对话框 ---- */
  window.YW.pickImage = async function () {
    const r = await D.openImage();
    if (!r || !r.ok) return;
    try {
      const bin = atob(r.dataUrl.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const mime = (r.dataUrl.match(/^data:([^;]+);/) || [])[1] || 'image/jpeg';
      const ext = mime.split('/')[1] || 'jpg';
      window.YW.handleImage(new File([arr], r.name || ('作业.' + ext), { type: mime }));
    } catch (e) {
      if (typeof window.toast === 'function') window.toast('图片读取失败：' + e.message, true);
    }
  };
  window.pickImage = window.YW.pickImage;

  /* ---- 拖拽导入 ---- */
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    const up = document.querySelector('#page-grade.on .uploader');
    if (up) up.classList.add('drag');
  });
  document.addEventListener('dragleave', (e) => {
    const up = document.querySelector('#page-grade.on .uploader');
    if (up) up.classList.remove('drag');
  });
  document.addEventListener('drop', (e) => {
    const up = document.querySelector('#page-grade.on .uploader');
    if (up) up.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    if (/^image\//.test(f.type) && window.YW.handleImage) {
      window.YW.handleImage(f);
    } else if (/^text\//.test(f.type) || /\.(txt|md)$/i.test(f.name)) {
      f.text().then((t) => {
        const ta = document.getElementById('answerText');
        const box = document.getElementById('textPaste');
        if (ta) ta.value = t;
        if (box) box.style.display = '';
        if (typeof window.toast === 'function') window.toast('已读入文字稿件');
      });
    } else {
      if (typeof window.toast === 'function') window.toast('请拖入图片或文本文件', true);
    }
  });

  /* ---- 菜单指令 ---- */
  if (typeof D.onMenu === 'function') {
    D.onMenu((action, payload) => {
      switch (action) {
        case 'make':
        case 'grade':
          window.YW.go && window.YW.go(action);
          break;
        case 'backup':
          if (window.YW.exportData) window.YW.exportData();
          break;
        case 'restore':
          (async () => {
            const r = await D.openJson();
            if (!r || !r.ok) return;
            try {
              const d = JSON.parse(r.text);
              if (!Array.isArray(d.students)) throw new Error('文件结构不符');
              const ok = confirm(`将导入 ${d.students.length} 位学生与 ${(d.history || []).length} 条批改记录，当前数据会被覆盖。继续？`);
              if (!ok) return;
              const S = window.YW.getS();
              S.students = d.students;
              S.history = d.history || [];
              S.papers = d.papers || [];
              window.YW.saveData();
              window.YW.renderStudents && window.YW.renderStudents();
              window.YW.renderHome && window.YW.renderHome();
              if (typeof window.toast === 'function') window.toast('导入完成');
            } catch (err) {
              if (typeof window.toast === 'function') window.toast('导入失败：' + err.message, true);
            }
          })();
          break;
        case 'msg':
          if (typeof window.toast === 'function') window.toast(payload, true);
          break;
      }
    });
  }

  /* ---- 桌面：Ctrl+P 交给主进程菜单处理 ---- */
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') e.preventDefault();
  });

  /* ---- 首次提示 ---- */
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (!localStorage.getItem('yw.desktop.notice.v2')) {
        localStorage.setItem('yw.desktop.notice.v2', '1');
        if (typeof window.toast === 'function') {
          window.toast('数据保存在本机，卸载前请先用 Ctrl+S 导出备份');
        }
      }
    }, 1000);
  });
})();
