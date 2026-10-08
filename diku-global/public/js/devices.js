(async () => {
  await chrome('devices');
  const list = await api('/api/products?category=devices');
  const g = $('#grid');
  if (!list.length) return g.replaceChildren(h('p', {}, 'No devices listed yet. Check back soon.'));
  g.replaceChildren(...list.map(p => deviceCard(p, showInfo, buyFlow))); setCardImages(g, list);
})();
