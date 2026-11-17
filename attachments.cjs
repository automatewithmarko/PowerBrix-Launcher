const fs = require('node:fs/promises');
const path = require('node:path');

const textExtensions = ['txt','md','markdown','csv','tsv','json','jsonl','log','yaml','yml',
  'xml','html','css','js','jsx','ts','tsx','py','sh','ps1','sql','toml','ini','c','cpp','h','hpp','rs','go','java','rb'];
const extensions = ['pdf','docx',...textExtensions];
const maxAttachments = 3;
const maxFileBytes = 12 * 1024 * 1024;
const maxExtractedChars = 32000;

function supportsFiles(model) {
  // The native chat server accepts the extracted text and exposes its tokenizer.
  return model?.runtime === 'native' || model?.runtime === 'gemma';
}

async function readAttachment(filename) {
  const name = path.basename(filename);
  const extension = path.extname(name).slice(1).toLowerCase();
  if (!extensions.includes(extension)) throw Error('Unsupported file type.');
  const stats = await fs.stat(filename);
  if (!stats.isFile() || stats.size > maxFileBytes) throw Error('Choose a file under 12 MB.');
  const bytes = await fs.readFile(filename);
  if (bytes.length > maxFileBytes) throw Error('Choose a file under 12 MB.');

  let content, shortened = false;
  if (extension === 'pdf') {
    const {getDocumentProxy} = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    try {
      const pages = [];
      let count = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const text = await page.getTextContent();
        const lines = text.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
        pages.push(lines);
        count += lines.length;
        page.cleanup();
        if (count >= maxExtractedChars) {
          shortened = number < pdf.numPages;
          break;
        }
      }
      content = pages.join('\n\n');
    } finally {
      await pdf.loadingTask.destroy();
    }
  } else if (extension === 'docx') {
    const mammoth = require('mammoth');
    content = (await mammoth.extractRawText({buffer:bytes})).value;
  } else {
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    try { content = new TextDecoder(encoding,{fatal:true}).decode(bytes); }
    catch { throw Error('Save this text file as UTF-8 or UTF-16 and try again.'); }
    if (content.includes('\0')) throw Error('This file does not contain readable text.');
  }

  content = content.trim();
  if (!content) throw Error(extension === 'pdf' ? 'This PDF has no selectable text.' : 'This file is empty.');
  return {name, content:content.slice(0,maxExtractedChars), shortened:shortened || content.length > maxExtractedChars};
}

module.exports = {extensions,maxAttachments,supportsFiles,readAttachment};
