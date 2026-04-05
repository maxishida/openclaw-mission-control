#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const puppeteer = require("puppeteer");
const sharp = require("sharp");

const WIDTH = 1080;
const HEIGHT = 1350;
const TEMPLATE_LIBRARY = {
  "cyberpunk-green-core": {
    palettePreset: "acid-lime",
    metaTheme: "agentes de IA",
    metaTone: "editorial system",
    footerMode: "instagram carousel",
    layoutFamily: "center-manifesto",
    palettes: [
      {
        bgTop: "#03110c",
        bgBottom: "#071b16",
        accent: "#68ffb6",
        accentStrong: "#22f090",
        accentSoft: "rgba(104,255,182,0.18)",
        accentAlt: "#c6ff67",
        glowA: "rgba(34,240,144,0.32)",
        glowB: "rgba(104,255,182,0.18)",
        border: "rgba(104,255,182,0.24)",
        text: "#effff7",
        muted: "#b8d8cb",
        panel: "rgba(8, 28, 21, 0.9)",
      },
      {
        bgTop: "#04120f",
        bgBottom: "#0a1f18",
        accent: "#87ffd0",
        accentStrong: "#35ffc7",
        accentSoft: "rgba(135,255,208,0.18)",
        accentAlt: "#d5ff78",
        glowA: "rgba(53,255,199,0.22)",
        glowB: "rgba(213,255,120,0.14)",
        border: "rgba(135,255,208,0.22)",
        text: "#f2fff8",
        muted: "#c8e7db",
        panel: "rgba(9, 31, 24, 0.9)",
      },
    ],
  },
  "petroleum-radar": {
    palettePreset: "ice-blue",
    metaTheme: "ops com IA",
    metaTone: "signal map",
    footerMode: "instagram carousel",
    layoutFamily: "left-signal-card",
    palettes: [
      {
        bgTop: "#06111a",
        bgBottom: "#0a1d2b",
        accent: "#65ffd4",
        accentStrong: "#22efb2",
        accentSoft: "rgba(101,255,212,0.16)",
        accentAlt: "#58c8ff",
        glowA: "rgba(34,239,178,0.20)",
        glowB: "rgba(88,200,255,0.16)",
        border: "rgba(101,255,212,0.22)",
        text: "#effbff",
        muted: "#bfd9e5",
        panel: "rgba(8, 24, 36, 0.9)",
      },
      {
        bgTop: "#07121d",
        bgBottom: "#10263a",
        accent: "#5ef0ff",
        accentStrong: "#27d2ff",
        accentSoft: "rgba(94,240,255,0.16)",
        accentAlt: "#65ffd4",
        glowA: "rgba(39,210,255,0.18)",
        glowB: "rgba(101,255,212,0.16)",
        border: "rgba(94,240,255,0.22)",
        text: "#f1fbff",
        muted: "#c5dceb",
        panel: "rgba(10, 27, 41, 0.9)",
      },
    ],
  },
  "violet-hologrid": {
    palettePreset: "electric-violet",
    metaTheme: "stack de IA",
    metaTone: "future ops",
    footerMode: "instagram carousel",
    layoutFamily: "split-panel",
    palettes: [
      {
        bgTop: "#12081a",
        bgBottom: "#1c1028",
        accent: "#86ffcb",
        accentStrong: "#3ff0b1",
        accentSoft: "rgba(134,255,203,0.18)",
        accentAlt: "#a77cff",
        glowA: "rgba(63,240,177,0.18)",
        glowB: "rgba(167,124,255,0.18)",
        border: "rgba(134,255,203,0.22)",
        text: "#f8f5ff",
        muted: "#d7cff2",
        panel: "rgba(23, 12, 33, 0.9)",
      },
      {
        bgTop: "#140a21",
        bgBottom: "#24123b",
        accent: "#a7ffc6",
        accentStrong: "#5bf0b0",
        accentSoft: "rgba(167,255,198,0.16)",
        accentAlt: "#c58cff",
        glowA: "rgba(91,240,176,0.16)",
        glowB: "rgba(197,140,255,0.18)",
        border: "rgba(167,255,198,0.2)",
        text: "#fbf7ff",
        muted: "#dfd5f6",
        panel: "rgba(27, 14, 40, 0.9)",
      },
    ],
  },
  "graphite-hud": {
    palettePreset: "graphite-cyan",
    metaTheme: "workflow real",
    metaTone: "operator mode",
    footerMode: "instagram carousel",
    layoutFamily: "bottom-proof-panel",
    palettes: [
      {
        bgTop: "#111417",
        bgBottom: "#1a2024",
        accent: "#63ffd0",
        accentStrong: "#1fe6ad",
        accentSoft: "rgba(99,255,208,0.16)",
        accentAlt: "#6fc4ff",
        glowA: "rgba(31,230,173,0.16)",
        glowB: "rgba(111,196,255,0.14)",
        border: "rgba(99,255,208,0.18)",
        text: "#f5fbfd",
        muted: "#cad7dd",
        panel: "rgba(22, 27, 31, 0.9)",
      },
      {
        bgTop: "#15171b",
        bgBottom: "#20242b",
        accent: "#8cf4ff",
        accentStrong: "#38d2e7",
        accentSoft: "rgba(140,244,255,0.15)",
        accentAlt: "#9fdaff",
        glowA: "rgba(56,210,231,0.15)",
        glowB: "rgba(159,218,255,0.12)",
        border: "rgba(140,244,255,0.18)",
        text: "#f5fbff",
        muted: "#d0dbe1",
        panel: "rgba(24, 30, 35, 0.9)",
      },
    ],
  },
  "linkedin-cyber-blue": {
    palettePreset: "linkedin-cyber-blue",
    metaTheme: "sistema editorial",
    metaTone: "linkedin inspired",
    footerMode: "instagram carousel",
    layoutFamily: "linkedin-editorial",
    palettes: [
      {
        bgTop: "#0B0F1A",
        bgBottom: "#0f1525",
        accent: "#00E5FF",
        accentStrong: "#00c8e0",
        accentSoft: "rgba(0,229,255,0.18)",
        accentAlt: "#7B00FF",
        glowA: "rgba(0,229,255,0.3)",
        glowB: "rgba(123,0,255,0.22)",
        border: "rgba(0,229,255,0.26)",
        text: "#EAF6FF",
        muted: "#a0c4e8",
        panel: "rgba(20, 26, 42, 0.92)",
      },
    ],
  },
  "linkedin-neon-pink": {
    palettePreset: "linkedin-neon-pink",
    metaTheme: "sistema editorial",
    metaTone: "linkedin inspired",
    footerMode: "instagram carousel",
    layoutFamily: "linkedin-editorial",
    palettes: [
      {
        bgTop: "#0A0A0F",
        bgBottom: "#101018",
        accent: "#FF007A",
        accentStrong: "#FF4D9D",
        accentSoft: "rgba(255,0,122,0.18)",
        accentAlt: "#ff80b3",
        glowA: "rgba(255,0,122,0.3)",
        glowB: "rgba(255,77,157,0.22)",
        border: "rgba(255,0,122,0.26)",
        text: "#FFE6F2",
        muted: "#e8a0c8",
        panel: "rgba(26, 26, 34, 0.92)",
      },
    ],
  },
  "linkedin-orange": {
    palettePreset: "linkedin-orange",
    metaTheme: "sistema editorial",
    metaTone: "linkedin inspired",
    footerMode: "instagram carousel",
    layoutFamily: "linkedin-editorial",
    palettes: [
      {
        bgTop: "#0D0D0D",
        bgBottom: "#141414",
        accent: "#FF6A00",
        accentStrong: "#FFB347",
        accentSoft: "rgba(255,106,0,0.18)",
        accentAlt: "#ffd080",
        glowA: "rgba(255,106,0,0.3)",
        glowB: "rgba(255,179,71,0.22)",
        border: "rgba(255,106,0,0.26)",
        text: "#FFF4E6",
        muted: "#e8c8a0",
        panel: "rgba(28, 28, 28, 0.92)",
      },
    ],
  },
  "alert-signal": {
    palettePreset: "plasma-amber",
    metaTheme: "execucao",
    metaTone: "priority lane",
    footerMode: "instagram carousel",
    layoutFamily: "left-signal-card",
    palettes: [
      {
        bgTop: "#10130f",
        bgBottom: "#182018",
        accent: "#75ffb1",
        accentStrong: "#22ef8a",
        accentSoft: "rgba(117,255,177,0.16)",
        accentAlt: "#ffb457",
        glowA: "rgba(34,239,138,0.16)",
        glowB: "rgba(255,180,87,0.12)",
        border: "rgba(117,255,177,0.20)",
        text: "#f8fff8",
        muted: "#d0dccd",
        panel: "rgba(21, 29, 21, 0.9)",
      },
      {
        bgTop: "#121512",
        bgBottom: "#22221a",
        accent: "#97ffb2",
        accentStrong: "#4df07e",
        accentSoft: "rgba(151,255,178,0.15)",
        accentAlt: "#ffc36b",
        glowA: "rgba(77,240,126,0.14)",
        glowB: "rgba(255,195,107,0.12)",
        border: "rgba(151,255,178,0.18)",
        text: "#fbfff8",
        muted: "#d9decf",
        panel: "rgba(25, 30, 23, 0.9)",
      },
    ],
  },
  "ice-command": {
    palettePreset: "ice-blue",
    metaTheme: "coordination layer",
    metaTone: "cold system map",
    footerMode: "instagram carousel",
    layoutFamily: "split-panel",
    palettes: [
      {
        bgTop: "#07131d",
        bgBottom: "#0b2333",
        accent: "#90f6ff",
        accentStrong: "#41dfff",
        accentSoft: "rgba(144,246,255,0.16)",
        accentAlt: "#85c7ff",
        glowA: "rgba(65,223,255,0.18)",
        glowB: "rgba(133,199,255,0.14)",
        border: "rgba(144,246,255,0.2)",
        text: "#f0fbff",
        muted: "#c8deea",
        panel: "rgba(10, 30, 43, 0.9)",
      },
    ],
  },
  "ember-ops": {
    palettePreset: "plasma-amber",
    metaTheme: "operator urgency",
    metaTone: "proof panel",
    footerMode: "instagram carousel",
    layoutFamily: "bottom-proof-panel",
    palettes: [
      {
        bgTop: "#171314",
        bgBottom: "#231c1d",
        accent: "#ffd28a",
        accentStrong: "#ff9c49",
        accentSoft: "rgba(255,210,138,0.16)",
        accentAlt: "#ffcf6c",
        glowA: "rgba(255,156,73,0.16)",
        glowB: "rgba(255,207,108,0.12)",
        border: "rgba(255,210,138,0.18)",
        text: "#fff7f2",
        muted: "#e4d6cc",
        panel: "rgba(35, 27, 24, 0.92)",
      },
    ],
  },
  "lunar-ledger": {
    palettePreset: "lunar-violet",
    metaTheme: "decision ledger",
    metaTone: "timeline system",
    footerMode: "instagram carousel",
    layoutFamily: "timeline-stack",
    palettes: [
      {
        bgTop: "#0e121d",
        bgBottom: "#171d31",
        accent: "#b7b8ff",
        accentStrong: "#8e91ff",
        accentSoft: "rgba(183,184,255,0.16)",
        accentAlt: "#7ff4ff",
        glowA: "rgba(142,145,255,0.16)",
        glowB: "rgba(127,244,255,0.12)",
        border: "rgba(183,184,255,0.18)",
        text: "#f6f7ff",
        muted: "#d5d9ee",
        panel: "rgba(20, 24, 40, 0.92)",
      },
    ],
  },
  "checklist-neon": {
    palettePreset: "magenta-teal",
    metaTheme: "execution checklist",
    metaTone: "module grid",
    footerMode: "instagram carousel",
    layoutFamily: "checklist-grid",
    palettes: [
      {
        bgTop: "#081714",
        bgBottom: "#0f2621",
        accent: "#89ffc3",
        accentStrong: "#39e890",
        accentSoft: "rgba(137,255,195,0.16)",
        accentAlt: "#dfff7a",
        glowA: "rgba(57,232,144,0.16)",
        glowB: "rgba(223,255,122,0.12)",
        border: "rgba(137,255,195,0.18)",
        text: "#f4fff8",
        muted: "#cddfd8",
        panel: "rgba(15, 32, 27, 0.92)",
      },
    ],
  },
};

const PALETTE_LIBRARY = {
  "neon-blue-cyan": [
    { variantId: "neon-blue-cyan-v1", bgTop: "#050816", bgBottom: "#0B1D3A", accent: "#00E5FF", accentStrong: "#00B2FF", accentAlt: "#7AF7FF", panelBase: "#111827" },
    { variantId: "neon-blue-cyan-v2", bgTop: "#07111F", bgBottom: "#123D6A", accent: "#00D9FF", accentStrong: "#1F6BFF", accentAlt: "#D9FCFF", panelBase: "#13243C" },
    { variantId: "neon-blue-cyan-v3", bgTop: "#0A0F1F", bgBottom: "#123C69", accent: "#33E7FF", accentStrong: "#00B2FF", accentAlt: "#7AF7FF", panelBase: "#162844" },
  ],
  "space-blue": [
    { variantId: "space-blue-v1", bgTop: "#050816", bgBottom: "#123C69", accent: "#00E5FF", accentStrong: "#1F6BFF", accentAlt: "#7AF7FF", panelBase: "#10141F" },
    { variantId: "space-blue-v2", bgTop: "#07111F", bgBottom: "#0C2340", accent: "#00B2FF", accentStrong: "#2979FF", accentAlt: "#DFFFFB", panelBase: "#132036" },
    { variantId: "space-blue-v3", bgTop: "#0D1020", bgBottom: "#123D6A", accent: "#00F5D4", accentStrong: "#00B8FF", accentAlt: "#D9FCFF", panelBase: "#15243C" },
  ],
  "tech-navy": [
    { variantId: "tech-navy-v1", bgTop: "#07111F", bgBottom: "#123D6A", accent: "#00D9FF", accentStrong: "#1F6BFF", accentAlt: "#DFFFFB", panelBase: "#10141F" },
    { variantId: "tech-navy-v2", bgTop: "#0A0F1F", bgBottom: "#0C2340", accent: "#00E5FF", accentStrong: "#2979FF", accentAlt: "#7AF7FF", panelBase: "#141B2A" },
    { variantId: "tech-navy-v3", bgTop: "#10131A", bgBottom: "#123D6A", accent: "#00B8FF", accentStrong: "#1F6BFF", accentAlt: "#D9FCFF", panelBase: "#182231" },
  ],
  "green-cyan-cyber": [
    { variantId: "green-cyan-cyber-v1", bgTop: "#06131A", bgBottom: "#0A2E36", accent: "#00FF94", accentStrong: "#00D9FF", accentAlt: "#D6FFF4", panelBase: "#0E1E1B" },
    { variantId: "green-cyan-cyber-v2", bgTop: "#041317", bgBottom: "#125D6A", accent: "#0AFFC6", accentStrong: "#00B8FF", accentAlt: "#DFFFFB", panelBase: "#123A32" },
    { variantId: "green-cyan-cyber-v3", bgTop: "#03130F", bgBottom: "#0A5C47", accent: "#00E5A8", accentStrong: "#00D9FF", accentAlt: "#D6FFF4", panelBase: "#102A24" },
  ],
  "cyber-green": [
    { variantId: "cyber-green-v1", bgTop: "#03130F", bgBottom: "#0A5C47", accent: "#00FF94", accentStrong: "#39FF14", accentAlt: "#D6FFF4", panelBase: "#0E1E1B" },
    { variantId: "cyber-green-v2", bgTop: "#06131A", bgBottom: "#062E25", accent: "#00E5A8", accentStrong: "#00FF94", accentAlt: "#0AFFC6", panelBase: "#123A32" },
    { variantId: "cyber-green-v3", bgTop: "#041317", bgBottom: "#125D6A", accent: "#39FF14", accentStrong: "#00FF85", accentAlt: "#F4FFD6", panelBase: "#0F2621" },
  ],
  "lime-electric": [
    { variantId: "lime-electric-v1", bgTop: "#06131A", bgBottom: "#0A2E36", accent: "#D9FF00", accentStrong: "#39FF14", accentAlt: "#F4FFD6", panelBase: "#1A2024" },
    { variantId: "lime-electric-v2", bgTop: "#03130F", bgBottom: "#0A5C47", accent: "#A7FF0A", accentStrong: "#00FF85", accentAlt: "#D6FFF4", panelBase: "#182018" },
    { variantId: "lime-electric-v3", bgTop: "#041317", bgBottom: "#125D6A", accent: "#39FF14", accentStrong: "#00D9FF", accentAlt: "#F4FFD6", panelBase: "#15211E" },
  ],
  "purple-pink-neon": [
    { variantId: "purple-pink-neon-v1", bgTop: "#140A20", bgBottom: "#3B0764", accent: "#A855F7", accentStrong: "#FF4FD8", accentAlt: "#FFD9F8", panelBase: "#1A102A" },
    { variantId: "purple-pink-neon-v2", bgTop: "#12071A", bgBottom: "#3B1F5B", accent: "#6C2BFF", accentStrong: "#D946EF", accentAlt: "#F5D0FE", panelBase: "#211238" },
    { variantId: "purple-pink-neon-v3", bgTop: "#050510", bgBottom: "#3B0764", accent: "#C084FC", accentStrong: "#FF73E5", accentAlt: "#FFD9F8", panelBase: "#24143A" },
  ],
  "purple-void": [
    { variantId: "purple-void-v1", bgTop: "#050510", bgBottom: "#3B0764", accent: "#A855F7", accentStrong: "#6C2BFF", accentAlt: "#F5D0FE", panelBase: "#1A102A" },
    { variantId: "purple-void-v2", bgTop: "#12071A", bgBottom: "#1A0B2E", accent: "#D946EF", accentStrong: "#A855F7", accentAlt: "#FFD9F8", panelBase: "#24143A" },
    { variantId: "purple-void-v3", bgTop: "#140A20", bgBottom: "#3B1F5B", accent: "#FF4FD8", accentStrong: "#6C2BFF", accentAlt: "#C084FC", panelBase: "#281626" },
  ],
  "black-violet-cyan": [
    { variantId: "black-violet-cyan-v1", bgTop: "#030303", bgBottom: "#1B0F33", accent: "#A855F7", accentStrong: "#00D9FF", accentAlt: "#DFFFFB", panelBase: "#10141F" },
    { variantId: "black-violet-cyan-v2", bgTop: "#0B0B0F", bgBottom: "#0A4D68", accent: "#00F5D4", accentStrong: "#C084FC", accentAlt: "#F5D0FE", panelBase: "#171D31" },
    { variantId: "black-violet-cyan-v3", bgTop: "#050510", bgBottom: "#1B0F33", accent: "#D946EF", accentStrong: "#00B8FF", accentAlt: "#DFFFFB", panelBase: "#1E1938" },
  ],
  "orange-pink-purple": [
    { variantId: "orange-pink-purple-v1", bgTop: "#160A0A", bgBottom: "#4A1D2F", accent: "#FF6B2C", accentStrong: "#FF4D9D", accentAlt: "#FFE3D2", panelBase: "#1A1212" },
    { variantId: "orange-pink-purple-v2", bgTop: "#160A0A", bgBottom: "#6B1D47", accent: "#FF8A00", accentStrong: "#A43BFF", accentAlt: "#FFD2E8", panelBase: "#2B2020" },
    { variantId: "orange-pink-purple-v3", bgTop: "#1A1212", bgBottom: "#3B1020", accent: "#FF6B2C", accentStrong: "#FF2E63", accentAlt: "#FFE3D2", panelBase: "#2E231A" },
  ],
  "red-magenta-neon": [
    { variantId: "red-magenta-neon-v1", bgTop: "#1A1212", bgBottom: "#4A1D2F", accent: "#FF3B3B", accentStrong: "#FF2E63", accentAlt: "#FFD2E8", panelBase: "#1A1212" },
    { variantId: "red-magenta-neon-v2", bgTop: "#160A0A", bgBottom: "#3B1020", accent: "#FF2E63", accentStrong: "#8F00FF", accentAlt: "#FFD2E8", panelBase: "#241C1C" },
    { variantId: "red-magenta-neon-v3", bgTop: "#0B0B0F", bgBottom: "#3B1020", accent: "#FF4FD8", accentStrong: "#FF3B3B", accentAlt: "#F5D0FE", panelBase: "#22221A" },
  ],
  "gold-orange-luxe": [
    { variantId: "gold-orange-luxe-v1", bgTop: "#0A0A0A", bgBottom: "#5C3A00", accent: "#FFB800", accentStrong: "#FFC93C", accentAlt: "#FFF1C2", panelBase: "#1F1400" },
    { variantId: "gold-orange-luxe-v2", bgTop: "#0B0B0F", bgBottom: "#5C3A00", accent: "#FFC93C", accentStrong: "#FF8C42", accentAlt: "#FFF1C2", panelBase: "#241B08" },
    { variantId: "gold-orange-luxe-v3", bgTop: "#0A0A0A", bgBottom: "#3F2600", accent: "#FF8C42", accentStrong: "#FFB800", accentAlt: "#FFF1C2", panelBase: "#1F1400" },
  ],
  "linkedin-cyber-blue": [
    { bgTop: "#0B0F1A", bgBottom: "#0F1525", accent: "#00E5FF", accentStrong: "#00C8E0", accentAlt: "#7B00FF", panelBase: "#141A2A" },
  ],
  "linkedin-neon-pink": [
    { bgTop: "#0A0A0F", bgBottom: "#101018", accent: "#FF007A", accentStrong: "#FF4D9D", accentAlt: "#FF80B3", panelBase: "#1A1A22" },
  ],
  "linkedin-orange": [
    { bgTop: "#0D0D0D", bgBottom: "#141414", accent: "#FF6A00", accentStrong: "#FFB347", accentAlt: "#FFD080", panelBase: "#1C1C1C" },
  ],
  "acid-lime": [
    { bgTop: "#04100E", bgBottom: "#0A1715", accent: "#25DFC4", accentStrong: "#E4E538", accentAlt: "#00FFFB", panelBase: "#0D1E1B" },
    { bgTop: "#040F0B", bgBottom: "#0C1813", accent: "#00F7D6", accentStrong: "#00D444", accentAlt: "#25DFC4", panelBase: "#0D1914" },
  ],
  "ice-blue": [
    { bgTop: "#07111D", bgBottom: "#0D1E30", accent: "#2AACF8", accentStrong: "#055AFF", accentAlt: "#85C7FF", panelBase: "#102338" },
    { bgTop: "#071522", bgBottom: "#10263A", accent: "#58C8FF", accentStrong: "#2A4AD2", accentAlt: "#90F6FF", panelBase: "#122A3F" },
  ],
  "electric-violet": [
    { bgTop: "#130A1C", bgBottom: "#211133", accent: "#E7167B", accentStrong: "#9324F6", accentAlt: "#FD37CA", panelBase: "#211238" },
    { bgTop: "#150A1D", bgBottom: "#261338", accent: "#B50AAA", accentStrong: "#FD37CA", accentAlt: "#A77CFF", panelBase: "#24143A" },
    { bgTop: "#180A18", bgBottom: "#2B1424", accent: "#FD6B49", accentStrong: "#CE2473", accentAlt: "#8A0EA2", panelBase: "#281626" },
  ],
  "graphite-cyan": [
    { bgTop: "#0C1017", bgBottom: "#161C27", accent: "#00EEDA", accentStrong: "#00FFFB", accentAlt: "#7FE8FF", panelBase: "#19212E" },
    { bgTop: "#101417", bgBottom: "#1A2024", accent: "#63FFD0", accentStrong: "#1FE6AD", accentAlt: "#6FC4FF", panelBase: "#1E252D" },
  ],
  "plasma-amber": [
    { bgTop: "#171314", bgBottom: "#241C1C", accent: "#FC4D0D", accentStrong: "#F05AA4", accentAlt: "#FFB326", panelBase: "#2B2020" },
    { bgTop: "#181311", bgBottom: "#2B2018", accent: "#FFF520", accentStrong: "#FF9C49", accentAlt: "#963D41", panelBase: "#2E231A" },
  ],
  "lunar-violet": [
    { bgTop: "#0E121D", bgBottom: "#171D31", accent: "#8E91FF", accentStrong: "#7FF4FF", accentAlt: "#B7B8FF", panelBase: "#1C2340" },
    { bgTop: "#121022", bgBottom: "#1E1938", accent: "#560EA2", accentStrong: "#C786C7", accentAlt: "#9F69A6", panelBase: "#211D3C" },
  ],
  "magenta-teal": [
    { bgTop: "#071019", bgBottom: "#121B27", accent: "#00CCDA", accentStrong: "#9F00FC", accentAlt: "#00FFFB", panelBase: "#14202D" },
    { bgTop: "#081018", bgBottom: "#151B22", accent: "#0C0FD6", accentStrong: "#FD7290", accentAlt: "#25DFC4", panelBase: "#16202A" },
    { bgTop: "#081018", bgBottom: "#191A22", accent: "#17B1D1", accentStrong: "#D5E2CD", accentAlt: "#E3D3B8", panelBase: "#1C212A" },
  ],
};

const TYPOGRAPHY_LIBRARY = {
  "display-grotesk": {
    cssBodyFont: '"Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
    cssTitleFont: '"Segoe UI Variable Display", "Aptos Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    cssEyebrowFont: '"Bahnschrift", "Aptos", "Segoe UI", sans-serif',
    svgBodyFont: "Segoe UI, Aptos, Helvetica Neue, Arial, sans-serif",
    svgTitleFont: "Segoe UI Variable Display, Aptos Display, Segoe UI, Helvetica Neue, Arial, sans-serif",
    svgEyebrowFont: "Bahnschrift, Aptos, Segoe UI, Arial, sans-serif",
    titleWeight: 800,
    supportWeight: 700,
    eyebrowWeight: 800,
    titleLetterSpacing: "-0.052em",
    titleLetterSpacingSvg: "-3.0",
    eyebrowLetterSpacing: "2px",
    titleScale: 1,
    supportScale: 1,
    titleCharBonus: 0,
    supportCharBonus: 0,
    titleLineHeightMult: 0.94,
    supportLineHeightMult: 1.24,
  },
  "signal-condensed": {
    cssBodyFont: '"Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
    cssTitleFont: '"Bahnschrift Condensed", "Bahnschrift SemiCondensed", "Arial Narrow", "Segoe UI", sans-serif',
    cssEyebrowFont: '"Bahnschrift SemiCondensed", "Aptos Narrow", "Segoe UI", sans-serif',
    svgBodyFont: "Segoe UI, Aptos, Helvetica Neue, Arial, sans-serif",
    svgTitleFont: "Bahnschrift Condensed, Bahnschrift SemiCondensed, Arial Narrow, Segoe UI, Arial, sans-serif",
    svgEyebrowFont: "Bahnschrift SemiCondensed, Aptos Narrow, Segoe UI, Arial, sans-serif",
    titleWeight: 800,
    supportWeight: 700,
    eyebrowWeight: 800,
    titleLetterSpacing: "-0.038em",
    titleLetterSpacingSvg: "-2.1",
    eyebrowLetterSpacing: "2.4px",
    titleScale: 0.95,
    supportScale: 0.98,
    titleCharBonus: 2,
    supportCharBonus: 1,
    titleLineHeightMult: 0.95,
    supportLineHeightMult: 1.22,
  },
  "split-display": {
    cssBodyFont: '"Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
    cssTitleFont: '"Segoe UI Variable Display", "Trebuchet MS", "Aptos Display", "Segoe UI", Arial, sans-serif',
    cssEyebrowFont: '"Bahnschrift", "Aptos", "Segoe UI", sans-serif',
    svgBodyFont: "Segoe UI, Aptos, Helvetica Neue, Arial, sans-serif",
    svgTitleFont: "Segoe UI Variable Display, Trebuchet MS, Aptos Display, Segoe UI, Arial, sans-serif",
    svgEyebrowFont: "Bahnschrift, Aptos, Segoe UI, Arial, sans-serif",
    titleWeight: 800,
    supportWeight: 700,
    eyebrowWeight: 800,
    titleLetterSpacing: "-0.042em",
    titleLetterSpacingSvg: "-2.4",
    eyebrowLetterSpacing: "2px",
    titleScale: 0.98,
    supportScale: 1,
    titleCharBonus: 1,
    supportCharBonus: 0,
    titleLineHeightMult: 0.95,
    supportLineHeightMult: 1.23,
  },
  "editorial-serif-dark": {
    cssBodyFont: '"Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
    cssTitleFont: '"Constantia", "Cambria", Georgia, "Times New Roman", serif',
    cssEyebrowFont: '"Aptos", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    svgBodyFont: "Segoe UI, Aptos, Helvetica Neue, Arial, sans-serif",
    svgTitleFont: "Constantia, Cambria, Georgia, Times New Roman, serif",
    svgEyebrowFont: "Aptos, Segoe UI, Helvetica Neue, Arial, sans-serif",
    titleWeight: 700,
    supportWeight: 700,
    eyebrowWeight: 700,
    titleLetterSpacing: "-0.03em",
    titleLetterSpacingSvg: "-1.5",
    eyebrowLetterSpacing: "1.8px",
    titleScale: 0.95,
    supportScale: 1,
    titleCharBonus: -1,
    supportCharBonus: 0,
    titleLineHeightMult: 0.98,
    supportLineHeightMult: 1.24,
  },
  "mono-signal": {
    cssBodyFont: '"Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
    cssTitleFont: '"Bahnschrift SemiCondensed", "Segoe UI Variable Display", "Aptos Display", "Segoe UI", Arial, sans-serif',
    cssEyebrowFont: '"Cascadia Mono", Consolas, "Courier New", monospace',
    svgBodyFont: "Segoe UI, Aptos, Helvetica Neue, Arial, sans-serif",
    svgTitleFont: "Bahnschrift SemiCondensed, Segoe UI Variable Display, Aptos Display, Segoe UI, Arial, sans-serif",
    svgEyebrowFont: "Cascadia Mono, Consolas, Courier New, monospace",
    titleWeight: 800,
    supportWeight: 700,
    eyebrowWeight: 700,
    titleLetterSpacing: "-0.045em",
    titleLetterSpacingSvg: "-2.4",
    eyebrowLetterSpacing: "1.8px",
    titleScale: 0.97,
    supportScale: 0.98,
    titleCharBonus: 1,
    supportCharBonus: 0,
    titleLineHeightMult: 0.95,
    supportLineHeightMult: 1.22,
  },
  "executive-sans": {
    cssBodyFont: '"Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
    cssTitleFont: '"Segoe UI Variable Display", "Aptos Display", "Trebuchet MS", "Segoe UI", Arial, sans-serif',
    cssEyebrowFont: '"Aptos Narrow", "Bahnschrift SemiCondensed", "Segoe UI", sans-serif',
    svgBodyFont: "Segoe UI, Aptos, Helvetica Neue, Arial, sans-serif",
    svgTitleFont: "Segoe UI Variable Display, Aptos Display, Trebuchet MS, Segoe UI, Arial, sans-serif",
    svgEyebrowFont: "Aptos Narrow, Bahnschrift SemiCondensed, Segoe UI, Arial, sans-serif",
    titleWeight: 800,
    supportWeight: 700,
    eyebrowWeight: 800,
    titleLetterSpacing: "-0.036em",
    titleLetterSpacingSvg: "-2.0",
    eyebrowLetterSpacing: "2.2px",
    titleScale: 0.98,
    supportScale: 1,
    titleCharBonus: 1,
    supportCharBonus: 0,
    titleLineHeightMult: 0.95,
    supportLineHeightMult: 1.24,
  },
  "condensed-impact": {
    cssBodyFont: '"Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
    cssTitleFont: '"Bahnschrift Condensed", "Arial Narrow", "Trebuchet MS", "Segoe UI", sans-serif',
    cssEyebrowFont: '"Bahnschrift SemiCondensed", "Aptos Narrow", "Segoe UI", sans-serif',
    svgBodyFont: "Segoe UI, Aptos, Helvetica Neue, Arial, sans-serif",
    svgTitleFont: "Bahnschrift Condensed, Arial Narrow, Trebuchet MS, Segoe UI, Arial, sans-serif",
    svgEyebrowFont: "Bahnschrift SemiCondensed, Aptos Narrow, Segoe UI, Arial, sans-serif",
    titleWeight: 800,
    supportWeight: 700,
    eyebrowWeight: 800,
    titleLetterSpacing: "-0.03em",
    titleLetterSpacingSvg: "-1.8",
    eyebrowLetterSpacing: "2.6px",
    titleScale: 0.94,
    supportScale: 0.99,
    titleCharBonus: 3,
    supportCharBonus: 1,
    titleLineHeightMult: 0.94,
    supportLineHeightMult: 1.22,
  },
  "luxury-serif": {
    cssBodyFont: '"Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
    cssTitleFont: '"Georgia", "Constantia", "Cambria", "Times New Roman", serif',
    cssEyebrowFont: '"Aptos", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    svgBodyFont: "Segoe UI, Aptos, Helvetica Neue, Arial, sans-serif",
    svgTitleFont: "Georgia, Constantia, Cambria, Times New Roman, serif",
    svgEyebrowFont: "Aptos, Segoe UI, Helvetica Neue, Arial, sans-serif",
    titleWeight: 700,
    supportWeight: 700,
    eyebrowWeight: 700,
    titleLetterSpacing: "-0.024em",
    titleLetterSpacingSvg: "-1.3",
    eyebrowLetterSpacing: "1.8px",
    titleScale: 0.94,
    supportScale: 1,
    titleCharBonus: -1,
    supportCharBonus: 0,
    titleLineHeightMult: 0.98,
    supportLineHeightMult: 1.24,
  },
};

const TYPOGRAPHY_ALIASES = {
  sans_heavy_centered: "display-grotesk",
  sans_compact_left: "signal-condensed",
  sans_heavy_split: "split-display",
  "headline-executive": "executive-sans",
  "headline-condensed-impact": "condensed-impact",
  "headline-luxury-serif": "luxury-serif",
};
const BANNED_TEXT_LEAKAGE = [
  "prompt:",
  "negative prompt",
  "use style",
  "render",
  "cinematic lighting",
  "aspect ratio",
  "4k",
  "seed",
];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, data) {
  writeText(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function readJsonIfExists(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ellipsize(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function compactMetaLabel(value, maxLength = 28) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim().replace(/[.,;:!?]+$/g, "");
  if (!normalized) return "";

  const firstClause = normalized.split(/\s*[|,:;.-]\s*/)[0].trim() || normalized;
  if (firstClause.length <= maxLength) return firstClause;

  const words = firstClause.split(" ").filter(Boolean);
  let compact = "";
  for (const word of words) {
    const next = compact ? `${compact} ${word}` : word;
    if (next.length > maxLength) break;
    compact = next;
  }

  if (compact && compact.length >= Math.max(10, Math.floor(maxLength * 0.55))) {
    return compact;
  }

  return ellipsize(firstClause, maxLength);
}

function hexToRgba(hex, alpha) {
  const normalized = String(hex || "").replace("#", "").trim();
  if (normalized.length !== 6) return `rgba(255,255,255,${alpha})`;
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function parseHexColor(hex) {
  const normalized = String(hex || "").replace("#", "").trim();
  if (!/^[\da-fA-F]{6}$/.test(normalized)) return null;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHex(hexA, hexB, ratio = 0.5) {
  const colorA = parseHexColor(hexA);
  const colorB = parseHexColor(hexB);
  if (!colorA || !colorB) return hexA || hexB || "#0b1018";
  const weight = clamp(ratio, 0, 1);
  return rgbToHex({
    r: colorA.r * (1 - weight) + colorB.r * weight,
    g: colorA.g * (1 - weight) + colorB.g * weight,
    b: colorA.b * (1 - weight) + colorB.b * weight,
  });
}

function darkenHex(hex, ratio = 0.18) {
  const color = parseHexColor(hex);
  if (!color) return hex || "#091018";
  const weight = clamp(ratio, 0, 1);
  return rgbToHex({
    r: color.r * (1 - weight),
    g: color.g * (1 - weight),
    b: color.b * (1 - weight),
  });
}

function enrichPalette(palette) {
  const shellBase = mixHex(palette.bgTop, palette.bgBottom, 0.46);
  const shellLift = mixHex(palette.bgTop, palette.accentAlt || palette.accent, 0.16);
  const shellDeep = darkenHex(palette.bgBottom, 0.26);
  const panelBase = mixHex(palette.panelBase || shellBase, palette.bgBottom, 0.35);
  const frameMesh = mixHex(palette.accent, palette.accentAlt || palette.accentStrong || palette.accent, 0.5);
  const neutralText = "#FFFFFF";
  const neutralSubtitle = "#E5E7EB";
  const neutralSecondary = "#B8C0CC";
  const neutralSubtle = "#94A3B8";
  return {
    ...palette,
    accentSoft: palette.accentSoft || hexToRgba(palette.accent, 0.18),
    glowA: palette.glowA || hexToRgba(palette.accentStrong || palette.accent, 0.22),
    glowB: palette.glowB || hexToRgba(palette.accentAlt || palette.accent, 0.18),
    border: palette.border || hexToRgba(palette.accent, 0.22),
    text: palette.text || neutralText,
    muted: palette.muted || neutralSubtitle,
    secondaryText: palette.secondaryText || neutralSecondary,
    subtle: palette.subtle || neutralSubtle,
    panel: palette.panel || hexToRgba(panelBase, 0.92),
    shell: palette.shell || hexToRgba(shellBase, 0.92),
    shellSoft: palette.shellSoft || hexToRgba(shellLift, 0.78),
    shellDeep: palette.shellDeep || hexToRgba(shellDeep, 0.97),
    frameTintA: palette.frameTintA || hexToRgba(palette.accentStrong || palette.accent, 0.12),
    frameTintB: palette.frameTintB || hexToRgba(palette.accentAlt || palette.accent, 0.1),
    frameMesh: palette.frameMesh || hexToRgba(frameMesh, 0.06),
    gridLine: palette.gridLine || hexToRgba(palette.accentAlt || palette.accent, 0.14),
    frameGlow: palette.frameGlow || hexToRgba(palette.accentStrong || palette.accent, 0.16),
  };
}

function wrapText(text, maxCharsPerLine, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let current = "";

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;

    if (lines.length === maxLines - 1) {
      const remaining = [current, ...words.slice(index + 1)].join(" ");
      lines.push(ellipsize(remaining, maxCharsPerLine));
      return lines;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

function parseCarouselScript(raw) {
  const lines = raw.split(/\r?\n/);
  const tone = extractSectionText(lines, "## Tom recomendado");
  const caption = extractSectionText(lines, "## Legenda");
  const hashtags = extractSectionText(lines, "## Hashtags");
  const slides = [];

  let current = null;
  for (const line of lines) {
    if (/^###\s+Slide\s+\d+/i.test(line.trim())) {
      if (current) slides.push(current);
      current = { title: "", support: "" };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("Titulo:")) {
      current.title = line.replace(/^Titulo:\s*/, "").trim();
      continue;
    }
    if (line.startsWith("Apoio:")) {
      current.support = line.replace(/^Apoio:\s*/, "").trim();
    }
  }
  if (current) slides.push(current);

  if (slides.length < 2) {
    throw new Error("carousel-script.md precisa ter pelo menos 2 slides.");
  }

  return {
    tone: tone || "Analitico direto",
    slides,
    caption,
    hashtags: hashtags
      .split(/\s+/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

function validateScriptPayload(parsed) {
  const failures = [];
  parsed.slides.forEach((slide, index) => {
    const scope = `slide ${index + 1}`;
    const title = String(slide.title || "").trim();
    const support = String(slide.support || "").trim();

    if (!title) failures.push(`${scope}: titulo vazio`);
    if (!support) failures.push(`${scope}: apoio vazio`);
    if (title.length > 92) failures.push(`${scope}: titulo acima do limite seguro`);
    if (support.length > 220) failures.push(`${scope}: apoio acima do limite seguro`);

    const merged = `${title}\n${support}`.toLowerCase();
    for (const banned of BANNED_TEXT_LEAKAGE) {
      if (merged.includes(banned)) {
        failures.push(`${scope}: vazamento de texto tecnico detectado (${banned})`);
      }
    }
  });

  const captionLower = String(parsed.caption || "").toLowerCase();
  if (/^###\s+slide\s+\d+/im.test(parsed.caption) || /(^|\n)(titulo:|apoio:)/i.test(parsed.caption)) {
    failures.push("legenda: parser contaminou a legenda com o conteudo dos slides");
  }
  for (const banned of BANNED_TEXT_LEAKAGE) {
    if (captionLower.includes(banned)) {
      failures.push(`legenda: vazamento de texto tecnico detectado (${banned})`);
    }
  }

  if (failures.length) {
    throw new Error(`Script de carrossel reprovado pelo gate editorial:\n- ${failures.join("\n- ")}`);
  }
}

function extractSectionText(lines, heading) {
  const start = lines.findIndex((line) => line.trim() === heading.trim());
  if (start === -1) return "";
  const collected = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const current = lines[index];
    if (/^##\s+/.test(current.trim())) break;
    if (heading.trim() === "## Hashtags" && /^###\s+Slide\s+\d+/i.test(current.trim())) break;
    collected.push(current);
  }
  return collected.join("\n").trim();
}

function getPalette(index, visualMeta) {
  const templateConfig = TEMPLATE_LIBRARY[visualMeta?.templateId] || TEMPLATE_LIBRARY["cyberpunk-green-core"];
  const presetId = visualMeta?.gradientId || visualMeta?.palettePreset || templateConfig.palettePreset;
  const presetPalettes = presetId && PALETTE_LIBRARY[presetId] ? PALETTE_LIBRARY[presetId] : null;
  const palettes = presetPalettes || templateConfig.palettes || [
    {
      bgTop: "#03110c",
      bgBottom: "#071b16",
      accent: "#68ffb6",
      accentStrong: "#22f090",
      accentSoft: "rgba(104,255,182,0.18)",
      accentAlt: "#c6ff67",
      glowA: "rgba(34,240,144,0.32)",
      glowB: "rgba(104,255,182,0.18)",
      border: "rgba(104,255,182,0.24)",
      text: "#effff7",
      muted: "#b8d8cb",
      panel: "rgba(8, 28, 21, 0.9)",
    },
    {
      bgTop: "#04120f",
      bgBottom: "#081f19",
      accent: "#80ffd8",
      accentStrong: "#34ffd6",
      accentSoft: "rgba(128,255,216,0.18)",
      accentAlt: "#83ff8f",
      glowA: "rgba(52,255,214,0.28)",
      glowB: "rgba(131,255,143,0.18)",
      border: "rgba(128,255,216,0.24)",
      text: "#f1fff9",
      muted: "#c2e2d7",
      panel: "rgba(8, 31, 25, 0.9)",
    },
    {
      bgTop: "#02100e",
      bgBottom: "#071d18",
      accent: "#4ef7d2",
      accentStrong: "#1ee7a6",
      accentSoft: "rgba(78,247,210,0.18)",
      accentAlt: "#deff69",
      glowA: "rgba(30,231,166,0.28)",
      glowB: "rgba(222,255,105,0.16)",
      border: "rgba(78,247,210,0.22)",
      text: "#f1fff9",
      muted: "#c0ddd3",
      panel: "rgba(7, 29, 22, 0.9)",
    },
  ];
  const requestedVariant = visualMeta?.paletteVariantId;
  const variantMatch = requestedVariant
    ? palettes.find((palette) => palette.variantId === requestedVariant)
    : null;
  return enrichPalette(variantMatch || palettes[index % palettes.length]);
}

function getTypographyPreset(visualMeta) {
  const presetId =
    TYPOGRAPHY_ALIASES[visualMeta?.typographyPreset] ||
    TYPOGRAPHY_ALIASES[visualMeta?.typography] ||
    visualMeta?.typographyPreset ||
    visualMeta?.typography ||
    "display-grotesk";
  return TYPOGRAPHY_LIBRARY[presetId] || TYPOGRAPHY_LIBRARY["display-grotesk"];
}

function resolveLayoutPreset(visualMeta, index, total) {
  const templateConfig = TEMPLATE_LIBRARY[visualMeta?.templateId] || TEMPLATE_LIBRARY["cyberpunk-green-core"];
  const layoutFamily = visualMeta?.layoutFamily || templateConfig.layoutFamily || "center-manifesto";
  const composition = visualMeta?.composition || "";
  const isCover = index === 0;
  const isLast = index === total - 1;

  if (layoutFamily === "left-signal-card" || composition === "headline_left_card") {
    return {
      layoutFamily,
      textAlign: "left",
      storyLeft: 88,
      titleWidth: 610,
      supportWidth: 620,
      metaJustify: "flex-start",
      titleChars: isCover ? 14 : 16,
      supportChars: 28,
      titleBase: isCover ? 112 : 98,
      supportBase: 34,
      ornament: "signal-rail",
      supportVariant: "card",
    };
  }

  if (layoutFamily === "split-panel" || composition === "headline_with_mockup" || composition === "headline_split_panel") {
    return {
      layoutFamily,
      textAlign: "left",
      storyLeft: 88,
      titleWidth: 548,
      supportWidth: 536,
      metaJustify: "flex-start",
      titleChars: isCover ? 14 : 16,
      supportChars: 25,
      titleBase: isCover ? 106 : 94,
      supportBase: 33,
      ornament: "mockup-panel",
      supportVariant: "card",
    };
  }

  if (layoutFamily === "timeline-stack" || composition === "headline_timeline") {
    return {
      layoutFamily,
      textAlign: "left",
      storyLeft: 110,
      titleWidth: 620,
      supportWidth: 610,
      metaJustify: "flex-start",
      titleChars: isCover ? 14 : 16,
      supportChars: 27,
      titleBase: isCover ? 108 : 96,
      supportBase: 33,
      ornament: "timeline",
      supportVariant: "timeline",
    };
  }

  if (layoutFamily === "checklist-grid" || composition === "headline_checklist_grid") {
    return {
      layoutFamily,
      textAlign: "left",
      storyLeft: 100,
      titleWidth: 640,
      supportWidth: 660,
      metaJustify: "flex-start",
      titleChars: isCover ? 15 : 17,
      supportChars: 26,
      titleBase: isCover ? 108 : 94,
      supportBase: 32,
      ornament: "checklist-grid",
      supportVariant: "checklist",
    };
  }

  if (layoutFamily === "linkedin-editorial" || composition === "headline_linkedin_hud") {
    return {
      layoutFamily,
      textAlign: "center",
      storyLeft: 120,
      titleWidth: 836,
      supportWidth: 796,
      metaJustify: "center",
      titleChars: isCover ? 14 : 16,
      supportChars: 30,
      titleBase: isCover ? 124 : 108,
      supportBase: 34,
      ornament: "linkedin-hud",
      supportVariant: "card",
    };
  }

  if (layoutFamily === "bottom-proof-panel" || composition === "headline_bottom_panel" || composition === "headline_center_card") {
    return {
      layoutFamily,
      textAlign: "center",
      storyLeft: 120,
      titleWidth: 800,
      supportWidth: 860,
      metaJustify: "center",
      titleChars: isCover ? 15 : 17,
      supportChars: 31,
      titleBase: isCover ? 122 : 106,
      supportBase: 35,
      ornament: "bottom-panel",
      supportVariant: "card",
    };
  }

  return {
    layoutFamily,
    textAlign: "center",
    storyLeft: 120,
    titleWidth: 820,
    supportWidth: 780,
    metaJustify: "center",
    titleChars: isCover ? 15 : 17,
    supportChars: 29,
    titleBase: isCover ? 124 : 110,
    supportBase: 36,
    ornament: "manifesto",
    supportVariant: "card",
  };
}

function computeLayout(slide, index, total, visualMeta) {
  const isCover = index === 0;
  const isLast = index === total - 1;
  const preset = resolveLayoutPreset(visualMeta, index, total);
  const typography = getTypographyPreset(visualMeta);
  const titleChars = Math.max(10, preset.titleChars + (typography.titleCharBonus || 0));
  const supportChars = Math.max(18, preset.supportChars + (typography.supportCharBonus || 0));
  const titleLines = wrapText(slide.title, titleChars, isCover ? 4 : 3);
  const supportLines = wrapText(slide.support, supportChars, 5);

  let titleFontSize = preset.titleBase;
  titleFontSize -= Math.max(0, titleLines.length - 2) * 12;
  titleFontSize -= Math.max(0, slide.title.length - 42) * 0.45;
  titleFontSize *= typography.titleScale || 1;
  titleFontSize = clamp(titleFontSize, isCover ? 72 : 68, isCover ? 126 : 112);
  titleFontSize = Math.round(titleFontSize);

  let supportFontSize = preset.supportBase;
  supportFontSize -= Math.max(0, supportLines.length - 3) * 2.5;
  supportFontSize -= Math.max(0, slide.support.length - 110) * 0.06;
  supportFontSize *= typography.supportScale || 1;
  supportFontSize = clamp(supportFontSize, 26, 36);
  supportFontSize = Math.round(supportFontSize);

  const titleLineHeight = Math.round(titleFontSize * (typography.titleLineHeightMult || 0.94));
  const supportLineHeight = Math.round(supportFontSize * (typography.supportLineHeightMult || 1.24));
  const titleBlockHeight = titleLines.length * titleLineHeight;
  const supportBlockHeight = supportLines.length * supportLineHeight + (preset.supportVariant === "checklist" ? 84 : 64);
  const contentHeight = titleBlockHeight + 34 + 14 + 42 + supportBlockHeight + 54;
  const contentTop = clamp(Math.round((HEIGHT - contentHeight) / 2), 230, 430);

  return {
    isCover,
    isLast,
    preset,
    titleLines,
    supportLines,
    titleFontSize,
    supportFontSize,
    titleLineHeight,
    supportLineHeight,
    supportBlockHeight,
    contentTop,
    typography,
    contentWidth: preset.titleWidth,
    supportWidth: preset.supportWidth,
    storyLeft: preset.storyLeft,
    textAlign: preset.textAlign,
    titleAnchor: preset.textAlign === "left" ? "start" : "middle",
    metaJustify: preset.metaJustify,
    ornament: preset.ornament,
    eyebrow: isCover ? "AI SHIFT" : isLast ? "NEXT MOVE" : `SIGNAL ${String(index).padStart(2, "0")}`,
    kicker: isCover
      ? "workflow real"
      : isLast
        ? "salve para revisar"
        : String(slide.title || "").split(/\s+/).slice(0, 2).join(" ").toLowerCase(),
  };
}

function buildSupportHtml(layout) {
  if (layout.preset.supportVariant === "timeline") {
    return `
      <div class="support-box support-box-timeline">
        <div class="support-rail"></div>
        ${layout.supportLines
          .map(
            (line, lineIndex) => `
              <div class="support-row">
                <span class="support-index">${String(lineIndex + 1).padStart(2, "0")}</span>
                <span>${escapeHtml(line)}</span>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  if (layout.preset.supportVariant === "checklist") {
    return `
      <div class="support-box support-box-checklist">
        ${layout.supportLines
          .map(
            (line) => `
              <div class="support-row">
                <span class="support-check"></span>
                <span>${escapeHtml(line)}</span>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  return `
    <div class="support-box">
      <div class="support">
        ${layout.supportLines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
      </div>
    </div>
  `;
}

function buildOrnamentHtml(layout) {
  switch (layout.ornament) {
    case "signal-rail":
      return `
        <div class="ornament ornament-signal">
          <div class="signal-line"></div>
          <div class="signal-chip">signal</div>
          <div class="signal-card">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      `;
    case "mockup-panel":
      return `
        <div class="ornament ornament-mockup">
          <div class="mockup-glow"></div>
          <div class="mockup-chip">system</div>
          <div class="mockup-panel mockup-panel-float">
            <div class="mockup-toolbar">
              <span></span><span></span><span></span>
            </div>
            <div class="mockup-card micro"></div>
          </div>
          <div class="mockup-panel mockup-panel-main">
            <div class="mockup-pill"></div>
            <div class="mockup-chart"></div>
            <div class="mockup-line"></div>
            <div class="mockup-line short"></div>
          </div>
        </div>
      `;
    case "timeline":
      return `
        <div class="ornament ornament-timeline">
          <div class="timeline-line">
            <span></span><span></span><span></span><span></span>
          </div>
          <div class="timeline-chip">track</div>
        </div>
      `;
    case "checklist-grid":
      return `
        <div class="ornament ornament-checklist">
          <div class="check-grid">
            ${Array.from({ length: 9 }, () => "<span></span>").join("")}
          </div>
        </div>
      `;
    case "bottom-panel":
      return `
        <div class="ornament ornament-proof">
          <div class="proof-band"></div>
          <div class="proof-blip one"></div>
          <div class="proof-blip two"></div>
        </div>
      `;
    case "linkedin-hud":
      return `
        <div class="ornament ornament-linkedin-hud">
          <div class="hud-orb hud-orb-a"></div>
          <div class="hud-orb hud-orb-b"></div>
          <div class="hud-corner"></div>
        </div>
      `;
    default:
      return `
        <div class="ornament ornament-manifesto">
          <div class="orb orb-a"></div>
          <div class="orb orb-b"></div>
          <div class="corner-glow"></div>
        </div>
      `;
  }
}

function buildSlideHtml({ deckTitle, slide, index, total, visualMeta }) {
  const palette = getPalette(index, visualMeta);
  const layout = computeLayout(slide, index, total, visualMeta);
  const templateConfig = TEMPLATE_LIBRARY[visualMeta?.templateId] || TEMPLATE_LIBRARY["cyberpunk-green-core"];
  const typography = layout.typography;
  const footerMode = templateConfig.footerMode === "instagram carousel" ? "Prompthub" : templateConfig.footerMode || "Prompthub";
  const titleHtml = layout.titleLines.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
  const supportHtml = buildSupportHtml(layout);
  const ornamentHtml = buildOrnamentHtml(layout);
  const storyOffsetLeft = layout.textAlign === "left" ? Math.max(0, layout.storyLeft - 70) : 0;
  const storyReservedRight =
    layout.ornament === "mockup-panel" ? 188 : layout.ornament === "checklist-grid" ? 120 : 0;
  const gridSize =
    layout.ornament === "linkedin-hud"
      ? 42
      : layout.ornament === "checklist-grid"
        ? 34
        : layout.ornament === "timeline"
          ? 36
          : layout.ornament === "mockup-panel"
            ? 46
            : 40;
  const gridOpacity =
    layout.ornament === "linkedin-hud"
      ? 0.32
      : layout.ornament === "bottom-panel"
        ? 0.28
        : layout.ornament === "manifesto"
          ? 0.36
          : 0.42;
  const noiseOpacity =
    layout.ornament === "linkedin-hud"
      ? 0.18
      : layout.ornament === "mockup-panel"
        ? 0.26
        : layout.ornament === "timeline"
          ? 0.18
          : 0.22;
  const bodyHalo =
    layout.ornament === "linkedin-hud"
      ? `radial-gradient(circle at 20% 74%, ${palette.frameTintA}, transparent 24%),`
      : layout.ornament === "mockup-panel"
      ? `radial-gradient(circle at 78% 38%, ${palette.frameTintA}, transparent 24%),`
      : layout.ornament === "bottom-panel"
        ? `radial-gradient(circle at 50% 82%, ${palette.frameTintA}, transparent 28%),`
        : layout.ornament === "timeline"
          ? `radial-gradient(circle at 18% 52%, ${palette.frameTintA}, transparent 24%),`
          : `radial-gradient(circle at 70% 74%, ${palette.frameTintA}, transparent 24%),`;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(deckTitle)} — Slide ${index + 1}</title>
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        margin: 0;
        padding: 0;
        overflow: hidden;
      }
      body {
        position: relative;
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
        background:
          radial-gradient(circle at 18% 16%, ${palette.glowA}, transparent 22%),
          radial-gradient(circle at 82% 18%, ${palette.glowB}, transparent 24%),
          ${bodyHalo}
          radial-gradient(circle at 76% 82%, ${palette.frameTintB}, transparent 26%),
          linear-gradient(180deg, ${palette.bgTop} 0%, ${palette.bgBottom} 100%);
        color: ${palette.text};
        font-family: ${typography.cssBodyFont};
      }
      .grid,
      .noise {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .grid {
        background-image:
          linear-gradient(${palette.gridLine} 1px, transparent 1px),
          linear-gradient(90deg, ${palette.gridLine} 1px, transparent 1px);
        background-size: ${gridSize}px ${gridSize}px;
        opacity: ${gridOpacity};
      }
      .noise {
        background:
          radial-gradient(circle at 32% 30%, rgba(255,255,255,0.04), transparent 30%),
          radial-gradient(circle at 72% 70%, rgba(255,255,255,0.03), transparent 26%);
        mix-blend-mode: screen;
        opacity: ${noiseOpacity};
      }
      .frame {
        position: absolute;
        inset: 34px;
        overflow: hidden;
        border-radius: 34px;
        border: 1px solid ${palette.border};
        background:
          radial-gradient(circle at 14% 18%, ${palette.frameTintA}, transparent 30%),
          radial-gradient(circle at 88% 74%, ${palette.frameTintB}, transparent 28%),
          linear-gradient(138deg, transparent 0%, ${palette.frameMesh} 52%, transparent 100%),
          linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.012)),
          linear-gradient(180deg, ${palette.shell} 0%, ${palette.shellDeep} 100%);
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.03) inset,
          0 28px 90px rgba(0,0,0,0.34),
          0 0 56px ${palette.frameGlow};
      }
      .frame::before {
        content: "";
        position: absolute;
        inset: 18px;
        border-radius: 26px;
        border: 1px solid rgba(255,255,255,0.06);
      }
      .ornament {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .ornament-manifesto .orb,
      .ornament-linkedin-hud .hud-orb,
      .corner-glow,
      .hud-corner,
      .signal-line,
      .signal-card,
      .signal-chip,
      .mockup-glow,
      .mockup-chip,
      .mockup-panel,
      .timeline-line,
      .timeline-chip,
      .check-grid,
      .proof-band,
      .proof-blip {
        position: absolute;
      }
      .ornament-manifesto .orb {
        width: 240px;
        height: 240px;
        border-radius: 50%;
        filter: blur(22px);
        opacity: 0.22;
      }
      .ornament-manifesto .orb-a {
        top: 96px;
        right: 96px;
        background: ${palette.glowA};
      }
      .ornament-manifesto .orb-b {
        bottom: 118px;
        left: 96px;
        background: ${palette.glowB};
      }
      .ornament-linkedin-hud .hud-orb {
        width: 208px;
        height: 208px;
        border-radius: 50%;
        filter: blur(22px);
        opacity: 0.22;
      }
      .ornament-linkedin-hud .hud-orb-a {
        top: 98px;
        right: 104px;
        background: ${palette.glowA};
      }
      .ornament-linkedin-hud .hud-orb-b {
        bottom: 112px;
        left: 92px;
        background: ${palette.glowB};
      }
      .hud-corner {
        top: 102px;
        right: 96px;
        width: 204px;
        height: 204px;
        border-radius: 34px;
        border: 1px solid ${palette.border};
        background: linear-gradient(180deg, rgba(255,255,255,0.05), transparent);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
      }
      .corner-glow {
        top: 96px;
        right: 92px;
        width: 218px;
        height: 218px;
        border-radius: 34px;
        border: 1px solid ${palette.border};
        background: linear-gradient(180deg, rgba(255,255,255,0.05), transparent);
      }
      .signal-line {
        left: 86px;
        top: 170px;
        bottom: 134px;
        width: 3px;
        border-radius: 999px;
        background: linear-gradient(180deg, ${palette.accentStrong}, transparent 88%);
        box-shadow: 0 0 18px ${palette.accentSoft};
      }
      .signal-chip,
      .timeline-chip {
        right: 82px;
        top: 110px;
        padding: 10px 16px;
        border-radius: 999px;
        border: 1px solid ${palette.border};
        background: rgba(255,255,255,0.04);
        color: ${palette.accentAlt};
        font-size: 14px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 1.6px;
      }
      .signal-card {
        right: 82px;
        top: 188px;
        width: 220px;
        height: 188px;
        border-radius: 28px;
        border: 1px solid ${palette.border};
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
        padding: 22px;
        display: grid;
        gap: 18px;
      }
      .signal-card span,
      .mockup-pill,
      .mockup-line,
      .mockup-card,
      .mockup-chart {
        display: block;
        border-radius: 999px;
        background: rgba(255,255,255,0.1);
      }
      .signal-card span:nth-child(1) {
        height: 12px;
        width: 68%;
      }
      .signal-card span:nth-child(2) {
        height: 12px;
        width: 92%;
      }
      .signal-card span:nth-child(3) {
        height: 52px;
        width: 100%;
        border-radius: 18px;
        background: linear-gradient(135deg, ${palette.accentSoft}, rgba(255,255,255,0.04));
      }
      .mockup-glow {
        top: 222px;
        right: 94px;
        width: 252px;
        height: 252px;
        border-radius: 50%;
        background:
          radial-gradient(circle, ${palette.glowB} 0%, ${palette.glowA} 38%, transparent 74%);
        filter: blur(18px);
        opacity: 0.84;
      }
      .mockup-chip {
        top: 122px;
        right: 86px;
        padding: 10px 16px;
        border-radius: 999px;
        border: 1px solid ${palette.border};
        background: rgba(255,255,255,0.05);
        color: ${palette.accentAlt};
        font-family: ${typography.cssEyebrowFont};
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 1.6px;
        text-transform: uppercase;
      }
      .mockup-panel {
        border-radius: 28px;
        border: 1px solid ${palette.border};
        background:
          linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015)),
          linear-gradient(145deg, ${palette.shellSoft}, rgba(255,255,255,0.01));
        box-shadow:
          inset 0 0 0 1px rgba(255,255,255,0.03),
          0 16px 44px rgba(0,0,0,0.18);
      }
      .mockup-panel-main {
        top: 244px;
        right: 82px;
        width: 226px;
        height: 332px;
        padding: 22px;
      }
      .mockup-panel-float {
        top: 156px;
        right: 154px;
        width: 154px;
        height: 124px;
        padding: 18px;
      }
      .mockup-toolbar {
        display: flex;
        gap: 8px;
      }
      .mockup-toolbar span {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: rgba(255,255,255,0.28);
      }
      .mockup-chart {
        margin-top: 18px;
        height: 146px;
        border-radius: 24px;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01)),
          linear-gradient(135deg, ${palette.accentSoft}, ${palette.frameTintB});
      }
      .mockup-pill {
        width: 108px;
        height: 14px;
        background: linear-gradient(90deg, ${palette.accentStrong}, ${palette.accentAlt});
      }
      .mockup-line {
        margin-top: 16px;
        height: 10px;
      }
      .mockup-line.short {
        width: 68%;
      }
      .mockup-card {
        margin-top: 18px;
        height: 56px;
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(255,255,255,0.08), ${palette.accentSoft});
      }
      .mockup-card.micro {
        margin-top: 22px;
        height: 54px;
      }
      .timeline-line {
        left: 92px;
        top: 188px;
        bottom: 156px;
        width: 4px;
        border-radius: 999px;
        background: linear-gradient(180deg, ${palette.accentStrong}, rgba(255,255,255,0.04));
        box-shadow: 0 0 18px ${palette.accentSoft};
      }
      .timeline-line span {
        position: absolute;
        left: -6px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: ${palette.accentAlt};
        box-shadow: 0 0 16px ${palette.accentSoft};
      }
      .timeline-line span:nth-child(1) { top: 4%; }
      .timeline-line span:nth-child(2) { top: 32%; }
      .timeline-line span:nth-child(3) { top: 60%; }
      .timeline-line span:nth-child(4) { top: 88%; }
      .check-grid {
        right: 76px;
        top: 216px;
        width: 192px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }
      .check-grid span {
        height: 54px;
        border-radius: 18px;
        border: 1px solid ${palette.border};
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
      }
      .proof-band {
        left: 76px;
        right: 76px;
        bottom: 144px;
        height: 152px;
        border-radius: 34px;
        border: 1px solid ${palette.border};
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
      }
      .proof-blip {
        bottom: 198px;
        width: 120px;
        height: 36px;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
      }
      .proof-blip.one {
        right: 126px;
      }
      .proof-blip.two {
        right: 262px;
      }
      .topline {
        position: absolute;
        top: 52px;
        left: 58px;
        right: 58px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        z-index: 2;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        padding: 12px 18px;
        border-radius: 999px;
        border: 1px solid ${palette.border};
        background: ${palette.shellSoft};
        color: ${palette.text};
        font-family: ${typography.cssEyebrowFont};
        font-size: 15px;
        font-weight: ${typography.eyebrowWeight};
        letter-spacing: ${typography.eyebrowLetterSpacing};
        text-transform: uppercase;
      }
      .eyebrow::before {
        content: "";
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: ${palette.accentStrong};
        box-shadow: 0 0 18px ${palette.accentStrong};
      }
      .counter {
        color: ${palette.muted};
        font-family: ${typography.cssEyebrowFont};
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 2px;
      }
      .story-shell {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: flex-start;
        padding: ${layout.contentTop}px 70px 150px;
      }
      .story {
        width: ${layout.contentWidth}px;
        max-width: 100%;
        display: grid;
        gap: 24px;
        justify-items: ${layout.textAlign === "left" ? "start" : "center"};
        text-align: ${layout.textAlign};
        margin: ${layout.textAlign === "left" ? `0 ${storyReservedRight}px 0 ${storyOffsetLeft}px` : "0 auto"};
      }
      .title {
        display: grid;
        gap: 6px;
        font-family: ${typography.cssTitleFont};
        font-size: ${layout.titleFontSize}px;
        line-height: ${layout.titleLineHeight}px;
        letter-spacing: ${typography.titleLetterSpacing};
        font-weight: ${typography.titleWeight};
        text-wrap: balance;
        text-shadow: 0 12px 28px rgba(3, 7, 13, 0.34);
      }
      .title span {
        display: block;
      }
      .underline {
        width: 164px;
        height: 8px;
        border-radius: 999px;
        background: linear-gradient(90deg, ${palette.accentStrong}, ${palette.accentAlt});
        box-shadow: 0 0 28px ${palette.accentSoft};
      }
      .support-box {
        width: ${layout.supportWidth}px;
        max-width: 100%;
        min-height: ${layout.supportBlockHeight}px;
        padding: 28px 34px;
        border-radius: 30px;
        border: 1px solid ${palette.border};
        background:
          radial-gradient(circle at 18% 18%, ${palette.frameTintA}, transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,0.032), rgba(255,255,255,0.01)),
          ${palette.panel};
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.02) inset,
          0 16px 34px rgba(0,0,0,0.22),
          0 0 24px rgba(0,0,0,0.08);
        display: grid;
        gap: 6px;
        place-items: ${layout.textAlign === "left" ? "start" : "center"};
      }
      .support {
        display: grid;
        gap: 4px;
        font-family: ${typography.cssBodyFont};
        font-size: ${layout.supportFontSize}px;
        line-height: ${layout.supportLineHeight}px;
        color: ${palette.text};
        font-weight: ${typography.supportWeight};
        text-align: ${layout.textAlign};
        text-wrap: balance;
        text-shadow: 0 6px 18px rgba(2, 5, 10, 0.26);
      }
      .support span {
        display: block;
      }
      .support-box-timeline,
      .support-box-checklist {
        position: relative;
        gap: 12px;
        align-content: center;
      }
      .support-rail {
        position: absolute;
        left: 30px;
        top: 24px;
        bottom: 24px;
        width: 2px;
        border-radius: 999px;
        background: linear-gradient(180deg, ${palette.accentStrong}, rgba(255,255,255,0.03));
      }
      .support-row {
        width: 100%;
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: start;
        gap: 14px;
        color: ${palette.text};
        font-family: ${typography.cssBodyFont};
        font-size: ${layout.supportFontSize}px;
        line-height: ${layout.supportLineHeight}px;
        font-weight: ${typography.supportWeight};
      }
      .support-index {
        position: relative;
        top: 2px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: ${typography.cssEyebrowFont};
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1px solid ${palette.border};
        background: rgba(255,255,255,0.05);
        color: ${palette.accentAlt};
        font-size: 14px;
        letter-spacing: 1px;
      }
      .support-check {
        position: relative;
        top: 8px;
        width: 18px;
        height: 18px;
        border-radius: 6px;
        border: 1px solid ${palette.border};
        background: ${palette.accentSoft};
        box-shadow: 0 0 0 1px rgba(255,255,255,0.02) inset;
      }
      .support-check::after {
        content: "";
        position: absolute;
        left: 5px;
        top: 2px;
        width: 5px;
        height: 9px;
        border-right: 2px solid ${palette.accentStrong};
        border-bottom: 2px solid ${palette.accentStrong};
        transform: rotate(40deg);
      }
      .footer {
        position: absolute;
        left: 58px;
        right: 58px;
        bottom: 48px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: ${palette.muted};
        font-family: ${typography.cssEyebrowFont};
        font-size: 18px;
        letter-spacing: 1.4px;
        text-transform: uppercase;
      }
      .footer strong {
        color: ${palette.text};
      }
      .footer .mode {
        color: ${palette.accentAlt};
      }
    </style>
  </head>
  <body>
    <div class="grid"></div>
    <div class="noise"></div>
    <div class="frame">
      ${ornamentHtml}
      <div class="topline">
        <div class="eyebrow">${escapeHtml(layout.eyebrow)}</div>
        <div class="counter">${String(index + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}</div>
      </div>
      <div class="story-shell">
        <div class="story">
          <div class="title">${titleHtml}</div>
          <div class="underline"></div>
          ${supportHtml}
        </div>
      </div>
      <div class="footer">
        <span><strong>${escapeHtml(deckTitle)}</strong></span>
        <span class="mode">${escapeHtml(footerMode)}</span>
      </div>
    </div>
  </body>
</html>`;
}

function buildAssetsManifestMarkdown(parsed, deckTitle, imageFiles, renderMode, layoutAudit, visualMeta) {
  const lines = [
    "## Sistema visual",
    `- template base: ${visualMeta?.templateId || "cyberpunk-green-core"}`,
    `- familia de layout: ${visualMeta?.layoutFamily || "center-manifesto"}`,
    `- weekday family: ${visualMeta?.weekdayFamily || "n/a"}`,
    `- gradient: ${visualMeta?.gradientId || visualMeta?.palettePreset || "acid-lime"}`,
    `- variante: ${visualMeta?.paletteVariantId || "auto"}`,
    `- tipografia: ${visualMeta?.typographyPreset || visualMeta?.typography || "display-grotesk"}`,
    "- variacao de paleta, hierarquia e bloco de apoio conforme o roteiro",
    "",
    "## Arquivos",
  ];

  imageFiles.forEach((imageFile, index) => {
    lines.push(`${index + 1}. ${path.basename(imageFile)} — ${parsed.slides[index].title}`);
  });

  lines.push(
    "",
    "## Observacoes",
    `- tom: ${parsed.tone}`,
    `- tamanho: ${WIDTH}x${HEIGHT}`,
    `- render: ${renderMode}`,
    `- template: ${visualMeta?.templateId || "cyberpunk-green-core"}`,
    `- gradient: ${visualMeta?.gradientId || visualMeta?.palettePreset || "acid-lime"}`,
    `- layout score medio: ${layoutAudit.averageScore}`,
    "- legenda pronta em caption.txt",
    ""
  );

  return lines.join("\n");
}

function buildSupportSvg(layout, palette, supportBoxX, supportBoxY, supportAnchorX, supportTextY) {
  const typography = layout.typography;
  const lineY = (lineIndex) => supportTextY + lineIndex * layout.supportLineHeight;

  if (layout.preset.supportVariant === "timeline") {
    return `
      <rect x="${supportBoxX}" y="${supportBoxY}" width="${layout.supportWidth}" height="${layout.supportBlockHeight}" rx="30" fill="${palette.panel}" stroke="${palette.border}" />
      <rect x="${supportBoxX + 30}" y="${supportBoxY + 26}" width="2" height="${layout.supportBlockHeight - 52}" rx="1" fill="${palette.accentStrong}" />
      ${layout.supportLines
        .map(
          (line, lineIndex) => `
            <circle cx="${supportBoxX + 31}" cy="${lineY(lineIndex) - 8}" r="8" fill="${palette.accentAlt}" />
            <text x="${supportBoxX + 68}" y="${lineY(lineIndex)}" text-anchor="start" font-size="${layout.supportFontSize}" font-weight="${typography.supportWeight}" fill="${palette.text}" font-family="${typography.svgBodyFont}">${escapeHtml(line)}</text>
          `
        )
        .join("\n")}
    `;
  }

  if (layout.preset.supportVariant === "checklist") {
    return `
      <rect x="${supportBoxX}" y="${supportBoxY}" width="${layout.supportWidth}" height="${layout.supportBlockHeight}" rx="30" fill="${palette.panel}" stroke="${palette.border}" />
      ${layout.supportLines
        .map(
          (line, lineIndex) => `
            <rect x="${supportBoxX + 28}" y="${lineY(lineIndex) - 24}" width="20" height="20" rx="6" fill="${palette.accentSoft}" stroke="${palette.border}" />
            <path d="M ${supportBoxX + 34} ${lineY(lineIndex) - 13} L ${supportBoxX + 38} ${lineY(lineIndex) - 8} L ${supportBoxX + 45} ${lineY(lineIndex) - 18}" fill="none" stroke="${palette.accentStrong}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            <text x="${supportBoxX + 62}" y="${lineY(lineIndex)}" text-anchor="start" font-size="${layout.supportFontSize}" font-weight="${typography.supportWeight}" fill="${palette.text}" font-family="${typography.svgBodyFont}">${escapeHtml(line)}</text>
          `
        )
        .join("\n")}
    `;
  }

  return `
    <rect x="${supportBoxX}" y="${supportBoxY}" width="${layout.supportWidth}" height="${layout.supportBlockHeight}" rx="30" fill="${palette.panel}" stroke="${palette.border}" />
    ${layout.supportLines
      .map(
        (line, lineIndex) =>
          `<text x="${supportAnchorX}" y="${lineY(lineIndex)}" text-anchor="${layout.titleAnchor}" font-size="${layout.supportFontSize}" font-weight="${typography.supportWeight}" fill="${palette.text}" font-family="${typography.svgBodyFont}">${escapeHtml(line)}</text>`
      )
      .join("\n")}
  `;
}

function buildOrnamentSvg(layout, palette) {
  switch (layout.ornament) {
    case "signal-rail":
      return `
        <rect x="86" y="172" width="3" height="${HEIGHT - 306}" rx="1.5" fill="${palette.accentStrong}" fill-opacity="0.9" />
        <rect x="${WIDTH - 292}" y="188" width="210" height="184" rx="28" fill="rgba(255,255,255,0.04)" stroke="${palette.border}" />
        <rect x="${WIDTH - 262}" y="220" width="96" height="10" rx="5" fill="rgba(255,255,255,0.12)" />
        <rect x="${WIDTH - 262}" y="246" width="152" height="10" rx="5" fill="rgba(255,255,255,0.08)" />
        <rect x="${WIDTH - 262}" y="276" width="180" height="48" rx="18" fill="${palette.accentSoft}" />
      `;
    case "mockup-panel":
      return `
        <circle cx="${WIDTH - 186}" cy="344" r="126" fill="${palette.accentAlt}" fill-opacity="0.12" filter="url(#blur-${index})" />
        <rect x="${WIDTH - 292}" y="156" width="154" height="124" rx="28" fill="rgba(255,255,255,0.05)" stroke="${palette.border}" />
        <circle cx="${WIDTH - 258}" cy="186" r="5" fill="rgba(255,255,255,0.3)" />
        <circle cx="${WIDTH - 242}" cy="186" r="5" fill="rgba(255,255,255,0.2)" />
        <circle cx="${WIDTH - 226}" cy="186" r="5" fill="rgba(255,255,255,0.14)" />
        <rect x="${WIDTH - 264}" y="214" width="92" height="48" rx="18" fill="${palette.accentSoft}" />
        <rect x="${WIDTH - 364}" y="244" width="226" height="332" rx="30" fill="rgba(255,255,255,0.04)" stroke="${palette.border}" />
        <rect x="${WIDTH - 332}" y="274" width="108" height="14" rx="7" fill="${palette.accentStrong}" />
        <rect x="${WIDTH - 332}" y="312" width="162" height="148" rx="24" fill="${palette.accentSoft}" />
        <rect x="${WIDTH - 332}" y="486" width="170" height="10" rx="5" fill="rgba(255,255,255,0.1)" />
        <rect x="${WIDTH - 332}" y="510" width="118" height="10" rx="5" fill="rgba(255,255,255,0.08)" />
      `;
    case "timeline":
      return `
        <rect x="92" y="188" width="4" height="${HEIGHT - 344}" rx="2" fill="${palette.accentStrong}" />
        <circle cx="94" cy="226" r="8" fill="${palette.accentAlt}" />
        <circle cx="94" cy="488" r="8" fill="${palette.accentAlt}" />
        <circle cx="94" cy="760" r="8" fill="${palette.accentAlt}" />
        <circle cx="94" cy="1032" r="8" fill="${palette.accentAlt}" />
      `;
    case "checklist-grid":
      return Array.from({ length: 9 }, (_, itemIndex) => {
        const col = itemIndex % 3;
        const row = Math.floor(itemIndex / 3);
        const x = WIDTH - 302 + col * 64;
        const y = 220 + row * 66;
        return `<rect x="${x}" y="${y}" width="52" height="52" rx="18" fill="rgba(255,255,255,0.04)" stroke="${palette.border}" />`;
      }).join("\n");
    case "bottom-panel":
      return `
        <rect x="76" y="${HEIGHT - 298}" width="${WIDTH - 152}" height="152" rx="34" fill="rgba(255,255,255,0.04)" stroke="${palette.border}" />
        <rect x="${WIDTH - 246}" y="${HEIGHT - 252}" width="110" height="36" rx="18" fill="rgba(255,255,255,0.06)" />
        <rect x="${WIDTH - 366}" y="${HEIGHT - 252}" width="100" height="36" rx="18" fill="rgba(255,255,255,0.05)" />
      `;
    case "linkedin-hud":
      return `
        <circle cx="${WIDTH - 196}" cy="206" r="118" fill="${palette.accentStrong}" fill-opacity="0.12" />
        <circle cx="194" cy="${HEIGHT - 214}" r="126" fill="${palette.accentAlt}" fill-opacity="0.08" />
        <rect x="${WIDTH - 304}" y="106" width="204" height="204" rx="34" fill="rgba(255,255,255,0.03)" stroke="${palette.border}" />
      `;
    default:
      return `
        <circle cx="${WIDTH - 194}" cy="208" r="118" fill="${palette.accentStrong}" fill-opacity="0.12" />
        <circle cx="192" cy="${HEIGHT - 216}" r="124" fill="${palette.accentAlt}" fill-opacity="0.08" />
        <rect x="${WIDTH - 304}" y="106" width="196" height="196" rx="34" fill="rgba(255,255,255,0.03)" stroke="${palette.border}" />
      `;
  }
}

function buildSlideSvg({ deckTitle, slide, index, total, visualMeta }) {
  const palette = getPalette(index, visualMeta);
  const layout = computeLayout(slide, index, total, visualMeta);
  const templateConfig = TEMPLATE_LIBRARY[visualMeta?.templateId] || TEMPLATE_LIBRARY["cyberpunk-green-core"];
  const typography = layout.typography;
  const footerMode = templateConfig.footerMode === "instagram carousel" ? "PROMPTHUB" : String(templateConfig.footerMode || "PROMPTHUB").toUpperCase();
  const centerX = WIDTH / 2;
  const titleX = layout.textAlign === "left" ? layout.storyLeft : centerX;
  const titleStartY = layout.contentTop + layout.titleFontSize;
  const dividerY = layout.contentTop + layout.titleLines.length * layout.titleLineHeight + 26;
  const supportBoxY = dividerY + 38;
  const supportTextY = supportBoxY + (layout.preset.supportVariant === "card" ? 42 : 56);
  const supportBoxX = layout.textAlign === "left" ? layout.storyLeft : centerX - layout.supportWidth / 2;
  const supportAnchorX =
    layout.textAlign === "left" ? supportBoxX + 36 : centerX;
  return `
  <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-${index}" x1="0.08" y1="0" x2="0.92" y2="1">
        <stop offset="0%" stop-color="${palette.bgTop}" />
        <stop offset="100%" stop-color="${palette.bgBottom}" />
      </linearGradient>
      <filter id="blur-${index}"><feGaussianBlur stdDeviation="38"/></filter>
    </defs>

    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg-${index})" />
    <circle cx="176" cy="172" r="176" fill="${palette.accentStrong}" fill-opacity="0.20" filter="url(#blur-${index})" />
    <circle cx="902" cy="158" r="144" fill="${palette.accentAlt}" fill-opacity="0.12" filter="url(#blur-${index})" />
    <circle cx="896" cy="1112" r="176" fill="${palette.accent}" fill-opacity="0.10" filter="url(#blur-${index})" />
    <circle cx="212" cy="978" r="138" fill="${palette.frameTintA}" filter="url(#blur-${index})" />

    <rect x="34" y="34" width="${WIDTH - 68}" height="${HEIGHT - 68}" rx="34" fill="${palette.shell}" stroke="${palette.border}" />
    <rect x="52" y="52" width="${WIDTH - 104}" height="${HEIGHT - 104}" rx="26" fill="none" stroke="rgba(255,255,255,0.06)" />
    <circle cx="202" cy="208" r="134" fill="${palette.frameTintA}" fill-opacity="0.9" filter="url(#blur-${index})" />
    <circle cx="886" cy="968" r="124" fill="${palette.frameTintB}" fill-opacity="0.8" filter="url(#blur-${index})" />
    ${buildOrnamentSvg(layout, palette)}

    <rect x="58" y="58" width="190" height="40" rx="20" fill="${palette.shellSoft}" stroke="${palette.border}" />
    <circle cx="80" cy="78" r="5.5" fill="${palette.accentStrong}" />
    <text x="95" y="84" font-size="15" font-weight="${typography.eyebrowWeight}" letter-spacing="2" fill="${palette.text}" font-family="${typography.svgEyebrowFont}">${escapeHtml(layout.eyebrow)}</text>
    <text x="${WIDTH - 58}" y="84" text-anchor="end" font-size="18" font-weight="700" letter-spacing="2" fill="${palette.muted}" font-family="${typography.svgEyebrowFont}">${String(index + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}</text>

    ${layout.titleLines
      .map(
        (line, lineIndex) =>
          `<text x="${titleX}" y="${titleStartY + lineIndex * layout.titleLineHeight}" text-anchor="${layout.titleAnchor}" font-size="${layout.titleFontSize}" font-weight="${typography.titleWeight}" letter-spacing="${typography.titleLetterSpacingSvg}" fill="${palette.text}" font-family="${typography.svgTitleFont}">${escapeHtml(line)}</text>`
      )
      .join("\n")}

    <rect x="${layout.textAlign === "left" ? titleX : centerX - 82}" y="${dividerY}" width="164" height="8" rx="4" fill="${palette.accentStrong}" />

    ${buildSupportSvg(layout, palette, supportBoxX, supportBoxY, supportAnchorX, supportTextY)}
    <text x="58" y="${HEIGHT - 50}" font-size="18" font-weight="700" letter-spacing="1.4" fill="${palette.text}" font-family="${typography.svgEyebrowFont}">${escapeHtml(deckTitle.toUpperCase())}</text>
    <text x="${WIDTH - 58}" y="${HEIGHT - 50}" text-anchor="end" font-size="18" font-weight="700" letter-spacing="1.4" fill="${palette.accentAlt}" font-family="${typography.svgEyebrowFont}">${escapeHtml(footerMode)}</text>
  </svg>`;
}

function renderSlideHtmlFiles(outputDir, parsed, deckTitle, visualMeta) {
  const htmlDir = path.join(outputDir, "html");
  ensureDir(htmlDir);

  return parsed.slides.map((slide, index) => {
    const htmlPath = path.join(htmlDir, `slide-${String(index + 1).padStart(2, "0")}.html`);
    const html = buildSlideHtml({
      deckTitle,
      slide,
      index,
      total: parsed.slides.length,
      visualMeta,
    });
    writeText(htmlPath, html);
    return htmlPath;
  });
}

function readVisualMeta(args, sourcePath) {
  const explicit = args["post-json"] ? path.resolve(args["post-json"]) : null;
  const adjacent = path.join(path.dirname(sourcePath), "post.json");
  const postJsonPath = explicit || (fs.existsSync(adjacent) ? adjacent : null);
  const post = readJsonIfExists(postJsonPath, {});
  const visualDirection = post?.visualDirection || {};
  const templateId = visualDirection.templateId || post?.templateId || "cyberpunk-green-core";
  const templateConfig = TEMPLATE_LIBRARY[templateId] || TEMPLATE_LIBRARY["cyberpunk-green-core"];
  const typographyPreset =
    visualDirection.typographyPreset ||
    post?.typographyPreset ||
    TYPOGRAPHY_ALIASES[visualDirection.typography] ||
    visualDirection.typography ||
    "display-grotesk";
  const gradientId = visualDirection.gradientId || post?.gradientId || null;
  return {
    templateId,
    typographyPreset,
    typography: TYPOGRAPHY_ALIASES[typographyPreset] || typographyPreset,
    gradientId,
    palettePreset: gradientId || visualDirection.palettePreset || post?.palettePreset || templateConfig.palettePreset || null,
    paletteVariantId: visualDirection.paletteVariantId || post?.paletteVariantId || null,
    weekdayFamily: visualDirection.weekdayFamily || post?.weekdayFamily || null,
    metaTheme: post?.pillar || post?.theme || "tecnologias de IA",
    metaTone: post?.selectedHook?.type || post?.postType || "editorial system",
    composition: visualDirection.composition || post?.composition || "headline_center",
    layoutFamily:
      visualDirection.layoutFamily ||
      post?.layoutFamily ||
      post?.layoutSpec?.layoutFamily ||
      templateConfig.layoutFamily ||
      "center-manifesto",
    textAlignment:
      post?.promptBundle?.text_overlay_spec?.headlineAlignment ||
      post?.layoutSpec?.headlinePosition ||
      (templateConfig.layoutFamily === "center-manifesto" || templateConfig.layoutFamily === "bottom-proof-panel"
        ? "center"
        : "left"),
  };
}

function auditLayout(parsed, visualMeta) {
  const perSlide = parsed.slides.map((slide, index) => {
    const layout = computeLayout(slide, index, parsed.slides.length, visualMeta);
    let score = 100;
    const issues = [];

    if (layout.titleLines.length > 3 && index !== 0) {
      score -= 8;
      issues.push("headline longa");
    }
    if (layout.supportLines.length > 4) {
      score -= 10;
      issues.push("apoio denso");
    }
    if (layout.titleFontSize < 80) {
      score -= 6;
      issues.push("headline reduzida");
    }
    if (layout.supportFontSize < 28) {
      score -= 8;
      issues.push("apoio pequeno");
    }

    return {
      slide: index + 1,
      score: Math.max(0, score),
      issues,
      titleLines: layout.titleLines.length,
      supportLines: layout.supportLines.length,
    };
  });

  const averageScore = Math.round(perSlide.reduce((sum, item) => sum + item.score, 0) / perSlide.length);
  return { averageScore, perSlide };
}

function findChromeBinary() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const commonCandidates = process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      ]
    : [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ];

  const installedBrowser = commonCandidates.find((candidate) => fs.existsSync(candidate));
  if (installedBrowser) {
    return installedBrowser;
  }

  const cacheRoot = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
  if (!fs.existsSync(cacheRoot)) {
    throw new Error("Chrome headless nao encontrado. Rode `npx puppeteer browsers install chrome`.");
  }

  const candidates = fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folderName = process.platform === "win32" ? "chrome-win64" : "chrome-linux64";
      const binaryName = process.platform === "win32" ? "chrome.exe" : "chrome";
      return path.join(cacheRoot, entry.name, folderName, binaryName);
    })
    .filter((candidate) => fs.existsSync(candidate))
    .sort();

  const latest = candidates.at(-1);
  if (!latest) {
    throw new Error("Chrome headless nao encontrado. Rode `npx puppeteer browsers install chrome`.");
  }
  return latest;
}

async function renderSlides(outputDir, parsed, deckTitle, visualMeta) {
  const imageDir = path.join(outputDir, "assets");
  ensureDir(imageDir);
  const htmlFiles = renderSlideHtmlFiles(outputDir, parsed, deckTitle, visualMeta);
  let renderMode = "html-css";
  let browser = null;

  try {
    const chromePath = findChromeBinary();
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      defaultViewport: {
        width: WIDTH,
        height: HEIGHT,
        deviceScaleFactor: 1,
      },
      args: [
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--hide-scrollbars",
        "--allow-file-access-from-files",
      ],
    });
    const page = await browser.newPage();

    for (let index = 0; index < parsed.slides.length; index += 1) {
      const pngPath = path.join(imageDir, `slide-${String(index + 1).padStart(2, "0")}.png`);
      const jpgPath = path.join(imageDir, `slide-${String(index + 1).padStart(2, "0")}.jpg`);
      await page.goto(`file://${htmlFiles[index].replace(/\\/g, "/")}`, {
        waitUntil: "load",
        timeout: 45000,
      });
      await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
      await page.screenshot({
        path: pngPath,
        clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
        type: "png",
      });
      await sharp(pngPath).jpeg({ quality: 92 }).toFile(jpgPath);
      fs.unlinkSync(pngPath);
    }
  } catch (error) {
    renderMode = "svg-fallback";
    console.warn(
      `⚠️ Chrome headless indisponivel (${error.message}). Usando fallback vetorial com a mesma direcao visual.`
    );
    for (let index = 0; index < parsed.slides.length; index += 1) {
      const jpgPath = path.join(imageDir, `slide-${String(index + 1).padStart(2, "0")}.jpg`);
      const svg = buildSlideSvg({
        deckTitle,
        slide: parsed.slides[index],
        index,
        total: parsed.slides.length,
        visualMeta,
      });
      await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(jpgPath);
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return {
    renderMode,
    htmlFiles,
    imageFiles: parsed.slides.map((_, index) => path.join(imageDir, `slide-${String(index + 1).padStart(2, "0")}.jpg`)),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const sourceFile = args["source-file"];
  if (!sourceFile) {
    throw new Error("--source-file is required");
  }

  const sourcePath = path.resolve(sourceFile);
  const outputDir = path.resolve(
    args["output-dir"] || path.join("squads", "instagram-hot-news-carousel", "output")
  );
  const raw = fs.readFileSync(sourcePath, "utf8");
  const parsed = parseCarouselScript(raw);
  validateScriptPayload(parsed);
  const deckTitle = args.title || "Noticias quentes de IA";
  const visualMeta = readVisualMeta(args, sourcePath);
  const captionText = [parsed.caption, parsed.hashtags.join(" ")].filter(Boolean).join("\n\n").trim();

  ensureDir(outputDir);
  const rendered = await renderSlides(outputDir, parsed, deckTitle, visualMeta);
  const layoutAudit = auditLayout(parsed, visualMeta);

  const manifest = {
    title: deckTitle,
    tone: parsed.tone,
    caption: captionText,
    renderMode: rendered.renderMode,
    weekdayFamily: visualMeta.weekdayFamily || null,
    gradientId: visualMeta.gradientId || visualMeta.palettePreset || null,
    paletteVariantId: visualMeta.paletteVariantId || null,
    typographyPreset: visualMeta.typographyPreset || visualMeta.typography || null,
    visualMeta,
    layoutAudit,
    images: rendered.imageFiles,
    slides: parsed.slides.map((slide, index) => ({
      number: index + 1,
      title: slide.title,
      support: slide.support,
      html: rendered.htmlFiles[index],
      image: rendered.imageFiles[index],
    })),
  };

  writeJson(path.join(outputDir, "assets-manifest.json"), manifest);
  writeText(
    path.join(outputDir, "assets-manifest.md"),
    buildAssetsManifestMarkdown(parsed, deckTitle, rendered.imageFiles, rendered.renderMode, layoutAudit, visualMeta)
  );
  writeText(path.join(outputDir, "caption.txt"), `${captionText}\n`);

  console.log("✅ Instagram carousel generated");
  console.log(`   manifest: ${path.join(outputDir, "assets-manifest.json")}`);
  console.log(`   caption: ${path.join(outputDir, "caption.txt")}`);
  console.log(`   render_mode: ${rendered.renderMode}`);
  console.log(`   layout_score: ${layoutAudit.averageScore}`);
  rendered.imageFiles.forEach((imagePath, index) => {
    console.log(`   [${index + 1}] ${imagePath}`);
  });
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
