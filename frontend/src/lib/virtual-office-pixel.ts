import type { VirtualOfficeAgentStatus, VirtualOfficeAgentView } from "@/lib/virtual-office";

export type PixelAgentSprite = {
  background: string;
  cells: string[];
  frame: string;
  glow: string;
  size: number;
};

const SPRITE_WIDTH = 12;
const SPRITE_HEIGHT = 16;

const lanePalettes = {
  build: {
    accent: "#67b9ff",
    accentAlt: "#1d7bd8",
    glow: "rgba(80, 173, 255, 0.24)",
  },
  lead: {
    accent: "#ffcf66",
    accentAlt: "#ce8b20",
    glow: "rgba(255, 205, 102, 0.22)",
  },
  monitor: {
    accent: "#7bd5b8",
    accentAlt: "#1f9a7c",
    glow: "rgba(107, 217, 182, 0.22)",
  },
  publish: {
    accent: "#ff90d0",
    accentAlt: "#cb4f9f",
    glow: "rgba(255, 130, 195, 0.22)",
  },
  research: {
    accent: "#a394ff",
    accentAlt: "#6657dc",
    glow: "rgba(163, 148, 255, 0.22)",
  },
  review: {
    accent: "#ffc880",
    accentAlt: "#cd8b2b",
    glow: "rgba(255, 182, 92, 0.2)",
  },
} as const;

const statusFrame: Record<VirtualOfficeAgentStatus, string> = {
  checkpoint: "#ffcf66",
  delivering: "#80f5ff",
  done: "#7ef0a2",
  error: "#ff8f9c",
  idle: "rgba(255,255,255,0.12)",
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

type CharacterPalette = {
  hair: string;
  hairShade: string;
  outfit: string;
  outfitShade: string;
  skin: string;
  skinShade: string;
};

type CharacterTemplate = {
  name: string;
  palette: CharacterPalette;
  pattern: string[];
};

const CHARACTER_TEMPLATES: CharacterTemplate[] = [
  {
    name: "metro-blonde-analyst",
    palette: {
      hair: "#b88851",
      hairShade: "#6f4828",
      outfit: "#4b76c7",
      outfitShade: "#294782",
      skin: "#f0c8a1",
      skinShade: "#bb8d63",
    },
    pattern: [
      "....HHHH....",
      "...HHHHHH...",
      "...HhHHhH...",
      "...HHHHHH...",
      "...HSSSSH...",
      "..HHSSSSHH..",
      "..HOOSSOOH..",
      "..HOAOAAOH..",
      "..HOOOOOOH..",
      "...DOOOD....",
      "...DOOOD....",
      "...OIIOI....",
      "...OIIOI....",
      "..OO..OO....",
      "..OO..OO....",
      "..DD..DD....",
    ],
  },
  {
    name: "metro-curly-operator",
    palette: {
      hair: "#c58a52",
      hairShade: "#7c4c27",
      outfit: "#3d2f47",
      outfitShade: "#221926",
      skin: "#f2c9ac",
      skinShade: "#bc8d72",
    },
    pattern: [
      "...HHHHH....",
      "..HHHHHHH...",
      "..HhHHHhH...",
      "...HHHHHH...",
      "...HSSSSH...",
      "..HHSSSSHH..",
      "..HOOIIOOH..",
      "..HOOAAOOH..",
      "...OOOOOO...",
      "...DOOOD....",
      "...DOOOD....",
      "...OIIIO....",
      "...OIIIO....",
      "..OO..OO....",
      "..OO..OO....",
      "..DD..DD....",
    ],
  },
  {
    name: "metro-orange-strategist",
    palette: {
      hair: "#2b1b14",
      hairShade: "#140b08",
      outfit: "#ef7f39",
      outfitShade: "#9c471c",
      skin: "#6b452e",
      skinShade: "#402619",
    },
    pattern: [
      "...HHHHH....",
      "..HHHHHH....",
      "..HHHHHH....",
      "...HSSSH....",
      "...SSSSS....",
      "..HHSSSSHH..",
      "..HOOIIOOH..",
      "..HOOAAOOH..",
      "...OOOOOO...",
      "...DOOOD....",
      "..DOOOOD....",
      "..OIIIII....",
      "..OIIIII....",
      "..OO..OO....",
      "..OO..OO....",
      "..DD..DD....",
    ],
  },
  {
    name: "metro-red-editor",
    palette: {
      hair: "#222326",
      hairShade: "#0f1114",
      outfit: "#d45b56",
      outfitShade: "#8f3535",
      skin: "#f1c0a8",
      skinShade: "#b87f6f",
    },
    pattern: [
      "...HHHHH....",
      "..HHHHHH....",
      "..HHHHHH....",
      "...HHSSSH...",
      "...SSSSSS...",
      "..HHSSSSHH..",
      "..HOOIIOOH..",
      "..HOOAAOOH..",
      "...OOOOOO...",
      "...DOOOD....",
      "..DOOOOD....",
      "..OIIIIO....",
      "..OIIIIO....",
      "..OO..OO....",
      "..OO..OO....",
      "..DD..DD....",
    ],
  },
  {
    name: "metro-silver-reviewer",
    palette: {
      hair: "#d7dce8",
      hairShade: "#8f99ab",
      outfit: "#a7a8b6",
      outfitShade: "#656878",
      skin: "#f3cfb9",
      skinShade: "#ba8f76",
    },
    pattern: [
      "...HHHHH....",
      "..HHHHHHH...",
      "..HHHhHHH...",
      "...HHHHHH...",
      "...HSSSSH...",
      "..HHSSSSHH..",
      "..HOOIIOOH..",
      "..HOOAAOOH..",
      "...OOOOOO...",
      "...DOOOD....",
      "...DOOOD....",
      "..OIIIII....",
      "..OIIIII....",
      "..OO..OO....",
      "..OO..OO....",
      "..DD..DD....",
    ],
  },
  {
    name: "metro-brown-builder",
    palette: {
      hair: "#71411f",
      hairShade: "#452410",
      outfit: "#5f9be0",
      outfitShade: "#365e94",
      skin: "#f0c6a4",
      skinShade: "#b98765",
    },
    pattern: [
      "...HHHHH....",
      "..HHHHHH....",
      "..HhHHHhH...",
      "...HHHHHH...",
      "...HSSSSH...",
      "..HHSSSSHH..",
      "..HOOIIOOH..",
      "..HOOAAOOH..",
      "...OOOOOO...",
      "..DOOOOD....",
      "..DOOOOD....",
      "...OIIIO....",
      "...OIIIO....",
      "..OO..OO....",
      "..OO..OO....",
      "..DD..DD....",
    ],
  },
];

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const renderPattern = (
  pattern: string[],
  palette: CharacterPalette & { accent: string; accentAlt: string },
) => {
  const colorMap: Record<string, string> = {
    A: palette.accent,
    D: "rgba(13,18,31,0.72)",
    H: palette.hair,
    I: palette.outfitShade,
    O: palette.outfit,
    S: palette.skin,
    h: palette.hairShade,
    s: palette.skinShade,
  };

  const cells: string[] = [];
  for (const row of pattern) {
    for (const token of row) {
      if (token === ".") {
        cells.push("transparent");
        continue;
      }
      cells.push(colorMap[token] ?? palette.accentAlt);
    }
  }
  return cells;
};

export const buildPixelAgentSprite = (
  agent: VirtualOfficeAgentView,
  size = SPRITE_WIDTH,
): PixelAgentSprite => {
  const palette = lanePalettes[agent.lane];
  const templateIndex = hashString(`${agent.id}:${agent.name}:${agent.role}`) % CHARACTER_TEMPLATES.length;
  const template = CHARACTER_TEMPLATES[templateIndex];
  const cells = renderPattern(template.pattern, {
    ...template.palette,
    accent: palette.accent,
    accentAlt: palette.accentAlt,
  });

  if (agent.is_lead) {
    const badgeIndex = 6 * SPRITE_WIDTH + 5;
    const badgeIndexAlt = 6 * SPRITE_WIDTH + 6;
    cells[badgeIndex] = palette.accent;
    cells[badgeIndexAlt] = palette.accentAlt;
  }

  return {
    background: "transparent",
    cells: cells.slice(0, size * SPRITE_HEIGHT),
    frame: statusFrame[agent.status] ?? "rgba(255,255,255,0.12)",
    glow: statusGlow[agent.status] ?? palette.glow,
    size,
  };
};
