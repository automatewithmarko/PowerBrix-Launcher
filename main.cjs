const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron');
const {existsSync}=require('node:fs');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {extensions,maxAttachments,supportsFiles,readAttachment}=require('./attachments.cjs');
const catalog=require('./catalog.json');
const {startUpdatePolling,prepareUpdate,launchInstaller}=require('./updater.cjs');
const {fileSize,downloadFile}=require('./downloads.cjs');
const {freeSpace,pickModels}=require('./device.cjs');
const {ensureEngine,profileMachine,LocalEngine}=require('./engine.cjs');
const {findWhisper,transcribe}=require('./dictation.cjs');
const {searchWeb,safeUrl}=require('./web-search.cjs');

const demo = !app.isPackaged && process.env.POWERBRIX_DEMO === '1';
app.setName(demo ? 'PowerBrix Launcher Demo' : 'PowerBrix Launcher');
if (process.env.POWERBRIX_DATA_DIR && !app.isPackaged) {
  app.setPath('userData',process.env.POWERBRIX_DATA_DIR);
} else if (!demo && !app.commandLine.hasSwitch('user-data-dir')) {
  // Keep access to downloads, settings and chats from the preview build.
  const legacyDirectory=path.join(app.getPath('appData'),'PowerBrix Infer');
  if (!existsSync(app.getPath('userData')) && existsSync(legacyDirectory)) {
    app.setPath('userData',legacyDirectory);
  }
}
if(!app.requestSingleInstanceLock())app.exit(0);
app.on('second-instance',()=>{if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.focus();}});
const root=app.getPath('userData');
const settingsPath=path.join(root,'settings.json');
const actual=process.platform==='darwin'?'mac':process.platform==='win32'?'windows':'linux';
const platformSupported=process.platform==='darwin'&&process.arch==='arm64'||process.platform==='win32'&&process.arch==='x64';
const fixture=!app.isPackaged&&process.env.POWERBRIX_FIXTURE_MODEL;
const fixtureModel={id:'dev-fixture',name:'Development fixture',runtime:'fixture',local:true};
let window,settings,scan,pull,chat,writes=Promise.resolve(),enginePromise;
let dictation;
const notify=(topic,data)=>{if(window&&!window.isDestroyed())window.webContents.send('pbx:'+topic,data);};
const attachments=new Map();
let choosingFiles=false;
let availableUpdate=null, updateProgress=null, updateFailure=null;
const updateAbort=new AbortController();
function updateView() {
  return {
    version:app.getVersion(),
    welcome:settings.acknowledgedVersion!==app.getVersion(),
    available:availableUpdate ? {version:availableUpdate.version,name:availableUpdate.name} : null,
    progress:updateProgress,
    error:updateFailure,
  };
}
function sendUpdate() { notify('update',updateView()); }
const runtime=new LocalEngine(status=>notify('engine',status));
const pluginIds = ['chat-history', 'microphone-typing', 'skills', 'internet-search'];
const skillList = () => settings.skills.map(({id,name,enabled}) => ({id,name,enabled}));
const checkpoint=(model,file)=>path.join(settings.directory,model.id,file.path);
const installed=async model=>Boolean(settings.installed[model.id]?.[settings.directory]&&
  (await Promise.all(model.files.map(async file=>await fileSize(checkpoint(model,file))===file.bytes))).every(Boolean));
function save() {
  const data=JSON.stringify(settings,null,2);
  writes=writes.catch(()=>{}).then(async()=>{
    await fs.writeFile(settingsPath+'.tmp',data,{mode:0o600});
    await fs.rename(settingsPath+'.tmp',settingsPath);
  });
  return writes;
}
function engine(onProgress=()=>{}) {
  if(!enginePromise)enginePromise=ensureEngine(root,onProgress).catch(error=>{enginePromise=null;throw error;});
  return enginePromise;
}
async function snapshot() {
  const [free,local,resume]=await Promise.all([
    freeSpace(settings.directory).catch(()=>0),
    Promise.all(catalog.map(async model=>await installed(model)?model.id:null)),
    Promise.all(catalog.map(async model=>[model.id,(await Promise.all(model.files.map(async file=>{
      const target=checkpoint(model,file);
      const finalized=await fileSize(target);
      return finalized===file.bytes?finalized:Math.min(file.bytes,await fileSize(target+'.part'));
    }))).reduce((a,b)=>a+b,0)]))
  ]);
  const {installed:_,skills:__,...view}=settings;
  const models=pickModels(catalog,settings.report,free,new Set(local),new Map(resume))
    .map(model=>({...model,filesSupported:supportsFiles(model)}));
  if(fixture)models.push(fixtureModel);
  return {...view,skills:skillList(),actual,platformSupported,free,models,scan:scan?.status,pull:pull?.progress,engineStatus:runtime.status};
}
function action(name,handler) {
  ipcMain.handle('pbx:'+name,(event,...args)=>{
    if(event.sender!==window?.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('Untrusted window.');
    if(quitting)throw Error('PowerBrix Launcher is closing.');
    return handler(...args);
  });
}
function cleanMessages(messages) {
  if(!Array.isArray(messages)||!messages.length||messages.length>40||messages.at(-1)?.role!=='user')throw Error('Start by entering a message.');
  return messages.map(({role,content,files=[]})=>{
    if(!['user','assistant'].includes(role)||typeof content!=='string'||!content.trim()||content.length>24000)throw Error('Invalid message.');
    if(!Array.isArray(files)||files.length>maxAttachments||files.some(id=>typeof id!=='string'||id.length>36))throw Error('Invalid file attachments.');
    return {role,content,files:role==='user'?files:[]};
  });
}
app.whenReady().then(async()=>{
  if (demo) app.dock?.setIcon(path.join(__dirname,'assets','icon.png'));
  await fs.mkdir(root,{recursive:true,mode:0o700});
  settings={platform:actual,onboarded:false,directory:path.join(root,'models'),report:null,installed:{},selected:null,plugins:[],skills:[]};
  try {Object.assign(settings,JSON.parse(await fs.readFile(settingsPath,'utf8')));} catch(error) {if(error.code!=='ENOENT')throw error;}
  settings.plugins = Array.isArray(settings.plugins) ? [...new Set(settings.plugins.filter(id=>typeof id==='string'))] : [];
  if (!Array.isArray(settings.skills)) settings.skills = [];
  await fs.mkdir(settings.directory,{recursive:true,mode:0o700});
  action('state',snapshot);
  action('openWebSource',async url=>{
    const link = typeof url === 'string' && /^https?:\/\//i.test(url) && safeUrl(url);
    if (!link) throw Error('Invalid web source.');
    await shell.openExternal(link);
  });
  action('installPlugin',async id=>{
    if (!pluginIds.includes(id)) throw Error('This plugin is unavailable.');
    if (id === 'microphone-typing') await findWhisper();
    if (!settings.plugins.includes(id)) {
      settings.plugins.push(id);
      await save();
    }
    return {plugins:[...settings.plugins]};
  });
  action('manageSkill',async (operation,input)=>{
    if (!settings.plugins.includes('skills')) throw Error('Install Skills first.');
    if (operation === 'create') {
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      const content = typeof input?.content === 'string' ? input.content.trim() : '';
      if (!name || name.length > 80) throw Error('Enter a skill name of up to 80 characters.');
      if (!content || content.length > 16000 || content.includes('\0')) throw Error('Enter up to 16,000 characters of skill text.');
      settings.skills.push({id:randomUUID(),name,content,enabled:false});
    } else {
      const skill = settings.skills.find(item => item.id === input?.id);
      if (!skill) throw Error('This skill no longer exists.');
      if (operation === 'toggle' && typeof input.enabled === 'boolean') skill.enabled = input.enabled;
      else if (operation === 'delete') settings.skills = settings.skills.filter(item => item !== skill);
      else throw Error('Invalid skill action.');
    }
    await save();
    return {skills:skillList()};
  });
  action('transcribe',async audio=>{
    if (!settings.plugins.includes('microphone-typing')) throw Error('Install Microphone Typing first.');
    if (dictation) throw Error('Wait for the current transcription to finish.');
    dictation = new AbortController();
    try {
      const signal = AbortSignal.any([dictation.signal, AbortSignal.timeout(180000)]);
      return await transcribe(root, audio, signal);
    } finally { dictation = null; }
  });
  updateFailure=(await fs.readFile(path.join(root,'update-error.txt'),'utf8').catch(()=>null))?.trim() || null;
  if(updateFailure)await fs.rm(path.join(root,'update-error.txt'),{force:true});
  action('updates',updateView);
  action('dismissUpdate',async()=>{
    settings.acknowledgedVersion=app.getVersion();
    updateFailure=null;
    await save();
    sendUpdate();
  });
  action('installUpdate',async()=>{
    if(!availableUpdate||updateProgress||!app.isPackaged)return;
    if(scan||pull||chat||dictation||choosingFiles)throw Error('Finish the current download, scan, or reply before updating.');
    updateFailure=null;
    const progress=details=>{
      if(updateProgress?.phase===details.phase && updateProgress.percent===details.percent)return;
      updateProgress=details;
      sendUpdate();
    };
    progress({phase:'downloading',percent:0});
    try {
      const signal=AbortSignal.any([updateAbort.signal,AbortSignal.timeout(1200000)]);
      const prepared=await prepareUpdate(availableUpdate,root,app.getPath('exe'),progress,signal);
      await writes;
      signal.throwIfAborted();
      await launchInstaller(prepared);
      app.quit();
    } catch(error) {
      updateProgress=null;
      updateFailure=error.message;
      sendUpdate();
    }
  });
  action('platform',async value=>{
    if(!['mac','windows'].includes(value)||scan)throw Error('Choose macOS or Windows before scanning.');
    settings.platform=value;await save();return snapshot();
  });
  action('home',async()=>{
    if (scan || !settings.report?.machine) throw Error('Finish Analyze System before going to Home.');
    settings.onboarded=true;await save();return snapshot();
  });
  action('folder',async()=>{
    if(scan||pull||chat)throw Error('Wait for the current task to finish first.');
    const selection=await dialog.showOpenDialog(window,{title:'Choose a folder for PowerBrix models',defaultPath:settings.directory,properties:['openDirectory','createDirectory']});
    if(!selection.canceled&&selection.filePaths[0]!==settings.directory){
      await runtime.stop();
      settings.directory=selection.filePaths[0];
      settings.report=null;
      await fs.rm(path.join(root,'machine.json'),{force:true});
      await save();
    }
    return snapshot();
  });
  action('scan',async()=>{
    if(scan||pull||chat)throw Error('Wait for the current task to finish first.');
    if(!platformSupported)throw Error('PowerBrix Launcher supports Apple Silicon Macs and Windows x64.');
    if(settings.platform!==actual)throw Error('Switch back to the detected operating system to run the native scan.');
    const progress=(status)=>{if(scan){scan.status=status;notify('scan',status);}};
    scan={status:'Preparing the system scan…',stop:new AbortController()};
    progress(scan.status);
    try {
      await runtime.stop();
      const runner=await engine(progress).catch(error=>{
        throw Error('The system analysis tool couldn’t be prepared. Check your internet connection and try again.',{cause:error});
      });
      settings.report=await profileMachine(runner,root,settings.directory,progress,true,scan.stop.signal);
      await save();
    } finally {scan=null;notify('scan',null);}
    return snapshot();
  });
  action('pull',async id=>{
    if(pull||scan)throw Error('Wait for the current download or scan to finish first.');
    const model=catalog.find(item=>item.id===id);
    if(!model)throw Error('Unknown model.');
    const job={id,stop:new AbortController(),progress:{id,loaded:0,total:0,file:1,files:model.files.length}};
    pull=job;
    try{
      const row=(await snapshot()).models.find(item=>item.id===id);
      if(!row.pullable)throw Error(row.fit+'.');
      const total=row.bytes;
      let offset=0,last=0;
      for(const [index,file] of model.files.entries()){
        job.stop.signal.throwIfAborted();
        const url='https://huggingface.co/'+model.repo+'/resolve/'+model.revision+'/'+file.path.split('/').map(encodeURIComponent).join('/');
        await downloadFile(url,checkpoint(model,file),file,job.stop.signal,bytes=>{
          job.progress={id,loaded:offset+bytes,total,file:index+1,files:model.files.length};
          if(Date.now()-last>180){last=Date.now();notify('pull',job.progress);}
        });
        offset+=file.bytes;
      }
      (settings.installed[id]??={})[settings.directory]=true;
      settings.selected??=id;
      await save();
    } catch(error){if(!job.stop.signal.aborted)throw error;}
    finally{pull=null;notify('pull',null);}
    return snapshot();
  });
  action('pause',()=>{pull?.stop.abort();});
  action('select',async id=>{
    const model=catalog.find(item=>item.id===id);
    if(!((fixture&&id===fixtureModel.id)||(model&&await installed(model))))throw Error('Pull the model before selecting it.');
    settings.selected=id;await save();return snapshot();
  });
  action('attachments',async(id,slots)=>{
    const model=catalog.find(item=>item.id===id);
    if(!supportsFiles(model)||!(await installed(model)))throw Error('This model cannot read attachments.');
    if(!Number.isInteger(slots)||slots<1||slots>maxAttachments)throw Error('Attach up to three files.');
    if(choosingFiles||chat||quitting)return [];
    choosingFiles=true;
    try {
      const result=await dialog.showOpenDialog(window,{
        title:'Attach files',
        properties:slots===1?['openFile']:['openFile','multiSelections'],
        filters:[{name:'Readable files',extensions}],
      });
      if(result.canceled)return [];
      if(result.filePaths.length>slots)throw Error('Choose at most '+slots+' more file'+(slots===1?'':'s')+'.');
      const documents=[];
      for(const filename of result.filePaths)documents.push(await readAttachment(filename));
      return documents.map(document=>{
        const attachmentId=randomUUID();
        attachments.set(attachmentId,document);
        if(attachments.size>48)attachments.delete(attachments.keys().next().value);
        return {id:attachmentId,name:document.name};
      });
    } finally {
      choosingFiles=false;
    }
  });
  action('chat',async(id,messages,useWebSearch=false)=>{
    if(chat||scan)throw Error('Wait for the current scan or reply to finish first.');
    const model=fixture&&id===fixtureModel.id?fixtureModel:catalog.find(item=>item.id===id);
    if(!model||model!==fixtureModel&&!(await installed(model)))throw Error('Pull a model before starting a chat.');
    const history=cleanMessages(messages);
    if (useWebSearch && !settings.plugins.includes('internet-search')) throw Error('Install Internet Search first.');
    const newestFiles=history.at(-1).files;
    if(newestFiles.length&&!supportsFiles(model))throw Error('This model cannot read attachments.');
    if(newestFiles.some(id=>!attachments.has(id)))throw Error('An attachment has expired. Attach the file again.');
    const documents=supportsFiles(model)
      ? [...new Set(history.flatMap(message=>message.files))].map(id=>attachments.get(id)).filter(Boolean).slice(-maxAttachments)
      : [];
    const prompt=history.map(({role,content})=>({role,content}));
    const enabledSkills = settings.plugins.includes('skills') ? settings.skills.filter(skill => skill.enabled) : [];
    if(quitting)throw Error('PowerBrix Launcher is closing.');
    if(chat||scan)throw Error('A scan or reply is already running.');
    const controller=new AbortController();
    chat=controller;
    const progress=status=>notify('chat', {status});
    try {
      let sources = [];
      if (useWebSearch) {
        progress('Searching the web…');
        sources = await searchWeb(prompt.at(-1).content,controller.signal);
      }
      await runtime.start(model,model===fixtureModel?fixture:checkpoint(model,model.files[0]),engine,root,progress,controller.signal);
      const prepared=model!==fixtureModel || documents.length || enabledSkills.length || sources.length
        ? await runtime.prepareChatContext(prompt,documents,enabledSkills,controller.signal,sources)
        : {messages:prompt};
      progress('Generating on this device…');
      return {...await runtime.chat(prepared.messages,controller.signal,delta=>notify('chat',delta)),
        shortened:prepared.shortened,sources:prepared.sources};
    } catch(error) {
      if(controller.signal.aborted)return {stopped:true};
      throw error;
    } finally{chat=null;}
  });
  action('stop',()=>{chat?.abort();});
  window=new BrowserWindow({width:1270,height:880,minWidth:600,minHeight:480,backgroundColor:'#14101f',autoHideMenuBar:true,
    icon:path.join(__dirname,'assets','icon.png'),
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.session.setPermissionCheckHandler((contents, permission, _origin, details) =>
    contents === window.webContents && permission === 'media' && details.isMainFrame &&
    details.mediaType === 'audio' && settings.plugins.includes('microphone-typing'));
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => callback(
    contents === window.webContents && permission === 'media' && details.isMainFrame &&
    details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio' &&
    settings.plugins.includes('microphone-typing')));
  window.loadFile(path.join(__dirname,'renderer','index.html'), demo ? {query:{demo:'1'}} : undefined);
  if(app.isPackaged) {
    startUpdatePolling(app.getVersion(),update=>{
      if (updateProgress) return false;
      availableUpdate=update;
      sendUpdate();
    },{signal:updateAbort.signal});
  }
}).catch(error=>{dialog.showErrorBox('PowerBrix Launcher could not start',error.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
let quitting=false, shutdownComplete=false;
app.on('before-quit',event=>{
  if(shutdownComplete)return;
  event.preventDefault();
  if(quitting)return;
  quitting=true;
  updateAbort.abort();pull?.stop.abort();scan?.stop.abort();chat?.abort();dictation?.abort();
  Promise.allSettled([runtime.stop(),writes]).finally(()=>{
    shutdownComplete=true;
    app.quit();
  });
});
