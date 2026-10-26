/**
 * qr.js — CODIFICADOR QR NATIVO del órgano de cobro (sin dependencias npm).
 *
 * POR QUÉ EXISTE: el QR de cobro no es un método de pago, es una PUERTA: dentro lleva la
 * URL del checkout. Pintarla no puede costar una dependencia ni una línea de código por
 * proyecto, así que el órgano la pinta él. Modo BYTE (cualquier URL), ECC L/M/Q/H,
 * versiones 1–20, máscara elegida por penalización (spec ISO/IEC 18004).
 *
 * Salidas: matriz de módulos → SVG (vectorial) y PNG (raster, para WhatsApp/impresión).
 * El PNG se construye con zlib de Node (sin sharp, sin canvas).
 *
 * Tablas de bloques Reed-Solomon: valores de la spec QR (contrastados con la implementación
 * de referencia MIT de Project Nayuki: qrcodegen ECC_CODEWORDS_PER_BLOCK /
 * NUM_ERROR_CORRECTION_BLOCKS). El resto del codificador es propio.
 *
 * PRUEBA: tests/unit/pago-gateway-qr.test.js decodifica el QR generado con un lector
 * INDEPENDIENTE (OpenCV) y exige que el texto leído sea el texto metido.
 */

'use strict';

const zlib = require('zlib');

// ── ECC: L=0, M=1, Q=2, H=3 (el índice coincide con los bits de formato) ──
const ECC = { L: 0, M: 1, Q: 2, H: 3 };
const ECC_FORMAT_BITS = [1, 0, 3, 2];   // valor que viaja en los bits de formato

// [nivel][versión 0..20]
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28]
];
const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25]
];

const MIN_VERSION = 1;
const MAX_VERSION = 20;

// ── GF(2^8) con polinomio 0x11D ──
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xFF;
}

/** Polinomio generador de Reed-Solomon de grado `degree`, sin el término líder. */
function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** Resto de la división de `data` por el polinomio `divisor` (los bytes ECC). */
function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

function numRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(ver, ecl) {
  return Math.floor(numRawDataModules(ver) / 8)
    - ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
}

// ── segmento BYTE → bits ──
function byteSegmentBits(text, ver, ecl) {
  const bytes = Buffer.from(String(text), 'utf8');
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };

  push(0b0100, 4);                                   // modo byte
  push(bytes.length, ver <= 9 ? 8 : 16);             // longitud (8 bits hasta v9, 16 después)
  for (const b of bytes) push(b, 8);

  const capacidadBits = numDataCodewords(ver, ecl) * 8;
  if (bits.length > capacidadBits) return null;

  push(0, Math.min(4, capacidadBits - bits.length)); // terminador
  push(0, (8 - (bits.length % 8)) % 8);              // hasta byte
  for (let pad = 0xEC; bits.length < capacidadBits; pad ^= 0xEC ^ 0x11) push(pad, 8);
  return bits;
}

function bitsACodewords(bits) {
  const out = new Array(bits.length / 8).fill(0);
  bits.forEach((b, i) => { out[i >>> 3] |= b << (7 - (i & 7)); });
  return out;
}

function addEccEInterleave(data, ver, ecl) {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks = [];
  const div = rsDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

// ── matriz ──
function matriz(ver) {
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  return { ver, size, mod, fn };
}

function setFn(q, x, y, dark) {
  q.mod[y][x] = !!dark;
  q.fn[y][x] = true;
}

function dibujarPatrones(q, ecl) {
  const size = q.size;
  // timing
  for (let i = 0; i < size; i++) {
    setFn(q, 6, i, i % 2 === 0);
    setFn(q, i, 6, i % 2 === 0);
  }
  // finders + separadores
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(q, x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

  // alineamiento
  const pos = alignmentPositions(q.ver);
  const n = pos.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFn(q, pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // formato (se reescribe con la máscara elegida) + módulo oscuro + versión
  dibujarFormato(q, ecl, 0);
  setFn(q, 8, size - 8, true);
  dibujarVersion(q);
}

function alignmentPositions(ver) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let p = size - 7; result.length < numAlign; p -= step) result.splice(1, 0, p);
  return result;
}

function dibujarFormato(q, ecl, mask) {
  const data = (ECC_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  const bit = i => ((bits >>> i) & 1) !== 0;
  const size = q.size;
  // copia 1 (alrededor del finder superior izquierdo)
  for (let i = 0; i <= 5; i++) setFn(q, 8, i, bit(i));
  setFn(q, 8, 7, bit(6));
  setFn(q, 8, 8, bit(7));
  setFn(q, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFn(q, 14 - i, 8, bit(i));
  // copia 2 (repartida por los otros dos finders)
  for (let i = 0; i < 8; i++) setFn(q, size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFn(q, 8, size - 15 + i, bit(i));
}

function dibujarVersion(q) {
  const ver = q.ver;
  if (ver < 7) return;
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
  const bits = (ver << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = q.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFn(q, a, b, dark);
    setFn(q, b, a, dark);
  }
}

function dibujarCodewords(q, codewords) {
  const size = q.size;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;                       // columna de timing: se salta
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (q.fn[y][x] || i >= codewords.length * 8) continue;
        q.mod[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
        i++;
      }
    }
  }
}

function aplicarMascara(q, mask) {
  const size = q.size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let invert;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: throw new RangeError('máscara inválida');
      }
      if (!q.fn[y][x] && invert) q.mod[y][x] = !q.mod[y][x];
    }
  }
}

function penalizacion(q) {
  const size = q.size;
  const m = q.mod;
  let result = 0;

  // N1: runs de 5+ del mismo color (filas y columnas)
  for (let y = 0; y < size; y++) {
    let runColor = false, runX = 0;
    for (let x = 0; x < size; x++) {
      if (m[y][x] === runColor) { runX++; if (runX === 5) result += 3; else if (runX > 5) result++; }
      else { runColor = m[y][x]; runX = 1; }
    }
  }
  for (let x = 0; x < size; x++) {
    let runColor = false, runY = 0;
    for (let y = 0; y < size; y++) {
      if (m[y][x] === runColor) { runY++; if (runY === 5) result += 3; else if (runY > 5) result++; }
      else { runColor = m[y][x]; runY = 1; }
    }
  }

  // N2: bloques 2x2 del mismo color
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += 3;
    }
  }

  // N3: patrón 1:1:3:1:1 con 4 módulos claros a un lado (finders falsos)
  const patron = [true, false, true, true, true, false, true];
  const coincide = (get) => {
    let sum = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x + 11 <= size; x++) {
        const linea = [];
        for (let k = 0; k < 11; k++) linea.push(get(y, x + k));
        const a = patron.every((v, k) => linea[k] === v) && linea.slice(7).every(v => v === false);
        const b = patron.every((v, k) => linea[k + 4] === v) && linea.slice(0, 4).every(v => v === false);
        if (a || b) sum += 40;
      }
    }
    return sum;
  };
  result += coincide((y, x) => m[y][x]);
  result += coincide((y, x) => m[x][y]);

  // N4: proporción de oscuros
  let dark = 0;
  for (const fila of m) for (const v of fila) if (v) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += Math.max(0, k) * 10;
  return result;
}

/**
 * Codifica `text` en un QR. Devuelve { size, version, ecl, mask, modules } donde
 * modules[y][x] === true significa módulo oscuro.
 */
function encode(text, { ecl = 'M', version = null } = {}) {
  const nivel = typeof ecl === 'string' ? ECC[String(ecl).toUpperCase()] : ecl;
  if (!Number.isInteger(nivel)) throw new RangeError(`nivel ECC inválido: ${ecl}`);

  let ver = version;
  if (ver) {
    if (ver < MIN_VERSION || ver > MAX_VERSION) throw new RangeError(`versión fuera de rango (1..${MAX_VERSION})`);
  } else {
    ver = null;
    for (let v = MIN_VERSION; v <= MAX_VERSION; v++) {
      const bits = byteSegmentBits(text, v, nivel);
      if (bits && bits.length <= numRawDataModules(v)) { ver = v; break; }
    }
    if (!ver) throw new RangeError(`texto demasiado largo para un QR v1..v${MAX_VERSION} con ECC ${ecl}`);
  }

  const bits = byteSegmentBits(text, ver, nivel);
  if (!bits) throw new RangeError('texto demasiado largo para la versión pedida');

  const codewords = addEccEInterleave(bitsACodewords(bits), ver, nivel);

  let mejor = null;
  for (let mask = 0; mask < 8; mask++) {
    const q = matriz(ver);
    dibujarPatrones(q, nivel);
    dibujarCodewords(q, codewords);
    aplicarMascara(q, mask);
    dibujarFormato(q, nivel, mask);   // el formato va DESPUÉS de la máscara (no se enmascara)
    const p = penalizacion(q);
    if (!mejor || p < mejor.p) mejor = { q, mask, p };
  }

  return {
    size: mejor.q.size, version: ver, ecl: Object.keys(ECC)[nivel], mask: mejor.mask,
    penaltiad: mejor.p, modules: mejor.q.mod, texto: String(text)
  };
}

// ── salidas ──

/** SVG autocontenido. `scale` = píxeles por módulo, `border` = módulos de margen (4 = spec). */
function toSvg(qr, { scale = 8, border = 4, dark = '#000', light = '#fff' } = {}) {
  const n = qr.size;
  const dim = (n + border * 2) * scale;
  const rects = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.modules[y][x]) continue;
      rects.push(`M${(x + border) * scale} ${(y + border) * scale}h${scale}v${scale}h${-scale}z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">`
    + `<rect width="100%" height="100%" fill="${light}"/>`
    + `<path d="${rects.join('')}" fill="${dark}"/></svg>`;
}

function dataUriSvg(svg) {
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

/** PNG en escala de grises (1 bit por píxel, sin filtro). Sirve para WhatsApp e impresión. */
function toPng(qr, { scale = 8, border = 4 } = {}) {
  const n = qr.size;
  const dim = (n + border * 2) * scale;
  const filas = [];
  for (let py = 0; py < dim; py++) {
    // byte 0 = filtro "none"; el resto, píxeles (bit 1 = blanco en gris de 1 bit)
    const fila = Buffer.alloc(1 + Math.ceil(dim / 8), 0x00);
    fila.fill(0xFF, 1);
    const my = Math.floor(py / scale) - border;
    for (let px = 0; px < dim; px++) {
      const mx = Math.floor(px / scale) - border;
      const oscuro = my >= 0 && my < n && mx >= 0 && mx < n && qr.modules[my][mx];
      if (oscuro) fila[1 + (px >>> 3)] &= 0xFF ^ (0x80 >>> (px & 7));
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(dim, 0); ihdr.writeUInt32BE(dim, 4);
  ihdr[8] = 1;      // bit depth
  ihdr[9] = 0;      // grayscale
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(filas), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function dataUriPng(png) {
  return 'data:image/png;base64,' + png.toString('base64');
}

module.exports = { encode, toSvg, toPng, dataUriSvg, dataUriPng, ECC, numDataCodewords };
