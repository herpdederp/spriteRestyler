import { useState, useRef, useCallback, useEffect } from "react";

const STYLES = [
  {
    id: "edgy",
    name: "Edgy",
    desc: "High contrast, dark & sharp",
    icon: "⚡",
    apply: (r, g, b, a) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const contrast = 1.8;
      const nr = Math.min(255, Math.max(0, ((r - 128) * contrast + 128)));
      const ng = Math.min(255, Math.max(0, ((g - 128) * contrast + 128)));
      const nb = Math.min(255, Math.max(0, ((b - 128) * contrast + 128)));
      return [nr * 0.9, ng * 0.7, nb * 0.7, a];
    },
  },
  {
    id: "grungy",
    name: "Grungy",
    desc: "Dirty, desaturated, worn",
    icon: "🪨",
    apply: (r, g, b, a) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const desat = 0.55;
      let nr = lum + (r - lum) * desat;
      let ng = lum + (g - lum) * desat;
      let nb = lum + (b - lum) * desat;
      nr = nr * 0.85 + 30;
      ng = ng * 0.78 + 20;
      nb = nb * 0.65 + 10;
      const noise = (Math.sin(r * 12.9898 + g * 78.233 + b * 45.164) * 43758.5453) % 1;
      const n = noise * 15 - 7;
      return [Math.min(255, Math.max(0, nr + n)), Math.min(255, Math.max(0, ng + n)), Math.min(255, Math.max(0, nb + n)), a];
    },
  },
  {
    id: "neon",
    name: "Neon",
    desc: "Vivid cyberpunk glow",
    icon: "💜",
    apply: (r, g, b, a) => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s, l = (max + min) / 2 / 255;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (510 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
      } else { s = 0; }
      s = Math.min(1, s * 2.2 + 0.3);
      l = Math.min(0.85, l * 1.15 + 0.08);
      const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      return [hue2rgb(p, q, h + 1/3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1/3) * 255, a];
    },
  },
  {
    id: "retro",
    name: "Retro",
    desc: "Warm sepia tones",
    icon: "📷",
    apply: (r, g, b, a) => {
      const nr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
      const ng = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
      const nb = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      return [nr, ng, nb, a];
    },
  },
  {
    id: "pastel",
    name: "Pastel",
    desc: "Soft, light, dreamy",
    icon: "🌸",
    apply: (r, g, b, a) => {
      const nr = r + (255 - r) * 0.55;
      const ng = g + (255 - g) * 0.55;
      const nb = b + (255 - b) * 0.55;
      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      return [lum + (nr - lum) * 0.65, lum + (ng - lum) * 0.65, lum + (nb - lum) * 0.65, a];
    },
  },
  {
    id: "frozen",
    name: "Frozen",
    desc: "Icy blue chill",
    icon: "❄️",
    apply: (r, g, b, a) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const nr = lum * 0.6 + r * 0.15 + 20;
      const ng = lum * 0.65 + g * 0.2 + 40;
      const nb = lum * 0.5 + b * 0.35 + 80;
      return [Math.min(255, nr), Math.min(255, ng), Math.min(255, nb), a];
    },
  },
  {
    id: "infernal",
    name: "Infernal",
    desc: "Hellfire red & orange",
    icon: "🔥",
    apply: (r, g, b, a) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const nr = Math.min(255, lum * 0.5 + r * 0.6 + 50);
      const ng = Math.min(255, lum * 0.25 + g * 0.2 + 15);
      const nb = Math.min(255, lum * 0.05 + b * 0.05);
      return [nr, ng, nb, a];
    },
  },
  {
    id: "toxic",
    name: "Toxic",
    desc: "Radioactive green haze",
    icon: "☢️",
    apply: (r, g, b, a) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const nr = Math.min(255, lum * 0.2 + r * 0.15);
      const ng = Math.min(255, lum * 0.55 + g * 0.5 + 40);
      const nb = Math.min(255, lum * 0.1 + b * 0.08);
      return [nr, ng, nb, a];
    },
  },
  {
    id: "vaporwave",
    name: "Vaporwave",
    desc: "Pink & cyan aesthetic",
    icon: "🌴",
    apply: (r, g, b, a) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const nr = Math.min(255, r * 0.5 + lum * 0.3 + 80);
      const ng = Math.min(255, g * 0.25 + lum * 0.15 + 40);
      const nb = Math.min(255, b * 0.5 + lum * 0.35 + 90);
      return [nr, ng, nb, a];
    },
  },
  {
    id: "noir",
    name: "Noir",
    desc: "Dark monochrome shadows",
    icon: "🕶️",
    apply: (r, g, b, a) => {
      let lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const contrast = 1.6;
      lum = ((lum - 128) * contrast + 128);
      lum = Math.min(255, Math.max(0, lum * 0.85));
      return [lum, lum, lum, a];
    },
  },
  {
    id: "glitch",
    name: "Glitch",
    desc: "Corrupted color channels",
    icon: "📺",
    apply: (r, g, b, a) => {
      const seed = (r * 17 + g * 31 + b * 47) % 255;
      const shift = seed > 180 ? 40 : seed > 100 ? -30 : 15;
      return [
        Math.min(255, Math.max(0, g + shift)),
        Math.min(255, Math.max(0, b - shift * 0.5)),
        Math.min(255, Math.max(0, r + shift * 0.7)),
        a
      ];
    },
  },
  {
    id: "gold",
    name: "Golden",
    desc: "Luxurious gold tint",
    icon: "👑",
    apply: (r, g, b, a) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const nr = Math.min(255, lum * 0.65 + 90);
      const ng = Math.min(255, lum * 0.55 + 60);
      const nb = Math.min(255, lum * 0.2 + 10);
      return [nr, ng, nb, a];
    },
  },
  {
    id: "pixel_art",
    name: "Pixel Art",
    desc: "Enhanced pixelation",
    icon: "🕹️",
    apply: (r, g, b, a) => {
      const levels = 6;
      const step = 255 / (levels - 1);
      const nr = Math.round(Math.round(r / step) * step);
      const ng = Math.round(Math.round(g / step) * step);
      const nb = Math.round(Math.round(b / step) * step);
      return [nr, ng, nb, a];
    },
  },
  {
    id: "outline",
    name: "Outline",
    desc: "Black border around content",
    icon: "✏️",
    apply: (r, g, b, a) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 180) return [0, 0, 0, a];
      return [255, 255, 255, a];
    },
  },
  {
    id: "silhouette",
    name: "Silhouette",
    desc: "Solid fill",
    icon: "👤",
    apply: (r, g, b, a) => {
      return [20, 20, 30, a];
    },
  },
  {
    id: "invert",
    name: "Invert",
    desc: "Color inversion",
    icon: "🔄",
    apply: (r, g, b, a) => {
      return [255 - r, 255 - g, 255 - b, a];
    },
  },
  {
    id: "monochrome",
    name: "Monochrome",
    desc: "Black & white",
    icon: "⬛",
    apply: (r, g, b, a) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      return [lum, lum, lum, a];
    },
  },
  {
    id: "sepia",
    name: "Sepia",
    desc: "Vintage tone",
    icon: "🎞️",
    apply: (r, g, b, a) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const nr = Math.min(255, lum + 40);
      const ng = Math.min(255, lum + 15);
      const nb = Math.min(255, lum - 20);
      return [nr, ng, Math.max(0, nb), a];
    },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    desc: "Neon purple & cyan",
    icon: "🌆",
    apply: (r, g, b, a) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const t = lum / 255;
      const nr = Math.min(255, lum * 0.4 + 140 * (1 - t) + r * 0.15);
      const ng = Math.min(255, lum * 0.15 + 30 * t + g * 0.1);
      const nb = Math.min(255, lum * 0.45 + 180 * t + b * 0.1);
      return [nr, ng, nb, a];
    },
  },
  {
    id: "cyberpunk_v2",
    name: "Cyberpunk v2",
    desc: "Neon purple & cyan shadows",
    icon: "🌃",
    apply: (r, g, b, a) => {
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      // Shadows → cyan, highlights → neon purple
      const nr = Math.min(255, lum * 180 + (1 - lum) * 0);
      const ng = Math.min(255, lum * 20 + (1 - lum) * 220);
      const nb = Math.min(255, lum * 255 + (1 - lum) * 240);
      return [nr, ng, nb, a];
    },
  },
  {
    id: "fire",
    name: "Fire",
    desc: "Red/orange/yellow gradient",
    icon: "🔥",
    apply: (r, g, b, a) => {
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      let nr, ng, nb;
      if (lum < 0.33) {
        nr = Math.min(255, lum * 3 * 200 + 55);
        ng = Math.min(255, lum * 3 * 20);
        nb = 0;
      } else if (lum < 0.66) {
        const t = (lum - 0.33) * 3;
        nr = 255;
        ng = Math.min(255, t * 180 + 20);
        nb = 0;
      } else {
        const t = (lum - 0.66) * 3;
        nr = 255;
        ng = Math.min(255, 180 + t * 75);
        nb = Math.min(255, t * 120);
      }
      return [nr, ng, nb, a];
    },
  },
  {
    id: "ice",
    name: "Ice",
    desc: "Cyan/blue/white gradient",
    icon: "🧊",
    apply: (r, g, b, a) => {
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      let nr, ng, nb;
      if (lum < 0.33) {
        nr = Math.min(255, lum * 3 * 30);
        ng = Math.min(255, lum * 3 * 60 + 20);
        nb = Math.min(255, lum * 3 * 140 + 80);
      } else if (lum < 0.66) {
        const t = (lum - 0.33) * 3;
        nr = Math.min(255, 30 + t * 80);
        ng = Math.min(255, 80 + t * 140);
        nb = Math.min(255, 220 + t * 35);
      } else {
        const t = (lum - 0.66) * 3;
        nr = Math.min(255, 110 + t * 145);
        ng = Math.min(255, 220 + t * 35);
        nb = 255;
      }
      return [nr, ng, nb, a];
    },
  },
];

function SpriteCanvas({ imageData, style, zoom, label, isOriginal }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!imageData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = imageData.width;
    canvas.height = imageData.height;

    if (isOriginal) {
      ctx.putImageData(imageData, 0, 0);
    } else {
      const styleDef = STYLES.find((s) => s.id === style);
      if (!styleDef) { ctx.putImageData(imageData, 0, 0); return; }
      const newData = ctx.createImageData(imageData.width, imageData.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        const a = imageData.data[i + 3];
        if (a === 0) {
          newData.data[i] = 0; newData.data[i+1] = 0; newData.data[i+2] = 0; newData.data[i+3] = 0;
          continue;
        }
        const [nr, ng, nb, na] = styleDef.apply(imageData.data[i], imageData.data[i+1], imageData.data[i+2], a);
        newData.data[i] = Math.round(nr);
        newData.data[i+1] = Math.round(ng);
        newData.data[i+2] = Math.round(nb);
        newData.data[i+3] = Math.round(na);
      }
      ctx.putImageData(newData, 0, 0);
    }
  }, [imageData, style, isOriginal]);

  if (!imageData) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{
        background: "repeating-conic-gradient(#1a1a2e 0% 25%, #16162a 0% 50%) 0 0 / 12px 12px",
        borderRadius: 6, padding: 4, border: "1px solid #2a2a4a",
        lineHeight: 0,
      }}>
        <canvas
          ref={canvasRef}
          style={{
            imageRendering: "pixelated",
            width: imageData ? imageData.width * zoom : 0,
            height: imageData ? imageData.height * zoom : 0,
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: "#8888aa", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>{label}</span>
    </div>
  );
}

export default function SpriteRestyler() {
  const [sprites, setSprites] = useState([]);
  const [selectedStyle, setSelectedStyle] = useState("edgy");
  const [zoom, setZoom] = useState(4);
  const [intensity, setIntensity] = useState(100);
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
          const data = ctx.getImageData(0, 0, img.width, img.height);
          resolve({ name: file.name, imageData: data, src: e.target.result });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFiles = useCallback(async (files) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const loaded = await Promise.all(imageFiles.map(loadImage));
    setSprites((prev) => [...prev, ...loaded]);
  }, [loadImage]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeSprite = (index) => {
    setSprites((prev) => prev.filter((_, i) => i !== index));
  };

  const downloadOne = (spriteData, styleDef) => {
    const canvas = document.createElement("canvas");
    canvas.width = spriteData.width;
    canvas.height = spriteData.height;
    const ctx = canvas.getContext("2d");
    const newData = ctx.createImageData(spriteData.width, spriteData.height);

    for (let i = 0; i < spriteData.data.length; i += 4) {
      const a = spriteData.data[i + 3];
      if (a === 0) { newData.data[i] = 0; newData.data[i+1] = 0; newData.data[i+2] = 0; newData.data[i+3] = 0; continue; }
      // Blend original with styled based on intensity
      const [sr, sg, sb, sa] = styleDef.apply(spriteData.data[i], spriteData.data[i+1], spriteData.data[i+2], a);
      const t = intensity / 100;
      newData.data[i] = Math.round(spriteData.data[i] * (1 - t) + sr * t);
      newData.data[i+1] = Math.round(spriteData.data[i+1] * (1 - t) + sg * t);
      newData.data[i+2] = Math.round(spriteData.data[i+2] * (1 - t) + sb * t);
      newData.data[i+3] = Math.round(a);
    }
    ctx.putImageData(newData, 0, 0);
    return canvas;
  };

  const handleDownloadAll = () => {
    const styleDef = STYLES.find((s) => s.id === selectedStyle);
    sprites.forEach((sprite) => {
      const canvas = downloadOne(sprite.imageData, styleDef);
      const link = document.createElement("a");
      const ext = sprite.name.replace(/\.[^.]+$/, "");
      link.download = `${ext}_${selectedStyle}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  };

  const getStyledImageData = (original) => {
    const styleDef = STYLES.find((s) => s.id === selectedStyle);
    if (!styleDef || intensity === 100) return null; // full intensity handled in SpriteCanvas
    // For partial intensity we need blended data
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const newData = ctx.createImageData(original.width, original.height);
    const t = intensity / 100;
    for (let i = 0; i < original.data.length; i += 4) {
      const a = original.data[i + 3];
      if (a === 0) { newData.data[i] = 0; newData.data[i+1] = 0; newData.data[i+2] = 0; newData.data[i+3] = 0; continue; }
      const [sr, sg, sb, sa] = styleDef.apply(original.data[i], original.data[i+1], original.data[i+2], a);
      newData.data[i] = Math.round(original.data[i] * (1 - t) + sr * t);
      newData.data[i+1] = Math.round(original.data[i+1] * (1 - t) + sg * t);
      newData.data[i+2] = Math.round(original.data[i+2] * (1 - t) + sb * t);
      newData.data[i+3] = a;
    }
    return newData;
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0c0c1a",
      color: "#d0d0e0",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        padding: "28px 32px 20px",
        borderBottom: "1px solid #1a1a35",
        background: "linear-gradient(180deg, #10102a 0%, #0c0c1a 100%)",
      }}>
        <h1 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 22,
          fontWeight: 900,
          margin: 0,
          letterSpacing: 4,
          background: "linear-gradient(135deg, #ff6b6b, #c084fc, #67e8f9)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          textTransform: "uppercase",
        }}>
          Sprite Restyler
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#555577", letterSpacing: 2 }}>
          RESTYLE PIXELS • PRESERVE POSITIONS • KEEP TRANSPARENCY
        </p>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 90px)" }}>
        {/* Sidebar */}
        <div style={{
          width: 260,
          minWidth: 260,
          borderRight: "1px solid #1a1a35",
          padding: "16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          background: "#0e0e20",
          overflowY: "auto",
        }}>
          {/* Style selector */}
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#666688", marginBottom: 8, textTransform: "uppercase", fontWeight: 600 }}>Style</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStyle(s.id)}
                  style={{
                    background: selectedStyle === s.id
                      ? "linear-gradient(90deg, #1e1e45, #2a1a40)"
                      : "transparent",
                    border: selectedStyle === s.id ? "1px solid #4a3a6a" : "1px solid transparent",
                    borderRadius: 6,
                    padding: "8px 10px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: selectedStyle === s.id ? "#e0d0f0" : "#7777aa",
                    textAlign: "left",
                    transition: "all 0.15s",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { if (selectedStyle !== s.id) e.currentTarget.style.background = "#14142e"; }}
                  onMouseLeave={(e) => { if (selectedStyle !== s.id) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{s.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 9, opacity: 0.5, marginTop: 1 }}>{s.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Zoom */}
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#666688", marginBottom: 8, textTransform: "uppercase", fontWeight: 600 }}>
              Zoom: {zoom}x
            </div>
            <input
              type="range" min="1" max="12" value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#8b5cf6" }}
            />
          </div>

          {/* Intensity */}
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#6666bb", marginBottom: 8, textTransform: "uppercase", fontWeight: 600 }}>
              Intensity: {intensity}%
            </div>
            <input
              type="range" min="0" max="100" value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#8b5cf6" }}
            />
          </div>

          {/* Actions */}
          {sprites.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              <button
                onClick={handleDownloadAll}
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 14px",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
              >
                ↓ Download All ({sprites.length})
              </button>
              <button
                onClick={() => setSprites([])}
                style={{
                  background: "transparent",
                  border: "1px solid #2a2a45",
                  borderRadius: 6,
                  padding: "8px 14px",
                  color: "#666688",
                  fontSize: 10,
                  cursor: "pointer",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                }}
              >
                Clear All
              </button>
            </div>
          )}
        </div>

        {/* Main area */}
        <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "#8b5cf6" : "#2a2a4a"}`,
              borderRadius: 10,
              padding: sprites.length > 0 ? "16px 24px" : "48px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? "#14142e" : "#0e0e22",
              transition: "all 0.2s",
              marginBottom: 24,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              style={{ display: "none" }}
            />
            {sprites.length === 0 ? (
              <>
                <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>🎨</div>
                <div style={{ fontSize: 13, color: "#6666aa", fontWeight: 500 }}>
                  Drop sprites here or click to browse
                </div>
                <div style={{ fontSize: 10, color: "#444466", marginTop: 6 }}>
                  PNG recommended for transparency • Multiple files supported
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: "#6666aa" }}>
                + Add more sprites
              </div>
            )}
          </div>

          {/* Sprites grid */}
          {sprites.map((sprite, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: 28,
                background: "#0e0e22",
                borderRadius: 10,
                border: "1px solid #1a1a35",
                overflow: "hidden",
              }}
            >
              {/* Sprite header */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 16px",
                borderBottom: "1px solid #1a1a30",
                background: "#111128",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#9999cc" }}>{sprite.name}</span>
                  <span style={{ fontSize: 9, color: "#444466" }}>
                    {sprite.imageData.width}×{sprite.imageData.height}
                  </span>
                </div>
                <button
                  onClick={() => removeSprite(idx)}
                  style={{
                    background: "transparent",
                    border: "1px solid #2a2a40",
                    borderRadius: 4,
                    color: "#555577",
                    cursor: "pointer",
                    fontSize: 11,
                    padding: "2px 8px",
                    fontFamily: "inherit",
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Side-by-side canvases */}
              <div style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                gap: 32,
                padding: 20,
                flexWrap: "wrap",
              }}>
                <SpriteCanvas
                  imageData={sprite.imageData}
                  style={selectedStyle}
                  zoom={zoom}
                  label="ORIGINAL"
                  isOriginal={true}
                />
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  alignSelf: "center",
                  color: "#333355",
                  fontSize: 20,
                  padding: "0 4px",
                }}>
                  →
                </div>
                <SpriteCanvas
                  imageData={intensity < 100 ? getStyledImageData(sprite.imageData) || sprite.imageData : sprite.imageData}
                  style={intensity < 100 ? null : selectedStyle}
                  zoom={zoom}
                  label={STYLES.find(s => s.id === selectedStyle)?.name.toUpperCase()}
                  isOriginal={intensity < 100}
                />
              </div>
            </div>
          ))}

          {sprites.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#333355" }}>
              <div style={{ fontSize: 12, marginBottom: 12 }}>No sprites loaded yet</div>
              <div style={{ fontSize: 10, lineHeight: 1.8, maxWidth: 360, margin: "0 auto" }}>
                Upload pixel art sprites to restyle them. All pixel positions and transparent areas
                are preserved exactly — only the colors change.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
