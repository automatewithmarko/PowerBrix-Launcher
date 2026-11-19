const {contextBridge,ipcRenderer}=require('electron');
const api={};
for(const action of ['apiConfiguration','regenerateApiKey','copyText','playModel','stopModel','uninstallModel','state','platform','home','folder','scan','pull','pause','select','attachments','chat','stop','updates','dismissUpdate','installUpdate','installPlugin','transcribe','manageSkill','openWebSource']){
  api[action]=(...args)=>ipcRenderer.invoke('pbx:'+action,...args);
}
for(const topic of ['scan','pull','chat','engine','engineModel','update']){
  api['on'+topic[0].toUpperCase()+topic.slice(1)]=listener=>ipcRenderer.on('pbx:'+topic,(_,data)=>listener(data));
}
contextBridge.exposeInMainWorld('infer',api);
