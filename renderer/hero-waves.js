const layers = [
  {color: '#303b7f', center: .34, thickness: .18, opacity: .39, shift: .2},
  {color: '#2b3974', center: .49, thickness: .19, opacity: .56, shift: 1.6},
  {color: null, center: .69, thickness: .21, opacity: .61, shift: 2.7}
];

const samples = 48;
const featherSteps = 20;
const twoPi = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function startHeroWaves(surface) {
  const front = document.createElement('canvas');
  const back = document.createElement('canvas');
  const display = front.getContext('2d');
  const paint = back.getContext('2d');
  if (!display || !paint) return;

  front.className = 'hero-wave-canvas';
  front.hidden = true;
  surface.append(front);

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(any-pointer: fine)');
  const region = surface.dataset.waveRegion && document.querySelector(surface.dataset.waveRegion);
  const scope = surface.closest('.wave-hero');
  const header = region && scope?.querySelector('.masthead');
  const waveColor = getComputedStyle(surface).getPropertyValue('--wave-color').trim() || '#473466';
  const centers = new Float32Array(samples + 1);
  const thicknesses = new Float32Array(samples + 1);
  let frame = 0;
  let lastTime = 0;
  let phase = 0;
  let bounds;
  let boundsDirty = true;
  let sizeDirty = true;
  let onScreen = false;
  let lost = false;
  let palette;
  let pointer = null;
  let pullX = .5;
  let pullY = .5;
  let pullStrength = 0;

  function measure() {
    if (region && sizeDirty) {
      const height = region.offsetHeight + (header?.offsetHeight ?? 0);
      surface.style.setProperty('--hero-art-height', height + 'px');
    }
    bounds = surface.getBoundingClientRect();
    boundsDirty = false;
    if (!sizeDirty) return;
    sizeDirty = false;
    if (bounds.width < 1 || bounds.height < 1) return;

    // Limit raster work independently of viewport size and device pixel ratio.
    const scale = Math.min(1, 960 / bounds.width, 680 / bounds.height, Math.sqrt(480000 / (bounds.width * bounds.height)));
    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));
    if (width !== back.width || height !== back.height) {
      back.width = width;
      back.height = height;
    }
    palette = paint.createLinearGradient(0, 0, width, height);
    palette.addColorStop(0, '#242951');
    palette.addColorStop(.56, waveColor);
    palette.addColorStop(1, '#31213f');
  }

  function drawRibbon(layer, index) {
    const width = back.width;
    const height = back.height;
    const step = width / samples;
    for (let i = 0; i <= samples; i++) {
      const x = i / samples;
      const distance = x - pullX;
      const influence = Math.exp(-distance * distance * 8);
      const curl = Math.sin(distance * 7 + phase * 1.3 + layer.shift);
      const bend = pullStrength * influence * ((pullY - .5) * .38 + curl * .12);
      const drift = .055 * Math.sin(phase * (1 - index * .16) + layer.shift);
      const wave = .11 * Math.sin(twoPi * x - .35 + layer.shift * .13 + phase * .19);
      centers[i] = (layer.center + drift + wave - .18 * (x - .5) + bend) * height;
      thicknesses[i] = layer.thickness * (.9 + .13 * Math.sin(twoPi * x + layer.shift)) * height;
    }

    paint.fillStyle = layer.color || palette;
    let previousOpacity = 0;
    for (let band = featherSteps; band >= 1; band--) {
      const radius = band / featherSteps;
      const opacity = layer.opacity * (.5 + .5 * Math.cos(Math.PI * radius));
      paint.globalAlpha = (opacity - previousOpacity) / (1 - previousOpacity);
      previousOpacity = opacity;
      paint.beginPath();
      paint.moveTo(-1, centers[0] - thicknesses[0] * radius);
      for (let i = 1; i <= samples; i++) {
        paint.lineTo(i * step, centers[i] - thicknesses[i] * radius);
      }
      for (let i = samples; i >= 0; i--) {
        paint.lineTo(i * step, centers[i] + thicknesses[i] * radius);
      }
      paint.closePath();
      paint.fill();
    }
  }

  function draw(time) {
    frame = 0;
    if (lost || document.hidden || !onScreen) return;
    if (boundsDirty || sizeDirty) measure();
    if (!palette || bounds.width < 1 || bounds.height < 1) return;

    const elapsed = Math.min(time - (lastTime || time), 42);
    lastTime = time;
    const animating = !reduceMotion.matches;
    if (animating) phase += elapsed / 2700;

    const inside = animating && finePointer.matches && pointer &&
      pointer.x >= bounds.left && pointer.x <= bounds.right && pointer.y >= bounds.top && pointer.y <= bounds.bottom;
    const nextX = inside ? (pointer.x - bounds.left) / bounds.width : .5;
    const nextY = inside ? (pointer.y - bounds.top) / bounds.height : .5;
    const smoothing = animating ? 1 - Math.exp(-elapsed / 112) : 1;
    pullX += (clamp(nextX, 0, 1) - pullX) * smoothing;
    pullY += (clamp(nextY, 0, 1) - pullY) * smoothing;
    pullStrength += (Number(Boolean(inside)) - pullStrength) * smoothing;

    paint.globalAlpha = 1;
    paint.clearRect(0, 0, back.width, back.height);
    layers.forEach(drawRibbon);

    // Only present complete frames. The previous frame stays visible during preparation.
    if (front.width !== back.width) front.width = back.width;
    if (front.height !== back.height) front.height = back.height;
    display.globalCompositeOperation = 'copy';
    display.drawImage(back, 0, 0);
    front.hidden = false;
    if (animating) schedule();
  }

  function schedule() {
    if (!frame && onScreen && !lost && !document.hidden) frame = requestAnimationFrame(draw);
  }

  function pause() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  const observer = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) {
      boundsDirty = true;
      schedule();
    } else {
      pause();
    }
  });
  observer.observe(surface);

  const resize = new ResizeObserver(() => {
    sizeDirty = boundsDirty = true;
    schedule();
  });
  resize.observe(surface);
  if (region) resize.observe(region);
  if (header) resize.observe(header);

  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'touch') pointer = {x: event.clientX, y: event.clientY};
  }, {passive: true});
  document.documentElement.addEventListener('pointerleave', () => { pointer = null; }, {passive: true});
  window.addEventListener('blur', () => { pointer = null; });
  window.addEventListener('scroll', () => { boundsDirty = true; }, {passive: true});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pointer = null;
      pause();
    } else {
      boundsDirty = true;
      schedule();
    }
  });
  reduceMotion.addEventListener('change', () => {
    pause();
    schedule();
  });
  for (const canvas of [front, back]) {
    canvas.addEventListener('contextlost', () => {
      lost = true;
      front.hidden = true;
      pause();
    });
    canvas.addEventListener('contextrestored', () => {
      if (display.isContextLost?.() || paint.isContextLost?.()) return;
      lost = false;
      sizeDirty = true;
      schedule();
    });
  }
}

document.querySelectorAll('[data-hero-waves]').forEach(startHeroWaves);
