(function(scope){
  function parameterSize(model){
    if(Number.isFinite(model.parametersB)&&model.parametersB>0)return model.parametersB+'B';
    const match=model.name?.match(/\b(E?\d+(?:\.\d+)?)B\b/i);return match?match[1].toUpperCase()+'B':null;
  }
  // Read explicit size labels from the catalog, without guessing counts from quantized file size.
  function sizeLabel(model){const label=parameterSize(model);return label||'Not listed';}
  function filterModels(models,{provider='all',parameters='all',sort='speed'}={}){
    return models.filter(model=>(provider==='all'||model.vendor===provider)&&(parameters==='all'||sizeLabel(model)===parameters)).sort((a,b)=>{
      const availability=Number(Boolean(b.local||b.pullable))-Number(Boolean(a.local||a.pullable));if(availability)return availability;
      if(sort==='memory-asc'||sort==='memory-desc'){const difference=(a.bytes||0)-(b.bytes||0);if(difference)return sort==='memory-asc'?difference:-difference;}
      else{const rate=model=>Number.isFinite(model.speed)&&model.speed>=0?model.speed:-Infinity;const difference=rate(b)-rate(a);if(difference&&!Number.isNaN(difference))return difference;}
      return a.name.localeCompare(b.name);
    });
  }
  function downloadLabel(model){return model.fit==='Needs more storage'?'Not enough storage':model.fit==='Needs more memory'?'Not enough memory':model.resumed?'Resume':'Pull';}
  const api={sizeLabel,filterModels,downloadLabel};if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.PowerBrixCatalog=api;
})(globalThis);
