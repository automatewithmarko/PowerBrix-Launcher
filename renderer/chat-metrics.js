(function(scope){
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
  function readMetrics(usage={},timings={},capacity) {
    const completions=[count(usage.completion_tokens),count(timings.predicted_n)].filter(value=>value!==null);
    const generatedTokens=completions.length?Math.max(...completions):null;
    const promptTokens=count(usage.prompt_tokens);
    if(generatedTokens===null&&promptTokens===null)return null;
    const generationMs=Number.isFinite(timings.predicted_ms)&&timings.predicted_ms>0?timings.predicted_ms:null;
    return {generatedTokens,promptTokens,contextCapacity:count(capacity),generationMs};
  }
  function summarizeMetrics(metrics) {
    let total=0,timedTokens=0,milliseconds=0,recorded=false,unreported=false;
    for(const metric of metrics){
      const tokens=count(metric?.generatedTokens);
      if(tokens===null){unreported=true;continue;}
      recorded=true;total+=tokens;
      if(tokens>0&&Number.isFinite(metric.generationMs)&&metric.generationMs>0){timedTokens+=tokens;milliseconds+=metric.generationMs;}
    }
    return {total:recorded?total:null,unreported,average:milliseconds>0?timedTokens/(milliseconds/1000):null};
  }
  const api={readMetrics,summarizeMetrics};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.PowerBrixChatMetrics=api;
})(globalThis);
