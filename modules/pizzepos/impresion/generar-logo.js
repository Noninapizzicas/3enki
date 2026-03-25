#!/usr/bin/env node
/**
 * Genera logo.png para la impresora térmica.
 * Uso: node generar-logo.js [ruta-imagen-origen]
 *
 * Si se pasa una imagen de origen, la convierte a monocromo optimizado
 * para impresora térmica. Si no, genera un logo de texto.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const OUTPUT = path.join(__dirname, 'logo.png');
const WIDTH = 384; // 58mm printer

async function fromImage(src) {
  await sharp(src)
    .resize(WIDTH, null, { fit: 'inside' })
    .grayscale()
    .png()
    .toFile(OUTPUT);
  console.log(`Logo generado desde ${src} → ${OUTPUT}`);
}

async function fromText() {
  // Logo compacto para no saturar el buffer de la impresora térmica
  // Max ~3KB de raster (ancho 384 / 8 = 48 bytes/línea × ~60 líneas)
  const svg = `
  <svg width="${WIDTH}" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    <text x="50%" y="40" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="38" font-weight="bold"
          fill="black">NO NI NA</text>
    <text x="50%" y="68" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="22" font-style="italic"
          fill="black">pizzicas</text>
    <text x="50%" y="92" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="18"
          fill="black">643283034</text>
  </svg>`;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(OUTPUT);
  console.log(`Logo de texto generado → ${OUTPUT}`);
}

(async () => {
  const src = process.argv[2];
  if (src && fs.existsSync(src)) {
    await fromImage(src);
  } else {
    await fromText();
  }
})();
