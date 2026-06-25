// 渲染进程为沙箱模式，preload 内只能 require('electron')，
// 不能 require Node 内置模块（如 path），否则整个 preload 会加载失败。
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  init: () => ipcRenderer.invoke('init'),

  selectFiles: () => ipcRenderer.invoke('selectFiles'),
  probeFile: (filePath) => ipcRenderer.invoke('probeFile', filePath),
  getThumbnail: (filePath, seekSec, width) => ipcRenderer.invoke('getThumbnail', filePath, seekSec, width),
  captureFrame: (filePath, seekSec, format) => ipcRenderer.invoke('captureFrame', filePath, seekSec, format),
  // 从拖入的 File 对象取真实路径（Electron 32+ 已移除 File.path）
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openPath: (p) => ipcRenderer.invoke('openPath', p),
  showInFolder: (p) => ipcRenderer.invoke('showInFolder', p),
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),

  addTask: (filePath, options) => ipcRenderer.invoke('addTask', filePath, options),
  addTasks: (filePaths, options) => ipcRenderer.invoke('addTasks', filePaths, options),
  cancelTask: (taskId) => ipcRenderer.invoke('cancelTask', taskId),
  cancelAll: () => ipcRenderer.invoke('cancelAll'),
  retryTask: (taskId) => ipcRenderer.invoke('retryTask', taskId),
  removeTask: (taskId) => ipcRenderer.invoke('removeTask', taskId),
  clearFinished: () => ipcRenderer.invoke('clearFinished'),

  getStats: () => ipcRenderer.invoke('getStats'),
  getAllTasks: () => ipcRenderer.invoke('getAllTasks'),

  getConfig: () => ipcRenderer.invoke('getConfig'),
  saveConfig: (config) => ipcRenderer.invoke('saveConfig', config),
  selectOutputDir: () => ipcRenderer.invoke('selectOutputDir'),
  getCpuCores: () => ipcRenderer.invoke('getCpuCores'),
  appReady: () => ipcRenderer.send('appReady'),

  on: (event, callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on(event, handler);
    return () => ipcRenderer.removeListener(event, handler);
  }
});
