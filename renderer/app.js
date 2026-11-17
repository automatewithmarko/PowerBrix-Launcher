const root=document.querySelector('#app');
const notice=document.querySelector('#notice');
const api=window.infer;
let state,page,platformOpen=false,busy=false,thinking=false,answer='',reasoning='',status='',toastTimer;
let sidebarCollapsed = localStorage.getItem('powerbrix-sidebar-collapsed') === 'true';
let waitForSidebarExit = false;
let modelMenuOpen = false;
let pendingFiles = [];
let choosingFiles = false;
let turns=[];
try { turns=JSON.parse(localStorage.getItem('powerbrix-chat')||'[]'); } catch {}
if(!Array.isArray(turns))turns=[];
const icon=(d)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>';
const icons={
  paperclip:icon('M9 13l6-6a2 2 0 0 1 3 3l-8 8a4 4 0 0 1-6-6l9-9a5 5 0 0 1 7 7l-8 8'),
  chevron:icon('M6 15l6-6 6 6'),
  close:icon('M6 6l12 12M18 6L6 18'),
  panel:icon('M4 5h16v14H4zM9 5v14'),
  chat:icon('M20 11.5a7.5 7.5 0 0 1-7.5 7.5H4l1.4-3A7.5 7.5 0 1 1 20 11.5Z'),
  models:icon('M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5'),
  discover:icon('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.7 5.3-2.2 5.2-5.2 2.2 2.2-5.2 5.2-2.2Z'),
  chip:icon('M7 6h10l1 1v10l-1 1H7l-1-1V7l1-1Zm2 3h6v6H9V9Zm0-6v3m6-3v3m-6 12v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3'),
  arrow:icon('M4 12h15m-6-6 6 6-6 6'),
  send:icon('M12 20V4m-6 6 6-6 6 6'),
  plus:icon('M12 5v14M5 12h14'),
};
const svgBrand='<img class="brand-symbol" src="powerbrix-logo.png" alt=""><span class="wordmark"><img src="powerbrix-wordmark.svg" alt="PowerBrix"><small>LAUNCHER</small></span>';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const osLabels={mac:'Mac',windows:'Windows',linux:'Linux'};
const gb=(value,precision=1)=>value?(value/2**30).toFixed(precision)+' GB':'Unavailable';
const speed=value=>value>=10?value.toFixed(0):value>=.1?value.toFixed(1):value.toFixed(2);
const bandwidth=value=>value?(value/1e9).toFixed(1)+' GB/s':'';
const button=(action,label,cls='btn secondary',attrs='')=>'<button type="button" data-action="'+action+'" class="'+cls+'" '+attrs+'>'+label+'</button>';
function tell(message) {
  notice.textContent=String(message?.message||message).replace(/^Error invoking remote method '[^']+': Error: /,'');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{notice.textContent='';},7000);
}
function modelLogo(model) {
  if (!model.logo) return '';
  return '<img class="model-logo" src="model-logos/' + esc(model.logo) + '.svg" alt="" width="24" height="24">';
}

function modelRows(rows){
  if(!rows.length)return '<div class="empty"><span class="tile">'+icons.models+'</span><h3>No models downloaded</h3><p>Find a model for this machine and make it available in AI Chat.</p>'+button('discover','Discover Models '+icons.arrow,'btn primary')+'</div>';
  return rows.map(model=>{
    const variant = model.variant ? '<span class="model-variant">' + esc(model.variant) + '</span>' : '';
    const rateClass=model.speed>=10?'rate-good':model.speed>=1?'rate-mid':'rate-low';
    const download=state.pull?.id===model.id?state.pull:null;
    const percent=download?.total?Math.floor(download.loaded/download.total*100):0;
    const action=model.local
      ? button('use:'+model.id,'Use in Chat','btn quiet compact')
      : download ? button('pause','Pause','btn quiet compact')
      : button('pull:'+model.id,model.resumed?'Resume':'Pull','btn quiet compact',!model.pullable||state.pull||busy||state.scan?'disabled':'');
    return '<article class="model-row"><span class="tile model-mark" aria-hidden="true">'+modelLogo(model)+'</span><div class="model-body"><h3>'+esc(model.name)+variant+'</h3><p>'+[model.quantization,model.bytes?gb(model.bytes):null,model.runtime==='ssd'?'SSD streaming':model.runtime==='fixture'?'Fixture':'Memory resident'].filter(Boolean).map(esc).join(' <span>·</span> ')+'</p><small>'+esc(download?'Downloading · '+percent+'% · File '+download.file+'/'+download.files:model.fit||'Installed')+'</small>'+(download?'<progress max="100" value="'+percent+'" aria-label="Download progress"></progress>':'')+'</div><div class="rate '+rateClass+'" title="'+esc(model.detail||'')+'">'+(model.speed!=null?'<strong>'+speed(model.speed)+' <span>TOK/S</span></strong><small>'+esc(model.source)+'</small>':model.local?'':'<small>Speed unavailable</small>')+'</div>'+action+'</article>';
  }).join('');
}
function machine(){
  const m=state.report?.machine;if(!m)return '';
  const items=[
    ['Processor',m.cpu,m.logical_cpus?m.logical_cpus+' threads':''],
    ['Memory',gb(m.memory_bytes),bandwidth(m.memory_read_Bps)],
    ['GPU',m.gpus?.join(', ')||'CPU mode',''],
    ['Model drive',m.models_drive?.model||'Storage',bandwidth(m.models_drive?.read_Bps)],
  ];
  return '<div class="specs">'+items.map(([key,val,detail])=>'<div><small>'+key+'</small><strong>'+esc(val)+'</strong><span>'+esc(detail)+'</span></div>').join('')+'</div>';
}
function systems(){
  return '<div class="system-line"><span><i></i>'+ (state.report?'System analyzed':'Setup')+'</span><span> / </span><span>'+esc(osLabels[state.platform])+'</span></div>';
}
function onboarding(){
  if(!state.report)return '<main class="setup welcome"><div class="brand">'+svgBrand+'</div><section>'+systems()+'<h1>Setting Up For <em>'+esc(osLabels[state.platform])+'</em></h1><p>Find out which AI models you can run on this computer, how fast they might respond, and what you can do with them.</p><div class="setup-actions">'+button('scan',state.scan?'Analyzing system…':'Analyze System '+icons.arrow,'btn primary',busy||state.scan||state.platform!==state.actual||!state.platformSupported?'disabled':'')+'<div class="platform">'+button('toggle-platform','Change device','btn secondary','aria-expanded="'+platformOpen+'"')+(platformOpen?'<div class="options">'+['mac','windows'].map(key=>button('platform:'+key,osLabels[key],'btn quiet')).join('')+'</div>':'')+'</div></div>'+ (state.scan?'<div class="scan-note" role="status"><i class="spinner"></i><span id="scan-status">'+esc(state.scan)+'</span></div>':state.platform!==state.actual?'<p class="scan-note">This computer reports '+esc(osLabels[state.actual])+'. Switch back to run the native scan.</p>':!state.platformSupported?'<p class="scan-note">Native scanning requires an Apple Silicon Mac or Windows x64 PC.</p>':'<p class="scan-note">The scan runs on this device. No model is downloaded until you choose one.</p>')+'</section><footer>'+button('home','Go to Home '+icons.arrow,'textbtn')+'</footer></main>';
  return '<main class="setup results"><div class="setup-header"><div class="brand">'+svgBrand+'</div>'+button('home','Go to Home '+icons.arrow,'textbtn')+'</div>'+systems()+'<h1>See What Your <em>Machine Can Run.</em></h1><p>Choose a model to pull. Speeds estimate text generation on this machine.</p>'+machine()+catalogPanel(state.models)+'<footer>'+button('home','Go to Home '+icons.arrow,'btn primary')+'</footer></main>';
}
function catalogPanel(rows){
  return '<section class="catalog"><header><div><h2>Models for this device</h2><p>'+gb(state.free)+' available for downloads</p></div>'+button('folder','Change storage','btn secondary compact',state.pull||busy?'disabled':'')+'</header>'+modelRows(rows)+'<footer>Estimates vary with context and hardware. SSD streaming can run models larger than RAM, provided they fit on your drive.</footer></section>';
}
const nav=[['chat','AI Chat'],['models','My Models'],['discover','Discover Models']];
const engineLabels={stopped:'Engine Stopped',loading:'Model loading',running:'Engine Running'};
function updateEngineStatus(status) {
  const indicator=document.querySelector('#engine-status');
  if (!indicator) return;
  indicator.dataset.state=status;
  indicator.title=engineLabels[status];
  indicator.querySelector('span').textContent=engineLabels[status];
}
function sidebar() {
  const toggleLabel = sidebarCollapsed ? 'Pin sidebar open' : 'Collapse sidebar';
  const statusLabel = engineLabels[state.engineStatus];
  const rows = nav.map(([key, label]) => button(
    key, icons[key] + '<span>' + label + '</span>', 'navbtn' + (page === key ? ' active' : ''),
    'aria-label="' + label + '" title="' + label + '"' + (page === key ? ' aria-current="page"' : ''),
  )).join('');
  return '<aside class="sidebar" aria-label="Launcher sidebar"><div class="brand">' + svgBrand + '</div>'
    + button('toggle-sidebar', icons.panel + '<span>' + toggleLabel + '</span>', 'navbtn sidebar-toggle',
      'aria-label="' + toggleLabel + '" title="' + toggleLabel + '"')
    + '<nav aria-label="Workspace">' + rows + '</nav>'
    + '<div class="sidebar-bottom">'
    + button('setup', icons.chip + '<span>System Setup</span>', 'navbtn',
      'aria-label="System Setup" title="System Setup"')
    + '<div class="local-label" id="engine-status" role="status" data-state="' + state.engineStatus
    + '" title="' + statusLabel + '"><i aria-hidden="true"></i> <span>' + statusLabel + '</span></div></div></aside>';
}

function updateSidebar() {
  root.classList.toggle('sidebar-collapsed', page !== 'setup' && sidebarCollapsed);
  root.classList.toggle('sidebar-await-leave', page !== 'setup' && waitForSidebarExit);
}
function chatModels() {
  return state.models.filter(model=>model.local);
}

function activeChatModel() {
  const models=chatModels();
  return models.find(model=>model.id===state.selected)||models[0];
}

function chatModelPicker(active) {
  const options=chatModels().map(model=>{
    const selected=model.id===active.id;
    return button('chat-model:'+esc(model.id),
      modelLogo(model)+'<span>'+esc(model.name)+'</span>', 'model-menu-option',
      'role="menuitemradio" tabindex="-1" aria-checked="'+selected+'"');
  }).join('');
  return '<div class="model-picker">'+button('toggle-model-menu',
    modelLogo(active)+'<span>'+esc(active.name)+'</span>'+icons.chevron,'model-pill',
    'id="chat-model" aria-label="Active model: '+esc(active.name)+'" aria-haspopup="menu" aria-controls="chat-model-options" aria-expanded="'+modelMenuOpen+'"'
      +(thinking||choosingFiles?' disabled':''))
    +'<div class="model-menu" id="chat-model-options" role="menu" aria-label="Installed models"'
    +(modelMenuOpen?'':' hidden')+'>'+options+'</div></div>';
}

function fileChips(files, removable) {
  if(!files?.length)return '';
  return '<div class="file-chips">'+files.map(file=>'<div class="file-chip" title="'+esc(file.name)+'">'
    +icons.paperclip+'<span>'+esc(file.name)+'</span>'
    +(removable?button('remove-file:'+esc(file.id),icons.close,'remove-file','aria-label="Remove '+esc(file.name)+'"'):'')
    +'</div>').join('')+'</div>';
}

function chatComposer(active) {
  if(!active)return '<div class="no-model"><p>Download a model to start chatting.</p>'+button('discover','Discover Models '+icons.arrow,'btn primary')+'</div>';
  const blocked=pendingFiles.length>0&&!active.filesSupported;
  const full=pendingFiles.length>=3;
  const attachmentLabel=!active.filesSupported?'This model does not support attachments'
    :full?'You can attach up to three files':'Attach text, PDF, or Word files';
  const disabled=!active.filesSupported||full||thinking||choosingFiles;
  const paperclip='<span class="attach-control" title="'+attachmentLabel+'">'
    +button('attach',icons.paperclip,'attach-button','aria-label="'+attachmentLabel+'"'+(disabled?' disabled':''))
    +'</span>';
  const send=thinking?button('stop','Stop','btn secondary compact')
    :'<button class="send" aria-label="Send message"'+(blocked||choosingFiles?' disabled':'')+'>'+icons.send+'</button>';
  return '<form id="composer">'+fileChips(pendingFiles,true)
    +(blocked?'<p class="file-note">Choose a model that can read files, or remove the attachments.</p>':'')
    +'<label class="sr" for="prompt">Message your local model</label>'
    +'<textarea id="prompt" maxlength="12000" rows="2" placeholder="Ask anything"></textarea>'
    +'<div class="compose-actions"><div class="compose-tools">'+paperclip+chatModelPicker(active)+'</div>'+send+'</div></form>'
    +'<p class="composer-note">Runs on this device · No hosted chat API</p>';
}

function chatArea(){
  const active=activeChatModel();
  const messages=turns.map(turn=>'<div class="message '+turn.role+'">'
    +fileChips(turn.attachments,false)+esc(turn.content)
    +(turn.shortened?'<small class="file-note">Used excerpts to fit the model’s context.</small>':'')+'</div>').join('');
  const welcome='<div class="chat-welcome"><span class="tile">'+icons.chat+'</span><h1>What Can I <em>Help With?</em></h1><p>Your models. Your machine. Your conversation.</p></div>';
  const streaming=thinking?'<div class="message assistant streaming" id="stream"><span>'+esc(status)+'</span></div>':'';
  return '<section class="workspace chat"><header class="workspace-header"><div><p class="eyebrow">Private workspace</p><h2>AI Chat</h2></div>'
    +button('new',icons.plus+' New chat','btn secondary compact',thinking?'disabled':'')
    +'</header><div id="chat-scroll" class="chat-scroll">'+(messages||streaming?'<div class="messages">'+messages+streaming+'</div>':welcome)
    +'</div><div class="composer-wrap">'+chatComposer(active)+'</div></section>';
}
function workspace(){
  if(page==='chat')return sidebar()+chatArea();
  let local=page==='models';
  return sidebar()+'<main class="workspace listing"><header class="workspace-header"><div><p class="eyebrow">Private workspace</p><h2>'+ (local?'My Models':'Discover Models')+'</h2></div>'+button('scan',state.scan?'Analyzing…':'Analyze System','btn secondary compact',state.scan||busy||state.pull||!state.platformSupported||state.platform!==state.actual?'disabled':'')+'</header><div class="listing-content"><h1>'+(local?'Your <em>Local Models.</em>':'Find Your <em>Next Model.</em>')+'</h1><p>'+(local?'Models you have downloaded on the selected drive.':'Compare storage requirements and estimated performance, then pull a model to use it locally.')+'</p>'+(state.scan?'<p class="scan-note" role="status"><i class="spinner"></i><span id="scan-status">'+esc(state.scan)+'</span></p>':'')+(local?'':machine())+catalogPanel(state.models.filter(model=>local?model.local:model.runtime!=='fixture'))+'</div></main>';
}
function render(){
  const draft=document.querySelector('#prompt')?.value;
  const focused=document.activeElement?.id==='prompt';
  const scroll=document.querySelector('#chat-scroll')?.scrollTop;
  root.className=page==='setup'?'app setup-mode':'app desk';
  updateSidebar();
  root.innerHTML=page==='setup'?onboarding():workspace();
  if(document.querySelector('#prompt')&&draft)document.querySelector('#prompt').value=draft;
  if(focused)document.querySelector('#prompt')?.focus();
  if(scroll)document.querySelector('#chat-scroll').scrollTop=scroll;
  if(thinking)showStream();
}
function showStream(){
  const node=document.querySelector('#stream');
  if(!node)return;
  node.innerHTML=(reasoning?'<details><summary>Model reasoning</summary><p>'+esc(reasoning)+'</p></details>':'')+(answer?'<div>'+esc(answer)+'</div>':'<span>'+esc(status)+'</span>');
  const area=document.querySelector('#chat-scroll'); area.scrollTop=area.scrollHeight;
}
async function perform(action,...args){
  try {const next=await api[action](...args);if(next?.models){state=next;render();}return next;}
  catch(error){tell(error);}
}
function setModelMenu(open, focusToggle = false) {
  modelMenuOpen = open;
  const toggle = document.querySelector('#chat-model');
  const menu = document.querySelector('#chat-model-options');
  if (!toggle || !menu) return;
  toggle.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
  if (open) (menu.querySelector('[aria-checked="true"]') || menu.firstElementChild)?.focus();
  else if (focusToggle) toggle.focus();
}

document.addEventListener('pointerdown',event=>{
  if (modelMenuOpen && !event.target.closest('.model-picker')) setModelMenu(false);
});
root.addEventListener('focusout',event=>{
  if(modelMenuOpen&&event.target.closest('.model-picker')&&!event.relatedTarget?.closest('.model-picker'))setModelMenu(false);
});

root.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  const [action,value]=el.dataset.action.split(':');
  if(action==='toggle-sidebar'){
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem('powerbrix-sidebar-collapsed', String(sidebarCollapsed));
    waitForSidebarExit = sidebarCollapsed && event.detail > 0 && el.closest('.sidebar').matches(':hover');
    updateSidebar();
    const label = sidebarCollapsed ? 'Pin sidebar open' : 'Collapse sidebar';
    el.querySelector('span').textContent = label;
    el.setAttribute('aria-label', label);
    el.title = label;
    return;
  }
  if(['chat','models','discover','setup'].includes(action)){modelMenuOpen=false;page=action;render();return;}
  if(action==='toggle-model-menu'){setModelMenu(!modelMenuOpen);return;}
  if(action==='chat-model'){
    setModelMenu(false);
    await perform('select',value);
    document.querySelector('#chat-model')?.focus();
    return;
  }
  if(action==='attach'){
    const active=activeChatModel();
    if(!active?.filesSupported||choosingFiles||thinking||pendingFiles.length>=3)return;
    setModelMenu(false);
    choosingFiles=true;render();
    const files=await perform('attachments',active.id,3-pendingFiles.length);
    if(files?.length)pendingFiles.push(...files);
    choosingFiles=false;render();
    document.querySelector('#prompt')?.focus();
    return;
  }
  if(action==='remove-file'){pendingFiles=pendingFiles.filter(file=>file.id!==value);render();return;}
  if(action==='toggle-platform'){platformOpen=!platformOpen;render();return;}
  if(action==='platform'){platformOpen=false;await perform('platform',value);return;}
  if(action==='home'){if(await perform('home')){page='chat';render();}return;}
  if(action==='scan'){busy=true;render();await perform('scan');busy=false;render();return;}
  if(action==='pull'){state.pull={id:value};render();const next=await perform('pull',value);state.pull=next?.pull;render();return;}
  if(action==='use'){if(await perform('select',value)){page='chat';render();}return;}
  if(action==='new'){turns=[];pendingFiles=[];modelMenuOpen=false;localStorage.setItem('powerbrix-chat','[]');render();document.querySelector('#prompt')?.focus();return;}
  if(['pause','stop','folder'].includes(action))await perform(action);
});
root.addEventListener('pointerout',event=>{
  if (!waitForSidebarExit) return;
  const sidebar = event.target.closest('.sidebar');
  if (!sidebar || sidebar.contains(event.relatedTarget)) return;
  waitForSidebarExit = false;
  updateSidebar();
});
root.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&modelMenuOpen){event.preventDefault();setModelMenu(false,true);return;}
  const direction=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0;
  if(event.target.id==='chat-model'&&direction){event.preventDefault();setModelMenu(true);return;}
  if(event.target.closest('#chat-model-options')&&(direction||event.key==='Home'||event.key==='End')){
    const options=[...document.querySelectorAll('.model-menu-option')];
    const index=options.indexOf(event.target);
    const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+direction+options.length)%options.length;
    event.preventDefault();options[next]?.focus();return;
  }
  if(event.target.closest('#chat-model-options')&&event.key==='Tab')setModelMenu(false,true);
  if(event.target.id==='prompt'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();document.querySelector('#composer')?.requestSubmit();}
});
root.addEventListener('submit',async event=>{
  if(event.target.id!=='composer')return;
  event.preventDefault();
  if(thinking||choosingFiles)return;
  const active=activeChatModel();
  if(!active||pendingFiles.length&&!active.filesSupported)return;
  const input=document.querySelector('#prompt');
  const typed=input.value.trim();
  if(!typed&&!pendingFiles.length)return;
  const attachments=pendingFiles;
  const content=typed||'Summarize the attached files.';
  input.value='';pendingFiles=[];modelMenuOpen=false;
  turns.push({role:'user',content,attachments});thinking=true;status='Starting local model…';answer='';reasoning='';render();
  const history=turns.slice(-35).map(turn=>({role:turn.role,content:turn.content,
    files:(turn.attachments||[]).map(file=>file.id)}));
  const data=await perform('chat',active.id,history);
  if(data?.answer||answer)turns.push({role:'assistant',content:data?.answer||answer,shortened:data?.shortened});
  else if(!data?.stopped){turns.pop();pendingFiles=attachments;const draft=document.querySelector('#prompt');if(draft)draft.value=typed;}
  thinking=false;localStorage.setItem('powerbrix-chat',JSON.stringify(turns.slice(-100)));render();
  const area=document.querySelector('#chat-scroll');if(area)area.scrollTop=area.scrollHeight;
  document.querySelector('#prompt')?.focus();
});
api.onEngine(status=>{
  if (!state || !Object.hasOwn(engineLabels,status)) return;
  state.engineStatus=status;
  updateEngineStatus(status);
});
api.onChat(delta=>{status=delta.status??status;answer=delta.answer??answer;reasoning=delta.reasoning??reasoning;showStream();});
api.onScan(value=>{
  if(!state)return;state.scan=value;
  const label=document.querySelector('#scan-status');
  if(label&&value)label.textContent=value;else render();
});
api.onPull(value=>{if(state){state.pull=value;render();}});
api.state().then(data=>{state=data;page=state.onboarded?'chat':'setup';render();}).catch(error=>{tell(error);root.textContent='PowerBrix Launcher could not load.';});
