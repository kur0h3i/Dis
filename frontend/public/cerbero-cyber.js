/* Cerbero Cyber: fondo (lluvia de código + suelo) y botón de modo sereno. Sin dependencias.
   Uso: <script src="/static/cerbero-cyber.js" defer></script>  (necesita <canvas id="bg"> o lo crea él) */
(() => {
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'cerbero-calm';
  const root = document.documentElement;
  // Dis: sereno por defecto; solo el modo completo (KEY=0) enciende el fondo.
  try { if (localStorage.getItem(KEY) !== '0') root.setAttribute('data-calm', ''); } catch { root.setAttribute('data-calm', ''); }
  let c = document.getElementById('bg');
  if (!c) { c = document.createElement('canvas'); c.id = 'bg'; c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none'; document.body.prepend(c); }
  const x = c.getContext('2d'), G = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ01234567890ABCDEF<>/#$%';
  let W, H, cols, drops;
  const size = () => { W = c.width = innerWidth; H = c.height = innerHeight; cols = Math.ceil(W / 18); drops = Array.from({ length: cols }, () => Math.random() * -60); };
  size(); addEventListener('resize', size);
  const frame = () => {
    if (!root.hasAttribute('data-calm') && !rm) {
      x.fillStyle = 'rgba(3,5,12,.16)'; x.fillRect(0, 0, W, H); x.font = '15px "Share Tech Mono",monospace';
      for (let i = 0; i < cols; i++) { const y = drops[i] * 18; x.fillStyle = Math.random() < .04 ? '#ff2e88' : '#00c4d4'; x.globalAlpha = .55;
        x.fillText(G[Math.random() * G.length | 0], i * 18, y); if (y > H && Math.random() > .975) drops[i] = Math.random() * -20; drops[i] += .45; }
      x.globalAlpha = 1; const hz = H * .74, t = (performance.now() / 1000) % 1; x.strokeStyle = 'rgba(122,61,240,.55)'; x.beginPath();
      for (let i = -14; i <= 14; i++) { x.moveTo(W / 2 + i * 12, hz); x.lineTo(W / 2 + i * W / 9, H); } x.stroke();
      for (let j = 0; j < 9; j++) { const y = hz + (H - hz) * ((j + t) / 9) ** 2; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
    }
    if (!rm) requestAnimationFrame(frame);
    else if (!root.hasAttribute('data-calm')) x.clearRect(0, 0, W, H);
  };
  x.fillStyle = '#03050c'; x.fillRect(0, 0, W, H); frame();
  // botón: <button data-cyber-calm>Modo sereno</button>
  // delegado: el botón lo pinta React después de cargar este script
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-cyber-calm]')) return;
    const on = !root.hasAttribute('data-calm'); root.toggleAttribute('data-calm', on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  });
})();
