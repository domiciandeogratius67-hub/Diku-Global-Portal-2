(() => {
  const app = $('#app');
  const say = (el, m, err) => el.replaceChildren(h('p', { class: 'msg' + (err ? ' err' : '') }, m));
  const date = s => new Date(s).toLocaleString();
  const logout = async () => { try { await api('/api/admin/logout', { method: 'POST' }); } catch (e) { /* already out */ } login(); };
  const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { if (e.status === 401) login(); else alert(errText(e)); } };

  async function uploadFile(file) {
    const fd = new FormData(); fd.append('file', file);
    const r = await fetch('/api/admin/upload', { method: 'POST', body: fd, headers: { 'X-Requested-With': 'diku' }, credentials: 'same-origin' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || 'Upload failed'), { status: r.status, ref: d.ref });
    return d.url;
  }
  function uploadButton(label, onUrl) {
    return h('label', { class: 'btn up alt' }, label, h('input', { type: 'file', class: 'vh', accept: 'image/jpeg,image/png,image/webp', onchange: guard(async e => {
      const f = e.target.files[0]; if (!f) return; onUrl(await uploadFile(f)); e.target.value = '';
    }) }));
  }

  function login() {
    const out = h('div');
    const f = h('form', { class: 'stack', onsubmit: async e => {
      e.preventDefault(); const fd = new FormData(f);
      try { await api('/api/admin/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } }); start(); }
      catch (err) { say(out, errText(err), true); }
    } },
      h('h1', {}, 'Admin sign in'),
      h('label', {}, 'Email', h('input', { name: 'email', type: 'email', required: true, autocomplete: 'username' })),
      h('label', {}, 'Password', h('input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' })),
      out, h('button', { class: 'btn dark' }, 'Sign in'));
    app.replaceChildren(h('div', { class: 'wrap narrow' }, f));
  }

  function dash(sum) {
    const panel = h('div');
    const tabs = { Orders: ordersTab, Products: productsTab, Images: imagesTab, 'Hero & company': settingsTab, Messages: messagesTab, Errors: errorsTab, Activity: auditTab };
    const bar = h('div', { class: 'tabs', role: 'tablist' });
    const open = name => { [...bar.children].forEach(b => b.setAttribute('aria-selected', b.dataset.t === name)); guard(tabs[name])(panel); };
    Object.keys(tabs).forEach(n => bar.append(h('button', { role: 'tab', 'data-t': n, onclick: () => open(n) }, n)));
    bar.append(h('button', { onclick: logout }, 'Sign out'));
    app.replaceChildren(h('h1', {}, 'Diku Global admin'),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', {}, sum.newOrders), 'New orders'),
        h('div', { class: 'stat' + (sum.openErrors ? ' warn' : '') }, h('b', {}, sum.openErrors), 'Open errors'),
        h('div', { class: 'stat' }, h('b', {}, sum.products), 'Live products')),
      bar, panel);
    open(sum.openErrors ? 'Errors' : 'Orders');
  }

  async function ordersTab(p) {
    const rows = await api('/api/admin/orders');
    if (!rows.length) return p.replaceChildren(h('p', {}, 'No orders yet.'));
    p.replaceChildren(h('div', { class: 'scroll' }, h('table', {},
      h('tr', {}, ['When', 'Product', 'Price', 'Customer', 'Phone', 'Note', 'Status'].map(x => h('th', {}, x))),
      rows.map(o => h('tr', {}, h('td', {}, date(o.createdAt)), h('td', {}, o.productName), h('td', {}, money(o.price)),
        h('td', {}, o.name), h('td', {}, h('a', { href: 'tel:' + o.phone }, o.phone)), h('td', {}, o.note),
        h('td', {}, h('select', { 'aria-label': 'Status', onchange: guard(e => api('/api/admin/orders/' + o.id, { method: 'PATCH', body: { status: e.target.value } })) },
          ['new', 'contacted', 'paid', 'delivered', 'cancelled'].map(s => h('option', { value: s, ...(s === o.status ? { selected: true } : {}) }, s)))))))));
  }

  async function messagesTab(p) {
    const rows = await api('/api/admin/messages');
    if (!rows.length) return p.replaceChildren(h('p', {}, 'No messages yet.'));
    p.replaceChildren(h('div', { class: 'scroll' }, h('table', {},
      h('tr', {}, ['When', 'Topic', 'Name', 'Phone', 'Message'].map(x => h('th', {}, x))),
      rows.map(m => h('tr', {}, h('td', {}, date(m.createdAt)), h('td', {}, m.topic), h('td', {}, m.name), h('td', {}, h('a', { href: 'tel:' + m.phone }, m.phone)), h('td', {}, m.message))))));
  }

  async function productsTab(p) {
    const list = await api('/api/admin/products');
    const form = (prod = {}) => {
      const out = h('div');
      const img = h('input', { name: 'image', value: prod.image || '', placeholder: '/uploads/... or https://...' });
      const f = h('form', { class: 'stack', onsubmit: guard(async e => {
        e.preventDefault(); const fd = new FormData(f);
        const body = { name: fd.get('name'), category: 'devices', price: Number(fd.get('price')), tag: fd.get('tag'), summary: fd.get('summary'),
          specs: fd.get('specs').split('\n').map(x => x.trim()).filter(Boolean), image: fd.get('image'),
          featured: fd.get('featured') === 'on', active: fd.get('active') === 'on' };
        try { await api('/api/admin/products' + (prod.id ? '/' + prod.id : ''), { method: prod.id ? 'PUT' : 'POST', body }); f.closest('dialog').close(); productsTab(p); }
        catch (err) { if (err.status === 401) throw err; say(out, errText(err), true); }
      }) },
        h('label', {}, 'Name', h('input', { name: 'name', required: true, maxlength: 120, value: prod.name || '' })),
        h('label', {}, 'Price (TZS)', h('input', { name: 'price', type: 'number', min: 0, step: 1, required: true, value: prod.price ?? '' })),
        h('label', {}, 'Tag (e.g. High speed, Portable)', h('input', { name: 'tag', maxlength: 30, value: prod.tag || '' })),
        h('label', {}, 'Summary', h('textarea', { name: 'summary', maxlength: 500 }, prod.summary || '')),
        h('label', {}, 'Specs (one per line)', h('textarea', { name: 'specs' }, (prod.specs || []).join('\n'))),
        h('label', {}, 'Picture', img), uploadButton('Upload picture', url => { img.value = url; }),
        h('label', {}, h('span', {}, h('input', { name: 'featured', type: 'checkbox', ...(prod.featured ? { checked: true } : {}) }), ' Show in spotlight')),
        h('label', {}, h('span', {}, h('input', { name: 'active', type: 'checkbox', ...(prod.active !== false ? { checked: true } : {}) }), ' Visible on site')),
        out, h('button', { class: 'btn dark' }, 'Save'));
      modal(prod.id ? 'Edit product' : 'Add product', f);
    };
    p.replaceChildren(h('button', { class: 'btn dark', onclick: () => form() }, 'Add product'),
      h('div', { class: 'scroll' }, h('table', {},
        h('tr', {}, ['Name', 'Price', 'Tag', 'Visible', 'Spotlight', ''].map(x => h('th', {}, x))),
        list.map(x => h('tr', {}, h('td', {}, x.name), h('td', {}, money(x.price)), h('td', {}, x.tag), h('td', {}, x.active ? 'Yes' : 'No'), h('td', {}, x.featured ? 'Yes' : 'No'),
          h('td', {}, h('button', { class: 'btn alt', onclick: () => form(x) }, 'Edit'), ' ',
            h('button', { class: 'btn alt', onclick: guard(async () => { if (confirm('Delete ' + x.name + '?')) { await api('/api/admin/products/' + x.id, { method: 'DELETE' }); productsTab(p); } }) }, 'Delete')))))));
  }

  async function imagesTab(p) {
    const list = await api('/api/admin/images');
    p.replaceChildren(uploadButton('Upload image (JPG, PNG, WebP, max 5 MB)', () => imagesTab(p)),
      list.length ? h('div', { class: 'thumbs' }, list.map(i => h('figure', {}, h('img', { src: i.url, alt: '', loading: 'lazy' }),
        h('figcaption', {},
          h('button', { class: 'btn alt', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(i.url); } }, 'Copy link'),
          h('button', { class: 'btn alt', onclick: guard(async () => { if (confirm('Delete this image? Pages using it will show no picture.')) { await api('/api/admin/images/' + i.id, { method: 'DELETE' }); imagesTab(p); } }) }, 'Delete')))))
        : h('p', {}, 'No images yet.'));
  }

  async function settingsTab(p) {
    const s = await api('/api/settings'), c = s.company, out = h('div');
    const hero = h('textarea', { name: 'hero' }, s.heroImages.join('\n'));
    const f = h('form', { class: 'stack', onsubmit: guard(async e => {
      e.preventDefault(); const fd = new FormData(f);
      const body = { company: { name: fd.get('name'), tagline: fd.get('tagline'), phone: fd.get('phone'), email: fd.get('email'), address: fd.get('address'), regNo: fd.get('regNo'), tin: fd.get('tin') },
        whatsapp: fd.get('whatsapp'), heroImages: fd.get('hero').split('\n').map(x => x.trim()).filter(Boolean) };
      try { await api('/api/admin/settings', { method: 'PUT', body }); say(out, 'Saved.'); } catch (err) { if (err.status === 401) throw err; say(out, errText(err), true); }
    }) },
      h('h2', {}, 'Home page hero images'),
      h('label', {}, 'One image per line. They rotate as the home page background.', hero),
      uploadButton('Upload hero image', url => { hero.value = (hero.value.trim() ? hero.value.trim() + '\n' : '') + url; }),
      h('h2', {}, 'Company details'),
      h('div', { class: 'cols' },
        h('label', {}, 'Company name', h('input', { name: 'name', required: true, value: c.name })),
        h('label', {}, 'Phone', h('input', { name: 'phone', required: true, value: c.phone })),
        h('label', {}, 'Email', h('input', { name: 'email', type: 'email', required: true, value: c.email })),
        h('label', {}, 'WhatsApp (digits, country code, no +)', h('input', { name: 'whatsapp', required: true, pattern: '[0-9]{9,15}', value: s.whatsapp })),
        h('label', {}, 'Registration number (BRELA)', h('input', { name: 'regNo', value: c.regNo })),
        h('label', {}, 'TIN', h('input', { name: 'tin', value: c.tin }))),
      h('label', {}, 'Tagline', h('input', { name: 'tagline', required: true, value: c.tagline })),
      h('label', {}, 'Address', h('input', { name: 'address', required: true, value: c.address })),
      out, h('button', { class: 'btn dark' }, 'Save changes'));
    p.replaceChildren(f);
  }

  async function errorsTab(p, status = 'open') {
    const rows = await api('/api/admin/errors?status=' + status);
    const sel = h('select', { 'aria-label': 'Filter', onchange: e => errorsTab(p, e.target.value) },
      ['open', 'resolved', 'all'].map(v => h('option', { value: v, ...(v === status ? { selected: true } : {}) }, v)));
    p.replaceChildren(h('div', { class: 'cols' }, h('label', {}, 'Show', sel),
      h('button', { class: 'btn alt', onclick: guard(async () => { if (confirm('Delete all resolved errors?')) { await api('/api/admin/errors', { method: 'DELETE' }); errorsTab(p, status); } }) }, 'Clear resolved')),
      rows.length ? h('div', { class: 'scroll' }, h('table', {},
        h('tr', {}, ['Last seen', 'Times', 'Where', 'What happened', 'Status', ''].map(x => h('th', {}, x))),
        rows.map(r => h('tr', {}, h('td', {}, date(r.lastSeen), h('br'), h('small', {}, 'first ' + date(r.firstSeen))), h('td', {}, r.count),
          h('td', {}, r.source + (r.url ? ' ' + r.url : ''), r.method ? h('br') : null, r.method ? r.method + (r.status ? ' ' + r.status : '') : null),
          h('td', {}, r.message, r.stack ? h('details', {}, h('summary', {}, 'Details'), h('pre', {}, r.stack + (r.requestId ? '\nref ' + r.requestId : ''))) : null),
          h('td', {}, h('span', { class: 'badge' + (r.resolved ? ' ok' : '') }, r.resolved ? 'resolved' : 'open')),
          h('td', {}, h('button', { class: 'btn alt', onclick: guard(async () => { await api('/api/admin/errors/' + r.id, { method: 'PATCH', body: { resolved: !r.resolved } }); errorsTab(p, status); }) }, r.resolved ? 'Reopen' : 'Mark fixed'))))))
        : h('p', {}, 'No errors here. Good.'));
  }

  async function auditTab(p) {
    const rows = await api('/api/admin/audit');
    p.replaceChildren(h('p', {}, 'Logins and changes made in this panel (last 300).'), h('div', { class: 'scroll' }, h('table', {},
      h('tr', {}, ['When', 'Who', 'Action', 'Detail', 'IP'].map(x => h('th', {}, x))),
      rows.map(r => h('tr', {}, h('td', {}, date(r.at)), h('td', {}, r.actor), h('td', {}, r.action), h('td', {}, r.detail), h('td', {}, r.ip))))));
  }

  async function start() { try { dash(await api('/api/admin/me')); } catch (e) { login(); } }
  start();
})();
