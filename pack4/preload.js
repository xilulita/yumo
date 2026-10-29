/* preload：只暴露白名单能力给页面，渲染进程拿不到 node */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('YWDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: () => ipcRenderer.invoke('app:version'),

  /** 保存文本文件，弹系统另存为对话框 */
  saveFile: (name, data, mime) => ipcRenderer.invoke('file:save', { name, data, mime }),

  /** 选择本地图片并返回 dataURL */
  openImage: () => ipcRenderer.invoke('file:open-image'),

  /** 选择备份 JSON */
  openJson: () => ipcRenderer.invoke('file:open-json'),

  /** 在文件管理器中定位文件 */
  showInFolder: (p) => ipcRenderer.invoke('file:show', p),

  /** 打印当前页 */
  print: () => ipcRenderer.invoke('app:print'),

  /** 复制到剪贴板 */
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),

  /** 菜单指令订阅 */
  onMenu: (cb) => {
    const map = {
      'menu:make': 'make',
      'menu:grade': 'grade',
      'menu:backup': 'backup',
      'menu:restore': 'restore',
      'menu:msg': 'msg'
    };
    Object.keys(map).forEach(ch => {
      ipcRenderer.on(ch, (e, payload) => cb(map[ch], payload));
    });
  }
});
