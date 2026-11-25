// The page for the webview: the app's index.html with a <base> to its files (the modules, models/, help.md resolve from
// there), a content security policy for the webview, and the scene link set before the app's modules run. Pure (node test).

/** A scene file's text -> '?empty#scene=…' (or #sky= / #story=), packed as the MCP links are. */
const linkOf = (text, deflateRaw) => {
  const doc = JSON.parse(text); // (throws on a half-written file)
  const head = text.slice(0, 4000);
  const kind = /"format"\s*:\s*"3draft-sky"/.test(head) ? 'sky' : /"format"\s*:\s*"spider-build/.test(head) ? 'story' : 'scene';
  const packed = deflateRaw(Buffer.from(JSON.stringify(doc))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `?empty#${kind}=${packed}`;
};

const pageHtml = (index, { base, link = '', cspSource }) => {
  const csp = [
    `default-src 'none'`,
    `img-src ${cspSource} data: blob: https:`,
    `media-src ${cspSource} data: blob:`,
    `font-src ${cspSource} data: https:`,
    `style-src ${cspSource} 'unsafe-inline' https:`,
    `script-src ${cspSource} 'unsafe-inline' 'unsafe-eval' blob:`,
    `connect-src ${cspSource} https: data: blob:`,
    `worker-src ${cspSource} blob:`,
  ].join('; ');
  const head = [
    `<base href="${base}">`,
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    // the start: the app reads location.search / location.hash when it begins
    // (VS Code's own query parameters stay: ours are added to them)
    link ? `<script>try { const [q, h] = ${JSON.stringify(link)}.slice(1).split('#'); history.replaceState(null, '', location.pathname + (location.search ? location.search + '&' : '?') + q + (h ? '#' + h : '')); } catch {}</script>` : '',
  ].join('\n');
  return index.replace(/<head([^>]*)>/i, (m) => `${m}\n${head}`);
};

module.exports = { pageHtml, linkOf };
