(async () => {
  await chrome('');
  const key = new URLSearchParams(location.search).get('s');
  const v = SERVICES.find(x => x.key === key && !x.live);
  if (!v) return location.replace('/');
  document.title = v.title; $('#t').textContent = v.title; $('#d').textContent = v.text;
  $('#cf').replaceChildren(contactForm(v.key));
})();
