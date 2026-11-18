const {test}=require('node:test');const assert=require('node:assert/strict');
const {readMetrics,summarizeMetrics}=require('../renderer/chat-metrics.js');
test('metrics use full prompt usage and include all generated tokens',()=>{
  const metric=readMetrics({prompt_tokens:200,completion_tokens:100},{prompt_n:10,predicted_n:100,predicted_ms:1000},8192);
  assert.deepEqual(metric,{promptTokens:200,generatedTokens:100,generationMs:1000,contextCapacity:8192});
});
test('the conversation speed is weighted by decode time rather than averaging rates',()=>{
  const summary=summarizeMetrics([{generatedTokens:100,generationMs:1000},{generatedTokens:300,generationMs:9000}]);
  assert.equal(summary.average,40);assert.equal(summary.total,400);assert.equal(summary.unreported,false);
});
test('unreported timings or legacy replies are not invented',()=>{
  assert.equal(readMetrics({}, {},8192),null);
  const summary=summarizeMetrics([undefined,{generatedTokens:12,generationMs:null}]);
  assert.equal(summary.total,12);assert.equal(summary.average,null);assert.equal(summary.unreported,true);
});
