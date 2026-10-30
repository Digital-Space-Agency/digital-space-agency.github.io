document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  const t = b.dataset.copy, done = () => { const o = b.dataset.l || (b.dataset.l = b.textContent); b.textContent = 'Copied'; b.classList.add('ok'); setTimeout(() => { b.textContent = o; b.classList.remove('ok'); }, 1800); };
  const fallback = () => { const x = document.createElement('textarea'); x.value = t; x.style.position = 'fixed'; x.style.opacity = '0'; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); done(); } catch (_) {} x.remove(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
});
