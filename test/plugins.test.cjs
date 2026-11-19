const {test}=require('node:test');const assert=require('node:assert/strict');const {plugins,resolveInstalledPlugins}=require('../renderer/plugin-catalog.js');
test('plugin display order is chat history, skills, projects, microphone, search and API',()=>{
 assert.deepEqual(plugins.map(p=>p.id),['chat-history','skills','projects','microphone-typing','internet-search','api']);
});
test('Skills and Projects install Chat History automatically and preserve existing plugin choices',()=>{
 for(const id of ['skills','projects']){
  assert.deepEqual(resolveInstalledPlugins([],id),['chat-history',id]);
  assert.deepEqual(resolveInstalledPlugins([id]),['chat-history',id]);
  assert.deepEqual(resolveInstalledPlugins(['chat-history',id],id),['chat-history',id]);
  const existing=['api','future-plugin'];const next=resolveInstalledPlugins(existing,id);assert.ok(next.includes('api')&&next.includes('future-plugin')&&next.includes('chat-history')&&next.includes(id));assert.deepEqual(existing,['api','future-plugin']);
 }
 assert.deepEqual(resolveInstalledPlugins([],'internet-search'),['internet-search']);
 assert.throws(()=>resolveInstalledPlugins([],'invalid'),/unavailable/);
});
