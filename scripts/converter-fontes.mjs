// Converte o HTML oficial (planalto.gov.br e outros) em páginas Markdown do Starlight.
//
// - Remove o texto riscado (redações revogadas) que o Planalto mantém no texto compilado.
// - Reconhece a estrutura: Livro, Título, Capítulo, Seção, artigo, parágrafo, inciso, alínea, item.
// - Cada artigo ganha âncora estável: #art-1, #art-156-a.
// - Normas grandes são divididas em uma página por Título (ou Livro/Título, Anexo, ADCT).
// - Gera src/data/legislacao.json (menu lateral) e src/data/artigos.json (artigo -> página).
//
// Uso: npm run fontes:converter            (todas as normas baixadas)
//      npm run fontes:converter -- lc-214-2025
import * as cheerio from 'cheerio';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const NORMAS = JSON.parse(readFileSync(join(RAIZ, 'fontes', 'normas.json'), 'utf8'));
const CAPTURAS = JSON.parse(readFileSync(join(RAIZ, 'fontes', 'capturas.json'), 'utf8'));
const DOCS = join(RAIZ, 'src', 'content', 'docs');
const DADOS = join(RAIZ, 'src', 'data');
const escolhidas = process.argv.slice(2).filter((a) => !a.startsWith('--'));

export const GRUPOS = {
  federal: 'Legislação federal',
  'zfm-alc': 'Zona Franca e ALC',
  amazonas: 'Amazonas',
  roraima: 'Roraima',
  cgibs: 'Comitê Gestor do IBS',
};

// ---------- texto ----------

function decodificar(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

const limpar = (s) => s.replace(/[\u00a0\u2002\u2003\u2009\u200b\t\r\n ]+/g, ' ').trim();
const escapar = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const ROMANOS = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
function romano(r) {
  let t = 0;
  for (let i = 0; i < r.length; i++) {
    const a = ROMANOS[r[i]], b = ROMANOS[r[i + 1]] || 0;
    t += a < b ? -a : a;
  }
  return t;
}

// Notas legislativas entre parênteses: (Redação dada pela...), (Incluído pela...), (Vide...).
const NOTA = /\((?:Reda[cç][aã]o dada|Inclu[ií]d[oa]s?|Revogad[oa]s?|Vide|Vig[eê]ncia|Produ[cç][aã]o de efeito|Regulamento|Regulamentad|Renumerad|Acrescid|Vetad|Mantid|Prorrogad|Suspens|Declarad|Promulga|Com reda[cç][aã]o|Nova reda[cç][aã]o|Express[aã]o|Em vigor|Convers[aã]o|Retifica|Efeitos?|Texto|Partes? vetad|Ver |V\. )[^()]*(?:\([^()]*\)[^()]*)*\)/gi;
const marcarNotas = (html) => html.replace(NOTA, (m) => `<span class="nota">${m}</span>`);

// ---------- leitura do HTML em blocos ----------

const BLOCO_TEXTO = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'dt', 'dd', 'pre', 'address']);
const BLOCO_QUALQUER = new Set([...BLOCO_TEXTO, 'table', 'div', 'center', 'blockquote', 'ul', 'ol', 'dl', 'tr', 'td', 'th', 'tbody', 'thead', 'tfoot', 'form', 'section', 'article', 'body', 'html', 'hr']);

function riscado($, el) {
  const estilo = ($(el).attr('style') || '').toLowerCase();
  return estilo.includes('line-through');
}

function linhasDe($, el) {
  // Texto do elemento, quebrando em <br> (o Planalto às vezes junta dispositivos assim).
  const partes = [];
  let atual = '';
  const visitar = (no) => {
    if (no.type === 'text') { atual += no.data; return; }
    if (no.type !== 'tag') return;
    if (no.name === 'br') { partes.push(atual); atual = ''; return; }
    no.children?.forEach(visitar);
  };
  el.children?.forEach(visitar);
  partes.push(atual);
  return partes.map(limpar).filter(Boolean);
}

function temBloco(el) {
  return (el.children || []).some((c) => c.type === 'tag' && (BLOCO_QUALQUER.has(c.name) || temBloco(c)));
}

function linhasDaTabela($, tabela) {
  return $(tabela).find('tr').filter((_, tr) => $(tr).closest('table')[0] === tabela);
}

function tabelaDeDados($, tabela) {
  if ($(tabela).find('table').length) return false;
  let linhas = 0;
  linhasDaTabela($, tabela).each((_, tr) => {
    const cheias = $(tr).children('td,th').filter((_, c) => limpar($(c).text()).length > 0).length;
    if (cheias >= 2) linhas++;
  });
  return linhas >= 2;
}

function tabelaHtml($, tabela) {
  const linhas = [];
  linhasDaTabela($, tabela).each((_, tr) => {
    const celulas = [];
    $(tr).children('td,th').each((_, c) => {
      const tag = c.name === 'th' ? 'th' : 'td';
      const attrs = ['colspan', 'rowspan']
        .filter((a) => $(c).attr(a) && $(c).attr(a) !== '1')
        .map((a) => ` ${a}="${Number($(c).attr(a)) || 1}"`)
        .join('');
      const texto = linhasDe($, c).map(escapar).join('<br>');
      celulas.push(`<${tag}${attrs}>${marcarNotas(texto)}</${tag}>`);
    });
    if (celulas.length && celulas.some((c) => !/^<t[dh][^>]*><\/t[dh]>$/.test(c))) linhas.push(`<tr>${celulas.join('')}</tr>`);
  });
  if (!linhas.length) return null;
  return `<div class="tabela-lei"><table>${linhas.join('')}</table></div>`;
}

function blocosDoHtml(html, seletor) {
  const $ = cheerio.load(html);
  $('script, style, strike, s, del, img, head, noscript, iframe, .v2_conteudo_revogado').remove();
  // SILT (SEFAZ-AM): notas de alteração viram nota entre parênteses, para não parecerem artigo.
  $('[class*=v2_nota]').each((_, e) => { $(e).text('(' + limpar($(e).text()) + ')'); });
  $('[style]').each((_, el) => { if (riscado($, el)) $(el).remove(); });

  const blocos = [];
  const centro = (el) => /center/i.test($(el).attr('align') || '') || /text-align:\s*center/i.test($(el).attr('style') || '') || $(el).parents('center').length > 0;

  const visitar = (el) => {
    if (el.type === 'text') {
      const t = limpar(el.data);
      if (t) blocos.push({ texto: t, centro: false });
      return;
    }
    if (el.type !== 'tag') return;
    if (el.name === 'table') {
      if (tabelaDeDados($, el)) {
        const t = tabelaHtml($, el);
        if (t) blocos.push({ tabela: t });
      } else el.children.forEach(visitar);
      return;
    }
    if (BLOCO_TEXTO.has(el.name) && !temBloco(el)) {
      for (const l of linhasDe($, el)) blocos.push({ texto: l, centro: centro(el) });
      return;
    }
    if (BLOCO_QUALQUER.has(el.name) || temBloco(el)) {
      // Agrupa texto solto e elementos em linha vizinhos num parágrafo só.
      let solto = [];
      const descarregar = () => {
        if (!solto.length) return;
        const falso = { type: 'tag', name: 'span', children: solto };
        for (const l of linhasDe($, falso)) blocos.push({ texto: l, centro: centro(el) });
        solto = [];
      };
      for (const c of el.children || []) {
        if (c.type === 'tag' && (BLOCO_QUALQUER.has(c.name) || temBloco(c))) { descarregar(); visitar(c); }
        else if (c.type === 'text' || c.type === 'tag') solto.push(c);
      }
      descarregar();
      return;
    }
    for (const l of linhasDe($, el)) blocos.push({ texto: l, centro: centro(el) });
  };
  visitar((seletor && $(seletor)[0]) || $('body')[0] || $.root()[0]);
  return blocos;
}

// Texto extraído de PDF (scripts/extrair-pdf.py): junta as linhas quebradas em parágrafos.
// Um parágrafo novo começa em dispositivo (Art., §, inciso, alínea), cabeçalho de estrutura
// ou depois de linha que termina em ponto, ponto e vírgula ou dois-pontos.
const INICIO_DISPOSITIVO = /^(Art\.?\s*\d|§\s*\d|Par[aá]grafo [uú]nico|[IVXLCDM]+\s*[-–—]\s|[a-z]\)\s|(LIVRO|T[IÍ]TULO|CAP[IÍ]TULO|ANEXO|PARTE)\s+([IVXLCDM]+|[ÚU]NIC[OA]|\d+)\b|(Se[cç][aã]o|Subse[cç][aã]o)\s+[IVXLCDM]+\b|[“"])/;
function blocosDoTexto(txt) {
  const blocos = [];
  let atual = null;
  const fechar = () => { if (atual) blocos.push({ texto: limpar(atual), centro: false }); atual = null; };
  for (const bruta of txt.split(/\r?\n/)) {
    const l = limpar(bruta);
    // Linha pontilhada é do sumário; se o item quebrou em duas linhas, descarta a primeira parte também.
    if (/\.{8,}/.test(l)) { atual = null; continue; }
    if (!l || /^\f?\[\[pagina \d+\]\]$/.test(bruta.trim()) || /^\d{1,3}$/.test(l)) continue;
    const ehCabecalho = /^(LIVRO|T[IÍ]TULO|CAP[IÍ]TULO|ANEXO|PARTE)\s/.test(l) || /^(Se[cç][aã]o|Subse[cç][aã]o)\s+[IVXLCDM]+\b/.test(l);
    const continuaCabecalho = atual && /^(LIVRO|T[IÍ]TULO|CAP[IÍ]TULO|ANEXO)\s/.test(atual) && l === l.toUpperCase() && !INICIO_DISPOSITIVO.test(l);
    if (continuaCabecalho) { atual += ' ' + l; continue; }
    if (!atual || INICIO_DISPOSITIVO.test(l) || ehCabecalho || /[.;:]$/.test(atual) || (/^(LIVRO|T[IÍ]TULO|CAP[IÍ]TULO|Se[cç]|Subse[cç])/.test(atual) && !/^(LIVRO|T[IÍ]TULO|CAP[IÍ]TULO)/.test(l) === false)) {
      fechar();
      atual = l;
    } else atual += (atual.endsWith('-') && /^[a-zà-ú]/.test(l) ? '' : ' ') + l;
    if (ehCabecalho && /^(Se[cç][aã]o|Subse[cç][aã]o)\s+[IVXLCDM]+\s*[-–—]\s*\S/.test(l)) fechar();
  }
  fechar();
  return blocos;
}

// ---------- classificação ----------

const CABECALHO_PLANALTO = /^(Presid[eê]ncia da Rep[uú]blica|Casa Civil|Secretaria Especial para Assuntos Jur[ií]dicos|Subchefia para Assuntos Jur[ií]dicos)$/i;

const NIVEIS = ['parte', 'livro', 'titulo', 'capitulo', 'secao', 'subsecao'];
const ROTULO_ESTRUTURA = /^(PARTE|LIVRO|T[IÍ]TULO|CAP[IÍ]TULO|SE[CÇ][AÃ]O|SUBSE[CÇ][AÃ]O|ANEXO)\s+((?:[IVXLCDM]+|[ÚU]NIC[OA]|\d+)(?:\s*-\s*[A-Z])?)\b\.?\s*(?:[-–—:.]\s*)?(.*)$/i;

function nivelDoRotulo(palavra) {
  const p = semAcento(palavra).toUpperCase();
  return { PARTE: 'parte', LIVRO: 'livro', TITULO: 'titulo', CAPITULO: 'capitulo', SECAO: 'secao', SUBSECAO: 'subsecao', ANEXO: 'anexo' }[p];
}

// "Art. 9º-A" tem sufixo; "Art. 3º - A Zona Franca..." é só o travessão antigo antes do texto.
const RE_ART = /^(Art(?:igo)?\.?\s*(\d+(?:\.\d{3})*)\s*(?:[º°o](?!\w))?(?:[-–]([A-Z]{1,2})(?![a-zà-ú]))?\s*[º°]?\.?)\s*(?:[-–—]\s+)?/;
const RE_PAR = /^((?:§\s*\d+\s*[º°o]?(?:\s*-\s*[A-Z]{1,2})?\.?)|(?:Par[aá]grafo [uú]nico\.?))\s*[-–—]?\s*/i;
const RE_INC = /^([IVXLCDM]+(?:\s*-\s*[A-Z]{1,2})?\s*[-–—])\s*/;
const RE_ALI = /^([a-z](?:-[A-Z])?\))\s*/;
const RE_ITEM = /^(\d+(?:\.\d+)*(?:-[A-Z])?\s*[.)\-–—])\s+/;

function classificar(b, ctx) {
  const t = b.texto;
  if (t.length < 450) {
    const m = t.match(ROTULO_ESTRUTURA);
    if (m && !/^[IVXLCDM]+\s*[-–—]/.test(t)) {
      const nivel = nivelDoRotulo(m[1]);
      if (nivel) return { tipo: 'estrutura', nivel, rotulo: `${m[1]} ${m[2]}`.replace(/\s+/g, ' '), nome: limpar(m[3] || ''), numero: m[2] };
    }
    if (/^ATO DAS DISPOSI[CÇ][OÕ]ES CONSTITUCIONAIS TRANSIT[OÓ]RIAS$/i.test(t)) return { tipo: 'estrutura', nivel: 'parte', rotulo: 'Ato das Disposições Constitucionais Transitórias', nome: '', numero: 'adct' };
  }
  let m;
  if ((m = t.match(RE_ART))) {
    const num = m[2].replace(/\./g, '');
    const id = `art-${num}${m[3] ? '-' + m[3].toLowerCase() : ''}`;
    return { tipo: 'art', id, rotulo: m[1].trim(), resto: t.slice(m[0].length) };
  }
  if ((m = t.match(RE_PAR))) return { tipo: 'par', rotulo: m[1].trim(), resto: t.slice(m[0].length) };
  if ((m = t.match(RE_INC)) && ctx.dentroArtigo) return { tipo: 'inc', rotulo: m[1].trim(), resto: t.slice(m[0].length) };
  if ((m = t.match(RE_ALI)) && ctx.dentroArtigo) return { tipo: 'ali', rotulo: m[1].trim(), resto: t.slice(m[0].length) };
  if ((m = t.match(RE_ITEM)) && ctx.dentroArtigo && ctx.ultimo && ['ali', 'item'].includes(ctx.ultimo)) return { tipo: 'item', rotulo: m[1].trim(), resto: t.slice(m[0].length) };
  const curto = t.length < 140 && !/[.;:]$/.test(t);
  if (b.centro && curto) return { tipo: 'rubrica' };
  if (curto && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÇ]{4}/.test(t)) return { tipo: 'rubrica' };
  return { tipo: 'texto' };
}

const recuo = { art: 0, par: 1, inc: 1, ali: 2, item: 3 };

// ---------- montagem das páginas ----------

function slugEstrutura(nivel, numero) {
  const n = String(numero).trim();
  if (n === 'adct') return 'adct';
  const base = n.match(/^([IVXLCDM]+)(?:\s*-\s*([A-Z]))?$/i);
  let valor = base ? String(romano(base[1].toUpperCase())) + (base[2] ? '-' + base[2].toLowerCase() : '') : semAcento(n).toLowerCase().replace(/\s+/g, '-');
  return `${nivel}-${valor}`;
}

// Siglas e nomes próprios que voltam ao normal depois de tirar a caixa alta.
const SIGLAS = ['IBS', 'CBS', 'IS', 'ICMS', 'ISS', 'IPI', 'IOF', 'PIS', 'Pasep', 'Cofins', 'CGIBS', 'ZFM', 'ALC', 'MEI', 'NCM', 'NBS', 'Repetro', 'Reporto', 'Reidi', 'Renaval', 'Recap', 'SH', 'TIPI', 'DF', 'ZPE', 'SUS', 'Prouni', 'IVA', 'CIDE', 'ITCMD', 'IPVA', 'IPTU', 'Suframa', 'cashback'];
const NOMES = ['Zona Franca de Manaus', 'Amazônia Ocidental', 'Áreas de Livre Comércio', 'Área de Livre Comércio', 'Distrito Federal', 'União', 'Estados', 'Municípios', 'Comitê Gestor', 'Simples Nacional', 'Cesta Básica Nacional de Alimentos', 'Imposto Seletivo', 'Imposto sobre Bens e Serviços', 'Contribuição Social sobre Bens e Serviços', 'Fundo de Compensação de Benefícios Fiscais', 'Fundo de Sustentabilidade e Diversificação Econômica do Estado do Amazonas', 'Fundo de Desenvolvimento Regional', 'Poder Executivo', 'Poder Legislativo', 'Poder Judiciário', 'Ministério Público', 'Defensoria Pública', 'Receita Federal do Brasil', 'Senado Federal', 'Amazonas', 'Roraima', 'Amapá', 'Acre', 'Rondônia', 'Manaus', 'Boa Vista', 'Bonfim', 'Tabatinga', 'Macapá', 'Santana', 'Guajará-Mirim', 'Brasiléia', 'Cruzeiro do Sul', 'Pacaraima'];
const tituloCaso = (s) => {
  // "DAS NORMAS GERAIS DO IBS E DA CBS" -> "Das normas gerais do IBS e da CBS"
  const letras = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, '').length;
  const palavraGritada = s.split(/\s+/).some((w) => w.length >= 4 && w === w.toUpperCase() && /[A-Z]/.test(w) && !SIGLAS.some((g) => g.toUpperCase() === w.replace(/[^A-Z]/g, '')));
  if (!letras.length || (maiusculas / letras.length < 0.6 && !palavraGritada)) return s;
  let r = s.toLowerCase();
  r = r.charAt(0).toUpperCase() + r.slice(1);
  for (const n of NOMES) r = r.replace(new RegExp(`(?<![\\p{L}])${n.toLowerCase()}(?![\\p{L}])`, 'gu'), n);
  for (const g of SIGLAS) r = r.replace(new RegExp(`(?<![\\p{L}])${g.toLowerCase()}(?![\\p{L}])`, 'gu'), g);
  return r.replace(/\b([ivxlcdm]+)\b(?=\s*(-|$|,))/g, (x) => x.toUpperCase());
};
const rotuloCaso = (r) => tituloCaso(r).replace(/\b([ivxlcdm]+)\b/g, (x) => x.toUpperCase()).replace(/ - ([a-z])$/, (x, l) => ` - ${l.toUpperCase()}`);

function converterNorma(n) {
  const arquivo = n.formato === 'pdf' ? join(RAIZ, 'fontes', 'texto', `${n.id}.txt`) : join(RAIZ, 'fontes', 'html', `${n.id}.html`);
  if (!existsSync(arquivo)) { console.log(`sem fonte ${n.id} (rode fontes:baixar e, se for PDF, scripts/extrair-pdf.py)`); return null; }
  let blocos = n.formato === 'pdf' ? blocosDoTexto(readFileSync(arquivo, 'utf8')) : blocosDoHtml(decodificar(readFileSync(arquivo)), n.seletor);
  if (n.ignorarAte) {
    // Algumas páginas têm índice no topo (ex.: CF). Descarta até o marcador.
    const re = new RegExp(n.ignorarAte, 'i');
    const k = blocos.findIndex((b) => b.texto && re.test(b.texto));
    if (k >= 0) blocos = blocos.slice(k + 1);
  }

  const itens = [];
  let ctx = { dentroArtigo: false, ultimo: null, nivelInc: 1 };
  // Texto de outra lei citado numa alteração ("passa a vigorar com as seguintes alterações:").
  // Fica como citação, sem âncora e sem virar página, até voltar a numeração da própria norma.
  let citando = false;
  let ultimoArt = 0;
  let ultimaChamada = -999; // última linha que anunciou texto citado ("passa a vigorar...:")
  const ENTRA_CITACAO = /(passa(m)?s+as+vigorar|seguintes?s+(altera[cç][oõ]es|reda[cç][aã]o)|acrescid[oa]s?s+d[oa]s?s+seguintes?|(lei|decreto|constitui[cç][aã]o|emenda|ato das disposi)[^:]*seguintes?s+(art|dispositiv))[^:]*:s*(([^()]*)s*)*$/i;
  const ABRE_ASPAS = /^[“"]/;
  for (let i = 0; i < blocos.length; i++) {
    const b = blocos[i];
    if (b.tabela) { itens.push({ tipo: 'tabela', html: b.tabela }); continue; }
    if (CABECALHO_PLANALTO.test(b.texto)) continue;
    const c = classificar(b, ctx);

    // A numeração da própria norma só anda para frente; "Art. 35" depois do art. 165 é citação.
    const sequencia = c.tipo === 'art' && !ABRE_ASPAS.test(b.texto) && (() => {
      const m = c.id.match(/^art-(\d+)(-[a-z]+)?$/);
      const num = Number(m[1]);
      return ultimoArt === 0 || (num > ultimoArt && num <= ultimoArt + 3) || (num === ultimoArt && !!m[2]);
    })();
    // Fora de citação, salto para frente é lacuna (artigo revogado); só número que volta é citação.
    const volta = c.tipo === 'art' && (() => {
      const m = c.id.match(/^art-(\d+)(-[a-z]+)?$/);
      return Number(m[1]) < ultimoArt || (Number(m[1]) === ultimoArt && !m[2]);
    })();
    if (!citando && c.tipo === 'art' && !ABRE_ASPAS.test(b.texto) && volta && ultimoArt > 0 && i - ultimaChamada < 80) citando = true;
    if (citando) {
      const retorna = sequencia;
      const fim = /^Bras[ií]lia,/.test(b.texto);
      if (!retorna && !fim) { itens.push({ tipo: 'citacao', texto: b.texto, estrutura: c.tipo === 'estrutura' }); continue; }
      citando = false;
    }

    if (c.tipo === 'estrutura') {
      // "CAPÍTULO I" + "DAS DISPOSIÇÕES GERAIS" na linha seguinte viram um cabeçalho só.
      // Notas entre parênteses no meio do caminho ficam como texto logo abaixo.
      const notas = [];
      let j = i + 1;
      while (!c.nome && c.numero !== 'adct' && j < blocos.length && !blocos[j].tabela && j <= i + 4) {
        const t = blocos[j].texto;
        if (/^\(.*\)$/.test(t)) { notas.push(t); j++; continue; }
        const prox = classificar(blocos[j], ctx);
        if (['rubrica', 'texto'].includes(prox.tipo) && t.length <= 400 && !ABRE_ASPAS.test(t)) { c.nome = t; j++; }
        break;
      }
      i = j - 1;
      if (c.nivel === 'parte') ultimoArt = 0; // o ADCT recomeça a numeração
      ctx = { dentroArtigo: false, ultimo: null, nivelInc: 1 };
      itens.push(c);
      for (const t of notas) itens.push({ tipo: 'texto', texto: t });
      continue;
    }
    if ((c.tipo === 'texto' || c.tipo === 'rubrica') && (ENTRA_CITACAO.test(b.texto) || ABRE_ASPAS.test(b.texto))) {
      itens.push({ tipo: 'texto', texto: b.texto });
      ultimaChamada = i;
      citando = !ABRE_ASPAS.test(b.texto) || !/[”"]\s*(\((NR|AC)\))?\s*(\([^()]*\)\s*)*$/.test(b.texto);
      if (ABRE_ASPAS.test(b.texto)) itens.at(-1).tipo = 'citacao';
      continue;
    }
    if (c.tipo === 'art') {
      if (ABRE_ASPAS.test(b.texto)) { itens.push({ tipo: 'citacao', texto: b.texto }); citando = true; ultimaChamada = i; continue; }
      ultimoArt = Number(c.id.match(/^art-(\d+)/)[1]);
    }
    if (c.tipo === 'art') ctx = { dentroArtigo: true, ultimo: 'art', nivelInc: 1 };
    else if (c.tipo === 'par') { ctx.ultimo = 'par'; ctx.nivelInc = 2; }
    else if (c.tipo === 'inc') ctx.ultimo = 'inc';
    else if (c.tipo === 'ali') ctx.ultimo = 'ali';
    else if (c.tipo === 'item') ctx.ultimo = 'item';
    itens.push({ ...c, texto: b.texto, nivelInc: ctx.nivelInc });
    if (ENTRA_CITACAO.test(b.texto)) { citando = true; ultimaChamada = i; }
  }

  // Divide em páginas.
  const corte = new Set(n.divisao === 'titulo' ? ['parte', 'livro', 'titulo', 'anexo'] : []);
  const paginas = [{ slug: 'index', titulo: n.titulo, itens: [], abertura: true }];
  let livro = null;
  for (const it of itens) {
    if (it.tipo === 'estrutura' && corte.has(it.nivel)) {
      const atual = paginas.at(-1);
      const soCabecalhos = !atual.abertura && atual.itens.every((x) => x.tipo === 'estrutura' || x.tipo === 'rubrica' || (x.tipo === 'texto' && /^\(.*\)$/.test(x.texto)));
      const rotulo = rotuloCaso(it.rotulo);
      const nome = it.nome ? tituloCaso(it.nome) : '';
      const completo = nome ? `${rotulo} - ${nome}` : rotulo;
      if (it.nivel === 'livro' || it.nivel === 'parte') livro = it.nivel === 'livro' ? { rotulo, slug: slugEstrutura('livro', it.numero) } : null;
      if (it.nivel === 'anexo') livro = null;
      const prefixo = livro && it.nivel === 'titulo' ? `${livro.rotulo} · ` : '';
      const slug = (livro && it.nivel === 'titulo' ? `${livro.slug}-` : '') + slugEstrutura(it.nivel, it.numero);
      if (soCabecalhos && atual.itens.length) {
        atual.titulo = `${atual.titulo.split(' - ')[0]} · ${completo}`.replace(/^(Livro [^·]+) · \1 · /, '$1 · ');
        atual.slug = slug;
        atual.itens.push({ ...it, oculto: true });
      } else {
        paginas.push({ slug, titulo: prefixo + completo, itens: [{ ...it, oculto: true }] });
      }
      continue;
    }
    paginas.at(-1).itens.push(it);
  }
  // Slugs únicos.
  const vistos = new Map();
  for (const p of paginas) {
    const k = vistos.get(p.slug) || 0;
    vistos.set(p.slug, k + 1);
    if (k) p.slug = `${p.slug}-${k + 1}`;
  }

  const pastaNorma = join(DOCS, 'legislacao', n.grupo, n.id);
  rmSync(pastaNorma, { recursive: true, force: true });
  mkdirSync(pastaNorma, { recursive: true });
  const urlBase = `/legislacao/${n.grupo}/${n.id}/`;
  const urlDe = (p) => (p.slug === 'index' ? urlBase : `${urlBase}${p.slug}/`);
  const artigos = {};
  const cap = CAPTURAS[n.id];
  const dataCaptura = cap ? new Date(cap.capturadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' }) : '';
  const deslocamento = n.divisao === 'titulo' ? 2 : 0; // titulo vira página; capítulo vira ##
  const ementa = (() => {
    const primeiro = itens.findIndex((x) => x.tipo === 'art' || x.tipo === 'estrutura');
    const antes = itens.slice(0, primeiro < 0 ? 5 : primeiro).filter((x) => x.tipo === 'texto' || x.tipo === 'rubrica');
    const e = antes.find((x) => x.texto.length > 40 && !/^(O PRESIDENTE|A PRESIDENTA|O VICE|Mensagem de veto|Vig[eê]ncia|Texto compilado|Produ[cç][aã]o de efeitos|Regulamento|Vide|Convers[aã]o|Promulga|As Mesas|Os representantes|N[ÓO]S,)/i.test(x.texto) && !/^(LEI|DECRETO|EMENDA|CONSTITUI)/.test(x.texto));
    return e ? e.texto : '';
  })();

  paginas.forEach((p, ordem) => {
    const linhas = [];
    const ids = new Map();
    for (const it of p.itens) {
      if (it.oculto) continue;
      if (it.tipo === 'tabela') { linhas.push(it.html); continue; }
      if (it.tipo === 'estrutura') {
        const nivel = it.nivel === 'anexo' ? 2 : Math.min(6, Math.max(2, NIVEIS.indexOf(it.nivel) + 1 - deslocamento + (deslocamento ? 0 : -1)));
        const nome = it.nome ? ` - ${tituloCaso(it.nome)}` : '';
        linhas.push(`${'#'.repeat(nivel)} ${rotuloCaso(it.rotulo)}${nome}`.replace(/([*_\\`[\]<>])/g, '\\$1'));
        continue;
      }
      if (it.tipo === 'citacao') { linhas.push(`<p class="d d-cit${it.estrutura ? ' d-rubrica' : ''}">${marcarNotas(escapar(it.texto))}</p>`); continue; }
      if (it.tipo === 'rubrica') { linhas.push(`<p class="d d-rubrica">${escapar(it.texto)}</p>`); continue; }
      if (it.tipo === 'texto') { linhas.push(/^(.*)$/.test(it.texto) ? `<p class="d d-texto"><span class="nota">${escapar(it.texto)}</span></p>` : `<p class="d d-texto">${marcarNotas(escapar(it.texto))}</p>`); continue; }
      if (it.tipo === 'art') {
        const k = ids.get(it.id) || 0;
        ids.set(it.id, k + 1);
        const id = k ? `${it.id}-${k + 1}` : it.id;
        const chave = p.slug.startsWith('adct') ? `adct:${id}` : id;
        if (!artigos[chave]) artigos[chave] = urlDe(p);
        linhas.push(`<p class="d d-art" id="${id}"><a class="d-rot" href="#${id}">${escapar(it.rotulo)}</a> ${marcarNotas(escapar(it.resto))}</p>`);
        continue;
      }
      let nivel = recuo[it.tipo];
      if (it.tipo === 'inc') nivel = it.nivelInc;
      if (it.tipo === 'ali') nivel = it.nivelInc + 1;
      if (it.tipo === 'item') nivel = it.nivelInc + 2;
      linhas.push(`<p class="d n${nivel}"><b>${escapar(it.rotulo)}</b> ${marcarNotas(escapar(it.resto))}</p>`);
    }

    const front = [
      '---',
      `title: ${JSON.stringify(p.titulo)}`,
      ementa && p.slug === 'index' ? `description: ${JSON.stringify(ementa.slice(0, 300))}` : `description: ${JSON.stringify(`${n.titulo}: ${p.titulo}`.slice(0, 300))}`,
      `sidebar:\n  order: ${ordem}`,
      'tableOfContents:\n  minHeadingLevel: 2\n  maxHeadingLevel: 3',
      '---',
      '',
    ];
    const aviso = [
      ':::note[Fonte oficial]',
      `Texto reproduzido de [${n.url.replace(/^https?:\/\//, '')}](${n.url}), versão capturada em ${dataCaptura}. O texto revogado foi omitido. Em caso de divergência, vale a publicação oficial.${n.aviso ? ' ' + n.aviso : ''}`,
      ':::',
      '',
    ];
    let corpo = linhas.join('\n\n');
    if (p.slug === 'index' && paginas.length > 1) {
      const sumario = paginas.slice(1).map((q) => `- [${q.titulo.replace(/([[\]])/g, '\\$1')}](${urlDe(q)})`).join('\n');
      corpo = `${corpo}\n\n## Sumário\n\n${sumario}`;
    }
    writeFileSync(join(pastaNorma, `${p.slug}.md`), front.join('\n') + (p.slug === 'index' ? aviso.join('\n') + '\n' : '') + corpo + '\n');
  });

  const nArt = Object.keys(artigos).length;
  console.log(`ok  ${n.id.padEnd(22)} ${String(paginas.length).padStart(3)} páginas  ${String(nArt).padStart(5)} artigos`);
  return {
    id: n.id,
    grupo: n.grupo,
    ordem: n.ordem ?? 99,
    titulo: n.titulo,
    rotulo: n.rotulo || n.titulo,
    url: n.url,
    link: urlBase,
    ementa,
    captura: cap || null,
    paginas: paginas.slice(1).map((p) => ({ label: p.titulo, link: urlDe(p) })),
    artigos,
  };
}

// ---------- execução ----------

mkdirSync(DADOS, { recursive: true });
const ARQ_LEG = join(DADOS, 'legislacao.json');
const ARQ_ART = join(DADOS, 'artigos.json');
const anteriores = existsSync(ARQ_LEG) ? JSON.parse(readFileSync(ARQ_LEG, 'utf8')) : [];
const artigosAnt = existsSync(ARQ_ART) ? JSON.parse(readFileSync(ARQ_ART, 'utf8')) : {};
const porId = new Map(anteriores.map((x) => [x.id, x]));

for (const n of NORMAS) {
  if (escolhidas.length && !escolhidas.includes(n.id)) continue;
  const r = converterNorma(n);
  if (!r) continue;
  artigosAnt[n.id] = r.artigos;
  delete r.artigos;
  porId.set(n.id, r);
}
const ids = new Set(NORMAS.map((n) => n.id));
const lista = [...porId.values()].filter((x) => ids.has(x.id)).sort((a, b) => Object.keys(GRUPOS).indexOf(a.grupo) - Object.keys(GRUPOS).indexOf(b.grupo) || a.ordem - b.ordem);
writeFileSync(ARQ_LEG, JSON.stringify(lista, null, 2) + '\n');
writeFileSync(ARQ_ART, JSON.stringify(Object.fromEntries(Object.entries(artigosAnt).filter(([k]) => ids.has(k))), null, 1) + '\n');

// Página "Fontes": de onde veio cada texto, quando foi capturado e o hash do arquivo.
const linhasFontes = lista.map((x) => {
  const data = x.captura ? new Date(x.captura.capturadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' }) : 'não capturado';
  const hash = x.captura ? `\`${x.captura.sha256.slice(0, 12)}\`` : '';
  return `| ${GRUPOS[x.grupo]} | [${x.titulo}](${x.link}) | [fonte oficial](${x.url}) | ${data} | ${hash} |`;
});
const extras = existsSync(join(RAIZ, 'fontes', 'fontes-extras.md')) ? readFileSync(join(RAIZ, 'fontes', 'fontes-extras.md'), 'utf8') : '';
writeFileSync(join(DOCS, 'fontes.md'), `---
title: Fontes
description: De onde veio cada texto legal reproduzido neste manual, com data de captura e hash do arquivo oficial.
---

Todo texto legal deste site foi baixado da publicação oficial e convertido por script (\`scripts/converter-fontes.mjs\`). As redações revogadas que aparecem riscadas no texto compilado foram omitidas. O hash (SHA-256, 12 primeiros caracteres) identifica a versão exata do arquivo usado.

| Esfera | Norma | Origem | Capturada em | Hash |
|---|---|---|---|---|
${linhasFontes.join('\n')}
${extras ? '\n' + extras : ''}`);
console.log(`fontes.md com ${lista.length} normas`);
