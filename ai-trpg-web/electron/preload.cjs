const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),

  // File / Scripts
  listScripts: () => ipcRenderer.invoke('file:listScripts'),
  readScript: (filePath) => ipcRenderer.invoke('file:readScript', filePath),
  saveScript: (filePath, content) => ipcRenderer.invoke('file:saveScript', filePath, content),
  saveScriptToLibrary: (filename, content) => ipcRenderer.invoke('file:saveScriptToLibrary', filename, content),
  deleteScript: (filePath) => ipcRenderer.invoke('file:deleteScript', filePath),
  importScript: () => ipcRenderer.invoke('file:importScript'),

  // Stories
  listStories: () => ipcRenderer.invoke('file:listStories'),
  readStory: (filePath) => ipcRenderer.invoke('file:readStory', filePath),
  readStoryForRag: (filePath) => ipcRenderer.invoke('file:readStoryForRag', filePath),
  importStory: () => ipcRenderer.invoke('file:importStory'),
  deleteStory: (filePath) => ipcRenderer.invoke('file:deleteStory', filePath),

  // AI (proxied through main process - API key never touches renderer)
  aiChat: (params) => ipcRenderer.invoke('ai:chat', params),
  aiListModels: (params) => ipcRenderer.invoke('ai:listModels', params),
  // KP Agent (LangGraph workflow, used only after character confirmed)
  kpInvoke: (params) => ipcRenderer.invoke('kp:invoke', params),
  kpInvokeStream: (params) => ipcRenderer.invoke('kp:invokeStream', params),
  onKpStream: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('kp:stream', listener)
    return () => ipcRenderer.removeListener('kp:stream', listener)
  },

  // Saves
  listSaves: () => ipcRenderer.invoke('save:list'),
  readSave: (saveId) => ipcRenderer.invoke('save:read', saveId),
  writeSave: (saveId, data) => ipcRenderer.invoke('save:write', saveId, data),

  // RAG (integrated vector store — no separate service needed)
  ragHealth: () => ipcRenderer.invoke('rag:health'),
  ragIndex: (params) => ipcRenderer.invoke('rag:index', params),
  ragDelete: (scriptId) => ipcRenderer.invoke('rag:delete', scriptId),
  ragQuery: (params) => ipcRenderer.invoke('rag:query', params),
  ragContext: (params) => ipcRenderer.invoke('rag:context', params),
  ragListStories: () => ipcRenderer.invoke('rag:listStories'),
  ragStoryOverview: (params) => ipcRenderer.invoke('rag:storyOverview', params),
  ragUserGraphAdd: (params) => ipcRenderer.invoke('rag:userGraphAdd', params),
  ragUserGraphSync: (params) => ipcRenderer.invoke('rag:userGraphSync', params),
  ragUserGraphSummary: (params) => ipcRenderer.invoke('rag:userGraphSummary', params),
});
