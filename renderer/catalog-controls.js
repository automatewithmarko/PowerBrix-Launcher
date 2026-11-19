(function(scope){
  const parameterFilters=[['all','All sizes'],['under-1','Under 1B'],['1','1B+'],['3','3B+'],['5','5B+'],['10','10B+'],['35','35B+'],['100','100B+'],['1000','1T+']];
  function parameterBillions(model){
    if(Number.isFinite(model.parameterCount)&&model.parameterCount>0)return model.parameterCount/1e9;
    if(Number.isFinite(model.parametersB)&&model.parametersB>0)return model.parametersB;
    const match=model.name?.match(/\b(\d+(?:\.\d+)?)B\b/i);return match?Number(match[1]):null;
  }
  function sizeLabel(model){
    const billions=parameterBillions(model);if(billions===null)return '';
    const value=billions>=1000?billions/1000:billions;
    const rounded=value<1&&Number(value.toFixed(2))>=1?value.toFixed(4):value.toFixed(2);
    return Number(rounded)+(billions>=1000?'T':'B');
  }
  function matchesParameters(model,filter){
    if(filter==='all')return true;const size=parameterBillions(model);if(size===null)return false;
    return filter==='under-1'?size<1:size>=Number(filter);
  }
  function filterModels(models,{provider='all',parameters='all',sort='speed'}={}){
    return models.filter(model=>(provider==='all'||model.vendor===provider)&&matchesParameters(model,parameters)).sort((a,b)=>{
      const availability=Number(Boolean(b.local||b.pullable))-Number(Boolean(a.local||a.pullable));if(availability)return availability;
      if(sort==='memory-asc'||sort==='memory-desc'){const difference=(a.bytes||0)-(b.bytes||0);if(difference)return sort==='memory-asc'?difference:-difference;}
      else{const rate=model=>Number.isFinite(model.speed)&&model.speed>=0?model.speed:-Infinity;const difference=rate(b)-rate(a);if(difference&&!Number.isNaN(difference))return difference;}
      return a.name.localeCompare(b.name);
    });
  }
  function downloadLabel(model){return model.fit==='Needs more storage'?'Not enough storage':model.fit==='Needs more memory'?'Not enough memory':model.resumed?'Resume':'Pull';}
  const api={sizeLabel,parameterBillions,parameterFilters,filterModels,downloadLabel};if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.PowerBrixCatalog=api;
})(globalThis);
