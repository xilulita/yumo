/* ============================================================
   语墨 · 接口层
   - OpenAI 兼容 /chat/completions（支持多模态 image_url）
   - 所有生成内容均由模型返回 JSON，前端只做渲染与校验
   - 未配置密钥时不伪造任何结果
   ============================================================ */

(function(){
const PRESETS = {
  dashscope: { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-max' },
  openai:    { base: 'https://api.openai.com/v1', model: 'gpt-4o' },
  moonshot:  { base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k-vision-preview' },
  zhipu:     { base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4v-plus' },
  deepseek:  { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  custom:    { base: '', model: '' }
};

/* ---------- 提示词 ---------- */
const PROMPTS = {
  /* 阅读理解：多篇；题型由用户勾选决定，默认排除选择题 */
  makeReading(p) {
    const per = p.perPassage;
    const typeLine = p.types.includes('选择题')
      ? `可用题型：${p.types.join('、')}。每篇至少 ${Math.max(1, per - 1)} 道非选择题（填空或简答），选择题不超过 1 道。`
      : `可用题型：${p.types.join('、')}。全卷不得出现选择题，也不要出现 A/B/C/D 选项。`;
    const fillRule = p.types.includes('填空题') ? '填空题在题干用“____”表示空格，答案要短、唯一。' : '';
    const shortRule = p.types.includes('简答题') ? '简答题要给参考答案要点，答案 15–40 字，分点写清楚。' : '';
    const judgeRule = p.types.includes('判断题') ? '判断题的 answer 只写“正确”或“错误”，解析说明判断依据。' : '';
    return `你是一位资深小学语文教研员，正在为${p.grade}学生命制一份阅读理解练习。
【本卷随机编号 ${p.seed || 'A'}】本次命题的立意角度是：${p.angle || '围绕日常校园生活'}。
${p.avoid && p.avoid.length ? `以下题材与标题最近已经出过，本次必须换用完全不同的题材、人物、场景与情境，不得复用或改写：\n${p.avoid.map((x, i) => `${i + 1}. ${x}`).join(' / ')}
` : ''}一、选文
共 ${p.passages} 篇，每篇字数约 ${p.words} 字，语言符合${p.grade}学生的认知水平，不用生僻字词，不标作者与出处。
选材要避开常见课文与俗套素材（如“秋天的雨”“桂林山水”之类），优先从${p.angle || '校园与家庭生活'}里找具体的小场景、小物件、小事件，写出独特的细节。
${p.passages === 1
  ? `本卷只有 1 篇，文体为「${p.genres[0] || p.genre || '写人记事'}」。`
  : `本卷 ${p.passages} 篇，文体依次为：${p.genres.map((g, i) => `第${i + 1}篇「${g}」`).join('、')}。每篇的文体必须与这里一一对应，不能自行更换或重复。`}
二、题目
每篇 ${per} 道题，全卷共 ${p.passages * per} 道；题号从 1 开始连续编号，跨篇不重排。
${typeLine}
${fillRule}${shortRule}${judgeRule}
题型要按文本特点来用：考词句含义、内容概括、人物或景物特点、写法体会、情感体会时，优先用填空与简答；只有确实需要辨析唯一选项的知识点，才用选择或判断。
难度定位：${p.diff}。${p.unit ? '尽量呼应教材：' + p.unit + '。' : ''}${p.focus ? '要重点考查：' + p.focus + '。' : ''}
三、格式
不要输出答案区块，答案与解析只放在 questions 里。
只输出 JSON，不要 Markdown，不要解释。
JSON 结构：
{"title":"标题","passages":[{"no":1,"genre":"文体","title":"篇目标题","text":"正文，段落之间用 \n 分隔"}],
 "questions":[{"no":1,"passage":1,"type":"填空","stem":"题干，用 ____ 表示空格","options":[],"answer":"参考答案","analysis":"解析"}]}
options 仅在选择题中填写 4 个选项（A. … 形式），其他题型一律为空数组 []。`;
  },

  /* 基础训练：题型按用户勾选分配 */
  makeBasis(p) {
    const shortTypes = p.types.filter(t => /改写|仿写|造句|扩写|缩写|变换|病句|运用/.test(t));
    return `你是一位资深小学语文教研员，为${p.grade}学生命制一份基础题练习。
【本卷随机编号 ${p.seed || 'A'}】本次知识点侧重：${p.angle || '字词积累'}。
${p.avoid && p.avoid.length ? `下面这些词句/题目最近已经用过，本次请全部换新，不要重复：\n${p.avoid.map((x, i) => `${i + 1}. ${x}`).join(' / ')}
` : ''}一、题型与配比
考查题型：${p.types.join('、')}。共 ${p.count} 题，题号连续。
各题型数量尽量平均分配；题量无法整除时，优先保证前几种题型各有至少 1 题。
题型要与内容匹配：看拼音写词语、填空类用“____”表示空格；句式变换、修改病句、仿写类必须给出完整原句让学生作答，不要做成选择题。
${shortTypes.length ? '句式变换、修改病句、仿写类题目的 options 必须为空数组，不要给选项。' : ''}
二、内容
难度：${p.diff}。${p.unit ? '教材范围：' + p.unit + '。' : ''}${p.focus ? '特别注意：' + p.focus + '。' : ''}
字词从${p.grade}课标字表中选，可带拼音标注。
三、格式
答案与解析写在 questions 内，不要另设答案区块。
只输出 JSON，不要 Markdown。
JSON 结构：
{"title":"练习标题","passage":"","questions":[{"no":1,"type":"看拼音写词语","stem":"题干，用 ____ 表示空格","options":[],"answer":"答案","analysis":"解析"}]}
选择题之外一律 options: []。`;
  },

  grade(p) {
    const textPart = p.text ? `\n学生的作答原文（可能是拍照识别的结果，允许有错字）：\n"""\n${p.text}\n"""` : '';
    return `你是一位严谨、温和的小学语文老师，正在批改${p.studentName || '一位学生'}（${p.grade || '小学'}）交上来的语文练习。请通读后逐题诊断。
批改口径：
- 以题干要求为准，答案合理即可给分，不要过度苛求措辞。
- 错题要指出真正的错因（概念混淆、审题偏差、表达不完整、知识缺口等），而不是只说“答错”。
- 给每道错题写一句可以直接写在作业本上的订正提示。
- 针对错误最多的能力点，设计 3 道配套练习（不重复原题），用于第二天加练。
- 评语面向学生本人，称呼“小作者”，语气鼓励但有针对性，不说空话。
- 全文不要出现“AI”“人工智能”“系统生成”等字样。
${p.image ? '题目与学生答案都在图片里，请仔细识别图片中的题干、选项与学生手写答案。' : ''}${textPart}
只输出 JSON，不要 Markdown，不要解释。
JSON 结构：
{"score":78,"total":100,"correct":8,"totalQ":10,"student":"学生名（图片中若可见请填）","summary":"整体评语，80-140字","ability":[{"name":"字词基础","rate":90},{"name":"信息检索","rate":70},{"name":"概括能力","rate":50}],"errors":[{"no":1,"type":"题型","question":"题目简述","studentAnswer":"学生的答案","correctAnswer":"正确答案","reason":"错因分析","fix":"订正提示"}],"practice":{"title":"专项加练","items":[{"stem":"题干","answer":"答案","tip":"提示"}]},"nextStep":"下一步学习建议，一句话"}`;
  }
};

/* ---------- 请求 ---------- */
/* 原生桥：APK 内由 Android 发出请求，不受浏览器跨域限制 */
const NATIVE = (typeof window.YWNative !== 'undefined' && window.YWNative && window.YWNative.isNative)
  ? window.YWNative : null;

let __nid = 0;
const __npending = {};

window.YW = window.YW || {};
window.YW.__nativeDone = function (id, res) {
  const cb = __npending[id];
  if (!cb) return;
  delete __npending[id];
  cb.resolve(res);
};
window.YW.__nativeFail = function (id, msg) {
  const cb = __npending[id];
  if (!cb) return;
  delete __npending[id];
  cb.reject(new Error(msg || '原生请求失败'));
};

/** 原生 POST，返回 {status, body} */
function nativePost(url, headers, bodyText, timeoutSec) {
  if (!NATIVE) return Promise.reject(new Error('未运行在原生环境'));
  const id = ++__nid;
  return new Promise((resolve, reject) => {
    __npending[id] = { resolve, reject };
    try {
      NATIVE.request(url, JSON.stringify(headers), bodyText, timeoutSec, id);
    } catch (e) {
      delete __npending[id];
      reject(e);
    }
    // 兜底超时：原生层可能因线程异常未回调
    setTimeout(() => {
      if (__npending[id]) {
        delete __npending[id];
        reject(new Error('请求超时'));
      }
    }, (timeoutSec + 15) * 1000);
  });
}

/** 统一把接口响应转成可读错误 */
function httpError(status, raw) {
  let detail = raw;
  try {
    const j = JSON.parse(raw);
    detail = j.error?.message || j.message || raw;
  } catch (e) {
    detail = String(raw || '').replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^error response/i.test(detail)) detail = '服务端返回错误页（路径可能不存在）';
    if (detail.length > 180) detail = detail.slice(0, 180) + '…';
  }
  const tips = {
    401: '密钥无效或已过期，请检查 API Key 是否复制完整。',
    403: '密钥没有该模型权限，或未开通对应服务。',
    404: '路径或模型名不存在，请核对 Base URL 是否以 /v1 结尾、模型名是否拼写正确。',
    429: '触发限流或余额不足，请稍后重试或检查账户额度。',
    400: '请求被拒绝，通常是模型不支持图片输入或参数超限。',
    500: '服务端内部错误，可稍后重试或更换模型。',
    502: '网关错误，可能是 Base URL 或网络代理有问题。',
    503: '服务暂不可用，请稍后再试。'
  }[status] || '请根据返回信息排查。';
  return new Error(`接口返回 ${status}：${String(detail).slice(0, 300)}（${tips}）`);
}

async function callAI(cfg, messages, opts = {}) {
  if (!cfg.apiKey) throw new Error('尚未填写 API Key，请先在「设置」中配置接口。');
  if (!cfg.baseUrl) throw new Error('尚未填写 Base URL。');
  if (!cfg.model) throw new Error('尚未填写模型名。');

  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const timeoutSec = Math.max(10, Number(cfg.timeout) || 90);
  const body = {
    model: cfg.model,
    messages,
    temperature: Math.min(1.5, Math.max(0, Number(opts.temperature != null ? opts.temperature : cfg.temp) || 0.6)),
    max_tokens: opts.maxTokens || 4096
  };
  const bodyText = JSON.stringify(body);
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + cfg.apiKey
  };

  let status, raw;

  if (NATIVE) {
    // ---- APK 路径：原生 HTTP，无跨域限制 ----
    let res;
    try {
      res = await nativePost(url, headers, bodyText, timeoutSec);
    } catch (err) {
      const m = String(err.message || '');
      if (/timeout|超时/i.test(m)) {
        throw new Error(`等待 ${timeoutSec} 秒仍未返回。可换用更快的模型、减少篇数或题量，或在设置里调大超时时间后重试。`);
      }
      throw new Error(`无法连接接口（${m}）。请检查手机网络、Base URL 是否正确；若使用公司网络或代理，可能需要关闭代理后重试。`);
    }
    status = res.status;
    raw = res.body;
    if (status < 200 || status >= 300) throw httpError(status, raw);
  } else {
    // ---- 浏览器路径 ----
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutSec * 1000);
    let resp;
    try {
      resp = await fetch(url, { method: 'POST', headers, body: bodyText, signal: ctrl.signal });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`请求超过 ${timeoutSec} 秒未返回。可换用更快的模型、缩短题量，或在设置里调大超时时间后重试。`);
      }
      throw new Error(`无法连接接口（${err.message}）。常见原因：Base URL 写错、网络限制或跨域（CORS）拦截。若在本地直接打开文件，请用 http 服务访问，并确认服务商允许浏览器直连。`);
    }
    clearTimeout(timer);
    status = resp.status;
    raw = await resp.text();
    if (!resp.ok) throw httpError(status, raw);
  }

  let data;
  try { data = JSON.parse(raw); } catch (e) {
    throw new Error('接口返回的不是合法 JSON，可能命中了网关错误页。原文片段：' + String(raw).slice(0, 200));
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('接口返回中没有 choices[0].message.content，请确认该模型为对话模型。');
  return Array.isArray(content) ? content.map(c => c.text || '').join('') : content;
}

/* ---------- 解析模型输出 ---------- */
function parseJSONLoose(text) {
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型未返回结构化内容，请重试一次。原文片段：' + s.slice(0, 160));
  const slice = s.slice(start, end + 1);
  try { return JSON.parse(slice); }
  catch (e) {
    // 常见修复：中文引号、尾逗号
    try {
      return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'));
    } catch (e2) {
      throw new Error('模型返回的 JSON 无法解析（可能被截断）。可减少题量或换更强的模型后重试。');
    }
  }
}

/* ---------- 连接测试 ---------- */
async function testConnection(cfg) {
  const out = await callAI(cfg, [
    { role: 'user', content: '这是连通性测试。请只回复两个字：就绪' }
  ], { maxTokens: 16 });
  return String(out).trim();
}

window.YW_API = { PRESETS, PROMPTS, callAI, parseJSONLoose, testConnection, NATIVE, httpError };
})();
