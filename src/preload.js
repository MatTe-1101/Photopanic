const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('photopanic', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectSourceFolders: () => ipcRenderer.invoke('select-source-folders'),
  scanSample: (sourcePaths) => ipcRenderer.invoke('scan-sample', sourcePaths),
  startOrganize: (options) => ipcRenderer.invoke('start-organize', options),
  cancelOrganize: () => ipcRenderer.invoke('cancel-organize'),
  searchIndex: (payload) => ipcRenderer.invoke('search-index', payload),
  openCoffee: () => ipcRenderer.invoke('open-coffee'),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('organize-progress', listener);
    return () => ipcRenderer.removeListener('organize-progress', listener);
  }
});
