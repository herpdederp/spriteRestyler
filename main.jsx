import { useState } from "react";
import { createRoot } from "react-dom/client";
import SpriteRestyler from "./sprite-restyler";
import SpriteTransformer from "./sprite-transformer";

const TABS = [
  { id: "restyler", label: "Restyler", icon: "🎨", desc: "Color styles" },
  { id: "transformer", label: "Transformer", icon: "🔮", desc: "Structural effects" },
];

function App() {
  const [activeTab, setActiveTab] = useState("restyler");

  return (
    <div style={{ minHeight: "100vh", background: "#0c0c1a" }}>
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Orbitron:wght@400;700;900&display=swap"
        rel="stylesheet"
      />

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "10px 16px 0",
          background: "linear-gradient(180deg, #08081a 0%, #0c0c1a 100%)",
          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background:
                activeTab === tab.id
                  ? "#0c0c1a"
                  : "transparent",
              border: activeTab === tab.id
                ? "1px solid #1a1a35"
                : "1px solid transparent",
              borderBottom: activeTab === tab.id
                ? "1px solid #0c0c1a"
                : "1px solid transparent",
              borderRadius: "8px 8px 0 0",
              padding: "10px 20px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: activeTab === tab.id ? "#e0d0f0" : "#555577",
              fontFamily: "inherit",
              transition: "all 0.15s",
              position: "relative",
              bottom: -1,
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.id)
                e.currentTarget.style.color = "#8888bb";
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id)
                e.currentTarget.style.color = "#555577";
            }}
          >
            <span style={{ fontSize: 16 }}>{tab.icon}</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: activeTab === tab.id ? 600 : 400,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {tab.label}
            </span>
            <span
              style={{
                fontSize: 9,
                opacity: 0.5,
                marginLeft: 2,
              }}
            >
              {tab.desc}
            </span>
          </button>
        ))}
      </div>
      <div style={{ height: 1, background: "#1a1a35" }} />

      {/* Active tool */}
      {activeTab === "restyler" ? <SpriteRestyler /> : <SpriteTransformer />}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
