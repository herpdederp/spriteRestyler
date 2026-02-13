import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ─── Seeded RNG ───
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Pixel helpers ───
function getPixel(data, w, h, x, y) {
  if (x < 0 || x >= w || y < 0 || y >= h) return [0, 0, 0, 0];
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function setPixel(data, w, x, y, r, g, b, a) {
  if (x < 0 || x >= w || y < 0 || y >= (data.length / 4 / w)) return;
  const i = (y * w + x) * 4;
  // alpha blend
  const srcA = a / 255;
  const dstA = data[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  data[i] = (r * srcA + data[i] * dstA * (1 - srcA)) / outA;
  data[i + 1] = (g * srcA + data[i + 1] * dstA * (1 - srcA)) / outA;
  data[i + 2] = (b * srcA + data[i + 2] * dstA * (1 - srcA)) / outA;
  data[i + 3] = outA * 255;
}

function setPixelSolid(data, w, x, y, r, g, b, a) {
  if (x < 0 || x >= w || y < 0 || y >= (data.length / 4 / w)) return;
  const i = (y * w + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
}

function isOpaqueAt(data, w, h, x, y) {
  if (x < 0 || x >= w || y < 0 || y >= h) return false;
  return data[(y * w + x) * 4 + 3] > 20;
}

function isEmptyAt(data, w, h, x, y) {
  if (x < 0 || x >= w || y < 0 || y >= h) return true;
  return data[(y * w + x) * 4 + 3] <= 20;
}

// ─── Pixel Sampling (all opaque pixels + random directions) ───
function findEdges(srcData, w, h, rng) {
  const edges = [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isOpaqueAt(srcData, w, h, x, y)) continue;
      const [r, g, b, a] = getPixel(srcData, w, h, x, y);
      let isEdge = false;
      for (const [dx, dy] of dirs) {
        if (isEmptyAt(srcData, w, h, x + dx, y + dy)) {
          edges.push({ x, y, dx, dy, r, g, b, a, edge: true });
          isEdge = true;
        }
      }
      if (!isEdge && rng) {
        const [dx, dy] = dirs[Math.floor(rng() * 4)];
        edges.push({ x, y, dx, dy, r, g, b, a, edge: false });
      }
    }
  }
  return edges;
}

function findOuterEdgeSet(srcData, w, h) {
  const set = new Set();
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isOpaqueAt(srcData, w, h, x, y)) continue;
      for (const [dx, dy] of dirs) {
        if (isEmptyAt(srcData, w, h, x + dx, y + dy)) {
          set.add(`${x},${y}`);
          break;
        }
      }
    }
  }
  return set;
}

// ─── Expand canvas for effects ───
function expandCanvas(imageData, pad) {
  const { width: w, height: h, data: src } = imageData;
  const nw = w + pad * 2, nh = h + pad * 2;
  const dst = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = ((y + pad) * nw + (x + pad)) * 4;
      dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
    }
  }
  return { data: dst, width: nw, height: nh, pad };
}

// ─── EFFECTS ───

function applySpikes(srcImageData, seed) {
  const pad = 12;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);
  const edges = findEdges(data, w, h, rng);

  // Color shift existing pixels darker/more saturated
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        data[i] = Math.min(255, data[i] * 0.8 + 30);
        data[i + 1] = Math.max(0, data[i + 1] * 0.6);
        data[i + 2] = Math.max(0, data[i + 2] * 0.6);
      }
    }
  }

  // Grow spikes from sprite pixels
  for (const edge of edges) {
    if (rng() > 0.035) continue;
    const len = Math.floor(rng() * 8) + 3;
    const { x, y, dx, dy } = edge;
    for (let i = 1; i <= len; i++) {
      const px = x + dx * i;
      const py = y + dy * i;
      const t = i / len;
      const alpha = Math.floor(255 * (1 - t * 0.7));
      const dark = Math.floor(40 + t * 30);
      setPixel(data, w, px, py, dark, 10, 10, alpha);
      // Widen at base
      if (i < len * 0.4) {
        if (dx !== 0) {
          setPixel(data, w, px, py - 1, dark, 8, 8, alpha * 0.5);
          setPixel(data, w, px, py + 1, dark, 8, 8, alpha * 0.5);
        } else {
          setPixel(data, w, px - 1, py, dark, 8, 8, alpha * 0.5);
          setPixel(data, w, px + 1, py, dark, 8, 8, alpha * 0.5);
        }
      }
    }
  }

  return { data, width: w, height: h };
}

function applyPoison(srcImageData, seed) {
  const pad = 14;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Tint existing pixels green/purple
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = Math.min(255, lum * 0.3 + 20);
        data[i + 1] = Math.min(255, lum * 0.7 + data[i + 1] * 0.4 + 15);
        data[i + 2] = Math.min(255, lum * 0.4 + 40);
      }
    }
  }

  const edges = findEdges(data, w, h, rng);

  // Drips from sprite pixels (heavier downward)
  for (const edge of edges) {
    if (edge.dy !== 1) continue;
    if (rng() > 0.06) continue;
    const len = Math.floor(rng() * 10) + 3;
    for (let i = 1; i <= len; i++) {
      const t = i / len;
      const wobble = Math.round(Math.sin(i * 0.8) * (rng() > 0.5 ? 1 : 0));
      const alpha = Math.floor(220 * (1 - t * 0.6));
      const g = Math.floor(140 + rng() * 60);
      setPixel(data, w, edge.x + wobble, edge.y + i, 20, g, 60, alpha);
    }
    // Drip blob at end
    const bx = edge.x, by = edge.y + len + 1;
    setPixel(data, w, bx, by, 30, 180, 70, 200);
    setPixel(data, w, bx - 1, by, 25, 160, 60, 140);
    setPixel(data, w, bx + 1, by, 25, 160, 60, 140);
    setPixel(data, w, bx, by + 1, 20, 140, 50, 100);
  }

  // Bubbles near edges
  for (let b = 0; b < 12; b++) {
    if (edges.length === 0) break;
    const edge = edges[Math.floor(rng() * edges.length)];
    const radius = Math.floor(rng() * 3) + 2;
    const cx = edge.x + edge.dx * (radius + 2);
    const cy = edge.y + edge.dy * (radius + 2);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          const t = dist / radius;
          const isRim = dist > radius - 1.2;
          const alpha = isRim ? 180 : Math.floor(80 * (1 - t * 0.5));
          const g = isRim ? 220 : 160;
          setPixel(data, w, cx + dx, cy + dy, 30, g, 80, alpha);
        }
      }
    }
    // Highlight
    setPixel(data, w, cx - 1, cy - 1, 150, 255, 180, 160);
  }

  return { data, width: w, height: h };
}

function applyWood(srcImageData, seed) {
  const pad = 6;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Wood grain on existing pixels
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] <= 20) continue;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const grain = Math.sin((y - pad) * 0.7 + Math.sin((x - pad) * 0.3) * 2) * 0.5 + 0.5;
      const ring = Math.sin(Math.sqrt((x - pad - ow / 2) ** 2 + (y - pad - oh / 2) ** 2) * 0.5) * 0.5 + 0.5;
      const wood = grain * 0.6 + ring * 0.4;
      const baseR = 120 + wood * 60 + lum * 0.15;
      const baseG = 70 + wood * 35 + lum * 0.1;
      const baseB = 30 + wood * 15;
      data[i] = Math.min(255, baseR);
      data[i + 1] = Math.min(255, baseG);
      data[i + 2] = Math.min(255, baseB);
    }
  }

  const edges = findEdges(data, w, h, rng);

  // Bark-like texture across sprite
  for (const edge of edges) {
    if (rng() > 0.07) continue;
    const len = Math.floor(rng() * 3) + 1;
    for (let i = 1; i <= len; i++) {
      const brown = 60 + Math.floor(rng() * 40);
      const alpha = Math.floor(200 * (1 - i / (len + 1)));
      setPixel(data, w, edge.x + edge.dx * i, edge.y + edge.dy * i, brown, brown * 0.55, brown * 0.25, alpha);
    }
  }

  // Knots
  for (let k = 0; k < 3; k++) {
    const interiorPixels = [];
    for (let y = pad; y < pad + oh; y++) {
      for (let x = pad; x < pad + ow; x++) {
        if (isOpaqueAt(data, w, h, x, y)) interiorPixels.push([x, y]);
      }
    }
    if (interiorPixels.length === 0) break;
    const [kx, ky] = interiorPixels[Math.floor(rng() * interiorPixels.length)];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 2 && isOpaqueAt(data, w, h, kx + dx, ky + dy)) {
          const ring = Math.sin(dist * 2) * 0.5 + 0.5;
          const i = ((ky + dy) * w + (kx + dx)) * 4;
          data[i] = Math.min(255, data[i] * (0.6 + ring * 0.3));
          data[i + 1] = Math.min(255, data[i + 1] * (0.5 + ring * 0.2));
          data[i + 2] = Math.min(255, data[i + 2] * (0.4 + ring * 0.1));
        }
      }
    }
  }

  return { data, width: w, height: h };
}

function applyPlantGrowth(srcImageData, seed) {
  const pad = 20;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Tint existing pixels green
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        data[i] = Math.max(0, data[i] * 0.75);
        data[i + 1] = Math.min(255, data[i + 1] * 0.85 + 30);
        data[i + 2] = Math.max(0, data[i + 2] * 0.6);
      }
    }
  }

  const edges = findEdges(data, w, h, rng);
  const edgeOnly = edges.filter((e) => e.edge);

  // Moss on surface edges
  for (const edge of edgeOnly) {
    if (rng() > 0.45) continue;
    const mx = edge.x, my = edge.y;
    const i = (my * w + mx) * 4;
    if (data[i + 3] > 20) {
      const g = 60 + Math.floor(rng() * 50);
      data[i] = 20 + Math.floor(rng() * 20);
      data[i + 1] = g;
      data[i + 2] = 10 + Math.floor(rng() * 15);
    }
  }

  // Branching vines from edges
  const vineCount = Math.min(Math.floor(edges.length / 8), 40);
  for (let v = 0; v < vineCount; v++) {
    const edge = edgeOnly.length > 0
      ? edgeOnly[Math.floor(rng() * edgeOnly.length)]
      : edges[Math.floor(rng() * edges.length)];
    let vx = edge.x + edge.dx;
    let vy = edge.y + edge.dy;
    const vineLen = Math.floor(rng() * 14) + 6;
    let dirX = edge.dx, dirY = edge.dy;
    // Add some lateral drift
    if (dirX === 0 && dirY === 0) { dirX = rng() > 0.5 ? 1 : -1; }

    for (let i = 0; i < vineLen; i++) {
      const t = i / vineLen;
      const green = 70 + Math.floor(rng() * 90);
      const darkG = 30 + Math.floor(rng() * 35);
      const alpha = Math.floor(240 - t * 60);
      setPixelSolid(data, w, vx, vy, darkG, green, 15, alpha);

      // Leaf clusters along vine
      if (rng() > 0.45 && i > 1) {
        const ldir = rng() > 0.5 ? 1 : -1;
        const leafG = green + 20 + Math.floor(rng() * 30);
        const leafR = 20 + Math.floor(rng() * 25);
        // 2-3 pixel leaf
        if (Math.abs(dirX) >= Math.abs(dirY)) {
          setPixelSolid(data, w, vx, vy + ldir, leafR, leafG, 12, alpha - 20);
          setPixelSolid(data, w, vx, vy + ldir * 2, leafR - 5, leafG + 10, 8, alpha - 60);
          if (rng() > 0.5) setPixelSolid(data, w, vx + (rng() > 0.5 ? 1 : -1), vy + ldir, leafR - 5, leafG + 5, 10, alpha - 40);
        } else {
          setPixelSolid(data, w, vx + ldir, vy, leafR, leafG, 12, alpha - 20);
          setPixelSolid(data, w, vx + ldir * 2, vy, leafR - 5, leafG + 10, 8, alpha - 60);
          if (rng() > 0.5) setPixelSolid(data, w, vx + ldir, vy + (rng() > 0.5 ? 1 : -1), leafR - 5, leafG + 5, 10, alpha - 40);
        }
      }

      // Branch off
      if (rng() > 0.82 && i > 2 && i < vineLen - 2) {
        const bLen = Math.floor(rng() * 5) + 2;
        let bx = vx, by = vy;
        const bdir = rng() > 0.5 ? 1 : -1;
        for (let j = 0; j < bLen; j++) {
          if (Math.abs(dirX) >= Math.abs(dirY)) { by += bdir; if (rng() > 0.5) bx += dirX; }
          else { bx += bdir; if (rng() > 0.5) by += dirY; }
          const bGreen = 65 + Math.floor(rng() * 70);
          setPixelSolid(data, w, bx, by, 30, bGreen, 12, Math.floor(200 - (j / bLen) * 80));
          // Leaf at branch tip
          if (j === bLen - 1) {
            const lg = bGreen + 30;
            setPixelSolid(data, w, bx + (rng() > 0.5 ? 1 : -1), by, 25, Math.min(255, lg), 10, 170);
            setPixelSolid(data, w, bx, by + (rng() > 0.5 ? 1 : -1), 25, Math.min(255, lg), 10, 170);
          }
        }
      }

      // Advance vine with wandering
      vx += dirX;
      vy += dirY;
      if (rng() > 0.55) { if (dirX !== 0) vy += rng() > 0.5 ? 1 : -1; else vx += rng() > 0.5 ? 1 : -1; }
      if (rng() > 0.85) { dirX += Math.round(rng() - 0.5); dirY += Math.round(rng() - 0.5); }
    }

    // Leaf cluster at vine tip
    const tipG = 90 + Math.floor(rng() * 60);
    for (let d = 0; d < 3; d++) {
      const lx = vx + Math.round(rng() * 2 - 1);
      const ly = vy + Math.round(rng() * 2 - 1);
      setPixelSolid(data, w, lx, ly, 20, Math.min(255, tipG + Math.floor(rng() * 30)), 8, 180);
    }
  }

  // Hanging vines (droop downward from top/side edges)
  const hangCount = Math.min(Math.floor(edgeOnly.length / 12), 15);
  for (let hv = 0; hv < hangCount; hv++) {
    const edge = edgeOnly[Math.floor(rng() * edgeOnly.length)];
    if (edge.dy > 0 || (edge.dy === 0 && rng() > 0.5)) continue; // prefer top and side edges
    let hx = edge.x + edge.dx;
    let hy = edge.y + edge.dy;
    const hangLen = Math.floor(rng() * 10) + 4;
    for (let i = 0; i < hangLen; i++) {
      const green = 55 + Math.floor(rng() * 60);
      setPixelSolid(data, w, hx, hy, 25, green, 15, Math.floor(220 - (i / hangLen) * 80));
      hy += 1; // grow downward
      if (rng() > 0.7) hx += rng() > 0.5 ? 1 : -1;
      // Small dangling leaf
      if (i === hangLen - 1 || (rng() > 0.75 && i > 2)) {
        setPixelSolid(data, w, hx - 1, hy, 20, green + 25, 10, 160);
        setPixelSolid(data, w, hx + 1, hy, 20, green + 25, 10, 160);
      }
    }
  }

  // Flowers at vine tips and edges
  const flowerCount = Math.min(Math.floor(edgeOnly.length / 10), 12);
  const flowerColors = [
    [255, 90, 140], [255, 190, 50], [200, 90, 255],
    [255, 140, 70], [255, 70, 70], [240, 180, 220],
  ];
  for (let f = 0; f < flowerCount; f++) {
    const edge = edgeOnly[Math.floor(rng() * edgeOnly.length)];
    const dist = Math.floor(rng() * 3) + 2;
    const fx = edge.x + edge.dx * dist;
    const fy = edge.y + edge.dy * dist;
    const [fr, fg, fb] = flowerColors[Math.floor(rng() * flowerColors.length)];
    // Center
    setPixelSolid(data, w, fx, fy, 255, 230, 50, 230);
    // Petals
    setPixelSolid(data, w, fx - 1, fy, fr, fg, fb, 210);
    setPixelSolid(data, w, fx + 1, fy, fr, fg, fb, 210);
    setPixelSolid(data, w, fx, fy - 1, fr, fg, fb, 210);
    setPixelSolid(data, w, fx, fy + 1, fr, fg, fb, 210);
    // Larger flowers get diagonal petals
    if (rng() > 0.4) {
      const dr = Math.max(0, fr - 30), dg = Math.max(0, fg - 20), db = Math.max(0, fb - 20);
      setPixelSolid(data, w, fx - 1, fy - 1, dr, dg, db, 170);
      setPixelSolid(data, w, fx + 1, fy - 1, dr, dg, db, 170);
      setPixelSolid(data, w, fx - 1, fy + 1, dr, dg, db, 170);
      setPixelSolid(data, w, fx + 1, fy + 1, dr, dg, db, 170);
    }
    // Stem connecting flower to edge
    const sx = edge.x + edge.dx, sy = edge.y + edge.dy;
    setPixelSolid(data, w, sx, sy, 30, 80, 15, 200);
    if (dist > 2) {
      const mx = Math.round((sx + fx) / 2), my = Math.round((sy + fy) / 2);
      setPixelSolid(data, w, mx, my, 30, 75, 15, 190);
    }
  }

  return { data, width: w, height: h };
}

function applyPlantGrowthV2(srcImageData, seed) {
  const pad = 30;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Heavy green tint on existing pixels
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        data[i] = Math.max(0, data[i] * 0.55 + 10);
        data[i + 1] = Math.min(255, data[i + 1] * 0.7 + 50);
        data[i + 2] = Math.max(0, data[i + 2] * 0.4);
      }
    }
  }

  const edges = findEdges(data, w, h, rng);
  const edgeOnly = edges.filter((e) => e.edge);

  // Dense moss on all surface edges
  for (const edge of edgeOnly) {
    if (rng() > 0.7) continue;
    const mx = edge.x, my = edge.y;
    const i = (my * w + mx) * 4;
    if (data[i + 3] > 20) {
      const g = 55 + Math.floor(rng() * 60);
      data[i] = 15 + Math.floor(rng() * 20);
      data[i + 1] = g;
      data[i + 2] = 8 + Math.floor(rng() * 12);
    }
    // Moss also spills 1-2px outward
    for (let m = 1; m <= (rng() > 0.5 ? 2 : 1); m++) {
      const ox = edge.x + edge.dx * m, oy = edge.y + edge.dy * m;
      const mg = 45 + Math.floor(rng() * 50);
      setPixel(data, w, ox, oy, 18, mg, 10, Math.floor(180 - m * 50));
    }
  }

  // Helper: grow a single vine with branching and leaves
  function growVine(startX, startY, dirX, dirY, maxLen, thickness, depth) {
    let vx = startX, vy = startY;
    let dx = dirX, dy = dirY;
    for (let i = 0; i < maxLen; i++) {
      const t = i / maxLen;
      const green = 60 + Math.floor(rng() * 100);
      const stemR = 25 + Math.floor(rng() * 30);
      const alpha = Math.floor(245 - t * 70);
      setPixelSolid(data, w, vx, vy, stemR, green, 12, alpha);

      // Thicker stems at base
      if (thickness > 1 && t < 0.5) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          setPixel(data, w, vx, vy - 1, stemR - 5, green - 10, 10, alpha * 0.6);
          setPixel(data, w, vx, vy + 1, stemR - 5, green - 10, 10, alpha * 0.6);
        } else {
          setPixel(data, w, vx - 1, vy, stemR - 5, green - 10, 10, alpha * 0.6);
          setPixel(data, w, vx + 1, vy, stemR - 5, green - 10, 10, alpha * 0.6);
        }
      }

      // Leaf clusters — frequent
      if (rng() > 0.35 && i > 0) {
        const ldir = rng() > 0.5 ? 1 : -1;
        const leafG = green + 15 + Math.floor(rng() * 40);
        const lr = 15 + Math.floor(rng() * 20);
        const la = Math.max(80, alpha - 30);
        const perp = Math.abs(dx) >= Math.abs(dy);
        if (perp) {
          setPixelSolid(data, w, vx, vy + ldir, lr, Math.min(255, leafG), 10, la);
          setPixelSolid(data, w, vx, vy + ldir * 2, lr, Math.min(255, leafG + 15), 8, la - 30);
          if (rng() > 0.4) setPixelSolid(data, w, vx + (rng() > 0.5 ? 1 : -1), vy + ldir, lr, Math.min(255, leafG + 8), 9, la - 20);
          if (rng() > 0.6) setPixelSolid(data, w, vx, vy + ldir * 3, lr, Math.min(255, leafG + 20), 6, la - 60);
        } else {
          setPixelSolid(data, w, vx + ldir, vy, lr, Math.min(255, leafG), 10, la);
          setPixelSolid(data, w, vx + ldir * 2, vy, lr, Math.min(255, leafG + 15), 8, la - 30);
          if (rng() > 0.4) setPixelSolid(data, w, vx + ldir, vy + (rng() > 0.5 ? 1 : -1), lr, Math.min(255, leafG + 8), 9, la - 20);
          if (rng() > 0.6) setPixelSolid(data, w, vx + ldir * 3, vy, lr, Math.min(255, leafG + 20), 6, la - 60);
        }
      }

      // Sub-branch recursion
      if (depth < 2 && rng() > 0.78 && i > 2 && i < maxLen - 2) {
        const bDirX = Math.abs(dx) >= Math.abs(dy) ? 0 : (rng() > 0.5 ? 1 : -1);
        const bDirY = Math.abs(dx) >= Math.abs(dy) ? (rng() > 0.5 ? 1 : -1) : 0;
        growVine(vx + bDirX, vy + bDirY, bDirX || dx, bDirY || dy, Math.floor(rng() * 8) + 3, 1, depth + 1);
      }

      // Advance with wandering
      vx += dx; vy += dy;
      if (rng() > 0.45) { if (dx !== 0) vy += rng() > 0.5 ? 1 : -1; else vx += rng() > 0.5 ? 1 : -1; }
      if (rng() > 0.8) { dx += Math.round(rng() - 0.5); dy += Math.round(rng() - 0.5); }
      // Keep at least some direction
      if (dx === 0 && dy === 0) { dx = dirX; dy = dirY; }
    }

    // Bushy tip cluster
    for (let d = 0; d < 4 + Math.floor(rng() * 3); d++) {
      const lx = vx + Math.round(rng() * 3 - 1.5);
      const ly = vy + Math.round(rng() * 3 - 1.5);
      const tg = 80 + Math.floor(rng() * 70);
      setPixel(data, w, lx, ly, 18, Math.min(255, tg), 8, 170 + Math.floor(rng() * 40));
    }
  }

  // Main vines from edges — lots of them, long reach
  const vineCount = Math.min(Math.floor(edgeOnly.length / 4), 65);
  for (let v = 0; v < vineCount; v++) {
    const edge = edgeOnly[Math.floor(rng() * edgeOnly.length)];
    const len = Math.floor(rng() * 18) + 8;
    growVine(edge.x + edge.dx, edge.y + edge.dy, edge.dx, edge.dy, len, rng() > 0.5 ? 2 : 1, 0);
  }

  // Hanging vines — long, droopy, from top and sides
  const hangCount = Math.min(Math.floor(edgeOnly.length / 6), 25);
  for (let hv = 0; hv < hangCount; hv++) {
    const edge = edgeOnly[Math.floor(rng() * edgeOnly.length)];
    if (edge.dy > 0 && rng() > 0.3) continue;
    let hx = edge.x + edge.dx;
    let hy = edge.y + edge.dy;
    const hangLen = Math.floor(rng() * 16) + 6;
    for (let i = 0; i < hangLen; i++) {
      const t = i / hangLen;
      const green = 50 + Math.floor(rng() * 65);
      const alpha = Math.floor(230 - t * 70);
      setPixelSolid(data, w, hx, hy, 20, green, 12, alpha);
      hy += 1;
      if (rng() > 0.6) hx += rng() > 0.5 ? 1 : -1;
      // Leaves along hanging vine
      if (rng() > 0.55) {
        const ld = rng() > 0.5 ? 1 : -1;
        setPixelSolid(data, w, hx + ld, hy, 18, Math.min(255, green + 30), 10, alpha - 30);
        if (rng() > 0.5) setPixelSolid(data, w, hx + ld * 2, hy, 15, Math.min(255, green + 40), 8, alpha - 60);
      }
    }
    // Drip at bottom
    setPixel(data, w, hx, hy, 15, 70, 10, 120);
    setPixel(data, w, hx, hy + 1, 12, 55, 8, 80);
  }

  // Creeping ground cover — spread along the bottom area of the sprite
  const bottomY = pad + oh;
  const leftX = pad, rightX = pad + ow;
  for (let x = leftX - 8; x < rightX + 8; x++) {
    if (rng() > 0.4) continue;
    const groundLen = Math.floor(rng() * 6) + 2;
    for (let i = 0; i < groundLen; i++) {
      const gy = bottomY + Math.floor(rng() * 4);
      const gx = x + Math.round(rng() * 2 - 1);
      const green = 50 + Math.floor(rng() * 70);
      setPixel(data, w, gx, gy + i, 18, green, 10, Math.floor(160 - i * 25));
    }
  }

  // Spreading canopy — leaves above the top
  const topY = pad;
  for (let x = leftX - 6; x < rightX + 6; x++) {
    if (rng() > 0.45) continue;
    const canopyLen = Math.floor(rng() * 5) + 1;
    for (let i = 0; i < canopyLen; i++) {
      const cx = x + Math.round(rng() * 2 - 1);
      const cy = topY - 1 - i;
      const green = 70 + Math.floor(rng() * 80);
      setPixel(data, w, cx, cy, 20, Math.min(255, green), 10, Math.floor(170 - i * 30));
    }
  }

  // Flowers — many, scattered across vines and edges
  const flowerCount = Math.min(Math.floor(edgeOnly.length / 6), 20);
  const flowerColors = [
    [255, 85, 130], [255, 200, 50], [200, 85, 255],
    [255, 130, 65], [255, 60, 60], [240, 175, 215],
    [255, 255, 100], [180, 130, 255],
  ];
  for (let f = 0; f < flowerCount; f++) {
    const edge = edgeOnly[Math.floor(rng() * edgeOnly.length)];
    const dist = Math.floor(rng() * 6) + 2;
    const fx = edge.x + edge.dx * dist + Math.round(rng() * 4 - 2);
    const fy = edge.y + edge.dy * dist + Math.round(rng() * 4 - 2);
    const [fr, fg, fb] = flowerColors[Math.floor(rng() * flowerColors.length)];

    // Center
    setPixelSolid(data, w, fx, fy, 255, 235, 50, 235);
    // Cardinal petals
    setPixelSolid(data, w, fx - 1, fy, fr, fg, fb, 215);
    setPixelSolid(data, w, fx + 1, fy, fr, fg, fb, 215);
    setPixelSolid(data, w, fx, fy - 1, fr, fg, fb, 215);
    setPixelSolid(data, w, fx, fy + 1, fr, fg, fb, 215);
    // Most flowers get diagonal petals too
    if (rng() > 0.3) {
      const dr = Math.max(0, fr - 35), dg = Math.max(0, fg - 25), db = Math.max(0, fb - 25);
      setPixelSolid(data, w, fx - 1, fy - 1, dr, dg, db, 175);
      setPixelSolid(data, w, fx + 1, fy - 1, dr, dg, db, 175);
      setPixelSolid(data, w, fx - 1, fy + 1, dr, dg, db, 175);
      setPixelSolid(data, w, fx + 1, fy + 1, dr, dg, db, 175);
    }
    // Large flowers get outer ring
    if (rng() > 0.6) {
      const lr = Math.max(0, fr - 60), lg = Math.max(0, fg - 50), lb = Math.max(0, fb - 50);
      setPixel(data, w, fx - 2, fy, lr, lg, lb, 130);
      setPixel(data, w, fx + 2, fy, lr, lg, lb, 130);
      setPixel(data, w, fx, fy - 2, lr, lg, lb, 130);
      setPixel(data, w, fx, fy + 2, lr, lg, lb, 130);
    }
    // Stem
    const stemLen = Math.min(dist, 4);
    for (let s = 1; s <= stemLen; s++) {
      const sx = Math.round(edge.x + edge.dx * s + (fx - edge.x - edge.dx * dist) * (s / dist));
      const sy = Math.round(edge.y + edge.dy * s + (fy - edge.y - edge.dy * dist) * (s / dist));
      setPixel(data, w, sx, sy, 25, 75, 12, 200);
    }
  }

  // Scattered spores / pollen particles in the air around the sprite
  const sporeCount = Math.floor(rng() * 20) + 10;
  for (let s = 0; s < sporeCount; s++) {
    const sx = pad + Math.floor(rng() * ow) + Math.round(rng() * 20 - 10);
    const sy = pad + Math.floor(rng() * oh) + Math.round(rng() * 20 - 10);
    const pi = (sy * w + sx) * 4;
    if (sx >= 0 && sx < w && sy >= 0 && sy < h && data[pi + 3] < 20) {
      const sg = 120 + Math.floor(rng() * 80);
      setPixel(data, w, sx, sy, 200, sg, 50, 60 + Math.floor(rng() * 60));
    }
  }

  return { data, width: w, height: h };
}

function applyCrystal(srcImageData, seed) {
  const pad = 14;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Tint pixels with crystal hue
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = Math.min(255, lum * 0.4 + data[i] * 0.3 + 40);
        data[i + 1] = Math.min(255, lum * 0.3 + data[i + 1] * 0.3 + 50);
        data[i + 2] = Math.min(255, lum * 0.5 + data[i + 2] * 0.4 + 80);
      }
    }
  }

  const edges = findEdges(data, w, h, rng);

  // Crystal shards
  for (let c = 0; c < Math.min(edges.length / 15, 25); c++) {
    const edge = edges[Math.floor(rng() * edges.length)];
    const len = Math.floor(rng() * 8) + 3;
    const angle = Math.atan2(edge.dy, edge.dx) + (rng() - 0.5) * 0.8;
    const hue = rng();

    for (let i = 1; i <= len; i++) {
      const px = Math.round(edge.x + Math.cos(angle) * i);
      const py = Math.round(edge.y + Math.sin(angle) * i);
      const t = i / len;
      const bright = 150 + Math.floor((1 - t) * 105);
      const alpha = Math.floor(230 * (1 - t * 0.5));

      const cr = Math.floor(bright * (0.5 + hue * 0.3));
      const cg = Math.floor(bright * (0.5 + (1 - hue) * 0.2));
      const cb = Math.floor(bright * (0.7 + hue * 0.3));

      setPixelSolid(data, w, px, py, cr, cg, cb, alpha);
      // Crystal width at base
      if (t < 0.4) {
        const perpX = -Math.sin(angle), perpY = Math.cos(angle);
        setPixel(data, w, Math.round(px + perpX), Math.round(py + perpY), cr, cg, cb, alpha * 0.6);
        setPixel(data, w, Math.round(px - perpX), Math.round(py - perpY), cr, cg, cb, alpha * 0.6);
      }
    }
    // Highlight at tip
    const tx = Math.round(edge.x + Math.cos(angle) * 1);
    const ty = Math.round(edge.y + Math.sin(angle) * 1);
    setPixel(data, w, tx, ty, 240, 240, 255, 250);
  }

  return { data, width: w, height: h };
}

function applyFire(srcImageData, seed) {
  const pad = 14;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Warm tint on existing pixels
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        data[i] = Math.min(255, data[i] * 0.8 + 50);
        data[i + 1] = Math.min(255, data[i + 1] * 0.6 + 20);
        data[i + 2] = Math.max(0, data[i + 2] * 0.3);
      }
    }
  }

  const edges = findEdges(data, w, h, rng);

  // Flames across sprite (biased upward)
  for (const edge of edges) {
    if (edge.dy === 1) continue; // skip bottom
    if (rng() > 0.05) continue;
    const len = Math.floor(rng() * 8) + 2;
    const drift = (rng() - 0.5) * 0.3;

    for (let i = 1; i <= len; i++) {
      const t = i / len;
      const wobble = Math.sin(i * 1.5 + seed * 0.01) * 1.5;
      let px, py;
      if (edge.dy === -1) {
        px = Math.round(edge.x + wobble + drift * i);
        py = edge.y - i;
      } else {
        px = Math.round(edge.x + edge.dx * i + wobble);
        py = Math.round(edge.y + edge.dy * i - i * 0.3);
      }

      const alpha = Math.floor(240 * (1 - t * 0.8));
      if (t < 0.3) {
        setPixel(data, w, px, py, 255, 255, 180, alpha); // white-yellow core
      } else if (t < 0.6) {
        setPixel(data, w, px, py, 255, 160 - t * 100, 20, alpha); // orange
      } else {
        setPixel(data, w, px, py, 200, 50, 10, alpha); // red tips
      }
    }
  }

  // Ember particles
  for (let e = 0; e < 15; e++) {
    const edge = edges[Math.floor(rng() * edges.length)];
    const ex = edge.x + Math.floor(rng() * 8 - 4);
    const ey = edge.y - Math.floor(rng() * 10) - 3;
    setPixel(data, w, ex, ey, 255, 200, 50, Math.floor(rng() * 150) + 60);
  }

  return { data, width: w, height: h };
}

function applyFireV2(srcImageData, seed) {
  const pad = 24;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Hot tint on existing pixels — charred dark with orange/yellow highlights
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = Math.min(255, lum * 0.4 + 80);
        data[i + 1] = Math.min(255, lum * 0.25 + 25);
        data[i + 2] = Math.max(0, lum * 0.08);
      }
    }
  }

  const edges = findEdges(data, w, h, rng);
  const edgeOnly = edges.filter((e) => e.edge);

  // Flame color at a given progress t (0=base, 1=tip)
  function flameColor(t) {
    if (t < 0.15) return [255, 255, 220];
    if (t < 0.35) return [255, 240, 120];
    if (t < 0.55) return [255, 180, 40];
    if (t < 0.75) return [240, 100, 15];
    return [180, 40, 5];
  }

  // Draw a tapered flame along a direction (dx,dy) with upward drift
  function drawFlame(baseX, baseY, dirX, dirY, height, baseWidth, wobbleSeed) {
    for (let i = 0; i < height; i++) {
      const t = i / height;
      const flameW = Math.max(1, Math.round(baseWidth * (1 - t * t)));
      // Primary direction + always drifts upward
      const upBias = -0.4;
      const moveX = dirX * 0.6 + Math.sin(i * 0.8 + wobbleSeed * 3.7) * (1 + t * 1.5);
      const moveY = dirY * 0.6 + upBias;
      const cx = Math.round(baseX + moveX * i);
      const cy = Math.round(baseY + moveY * i);

      const [cr, cg, cb] = flameColor(t);
      const alpha = Math.floor(245 * (1 - t * 0.6));

      // Perpendicular axis for width
      const perpX = -moveY, perpY = moveX;
      const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
      const pnx = perpX / perpLen, pny = perpY / perpLen;

      const halfW = (flameW - 1) / 2;
      for (let d = -Math.floor(halfW); d <= Math.ceil(halfW); d++) {
        const distFromCenter = Math.abs(d) / Math.max(1, halfW);
        const edgeFade = 1 - distFromCenter * 0.4;
        const outerShift = distFromCenter * 0.3;
        const pr = Math.min(255, cr * edgeFade - outerShift * 60);
        const pg = Math.max(0, cg * edgeFade - outerShift * 80);
        const pb = Math.max(0, cb * edgeFade);
        const pa = Math.floor(alpha * (1 - distFromCenter * 0.3));
        setPixel(data, w, Math.round(cx + pnx * d), Math.round(cy + pny * d), pr, pg, pb, pa);
      }
    }
  }

  // Flames from ALL edges — every direction
  for (const edge of edgeOnly) {
    if (rng() > 0.35) continue;
    const height = Math.floor(rng() * 14) + 4;
    const baseWidth = Math.floor(rng() * 3) + 2;
    drawFlame(edge.x + edge.dx, edge.y + edge.dy, edge.dx, edge.dy, height, baseWidth, rng() * 100);
  }

  // Interior flames — fire bursting from within the sprite
  for (const pt of edges) {
    if (pt.edge) continue; // skip actual edges, we did those above
    if (rng() > 0.04) continue;
    const height = Math.floor(rng() * 10) + 3;
    const baseWidth = Math.floor(rng() * 2) + 1;
    drawFlame(pt.x, pt.y, pt.dx, pt.dy, height, baseWidth, rng() * 100);
  }

  // Inner glow — bright white-yellow on all edge surfaces
  for (const edge of edgeOnly) {
    if (rng() > 0.4) continue;
    const i = (edge.y * w + edge.x) * 4;
    if (data[i + 3] > 20) {
      data[i] = Math.min(255, data[i] * 0.5 + 160);
      data[i + 1] = Math.min(255, data[i + 1] * 0.4 + 120);
      data[i + 2] = Math.min(255, data[i + 2] * 0.2 + 40);
    }
  }

  // Embers scattered all around, not just above
  const emberCount = Math.floor(rng() * 40) + 30;
  for (let e = 0; e < emberCount; e++) {
    const ex = pad + Math.floor(rng() * ow) + Math.round(rng() * 20 - 10);
    const ey = pad + Math.floor(rng() * oh) + Math.round(rng() * 20 - 10);
    if (ex >= 0 && ex < w && ey >= 0 && ey < h) {
      const bright = rng();
      if (bright > 0.5) {
        setPixel(data, w, ex, ey, 255, 220, 80, Math.floor(rng() * 140) + 80);
      } else {
        setPixel(data, w, ex, ey, 255, 150, 30, Math.floor(rng() * 100) + 60);
      }
    }
  }

  // Heat haze all around
  for (let hz = 0; hz < 25; hz++) {
    const hx = pad + Math.floor(rng() * ow) + Math.round(rng() * 16 - 8);
    const hy = pad + Math.floor(rng() * oh) + Math.round(rng() * 16 - 8);
    if (hx >= 0 && hx < w && hy >= 0 && hy < h) {
      setPixel(data, w, hx, hy, 255, 200, 100, Math.floor(rng() * 35) + 15);
    }
  }

  return { data, width: w, height: h };
}

function applyFrozen(srcImageData, seed) {
  const pad = 14;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Ice tint
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = Math.min(255, lum * 0.5 + 60);
        data[i + 1] = Math.min(255, lum * 0.6 + 80);
        data[i + 2] = Math.min(255, lum * 0.5 + 120);
      }
    }
  }

  const edges = findEdges(data, w, h, rng);

  // Icicles from sprite pixels (downward)
  for (const edge of edges) {
    if (edge.dy !== 1) continue;
    if (rng() > 0.07) continue;
    const len = Math.floor(rng() * 10) + 3;
    for (let i = 1; i <= len; i++) {
      const t = i / len;
      const width = Math.max(0, Math.floor((1 - t) * 2));
      const alpha = Math.floor(230 * (1 - t * 0.4));
      const blue = 180 + Math.floor((1 - t) * 75);
      for (let dx = -width; dx <= width; dx++) {
        setPixel(data, w, edge.x + dx, edge.y + i, 180, 210, blue, alpha);
      }
    }
    // Drip
    setPixel(data, w, edge.x, edge.y + len + 1, 200, 230, 255, 120);
  }

  // Frost crystals across sprite
  for (const edge of edges) {
    if (edge.dy === 1) continue;
    if (rng() > 0.93) continue;
    for (let i = 1; i <= 2; i++) {
      const px = edge.x + edge.dx * i;
      const py = edge.y + edge.dy * i;
      setPixel(data, w, px, py, 200, 225, 255, Math.floor(180 - i * 50));
    }
  }

  // Snow particles
  for (let s = 0; s < 20; s++) {
    const edge = edges[Math.floor(rng() * edges.length)];
    const sx = edge.x + Math.floor(rng() * 6 - 3);
    const sy = edge.y + Math.floor(rng() * 6 - 3);
    setPixel(data, w, sx, sy, 230, 240, 255, Math.floor(rng() * 100) + 60);
  }

  return { data, width: w, height: h };
}

function applyElectric(srcImageData, seed) {
  const pad = 50;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Subtle electric tint — mostly preserve original colors
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = Math.min(255, data[i] * 0.7 + lum * 0.2 + 10);
        data[i + 1] = Math.min(255, data[i + 1] * 0.7 + lum * 0.2 + 10);
        data[i + 2] = Math.min(255, data[i + 2] * 0.7 + lum * 0.15 + 25);
      }
    }
  }

  const edges = findEdges(data, w, h, rng);

  // Helper: draw a zigzag lightning segment from (x,y) in a direction
  const drawBolt = (startX, startY, dirX, dirY, length, thickness, intensity) => {
    let bx = startX, by = startY;
    for (let i = 0; i < length; i++) {
      const fade = intensity * (1 - (i / length) * 0.6);
      const bright = Math.floor((220 + rng() * 35) * fade);

      // Core pixels
      for (let t = 0; t < thickness; t++) {
        const tx = dirY !== 0 ? t : 0;
        const ty = dirX !== 0 ? t : 0;
        setPixelSolid(data, w, bx + tx, by + ty, bright, bright, Math.min(255, bright + 30), 255);
      }

      // Glow halo — wider for thicker bolts
      const glowR = thickness + 1;
      const glowA = Math.floor(120 * fade);
      for (let dx = -glowR; dx <= glowR; dx++) {
        for (let dy = -glowR; dy <= glowR; dy++) {
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist > 0 && dist <= glowR) {
            setPixel(data, w, bx + dx, by + dy, 120, 140, 220, Math.floor(glowA / dist));
          }
        }
      }

      // Zigzag: sharp 90-degree jags every few pixels for that classic lightning look
      if (i % (2 + Math.floor(rng() * 3)) === 0) {
        // Perpendicular jag
        const jag = Math.floor(rng() * 3) + 1;
        const jdir = rng() > 0.5 ? 1 : -1;
        for (let j = 0; j < jag; j++) {
          if (dirX !== 0 || dirY !== 0) {
            bx += dirY * jdir || (rng() > 0.5 ? 1 : -1);
            by += dirX * jdir || (rng() > 0.5 ? 1 : -1);
          }
          setPixelSolid(data, w, bx, by, bright, bright, Math.min(255, bright + 30), 240);
        }
      }

      // Continue in main direction
      bx += dirX + (rng() > 0.7 ? (rng() > 0.5 ? 1 : -1) : 0);
      by += dirY + (rng() > 0.7 ? (rng() > 0.5 ? 1 : -1) : 0);
    }
    return { x: bx, y: by };
  };

  // Major lightning bolts — big, thick, jagged
  for (let bolt = 0; bolt < 10; bolt++) {
    const edge = edges[Math.floor(rng() * edges.length)];
    const boltLen = Math.floor(rng() * 25) + 30;
    const end = drawBolt(edge.x + edge.dx, edge.y + edge.dy, edge.dx, edge.dy, boltLen, 2, 1.0);

    // Fork into 2-3 sub-bolts at the end
    const forks = Math.floor(rng() * 2) + 2;
    for (let f = 0; f < forks; f++) {
      const fdx = edge.dx + (rng() > 0.5 ? 1 : -1) * (rng() > 0.5 ? 1 : 0);
      const fdy = edge.dy + (rng() > 0.5 ? 1 : -1) * (rng() > 0.5 ? 1 : 0);
      drawBolt(end.x, end.y, Math.sign(fdx) || (rng() > 0.5 ? 1 : -1), Math.sign(fdy) || (rng() > 0.5 ? 1 : -1), Math.floor(rng() * 15) + 8, 1, 0.7);
    }
  }

  // Medium branches along edges
  for (let bolt = 0; bolt < 12; bolt++) {
    const edge = edges[Math.floor(rng() * edges.length)];
    const boltLen = Math.floor(rng() * 15) + 10;
    drawBolt(edge.x + edge.dx, edge.y + edge.dy, edge.dx, edge.dy, boltLen, 1, 0.8);
  }

  // Spark clusters — groups of bright dots that look like electric sparks
  for (let s = 0; s < 25; s++) {
    const edge = edges[Math.floor(rng() * edges.length)];
    const cx = edge.x + edge.dx * Math.floor(rng() * 8 + 2);
    const cy = edge.y + edge.dy * Math.floor(rng() * 8 + 2);
    // Each spark is a small cross or star shape
    const sparkBright = Math.floor(rng() * 55) + 200;
    setPixelSolid(data, w, cx, cy, sparkBright, sparkBright, Math.min(255, sparkBright + 20), 255);
    // 2-4 pixel rays in random directions
    const rays = Math.floor(rng() * 3) + 2;
    for (let r = 0; r < rays; r++) {
      const rdx = Math.floor(rng() * 3) - 1;
      const rdy = Math.floor(rng() * 3) - 1;
      const rlen = Math.floor(rng() * 3) + 1;
      for (let p = 1; p <= rlen; p++) {
        setPixel(data, w, cx + rdx * p, cy + rdy * p, 200, 210, 230, Math.floor(200 / p));
      }
    }
  }

  // Scattered distant spark particles
  for (let s = 0; s < 40; s++) {
    const edge = edges[Math.floor(rng() * edges.length)];
    const sx = edge.x + Math.floor(rng() * 40 - 20);
    const sy = edge.y + Math.floor(rng() * 40 - 20);
    setPixel(data, w, sx, sy, 210, 220, 235, Math.floor(rng() * 180) + 70);
  }

  return { data, width: w, height: h };
}

function applyCorruption(srcImageData, seed) {
  const pad = 10;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Dark purple corruption tint with noise
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        const noise = rng() * 30 - 15;
        data[i] = Math.min(255, Math.max(0, data[i] * 0.5 + 40 + noise));
        data[i + 1] = Math.max(0, data[i + 1] * 0.3 + noise);
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * 0.5 + 50 + noise));
      }
    }
  }

  const edges = findEdges(data, w, h, rng);

  // Corrupted scattered pixels across sprite
  for (const edge of edges) {
    if (rng() > 0.035) continue;
    const scatter = Math.floor(rng() * 5) + 2;
    for (let s = 0; s < scatter; s++) {
      const sx = edge.x + edge.dx * Math.floor(rng() * 6 + 1) + Math.floor(rng() * 3 - 1);
      const sy = edge.y + edge.dy * Math.floor(rng() * 6 + 1) + Math.floor(rng() * 3 - 1);
      const purple = Math.floor(rng() * 80) + 40;
      setPixelSolid(data, w, sx, sy, purple, 10, purple + 30, Math.floor(rng() * 120) + 80);
    }
  }

  // Glitch lines
  for (let g = 0; g < 4; g++) {
    const gy = pad + Math.floor(rng() * oh);
    const gx = pad + Math.floor(rng() * ow);
    const glen = Math.floor(rng() * 8) + 3;
    const horizontal = rng() > 0.5;
    for (let i = 0; i < glen; i++) {
      const px = horizontal ? gx + i : gx;
      const py = horizontal ? gy : gy + i;
      if (isOpaqueAt(data, w, h, px, py) || rng() > 0.5) {
        setPixelSolid(data, w, px, py, 120, 0, 160, 200);
      }
    }
  }

  return { data, width: w, height: h };
}

function applyStone(srcImageData, seed) {
  const pad = 6;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Stone texture
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const noise = rng() * 20 - 10;
        const base = lum * 0.6 + 60 + noise;
        data[i] = Math.min(255, Math.max(0, base + 5));
        data[i + 1] = Math.min(255, Math.max(0, base));
        data[i + 2] = Math.min(255, Math.max(0, base - 5));
      }
    }
  }

  const edges = findEdges(data, w, h, rng);

  // Rocky texture across sprite
  for (const edge of edges) {
    if (rng() > 0.08) continue;
    const len = Math.floor(rng() * 3) + 1;
    for (let i = 1; i <= len; i++) {
      const gray = 80 + Math.floor(rng() * 50);
      const wobbleX = Math.floor(rng() * 3) - 1;
      const wobbleY = Math.floor(rng() * 3) - 1;
      const alpha = Math.floor(200 * (1 - i / (len + 1)));
      setPixel(data, w, edge.x + edge.dx * i + wobbleX, edge.y + edge.dy * i + wobbleY, gray, gray - 5, gray - 10, alpha);
    }
  }

  // Cracks
  for (let c = 0; c < 3; c++) {
    const interiorPixels = [];
    for (let y = pad; y < pad + oh; y++) {
      for (let x = pad; x < pad + ow; x++) {
        if (isOpaqueAt(data, w, h, x, y)) interiorPixels.push([x, y]);
      }
    }
    if (interiorPixels.length === 0) break;
    let [cx, cy] = interiorPixels[Math.floor(rng() * interiorPixels.length)];
    const crackLen = Math.floor(rng() * 8) + 3;
    for (let i = 0; i < crackLen; i++) {
      if (isOpaqueAt(data, w, h, cx, cy)) {
        const idx = (cy * w + cx) * 4;
        data[idx] = Math.max(0, data[idx] - 40);
        data[idx + 1] = Math.max(0, data[idx + 1] - 40);
        data[idx + 2] = Math.max(0, data[idx + 2] - 35);
      }
      cx += Math.floor(rng() * 3) - 1;
      cy += Math.floor(rng() * 3) - 1;
    }
  }

  return { data, width: w, height: h };
}

function applyShadow(srcImageData, seed) {
  const pad = 10;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Dark smoky tint
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = Math.max(0, lum * 0.25 + 10);
        data[i + 1] = Math.max(0, lum * 0.15 + 5);
        data[i + 2] = Math.min(255, lum * 0.3 + 20);
      }
    }
  }

  const edges = findEdges(data, w, h, rng);

  // Smoky wisps
  for (let v = 0; v < 12; v++) {
    const edge = edges[Math.floor(rng() * edges.length)];
    let vx = edge.x + edge.dx;
    let vy = edge.y + edge.dy;
    const wispLen = Math.floor(rng() * 12) + 4;
    for (let i = 0; i < wispLen; i++) {
      const t = i / wispLen;
      const alpha = Math.floor(120 * (1 - t));
      setPixel(data, w, vx, vy, 20, 10, 30, alpha);
      setPixel(data, w, vx + 1, vy, 15, 8, 25, alpha * 0.5);
      setPixel(data, w, vx - 1, vy, 15, 8, 25, alpha * 0.5);
      vx += Math.floor(rng() * 3) - 1;
      vy -= 1; // rise upward
    }
  }

  // Dark particles
  for (let p = 0; p < 20; p++) {
    const edge = edges[Math.floor(rng() * edges.length)];
    const px = edge.x + Math.floor(rng() * 10 - 5);
    const py = edge.y + Math.floor(rng() * 10 - 5);
    setPixel(data, w, px, py, 10, 5, 20, Math.floor(rng() * 80) + 30);
  }

  return { data, width: w, height: h };
}

function applySlime(srcImageData, seed) {
  const pad = 14;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Slimy green tint
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = Math.min(255, lum * 0.2 + 30);
        data[i + 1] = Math.min(255, lum * 0.6 + 80);
        data[i + 2] = Math.min(255, lum * 0.15 + 20);
      }
    }
  }

  const edges = findEdges(data, w, h, rng);

  // Gooey drips from all edges (heavier at bottom)
  for (const edge of edges) {
    const prob = edge.dy === 1 ? 0.08 : edge.dy === 0 ? 0.025 : 0.012;
    if (rng() > prob) continue;
    const len = Math.floor(rng() * (edge.dy === 1 ? 12 : 6)) + 2;
    for (let i = 1; i <= len; i++) {
      const t = i / len;
      const wobble = Math.round(Math.sin(i * 0.6 + rng() * 6) * (rng() > 0.7 ? 1 : 0));
      const alpha = Math.floor(220 * (1 - t * 0.5));
      const g = 120 + Math.floor(rng() * 80);
      const px = edge.x + (edge.dy !== 0 ? wobble : edge.dx * i);
      const py = edge.y + (edge.dy !== 0 ? edge.dy * i : wobble);
      setPixel(data, w, px, py, 40, g, 30, alpha);
      // Width
      if (t < 0.5 && edge.dy !== 0) {
        setPixel(data, w, px - 1, py, 35, g - 10, 25, alpha * 0.5);
        setPixel(data, w, px + 1, py, 35, g - 10, 25, alpha * 0.5);
      }
    }
    // Blob at end
    if (edge.dy === 1 && len > 3) {
      const bx = edge.x, by = edge.y + len + 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          setPixel(data, w, bx + dx, by + dy, 50, 180, 40, 180);
        }
      }
      // Highlight
      setPixel(data, w, bx, by - 1, 100, 220, 80, 200);
    }
  }

  return { data, width: w, height: h };
}

function applyChaosSpikes(srcImageData, seed) {
  const pad = 16;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Harsh contrast tint on existing pixels
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const contrast = 1.6;
        data[i] = Math.min(255, Math.max(0, ((data[i] - 128) * contrast + 128) * 0.85 + 20));
        data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] - 128) * contrast + 128) * 0.7));
        data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] - 128) * contrast + 128) * 0.75 + 10));
      }
    }
  }

  const edges = findEdges(data, w, h, rng);

  // Wild spikes in random angles across sprite
  for (const edge of edges) {
    if (rng() > 0.05) continue;
    const count = Math.floor(rng() * 3) + 1;
    for (let s = 0; s < count; s++) {
      const angle = rng() * Math.PI * 2;
      const len = Math.floor(rng() * 12) + 4;
      const cr = Math.floor(rng() * 80) + 50;
      const cg = Math.floor(rng() * 30);
      const cb = Math.floor(rng() * 40) + 10;
      let px = edge.x, py = edge.y;
      for (let i = 1; i <= len; i++) {
        const t = i / len;
        // Jagged wobble
        const wobble = (rng() - 0.5) * 2.5;
        px += Math.cos(angle) + Math.cos(angle + Math.PI / 2) * wobble;
        py += Math.sin(angle) + Math.sin(angle + Math.PI / 2) * wobble;
        const rx = Math.round(px), ry = Math.round(py);
        const alpha = Math.floor(255 * (1 - t * 0.6));
        const bright = 1 - t * 0.5;
        setPixel(data, w, rx, ry, cr * bright, cg * bright, cb * bright, alpha);
        // Thicken near base
        if (t < 0.4) {
          const ox = Math.round(Math.cos(angle + Math.PI / 2));
          const oy = Math.round(Math.sin(angle + Math.PI / 2));
          setPixel(data, w, rx + ox, ry + oy, cr * bright * 0.7, cg, cb, alpha * 0.5);
          setPixel(data, w, rx - ox, ry - oy, cr * bright * 0.7, cg, cb, alpha * 0.5);
        }
        // Sharp tip highlight
        if (i === len) {
          setPixel(data, w, rx, ry, Math.min(255, cr + 100), cg + 20, cb + 30, 220);
        }
      }
    }
  }

  return { data, width: w, height: h };
}

function applyBubbles(srcImageData, seed) {
  const pad = 18;
  const { data: src, width: ow, height: oh } = srcImageData;
  const { data, width: w, height: h } = expandCanvas(srcImageData, pad);
  const rng = mulberry32(seed);

  // Soft iridescent tint on existing pixels
  for (let y = pad; y < pad + oh; y++) {
    for (let x = pad; x < pad + ow; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) {
        data[i] = Math.min(255, data[i] * 0.85 + 30);
        data[i + 1] = Math.min(255, data[i + 1] * 0.9 + 20);
        data[i + 2] = Math.min(255, data[i + 2] * 0.85 + 45);
      }
    }
  }

  const edges = findEdges(data, w, h, rng);

  // Float bubbles outward from edges
  for (let b = 0; b < Math.min(edges.length / 2, 500); b++) {
    const edge = edges[Math.floor(rng() * edges.length)];
    if (rng() > 0.45) continue;
    const radius = rng() * 3 + 1.5;
    const dist = rng() * 10 + radius + 2;
    const angle = Math.atan2(edge.dy, edge.dx) + (rng() - 0.5) * 1.2;
    const cx = edge.x + Math.cos(angle) * dist;
    const cy = edge.y + Math.sin(angle) * dist;

    // Hue shift per bubble for iridescence
    const hueShift = rng() * 360;
    const hr = Math.floor(128 + 80 * Math.cos((hueShift) * Math.PI / 180));
    const hg = Math.floor(128 + 80 * Math.cos((hueShift + 120) * Math.PI / 180));
    const hb = Math.floor(128 + 80 * Math.cos((hueShift + 240) * Math.PI / 180));

    const ri = Math.ceil(radius);
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) continue;
        const px = Math.round(cx + dx), py = Math.round(cy + dy);

        const edgeDist = Math.abs(d - radius);
        if (edgeDist < 1.2) {
          // Bubble rim
          const rimAlpha = Math.floor(180 * (1 - edgeDist / 1.2));
          setPixel(data, w, px, py, hr, hg, hb, rimAlpha);
        } else if (d < radius * 0.4) {
          // Inner highlight (specular)
          const hlx = cx - radius * 0.3, hly = cy - radius * 0.3;
          const hlDist = Math.sqrt((px - hlx) ** 2 + (py - hly) ** 2);
          if (hlDist < radius * 0.35) {
            setPixel(data, w, px, py, 240, 245, 255, Math.floor(120 * (1 - hlDist / (radius * 0.35))));
          } else {
            // Faint fill
            setPixel(data, w, px, py, hr, hg, hb, 25);
          }
        } else {
          // Transparent interior
          setPixel(data, w, px, py, hr, hg, hb, 20);
        }
      }
    }
  }

  return { data, width: w, height: h };
}

// ─── Style registry ───
const STYLES = [
  { id: "spikes", name: "Spikes", desc: "Sharp dark protrusions", icon: "🗡️", apply: applySpikes },
  { id: "chaos_spikes", name: "Chaos Spikes", desc: "Wild jagged eruptions", icon: "💥", apply: applyChaosSpikes },
  { id: "poison", name: "Poison", desc: "Toxic drips & bubbles", icon: "☠️", apply: applyPoison },
  { id: "slime", name: "Slime", desc: "Gooey dripping ooze", icon: "🟢", apply: applySlime },
  { id: "wood", name: "Wood", desc: "Grain, bark & knots", icon: "🪵", apply: applyWood },
  { id: "plant", name: "Plant Growth", desc: "Vines, leaves & flowers", icon: "🌿", apply: applyPlantGrowth },
  { id: "plant_v2", name: "Plant Growth v2", desc: "Overgrown jungle takeover", icon: "🌳", apply: applyPlantGrowthV2 },
  { id: "crystal", name: "Crystal", desc: "Gemstone shards", icon: "💎", apply: applyCrystal },
  { id: "fire", name: "Fire", desc: "Flames & embers", icon: "🔥", apply: applyFire },
  { id: "fire_v2", name: "Fire v2", desc: "Tapered rising flames", icon: "🌋", apply: applyFireV2 },
  { id: "frozen", name: "Frozen", desc: "Icicles & frost", icon: "❄️", apply: applyFrozen },
  { id: "electric", name: "Electric", desc: "Lightning & sparks", icon: "⚡", apply: applyElectric },
  { id: "corruption", name: "Corruption", desc: "Glitched decay", icon: "👾", apply: applyCorruption },
  { id: "stone", name: "Stone", desc: "Rock texture & cracks", icon: "🪨", apply: applyStone },
  { id: "shadow", name: "Shadow", desc: "Dark smoke & wisps", icon: "🌑", apply: applyShadow },
  { id: "bubbles", name: "Bubbles", desc: "Iridescent floating orbs", icon: "🫧", apply: applyBubbles },
];

// ─── Components ───

function SpritePreview({ imageData, zoom, label, subtle }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!imageData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(imageData.width, imageData.height);
    imgData.data.set(imageData.data);
    ctx.putImageData(imgData, 0, 0);
  }, [imageData]);

  if (!imageData) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{
        background: "repeating-conic-gradient(#18182e 0% 25%, #13132a 0% 50%) 0 0 / 10px 10px",
        borderRadius: 6, padding: 2, border: `1px solid ${subtle ? "#1e1e38" : "#2e2e55"}`,
        lineHeight: 0,
      }}>
        <canvas
          ref={canvasRef}
          style={{
            imageRendering: "pixelated",
            width: imageData.width * zoom,
            height: imageData.height * zoom,
          }}
        />
      </div>
      {label && <span style={{ fontSize: 10, color: "#6666aa", letterSpacing: 1.5, fontWeight: 500 }}>{label}</span>}
    </div>
  );
}

export default function SpriteTransformer() {
  const [sprites, setSprites] = useState([]);
  const [selectedStyle, setSelectedStyle] = useState("spikes");
  const [zoom, setZoom] = useState(4);
  const [seed, setSeed] = useState(42);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const loadImage = useCallback((file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          resolve({ name: file.name, imageData: ctx.getImageData(0, 0, img.width, img.height) });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFiles = useCallback(async (files) => {
    const loaded = await Promise.all(Array.from(files).filter((f) => f.type.startsWith("image/")).map(loadImage));
    setSprites((prev) => [...prev, ...loaded]);
  }, [loadImage]);

  const styledSprites = useMemo(() => {
    const styleDef = STYLES.find((s) => s.id === selectedStyle);
    if (!styleDef) return [];
    return sprites.map((sprite) => {
      const result = styleDef.apply(sprite.imageData, seed);
      return { ...sprite, styled: result };
    });
  }, [sprites, selectedStyle, seed]);

  const downloadStyled = (styled, name) => {
    const canvas = document.createElement("canvas");
    canvas.width = styled.width;
    canvas.height = styled.height;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(styled.width, styled.height);
    imgData.data.set(styled.data);
    ctx.putImageData(imgData, 0, 0);
    const link = document.createElement("a");
    link.download = `${name.replace(/\.[^.]+$/, "")}_${selectedStyle}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const downloadAll = () => styledSprites.forEach((s) => downloadStyled(s.styled, s.name));

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a18",
      color: "#c8c8e0",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        padding: "24px 28px 18px",
        borderBottom: "1px solid #1a1a32",
        background: "linear-gradient(180deg, #0e0e24 0%, #0a0a18 100%)",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <h1 style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: 20, fontWeight: 900,
            margin: 0, letterSpacing: 3,
            background: "linear-gradient(135deg, #ff6b6b, #c084fc, #67e8f9)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textTransform: "uppercase",
          }}>
            Sprite Transformer
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 10, color: "#444466", letterSpacing: 2 }}>
            STRUCTURAL EFFECTS • FULL SPRITE • PIXEL PERFECT
          </p>
        </div>
        {sprites.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={downloadAll} style={{
              background: "linear-gradient(135deg, #7c3aed, #6d28d9)", border: "none", borderRadius: 6,
              padding: "8px 16px", color: "#fff", fontSize: 10, fontWeight: 600, letterSpacing: 1.5,
              cursor: "pointer", textTransform: "uppercase", fontFamily: "inherit",
            }}>↓ Download All</button>
            <button onClick={() => setSprites([])} style={{
              background: "transparent", border: "1px solid #2a2a45", borderRadius: 6,
              padding: "8px 14px", color: "#555577", fontSize: 10, cursor: "pointer",
              letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit",
            }}>Clear</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 80px)" }}>
        {/* Sidebar */}
        <div style={{
          width: 240, minWidth: 240, borderRight: "1px solid #1a1a32",
          padding: "14px 10px", display: "flex", flexDirection: "column", gap: 14,
          background: "#0c0c1e", overflowY: "auto",
        }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: "#555577", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>Effect</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {STYLES.map((s) => (
                <button key={s.id} onClick={() => setSelectedStyle(s.id)} style={{
                  background: selectedStyle === s.id ? "linear-gradient(90deg, #1a1a40, #241838)" : "transparent",
                  border: selectedStyle === s.id ? "1px solid #3a2a5a" : "1px solid transparent",
                  borderRadius: 5, padding: "7px 9px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                  color: selectedStyle === s.id ? "#d8c8f0" : "#6666aa", fontFamily: "inherit", transition: "all 0.12s",
                }}
                  onMouseEnter={(e) => { if (selectedStyle !== s.id) e.currentTarget.style.background = "#12122a"; }}
                  onMouseLeave={(e) => { if (selectedStyle !== s.id) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 15, width: 22, textAlign: "center" }}>{s.icon}</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 8, opacity: 0.5, marginTop: 1 }}>{s.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: "#555577", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>
              Zoom: {zoom}x
            </div>
            <input type="range" min="1" max="12" value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#8b5cf6" }} />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 9, letterSpacing: 2, color: "#555577", textTransform: "uppercase", fontWeight: 600 }}>
                Seed: {seed}
              </span>
              <button onClick={() => setSeed(Math.floor(Math.random() * 9999))} style={{
                background: "#1a1a38", border: "1px solid #2a2a4a", borderRadius: 4,
                color: "#8888bb", fontSize: 9, cursor: "pointer", padding: "2px 8px", fontFamily: "inherit",
              }}>🎲 Reroll</button>
            </div>
            <input type="range" min="1" max="999" value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#8b5cf6" }} />
          </div>

          <div style={{ fontSize: 9, color: "#333355", lineHeight: 1.6, padding: "8px 4px", borderTop: "1px solid #1a1a30", marginTop: 4 }}>
            <strong style={{ color: "#555577" }}>How it works:</strong><br />
            Effects transform the entire sprite surface. Structural elements grow from all pixels, not just edges. Transparent areas beyond the effect remain empty. Use <strong style={{ color: "#555577" }}>Seed</strong> to randomize patterns.
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
          {/* Drop zone */}
          <div
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "#8b5cf6" : "#222244"}`,
              borderRadius: 10, padding: sprites.length > 0 ? "14px 20px" : "44px 20px",
              textAlign: "center", cursor: "pointer",
              background: dragOver ? "#12122e" : "#0c0c20", transition: "all 0.2s", marginBottom: 20,
            }}
          >
            <input ref={fileInputRef} type="file" accept="image/*" multiple
              onChange={(e) => handleFiles(e.target.files)} style={{ display: "none" }} />
            {sprites.length === 0 ? (
              <>
                <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.25 }}>🎨</div>
                <div style={{ fontSize: 12, color: "#5555aa", fontWeight: 500 }}>Drop sprites here or click to browse</div>
                <div style={{ fontSize: 10, color: "#333355", marginTop: 5 }}>PNG with transparency recommended</div>
              </>
            ) : (
              <div style={{ fontSize: 10, color: "#5555aa" }}>+ Add more sprites</div>
            )}
          </div>

          {/* Sprite results */}
          {styledSprites.map((sprite, idx) => (
            <div key={idx} style={{
              marginBottom: 24, background: "#0c0c20", borderRadius: 10, border: "1px solid #1a1a32", overflow: "hidden",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "9px 14px", borderBottom: "1px solid #161630", background: "#0e0e25",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#8888cc" }}>{sprite.name}</span>
                  <span style={{ fontSize: 9, color: "#3a3a5a" }}>
                    {sprite.imageData.width}×{sprite.imageData.height} → {sprite.styled.width}×{sprite.styled.height}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => downloadStyled(sprite.styled, sprite.name)} style={{
                    background: "#1a1a38", border: "1px solid #2a2a50", borderRadius: 4,
                    color: "#8888cc", cursor: "pointer", fontSize: 9, padding: "3px 10px", fontFamily: "inherit",
                  }}>↓ Save</button>
                  <button onClick={() => setSprites((p) => p.filter((_, i) => i !== idx))} style={{
                    background: "transparent", border: "1px solid #222240", borderRadius: 4,
                    color: "#444466", cursor: "pointer", fontSize: 10, padding: "2px 8px", fontFamily: "inherit",
                  }}>✕</button>
                </div>
              </div>

              <div style={{
                display: "flex", justifyContent: "center", alignItems: "center",
                gap: 28, padding: 20, flexWrap: "wrap",
              }}>
                <SpritePreview imageData={sprite.imageData} zoom={zoom} label="ORIGINAL" subtle />
                <div style={{ color: "#2a2a4a", fontSize: 20, padding: "0 4px" }}>→</div>
                <SpritePreview imageData={sprite.styled} zoom={zoom}
                  label={STYLES.find((s) => s.id === selectedStyle)?.name.toUpperCase()} />
              </div>
            </div>
          ))}

          {sprites.length === 0 && (
            <div style={{ textAlign: "center", padding: "36px 20px", color: "#2a2a4a" }}>
              <div style={{ fontSize: 11, marginBottom: 10 }}>No sprites loaded</div>
              <div style={{ fontSize: 10, lineHeight: 1.8, maxWidth: 380, margin: "0 auto", color: "#333355" }}>
                Upload pixel art to apply structural transformations.
                Effects grow from sprite edges — spikes, vines, crystals, drips, flames and more.
                Original pixels stay in place, empty space remains transparent.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
