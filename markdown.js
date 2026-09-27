// Tiny, dependency-free Markdown renderer with [[wikilink]] and #tag support.
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // resolve(title) -> true if a note with that title exists
  function inline(raw, resolve) {
    const tokens = [];
    const put = html => `\u0000${tokens.push(html) - 1}\u0000`;

    let s = raw.replace(/`([^`\n]+)`/g, (_, c) => put(`<code>${esc(c)}</code>`));

    s = s.replace(/\[\[([^\]\n]+)\]\]/g, (_, inner) => {
      const [target, alias] = inner.split('|');
      const t = target.split('#')[0].trim();
      const cls = resolve && resolve(t) ? 'wikilink' : 'wikilink missing';
      return put(`<a href="#" class="${cls}" data-target="${esc(t)}">${esc((alias || target).trim())}</a>`);
    });

    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_, txt, url) => put(`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)}</a>`));

    s = esc(s)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
      .replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
      .replace(/(^|\s)#([A-Za-z][\w\-/]*)/g, '$1<span class="tag">#$2</span>');

    return s.replace(/\u0000(\d+)\u0000/g, (_, n) => tokens[n]);
  }

  function render(src, resolve) {
    const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    let html = '', i = 0, list = null, para = [];
    const flushPara = () => {
      if (para.length) { html += '<p>' + inline(para.join('\n'), resolve).replace(/\n/g, '<br>') + '</p>'; para = []; }
    };
    const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
    const openList = tag => { if (list !== tag) { closeList(); html += `<${tag}>`; list = tag; } };

    while (i < lines.length) {
      const line = lines[i];
      let m;

      if (/^\s*```/.test(line)) {                       // fenced code
        flushPara(); closeList();
        const buf = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        html += `<pre><code>${esc(buf.join('\n'))}</code></pre>`;
        continue;
      }
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {       // heading
        flushPara(); closeList();
        const lvl = m[1].length;
        html += `<h${lvl}>${inline(m[2], resolve)}</h${lvl}>`;
        i++; continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {     // horizontal rule
        flushPara(); closeList(); html += '<hr>'; i++; continue;
      }
      if (/^>\s?/.test(line)) {                           // blockquote
        flushPara(); closeList();
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        html += `<blockquote>${inline(buf.join('\n'), resolve).replace(/\n/g, '<br>')}</blockquote>`;
        continue;
      }
      if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {        // bullet / task
        flushPara(); openList('ul');
        const tm = m[1].match(/^\[([ xX])\]\s+(.*)$/);
        html += tm
          ? `<li class="task"><input type="checkbox" disabled${tm[1] !== ' ' ? ' checked' : ''}> ${inline(tm[2], resolve)}</li>`
          : `<li>${inline(m[1], resolve)}</li>`;
        i++; continue;
      }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {      // ordered
        flushPara(); openList('ol');
        html += `<li>${inline(m[1], resolve)}</li>`;
        i++; continue;
      }
      if (line.trim() === '') { flushPara(); closeList(); i++; continue; }

      closeList(); para.push(line); i++;
    }
    flushPara(); closeList();
    return html;
  }

  // Titles of every [[link]] in a piece of text (alias and #heading stripped)
  function extractLinks(src) {
    const out = [], re = /\[\[([^\]\n]+)\]\]/g;
    let m;
    while ((m = re.exec(src))) out.push(m[1].split('|')[0].split('#')[0].trim());
    return out;
  }

  const api = { render, esc, extractLinks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.MD = api;
})(this);
