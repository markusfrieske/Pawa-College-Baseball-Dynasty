import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const docs=path.resolve('docs/art-direction'),art=path.resolve('client/public/art/players/v1');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.md':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}let route;try{route=decodeURIComponent(new URL(req.url,'http://local').pathname)}catch{res.writeHead(400);res.end();return;}
 const isArt=route.startsWith('/art/players/v1/'),root=isArt?art:docs;
 const file=path.resolve(root,isArt?route.slice('/art/players/v1/'.length):'.'+(route==='/'?'/pc-sports/faces.html':route));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{const data=fs.readFileSync(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data)}catch{res.writeHead(404);res.end('Asset unavailable')}
}).listen(49748,'127.0.0.1',()=>console.log('Player library http://127.0.0.1:49748/pc-sports/faces.html'));
