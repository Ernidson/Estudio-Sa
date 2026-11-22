// Half-open horizontal intervals, in original image coordinates.
export function encodeRegion(mask, width, height) {
  const rows = {};
  for (let y = 0; y < height; y++) {
    const runs = [];
    for (let x = 0; x < width;) {
      if (!mask[y * width + x]) { x++; continue; }
      const start = x++;
      while (x < width && mask[y * width + x]) x++;
      runs.push(start, x);
    }
    if (runs.length) rows[y] = runs;
  }
  return { type: 'raster', rows };
}

const paths = new WeakMap();
export function rasterPath(mask) {
  if (paths.has(mask)) return paths.get(mask);
  const path = new Path2D();
  for (const [y, runs] of Object.entries(mask.rows)) {
    for (let i = 0; i < runs.length; i += 2) path.rect(runs[i], Number(y), runs[i + 1] - runs[i], 1);
  }
  paths.set(mask, path);
  return path;
}

export function rasterBounds(mask) {
  let left = Infinity, top = Infinity, right = 0, bottom = 0;
  for (const [row, runs] of Object.entries(mask.rows)) {
    if (!runs.length) continue;
    left = Math.min(left, runs[0]);
    top = Math.min(top, Number(row));
    right = Math.max(right, runs[runs.length - 1]);
    bottom = Math.max(bottom, Number(row) + 1);
  }
  return left < right ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

export function rasterContains(mask, x, y) {
  const runs = mask.rows[Math.floor(y)] || [];
  for (let i = 0; i < runs.length; i += 2) if (x >= runs[i] && x < runs[i + 1]) return true;
  return false;
}

// Only touched scanlines are decoded. Painting transfers ownership across regions.
export function paintRegion(regions, target, x, y, radius, alpha, width, height) {
  for (let row = Math.max(0, y - radius); row <= Math.min(height - 1, y + radius); row++) {
    const dx = Math.floor(Math.sqrt(radius ** 2 - (row - y) ** 2));
    const left = Math.max(0, x - dx), right = Math.min(width - 1, x + dx);
    for (const region of regions) {
      const mask = region.raster;
      if (!mask || (!mask.rows[row] && region !== target)) continue;
      const line = new Uint8Array(width);
      const runs = mask.rows[row] || [];
      for (let i = 0; i < runs.length; i += 2) line.fill(1, runs[i], runs[i + 1]);
      for (let col = left; col <= right; col++) {
        if (alpha[row * width + col]) line[col] = Number(region === target);
      }
      const updated = encodeRegion(line, width, 1).rows[0];
      if (updated) mask.rows[row] = updated;
      else delete mask.rows[row];
      paths.delete(mask);
    }
  }
}
