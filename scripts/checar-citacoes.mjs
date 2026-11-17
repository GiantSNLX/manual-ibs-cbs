// Confere as citações do manual sem precisar do build:
// todo link "/legislacao/..." precisa apontar para uma página convertida e, se tiver
// âncora (#art-444), o artigo precisa existir naquela página.
//
// Uso: node scripts/checar-citacoes.mjs [arquivo.md ...]   (padrão: todo src/content/docs/manual)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DOCS = join(RAIZ, 'src', 'content', 'docs');
const args = process.argv.slice(2);
const arquivos = args.length ? args : readdirSync(join(DOCS, 'manual')).filter((f) => /\.mdx?$/.test(f)).map((f) => join(DOCS, 'manual', f));

const idsCache = new Map();
function paginaDe(caminho) {
  const rel = caminho.replace(/^\//, '').replace(/\/$/, '');
  for (const c of [join(DOCS, rel + '.md'), join(DOCS, rel + '.mdx'), join(DOCS, rel, 'index.md'), join(DOCS, rel, 'index.mdx')]) if (existsSync(c)) return c;
  return null;
}
function idsDe(arquivo) {
  if (!idsCache.has(arquivo)) {
    const t = readFileSync(arquivo, 'utf8');
    const ids = new Set([...t.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    // cabeçalhos markdown também viram âncora
    for (const [, h] of t.matchAll(/^#{2,6}\s+(.+)$/gm)) ids.add(h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-'));
    idsCache.set(arquivo, ids);
  }
  return idsCache.get(arquivo);
}

let erros = 0, total = 0;
for (const arq of arquivos) {
  const texto = readFileSync(arq, 'utf8');
  for (const [, href] of texto.matchAll(/\]\((\/[^)\s]+)\)|href="(\/[^"]+)"/g).map((m) => [m[0], m[1] || m[2]])) {
    total++;
    const [caminho, ancora] = href.split('#');
    const pag = paginaDe(caminho);
    if (!pag) { erros++; console.log(`${arq.split(/[\\/]/).pop()}: página não existe  ${href}`); continue; }
    if (ancora && !idsDe(pag).has(ancora)) { erros++; console.log(`${arq.split(/[\\/]/).pop()}: âncora não existe  ${href}`); }
  }
}
console.log(`${total} links conferidos, ${erros} com problema`);
if (erros) process.exitCode = 1;
