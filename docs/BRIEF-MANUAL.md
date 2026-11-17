# Brief para quem escreve capítulos do manual

Projeto: site Astro + Starlight em `C:\ProjetosWeb\manual-ibs-cbs`. Público: profissionais de tributos e controladoria de empresas na Zona Franca de Manaus, no Amazonas e em Roraima.

## Regras inegociáveis
1. **Toda afirmação de regra tem fonte**: artigo citado com link para o texto no site. Sem fonte, não escreva. Percentuais, prazos, datas e listas são copiados exatamente do texto legal.
2. **Leia o texto antes de escrever**: os textos estão em `src/content/docs/legislacao/**.md` (HTML simples; cada artigo é `<p class="d d-art" id="art-444">`). Use Grep para achar artigos. O mapa `src/data/artigos.json` dá, por norma, a URL da página de cada artigo (`"art-444": "/legislacao/federal/lc-214-2025/livro-3-titulo-1/"`). No ADCT da CF, a chave é `"adct:art-92-b"`.
3. **Formato do link**: `[art. 444 da LC 214/2025](/legislacao/federal/lc-214-2025/livro-3-titulo-1/#art-444)`. Para parágrafo ou inciso, linke o artigo e escreva "art. 444, § 2º, II". Links sempre começando com `/legislacao/...` e terminando a página com `/` antes do `#`.
4. **Hierarquia das fontes**: CF/ADCT > LC 214/2025 (alterada pela LC 227/2026; o texto do site já é o compilado) > Decreto 12.955/2026 (regulamento da CBS) e Resolução CGIBS 6/2026 (regulamento do IBS; o texto do site é o ORIGINAL, alterado pela Resolução CGIBS 13/2026, avise isso quando citar). Quando lei e regulamento disserem coisas diferentes, mostre os dois e sinalize com `:::caution`.
5. **Não invente**: se a regra depende de ato ainda não publicado ("ato conjunto", "regulamento disporá"), diga isso. Se você não achar o texto, diga que não achou. Exemplos numéricos só quando a conta sai direto do texto legal, marcados como "Exemplo ilustrativo".
6. **Português do Brasil, direto, sem juridiquês desnecessário. NUNCA use o caractere travessão (—) nem o meia-risca (–) como pontuação**; use vírgula, dois-pontos ou parênteses.

## Formato de cada capítulo
Arquivo `src/content/docs/manual/<slug>.md`:
```
---
title: Zona Franca de Manaus
description: Uma frase sobre o capítulo.
sidebar:
  order: 6
---
```
- Abertura de 2 a 4 frases: do que o capítulo trata e para quem importa.
- Seções `##` por tema, `###` para detalhes. Tabelas para percentuais, prazos e listas de produtos ou hipóteses.
- Asides do Starlight quando ajudar: `:::note`, `:::tip[Na prática]`, `:::caution` (divergência, dependência de regulamentação, ponto de atenção).
- Fechamento: `## Fundamento legal` com a lista dos dispositivos citados, cada um com link.
- Pode ligar para outros capítulos do manual: `/manual/<slug>/`.

## Validação obrigatória antes de entregar
`node scripts/checar-citacoes.mjs src/content/docs/manual/<seu-arquivo>.md` precisa terminar com 0 problemas. Não rode `astro build` (outros agentes trabalham em paralelo). Não edite nenhum arquivo além dos seus capítulos.

## Entrega
Responda com: arquivos escritos, número de links, e uma lista curta de pontos em que o texto legal é ambíguo, depende de regulamentação ou em que lei e regulamento divergem (são os pontos que a revisão vai olhar primeiro).
