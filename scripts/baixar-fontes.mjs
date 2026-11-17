// Baixa o HTML oficial de cada norma listada em fontes/normas.json.
// Guarda o arquivo bruto em fontes/html/ (fora do Git) e registra data, tamanho
// e hash em fontes/capturas.json, para saber exatamente de qual versão o texto veio.
//
// Uso: npm run fontes:baixar            (baixa só o que falta)
//      npm run fontes:baixar -- --todas (baixa tudo de novo)
//      npm run fontes:baixar -- lc-214  (só as normas indicadas)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PASTA = join(RAIZ, 'fontes', 'html');
const NORMAS = JSON.parse(readFileSync(join(RAIZ, 'fontes', 'normas.json'), 'utf8'));
const ARQ_CAPTURAS = join(RAIZ, 'fontes', 'capturas.json');
const capturas = existsSync(ARQ_CAPTURAS) ? JSON.parse(readFileSync(ARQ_CAPTURAS, 'utf8')) : {};

const args = process.argv.slice(2);
const todas = args.includes('--todas');
const escolhidas = args.filter((a) => !a.startsWith('--'));

// O planalto.gov.br derruba conexões sem cabeçalho de navegador.
const CABECALHOS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
  'accept-language': 'pt-BR,pt;q=0.9',
};

mkdirSync(PASTA, { recursive: true });
let falhas = 0;

for (const n of NORMAS) {
  if (escolhidas.length && !escolhidas.includes(n.id)) continue;
  const destino = join(PASTA, `${n.id}.${n.formato === 'pdf' ? 'pdf' : 'html'}`);
  if (!todas && !escolhidas.length && existsSync(destino)) continue;
  try {
    const r = await fetch(n.url, { headers: CABECALHOS, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    writeFileSync(destino, bytes);
    capturas[n.id] = {
      url: n.url,
      capturadoEm: new Date().toISOString(),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    console.log(`ok     ${n.id.padEnd(22)} ${(bytes.length / 1024).toFixed(0).padStart(6)} KB`);
  } catch (e) {
    falhas++;
    console.log(`FALHOU ${n.id.padEnd(22)} ${e.cause?.code || e.message}  ${n.url}`);
  }
}

writeFileSync(ARQ_CAPTURAS, JSON.stringify(capturas, null, 2) + '\n');
if (falhas) process.exitCode = 1;
