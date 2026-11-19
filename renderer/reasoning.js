(function(scope){
  // Only leading model thought blocks are special. Tags quoted in an answer or code remain text.
  function splitReasoning(raw='',final=false){
    let text=String(raw),reasoning='',found=false;
    while(true){
      const trimmed=text.trimStart();
      if(/^<think>/i.test(trimmed)){
        found=true;const body=trimmed.slice(7);const end=body.search(/<\/think>/i);
        if(end<0){
          let thought=body;
          if(!final)for(let n=Math.min(7,thought.length);n>0;n--)if('</think>'.startsWith(thought.slice(-n).toLowerCase())){thought=thought.slice(0,-n);break;}
          return {answer:'',reasoning:[reasoning,thought].filter(Boolean).join('\n\n')};
        }
        reasoning=[reasoning,body.slice(0,end).trim()].filter(Boolean).join('\n\n');
        text=body.slice(end+8);continue;
      }
      if(!final&&trimmed&&'<think>'.startsWith(trimmed.toLowerCase()))return {answer:'',reasoning};
      return {answer:found?text.trimStart():text,reasoning};
    }
  }
  function parseReasoning(raw='',explicit='',final=false){
    const parsed=splitReasoning(raw,final);
    const clean=String(explicit).replace(/^\s*<think>\s*/i,'').replace(/\s*<\/think>\s*$/i,'');
    const reasoning=!parsed.reasoning||clean.trim()===parsed.reasoning.trim()?clean||parsed.reasoning:[clean,parsed.reasoning].filter(Boolean).join('\n\n');
    return {...parsed,reasoning};
  }
  const api={splitReasoning,parseReasoning};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.PowerBrixReasoning=api;
})(globalThis);
