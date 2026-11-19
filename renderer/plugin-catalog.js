(function(scope){
 const plugins=[
  {id:'chat-history',name:'Chat History',icon:'history',description:'Save and revisit past conversations with your local AI.'},
  {id:'skills',name:'Skills',icon:'skills',description:'Give your models reusable instructions for the tasks you do most often.'},
  {id:'projects',name:'Projects',icon:'projects',description:'Organize your work with shared local files, instructions, and multiple chats.'},
  {id:'microphone-typing',name:'Microphone Typing',icon:'mic',description:'Speak into your microphone and turn your words into a prompt.'},
  {id:'internet-search',name:'Internet Search',icon:'globe',description:'Find current information on the web and bring sources into your chat.'},
  {id:'api',name:'API',icon:'api',description:'Create an API for your local models.'},
 ];
 function resolveInstalledPlugins(existing,id){
  if(id!==undefined&&!plugins.some(plugin=>plugin.id===id))throw Error('This plugin is unavailable.');
  const installed=[...new Set((Array.isArray(existing)?existing:[]).filter(value=>typeof value==='string'))];
  if(id&&!installed.includes(id))installed.push(id);
  if(installed.some(value=>value==='skills'||value==='projects')&&!installed.includes('chat-history'))installed.unshift('chat-history');
  return installed;
 }
 const api={plugins,resolveInstalledPlugins};if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.PowerBrixPlugins=api;
})(globalThis);
