(() => {
  const dialog=document.createElement('dialog');
  dialog.id='activity-overlay';dialog.setAttribute('aria-labelledby','activity-title');
  dialog.innerHTML=`<div class="activity-card">
    <header class="activity-heading"><span class="activity-kicker">A MOMENT FOR YOU</span><button type="button" class="activity-dismiss" aria-label="Keep browsing">×</button></header>
    <section class="activity-invitation"><div class="activity-blocks" aria-hidden="true"><i></i><i></i><i></i><i></i></div><h2 id="activity-title">A little Tetris?</h2><p>Your AI is getting ready. Make the wait your next high score.</p><button type="button" class="btn primary" id="activity-play">Play Tetris <span aria-hidden="true">↗</span></button></section>
    <section class="activity-game" hidden aria-label="Tetris game"><div class="activity-board-wrap"><canvas width="240" height="480" tabindex="0" aria-label="Tetris board. Arrow keys move and rotate, Space drops, P pauses."></canvas><div class="activity-game-state" hidden><strong></strong><button type="button" class="btn primary compact" id="activity-resume">Resume</button></div></div>
      <aside class="activity-score"><span class="activity-kicker">TETRIS</span><label>Score<strong id="activity-score">0</strong></label><label>Best<strong id="activity-best">0</strong></label><label>Lines<strong id="activity-lines">0</strong></label><label>Next<canvas width="96" height="64" aria-label="Next piece"></canvas></label><button type="button" class="btn secondary compact" id="activity-pause-game">Pause game</button><p>← → Move<br>↑ Rotate · ↓ Soft drop<br>Space Drop · P Pause</p></aside>
      <div class="activity-touch" aria-label="Game controls"><button type="button" data-game="left" aria-label="Move left">←</button><button type="button" data-game="rotate" aria-label="Rotate">↻</button><button type="button" data-game="right" aria-label="Move right">→</button><button type="button" data-game="down" aria-label="Soft drop">↓</button><button type="button" data-game="drop">Drop</button></div>
    </section>
    <section class="activity-progress" aria-label="Background task"><div class="activity-progress-heading"><strong id="activity-task"></strong><span id="activity-percent"></span></div><p id="activity-status" role="status"></p><progress max="100" aria-label="Background task progress"></progress><small id="activity-detail"></small></section>
    <footer><button type="button" class="activity-browse">Keep browsing</button><button type="button" id="activity-pause-download" hidden>Pause download</button></footer>
  </div>`;
  document.body.append(dialog);
  const mini=document.createElement('button');mini.type='button';mini.className='activity-mini';mini.hidden=true;document.body.append(mini);
  const find=selector=>dialog.querySelector(selector);
  const board=find('.activity-game canvas');const ctx=board.getContext('2d');
  const preview=find('.activity-score canvas');const previewCtx=preview.getContext('2d');
  let task=null,job=null,dismissed=false,game=null,playing=false,paused=false,frame=null,lastDrop=0,lastTime=0,best=0;
  try{best=Number(localStorage.getItem('powerbrix-tetris-best'))||0;}catch{}
  const colors=['','#c4a2ff','#e3ccff','#9f79f4','#9cbfff','#e7a9d9','#ad98f6','#c9d6ff'];
  const bytes=n=>{if(!Number.isFinite(n))return '';return n>=2**30?(n/2**30).toFixed(1)+' GB':(n/2**20).toFixed(0)+' MB';};
  function block(context,x,y,color,size=24,ghost=false){context.fillStyle=ghost?'#cab0ff17':color;context.fillRect(x*size+1,y*size+1,size-2,size-2);context.strokeStyle=ghost?'#cab0ff65':'#ffffff28';context.strokeRect(x*size+1.5,y*size+1.5,size-3,size-3);}
  function draw(){
    if(!game)return;ctx.clearRect(0,0,240,480);ctx.fillStyle='#120d20';ctx.fillRect(0,0,240,480);
    ctx.strokeStyle='#ffffff07';for(let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*24,0);ctx.lineTo(x*24,480);ctx.stroke();}for(let y=0;y<=20;y++){ctx.beginPath();ctx.moveTo(0,y*24);ctx.lineTo(240,y*24);ctx.stroke();}
    game.board.forEach((row,y)=>row.forEach((id,x)=>{if(id)block(ctx,x,y,colors[id]);}));
    const ghost=game.ghostY();game.piece.shape.forEach((row,y)=>row.forEach((cell,x)=>{if(cell){block(ctx,game.piece.x+x,ghost+y,colors[game.piece.id],24,true);block(ctx,game.piece.x+x,game.piece.y+y,colors[game.piece.id]);}}));
    previewCtx.clearRect(0,0,96,64);game.preview().forEach((row,y)=>row.forEach((cell,x)=>{if(cell)block(previewCtx,x,y,colors[game.next+1],20);}));
    find('#activity-score').textContent=game.score.toLocaleString();find('#activity-lines').textContent=game.lines;
    if(game.score>best){best=game.score;try{localStorage.setItem('powerbrix-tetris-best',String(best));}catch{}}
    find('#activity-best').textContent=best.toLocaleString();
    const stopped=game.over||paused;find('.activity-game-state').hidden=!stopped;
    find('.activity-game-state strong').textContent=game.over?'Nice run. One more?':'Game paused';
    find('#activity-resume').textContent=game.over?'Play again':'Resume';
    find('#activity-pause-game').textContent=paused?'Resume game':'Pause game';
  }
  function stopClock(){if(frame!==null)cancelAnimationFrame(frame);frame=null;lastTime=0;}
  function tick(time){
    frame=null;if(!playing||paused||game.over||!dialog.open||document.hidden)return;
    if(lastTime)lastDrop+=Math.min(time-lastTime,100);lastTime=time;
    if(lastDrop>=Math.max(110,750-Math.floor(game.lines/10)*60)){lastDrop=0;game.down();draw();}
    frame=requestAnimationFrame(tick);
  }
  function startClock(){stopClock();if(playing&&!paused&&!game.over&&dialog.open&&!document.hidden)frame=requestAnimationFrame(tick);}
  function pause(){if(!playing||game.over)return;paused=!paused;draw();startClock();}
  function hide(){if(task?.kind==='preview'){window.PowerBrixActivity.update({});return;}dismissed=true;if(playing&&!game.over)paused=true;stopClock();dialog.close();mini.hidden=!task;draw();}
  function open(){if(!task)return;dismissed=false;mini.hidden=true;if(!dialog.open)dialog.showModal();if(playing)board.focus();else find('#activity-play').focus();draw();startClock();}
  function action(name){if(!playing||paused||game.over)return;({left:()=>game.move(-1),right:()=>game.move(1),rotate:()=>game.rotate(),down:()=>game.down(true),drop:()=>game.drop()})[name]?.();draw();}
  find('#activity-play').addEventListener('click',()=>{game=new window.PowerBrixTetris();playing=true;paused=false;lastDrop=0;find('.activity-invitation').hidden=true;find('.activity-game').hidden=false;dialog.classList.add('is-playing');draw();board.focus();startClock();});
  find('#activity-resume').addEventListener('click',()=>{if(game.over){game.reset();lastDrop=0;}paused=false;draw();board.focus();startClock();});
  find('#activity-pause-game').addEventListener('click',()=>{pause();board.focus();});
  dialog.addEventListener('keydown',event=>{
    if(!playing||event.target!==board)return;
    const keys={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'rotate',ArrowDown:'down',' ':'drop'};
    if(keys[event.key]){event.preventDefault();event.stopPropagation();action(keys[event.key]);}
    if(event.key.toLowerCase()==='p'){event.preventDefault();pause();}
  });
  dialog.querySelectorAll('[data-game]').forEach(button=>button.addEventListener('click',()=>{action(button.dataset.game);board.focus();}));
  dialog.querySelectorAll('.activity-dismiss,.activity-browse').forEach(button=>button.addEventListener('click',hide));
  dialog.addEventListener('cancel',event=>{event.preventDefault();hide();});mini.addEventListener('click',open);
  find('#activity-pause-download').addEventListener('click',async()=>{const button=find('#activity-pause-download');button.disabled=true;try{await window.infer.pause();}catch{button.disabled=false;find('#activity-status').textContent='Could not pause the download. Try again.';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&!game.over){paused=true;stopClock();draw();}});
  window.addEventListener('pagehide',stopClock);
  window.PowerBrixActivity={preview(){this.update({preview:true});},update(state){
    const next=state?.preview?{key:'preview',kind:'preview',title:'Waiting screen preview',status:'Demo only. No analysis or download is running.'}:state?.scan?{key:'scan',kind:'scan',title:'Analyzing your system',status:state.scan}:state?.pull?{key:'pull:'+state.pull.id,kind:'pull',title:'Downloading '+(state.models?.find(model=>model.id===state.pull.id)?.name||'your model'),status:state.pull.total?'Your model is downloading. Everything stays on this computer.':'Preparing your download…',...state.pull}:null;
    task=next;
    if(!next){stopClock();dialog.close();mini.hidden=true;job=null;dismissed=false;playing=false;game=null;return;}
    if(job!==next.key){job=next.key;dismissed=false;playing=false;paused=false;game=null;stopClock();find('.activity-invitation').hidden=false;find('.activity-game').hidden=true;dialog.classList.remove('is-playing');find('#activity-pause-download').disabled=false;}
    const percent=next.total?Math.min(100,Math.max(0,Math.floor(next.loaded/next.total*100))):null;
    find('#activity-task').textContent=next.title;find('#activity-status').textContent=next.status;
    find('#activity-percent').textContent=percent===null?'':percent+'%';
    const progress=find('progress');if(percent===null)progress.removeAttribute('value');else progress.value=percent;
    find('#activity-detail').textContent=next.kind==='preview'?'Try the game at your own pace. Close this preview when you’re done.':next.kind==='scan'?'Checking your processor, memory, graphics and storage.':next.total?bytes(next.loaded)+' of '+bytes(next.total)+(next.files>1?' · File '+next.file+' of '+next.files:''):'Downloads keep running while you play.';
    find('#activity-pause-download').hidden=next.kind!=='pull';
    find('.activity-browse').textContent=next.kind==='preview'?'Close preview':'Keep browsing';
    mini.textContent=(next.kind==='scan'?'Analyzing system':percent===null?'Preparing download':'Downloading · '+percent+'%')+' · Play Tetris';
    if(!dismissed&&!dialog.open)open();
  }};
})();
