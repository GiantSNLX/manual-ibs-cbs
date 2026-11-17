// Confere, no site gerado (dist/), se todo link interno aponta para uma página que existe
// e se toda âncora (#art-444) existe na página de destino. Falha o build se algo quebrar.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIST = join(RAIZ, 'dist');
const BASE = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');

const paginas = [];
const varrer = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) varrer(p);
    else if (f.endsWith('.html')) paginas.push(p);
  }
};
varrer(DIST);

const idsCache = new Map();
const idsDe = (arquivo) => {
  if (!idsCache.has(arquivo)) {
    const html = readFileSync(arquivo, 'utf8');
    idsCache.set(arquivo, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idsCache.get(arquivo);
};

const quebrados = [];
for (const arquivo of paginas) {
  const html = readFileSync(arquivo, 'utf8');
  const rel = '/' + arquivo.slice(DIST.length + 1).replace(/\\/g, '/').replace(/index\.html$/, '');
  for (const [, href] of html.matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|javascript:)/.test(href) || href === '#_top') continue;
    let [caminho, ancora] = href.split('#');
    if (!caminho) caminho = BASE.replace(/\/$/, '') + rel;
    if (!caminho.startsWith('/')) continue;
    if (!caminho.startsWith(BASE)) { quebrados.push(`${rel} -> ${href} (sem o base ${BASE})`); continue; }
    const semBase = caminho.slice(BASE.length).replace(/\/$/, '');
    if (/\.(xml|svg|png|ico|css|js|txt|webmanifest)$/.test(semBase) || semBase.startsWith('_astro') || semBase.startsWith('pagefind')) continue;
    const destino = join(DIST, semBase, 'index.html');
    if (!existsSync(destino)) { quebrados.push(`${rel} -> ${href} (página não existe)`); continue; }
    if (ancora && !idsDe(destino).has(decodeURIComponent(ancora))) quebrados.push(`${rel} -> ${href} (âncora não existe)`);
  }
}

if (quebrados.length) {
  console.error(`\n${quebrados.length} link(s) quebrado(s):`);
  for (const q of [...new Set(quebrados)].slice(0, 80)) console.error('  ' + q);
  process.exit(1);
}
console.log(`links ok: ${paginas.length} páginas conferidas`);
