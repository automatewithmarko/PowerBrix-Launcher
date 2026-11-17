const providers = [
  {url:'https://lite.duckduckgo.com/lite/', parse:parseDuckDuckGo},
  {url:'https://www.bing.com/search?format=rss', parse:parseBing},
];

const entities = {amp:'&',quot:'"',apos:"'",nbsp:' ',lt:'<',gt:'>'};
function decode(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|nbsp|lt|gt);/gi,(entity,key)=>{
    if (!key.startsWith('#')) return entities[key.toLowerCase()] ?? entity;
    const hex = key[1].toLowerCase() === 'x';
    const point = parseInt(key.slice(hex?2:1),hex?16:10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
  });
}

function plain(value) {
  return decode(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
}

function safeUrl(value) {
  try {
    let url = new URL(decode(value),'https://duckduckgo.com');
    if (url.hostname === 'duckduckgo.com' && url.pathname === '/l/') url = new URL(url.searchParams.get('uddg'));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function parseDuckDuckGo(html) {
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .filter(match => /\bclass=["']result-link["']/i.test(match[1]));
  return links.map((match,index)=>{
    const link = match[1].match(/\bhref=["']([^"']+)["']/i)?.[1];
    const block = html.slice(match.index+match[0].length,links[index+1]?.index);
    const snippet = block.match(/<td\b[^>]*\bclass=["']result-snippet["'][^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? '';
    return {title:plain(match[2]),url:link?safeUrl(link):null,snippet:plain(snippet)};
  });
}

function parseBing(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(([,item])=>{
    const field = key => item.match(new RegExp('<'+key+'>([\\s\\S]*?)</'+key+'>','i'))?.[1] ?? '';
    const link = field('link');
    return {title:plain(field('title')),url:link?safeUrl(link):null,snippet:plain(field('description'))};
  });
}

async function readResults(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let content = '';
  let bytes = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) return content + decoder.decode();
      bytes += value.byteLength;
      if (bytes > 1024*1024) throw Error('The search response was too large.');
      content += decoder.decode(value,{stream:true});
    }
  } finally { await reader.cancel().catch(()=>{}); }
}

async function searchWeb(question, signal) {
  for (const provider of providers) {
    signal.throwIfAborted();
    try {
      const url = new URL(provider.url);
      url.searchParams.set('q',question.slice(0,500));
      const response = await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(6500)]),headers:{
        'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept:'text/html, application/rss+xml, application/xml',
      }});
      if (!response.ok) { await response.body?.cancel(); continue; }
      const seen = new Set();
      const results = [];
      for (const result of provider.parse(await readResults(response))) {
        if (!result.url || !result.title || !result.snippet || seen.has(result.url)) continue;
        seen.add(result.url);
        results.push({...result,title:result.title.slice(0,145),snippet:result.snippet.slice(0,420)});
        if (results.length === 5) break;
      }
      if (results.length) return results;
    } catch { signal.throwIfAborted(); }
  }
  throw Error('Web search returned no usable results. Check your connection or try a shorter question.');
}

module.exports = {searchWeb, safeUrl};
