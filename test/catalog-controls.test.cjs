const {test}=require('node:test');const assert=require('node:assert/strict');
const {filterModels,sizeLabel,downloadLabel,parameterFilters}=require('../renderer/catalog-controls.js');
const rows=[{id:'blocked-fast',name:'Blocked 35B',vendor:'Qwen',bytes:90,speed:100,pullable:false,fit:'Needs more storage'},
{id:'slow',name:'Small 3B',vendor:'Meta',bytes:20,speed:5,pullable:true},
{id:'fast',name:'Tiny 1B',vendor:'Google',bytes:10,speed:50,pullable:true},
{id:'installed',name:'Installed 7B',vendor:'Qwen',bytes:30,speed:20,local:true,pullable:false},
{id:'unknown',name:'Unknown',vendor:'Meta',bytes:100,speed:null,pullable:true}];
test('available models are fastest first, unavailable models remain last regardless of speed',()=>{
 assert.deepEqual(filterModels(rows).map(row=>row.id),['fast','installed','slow','unknown','blocked-fast']);
 assert.equal(rows[0].id,'blocked-fast');
});
test('provider and advertised parameter filters compose and memory sort uses weight bytes',()=>{
 assert.deepEqual(filterModels(rows,{provider:'Qwen'}).map(row=>row.id),['installed','blocked-fast']);
 assert.deepEqual(filterModels(rows,{parameters:'3'}).map(row=>row.id),['installed','slow','blocked-fast']);
 assert.deepEqual(filterModels(rows,{provider:'Qwen',parameters:'10'}).map(row=>row.id),['blocked-fast']);
 assert.deepEqual(filterModels(rows,{sort:'memory-desc'}).map(row=>row.id),['unknown','installed','slow','fast','blocked-fast']);
 assert.deepEqual(filterModels(rows,{sort:'memory-asc'}).map(row=>row.id),['fast','slow','installed','unknown','blocked-fast']);
});
test('parameter labels are explicit and disabled buttons explain the actual capacity restriction',()=>{
 assert.equal(sizeLabel({name:'Gemma 4 E4B',parameterCount:7463013674}),'7.46B');assert.equal(sizeLabel({name:'Qwen3.6 35B A3B'}),'35B');assert.equal(sizeLabel({name:'Kimi K2.5',parameterCount:1026408232448}),'1.03T');
 assert.equal(downloadLabel({fit:'Needs more storage'}),'Not enough storage');assert.equal(downloadLabel({fit:'Needs more memory'}),'Not enough memory');assert.equal(downloadLabel({resumed:true}),'Resume');
});

test('requested minimum parameter thresholds use B and T labels',()=>{
 assert.deepEqual(parameterFilters.map(option=>option[1]),['All sizes','Under 1B','1B+','3B+','5B+','10B+','35B+','100B+','1T+']);
 const catalog=require('../catalog.json');
 for(const model of catalog){
  assert.ok(Number.isSafeInteger(model.parameterCount)&&model.parameterCount>0,model.id);
  assert.ok(model.parameterSource.includes('/revision/'+model.revision),model.id);
  assert.match(sizeLabel(model),/^[0-9.]+[BT]$/,model.id);
 }
 assert.ok(filterModels(catalog,{parameters:'under-1'}).every(model=>model.parameterCount<1e9));
 assert.equal(filterModels(catalog,{parameters:'under-1'}).length,2);
 for(const threshold of ['1','3','5','10','35','100','1000']){
  const selected=filterModels(catalog,{parameters:threshold});
  assert.ok(selected.length>0);
  assert.equal(selected.length,catalog.filter(model=>model.parameterCount>=Number(threshold)*1e9).length);
  assert.ok(selected.every(model=>model.parameterCount>=Number(threshold)*1e9));
 }
 assert.equal(sizeLabel({parameterCount:999885952}),'0.9999B');
});
