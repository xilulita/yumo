/* ============================================================
   移动端封装（APK / 手机浏览器）
   - 无手机外框，全屏沉浸
   - 系统返回键：先关弹层，再回首页，最后退出
   - 安卓端加安全区与键盘适配
   ============================================================ */
(function () {
  const NATIVE = window.YW_API.NATIVE;
  // 桌面版（Electron）走独立布局，不启用手机端规则
  const isDesktop = !!window.YWDesktop || document.documentElement.classList.contains('desktop');
  const isMobile = !isDesktop && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (window.matchMedia && window.matchMedia('(max-width: 860px)').matches));

  if (isMobile) document.documentElement.classList.add('mobile');
  if (isDesktop) { window.YW = window.YW || {}; window.YW.onBack = window.YW.onBack || (() => false); }

  window.YW = window.YW || {};

  let currentPage = 'home';

  /** 供原生返回键调用：消费掉则返回 true */
  window.YW.onBack = function () {
    const modal = document.getElementById('modal');
    if (modal && modal.classList.contains('on')) {
      window.closeModal && window.closeModal();
      return true;
    }
    if (currentPage !== 'home' && currentPage !== 'make') {
      window.go('home');
      return true;
    }
    if (currentPage === 'make') {
      const out = document.getElementById('genOut');
      if (out && out.innerHTML.trim()) {
        out.innerHTML = '';
        return true;
      }
      window.go('home');
      return true;
    }
    return false; // 交给原生退出
  };

  // 记录当前页，供返回键判断
  // 注意：window.go 本身由 students.js 桥接到 YW.go，这里必须包在 YW.go 上，
  // 否则 window.go 会指向自己造成无限递归。
  if (window.YW && typeof window.YW.go === 'function') {
    const inner = window.YW.go;
    const wrapped = function (page) {
      currentPage = page;
      return inner.apply(window.YW, arguments);
    };
    window.YW.go = wrapped;
    window.go = wrapped;
    // 同步覆盖 students.js 内部引用，保证其自身调用的 go 也走包装层
    if (window.YW.boundGo) window.YW.boundGo = wrapped;
  }

  /* 键盘弹出时避免底栏顶住输入框 */
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const adjust = () => {
      const hide = vv.height < window.innerHeight - 120;
      document.documentElement.classList.toggle('kb-open', hide);
    };
    vv.addEventListener('resize', adjust);
    vv.addEventListener('scroll', adjust);
  }

  /* 阻止双击缩放与长按选中（输入框除外） */
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch <= 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });


  /* 首屏收口：让「最近批改」要么露出过半数，要么完整落到下一屏 */
  function tidyHome() {
    if (isDesktop) return;
    if (!document.querySelector('#page-home.on')) return;
    const sec = document.querySelector('#homeRecentSec');
    const body = document.querySelector('.body');
    if (!sec || !body) return;
    sec.style.marginTop = '';
    const bottom = body.getBoundingClientRect().bottom;
    const r = sec.getBoundingClientRect();
    const visible = bottom - r.top;
    // 露出不足「标题行 + 一整条记录」时，整块推到下一屏，避免半截文字
    const need = 168;
    if (visible > 0 && visible < need) {
      sec.style.marginTop = Math.ceil(visible + 14) + 'px';
    }
  }
  window.YW.tidyHome = tidyHome;

  // 用 MutationObserver 监听首页内容变化（不依赖 renderHome 的引用链）
  const startWatch = () => {
    const home = document.querySelector('#page-home');
    const recent = document.querySelector('#homeRecent');
    if (recent) {
      new MutationObserver(() => requestAnimationFrame(tidyHome)).observe(recent, { childList: true, subtree: true });
    }
    if (home) {
      new MutationObserver(() => {
        if (home.classList.contains('on')) requestAnimationFrame(tidyHome);
      }).observe(home, { attributes: true, attributeFilter: ['class'] });
    }
    requestAnimationFrame(tidyHome);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(startWatch, 30));
  } else {
    setTimeout(startWatch, 30);
  }
  window.addEventListener('load', () => { setTimeout(tidyHome, 120); setTimeout(tidyHome, 400); });
  window.addEventListener('resize', () => setTimeout(tidyHome, 120));
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-tab="home"], .tab')) setTimeout(tidyHome, 80);
  }, true);

  /* 首次启动提示 */
  if (NATIVE) {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        const seen = localStorage.getItem('yw.welcomed');
        if (!seen) {
          localStorage.setItem('yw.welcomed', '1');
        }
      }, 600);
    });
  }
})();
