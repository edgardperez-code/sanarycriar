#!/usr/bin/env node
/**
 * Generates the brand assets in /public from code (no design tools needed):
 *   favicon.svg, favicon-32.png, apple-touch-icon.png, icon-192.png,
 *   icon-512.png and og-image.png (1200x630).
 *
 * Text is converted to vector paths by satori using the self-hosted fonts,
 * then rasterised with sharp. Run with: npm run brand-assets
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const fromRoot = (path) => `${root}${path}`;

const C = {
  violeta: '#190933',
  violeta600: '#41375B',
  violeta500: '#584F72',
  nube: '#FDF5EE',
  blanco: '#FFFCF9',
  lavanda100: '#EEEDFF',
  lavanda300: '#BBBBFF',
  lavanda500: '#7D75E2',
  rosa200: '#F9DDF0',
  rosa300: '#F0B4DF',
  rosa600: '#AC4691',
  borde: '#EAE8F2',
};

async function font(pkg, file) {
  return readFile(fromRoot(`node_modules/@fontsource/${pkg}/files/${file}`));
}

const fonts = [
  { name: 'Playfair Display', data: await font('playfair-display', 'playfair-display-latin-600-normal.woff'), weight: 600, style: 'normal' },
  { name: 'Playfair Display', data: await font('playfair-display', 'playfair-display-latin-500-italic.woff'), weight: 500, style: 'italic' },
  { name: 'Poppins', data: await font('poppins', 'poppins-latin-500-normal.woff'), weight: 500, style: 'normal' },
  { name: 'Poppins', data: await font('poppins', 'poppins-latin-600-normal.woff'), weight: 600, style: 'normal' },
];

/** Tiny hyperscript helper for satori's element objects. */
function h(type, style, ...children) {
  const flat = children.flat().filter((child) => child !== null && child !== undefined && child !== false);
  return { type, props: { style, children: flat.length === 1 ? flat[0] : flat } };
}

/* ---------- Monogram (favicon / app icons) ---------- */

function monogram({ rounded }) {
  return h(
    'div',
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.violeta,
      borderRadius: rounded ? 112 : 0,
      // border-box keeps the padding inside the 512px canvas (otherwise the
      // rounded square grows to 520x546 and its right/bottom corners get clipped).
      boxSizing: 'border-box',
      paddingBottom: 28,
      paddingLeft: 6,
    },
    h('span', { fontFamily: 'Playfair Display', fontWeight: 600, fontSize: 250, color: C.rosa300, lineHeight: 1 }, 'S'),
    h(
      'span',
      { fontFamily: 'Playfair Display', fontWeight: 500, fontStyle: 'italic', fontSize: 160, color: C.rosa300, lineHeight: 1, marginLeft: -5, marginRight: 3, marginTop: 58 },
      'y',
    ),
    h('span', { fontFamily: 'Playfair Display', fontWeight: 600, fontSize: 250, color: C.rosa300, lineHeight: 1 }, 'C'),
  );
}

/* ---------- Open Graph image ---------- */

async function hildaDataUrl() {
  const png = await sharp(fromRoot('src/assets/hilda-nobg.png')).resize({ width: 640 }).png({ compressionLevel: 9 }).toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

function ogImage(photo) {
  const frameW = 392;
  const frameH = 424;
  return h(
    'div',
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      backgroundColor: C.nube,
      backgroundImage: `radial-gradient(circle at 100% 0%, ${C.lavanda100} 0%, ${C.nube} 45%)`,
      position: 'relative',
      fontFamily: 'Poppins',
    },
    // Left column: wordmark, headline, credentials.
    h(
      'div',
      { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 700, boxSizing: 'border-box', padding: '64px 0 60px 76px' },
      h(
        'div',
        { display: 'flex', flexDirection: 'column' },
        h(
          'div',
          { display: 'flex', alignItems: 'baseline', fontFamily: 'Playfair Display', fontWeight: 600, fontSize: 40, color: C.violeta, letterSpacing: -0.5 },
          h('span', {}, 'Sanar'),
          h('span', { fontStyle: 'italic', fontWeight: 500, color: C.lavanda500, margin: '0 10px' }, 'y'),
          h('span', {}, 'Criar'),
        ),
        h('div', { display: 'flex', marginTop: 6, fontSize: 19, fontWeight: 500, color: C.violeta500 }, 'Hilda Hernández · Psicóloga Infanto-Juvenil'),
      ),
      h(
        'div',
        { display: 'flex', flexWrap: 'wrap', fontFamily: 'Playfair Display', fontWeight: 600, fontSize: 56, lineHeight: 1.14, color: C.violeta, letterSpacing: -0.5 },
        h('span', { marginRight: 14 }, 'Antes'),
        h('span', { marginRight: 14 }, 'de'),
        h('span', { marginRight: 14 }, 'corregir'),
        h('span', { marginRight: 14 }, 'a'),
        h('span', { marginRight: 14 }, 'tu'),
        h('span', { marginRight: 14 }, 'hijo,'),
        h('span', { marginRight: 14, fontStyle: 'italic', fontWeight: 500, color: C.lavanda500 }, 'descubre'),
        h('span', { marginRight: 14 }, 'qué'),
        h('span', { marginRight: 14 }, 'se'),
        h('span', { marginRight: 14 }, 'activa'),
        h('span', { marginRight: 14 }, 'en'),
        h('span', {}, 'ti.'),
      ),
      h(
        'div',
        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 },
        h('div', { display: 'flex', fontSize: 17, fontWeight: 600, letterSpacing: 3, color: C.rosa600 }, 'FPV 8.914 · 100% ONLINE'),
        h('div', { display: 'flex', fontSize: 19, fontWeight: 500, color: C.violeta600 }, 'sanarycriarve.com'),
      ),
    ),
    // Right column: Hilda inside an organic lavender-to-pink frame.
    h(
      'div',
      { display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
      h('div', {
        position: 'absolute',
        width: frameW,
        height: frameH,
        top: 118,
        left: 70,
        borderRadius: '52% 48% 46% 54%',
        backgroundImage: `linear-gradient(150deg, ${C.lavanda300}, ${C.rosa300})`,
        opacity: 0.8,
      }),
      h(
        'div',
        {
          position: 'absolute',
          top: 92,
          left: 46,
          width: frameW,
          height: frameH,
          display: 'flex',
          overflow: 'hidden',
          borderRadius: '47% 53% 44% 56%',
          backgroundImage: `linear-gradient(165deg, ${C.lavanda100} 0%, ${C.lavanda100} 35%, ${C.rosa200} 100%)`,
        },
        {
          type: 'img',
          props: {
            src: photo,
            width: Math.round(frameW * 1.1),
            height: Math.round(frameW * 1.1 * (1195 / 1206)),
            style: { position: 'absolute', left: -34, top: 20 },
          },
        },
      ),
    ),
  );
}

async function main() {
  // Favicon (rounded) and app icons (square: platforms apply their own mask).
  const faviconSvg = await satori(monogram({ rounded: true }), { width: 512, height: 512, fonts });
  await writeFile(fromRoot('public/favicon.svg'), faviconSvg);
  await sharp(Buffer.from(faviconSvg)).resize(32, 32).png().toFile(fromRoot('public/favicon-32.png'));

  const squareSvg = await satori(monogram({ rounded: false }), { width: 512, height: 512, fonts });
  const square = Buffer.from(squareSvg);
  await sharp(square).resize(180, 180).png().toFile(fromRoot('public/apple-touch-icon.png'));
  await sharp(square).resize(192, 192).png().toFile(fromRoot('public/icon-192.png'));
  await sharp(square).resize(512, 512).png().toFile(fromRoot('public/icon-512.png'));

  // Open Graph image.
  const photo = await hildaDataUrl();
  const ogSvg = await satori(ogImage(photo), { width: 1200, height: 630, fonts });
  await sharp(Buffer.from(ogSvg)).png({ compressionLevel: 9 }).toFile(fromRoot('public/og-image.png'));

  console.log('Brand assets written to public/: favicon.svg, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, og-image.png');
}

await main();
