const {test}=require('node:test');const assert=require('node:assert/strict');
const {filterModels,sizeLabel,downloadLabel}=require('../renderer/catalog-controls.js');
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
 assert.equal(filterModels(rows,{parameters:'3B'})[0].id,'slow');
 assert.equal(filterModels(rows,{parameters:'Not listed'})[0].id,'unknown');
 assert.deepEqual(filterModels(rows,{sort:'memory-desc'}).map(row=>row.id),['unknown','installed','slow','fast','blocked-fast']);
 assert.deepEqual(filterModels(rows,{sort:'memory-asc'}).map(row=>row.id),['fast','slow','installed','unknown','blocked-fast']);
});
test('parameter labels are explicit and disabled buttons explain the actual capacity restriction',()=>{
 assert.equal(sizeLabel({name:'Gemma 4 E4B'}),'E4B');assert.equal(sizeLabel({name:'Qwen3.6 35B A3B'}),'35B');assert.equal(sizeLabel({name:'Kimi K2.5'}),'Not listed');
 assert.equal(downloadLabel({fit:'Needs more storage'}),'Not enough storage');assert.equal(downloadLabel({fit:'Needs more memory'}),'Not enough memory');assert.equal(downloadLabel({resumed:true}),'Resume');
});
