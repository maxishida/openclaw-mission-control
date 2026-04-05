import type { VirtualOfficeAgentStatus, VirtualOfficeAgentView } from "@/lib/virtual-office";

export type PixelAgentSprite = {
  background: string;
  cells: string[];
  frame: string;
  glow: string;
  size: number;
};

const SPRITE_SIZE = 8;

const lanePalettes = {
  build: {
    background: "#131c30",
    frame: "#74b7ff",
    glow: "rgba(80, 173, 255, 0.24)",
    primary: "#86c6ff",
    secondary: "#1d7bd8",
    accent: "#eff8ff",
  },
  lead: {
    background: "#24180d",
    frame: "#ffcf66",
    glow: "rgba(255, 205, 102, 0.22)",
    primary: "#ffda83",
    secondary: "#ce8b20",
    accent: "#fff8cf",
  },
  monitor: {
    background: "#0f2724",
    frame: "#7bd5b8",
    glow: "rgba(107, 217, 182, 0.22)",
    primary: "#91f0cf",
    secondary: "#1f9a7c",
    accent: "#dffef2",
  },
  publish: {
    background: "#251326",
    frame: "#ff90d0",
    glow: "rgba(255, 130, 195, 0.22)",
    primary: "#ffade1",
    secondary: "#cb4f9f",
    accent: "#fff1fb",
  },
  research: {
    background: "#151734",
    frame: "#a394ff",
    glow: "rgba(163, 148, 255, 0.22)",
    primary: "#beb4ff",
    secondary: "#6657dc",
    accent: "#f4f1ff",
  },
  review: {
    background: "#2a1f11",
    frame: "#ffc880",
    glow: "rgba(255, 182, 92, 0.2)",
    primary: "#ffd899",
    secondary: "#cd8b2b",
    accent: "#fff2dc",
  },
} as const;

const statusFrame: Record<VirtualOfficeAgentStatus, string> = {
  checkpoint: "#ffcf66",
  delivering: "#80f5ff",
  done: "#7ef0a2",
  error: "#ff8f9c",
  idle: "#94a3b8",
  monitoring: "#6ad9b6",
  retry: "#ffb067",
  working: "#74b7ff",
};

const statusGlow: Record<VirtualOfficeAgentStatus, string> = {
  checkpoint: "rgba(255, 207, 102, 0.24)",
  delivering: "rgba(128, 245, 255, 0.24)",
  done: "rgba(126, 240, 162, 0.22)",
  error: "rgba(255, 143, 156, 0.24)",
  idle: "rgba(148, 163, 184, 0.16)",
  monitoring: "rgba(106, 217, 182, 0.2)",
  retry: "rgba(255, 176, 103, 0.24)",
  working: "rgba(116, 183, 255, 0.24)",
};

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const nextSeed = (seed: number) => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

const setPixel = (cells: string[], row: number, col: number, color: string, size = SPRITE_SIZE) => {
  if (row < 0 || row >= size || col < 0 || col >= size) return;
  cells[row * size + col] = color;
};

const mirrorPixel = (
  cells: string[],
  row: number,
  col: number,
  color: string,
  size = SPRITE_SIZE,
) => {
  setPixel(cells, row, col, color, size);
  setPixel(cells, row, size - 1 - col, color, size);
};

export const buildPixelAgentSprite = (
  agent: VirtualOfficeAgentView,
  size = SPRITE_SIZE,
): PixelAgentSprite => {
  const palette = lanePalettes[agent.lane];
  const cells = Array.from({ length: size * size }, () => "transparent");
  let seed = hashString(`${agent.id}:${agent.name}:${agent.lane}:${agent.role}`);

  mirrorPixel(cells, 0, 2, palette.secondary, size);
  if ((seed & 1) === 1) {
    setPixel(cells, 0, 3, palette.accent, size);
    setPixel(cells, 0, 4, palette.accent, size);
  } else {
    setPixel(cells, 0, 3, palette.secondary, size);
    setPixel(cells, 0, 4, palette.secondary, size);
  }

  for (let row = 1; row <= 5; row += 1) {
    for (let col = 1; col <= 3; col += 1) {
      seed = nextSeed(seed);
      const active = row <= 3 || (seed & 3) !== 0;
      if (!active) continue;
      const color =
        row === 2 && col === 2
          ? palette.secondary
          : (seed & 1) === 0
            ? palette.primary
            : palette.secondary;
      mirrorPixel(cells, row, col, color, size);
    }
  }

  setPixel(cells, 2, 2, palette.accent, size);
  setPixel(cells, 2, 5, palette.accent, size);
  setPixel(cells, 3, 3, palette.primary, size);
  setPixel(cells, 3, 4, palette.primary, size);

  seed = nextSeed(seed);
  if ((seed & 1) === 0) {
    mirrorPixel(cells, 4, 1, palette.secondary, size);
  }

  seed = nextSeed(seed);
  mirrorPixel(cells, 5, 1, (seed & 1) === 0 ? palette.primary : palette.secondary, size);
  mirrorPixel(cells, 6, 2, palette.secondary, size);
  mirrorPixel(cells, 7, 2, palette.secondary, size);

  if (agent.is_lead) {
    setPixel(cells, 1, 3, palette.accent, size);
    setPixel(cells, 1, 4, palette.accent, size);
  }

  return {
    background: palette.background,
    cells,
    frame: statusFrame[agent.status] ?? palette.frame,
    glow: statusGlow[agent.status] ?? palette.glow,
    size,
  };
};
