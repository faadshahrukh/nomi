import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = '' + new URL('../dist', import.meta.url).pathname + '';
const types = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.png':'image/png', '.ttf':'font/ttf', '.css':'text/css' };
http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  res.setHeader('content-type', types[path.extname(p)] ?? 'application/octet-stream'); fs.createReadStream(p).pipe(res);
}).listen(8099, () => console.log('up'));
