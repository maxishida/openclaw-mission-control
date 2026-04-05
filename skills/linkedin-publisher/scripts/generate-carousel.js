#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { parseArgs } from './shared.js';

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1350;

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ellipsize(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function wrapText(value, maxChars, maxLines) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const words = normalized.split(' ');
  const lines = [];
  let current = '';

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
      continue;
    }

    lines.push(current);
    current = word;

    if (lines.length === maxLines - 1) {
      const remaining = [current, ...words.slice(index + 1)].join(' ');
      lines.push(ellipsize(remaining, maxChars));
      return lines;
    }
  }

  if (current) lines.push(current);

  if (lines.length > maxLines) {
    return [...lines.slice(0, maxLines - 1), ellipsize(lines.slice(maxLines - 1).join(' '), maxChars)];
  }

  return lines;
}

function parseCarouselMarkdown(raw) {
  const lines = raw.split('\n');
  const title = lines.find((line) => line.startsWith('# '))?.replace(/^# /, '').trim() || 'LinkedIn Carousel';
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = {
        heading: line.replace(/^## /, '').trim(),
        body: [],
      };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) sections.push(current);

  const slides = sections
    .filter((section) => /^slide\b/i.test(section.heading))
    .map((section, index) => {
      const cleaned = section.body.map((line) => line.trim()).filter(Boolean);
      const headline = cleaned[0] || `Slide ${index + 1}`;
      const bullets = cleaned
        .slice(1)
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean);
      return {
        number: index + 1,
        headline,
        bullets,
      };
    });

  const captionSection = sections.find((section) => /^caption$/i.test(section.heading));
  const hashtagsSection = sections.find((section) => /^hashtags$/i.test(section.heading));
  const caption = captionSection ? captionSection.body.join('\n').trim() : '';
  const hashtags = hashtagsSection ? hashtagsSection.body.join('\n').trim() : '';

  if (slides.length < 2) {
    throw new Error('Carousel source must contain at least two "## Slide" sections');
  }

  return {
    title,
    slides,
    commentary: [caption, hashtags].filter(Boolean).join('\n\n').trim(),
  };
}

const THEMES = [
  {
    id: 'green-core',
    label: 'Green Core',
    bgTop: '#03110c',
    bgBottom: '#071b16',
    panel: '#091f18',
    accent: '#6bffb5',
    accentStrong: '#25f58f',
    accentSoft: 'rgba(107,255,181,0.18)',
    accentAlt: '#b8ff63',
    glowA: 'rgba(37,245,143,0.34)',
    glowB: 'rgba(107,255,181,0.22)',
    text: '#eefef6',
    textSoft: '#b8d7ca',
    border: 'rgba(107,255,181,0.26)',
  },
  {
    id: 'mint-grid',
    label: 'Mint Grid',
    bgTop: '#04110f',
    bgBottom: '#0a201b',
    panel: '#0b231d',
    accent: '#7affd8',
    accentStrong: '#31ffd7',
    accentSoft: 'rgba(122,255,216,0.18)',
    accentAlt: '#86ff87',
    glowA: 'rgba(49,255,215,0.3)',
    glowB: 'rgba(134,255,135,0.2)',
    text: '#effff9',
    textSoft: '#c0e4d6',
    border: 'rgba(122,255,216,0.24)',
  },
  {
    id: 'aqua-lime',
    label: 'Aqua Lime',
    bgTop: '#02100f',
    bgBottom: '#071f1b',
    panel: '#0a221d',
    accent: '#4cf7d2',
    accentStrong: '#1fe6a5',
    accentSoft: 'rgba(76,247,210,0.18)',
    accentAlt: '#d1ff64',
    glowA: 'rgba(31,230,165,0.3)',
    glowB: 'rgba(209,255,100,0.18)',
    text: '#f1fff9',
    textSoft: '#c6e4db',
    border: 'rgba(76,247,210,0.24)',
  },
  {
    id: 'signal-green',
    label: 'Signal Green',
    bgTop: '#04100c',
    bgBottom: '#0b1d16',
    panel: '#0c2219',
    accent: '#8df65b',
    accentStrong: '#46f36a',
    accentSoft: 'rgba(141,246,91,0.18)',
    accentAlt: '#4df7d7',
    glowA: 'rgba(70,243,106,0.28)',
    glowB: 'rgba(77,247,215,0.18)',
    text: '#f3fff7',
    textSoft: '#cde2d5',
    border: 'rgba(141,246,91,0.24)',
  },
  {
    id: 'cyber-blue',
    label: 'Cyber Blue',
    bgTop: '#0B0F1A',
    bgBottom: '#0f1525',
    panel: '#141A2A',
    accent: '#00E5FF',
    accentStrong: '#00c8e0',
    accentSoft: 'rgba(0,229,255,0.18)',
    accentAlt: '#7B00FF',
    glowA: 'rgba(0,229,255,0.3)',
    glowB: 'rgba(123,0,255,0.22)',
    text: '#EAF6FF',
    textSoft: '#a0c4e8',
    border: 'rgba(0,229,255,0.26)',
  },
  {
    id: 'neon-pink',
    label: 'Neon Pink',
    bgTop: '#0A0A0F',
    bgBottom: '#101018',
    panel: '#1A1A22',
    accent: '#FF007A',
    accentStrong: '#FF4D9D',
    accentSoft: 'rgba(255,0,122,0.18)',
    accentAlt: '#ff80b3',
    glowA: 'rgba(255,0,122,0.3)',
    glowB: 'rgba(255,77,157,0.22)',
    text: '#FFE6F2',
    textSoft: '#e8a0c8',
    border: 'rgba(255,0,122,0.26)',
  },
  {
    id: 'orange',
    label: 'Orange',
    bgTop: '#0D0D0D',
    bgBottom: '#141414',
    panel: '#1C1C1C',
    accent: '#FF6A00',
    accentStrong: '#FFB347',
    accentSoft: 'rgba(255,106,0,0.18)',
    accentAlt: '#ffd080',
    glowA: 'rgba(255,106,0,0.3)',
    glowB: 'rgba(255,179,71,0.22)',
    text: '#FFF4E6',
    textSoft: '#e8c8a0',
    border: 'rgba(255,106,0,0.26)',
  },
];

function normalizeThemeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveThemeSelection(args) {
  if (args['theme-name']) {
    const requested = normalizeThemeId(args['theme-name']);
    const selected = THEMES.find((theme) => theme.id === requested || normalizeThemeId(theme.label) === requested);
    if (!selected) {
      throw new Error(
        `Unknown theme "${args['theme-name']}". Available themes: ${THEMES.map((theme) => theme.id).join(', ')}`
      );
    }
    return selected;
  }

  if (args['theme-index'] !== undefined) {
    const themeIndex = Number(args['theme-index']);
    if (!Number.isInteger(themeIndex) || themeIndex < 0 || themeIndex >= THEMES.length) {
      throw new Error(`--theme-index must be an integer between 0 and ${THEMES.length - 1}`);
    }
    return THEMES[themeIndex];
  }

  return null;
}

function getTheme(index, selectedTheme = null) {
  if (selectedTheme) return selectedTheme;
  return THEMES[index % THEMES.length];
}

function computeHeadlineLayout(headline, isCover) {
  const lineCap = isCover ? 4 : 3;
  const charCandidates = isCover ? [14, 16, 18, 20] : [16, 18, 20, 22];
  let lines = wrapText(headline, charCandidates[0], lineCap);
  for (const candidate of charCandidates) {
    const attempt = wrapText(headline, candidate, lineCap);
    lines = attempt;
    if (attempt.length <= (isCover ? 3 : 2)) break;
  }

  const base = isCover ? 132 : 114;
  const fontSize = clamp(
    base - (lines.length - 1) * (isCover ? 14 : 12) - Math.max(0, headline.length - 46) * 0.35,
    isCover ? 78 : 72,
    base
  );

  return {
    lines,
    fontSize,
    lineHeight: Math.round(fontSize * 0.94),
  };
}

function computeBulletLayouts(bullets) {
  const items = (bullets.length ? bullets : ['Ponto de apoio para fechar o raciocínio com clareza.'])
    .slice(0, 3)
    .map((bullet) => {
      const lines = wrapText(bullet, 32, 2);
      const fontSize = clamp(34 - Math.max(0, lines.join(' ').length - 58) * 0.12, 26, 34);
      const lineHeight = Math.round(fontSize * 1.18);
      const height = Math.max(108, lines.length * lineHeight + 48);
      return { text: bullet, lines, fontSize, lineHeight, height };
    });
  return items;
}

function computeSlideLayout(slide, index, total) {
  const isCover = index === 0;
  const isLast = index === total - 1;
  const headline = computeHeadlineLayout(slide.headline, isCover);
  const bulletLayouts = computeBulletLayouts(slide.bullets);
  const bulletGap = 22;
  const bulletsHeight =
    bulletLayouts.reduce((sum, bullet) => sum + bullet.height, 0) +
    Math.max(0, bulletLayouts.length - 1) * bulletGap;
  const contentHeight = headline.lines.length * headline.lineHeight + 54 + bulletsHeight;
  const contentTop = clamp(Math.round((DEFAULT_HEIGHT - contentHeight) / 2), 250, 430);

  return {
    isCover,
    isLast,
    headline,
    bulletLayouts,
    bulletGap,
    contentTop,
    contentWidth: 836,
    bulletWidth: 796,
    eyebrow: isCover ? 'AI SHIFT' : isLast ? 'WHAT TO DO' : 'TREND SIGNAL',
    kicker: isCover
      ? 'produtos, equipe e distribuicao'
      : isLast
        ? 'operador, produto e growth'
        : 'now',
  };
}

function buildSlideHtml(documentTitle, slide, index, total, selectedTheme = null) {
  const theme = getTheme(index, selectedTheme);
  const layout = computeSlideLayout(slide, index, total);
  const headlineMarkup = layout.headline.lines
    .map((line) => `<span>${escapeHtml(line)}</span>`)
    .join('');
  const bulletsMarkup = layout.bulletLayouts
    .map(
      (bullet, bulletIndex) => `
        <article class="bullet-card" style="height:${bullet.height}px">
          <div class="bullet-knot">${String(bulletIndex + 1).padStart(2, '0')}</div>
          <div class="bullet-copy" style="font-size:${bullet.fontSize}px; line-height:${bullet.lineHeight}px">
            ${bullet.lines.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}
          </div>
        </article>
      `
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(documentTitle)} — Slide ${index + 1}</title>
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: ${DEFAULT_WIDTH}px;
        height: ${DEFAULT_HEIGHT}px;
        margin: 0;
        padding: 0;
        overflow: hidden;
      }
      body {
        position: relative;
        background:
          radial-gradient(circle at 18% 18%, ${theme.glowA}, transparent 24%),
          radial-gradient(circle at 80% 14%, ${theme.glowB}, transparent 24%),
          linear-gradient(180deg, ${theme.bgTop} 0%, ${theme.bgBottom} 100%);
        color: ${theme.text};
        font-family: "Aptos", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      }
      .grid,
      .noise,
      .glow {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .grid {
        background-image:
          linear-gradient(${theme.border} 1px, transparent 1px),
          linear-gradient(90deg, ${theme.accentSoft} 1px, transparent 1px);
        background-size: 42px 42px;
        opacity: 0.45;
      }
      .noise {
        background:
          radial-gradient(circle at 30% 30%, rgba(255,255,255,0.06), transparent 30%),
          radial-gradient(circle at 70% 72%, rgba(255,255,255,0.03), transparent 28%);
        mix-blend-mode: screen;
        opacity: 0.28;
      }
      .shell {
        position: absolute;
        inset: 34px;
        overflow: hidden;
        border-radius: 34px;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.012)),
          linear-gradient(180deg, ${theme.panel}, ${theme.bgBottom});
        border: 1px solid ${theme.border};
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.03) inset,
          0 28px 90px rgba(0,0,0,0.42),
          0 0 60px ${theme.glowA};
      }
      .shell::before {
        content: "";
        position: absolute;
        inset: 18px;
        border-radius: 26px;
        border: 1px solid rgba(255,255,255,0.06);
      }
      .hud {
        position: absolute;
        top: 52px;
        left: 58px;
        right: 58px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        z-index: 2;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        padding: 12px 18px;
        border-radius: 999px;
        border: 1px solid ${theme.border};
        background: ${theme.panel};
        color: ${theme.textSoft};
        text-transform: uppercase;
        letter-spacing: 2px;
        font-size: 15px;
        font-weight: 700;
      }
      .badge::before {
        content: "";
        width: 11px;
        height: 11px;
        border-radius: 999px;
        background: ${theme.accentStrong};
        box-shadow: 0 0 18px ${theme.accentStrong};
      }
      .counter {
        color: ${theme.textSoft};
        font-size: 18px;
        letter-spacing: 2px;
        text-transform: uppercase;
      }
      .content {
        position: absolute;
        top: ${layout.contentTop}px;
        left: 50%;
        width: ${layout.contentWidth}px;
        transform: translateX(-50%);
        display: grid;
        gap: 26px;
        justify-items: center;
        text-align: center;
        z-index: 2;
      }
      .headline {
        margin: 0;
        display: grid;
        gap: 6px;
        justify-items: center;
        font-size: ${layout.headline.fontSize}px;
        line-height: ${layout.headline.lineHeight}px;
        letter-spacing: -0.06em;
        text-wrap: balance;
      }
      .headline span {
        display: block;
        max-width: 100%;
      }
      .divider {
        width: 146px;
        height: 4px;
        border-radius: 999px;
        background: linear-gradient(90deg, transparent 0%, ${theme.accentStrong} 50%, transparent 100%);
        box-shadow: 0 0 28px ${theme.accentSoft};
      }
      .bullets {
        width: ${layout.bulletWidth}px;
        display: grid;
        gap: ${layout.bulletGap}px;
      }
      .bullet-card {
        position: relative;
        display: grid;
        place-items: center;
        padding: 24px 34px 22px;
        border-radius: 28px;
        border: 1px solid ${theme.border};
        background:
          linear-gradient(180deg, ${theme.panel}, ${theme.bgBottom});
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.02) inset,
          0 14px 30px rgba(0,0,0,0.24);
      }
      .bullet-knot {
        position: absolute;
        top: -14px;
        left: 50%;
        transform: translateX(-50%);
        min-width: 78px;
        padding: 6px 14px;
        border-radius: 999px;
        background: ${theme.bgTop};
        border: 1px solid ${theme.border};
        color: ${theme.accent};
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 2px;
      }
      .bullet-copy {
        display: grid;
        gap: 4px;
        justify-items: center;
        text-align: center;
        color: ${theme.text};
        font-weight: 700;
      }
      .bullet-copy span {
        display: block;
      }
      .footer {
        position: absolute;
        left: 58px;
        right: 58px;
        bottom: 50px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: ${theme.textSoft};
        font-size: 18px;
        letter-spacing: 1.6px;
        text-transform: uppercase;
        z-index: 2;
      }
      .footer strong {
        color: ${theme.text};
        font-weight: 800;
      }
      .footer .mode {
        color: ${theme.accentAlt};
      }
    </style>
  </head>
  <body>
    <div class="grid"></div>
    <div class="noise"></div>
    <div class="shell">
      <div class="hud">
        <div class="badge">${escapeHtml(layout.eyebrow)}</div>
        <div class="counter">${String(slide.number).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div>
      </div>
      <main class="content">
        <h1 class="headline">${headlineMarkup}</h1>
        <div class="divider"></div>
        <section class="bullets">${bulletsMarkup}</section>
      </main>
      <footer class="footer">
        <span><strong>${escapeHtml(documentTitle)}</strong></span>
        <span class="mode">${escapeHtml(layout.kicker)}</span>
      </footer>
    </div>
  </body>
</html>`;
}

function buildDeckHtml(documentTitle, slides, selectedTheme = null) {
  const slideMarkup = slides
    .map((slide, index) => {
      const html = buildSlideHtml(documentTitle, slide, index, slides.length, selectedTheme);
      const body = html.match(/<body>([\s\S]*)<\/body>/i)?.[1] || '';
      return `<section class="slide-shell">${body}</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(documentTitle)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 44px;
        background: #020c08;
        font-family: "Aptos", "Segoe UI", Arial, sans-serif;
      }
      .stack {
        display: grid;
        gap: 30px;
        justify-content: center;
      }
      .slide-shell {
        width: ${DEFAULT_WIDTH}px;
        height: ${DEFAULT_HEIGHT}px;
        overflow: hidden;
        border-radius: 34px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.32);
      }
    </style>
  </head>
  <body>
    <main class="stack">
      ${slideMarkup}
    </main>
  </body>
</html>`;
}

function buildSlideSvg(documentTitle, slide, index, total, width, height, selectedTheme = null) {
  const theme = getTheme(index, selectedTheme);
  const layout = computeSlideLayout(slide, index, total);
  const centerX = width / 2;
  const contentWidth = layout.bulletWidth;
  const contentX = centerX - contentWidth / 2;
  const headlineStartY = layout.contentTop + layout.headline.lineHeight;

  const headlineText = layout.headline.lines
    .map(
      (line, lineIndex) => `
        <text x="${centerX}" y="${headlineStartY + lineIndex * layout.headline.lineHeight}" text-anchor="middle" font-size="${layout.headline.fontSize}" font-weight="800" letter-spacing="-3.5" fill="${theme.text}" font-family="Arial, Helvetica, sans-serif">${escapeHtml(line)}</text>
      `
    )
    .join('\n');

  const dividerY = layout.contentTop + layout.headline.lines.length * layout.headline.lineHeight + 26;
  let cursorY = dividerY + 34;
  const bulletBlocks = layout.bulletLayouts
    .map((bullet, bulletIndex) => {
      const blockY = cursorY;
      const knotY = blockY - 14;
      const textStartY = blockY + 42;
      const linesMarkup = bullet.lines
        .map(
          (line, lineIndex) => `
            <text x="${centerX}" y="${textStartY + lineIndex * bullet.lineHeight}" text-anchor="middle" font-size="${bullet.fontSize}" font-weight="700" fill="${theme.text}" font-family="Arial, Helvetica, sans-serif">${escapeHtml(line)}</text>
          `
        )
        .join('\n');

      cursorY += bullet.height + layout.bulletGap;
      return `
        <rect x="${contentX}" y="${blockY}" width="${contentWidth}" height="${bullet.height}" rx="28" fill="${theme.panel}" stroke="${theme.border}" />
        <rect x="${centerX - 40}" y="${knotY}" width="80" height="28" rx="14" fill="${theme.bgTop}" stroke="${theme.border}" />
        <text x="${centerX}" y="${knotY + 19}" text-anchor="middle" font-size="13" font-weight="800" letter-spacing="2" fill="${theme.accent}" font-family="Arial, Helvetica, sans-serif">${String(bulletIndex + 1).padStart(2, '0')}</text>
        ${linesMarkup}
      `;
    })
    .join('\n');

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-${index}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${theme.bgTop}" />
        <stop offset="100%" stop-color="${theme.bgBottom}" />
      </linearGradient>
      <linearGradient id="panel-${index}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.03)" />
        <stop offset="100%" stop-color="rgba(255,255,255,0.012)" />
      </linearGradient>
      <filter id="blur-${index}"><feGaussianBlur stdDeviation="38"/></filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg-${index})" />
    <circle cx="176" cy="182" r="176" fill="${theme.accentStrong}" fill-opacity="0.22" filter="url(#blur-${index})" />
    <circle cx="900" cy="150" r="144" fill="${theme.accentAlt}" fill-opacity="0.14" filter="url(#blur-${index})" />
    <circle cx="930" cy="1120" r="164" fill="${theme.accent}" fill-opacity="0.12" filter="url(#blur-${index})" />

    <rect x="34" y="34" width="${width - 68}" height="${height - 68}" rx="34" fill="${theme.panel}" stroke="${theme.border}" />
    <rect x="52" y="52" width="${width - 104}" height="${height - 104}" rx="26" fill="none" stroke="rgba(255,255,255,0.06)" />

    <rect x="58" y="58" width="194" height="40" rx="20" fill="${theme.panel}" stroke="${theme.border}" />
    <circle cx="82" cy="78" r="5.5" fill="${theme.accentStrong}" />
    <text x="98" y="84" font-size="15" font-weight="700" letter-spacing="2" fill="${theme.textSoft}" font-family="Arial, Helvetica, sans-serif">${escapeHtml(layout.eyebrow)}</text>
    <text x="${width - 58}" y="84" text-anchor="end" font-size="18" letter-spacing="2" fill="${theme.textSoft}" font-family="Arial, Helvetica, sans-serif">${String(slide.number).padStart(2, '0')} / ${String(total).padStart(2, '0')}</text>

    ${headlineText}
    <rect x="${centerX - 73}" y="${dividerY}" width="146" height="4" rx="2" fill="${theme.accentStrong}" />
    ${bulletBlocks}

    <text x="58" y="${height - 52}" font-size="18" letter-spacing="1.6" fill="${theme.text}" font-family="Arial, Helvetica, sans-serif">${escapeHtml(documentTitle.toUpperCase())}</text>
    <text x="${width - 58}" y="${height - 52}" text-anchor="end" font-size="18" letter-spacing="1.6" fill="${theme.accentAlt}" font-family="Arial, Helvetica, sans-serif">${escapeHtml(layout.kicker.toUpperCase())}</text>
  </svg>`;
}

function writeSlideHtmlFiles(documentTitle, slides, outputDir, selectedTheme = null) {
  const htmlDir = join(outputDir, 'html');
  mkdirSync(htmlDir, { recursive: true });
  const slidePaths = slides.map((slide, index) => {
    const slidePath = join(htmlDir, `slide-${String(index + 1).padStart(2, '0')}.html`);
    writeFileSync(slidePath, buildSlideHtml(documentTitle, slide, index, slides.length, selectedTheme), 'utf8');
    return slidePath;
  });

  const deckPath = join(outputDir, 'carousel.html');
  writeFileSync(deckPath, buildDeckHtml(documentTitle, slides, selectedTheme), 'utf8');
  return { deckPath, slidePaths };
}

async function renderSlidesWithPuppeteer(slideHtmlPaths, outputDir, width, height) {
  try {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const imagePaths = [];
      for (let index = 0; index < slideHtmlPaths.length; index += 1) {
        const page = await browser.newPage();
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.goto(pathToFileURL(slideHtmlPaths[index]).href, { waitUntil: 'networkidle0' });
        const imagePath = join(outputDir, `slide-${String(index + 1).padStart(2, '0')}.png`);
        await page.screenshot({ path: imagePath, type: 'png' });
        await page.close();
        imagePaths.push(imagePath);
      }
      return { imagePaths, mode: 'html-css' };
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.warn(`⚠️ Browser render unavailable, falling back to SVG (${error.message})`);
    return null;
  }
}

async function renderSlidesWithSvg(documentTitle, slides, outputDir, width, height, selectedTheme = null) {
  const imagePaths = [];
  for (let index = 0; index < slides.length; index += 1) {
    const imagePath = join(outputDir, `slide-${String(index + 1).padStart(2, '0')}.png`);
    const svg = buildSlideSvg(documentTitle, slides[index], index, slides.length, width, height, selectedTheme);
    await sharp(Buffer.from(svg)).png().toFile(imagePath);
    imagePaths.push(imagePath);
  }
  return { imagePaths, mode: 'svg-fallback' };
}

async function main() {
  const args = parseArgs(process.argv);
  const sourceFile = args['source-file'];
  if (!sourceFile) {
    throw new Error('--source-file is required');
  }

  const outputDir = resolve(args['output-dir'] || '.context/linkedin-carousel');
  const width = Number(args.width || DEFAULT_WIDTH);
  const height = Number(args.height || DEFAULT_HEIGHT);
  const sourcePath = resolve(sourceFile);
  const raw = readFileSync(sourcePath, 'utf8');
  const carousel = parseCarouselMarkdown(raw);
  const selectedTheme = resolveThemeSelection(args);

  mkdirSync(outputDir, { recursive: true });
  const { deckPath, slidePaths } = writeSlideHtmlFiles(carousel.title, carousel.slides, outputDir, selectedTheme);

  let rendered = { imagePaths: [], mode: 'html-only' };
  if (!args['html-only']) {
    rendered =
      (await renderSlidesWithPuppeteer(slidePaths, outputDir, width, height)) ||
      (await renderSlidesWithSvg(carousel.title, carousel.slides, outputDir, width, height, selectedTheme));
  }

  const manifestPath = join(outputDir, 'carousel-manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify(
        {
          title: carousel.title,
          commentary: carousel.commentary,
          theme: selectedTheme ? selectedTheme.id : 'auto-cycle',
          html: deckPath,
        renderMode: rendered.mode,
        slides: carousel.slides.map((slide, index) => ({
          ...slide,
          html: slidePaths[index],
          image: rendered.imagePaths[index] || null,
          altText: `${slide.headline}${slide.bullets.length ? ` — ${slide.bullets.join('; ')}` : ''}`,
        })),
      },
      null,
      2
    ),
    'utf8'
  );

  console.log('✅ LinkedIn carousel generated');
  console.log(`   html: ${deckPath}`);
  console.log(`   manifest: ${manifestPath}`);
  console.log(`   render_mode: ${rendered.mode}`);
  rendered.imagePaths.forEach((imagePath, index) => {
    console.log(`   [${index + 1}] ${imagePath}`);
  });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
