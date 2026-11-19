const root=document.querySelector('#app');
const notice=document.querySelector('#notice');
const api=window.infer;
const demo = new URLSearchParams(location.search).get('demo') === '1';
if (demo) document.title = 'PowerBrix Launcher Demo';
let state,page,platformOpen=false,busy=false,thinking=false,answer='',reasoning='',status='',toastTimer;
let pluginQuery = '';
let renderedPage;
let streamReasoningOpen = false;
let engineMenuOpen = false;
let modelActionBusy = false;
let liveMetrics = null;
let regeneratingIndex = null;
let editingIndex = null,editingDraft = '';
let apiInfo=null,apiModelId=null,apiModelOpen=false,apiLoading=false,apiRequestFormat='curl';
let modelMenuOpen = false;
let skillsMenuOpen = false;
let commandIndex = 0;
const webCommand = /(^|\s)\/web-search(?=\s|$)/i;
let pendingFiles = [];
let choosingFiles = false;
let capture, voicePhase = '', waveRequest;
let volume = 0;
let currentChat = null;
let conversations = [];
const drafts = new Map();
const draftKey = () => currentChat ?? 'draft';
let turns=[];
try { turns=JSON.parse(localStorage.getItem('powerbrix-chat')||'[]'); } catch {}
if(!Array.isArray(turns))turns=[];
turns=turns.map(normalizeReasoning);
const icon=(d)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>';
const icons={
  paperclip:icon('M9 13l6-6a2 2 0 0 1 3 3l-8 8a4 4 0 0 1-6-6l9-9a5 5 0 0 1 7 7l-8 8'),
  chevron:icon('M6 15l6-6 6 6'),
  close:icon('M6 6l12 12M18 6L6 18'),
  chat:icon('M20 11.5a7.5 7.5 0 0 1-7.5 7.5H4l1.4-3A7.5 7.5 0 1 1 20 11.5Z'),
  plugins:icon('M4 8h4V6a2 2 0 0 1 4 0v2h4v4h2a2 2 0 0 1 0 4h-2v4h-4v-2a2 2 0 0 0-4 0v2H4v-4h2a2 2 0 0 0 0-4H4Z'),
  history:icon('M3 12a9 9 0 1 0 3-6.7L3 8m0-4v4h4m5-1v5l3 2'),
  mic:icon('M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 7a6 6 0 0 0 12 0m-6 6v4m-3 0h6'),
  skills:icon('M5 3h13a1 1 0 0 1 1 1v17H6a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1Zm-1 16a2 2 0 0 1 2-2h13M8 8l2 2 4-4m-6 7h7'),
  search:icon('M16 16l4 4m-2-9a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z'),
  globe:icon('M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18m-9-9c2 2.5 3 5.5 3 9s-1 6.5-3 9c-2-2.5-3-5.5-3-9s1-6.5 3-9Z'),
  edit:icon('M13 6l5 5M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z'),
  trash:icon('M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13m-8 4v5m4-5v5'),
  stop:icon('M7 7h10v10H7z'),
  models:icon('M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5'),
  discover:icon('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.7 5.3-2.2 5.2-5.2 2.2 2.2-5.2 5.2-2.2Z'),
  chip:icon('M7 6h10l1 1v10l-1 1H7l-1-1V7l1-1Zm2 3h6v6H9V9Zm0-6v3m6-3v3m-6 12v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3'),
  arrow:icon('M4 12h15m-6-6 6 6-6 6'),
  send:icon('M12 20V4m-6 6 6-6 6 6'),
  plus:icon('M12 5v14M5 12h14'),
  play:icon('M8 5v14l11-7-11-7Z'),
  copy:icon('M9 8h11v13H9V8ZM5 16H3V3h11v2'),
  api:icon('M8 5 2 12l6 7m8-14 6 7-6 7M14 3l-4 18'),
  restart:icon('M20 7v5h-5m5-5a8 8 0 1 0 1 8'),
  check:icon('M5 12l4 4L19 6'),
};
const svgBrand='<img class="brand-symbol" src="powerbrix-logo.png" alt=""><span class="wordmark"><img src="powerbrix-wordmark.svg" alt="PowerBrix"><small>LAUNCHER</small></span>';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const osLabels={mac:'Mac',windows:'Windows',linux:'Linux'};
const gb=(value,precision=1)=>value?(value/2**30).toFixed(precision)+' GB':'Unavailable';
const speed=value=>value>=10?value.toFixed(0):value>=.1?value.toFixed(1):value.toFixed(2);
const bandwidth=value=>value?(value/1e9).toFixed(1)+' GB/s':'';
const button=(action,label,cls='btn secondary',attrs='')=>'<button type="button" data-action="'+action+'" class="'+cls+'" '+attrs+'>'+label+'</button>';
const hasPlugin = id => state.plugins?.includes(id);
const historyOn = () => hasPlugin('chat-history');
const chatBusy = () => thinking || choosingFiles || Boolean(voicePhase);
const isClearCommand = text => /^\/clear$/i.test(text.trim());

function clearCurrentChat() {
  if (chatBusy()) return;
  drafts.delete(draftKey());
  pendingFiles = [];
  turns = [];editingIndex=null;editingDraft='';
  modelMenuOpen = false;
  skillsMenuOpen = false;
  localStorage.setItem('powerbrix-chat','[]');
  const active = conversations.find(chat => chat.id === currentChat);
  if (historyOn() && active) {
    active.turns = [];
    storeHistory();
  }
  render();
  document.querySelector('#prompt')?.focus();
  tell('Chat cleared.');
}

function readHistory() {
  try { conversations = JSON.parse(localStorage.getItem('powerbrix-conversations') || '[]'); } catch { conversations = []; }
  if (!Array.isArray(conversations)) conversations = [];
  if (!conversations.length && turns.length) {
    saveConversation();
    return;
  }
  const active = conversations.find(chat => chat.id === localStorage.getItem('powerbrix-active-chat'));
  currentChat = active?.id ?? null;
  turns = (active?.turns ?? []).map(normalizeReasoning);
}

function storeHistory() {
  localStorage.setItem('powerbrix-conversations',JSON.stringify(conversations));
  localStorage.setItem('powerbrix-active-chat',currentChat ?? '');
}

function saveConversation() {
  turns=turns.map(normalizeReasoning);
  localStorage.setItem('powerbrix-chat',JSON.stringify(turns.slice(-100)));
  if (!historyOn() || !turns.length) return;
  const old = conversations.find(chat => chat.id === currentChat);
  currentChat ??= crypto.randomUUID();
  const firstPrompt = turns.find(turn => turn.role === 'user')?.content.trim().replace(/\s+/g,' ');
  const title = old?.title ?? (firstPrompt?.length > 55 ? firstPrompt.slice(0,55) + '…' : firstPrompt || 'Untitled chat');
  conversations = [{id:currentChat,title,turns:turns.slice(-100)}, ...conversations.filter(chat => chat.id !== currentChat)];
  if (drafts.has('draft')) {
    drafts.set(currentChat,drafts.get('draft'));
    drafts.delete('draft');
  }
  storeHistory();
}

function openConversation(id) {
  if (chatBusy()) return;
  const chat = conversations.find(item => item.id === id);
  if (id && !chat) return;
  currentChat = chat?.id ?? null;
  turns = (chat?.turns ?? []).map(normalizeReasoning);editingIndex=null;editingDraft='';
  if (!chat) drafts.delete('draft');
  pendingFiles = [];
  modelMenuOpen = false;
  localStorage.setItem('powerbrix-chat',JSON.stringify(turns));
  if (historyOn()) storeHistory();
  render();
  document.querySelector('#prompt')?.focus();
}
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
      ? '<div class="model-actions">'+button('use:'+model.id,'Use in Chat','btn quiet compact')+(page==='models'?button('uninstall:'+model.id,icons.trash+'<span>Uninstall</span>','btn quiet compact uninstall-model',thinking||modelActionBusy||state.scan||state.pull?'disabled':''):'')+'</div>'
      : download ? button('pause','Pause','btn quiet compact')
      : button('pull:'+model.id,model.resumed?'Resume':'Pull','btn quiet compact',!model.pullable||state.pull||busy||state.scan?'disabled':'');
    return '<article class="model-row" data-model-id="'+esc(model.id)+'"><span class="tile model-mark" aria-hidden="true">'+modelLogo(model)+'</span><div class="model-body"><h3>'+esc(model.name)+variant+'</h3><p>'+[model.quantization,model.bytes?gb(model.bytes):null,model.runtime==='ssd'?'SSD streaming':model.runtime==='mapped'?'CPU / SSD mapping':model.runtime==='fixture'?'Fixture':'Memory resident'].filter(Boolean).map(esc).join(' <span>·</span> ')+'</p><small data-download-status>'+esc(download?'Downloading · '+percent+'% · File '+download.file+'/'+download.files:model.fit||'Installed')+'</small>'+(download?'<progress max="100" value="'+percent+'" aria-label="Download progress"></progress>':'')+'</div><div class="rate '+rateClass+'" title="'+esc(model.detail||'')+'">'+(model.speed!=null?'<strong>'+speed(model.speed)+' <span>TOK/S</span></strong><small>'+esc(model.source)+'</small>':model.local?'':'<small>Speed unavailable</small>')+'</div>'+action+'</article>';
  }).join('');
}
function machine(){
  const m=state.report?.machine;if(!m)return '';
  const items=[
    ['Processor',m.cpu,m.logical_cpus?m.logical_cpus+' threads':''],
    ['Memory',gb(m.memory_bytes),bandwidth(m.memory_read_Bps)],
    ['GPU',m.gpus?.join(', ')||(state.report.gpuMeasurementUnavailable?'Unavailable':'CPU mode'),state.report.gpuMeasurementUnavailable?'Measurement unavailable':''],
    ['Model drive',m.models_drive?.model||'Storage',bandwidth(m.models_drive?.read_Bps)],
  ];
  return '<div class="specs">'+items.map(([key,val,detail])=>'<div><small>'+key+'</small><strong>'+esc(val)+'</strong><span>'+esc(detail)+'</span></div>').join('')+'</div>';
}
function systems(){
  return '<div class="system-line"><span><i></i>'+ (state.scan?'Analyzing system':state.report?.machine?'System analyzed':'Setup')+'</span><span> / </span><span>'+esc(osLabels[state.platform])+'</span></div>';
}
function analysisNotice() {
  const warnings = state.report?.analysisWarnings || [];
  if (!warnings.length || state.scan) return '';
  return '<div class="analysis-notice" role="status"><strong>Analysis finished with a warning</strong>'
    +warnings.map(message=>'<p>'+esc(message)+'</p>').join('')
    +button('scan','Retry analysis','textbtn',busy||state.pull?'disabled':'')+'</div>';
}
function onboarding(){
  const homeReady = !state.scan && !busy;
  if(!state.report?.machine)return '<main class="setup welcome"><div class="brand">'+svgBrand+'</div><section>'+systems()+'<h1>Setting Up For <em>'+esc(osLabels[state.platform])+'</em></h1><p>Find out which AI models you can run on this computer, how fast they might respond, and what you can do with them.</p><div class="setup-actions">'+button('scan',state.scan?'Analyzing system…':'Analyze System '+icons.arrow,'btn primary',busy||state.scan||state.platform!==state.actual||!state.platformSupported?'disabled':'')+'<div class="platform">'+button('toggle-platform','Change device','btn secondary','aria-expanded="'+platformOpen+'"')+(platformOpen?'<div class="options">'+['mac','windows'].map(key=>button('platform:'+key,osLabels[key],'btn quiet')).join('')+'</div>':'')+'</div></div>'+ (state.scan?'<div class="scan-note" role="status"><i class="spinner"></i><span id="scan-status">'+esc(state.scan)+'</span></div>':state.platform!==state.actual?'<p class="scan-note">This computer reports '+esc(osLabels[state.actual])+'. Switch back to run the native scan.</p>':!state.platformSupported?'<p class="scan-note">Native scanning requires an Apple Silicon Mac or Windows x64 PC.</p>':'<p class="scan-note">The scan runs on this device. No model is downloaded until you choose one.</p>')+'</section></main>';
  return '<main class="setup results"><div class="setup-header"><div class="brand">'+svgBrand+'</div>'+(homeReady?button('home','Go to Home '+icons.arrow,'textbtn'):'')+'</div>'+systems()+'<h1>See What Your <em>Machine Can Run.</em></h1><p>Choose a model to pull. Speeds estimate text generation on this machine.</p>'+(state.scan?'<div class="scan-note" role="status"><i class="spinner"></i><span id="scan-status">'+esc(state.scan)+'</span></div>':'')+machine()+analysisNotice()+catalogPanel(state.models)+'<footer>'+(homeReady?button('home','Go to Home '+icons.arrow,'btn primary'):'')+'</footer></main>';
}
function catalogPanel(rows){
  return '<section class="catalog"><header><div><h2>Models for this device</h2><p>'+gb(state.free)+' available for downloads</p></div>'+button('folder','Change storage','btn secondary compact',state.pull||busy?'disabled':'')+'</header>'+modelRows(rows)+'<footer>Estimates vary with context and hardware. SSD streaming can run models larger than RAM, provided they fit on your drive.</footer></section>';
}
const nav=[['chat','AI Chat'],['plugins','Plugins'],['models','My Models'],['discover','Discover Models']];
const navItems=()=>hasPlugin('api')?[...nav,['api','API']]:nav;
const engineLabels={stopped:'Engine Stopped',loading:'Model loading',running:'Engine Running'};
function updateEngineStatus(status) {
  const indicator=document.querySelector('#engine-status');
  if (!indicator) return;
  indicator.dataset.state=status;
  indicator.title=engineLabels[status];
  indicator.querySelector('span').textContent=engineLabels[status];
}
function sidebar() {
  const statusLabel = engineLabels[state.engineStatus];
  const rows = navItems().map(([key, label]) => button(
    key, icons[key] + '<span>' + label + '</span>', 'navbtn' + (page === key ? ' active' : ''),
    'aria-label="' + label + '" title="' + label + '"' + (page === key ? ' aria-current="page"' : ''),
  )).join('');
  return '<aside class="sidebar" aria-label="Launcher sidebar"><div class="brand">' + svgBrand + '</div>'
    + '<nav aria-label="Workspace">' + rows + '</nav>'
    + '<div class="sidebar-bottom">'
    + '<section id="engine-model-menu" class="engine-model-menu" aria-label="Model engines" hidden></section>'
    + '<button type="button" class="local-label engine-toggle" id="engine-status" data-action="toggle-engine-menu" aria-expanded="false" aria-controls="engine-model-menu" data-state="' + state.engineStatus
    + '" title="' + statusLabel + '"><i aria-hidden="true"></i> <span>' + statusLabel + '</span>'+icons.chevron+'</button></div></aside>';
}

function syncEngineMenu() {
  const menu=root.querySelector('#engine-model-menu');
  const toggle=root.querySelector('#engine-status');
  if(!menu||!toggle)return;
  root.querySelector('.sidebar').classList.toggle('engine-menu-open',engineMenuOpen);
  toggle.setAttribute('aria-expanded',String(engineMenuOpen));
  menu.hidden=!engineMenuOpen;
  if(!engineMenuOpen)return;
  const models=state.models.filter(model=>model.local&&model.runtime!=='fixture');
  menu.innerHTML='<header><strong>Model engines</strong><small>One active model at a time</small></header>'
    +(models.length?models.map(model=>{
      const active=state.engineModelId===model.id&&state.engineStatus!=='stopped';
      const status=active?state.engineStatus==='loading'?'Loading…':'Running':'Stopped';
      return '<div class="engine-model" data-engine-model="'+esc(model.id)+'"><span class="engine-model-logo">'+modelLogo(model)+'</span><div><strong>'+esc(model.name)+'</strong><small class="'+(active?'is-active':'')+'">'+status+'</small></div>'
        +button((active?'stop-engine:':'play-engine:')+model.id,active?icons.stop:icons.play,'engine-model-control',
          'aria-label="'+(active?'Stop ':'Load ')+esc(model.name)+'" title="'+(active?'Stop and unload':'Play: load model')+'" '+(!active&&(modelActionBusy||thinking||state.scan)?'disabled':''))+'</div>';
    }).join(''):'<p>No models downloaded yet.</p>')
    +button('discover','Discover models '+icons.arrow,'engine-discover');
}
function toggleEngineMenu(open) {
  engineMenuOpen=open;syncEngineMenu();
  if(!open)root.querySelector('#engine-status')?.focus();
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
  const micEnabled = hasPlugin('microphone-typing');
  const skillsEnabled = hasPlugin('skills');
  const webEnabled = hasPlugin('internet-search');
  const blocked=pendingFiles.length>0&&!active?.filesSupported;
  const full=pendingFiles.length>=3;
  const attachmentLabel=!active?.filesSupported?'This model does not support attachments'
    :full?'You can attach up to three files':'Attach text, PDF, or Word files';
  const disabled=!active?.filesSupported||full||chatBusy();
  const paperclip='<span class="attach-control" title="'+attachmentLabel+'">'
    +button('attach',icons.paperclip,'attach-button','aria-label="'+attachmentLabel+'"'+(disabled?' disabled':''))
    +'</span>';
  const send=thinking?button('stop','Stop','btn secondary compact')
    :'<button class="send" aria-label="Send message"'+(!active||blocked||chatBusy()?' disabled':'')+'>'+icons.send+'</button>';
  const micLabel = voicePhase === 'recording' ? 'Stop recording' : voicePhase ? 'Processing microphone input' : 'Record a prompt';
  const micIcon = voicePhase === 'recording' ? icons.stop : voicePhase ? '<i class="spinner"></i>' : icons.mic;
  const mic = micEnabled ? button('dictate',micIcon,'voice-button'+(voicePhase==='recording'?' recording':''),
    'aria-label="'+micLabel+'" title="'+micLabel+'"'+(chatBusy()&&voicePhase!=='recording'?' disabled':'')) : '';
  const composerInput = voicePhase === 'recording'
    ? '<div class="voice-wave" role="status"><span class="sr">Recording prompt</span><svg viewBox="0 0 600 44" preserveAspectRatio="none" aria-hidden="true"><path id="voice-wave" d="M 0 22 L 600 22"></path></svg></div>'
    : voicePhase ? '<div class="voice-status" role="status">'+(voicePhase==='requesting'?'Starting microphone…':'Transcribing on this device…')+'</div>'
    : '<label class="sr" for="prompt">Message your local model</label><div class="prompt-editor">'
      +'<div class="prompt-highlight" aria-hidden="true" hidden></div>'
      +'<textarea id="prompt" maxlength="12000" rows="2" placeholder="'+(webEnabled?'Ask anything, or type /web-search to search the web for your answer.':'Ask anything')+'"></textarea></div>';
  return '<form id="composer">'+fileChips(pendingFiles,true)
    +'<div id="prompt-commands" class="prompt-commands" aria-label="Chat commands" hidden><div class="command-prefix">/</div>'
    +button('command-upload',icons.paperclip+'<span>Upload a file</span>','command-option','data-command="upload"'+(disabled?' disabled':''))
    +button('command-clear',icons.trash+'<span>/clear</span>','command-option','data-command="clear" title="Clear this chat"')
    +(webEnabled?button('command-web',icons.globe+'<span>/web-search</span>','command-option','data-command="web-search"'):'')
    +'</div>'
    +(blocked?'<p class="file-note">Choose a model that can read files, or remove the attachments.</p>':'')
    +composerInput
    +'<div class="compose-actions"><div class="compose-tools">'+paperclip+(active?chatModelPicker(active):'')+(skillsEnabled?skillsPicker():'')+'</div><div class="compose-tools">'+mic+send+'</div></div></form>'
    +(active?'<p class="composer-note">Runs on this device · No hosted chat API</p>'
      :'<div class="composer-note composer-no-model"><span>Download a model to send your prompt.</span>'
        +button('discover','Discover Models '+icons.arrow,'textbtn')+'</div>');
}

function skillsPicker() {
  const skills = state.skills ?? [];
  const count = skills.filter(skill => skill.enabled).length;
  const rows = skills.map(skill => `
    <li class="skill-row">
      <span class="skill-name" title="${esc(skill.name)}">${esc(skill.name)}</span>
      ${button('delete-skill:'+esc(skill.id),icons.trash,'skill-delete','aria-label="Delete '+esc(skill.name)+'" title="Delete skill"')}
      ${button('toggle-skill:'+esc(skill.id),'<span></span>','skill-switch',
        'role="switch" aria-checked="'+skill.enabled+'" aria-label="'+esc(skill.name)+'"')}
    </li>`).join('');
  return `<div class="skills-picker">
    ${button('toggle-skills','<span class="skills-count">'+count+'</span><span>Skills</span>'+icons.chevron,'model-pill skills-pill',
      'id="chat-skills" aria-controls="chat-skills-panel" aria-expanded="'+skillsMenuOpen+'" aria-label="Skills, '+count+' enabled"'+(chatBusy()?' disabled':''))}
    <section class="skills-panel" id="chat-skills-panel" aria-label="Skills"${skillsMenuOpen?'':' hidden'}>
      <header><strong>Skills</strong>${button('new-skill',icons.plus,'skill-add','aria-label="Add skill" title="Add skill"')}</header>
      ${rows?'<ul>'+rows+'</ul>':'<p>No skills yet.</p>'}
    </section>
  </div>`;
}

function chatHistory() {
  const blocked = chatBusy() ? 'disabled' : '';
  const items = conversations.map(chat => {
    const title = esc(chat.title);
    return `<li class="history-item">
      ${button('open-chat:'+chat.id,title,'history-chat','title="'+title+'" '+(currentChat===chat.id?'aria-current="true" ':'')+blocked)}
      <div class="history-actions">
        ${button('rename-chat:'+chat.id,icons.edit,'history-icon','aria-label="Rename '+title+'" title="Rename chat" '+blocked)}
        ${button('delete-chat:'+chat.id,icons.trash,'history-icon','aria-label="Delete '+title+'" title="Delete chat" '+blocked)}
      </div>
    </li>`;
  }).join('');
  return `<aside class="chat-history" aria-label="Chat history">
    ${button('new',icons.plus+' New chat','btn secondary compact',blocked)}
    <h2>Chat history</h2>
    ${items ? '<ul>'+items+'</ul>' : '<p>Your conversations will appear here.</p>'}
  </aside>`;
}

function editChat(id, deleting) {
  const chat = conversations.find(item => item.id === id);
  if (!chat || chatBusy()) return;
  const dialog = document.querySelector('#history-dialog');
  dialog.dataset.id = id;
  dialog.dataset.deleting = String(deleting);
  dialog.querySelector('h2').textContent = deleting ? 'Delete chat?' : 'Rename chat';
  dialog.querySelector('p').textContent = deleting ? '“'+chat.title+'” will be removed from your history.' : '';
  const input = dialog.querySelector('input');
  input.value = chat.title;
  input.closest('label').hidden = deleting;
  input.disabled = deleting;
  dialog.querySelector('button[type=submit]').textContent = deleting ? 'Delete' : 'Save';
  dialog.showModal();
  if (!deleting) input.select();
}

function renderSources(sources) {
  if (!Array.isArray(sources) || !sources.length) return '';
  return '<div class="web-sources"><strong>Web sources</strong><ol>'+sources.map(source=>
    '<li>'+button('open-source',esc(source.title),'web-source','data-source-url="'+esc(source.url)+'"')+'</li>').join('')+'</ol></div>';
}

function normalizeReasoning(turn){
  if(turn?.role!=='assistant')return turn;
  const parsed=window.PowerBrixReasoning.parseReasoning(turn.content||'',turn.reasoning||'',true);
  return {...turn,content:parsed.answer,reasoning:parsed.reasoning};
}
function contextMeter(percent){
  const value=percent===null?0:Math.max(0,Math.min(100,percent));
  const angle=value/100*Math.PI*2;
  const x=(8+6.5*Math.sin(angle)).toFixed(3),y=(8-6.5*Math.cos(angle)).toFixed(3);
  const fill=value>=100?'<circle class="context-fill" cx="8" cy="8" r="6.5"/>':value>0?'<path class="context-fill" d="M8 8 L8 1.5 A6.5 6.5 0 '+(value>50?1:0)+' 1 '+x+' '+y+' Z"/>':'';
  return '<svg class="context-meter" viewBox="0 0 16 16" aria-hidden="true">'+fill+'<circle class="context-track" cx="8" cy="8" r="6.5"/></svg>';
}

function reasoningPanel(text, open, key) {
  if (!text) return '';
  return '<details class="model-reasoning" data-reasoning-turn="'+esc(key)+'"'+(open?' open':'')+'><summary>Model reasoning</summary><div class="reasoning-text">'+esc(text)+'</div></details>';
}
function responseNote(turn) {
  if (turn.finishReason === 'length') return '<small class="response-note">Response reached its length limit. Ask the model to continue.</small>';
  if (turn.finishReason === 'interrupted') return '<small class="response-note">Response interrupted. You can ask the model to continue.</small>';
  if (turn.finishReason === 'cancelled') return '<small class="response-note">Response stopped.</small>';
  return '';
}
function chatStats(){
  if(!turns.some(turn=>turn.role==='user'))return '';
  const saved=turns.filter(turn=>turn.role==='assistant');
  const measurements=saved.flatMap(turn=>[...(turn.previousMetrics||[]),turn.metrics]);
  if(thinking&&liveMetrics)measurements.push(liveMetrics);
  const summary=window.PowerBrixChatMetrics.summarizeMetrics(measurements);
  const active=activeChatModel()?.id;
  const latest=thinking&&liveMetrics?liveMetrics:[...saved].reverse().sort((a,b)=>(b.generatedAt||0)-(a.generatedAt||0)).find(turn=>turn.modelId===active&&turn.metrics)?.metrics;
  const used=latest?.promptTokens!=null&&latest?.generatedTokens!=null?latest.promptTokens+latest.generatedTokens:null;
  const capacity=latest?.contextCapacity;
  const percent=used!=null&&capacity>0?Math.min(100,used/capacity*100):null;
  const total=summary.total===null?'Not reported':summary.total.toLocaleString()+(summary.unreported?'+':'');
  const rate=summary.average===null?(thinking?'Measuring':'Not reported'):summary.average.toFixed(1)+' tok/s';
  const context=percent===null?'Waiting for model':Math.round(percent)+'% context';
  return '<span class="chat-stat" title="Average generation speed in this chat, based on generated tokens and engine decode time. Includes thinking; excludes model loading and prompt processing.">'
    +icon('M13 2 4 14h7l-1 8 10-12h-7l1-8Z')+'<span>'+rate+'<small> average</small></span></span>'
    +'<span class="chat-stat" title="'+(percent===null?'Context usage will appear when the model reports token counts.':used.toLocaleString()+' / '+capacity.toLocaleString()+' tokens in the latest request and response. Older conversation may be trimmed to fit.')+'">'
    +contextMeter(percent)+'<span>'+context+'</span></span>'
    +'<span class="chat-stat" title="Total recorded AI tokens in this chat, including thinking. A plus means older replies have no recorded counts.">'+icons.models+'<span>'+total+'<small> tokens generated</small></span></span>';
}
function updateChatStats(){
  const row=document.querySelector('#chat-stats');if(!row)return;
  row.innerHTML=chatStats();row.hidden=!row.innerHTML;
}

function chatArea(){
  const active=activeChatModel();
  const stream='<div class="chat-turn assistant streaming" id="stream"><div class="message assistant"><span>'+esc(status)+'</span></div></div>';
  const messages=turns.map(normalizeReasoning).map((turn,index)=>{
    if(thinking&&regeneratingIndex===index)return stream;
    if(turn.role==='user'&&editingIndex===index)return '<form class="chat-turn user is-editing" data-message-edit="'+index+'">'
      +'<div class="message user editing-message">'+fileChips(turn.attachments,false)+'<textarea data-message-editor aria-label="Edit sent message" maxlength="12000" rows="3">'+esc(editingDraft)+'</textarea></div>'
      +'<div class="message-actions">'+button('cancel-message-edit','Cancel','message-edit-cancel')+'<button type="submit" class="message-action edit-message-send" aria-label="Resend edited message" title="Resend edited message" '+(!editingDraft.trim()?'disabled':'')+'>'+icons.send+'</button></div></form>';
    return '<div class="chat-turn '+turn.role+'">'
      +(turn.role==='assistant'?reasoningPanel(turn.reasoning,turn.reasoningOpen,index):'')
      +'<div class="message '+turn.role+'">'+fileChips(turn.attachments,false)
      +(turn.webSearch?'<span class="message-web-command">/web-search</span> ':'')+esc(turn.content)
      +renderSources(turn.sources)+responseNote(turn)
      +(turn.shortened?'<small class="file-note">Used the most recent context and relevant excerpts.</small>':'')+'</div>'
      +'<div class="message-actions">'+button('copy-message:'+index,icons.copy,'message-action','aria-label="Copy message" title="Copy message"')
      +(turn.role==='user'?button('edit-message:'+index,icons.edit,'message-action','aria-label="Edit message" title="Edit message" '+(chatBusy()?'disabled':'')):'')
      +button('regenerate:'+index,icons.restart,'message-action','aria-label="Regenerate response" title="Regenerate response" '+(chatBusy()?'disabled':''))+'</div></div>';
  }).join('');
  const welcome='<div class="chat-welcome"><span class="tile">'+icons.chat+'</span><h1>What Can I <em>Help With?</em></h1><p>Your models. Your machine. Your conversation.</p></div>';
  const streaming=thinking&&regeneratingIndex===null?stream:'';
  const header = '<header class="workspace-header"><div><p class="eyebrow">Private workspace</p><h2>AI Chat</h2></div>'
    +button('new',icons.plus+' New chat','btn secondary compact',thinking?'disabled':'')
    +'</header>';
  const content = '<section class="chat" aria-label="AI Chat">'+(historyOn()?'':header)+'<div id="chat-scroll" class="chat-scroll">'+(messages||streaming?'<div class="messages">'+messages+streaming+'</div>':welcome)
    +'</div><div class="composer-wrap">'+chatComposer(active)+'<div id="chat-stats" class="chat-stats" aria-label="Chat performance"'+(turns.length?'':' hidden')+'>'+chatStats()+'</div></div></section>';
  return '<main class="workspace chat-layout">'+(historyOn()?chatHistory():'')+content
    +(historyOn()?'<dialog id="history-dialog" aria-labelledby="history-dialog-title"><form id="history-form"><h2 id="history-dialog-title"></h2><p></p><label>Chat name<input name="title" maxlength="80" required></label><div>'
      +button('cancel-history','Cancel','btn secondary compact')+'<button type="submit" class="btn primary compact">Save</button></div></form></dialog>':'')+'</main>';
}
const plugins = [
  {id:'chat-history', name:'Chat History', icon:'history', description:'Save and revisit past conversations with your local AI.'},
  {id:'microphone-typing', name:'Microphone Typing', icon:'mic', description:'Speak into your microphone and turn your words into a prompt.'},
  {id:'skills', name:'Skills', icon:'skills', description:'Give your models reusable instructions for the tasks you do most often.'},
  {id:'api',name:'API',icon:'api',description:'Create an API for your local models.'},
  {id:'internet-search', name:'Internet Search', icon:'globe', description:'Find current information on the web and bring sources into your chat.'},
];

function pluginsPage() {
  const cards = plugins.map(plugin => `
    <article class="plugin-card" data-plugin="${esc(plugin.name + ' ' + plugin.description)}">
      <div class="plugin-icon">${icons[plugin.icon]}</div>
      <div class="plugin-copy">
        <h2>${esc(plugin.name)}</h2>
        <p>${esc(plugin.description)}</p>
      </div>
      ${button('install-plugin:'+(plugin.id||''),plugin.id&&hasPlugin(plugin.id)?'Installed':'Install','btn secondary compact',
        !plugin.id?'disabled title="Installation is unavailable in this preview"':hasPlugin(plugin.id)?'disabled':'')}
    </article>`).join('');

  return `
    <main class="workspace plugins">
      <div class="plugins-content">
        <header class="plugins-header">
          <div>
            <h1>Plugins</h1>
            <p>Install different plugins to the PowerBrix launcher to make your local AI experience better.</p>
          </div>
          <label class="plugin-search">
            <span class="sr">Search plugins</span>
            ${icons.search}
            <input type="search" id="plugin-search" placeholder="Search plugins" value="${esc(pluginQuery)}">
          </label>
        </header>
        <div class="plugin-grid">${cards}</div>
        <p class="plugin-empty" role="status" hidden>No matching plugins.</p>
      </div>
    </main>`;
}

async function loadApiConfiguration(){
  if(apiLoading)return;apiLoading=true;if(page==='api')render();
  try{apiInfo=await api.apiConfiguration();}catch(error){apiInfo={running:false,error:error.message};}
  finally{apiLoading=false;if(page==='api')render();}
}
function apiExamples(){
  const models=state.models.filter(model=>model.local&&model.runtime!=='fixture');
  const model=models.find(model=>model.id===apiModelId)||models[0];
  const base=apiInfo?.baseUrl||'http://127.0.0.1:38473/v1';
  const key=apiInfo?.key||'YOUR_API_KEY';
  const body=JSON.stringify({model:model?.id||'INSTALLED_MODEL_ID',messages:[{role:'user',content:'Explain how local AI can help my business.'}],stream:false},null,2);
  const url=new URL(base+'/chat/completions');
  const curl=['curl '+url.href,'  -H "Authorization: Bearer '+key+'"','  -H "Content-Type: application/json"',"  -d '"+body+"'"].join(' '+String.fromCharCode(92)+'\n');
  return {model,models,curl,http:'POST '+url.pathname+' HTTP/1.1\nHost: '+url.host+'\nAuthorization: Bearer '+key+'\nContent-Type: application/json\nContent-Length: '+new TextEncoder().encode(body).length+'\n\n'+body};
}
function apiPage(){
  const {model,models,curl,http}=apiExamples();
  const code=()=>'<section class="api-code"><header><div class="api-request-tabs" role="tablist" aria-label="Request format">'
    +['curl','http'].map(format=>button('api-format:'+format,format==='curl'?'cURL':'HTTP','api-request-tab',
      'role="tab" id="api-format-'+format+'" aria-controls="api-request-panel" aria-selected="'+(apiRequestFormat===format)+'" tabindex="'+(apiRequestFormat===format?0:-1)+'"')).join('')
    +'</div>'+button('copy-api:'+apiRequestFormat,icons.copy,'message-action','aria-label="Copy '+(apiRequestFormat==='curl'?'cURL':'HTTP')+' request" title="Copy request"')+'</header>'
    +'<pre id="api-request-panel" role="tabpanel" aria-labelledby="api-format-'+apiRequestFormat+'" tabindex="0"><code>'+esc(apiRequestFormat==='curl'?curl:http)+'</code></pre></section>';
  return '<main class="workspace api-workspace"><div class="api-content"><header class="api-heading"><h1>API Configuration</h1></header>'
    +'<section class="api-key-section"><div class="api-key-box"><div class="api-key-value"><h2>API Key</h2><code>'+esc(apiInfo?.key||(apiLoading?'Preparing your local API…':'API unavailable'))+'</code></div><div class="api-key-actions">'
    +button('copy-api:key',icons.copy,'message-action','aria-label="Copy API key" title="Copy API key" '+(!apiInfo?.key?'disabled':''))
    +button('regenerate-api-key',icons.restart,'message-action','aria-label="Regenerate API key" title="Regenerate API key" '+(!apiInfo?.running||apiLoading?'disabled':''))+'</div></div><p>Keep your key private. Regenerating it replaces the key used by your integrations.</p></section>'
    +'<section class="api-availability" aria-label="API availability"><div><span class="api-availability-label"><i></i> Available while you are</span><h2>Keep Launcher open.<br>Let your models do the rest.</h2></div><div class="api-availability-details"><p><strong>Computer awake. Launcher running.</strong>Your computer powers every API response. The API is available while both are on.</p><p><strong>No manual model switching.</strong>Requests automatically load stopped models before generating a response.</p></div></section>'
    +(!apiInfo?.running?'<div class="api-service-note" role="status">'+esc(apiInfo?.error||(apiLoading?'Starting your local API…':'Your local API is not running.'))+button('retry-api','Retry','textbtn',apiLoading?'disabled':'')+'</div>':'<p class="api-status"><i></i> API running <code>'+esc(apiInfo.baseUrl)+'</code></p>')
    +'<section class="api-documentation"><h2>Make your first request</h2><p>Choose a downloaded model. Your request updates with its ID and your API key.</p><div class="api-model-picker"><label>Model</label>'+button('toggle-api-model',(model?modelLogo(model)+'<span>'+esc(model.name)+'</span>':'<span>No models downloaded</span>')+icons.chevron,'api-model-toggle','aria-haspopup="listbox" aria-expanded="'+apiModelOpen+'" '+(!models.length?'disabled':''))
    +(apiModelOpen?'<div class="api-model-options" role="listbox" aria-label="Installed models">'+models.map(item=>button('api-model:'+item.id,modelLogo(item)+'<span>'+esc(item.name)+'</span>','', 'role="option" aria-selected="'+(item.id===model?.id)+'"')).join('')+'</div>':'')+'</div>'
    +(models.length?code():'<div class="api-empty"><p>Download a model to create your first request.</p>'+button('discover','Discover Models','btn secondary compact')+'</div>')
    +'<div class="api-guide"><h3>How requests work</h3><ol><li>Send a POST request to <code>/v1/chat/completions</code> with your key in the Bearer authorization header.</li><li>Use an installed model ID and text messages. An optional first <code>system</code> message can set instructions.</li><li>Read the answer in <code>choices[0].message.content</code>. Thinking, when provided, is separate in <code>reasoning_content</code>.</li></ol><h3>Streaming and generation options</h3><p>Set <code>stream</code> to <code>true</code> for server-sent events ending in <code>[DONE]</code>. Optional settings: <code>max_tokens</code> (1–4096), <code>temperature</code> (0–2), and <code>top_p</code> (above 0, up to 1). Requests currently support text, without attachments or tool calls.</p><h3>List your models</h3><p>Use <code>GET '+esc(apiInfo?.baseUrl||'http://127.0.0.1:38473/v1')+'/models</code> with the same authorization header to list installed model IDs.</p><h3>Running locally</h3><p>This address works on this computer only. Access from another device requires a separate network setup. The API stops if Launcher closes or your computer sleeps. If another reply or system task is active, the API returns <code>409</code>; retry when it finishes. A regenerated key invalidates the old key.</p></div></section></div></main>';
}

function filterPlugins() {
  const query = pluginQuery.trim().toLowerCase();
  const cards = [...root.querySelectorAll('[data-plugin]')];
  for (const card of cards) {
    card.hidden = !card.dataset.plugin.toLowerCase().includes(query);
  }
  root.querySelector('.plugin-empty').hidden = cards.some(card => !card.hidden);
}

function workspace(){
  if(page==='chat')return sidebar()+chatArea();
  if(page==='plugins')return sidebar()+pluginsPage();
  if(page==='api')return sidebar()+apiPage();
  let local=page==='models';
  return sidebar()+'<main class="workspace listing"><header class="workspace-header"><div><p class="eyebrow">Private workspace</p><h2>'+ (local?'My Models':'Discover Models')+'</h2></div><div class="listing-tools">'+(demo?button('preview-wait','Preview Tetris','btn secondary compact'):'')+button('scan',state.scan?'Analyzing…':'Analyze System','btn secondary compact',state.scan||busy||state.pull||!state.platformSupported||state.platform!==state.actual?'disabled':'')+'</div></header><div class="listing-content"><h1>'+(local?'Your <em>Local Models.</em>':'Find Your <em>Next Model.</em>')+'</h1><p>'+(local?'Models you have downloaded on the selected drive.':'Compare storage requirements and estimated performance, then pull a model to use it locally.')+'</p>'+(state.scan?'<p class="scan-note" role="status"><i class="spinner"></i><span id="scan-status">'+esc(state.scan)+'</span></p>':'')+(local?'':machine()+analysisNotice())+catalogPanel(state.models.filter(model=>local?model.local:model.runtime!=='fixture'))+'</div></main>';
}
function render(){
  const editFocused=document.activeElement?.matches('[data-message-editor]');
  const editSelection=editFocused?[document.activeElement.selectionStart,document.activeElement.selectionEnd]:null;
  const focused=document.activeElement?.id==='prompt';
  const searchFocused=document.activeElement?.id==='plugin-search';
  const scroll=document.querySelector('#chat-scroll')?.scrollTop;
  const samePage = renderedPage === page;
  const workspaceScroll = samePage ? root.querySelector('.workspace')?.scrollTop : undefined;
  const setupScroll = samePage ? root.scrollTop : 0;
  root.className=page==='setup'?'app setup-mode':'app desk';
  const existingSidebar = samePage ? root.querySelector('.sidebar') : null;
  if (existingSidebar) {
    const next = document.createElement('template');
    next.innerHTML = workspace();
    const nextNav=next.content.querySelector('.sidebar nav').innerHTML;
    if(existingSidebar.querySelector('nav').innerHTML!==nextNav)existingSidebar.querySelector('nav').innerHTML=nextNav;
    next.content.querySelector('.sidebar').remove();
    for (const child of [...root.children]) if (child !== existingSidebar) child.remove();
    root.append(next.content);
    updateEngineStatus(state.engineStatus);
  } else root.innerHTML=page==='setup'?onboarding():workspace();
  if(page==='plugins') {
    filterPlugins();
    if(searchFocused) root.querySelector('#plugin-search').focus();
  }
  const prompt = document.querySelector('#prompt');
  if(prompt) {
    prompt.value = drafts.get(draftKey()) ?? '';
    updatePromptHighlight(prompt);
  }
  if(focused)document.querySelector('#prompt')?.focus();
  if(editFocused){const editor=root.querySelector('[data-message-editor]');if(editor){editor.focus();editor.setSelectionRange(...editSelection);}}
  if(samePage && scroll && document.querySelector('#chat-scroll')) document.querySelector('#chat-scroll').scrollTop=scroll;
  if (workspaceScroll !== undefined) root.querySelector('.workspace').scrollTop = workspaceScroll;
  root.scrollTop = setupScroll;
  syncEngineMenu();
  renderedPage = page;
  window.PowerBrixActivity?.update(state);
  if(thinking)showStream();
}
function drawVoiceWave(time) {
  if (voicePhase !== 'recording') return;
  const level = capture.level();
  volume += (level - volume) * (level > volume ? .26 : .14);
  const points = [];
  for (let x = 0; x <= 600; x += 6) {
    const envelope = Math.sin(Math.PI * x / 600) ** 1.65;
    const wave = (Math.sin(x / 17 - time / 95) + .4 * Math.sin(x / 9 + time / 115)) / 1.4;
    points.push(x + ' ' + (22 + wave * envelope * (volume < .012 ? 0 : volume * 19)).toFixed(2));
  }
  document.querySelector('#voice-wave')?.setAttribute('d','M '+points.join(' L '));
  waveRequest = requestAnimationFrame(drawVoiceWave);
}

async function beginDictation() {
  if (!hasPlugin('microphone-typing') || chatBusy()) return;
  setModelMenu(false);
  voicePhase = 'requesting';
  capture = new VoiceCapture();
  render();
  try {
    await capture.start(finishDictation);
    volume = 0;
    voicePhase = 'recording';
    render();
    document.querySelector('[data-action="dictate"]')?.focus();
    waveRequest = requestAnimationFrame(drawVoiceWave);
  } catch(error) {
    voicePhase = '';
    capture = null;
    render();
    document.querySelector('[data-action="dictate"]')?.focus();
    tell(error.name === 'NotAllowedError' ? 'Allow microphone access in your system settings to record a prompt.' : 'The microphone could not start.');
  }
}

async function finishDictation() {
  if (voicePhase !== 'recording') return;
  cancelAnimationFrame(waveRequest);
  voicePhase = 'transcribing';
  render();
  try {
    const wav = await capture.stop();
    const transcript = wav ? await api.transcribe(wav) : '';
    if (transcript) {
      const previous = drafts.get(draftKey())?.trimEnd();
      drafts.set(draftKey(),(previous ? previous+' '+transcript : transcript).slice(0,12000));
    } else {
      tell('No speech detected. Try recording again.');
    }
  } catch(error) {
    tell(error);
  } finally {
    capture = null;
    voicePhase = '';
    render();
    document.querySelector('#prompt')?.focus();
  }
}
function showStream(){
  const node=document.querySelector('#stream');
  if(!node)return;
  const area=document.querySelector('#chat-scroll');
  const follow = area && area.scrollHeight-area.scrollTop-area.clientHeight < 80;
  let panel=node.querySelector('.model-reasoning');
  if (reasoning && !panel) {
    node.insertAdjacentHTML('afterbegin',reasoningPanel(reasoning,streamReasoningOpen,'stream'));
    panel=node.querySelector('.model-reasoning');
  }
  if (panel) panel.querySelector('.reasoning-text').textContent=reasoning;
  const bubble=node.querySelector('.message');
  let output=bubble.querySelector('.stream-answer');
  if (!output) {
    // Replace the initial status once, keeping the reasoning disclosure connected thereafter.
    bubble.replaceChildren();
    output=document.createElement('div');output.className='stream-answer';bubble.append(output);
  }
  output.textContent=answer || status;
  output.classList.toggle('stream-status',!answer);
  if(follow && area)area.scrollTop=area.scrollHeight;
}
root.addEventListener('toggle',event=>{
  const panel=event.target;
  if (!panel.matches?.('[data-reasoning-turn]')) return;
  if (panel.dataset.reasoningTurn==='stream') streamReasoningOpen=panel.open;
  else {
    const turn=turns[Number(panel.dataset.reasoningTurn)];
    if (turn) turn.reasoningOpen=panel.open;
  }
},true);
async function perform(action,...args){
  try {const next=await api[action](...args);if(next?.models){state=next;render();}return next;}
  catch(error){tell(error);}
}
function setModelMenu(open, focusToggle = false) {
  if(open) setSkillsMenu(false);
  modelMenuOpen = open;
  const toggle = document.querySelector('#chat-model');
  const menu = document.querySelector('#chat-model-options');
  if (!toggle || !menu) return;
  toggle.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
  if (open) (menu.querySelector('[aria-checked="true"]') || menu.firstElementChild)?.focus();
  else if (focusToggle) toggle.focus();
}

function setSkillsMenu(open, focusToggle = false) {
  if(open) setModelMenu(false);
  skillsMenuOpen = open;
  document.querySelector('#chat-skills')?.setAttribute('aria-expanded',String(open));
  const panel = document.querySelector('#chat-skills-panel');
  if(panel) panel.hidden = !open;
  if(focusToggle) document.querySelector('#chat-skills')?.focus();
}

function updatePromptHighlight(input) {
  const overlay = input.parentElement.querySelector('.prompt-highlight');
  const token = hasPlugin('internet-search') && webCommand.exec(input.value);
  overlay.hidden = !token;
  input.classList.toggle('has-web-command',Boolean(token));
  if (!token) return;
  const start = token.index + token[1].length;
  const end = token.index + token[0].length;
  overlay.innerHTML = esc(input.value.slice(0,start))+'<mark>'+esc(input.value.slice(start,end))+'</mark>'+esc(input.value.slice(end))+'\n';
  overlay.style.width = input.clientWidth+'px';
  overlay.scrollTop = input.scrollTop;
}

function commandAtCursor(input) {
  return /(^|\s)(\/[a-z-]*)$/i.exec(input.value.slice(0,input.selectionStart));
}

function showCommands(input) {
  const menu = document.querySelector('#prompt-commands');
  if (!menu) return;
  const command = commandAtCursor(input);
  const prefix = command?.[2].slice(1).toLowerCase();
  const options = [...menu.querySelectorAll('.command-option')];
  for (const option of options) option.hidden = prefix != null && !option.dataset.command.startsWith(prefix);
  menu.hidden = chatBusy() || !command || (prefix === 'web-search' || prefix === 'clear')
    || options.every(option=>option.hidden);
  commandIndex = 0;
  selectCommand(menu,0);
}

function selectCommand(menu, delta) {
  const options = [...menu.querySelectorAll('.command-option:not(:disabled):not([hidden])')];
  if (!options.length) return null;
  commandIndex = (commandIndex + delta + options.length) % options.length;
  options.forEach((option,index)=>option.classList.toggle('command-selected',index===commandIndex));
  return options[commandIndex];
}

function applyCommand(search) {
  const input = document.querySelector('#prompt');
  if (!input) return;
  const command = commandAtCursor(input);
  let content = input.value;
  if (command) content = content.slice(0,command.index+command[1].length) + content.slice(input.selectionStart);
  if (search) {
    content = '/web-search ' + content.replace(webCommand,'$1').trimStart();
  }
  input.value = content;
  drafts.set(draftKey(),content);
  document.querySelector('#prompt-commands').hidden = true;
  input.focus();
  input.setSelectionRange(content.length,content.length);
  updatePromptHighlight(input);
}

document.addEventListener('pointerdown',event=>{
  if(engineMenuOpen&&!event.target.closest('.sidebar-bottom')){engineMenuOpen=false;syncEngineMenu();}
  if(apiModelOpen&&!event.target.closest('.api-model-picker')){apiModelOpen=false;if(page==='api')render();}
  if (modelMenuOpen && !event.target.closest('.model-picker')) setModelMenu(false);
  if (skillsMenuOpen && !event.target.closest('.skills-picker, #skill-dialog')) setSkillsMenu(false);
  const menu = document.querySelector('#prompt-commands');
  if (menu && !event.target.closest('#prompt-commands, #prompt')) menu.hidden = true;
});
root.addEventListener('focusout',event=>{
  if(modelMenuOpen&&event.target.closest('.model-picker')&&!event.relatedTarget?.closest('.model-picker'))setModelMenu(false);
});

root.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  let [action,value]=el.dataset.action.split(':');
  if (action === 'open-source') {await perform('openWebSource',el.dataset.sourceUrl);return;}
  if (action === 'command-clear') {clearCurrentChat();return;}
  if (action === 'command-web') {applyCommand(true);return;}
  if (action === 'command-upload') {applyCommand(false);action='attach';}
  if (action === 'install-plugin') {
    el.disabled = true;
    try {
      const next = await api.installPlugin(value);
      state.plugins = next.plugins;
      if (value === 'chat-history') readHistory();
      render();
    } catch(error) {
      tell(error);
      el.disabled = false;
    }
    return;
  }
  if (action === 'dictate') {
    if (voicePhase === 'recording') await finishDictation();
    else await beginDictation();
    return;
  }
  if (voicePhase) return;
  if (action === 'toggle-skills') {setSkillsMenu(!skillsMenuOpen);return;}
  if (action === 'new-skill') {openSkillDialog();return;}
  if (action === 'toggle-skill' || action === 'delete-skill') {
    el.disabled = true;
    try {
      const deleting = action === 'delete-skill';
      const result = await api.manageSkill(deleting?'delete':'toggle',{id:value,enabled:el.getAttribute('aria-checked')!=='true'});
      state.skills = result.skills;
      render();
      (deleting ? document.querySelector('[data-action="new-skill"]')
        : document.querySelector(`[data-action="${action}:${value}"]`))?.focus();
    } catch (error) {tell(error);el.disabled=false;}
    return;
  }
  if (action === 'open-chat') {openConversation(value);return;}
  if (action === 'rename-chat' || action === 'delete-chat') {editChat(value,action==='delete-chat');return;}
  if (action === 'cancel-history') {document.querySelector('#history-dialog').close();return;}
  if(navItems().some(([key])=>key===action)||action==='setup'){
    modelMenuOpen=false;
    skillsMenuOpen=false;
    page=action;
    render();
    if(page==='api')await loadApiConfiguration();
    if(event.detail===0) root.querySelector(`.sidebar [data-action="${action}"]`)?.focus();
    return;
  }
  if(action==='api-format'&&['curl','http'].includes(value)){apiRequestFormat=value;render();root.querySelector('[data-action="api-format:'+value+'"]')?.focus({preventScroll:true});return;}
  if(action==='toggle-api-model'){apiModelOpen=!apiModelOpen;render();return;}
  if(action==='api-model'){apiModelId=value;apiModelOpen=false;render();return;}
  if(action==='retry-api'){await loadApiConfiguration();return;}
  if(action==='regenerate-api-key'){
    el.disabled=true;try{apiInfo=await api.regenerateApiKey();}catch(error){tell(error);}finally{render();}return;
  }
  if(action==='copy-api'){
    const examples=apiExamples();const valueToCopy=value==='key'?apiInfo?.key:value==='curl'?examples.curl:examples.http;
    if(!valueToCopy)return;
    try{await api.copyText(valueToCopy);el.innerHTML=icons.check;setTimeout(()=>{if(el.isConnected)el.innerHTML=icons.copy;},1400);}catch(error){tell(error);}return;
  }
  if(action==='edit-message'){
    const index=Number(value);if(chatBusy()||turns[index]?.role!=='user')return;
    editingIndex=index;editingDraft=(turns[index].webSearch?'/web-search ':'')+turns[index].content;render();
    const editor=root.querySelector('[data-message-editor]');editor?.focus();editor?.setSelectionRange(editor.value.length,editor.value.length);return;
  }
  if(action==='cancel-message-edit'){cancelMessageEdit();return;}
  if(action==='copy-message'){
    const turn=normalizeReasoning(turns[Number(value)]);if(!turn)return;
    try{await api.copyText(turn.content||'');el.innerHTML=icons.check;el.title='Copied';setTimeout(()=>{if(el.isConnected){el.innerHTML=icons.copy;el.title='Copy message';}},1600);}catch(error){tell(error);}
    return;
  }
  if(action==='regenerate'){await regenerateResponse(Number(value));return;}
  if(action==='preview-wait'&&demo){window.PowerBrixActivity?.preview();return;}
  if(action==='toggle-engine-menu'){toggleEngineMenu(!engineMenuOpen);return;}
  if(action==='play-engine'||action==='stop-engine'||action==='uninstall') {
    if(modelActionBusy&&action!=='stop-engine')return;
    modelActionBusy=true;syncEngineMenu();el.disabled=true;
    try {
      const next=await api[action==='play-engine'?'playModel':action==='stop-engine'?'stopModel':'uninstallModel'](value);
      if(next?.models)state=next;
    } catch(error){tell(error);}
    finally{modelActionBusy=false;render();}
    return;
  }
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
  if(action==='scan'){busy=true;state.scan='Preparing system analysis…';render();await perform('scan');state.scan=null;busy=false;render();return;}
  if(action==='pull'){state.pull={id:value};render();const next=await perform('pull',value);state.pull=next?.pull;render();return;}
  if(action==='use'){if(await perform('select',value)){page='chat';render();}return;}
  if(action==='new'){openConversation(null);return;}
  if(['pause','stop','folder'].includes(action))await perform(action);
});
root.addEventListener('input',event=>{
  if(event.target.matches('[data-message-editor]')){editingDraft=event.target.value;event.target.closest('form').querySelector('[type=submit]').disabled=!editingDraft.trim();return;}
  if(event.target.id==='prompt'){
    drafts.set(draftKey(),event.target.value);
    const send = document.querySelector('#composer .send');
    const active = activeChatModel();
    if (send) send.disabled = chatBusy() || (!isClearCommand(event.target.value)
      && (!active || (pendingFiles.length > 0 && !active.filesSupported)));
    updatePromptHighlight(event.target);
    if (!event.isComposing) showCommands(event.target);
  }
  if(event.target.id!=='plugin-search')return;
  pluginQuery=event.target.value;
  filterPlugins();
});
root.addEventListener('scroll',event=>{
  if (event.target.id==='prompt') event.target.previousElementSibling.scrollTop = event.target.scrollTop;
},true);
window.addEventListener('resize',()=>{
  const input=document.querySelector('#prompt');
  if(input)updatePromptHighlight(input);
});
root.addEventListener('keydown',event=>{
  if(event.target.matches('[data-message-editor]')){
    if(event.key==='Escape'){event.preventDefault();cancelMessageEdit();}
    if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();event.target.closest('form').requestSubmit();}
    return;
  }
  const commands = document.querySelector('#prompt-commands:not([hidden])');
  if (commands && !event.isComposing) {
    if (event.key === 'Escape') {
      event.preventDefault();commands.hidden=true;document.querySelector('#prompt')?.focus();return;
    }
    if (event.target.id === 'prompt' && ['ArrowUp','ArrowDown','Enter'].includes(event.key) && !event.shiftKey) {
      event.preventDefault();
      const selected = selectCommand(commands,event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0);
      if(event.key==='Enter')selected?.click();
      return;
    }
  }
  if(event.target.closest('.api-request-tabs')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();apiRequestFormat=event.key==='Home'?'curl':event.key==='End'?'http':apiRequestFormat==='curl'?'http':'curl';render();root.querySelector('[data-action="api-format:'+apiRequestFormat+'"]')?.focus({preventScroll:true});return;}
  if(event.key==='Escape'&&apiModelOpen){event.preventDefault();apiModelOpen=false;render();return;}
  if(event.target.closest('.api-model-options')&&['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
    event.preventDefault();const options=[...root.querySelectorAll('.api-model-options button')];const index=options.indexOf(event.target);const target=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options[target]?.focus();return;
  }
  if(event.key==='Escape'&&engineMenuOpen){event.preventDefault();toggleEngineMenu(false);return;}
  if(event.key==='Escape'&&skillsMenuOpen){event.preventDefault();setSkillsMenu(false,true);return;}
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
  if(event.target.hasAttribute('data-message-edit')){event.preventDefault();await resendEditedMessage(Number(event.target.dataset.messageEdit));return;}
  if (event.target.id === 'history-form') {
    event.preventDefault();
    const dialog = event.target.closest('dialog');
    const chat = conversations.find(item => item.id === dialog.dataset.id);
    if (!chat || chatBusy()) return;
    if (dialog.dataset.deleting === 'true') {
      conversations = conversations.filter(item => item !== chat);
      drafts.delete(chat.id);
      dialog.close();
      if (chat.id === currentChat) {
        openConversation(conversations[0]?.id ?? null);
        return;
      }
    } else {
      const input = event.target.elements.title;
      const title = input.value.trim();
      if (!title) {input.focus();return;}
      chat.title = title;
      dialog.close();
    }
    storeHistory();
    render();
    document.querySelector('[data-action="new"]')?.focus();
    return;
  }
  if(event.target.id!=='composer')return;
  event.preventDefault();
  if(chatBusy())return;
  const input=document.querySelector('#prompt');
  const typed=input.value.trim();
  if (isClearCommand(typed)) {clearCurrentChat();return;}
  const active=activeChatModel();
  if(!active||pendingFiles.length&&!active.filesSupported)return;
  if(!typed&&!pendingFiles.length)return;
  const useWebSearch = hasPlugin('internet-search') && webCommand.test(typed);
  const query = useWebSearch ? typed.replace(webCommand,'$1').trim() : typed;
  if (useWebSearch && !query) {tell('Type a question after /web-search.');return;}
  const attachments=pendingFiles;
  const content=query||'Summarize the attached files.';
  drafts.delete(draftKey());pendingFiles=[];modelMenuOpen=false;skillsMenuOpen=false;editingIndex=null;editingDraft='';
  turns.push({role:'user',content,attachments,webSearch:useWebSearch});thinking=true;status=useWebSearch?'Searching the web…':'Starting local model…';answer='';reasoning='';liveMetrics=null;streamReasoningOpen=false;render();
  const chatScroll=document.querySelector('#chat-scroll');
  if(chatScroll)chatScroll.scrollTop=chatScroll.scrollHeight;
  await generateResponse(active,turns.length-1,useWebSearch,()=>{turns.pop();pendingFiles=attachments;drafts.set(draftKey(),typed);});
});
async function generateResponse(active,promptIndex,useWebSearch,onEmpty,replaceIndex=null){
  const history=turns.slice(0,promptIndex+1).map(normalizeReasoning).filter(turn=>turn.content?.trim()).slice(-35).map(turn=>({role:turn.role,content:turn.content,
    files:(turn.attachments||[]).map(file=>file.id)}));
  let accepted=false;
  const data=await perform('chat',active.id,history,useWebSearch);
  if(replaceIndex!==null&&(!data||data.stopped)){
    if(liveMetrics)(turns[replaceIndex].previousMetrics??=[]).push(liveMetrics);
    tell(data?.stopped?'Regeneration stopped. Previous response kept.':(notice.textContent?notice.textContent+' ':'')+'Previous response kept.');
  }else if(data?.answer||answer||data?.reasoning||reasoning){
    const reply={role:'assistant',content:data?.answer||answer,reasoning:data?.reasoning||reasoning,
      reasoningOpen:streamReasoningOpen,finishReason:data?.finishReason||(data?.stopped?'cancelled':!data?'interrupted':null),
      shortened:data?.shortened,sources:data?.sources,metrics:data?.metrics||liveMetrics,modelId:active.id,generatedAt:Date.now()};
    if(replaceIndex!==null){
      const previous=turns[replaceIndex];
      reply.previousMetrics=[...(previous.previousMetrics||[]),...(previous.metrics?[previous.metrics]:[])];
      turns[replaceIndex]=reply;
    }else turns.push(reply);
    accepted=true;
  }else if(!data?.stopped)onEmpty?.();
  thinking=false;regeneratingIndex=null;saveConversation();render();
  const area=document.querySelector('#chat-scroll');if(area&&replaceIndex===null)area.scrollTop=area.scrollHeight;
  document.querySelector('#prompt')?.focus();
  return accepted;
}
async function regenerateResponse(index){
  if(chatBusy()||!Number.isInteger(index)||!turns[index])return;
  const active=activeChatModel();if(!active){tell('Select a downloaded model first.');return;}
  let promptIndex=turns[index].role==='user'?index:index-1;
  while(promptIndex>=0&&turns[promptIndex].role!=='user')promptIndex--;
  if(promptIndex<0)return;
  const replaceIndex=turns[promptIndex+1]?.role==='assistant'?promptIndex+1:null;
  if(replaceIndex===null&&promptIndex!==turns.length-1){tell('Regenerate the response below this prompt.');return;}
  editingIndex=null;editingDraft='';
  thinking=true;regeneratingIndex=replaceIndex;status='Regenerating response…';answer='';reasoning='';liveMetrics=null;streamReasoningOpen=false;
  render();
  await generateResponse(active,promptIndex,Boolean(turns[promptIndex].webSearch),null,replaceIndex);
}

function cancelMessageEdit(){
  const index=editingIndex;editingIndex=null;editingDraft='';render();
  root.querySelector('[data-action="edit-message:'+index+'"]')?.focus();
}
async function resendEditedMessage(index){
  if(chatBusy()||editingIndex!==index||turns[index]?.role!=='user')return;
  const typed=editingDraft.trim();if(!typed)return;
  const active=activeChatModel();if(!active){tell('Select a downloaded model first.');return;}
  const useWebSearch=webCommand.test(typed);
  if(useWebSearch&&!hasPlugin('internet-search')){tell('Install Internet Search to resend a web search.');return;}
  const content=useWebSearch?typed.replace(webCommand,'$1').trim():typed;
  if(!content){tell('Type a question after /web-search.');return;}
  const previous=turns[index];
  const replaceIndex=turns[index+1]?.role==='assistant'?index+1:null;
  if(replaceIndex===null&&index!==turns.length-1){tell('This message has no response to replace.');return;}
  turns[index]={...previous,content,webSearch:useWebSearch};
  editingIndex=null;editingDraft='';thinking=true;regeneratingIndex=replaceIndex;
  status='Responding to your edited message…';answer='';reasoning='';liveMetrics=null;streamReasoningOpen=false;render();
  const accepted=await generateResponse(active,index,useWebSearch,null,replaceIndex);
  if(!accepted){
    turns[index]=previous;editingIndex=index;editingDraft=typed;saveConversation();render();
    root.querySelector('[data-message-editor]')?.focus();
  }
}

api.onEngine(status=>{
  if (!state || !Object.hasOwn(engineLabels,status)) return;
  state.engineStatus=status;
  updateEngineStatus(status);
  syncEngineMenu();
});
api.onEngineModel?.(view=>{
  if(!state||!Object.hasOwn(engineLabels,view.status))return;
  state.engineModelId=view.id;state.engineStatus=view.status;
  updateEngineStatus(view.status);syncEngineMenu();
});
api.onChat(delta=>{status=delta.status??status;answer=delta.answer??answer;reasoning=delta.reasoning??reasoning;liveMetrics=delta.metrics??liveMetrics;showStream();updateChatStats();});
api.onScan(value=>{
  if(!state)return;state.scan=value;window.PowerBrixActivity?.update(state);
  const label=document.querySelector('#scan-status');
  if(label&&value)label.textContent=value;else render();
});
function updatePullProgress(value) {
  if (!state) return;
  const previous = state.pull;
  state.pull = value;
  window.PowerBrixActivity?.update(state);
  // Keep the scrolling container, hovered sidebar and focused controls alive on each progress tick.
  if (value && previous?.id === value.id) {
    const row = [...root.querySelectorAll('[data-model-id]')].find(row=>row.dataset.modelId === value.id);
    const progress = row?.querySelector('progress');
    const label = row?.querySelector('[data-download-status]');
    if (progress && label) {
      const percent = value.total ? Math.min(100, Math.floor(value.loaded / value.total * 100)) : 0;
      progress.value = percent;
      label.textContent = 'Downloading · '+percent+'% · File '+value.file+'/'+value.files;
      return;
    }
    // Other pages have no download row to update, so leave their UI alone.
    if (!row) return;
  }
  render();
}
api.onPull(updatePullProgress);
api.state().then(data=>{state=data;if(historyOn())readHistory();page=demo?'models':state.onboarded&&state.report?.machine?'chat':'setup';render();}).catch(error=>{tell(error);root.textContent='PowerBrix Launcher could not load.';});

const skillDialog = document.querySelector('#skill-dialog');
const skillForm = document.querySelector('#skill-form');
const skillError = document.querySelector('#skill-error');
let skillSource = 'text';

function setSkillSource(mode) {
  skillSource = mode;
  for (const button of skillForm.querySelectorAll('[data-skill-mode]')) {
    button.setAttribute('aria-pressed',String(button.dataset.skillMode === mode));
  }
  for (const field of skillForm.querySelectorAll('[data-skill-input]')) {
    field.hidden = field.dataset.skillInput !== mode;
  }
  skillError.textContent = '';
}

function openSkillDialog() {
  if (chatBusy()) return;
  skillForm.reset();
  document.querySelector('#skill-filename').textContent = '';
  setSkillSource('text');
  skillDialog.showModal();
}

skillForm.addEventListener('click',event=>{
  const mode = event.target.closest('[data-skill-mode]')?.dataset.skillMode;
  if(mode) setSkillSource(mode);
});
document.querySelector('#choose-skill-file').addEventListener('click',()=>skillForm.elements.markdown.click());
skillForm.elements.markdown.addEventListener('change',()=>{
  document.querySelector('#skill-filename').textContent = skillForm.elements.markdown.files[0]?.name ?? '';
  skillError.textContent = '';
});
document.querySelector('#cancel-skill').addEventListener('click',()=>skillDialog.close());
skillDialog.addEventListener('close',()=>document.querySelector('[data-action="new-skill"]')?.focus());
skillForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const saveButton = event.submitter ?? skillForm.querySelector('[type="submit"]');
  if (saveButton.disabled) return;
  saveButton.disabled = true;
  skillError.textContent = '';
  try {
    let content = skillForm.elements.content.value;
    if (skillSource === 'file') {
      const file = skillForm.elements.markdown.files[0];
      if (!file || !/\.md$/i.test(file.name)) throw Error('Choose a Markdown (.md) file.');
      if (file.size > 64000) throw Error('Choose a Markdown file under 64 KB.');
      content = await file.text();
    }
    const result = await api.manageSkill('create',{name:skillForm.elements.name.value,content});
    state.skills = result.skills;
    skillDialog.close();
    render();
  } catch (error) {
    skillError.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /,'');
  } finally {saveButton.disabled = false;}
});
