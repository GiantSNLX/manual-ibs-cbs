// Links internos escritos como "/legislacao/..." ganham o prefixo do base (GitHub Pages).
export default function prefixarBase({ base = '/' } = {}) {
  const prefixo = base.replace(/\/$/, '');
  const visitar = (no) => {
    if (no.type === 'element' && no.tagName === 'a') {
      const href = no.properties?.href;
      if (prefixo && typeof href === 'string' && href.startsWith('/') && !href.startsWith('//') && !href.startsWith(prefixo + '/')) {
        no.properties.href = prefixo + href;
      }
    }
    no.children?.forEach(visitar);
  };
  return (arvore) => visitar(arvore);
}
