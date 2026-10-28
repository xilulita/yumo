/* ============================================================
   语墨 · 桌面主进程
   - 加载内置页面，无地址栏
   - 渲染进程通过 preload 调用原生能力（保存文件 / 打印 / 打开目录）
   - 单实例运行、记住窗口大小、安全策略收紧
   ============================================================ */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard, session } = require('electron');
const path = require('path');
const fs = require('fs');

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
let win = null;

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (s && s.width > 800 && s.height > 600) return s;
  } catch (e) { /* 首次运行 */ }
  return { width: 1180, height: 860, maximized: false };
}

function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      width: b.width, height: b.height,
      x: b.x, y: b.y,
      maximized: win.isMaximized()
    }));
  } catch (e) { /* 无写入权限时忽略 */ }
}

function createWindow() {
  const st = loadState();

  win = new BrowserWindow({
    width: st.width,
    height: st.height,
    x: st.x,
    y: st.y,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#E6E0D4',
    title: '语墨 · 小学语文出题与批改台',
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webSecurity: true
    }
  });

  if (st.maximized) win.maximize();

  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  win.on('resize', saveState);
  win.on('move', saveState);
  win.on('maximize', saveState);
  win.on('unmaximize', saveState);
  win.on('close', saveState);
  win.on('closed', () => { win = null; });

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // 渲染进程崩溃时给出可见提示，而不是白屏
  win.webContents.on('render-process-gone', (e, details) => {
    dialog.showMessageBox(win, {
      type: 'error',
      title: '页面异常',
      message: '界面进程意外退出：' + (details.reason || 'unknown'),
      detail: '可能是内存不足。点击确定将重新加载。',
      buttons: ['重新加载', '退出']
    }).then(r => {
      if (r.response === 0) win && win.reload();
      else app.quit();
    });
  });
}

/* ---------------- 菜单 ---------------- */
function buildMenu() {
  const isDev = !app.isPackaged;
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建试卷', accelerator: 'CmdOrCtrl+N', click: () => send('menu:make') },
        { label: '导入作业批改', accelerator: 'CmdOrCtrl+O', click: () => send('menu:grade') },
        { type: 'separator' },
        { label: '导出备份…', accelerator: 'CmdOrCtrl+S', click: () => send('menu:backup') },
        { label: '导入备份…', click: () => send('menu:restore') },
        { type: 'separator' },
        { label: '打印当前页面…', accelerator: 'CmdOrCtrl+P', click: () => doPrint() },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools', label: '开发者工具' }] : [])
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '安装与使用说明', click: () => openHelp() },
        {
          label: '关于语墨',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: '关于语墨',
            message: '语墨 · 小学语文出题与批改台',
            detail: `版本 ${app.getVersion()}\n\n本地运行版：学生数据与密钥只保存在这台电脑，不会上传到任何第三方。\n接口由你自己配置。`,
            buttons: ['好']
          })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function send(channel) {
  if (win && !win.isDestroyed()) win.webContents.send(channel);
}

function doPrint() {
  if (!win) return;
  win.webContents.print({ silent: false, printBackground: true, pageSize: 'A4' }, (ok, reason) => {
    if (!ok && reason && reason !== 'cancelled') {
      send('menu:msg', '打印失败：' + reason);
    }
  });
}

function openHelp() {
  const help = path.join(__dirname, 'app', 'help.html');
  const w = new BrowserWindow({
    width: 760,
    height: 720,
    parent: win,
    modal: false,
    autoHideMenuBar: true,
    title: '安装与使用说明',
    backgroundColor: '#F4EFE5',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  w.loadFile(help);
}

/* ---------------- 原生能力 ---------------- */
ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('file:save', async (e, { name, data, mime }) => {
  const ext = (name.match(/\.[a-z0-9]+$/i) || ['.txt'])[0];
  const r = await dialog.showSaveDialog(win, {
    title: '保存文件',
    defaultPath: name,
    filters: [
      { name: ext === '.html' ? '网页文件' : ext === '.json' ? 'JSON 备份' : '文件', extensions: [ext.replace('.', '')] },
      { name: '全部文件', extensions: ['*'] }
    ]
  });
  if (r.canceled || !r.filePath) return { ok: false, cancelled: true };
  try {
    const buf = Buffer.from(String(data), 'utf8');
    fs.writeFileSync(r.filePath, buf);
    return { ok: true, path: r.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('file:open-image', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '选择作业图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
  });
  if (r.canceled || !r.filePaths.length) return { ok: false, cancelled: true };
  try {
    const p = r.filePaths[0];
    const buf = fs.readFileSync(p);
    const ext = path.extname(p).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp'
      : ext === '.bmp' ? 'image/bmp' : 'image/jpeg';
    return {
      ok: true,
      name: path.basename(p),
      dataUrl: `data:${mime};base64,${buf.toString('base64')}`
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('file:open-json', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '选择备份文件',
    properties: ['openFile'],
    filters: [{ name: 'JSON 备份', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePaths.length) return { ok: false, cancelled: true };
  try {
    return { ok: true, name: path.basename(r.filePaths[0]), text: fs.readFileSync(r.filePaths[0], 'utf8') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('file:show', (e, p) => {
  if (p && fs.existsSync(p)) shell.showItemInFolder(p);
});

ipcMain.handle('app:print', () => { doPrint(); return true; });

ipcMain.handle('clipboard:write', (e, text) => { clipboard.writeText(String(text)); return true; });

/* ---------------- 生命周期 ---------------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    // 内容安全策略：只允许本地资源，接口请求放宽到 https/http
    try {
      session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
        cb({
          responseHeaders: Object.assign({}, details.responseHeaders, {
            'Content-Security-Policy': [
              "default-src 'self'; " +
              "img-src 'self' data: blob:; " +
              "style-src 'self' 'unsafe-inline'; " +
              "script-src 'self'; " +
              "connect-src 'self' https: http:; " +
              "font-src 'self' data:; " +
              "object-src 'none'; base-uri 'self'"
            ]
          })
        });
      });
    } catch (e) { /* 旧版本 Electron 不支持时忽略 */ }

    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
