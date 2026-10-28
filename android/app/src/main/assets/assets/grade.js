(function(){
const { $, $$, esc, toast, go, num, str, clamp, uid, nowStr, download, errorCard, hasKey, findRec, fillStudentSelect, iconCheck, saveData } = YW;
const { callAI, parseJSONLoose, PROMPTS } = window.YW_API;
const S = YW.getS(), ui = YW.getUi();
const IMG_MAX_SIDE = 1600;
/* ============================================================
   批改：图片 / 文字 → 结构化学情
   ============================================================ */

function bindGradeForm() {
  const up = $('#uploader');
  $('#fileInput').onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleImage(f);
    e.target.value = '';
  };
  ['dragenter', 'dragover'].forEach(ev => up.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); up.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach(ev => up.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    if (ev === 'dragleave' && up.contains(e.relatedTarget)) return;
    up.classList.remove('drag');
  }));
  up.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /^image\//.test(f.type)) {
      handleImage(f);
    } else if (f) {
      if (/^text\//.test(f.type) || /\.(txt|md)$/i.test(f.name)) {
        f.text().then(t => { $('#answerText').value = t; $('#textPaste').style.display = ''; toast('已读入文字稿件'); });
      } else {
        toast('请拖入图片（JPG/PNG）或文本文件', true);
      }
    }
  });
  // 粘贴图片
  document.addEventListener('paste', (e) => {
    if (!$('#page-grade').classList.contains('on') && !$('#page-make').classList.contains('on')) return;
    const items = Array.from(e.clipboardData?.items || []);
    const img = items.find(i => i.type && i.type.startsWith('image/'));
    if (img) { e.preventDefault(); handleImage(img.getAsFile()); }
  });
  $('#gradeStudent').onchange = () => { ui.currentStudent = $('#gradeStudent').value; };
  $('#impFile').onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importData(f);
    e.target.value = '';
  };
}

function pickImage() { $('#fileInput').click(); }

function toggleTextPaste() {
  const el = $('#textPaste');
  const show = el.style.display === 'none';
  el.style.display = show ? '' : 'none';
  if (show) setTimeout(() => $('#answerText').focus(), 60);
}

function clearImage() {
  ui.image = null;
  const img = $('#upPreview');
  img.style.display = 'none'; img.removeAttribute('src');
  $('#upOvl').style.display = 'none';
  $('#upEmpty').style.display = 'flex';
  $('#upFile').style.display = 'none';
  $('#uploader').classList.remove('has-img');
}

function handleImage(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('只支持图片文件', true); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const raw = new Image();
    raw.onload = () => {
      // 压缩到长边 1600，兼顾识别率与请求体积
      let { width: w, height: h } = raw;
      const scale = Math.min(1, IMG_MAX_SIDE / Math.max(w, h));
      const cw = Math.round(w * scale), ch = Math.round(h * scale);
      const cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(raw, 0, 0, cw, ch);
      let dataUrl = cv.toDataURL('image/jpeg', 0.86);
      // 体积保护：超过 3.5MB 再降一档
      if (dataUrl.length > 3.5 * 1024 * 1024 * 1.37) dataUrl = cv.toDataURL('image/jpeg', 0.7);
      ui.image = { dataUrl, name: file.name || '作业照片.jpg', w: cw, h: ch };
      const pv = $('#upPreview');
      pv.src = dataUrl; pv.style.display = 'block';
      $('#upOvl').style.display = 'block';
      $('#upEmpty').style.display = 'none';
      $('#upFile').style.display = 'flex';
      $('#upName').textContent = `${ui.image.name} · ${cw}×${ch}`;
      const up = $('#uploader');
      up.style.minHeight = '250px';
      up.classList.add('has-img');
    };
    raw.onerror = () => toast('图片解码失败，请换一张', true);
    raw.src = reader.result;
  };
  reader.onerror = () => toast('读取文件失败（可能权限受限），可尝试重新选择', true);
  reader.readAsDataURL(file);
}

async function runGrade() {
  if (!hasKey()) {
    toast('未配置 AI 接口：批改需要真实调用模型，已阻止提交。请先到「设置」配置后再试。', true);
    go('settings');
    return;
  }
  const text = $('#answerText').value.trim();
  if (!ui.image && !text) {
    toast('请先上传作业图片，或粘贴学生作答文字', true);
    return;
  }
  if (!S.students.length) {
    toast('请先在「学生」里添加这位学生，才能归档学情', true);
    openAddStudent();
    return;
  }
  const btn = $('#gradeBtn');
  if (btn.dataset.busy) return;
  const stu = S.students.find(s => s.id === $('#gradeStudent').value) || S.students[0];

  btn.dataset.busy = '1';
  btn.disabled = true;
  const startedAt = Date.now();
  btn.innerHTML = '<span class="spin"></span> 批改中 <b id="gradeSec" style="font-variant-numeric:tabular-nums">0.0s</b>';
  const tick = setInterval(() => {
    const el = $('#gradeSec');
    if (el) el.textContent = ((Date.now() - startedAt) / 1000).toFixed(1) + 's';
  }, 100);

  $('#gradeOut').innerHTML = `<div class="card fadeup"><div class="muted" style="font-size:12.5px">正在读取${ui.image ? '作业照片' : '作答文字'}，逐题比对…</div>
    <div class="loading-lines"><div class="skel" style="width:90%"></div><div class="skel" style="width:76%"></div><div class="skel" style="width:94%"></div><div class="skel" style="width:64%"></div></div></div>`;

  const prompt = PROMPTS.grade({ studentName: stu.name, grade: stu.grade || '', image: !!ui.image, text });
  const content = [];
  if (ui.image) content.push({ type: 'image_url', image_url: { url: ui.image.dataUrl } });
  content.push({ type: 'text', text: prompt });

  try {
    const raw = await callAI(S.cfg, [
      { role: 'system', content: '你是经验丰富的小学语文教师，批改严谨、措辞亲切，只输出符合要求的 JSON。' },
      { role: 'user', content }
    ], { maxTokens: 4500 });
    const data = parseJSONLoose(raw);
    if (!data || typeof data !== 'object' || !('score' in data) && !Array.isArray(data.errors)) {
      throw new Error('模型返回内容缺少批改字段，请重试或换用视觉能力更强的模型。');
    }
    const secs = Math.max(0.1, (Date.now() - startedAt) / 1000);
    const rec = {
      id: uid(),
      studentId: stu.id,
      studentName: stu.name,
      time: Date.now(),
      seconds: Number(secs.toFixed(1)),
      title: $('#srcSeg button.on')?.textContent.trim() || '作业',
      source: ui.src,
      score: num(data.score, 0),
      total: num(data.total, 100),
      correct: num(data.correct, 0),
      totalQ: num(data.totalQ, (data.errors || []).length + num(data.correct, 0)) || (data.errors || []).length,
      summary: str(data.summary),
      ability: Array.isArray(data.ability) ? data.ability.slice(0, 5).map(a => ({ name: str(a.name), rate: clamp(num(a.rate, 0)) })) : [],
      errors: Array.isArray(data.errors) ? data.errors.map((e, i) => ({
        no: e.no != null ? e.no : i + 1,
        type: str(e.type), question: str(e.question), studentAnswer: str(e.studentAnswer),
        correctAnswer: str(e.correctAnswer), reason: str(e.reason), fix: str(e.fix)
      })) : [],
      practice: data.practice && Array.isArray(data.practice.items)
        ? { title: str(data.practice.title) || '专项加练', items: data.practice.items.map(it => ({ stem: str(it.stem), answer: str(it.answer), tip: str(it.tip) })) }
        : null,
      nextStep: str(data.nextStep),
      thumb: ui.image ? ui.image.dataUrl.slice(0, 0) : ''
    };
    S.history.unshift(rec);
    S.history = S.history.slice(0, 300);
    const s = S.students.find(x => x.id === stu.id);
    if (s) {
      s.logs = s.logs || [];
      s.logs.push(rec);
      s.lastAt = rec.time;
      s.lastScore = rec.score;
    }
    saveData();
    ui.lastGrade = rec;
    renderGrade(rec);
    toast(`批改完成，用时 ${rec.seconds} 秒`);
  } catch (err) {
    $('#gradeOut').innerHTML = errorCard(err, '批改失败');
    toast('批改失败：' + err.message.slice(0, 60), true);
  } finally {
    clearInterval(tick);
    delete btn.dataset.busy;
    btn.disabled = false;
    btn.innerHTML = iconCheck() + '重新批改';
  }
}


/* ---------- 渲染批改结果 ---------- */
function ringSVG(rate) {
  const r = 38, c = 2 * Math.PI * r;
  const color = rate >= 85 ? '#3E7E66' : rate >= 65 ? '#C99A3F' : '#C8553D';
  return `<div class="ring">
    <svg width="92" height="92" viewBox="0 0 92 92">
      <circle cx="46" cy="46" r="${r}" fill="none" stroke="#EDE6D7" stroke-width="8"/>
      <circle cx="46" cy="46" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - rate / 100)}" style="transition:stroke-dashoffset .8s"/>
    </svg>
    <div class="rnum"><b style="color:${color}">${rate}<span style="font-size:12px">%</span></b><small>正确率</small></div>
  </div>`;
}

function abilityBar(a) {
  const cls = a.rate >= 80 ? '' : a.rate >= 60 ? 'warn' : 'bad';
  return `<div class="typebar" style="margin-top:10px">
    <div class="tb-h"><span>${esc(a.name)}</span><span style="font-variant-numeric:tabular-nums">${a.rate}%</span></div>
    <div class="tb-track"><div class="tb-fill ${cls}" style="width:${a.rate}%"></div></div>
  </div>`;
}

function renderGrade(rec) {
  const errors = rec.errors || [];
  const errHTML = errors.length ? errors.map((e, i) => `
    <div class="err-card">
      <div class="eh"><span class="no">${esc(e.no)}</span>
        <span class="et">${esc(e.question || '本题作答有误')}</span>
        <span class="ep">${esc(e.type || '题')}</span></div>
      <div class="ec"><span class="lbl r">作答</span>${esc(e.studentAnswer || '（未作答）')}</div>
      <div class="ec"><span class="lbl">应为</span>${esc(e.correctAnswer || '—')}</div>
      <div class="ec" style="margin-top:4px"><span class="lbl">错因</span>${esc(e.reason || '—')}</div>
      ${e.fix ? `<div class="stub"><b>订正提示：</b>${esc(e.fix)}</div>` : ''}
    </div>`).join('') : `<div class="card" style="text-align:center;color:var(--jade-d);font-size:13.5px">这份作业没有检出明显错误，继续保持。</div>`;

  const practice = rec.practice && rec.practice.items.length ? `
    <div class="card" style="margin-top:4px;padding-top:12px">
      <div class="sec-hd" style="margin-bottom:8px"><h3 style="font-size:14.5px">配套加练 · ${esc(rec.practice.title)}</h3>
        <button class="more" onclick="exportPractice('${rec.id}')">导出</button></div>
      ${rec.practice.items.map((it, i) => `<div class="qitem" style="padding:10px 0 8px">
        <span class="qtag">${i + 1}</span>
        <div class="qtext" style="font-size:13.5px">${esc(it.stem).replace(/____/g, '<span class="blank"></span>')}</div>
        <div style="font-size:12px;color:var(--ink-3);margin-top:5px">答案：${esc(it.answer)}${it.tip ? '　提示：' + esc(it.tip) : ''}</div>
      </div>`).join('')}
      <button class="btn ghost btn-sm wide" style="margin-top:8px" onclick="exportPractice('${rec.id}')">导出这份加练（HTML）</button>
    </div>` : '';

  $('#reportBody').innerHTML = `<div class="fadeup">
    <div class="card">
      <div class="score-head">
        ${ringSVG(rec.total ? Math.round(rec.score / rec.total * 100) : rec.score)}
        <div class="kv">
          <div class="k"><span>卷面得分</span><b>${rec.score}<small style="color:var(--ink-3);font-size:11px"> / ${rec.total}</small></b></div>
          <div class="k"><span>答对</span><b>${rec.correct} 题</b></div>
          <div class="k"><span>题量</span><b>${rec.totalQ} 题</b></div>
          <div class="k"><span>耗时</span><b>${rec.seconds}s</b></div>
        </div>
      </div>
      ${(rec.ability || []).map(abilityBar).join('')}
      <div class="divider" style="margin:13px 0 11px"></div>
      <div style="font-size:11px;font-weight:800;color:var(--ink-3);letter-spacing:1px;margin-bottom:5px">评语</div>
      <div class="muted" style="font-size:12.5px;color:var(--ink-2);line-height:1.85">${esc(rec.summary || '')}</div>
      ${rec.nextStep ? `<div style="margin-top:9px;font-size:12.5px;color:var(--jade-d);font-weight:600">下一步：${esc(rec.nextStep)}</div>` : ''}
    </div>

    <div class="sec-hd" style="margin:18px 2px 9px"><h3>错题解析</h3><span class="muted" style="font-size:11.5px">${errors.length} 处</span></div>
    ${errHTML}
    ${practice}
    <div class="btn-row" style="margin-top:12px">
      <button class="btn ghost" onclick="openStudent('${rec.studentId}')">看学生档案</button>
      <button class="btn primary" onclick="go('grade')">批改下一份</button>
    </div>
  </div>`;
  go('report');
}

function exportPractice(recId) {
  const rec = findRec(recId);
  if (!rec || !rec.practice) { toast('这份记录没有配套练习', true); return; }
  const stu = S.students.find(s => s.id === rec.studentId);
  const name = `${stu ? stu.name : '学生'} · ${rec.practice.title}`;
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(name)}</title>
  <style>body{font-family:"Songti SC","SimSun",serif;max-width:720px;margin:40px auto;padding:0 28px;color:#2B2A28;line-height:2}
  h1{text-align:center;font-size:22px;letter-spacing:3px;margin-bottom:4px}.meta{text-align:center;color:#8C857A;font-size:13px;margin-bottom:24px}
  .q{border-top:1px dashed #D9CFBA;padding-top:12px;margin-top:16px}.q h4{margin:0 0 6px;font-size:15.5px}
  .tag{display:inline-block;font-size:11px;color:#A8402C;background:#F7E3DB;border-radius:4px;padding:1px 6px;margin-bottom:6px}
  .tip{font-size:13px;color:#5B564F;background:#F6F2E8;padding:7px 11px;border-radius:5px;margin-top:6px}
  .b{display:inline-block;width:52px;border-bottom:1px solid #B4ACA0}@media print{.tip{display:none}}</style></head>
  <body><h1>${esc(rec.practice.title)}</h1><div class="meta">${esc(stu ? stu.name : '')} · ${esc(nowStr(rec.time))} · 共 ${rec.practice.items.length} 题</div>
  ${rec.practice.items.map((it, i) => `<div class="q"><span class="tag">第 ${i + 1} 题</span><h4>${esc(it.stem).replace(/____/g, '<span class="b"></span>')}</h4>
  <div class="tip">参考答案：${esc(it.answer)}${it.tip ? '　提示：' + esc(it.tip) : ''}</div></div>`).join('')}</body></html>`;
  download(name + '.html', html, 'text/html');
  toast('已导出配套练习文件');
}

Object.assign(YW, { bindGradeForm, pickImage, toggleTextPaste, clearImage, handleImage,
  runGrade, renderGrade, exportPractice, ringSVG, fillStudentSelect });
})();
