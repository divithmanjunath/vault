// Force-directed graph on <canvas>: notes are nodes, [[links]] are edges.
// Supports drag, pan, wheel/pinch zoom, hover/tap highlight. No dependencies.
(function (global) {
  'use strict';

  function create(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const onOpen = opts.onOpen || (() => {});
    let nodes = [], edges = [], byId = new Map(), adj = new Map();
    let W = 0, H = 0, dpr = 1;
    const view = { x: 0, y: 0, k: 1 };
    let alpha = 0, raf = 0, hover = null, focusId = null, group = null, autoFit = true;
    let theme = {};
    const pointers = new Map();
    let pinch = null, pan = null, drag = null, downNode = null, moved = false;

    // ---------- data ----------
    function setData(data, focus) {
      const old = byId;
      focusId = focus || null;
      nodes = data.nodes.map(n => {
        const o = old.get(n.id);
        return Object.assign({ x: o ? o.x : NaN, y: o ? o.y : NaN, vx: 0, vy: 0 }, n);
      });
      byId = new Map(nodes.map(n => [n.id, n]));
      edges = data.edges.filter(e => byId.has(e.a) && byId.has(e.b)).map(e => ({ a: byId.get(e.a), b: byId.get(e.b), weak: !!e.weak }));
      adj = new Map(nodes.map(n => [n, new Set()]));
      for (const e of edges) { adj.get(e.a).add(e.b); adj.get(e.b).add(e.a); }
      for (const n of nodes) n.r = (n.kind === 'tag' ? 3.5 : 4.5) + Math.sqrt(adj.get(n).size) * 2.2;

      // place new nodes next to an already-placed neighbour, else on a spiral
      let placedAny = nodes.some(n => !isNaN(n.x));
      nodes.forEach((n, i) => {
        if (!isNaN(n.x)) return;
        const nb = [...adj.get(n)].find(m => !isNaN(m.x));
        if (nb) { n.x = nb.x + (Math.random() - .5) * 40; n.y = nb.y + (Math.random() - .5) * 40; }
        else { const a = i * 2.39996, r = 18 * Math.sqrt(i + 1); n.x = Math.cos(a) * r; n.y = Math.sin(a) * r; }
      });
      if (!placedAny) { alpha = 1; for (let i = 0; i < 300; i++) step(); fit(); }
      hover = null;
      autoFit = true;
      reheat(placedAny ? 0.5 : 0.15);
    }

    // ---------- physics ----------
    function step() {
      const n = nodes.length;
      const REP = 150 * alpha, SPRING = 0.05 * alpha, LEN = 55, GRAV = 0.01 * alpha;
      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < n; j++) {
          const b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 > 360000) continue;
          if (d2 < 0.01) { dx = Math.random() - .5; dy = Math.random() - .5; d2 = 0.25; }
          const f = REP / d2;
          a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
        }
      }
      for (const e of edges) {
        const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        // topic edges are longer and looser so hubs don't knot the layout
        const f = (d - (e.weak ? LEN * 1.8 : LEN)) * (e.weak ? SPRING * 0.35 : SPRING) / d;
        e.a.vx += dx * f; e.a.vy += dy * f; e.b.vx -= dx * f; e.b.vy -= dy * f;
      }
      // pull harder along the short screen axis so the layout matches the screen's shape
      const ar = W && H ? Math.min(2.5, Math.max(0.4, H / W)) : 1;
      const gx = GRAV * Math.sqrt(ar), gy = GRAV / Math.sqrt(ar);
      for (const p of nodes) {
        p.vx -= p.x * gx; p.vy -= p.y * gy;
        if (p === drag) { p.vx = p.vy = 0; continue; }
        p.vx *= 0.6; p.vy *= 0.6;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 30) { p.vx *= 30 / sp; p.vy *= 30 / sp; }
        p.x += p.vx; p.y += p.vy;
      }
      alpha *= 0.985;
    }

    function reheat(a) {
      alpha = Math.max(alpha, a);
      if (!raf) raf = requestAnimationFrame(loop);
    }
    function loop() {
      raf = 0;
      if (alpha > 0.004) { step(); raf = requestAnimationFrame(loop); }
      if (autoFit) fit(true); else draw();
    }

    // ---------- view ----------
    function toWorld(sx, sy) { return { x: (sx - W / 2 - view.x) / view.k, y: (sy - H / 2 - view.y) / view.k }; }
    function zoomAt(sx, sy, k) {
      autoFit = false;
      k = Math.min(6, Math.max(0.15, k));
      const w = toWorld(sx, sy);
      view.k = k;
      view.x = sx - W / 2 - w.x * k;
      view.y = sy - H / 2 - w.y * k;
      draw();
    }
    function fit(smooth) {
      if (!nodes.length || !W) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
      // leave room for labels and the topic legend along the bottom
      const padX = Math.min(60, W * 0.06), padTop = 40, padBottom = 80;
      const k = Math.min(2, Math.max(0.2, Math.min((W - padX * 2) / (x1 - x0 || 1), (H - padTop - padBottom) / (y1 - y0 || 1))));
      const tx = -((x0 + x1) / 2) * k, ty = -((y0 + y1) / 2) * k + (padTop - padBottom) / 2;
      const t = smooth ? 0.15 : 1;
      view.k += (k - view.k) * t; view.x += (tx - view.x) * t; view.y += (ty - view.y) * t;
      draw();
    }
    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      draw();
    }
    function readTheme() {
      const cs = getComputedStyle(canvas);
      const v = n => cs.getPropertyValue(n).trim();
      theme = { bg: v('--bg'), text: v('--text'), muted: v('--muted'), border: v('--border'), accent: v('--accent') };
    }

    // ---------- drawing ----------
    function draw() {
      if (!W) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);
      if (!nodes.length) {
        ctx.fillStyle = theme.muted; ctx.font = '14px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('No notes to show', W / 2, H / 2);
        return;
      }
      ctx.translate(W / 2 + view.x, H / 2 + view.y);
      ctx.scale(view.k, view.k);
      const k = view.k;

      // which nodes are "lit"
      let lit = null;
      if (hover) { lit = new Set(adj.get(hover)); lit.add(hover); }
      else if (group) { lit = new Set(nodes.filter(n => n.group === group || (n.groups && n.groups.includes(group)))); }
      const isLit = n => !lit || lit.has(n);

      ctx.lineWidth = 1 / k;
      for (const e of edges) {
        const on = hover ? (e.a === hover || e.b === hover) : lit ? (lit.has(e.a) && lit.has(e.b)) : true;
        ctx.globalAlpha = on ? (hover ? 0.9 : 0.55) : 0.08;
        ctx.strokeStyle = on && hover ? theme.accent : theme.muted;
        ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke();
      }

      for (const n of nodes) {
        ctx.globalAlpha = isLit(n) ? 1 : 0.15;
        ctx.fillStyle = n.color || theme.muted;
        ctx.beginPath();
        if (n.kind === 'tag') {
          const s = n.r * 1.15;
          ctx.moveTo(n.x, n.y - s); ctx.lineTo(n.x + s, n.y); ctx.lineTo(n.x, n.y + s); ctx.lineTo(n.x - s, n.y); ctx.closePath();
        } else ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (n.kind === 'missing') { ctx.globalAlpha *= 0.45; }
        ctx.fill();
        if (n.id === focusId) {
          ctx.globalAlpha = 1; ctx.strokeStyle = theme.text; ctx.lineWidth = 2 / k;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3 / k + 1, 0, Math.PI * 2); ctx.stroke();
          ctx.lineWidth = 1 / k;
        }
      }

      // labels at a constant on-screen size
      const fs = 12 / k;
      ctx.font = `${fs}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const showAll = nodes.length <= 80 ? k > 0.45 : k > 0.85;
      for (const n of nodes) {
        const strong = (lit && lit.has(n) && (hover || group)) || n.id === focusId;
        if (!showAll && !strong) continue;
        ctx.globalAlpha = isLit(n) ? (strong ? 1 : 0.8) : 0.12;
        ctx.fillStyle = n.kind === 'note' ? theme.text : theme.muted;
        const label = n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label;
        ctx.fillText(label, n.x, n.y + n.r + 3 / k);
      }
      ctx.globalAlpha = 1;
    }

    // ---------- input ----------
    function hit(sx, sy) {
      const w = toWorld(sx, sy);
      let best = null, bd = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(n.x - w.x, n.y - w.y);
        const reach = n.r + 8 / view.k;   // ~8 screen px of slack for fingers
        if (d < reach && d < bd) { best = n; bd = d; }
      }
      return best;
    }
    const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
        drag = null; pan = null; moved = true;
        return;
      }
      moved = false;
      downNode = hit(p.x, p.y);
      if (downNode) { drag = downNode; if (e.pointerType !== 'mouse') { hover = downNode; draw(); } }
      else pan = { x: p.x, y: p.y, vx: view.x, vy: view.y };
      pan && (pan.start = p); drag && (drag.start = p);
    });

    canvas.addEventListener('pointermove', e => {
      const p = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
        return;
      }
      if (drag) {
        if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 4) moved = true;
        if (moved) { autoFit = false; const w = toWorld(p.x, p.y); drag.x = w.x; drag.y = w.y; reheat(0.3); }
        return;
      }
      if (pan) {
        if (Math.hypot(p.x - pan.start.x, p.y - pan.start.y) > 4) moved = true;
        if (moved) { autoFit = false; view.x = pan.vx + p.x - pan.x; view.y = pan.vy + p.y - pan.y; draw(); }
        return;
      }
      if (e.pointerType === 'mouse') {
        const h = hit(p.x, p.y);
        canvas.style.cursor = h ? 'pointer' : 'grab';
        if (h !== hover) { hover = h; draw(); }
      }
    });

    function end(e) {
      pointers.delete(e.pointerId);
      if (pinch) { if (pointers.size < 2) pinch = null; if (pointers.size === 0) moved = false; return; }
      if (!moved && downNode) onOpen(downNode);
      else if (!moved && !downNode && e.pointerType !== 'mouse') { hover = null; draw(); }
      if (drag && e.pointerType !== 'mouse') { hover = null; draw(); }
      drag = null; pan = null; downNode = null;
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag && hover) { hover = null; draw(); } });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, view.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });

    new ResizeObserver(resize).observe(canvas);

    return {
      setData,
      fit() { autoFit = true; fit(); },
      show() { readTheme(); resize(); },
      setGroup(g) { group = g; draw(); },
      zoom(f) { zoomAt(W / 2, H / 2, view.k * f); },
      refreshTheme() { readTheme(); draw(); },
      get nodes() { return nodes; },
      get view() { return view; },
    };
  }

  global.Graph = { create };
})(this);
