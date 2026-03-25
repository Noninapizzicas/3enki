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
  // Crear SVG con el texto del logo
  const svg = `
  <svg width="${WIDTH}" height="180" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    <text x="50%" y="70" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="52" font-weight="bold"
          fill="black">NO NI NA</text>
    <text x="50%" y="110" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="28" font-style="italic"
          fill="black">pizzicas</text>
    <text x="50%" y="155" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="24"
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
