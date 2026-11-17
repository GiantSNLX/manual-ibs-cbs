# Manual IBS e CBS: ZFM, Amazonas e Roraima

Site estático (Astro + Starlight) com um manual de IBS e CBS focado na Zona Franca de Manaus, nas Áreas de Livre Comércio, no Amazonas e em Roraima, e com a legislação na íntegra, um artigo por âncora.

## Rodar

```bash
npm install
npm run dev        # http://localhost:4321 (use --port para outra porta)
npm run build      # gera dist/ e confere todos os links e âncoras
```

## Legislação

As normas ficam em `fontes/normas.json` (id, URL oficial, grupo, divisão em páginas). O texto é gerado por script, nunca editado à mão:

```bash
npm run fontes:baixar                 # baixa o HTML/PDF oficial (fontes/html, fora do Git) e registra hash e data em fontes/capturas.json
python -I scripts/extrair-pdf.py fontes/html/<id>.pdf fontes/texto/<id>.txt   # só para PDF
npm run fontes:converter              # gera src/content/docs/legislacao/** e src/data/*.json
node scripts/checar-citacoes.mjs      # confere os links do manual contra os artigos convertidos
```

O conversor remove o texto riscado (redações revogadas do texto compilado do Planalto), trata o texto citado em alterações de outras leis como citação e divide normas grandes por Livro/Título/Anexo.

## Manual

Capítulos em `src/content/docs/manual/`. Regras de redação em `docs/BRIEF-MANUAL.md`: toda regra com link para o artigo, sem fonte não entra.

## Publicação

`.github/workflows/deploy.yml` publica no GitHub Pages a cada push na `main` (Settings > Pages > Source: GitHub Actions).
