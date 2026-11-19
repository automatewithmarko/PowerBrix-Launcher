const {test}=require('node:test');const assert=require('node:assert/strict');
const {parseReasoning}=require('../renderer/reasoning.js');
test('leading raw thought blocks become expandable reasoning rather than answer text',()=>{
  assert.deepEqual(parseReasoning('<think>Work through this.</think>\n\nThe answer.','',true),{answer:'The answer.',reasoning:'Work through this.'});
});
test('streamed tag fragments never leak into the answer or thought text',()=>{
  const chunks=['<th','ink>Work ','through this.</thi','nk>\nThe answer.'];let raw='';
  for(let n=0;n<chunks.length;n++){
    raw+=chunks[n];const parsed=parseReasoning(raw);
    assert.doesNotMatch(parsed.answer,/<\/?th/i);assert.doesNotMatch(parsed.reasoning,/<\/?th/i);
    if(n<3)assert.equal(parsed.answer,'');
  }
});
test('unfinished thoughts remain reasoning and quoted tags inside an answer remain literal',()=>{
  assert.deepEqual(parseReasoning('<think>Still thinking','',true),{answer:'',reasoning:'Still thinking'});
  assert.equal(parseReasoning('Example code: `<think>` is a tag.','',true).answer,'Example code: `<think>` is a tag.');
  assert.deepEqual(parseReasoning('<think>Same thought</think>Answer','Same thought',true),{answer:'Answer',reasoning:'Same thought'});
});
