const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes,randomUUID,timingSafeEqual}=require('node:crypto');
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
function validateRequest(body){
  if(!body||typeof body!=='object'||typeof body.model!=='string'||body.model.length>120)throw new ApiError(400,'Choose an installed model ID.');
  if(!Array.isArray(body.messages)||!body.messages.length||body.messages.length>40)throw new ApiError(400,'Provide between 1 and 40 text messages.');
  const messages=body.messages.map((message,index)=>{
    if(!message||!['system','user','assistant'].includes(message.role)||message.role==='system'&&index!==0||typeof message.content!=='string'||!message.content.trim()||message.content.length>24000)throw new ApiError(400,'Messages must contain text. A system message is allowed only at the beginning.');
    return {role:message.role,content:message.content};
  });
  if(messages.at(-1).role!=='user')throw new ApiError(400,'The last message must be from the user.');
  if(body.stream!==undefined&&typeof body.stream!=='boolean')throw new ApiError(400,'stream must be true or false.');
  const options={};
  if(body.max_tokens!==undefined){if(!Number.isInteger(body.max_tokens)||body.max_tokens<1||body.max_tokens>4096)throw new ApiError(400,'max_tokens must be between 1 and 4096.');options.max_tokens=body.max_tokens;}
  if(body.temperature!==undefined){if(!Number.isFinite(body.temperature)||body.temperature<0||body.temperature>2)throw new ApiError(400,'temperature must be between 0 and 2.');options.temperature=body.temperature;}
  if(body.top_p!==undefined){if(!Number.isFinite(body.top_p)||body.top_p<=0||body.top_p>1)throw new ApiError(400,'top_p must be greater than 0 and at most 1.');options.top_p=body.top_p;}
  if(body.tools||body.tool_choice)throw new ApiError(400,'This API currently supports text chat, without tool calls.');
  return {model:body.model,messages,stream:body.stream===true,options};
}
function readBody(request){return new Promise((resolve,reject)=>{
  let chunks=[],size=0,settled=false;
  const timer=setTimeout(()=>finish(new ApiError(408,'Request body took too long.')),15000);timer.unref();
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  request.on('data',chunk=>{if(settled)return;size+=chunk.length;if(size>1024*1024){chunks=[];finish(new ApiError(413,'Request body exceeds 1 MB.'));return;}chunks.push(chunk);});
  request.on('end',()=>{if(settled)return;try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish(new ApiError(400,'Request body must be valid JSON.'));}});
  request.on('error',()=>finish(new ApiError(400,'Request was interrupted.')));
});}
class LocalApi{
  constructor(root,{listModels,complete}){this.file=path.join(root,'local-api.json');this.listModels=listModels;this.complete=complete;this.server=null;this.config=null;this.pending=new Set();}
  async save(config){await fs.writeFile(this.file+'.tmp',JSON.stringify(config),{mode:0o600});await fs.chmod(this.file+'.tmp',0o600);await fs.rename(this.file+'.tmp',this.file);}
  async start(){
    if(this.server?.listening)return this.info();
    let saved;try{saved=JSON.parse(await fs.readFile(this.file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Could not read the local API configuration.');}
    this.config={key:/^pbx_[a-f0-9]{64}$/.test(saved?.key||'')?saved.key:'pbx_'+randomBytes(32).toString('hex'),port:Number.isInteger(saved?.port)&&saved.port>0&&saved.port<=65535?saved.port:38473};
    const server=http.createServer((req,res)=>{void this.handle(req,res);});this.server=server;
    server.requestTimeout=30000;server.headersTimeout=15000;server.maxHeadersCount=30;
    const listen=port=>new Promise((resolve,reject)=>{const fail=error=>{server.off('listening',ready);reject(error);};const ready=()=>{server.off('error',fail);resolve();};server.once('error',fail);server.once('listening',ready);server.listen(port,'127.0.0.1');});
    try{try{await listen(this.config.port);}catch(error){if(error.code!=='EADDRINUSE')throw error;await listen(0);}this.config.port=server.address().port;await this.save(this.config);}
    catch(error){server.close();this.server=null;throw Error('The local API could not start. '+error.message);}
    return this.info();
  }
  info(){return {key:this.config?.key||'',baseUrl:this.server?.listening?'http://127.0.0.1:'+this.config.port+'/v1':null,running:Boolean(this.server?.listening)};}
  async regenerate(){const next={...this.config,key:'pbx_'+randomBytes(32).toString('hex')};await this.save(next);this.config=next;return this.info();}
  async close(){for(const controller of this.pending)controller.abort();if(this.server){this.server.closeAllConnections();await new Promise(resolve=>this.server.close(resolve));this.server=null;}}
  async handle(request,response){
    response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
    const json=(status,value)=>{response.statusCode=status;response.setHeader('Content-Type','application/json');response.end(JSON.stringify(value));};
    let controller;
    try{
      if(request.headers.origin)throw new ApiError(403,'Browser cross-origin requests are not enabled. Use a local server, script or API client.');
      const token=request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1]||'';
      const actual=Buffer.from(token),expected=Buffer.from(this.config.key);
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new ApiError(401,'A valid Bearer API key is required.');
      const pathname=new URL(request.url,'http://127.0.0.1').pathname;
      if(pathname==='/v1/models'&&request.method==='GET')return json(200,{object:'list',data:(await this.listModels()).map(model=>({id:model.id,object:'model',created:0,owned_by:'powerbrix',name:model.name}))});
      if(pathname!=='/v1/chat/completions')throw new ApiError(404,'Endpoint not found.');
      if(request.method!=='POST')throw new ApiError(405,'Use POST for chat completions.');
      if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']||''))throw new ApiError(415,'Use Content-Type: application/json.');
      const input=validateRequest(await readBody(request));
      if(!(await this.listModels()).some(model=>model.id===input.model))throw new ApiError(404,'This model is not installed. Download it in the Launcher first.');
      controller=new AbortController();this.pending.add(controller);
      response.on('close',()=>{if(!response.writableEnded)controller.abort();});
      const id='chatcmpl_'+randomUUID(),created=Math.floor(Date.now()/1000);
      const event=value=>{if(response.destroyed||response.writableEnded)return;if(!response.headersSent)response.setHeader('Content-Type','text/event-stream');response.write('data: '+(typeof value==='string'?value:JSON.stringify(value))+'\n\n');};
      let answer='',reasoning='';
      const output=await this.complete(input,controller.signal,delta=>{
        if(!input.stream)return;
        const part={};if(delta.answer?.length>answer.length)part.content=delta.answer.slice(answer.length);if(delta.reasoning?.length>reasoning.length)part.reasoning_content=delta.reasoning.slice(reasoning.length);
        answer=delta.answer??answer;reasoning=delta.reasoning??reasoning;
        if(Object.keys(part).length)event({id,object:'chat.completion.chunk',created,model:input.model,choices:[{index:0,delta:part,finish_reason:null}]});
      });
      if(controller.signal.aborted)throw new ApiError(409,'Generation was stopped. Retry when the engine is available.');
      if(output.finishReason==='interrupted')throw new ApiError(502,'The model response was interrupted.');
      const usage=output.metrics?.generatedTokens!=null&&output.metrics?.promptTokens!=null?{prompt_tokens:output.metrics.promptTokens,completion_tokens:output.metrics.generatedTokens,total_tokens:output.metrics.promptTokens+output.metrics.generatedTokens}:undefined;
      if(input.stream){event({id,object:'chat.completion.chunk',created,model:input.model,choices:[{index:0,delta:{},finish_reason:output.finishReason||'stop'}],...(usage?{usage}:{})});event('[DONE]');response.end();}
      else json(200,{id,object:'chat.completion',created,model:input.model,choices:[{index:0,message:{role:'assistant',content:output.answer,...(output.reasoning?{reasoning_content:output.reasoning}:{})},finish_reason:output.finishReason||'stop'}],...(usage?{usage}:{})});
    }catch(error){
      if(response.destroyed||response.writableEnded)return;
      const status=error.status||500;const message=error.status?error.message:'The local model could not complete the request. Check the Launcher and try again.';
      const body={error:{message,type:status===401?'authentication_error':'invalid_request_error',code:status}};
      if(response.headersSent){response.write('data: '+JSON.stringify(body)+'\n\ndata: [DONE]\n\n');response.end();}else json(status,body);
    }finally{if(controller)this.pending.delete(controller);}
  }
}
module.exports={LocalApi,ApiError,validateRequest};
