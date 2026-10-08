(async () => {
  const s = await chrome('home');
  $('#tagline').textContent = s.company.tagline;
  // hero slideshow (images set by admin)
  const slides = s.heroImages.map(u => { const d = h('div', { class: 'slide' }); d.style.backgroundImage = `url("${u}")`; return d; });
  $('#slides').replaceChildren(...slides);
  if (slides.length) {
    let i = 0; slides[0].classList.add('on');
    if (slides.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      setInterval(() => { slides[i].classList.remove('on'); i = (i + 1) % slides.length; slides[i].classList.add('on'); }, 6000);
  }
  $('#services').replaceChildren(...SERVICES.map(v => h('a', { class: 'svc', href: v.href },
    icon(v.icon), h('h3', {}, v.title), h('small', {}, v.text),
    h('span', { class: 'pill' + (v.live ? '' : ' soon') }, v.live ? 'Available now' : 'Coming soon'))));
  const products = await api('/api/products?category=devices');
  const mk = list => list.map(p => deviceCard(p, showInfo, buyFlow));
  const live = $('#live'); live.replaceChildren(...mk(products.slice(0, 6))); setCardImages(live, products.slice(0, 6));
  const feat = products.filter(p => p.featured);
  const spot = $('#spot'); spot.replaceChildren(...mk(feat)); setCardImages(spot, feat);
  $('#cf').replaceChildren(contactForm(null));
})();
