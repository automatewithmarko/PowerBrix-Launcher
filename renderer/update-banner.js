{
  const banner = document.querySelector('#update-banner');
  const api = window.infer;
  let state;

  function draw(view) {
    state = view;
    banner.hidden = !(view.welcome || view.available || view.progress || view.error);
    if (banner.hidden) return;
    banner.replaceChildren();
    const message = document.createElement('div');
    message.className = 'update-message';
    message.setAttribute('role','status');
    const title = document.createElement('strong');
    const details = document.createElement('span');
    message.append(title,details);
    banner.append(message);

    if (view.progress) {
      const {phase,percent} = view.progress;
      title.textContent = phase==='installing' ? 'Installing update and restarting…' : 'Downloading update…';
      details.textContent = 'Version '+view.available.version+(phase==='downloading'?' · '+percent+'%':'');
      const progress = document.createElement('progress');
      progress.max=100;
      if(phase==='downloading')progress.value=percent;
      progress.className='update-progress';
      progress.setAttribute('aria-label','Update progress');
      banner.append(progress);
      return;
    }
    if (view.error) {
      title.textContent = 'Update could not finish';
      details.textContent = view.error;
    } else if (view.welcome) {
      title.textContent = 'Congratulations! You’re now on version '+view.version+'.';
    } else {
      title.textContent = 'New update available';
      details.textContent = view.available.name+' · Version '+view.available.version;
    }

    const welcome = view.welcome && !view.error;
    if (view.available && !welcome) {
      const action = document.createElement('button');
      action.className='update-download';
      action.textContent='Download and restart';
      action.addEventListener('click',async()=>{
        action.disabled=true;
        try {await api.installUpdate();}
        catch(error){draw({...state,error:error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')});}
        finally{action.disabled=false;}
      });
      banner.append(action);
    }
    if (welcome || view.error) {
      const close=document.createElement('button');
      close.className='update-close';
      close.textContent='×';
      close.setAttribute('aria-label','Close update notification');
      close.addEventListener('click',()=>api.dismissUpdate().catch(()=>{}));
      banner.append(close);
    }
  }

  api.onUpdate(draw);
  api.updates().then(draw).catch(()=>{});
}
