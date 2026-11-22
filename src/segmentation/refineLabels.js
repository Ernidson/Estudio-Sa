// Compare colours with nearby interior predictions. Transparent gaps and isolated
// components stay unassigned. Labels are 1-based; zero means unknown.
export function refineLabels(labels, alpha, rgba, w, h) {
  const out = labels.slice();
  const radius = Math.max(2, Math.round(Math.min(w, h) / 64));
  const stride = Math.max(1, Math.floor(radius / 4));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!alpha[i]) continue;
      const current = labels[i];
      if (current && x >= radius && y >= radius && x + radius < w && y + radius < h &&
          [i - radius, i + radius, i - radius * w, i + radius * w].every(j => labels[j] === current)) continue;
      const votes = new Float32Array(25);
      for (let dy = -radius; dy <= radius; dy += stride) {
        for (let dx = -radius; dx <= radius; dx += stride) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const j = yy * w + xx, label = labels[j];
          if (!label || !alpha[((y + yy) >> 1) * w + ((x + xx) >> 1)]) continue;
          const diff = Math.abs(rgba[4*i] - rgba[4*j]) + Math.abs(rgba[4*i+1] - rgba[4*j+1]) + Math.abs(rgba[4*i+2] - rgba[4*j+2]);
          if (diff > 90) continue;
          votes[label] += (1 - diff / 91) / (1 + (dx*dx + dy*dy) / (radius*radius));
        }
      }
      let best = current;
      for (let k = 1; k < votes.length; k++) if (votes[k] > votes[best]) best = k;
      if (votes[best] >= 2) out[i] = best;
    }
  }
  return out;
}

// Recover hair crossing the predicted neckline only when head and clothing have
// distinct colours in this PNG. Growth stays connected to a head prediction.
export function recoverHeadBoundary(labels, rgba, w, h) {
  const sums = [[0, 0, 0], [0, 0, 0]];
  const counts = [0, 0];
  const queue = new Int32Array(labels.length);
  let tail = 0;
  for (let i = 0; i < labels.length; i++) {
    const k = labels[i];
    if (k !== 1 && k !== 2 && k !== 13 && k !== 14) continue;
    const group = Number(k > 2);
    counts[group]++;
    for (let c = 0; c < 3; c++) sums[group][c] += rgba[4*i+c];
    if (!group) queue[tail++] = i;
  }
  if (counts.some(n => !n)) return;
  const means = sums.map((sum, group) => sum.map(v => v / counts[group]));
  const separation = means[0].reduce((d, v, c) => d + (v - means[1][c])**2, 0);
  if (separation < 3600) return;
  let first = 0;
  const limit = Math.ceil(Math.min(w, h) * 0.055);
  for (let depth = 0; depth < limit && first < tail; depth++) {
    const end = tail;
    while (first < end) {
      const i = queue[first++];
      for (const j of [i - w, i + w, i % w ? i - 1 : -1, i % w < w - 1 ? i + 1 : -1]) {
        if (labels[j] !== 13 && labels[j] !== 14) continue;
        let head = 0, torso = 0;
        for (let c = 0; c < 3; c++) {
          head += (rgba[4*j+c] - means[0][c])**2;
          torso += (rgba[4*j+c] - means[1][c])**2;
        }
        if (head >= torso * 0.25 || head >= separation * 0.3) continue;
        labels[j] = labels[i];
        queue[tail++] = j;
      }
    }
  }
}
