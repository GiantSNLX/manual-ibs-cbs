// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import prefixarBase from './src/plugins/prefixar-base.mjs';
import { readFileSync } from 'node:fs';

// Menu da legislação gerado por scripts/converter-fontes.mjs.
const legislacao = JSON.parse(readFileSync(new URL('./src/data/legislacao.json', import.meta.url), 'utf8'));
const GRUPOS = { federal: 'Legislação federal', 'zfm-alc': 'Zona Franca e ALC', cgibs: 'Comitê Gestor do IBS', amazonas: 'Amazonas', roraima: 'Roraima' };
const menuLegislacao = Object.entries(GRUPOS)
  .map(([grupo, label]) => ({
    label,
    collapsed: true,
    items: legislacao
      .filter((n) => n.grupo === grupo)
      .map((n) => (n.paginas.length
        ? { label: n.rotulo, collapsed: true, items: [{ label: 'Apresentação e sumário', link: n.link }, ...n.paginas] }
        : { label: n.rotulo, link: n.link })),
  }))
  .filter((g) => g.items.length);

// No GitHub Pages o site fica em https://<usuario>.github.io/<repositorio>/.
// O workflow define SITE e BASE_PATH; localmente fica na raiz.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site: process.env.SITE || 'http://localhost:4400',
  base,
  trailingSlash: 'always',
  markdown: { rehypePlugins: [[prefixarBase, { base }]] },
  integrations: [
    starlight({
      title: 'Manual IBS e CBS',
      description: 'IBS e CBS na Zona Franca de Manaus, no Amazonas e em Roraima, com a legislação na íntegra.',
      defaultLocale: 'root',
      locales: { root: { label: 'Português', lang: 'pt-BR' } },
      logo: { src: './src/assets/marca.svg', alt: '' },
      customCss: [
        '@fontsource-variable/geist',
        '@fontsource-variable/geist-mono',
        './src/styles/tema.css',
        './src/styles/legislacao.css',
        './src/styles/inicio.css',
      ],
      components: { Hero: './src/components/Hero.astro' },
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 },
      lastUpdated: false,
      pagination: true,
      sidebar: [
        { label: 'Início', link: '/' },
        { label: 'Manual', items: [{ autogenerate: { directory: 'manual' } }] },
        ...menuLegislacao,
        { label: 'Fontes', link: '/fontes/' },
      ],
    }),
  ],
});
