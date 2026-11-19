const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {LocalEngine}=require('../engine.cjs');

async function chatServer(t,body) {
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    requests.push(JSON.parse(raw));
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    // Split events inside JSON, just as real network chunks can arrive.
    for(let start=0;start<body.length;start+=13)res.write(body.slice(start,start+13));
    res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const engine=new LocalEngine(()=>{});
  engine.current={base:'http://127.0.0.1:'+server.address().port,key:'test-key',model:'qwen',maxTokens:4096};
  return {engine,requests};
}
const event=choice=>'data: '+JSON.stringify({choices:[choice]})+'\n\n';

test('streaming keeps reasoning and a complete answer separate with an adequate output budget',async t=>{
  const {engine,requests}=await chatServer(t,event({delta:{reasoning_content:'Think carefully.'}})
    +event({delta:{content:'Here is the complete answer.'}})+event({delta:{},finish_reason:'stop'})+'data: [DONE]\n\n');
  const updates=[];
  const result=await engine.chat([{role:'user',content:'Explain this'}],AbortSignal.timeout(3000),delta=>updates.push(delta));
  assert.deepEqual(result,{answer:'Here is the complete answer.',reasoning:'Think carefully.',finishReason:'stop'});
  assert.equal(requests[0].max_tokens,4096);
  assert.equal(requests[0].reasoning_format,'deepseek');
  assert.equal(updates.at(-1).reasoning,'Think carefully.');
});
test('a length-limited response is reported instead of silently presented as complete',async t=>{
  const {engine}=await chatServer(t,event({delta:{reasoning:'Planning'}})+event({delta:{content:'An unfinished'}})
    +'data: '+JSON.stringify({choices:[{delta:{},finish_reason:'length'}]}));
  assert.deepEqual(await engine.chat([{role:'user',content:'Explain'}],AbortSignal.timeout(3000),()=>{}),
    {answer:'An unfinished',reasoning:'Planning',finishReason:'length'});
});
test('an unexpectedly closed stream preserves text and marks it interrupted',async t=>{
  const {engine}=await chatServer(t,event({delta:{content:'Partial response'}}));
  const result=await engine.chat([{role:'user',content:'Explain'}],AbortSignal.timeout(3000),()=>{});
  assert.equal(result.answer,'Partial response');
  assert.equal(result.finishReason,'interrupted');
});
test('ordinary chats trim older context while reserving room for thinking and the answer',async()=>{
  const engine=new LocalEngine(()=>{});
  engine.current={contextTokens:4096,maxTokens:2048};
  engine.tokenizer=async(_route,{content})=>({tokens:Array(content.length).fill(1)});
  const messages=[{role:'user',content:'old '.repeat(500)},{role:'assistant',content:'answer '.repeat(300)},
    {role:'user',content:'New question'}];
  const result=await engine.prepareChatContext(messages,[],[],new AbortController().signal);
  assert.deepEqual(result.messages,[messages[2]]);
  assert.equal(result.shortened,true);
});
test('live engine metadata reaches the UI, including cached prompt tokens and final usage-only events',async t=>{
  const body='data: '+JSON.stringify({choices:[],prompt_progress:{total:200,cache:190,processed:200}})+'\n\n'
    +'data: '+JSON.stringify({choices:[{delta:{content:'Answer'}}],timings:{predicted_n:2,predicted_ms:100}})+'\n\n'
    +'data: '+JSON.stringify({choices:[],usage:{prompt_tokens:200,completion_tokens:3},timings:{predicted_n:3,predicted_ms:150}})+'\n\n'
    +event({delta:{},finish_reason:'stop'})+'data: [DONE]\n\n';
  const {engine,requests}=await chatServer(t,body);engine.current.contextTokens=8192;
  const updates=[];const result=await engine.chat([{role:'user',content:'Explain'}],AbortSignal.timeout(3000),delta=>updates.push(delta));
  assert.equal(result.metrics.generatedTokens,3);assert.equal(result.metrics.promptTokens,200);
  assert.equal(result.metrics.generationMs,150);assert.equal(result.metrics.contextCapacity,8192);
  assert.equal(updates[1].metrics.promptTokens,200);assert.equal(requests[0].stream_options.include_usage,true);
});
test('raw Qwen think tags split across streamed content are extracted before reaching the UI',async t=>{
  const chunks=['<th','ink>Consider gravity.','</thi','nk>\n\nGravity attracts masses.'];
  const {engine}=await chatServer(t,chunks.map(content=>event({delta:{content}})).join('')+event({delta:{},finish_reason:'stop'})+'data: [DONE]\n\n');
  const updates=[];const result=await engine.chat([{role:'user',content:'Explain'}],AbortSignal.timeout(3000),delta=>updates.push(delta));
  assert.equal(result.answer,'Gravity attracts masses.');assert.equal(result.reasoning,'Consider gravity.');
  for(const update of updates){assert.doesNotMatch(update.answer,/<\/?think|<th/i);assert.doesNotMatch(update.reasoning,/<\/?thi/i);}
});
test('context preparation preserves the system instruction while trimming old exchanges',async()=>{
  const engine=new LocalEngine(()=>{});engine.current={contextTokens:4096,maxTokens:2048};
  engine.tokenizer=async(_route,{content})=>({tokens:Array(content.length).fill(1)});
  const system={role:'system',content:'Keep the response concise.'};
  const result=await engine.prepareChatContext([system,{role:'user',content:'old '.repeat(500)},{role:'assistant',content:'reply '.repeat(300)},{role:'user',content:'Question'}],[],[],new AbortController().signal);
  assert.equal(result.messages[0],system);assert.equal(result.messages.at(-1).content,'Question');assert.equal(result.messages.length,2);
});
