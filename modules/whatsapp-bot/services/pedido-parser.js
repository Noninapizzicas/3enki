'use strict';

const FORMATO_PEDIDO_DOC = `
Formato canonico del mensaje wa.me que la PWA tienda genera:

  PEDIDO <project_slug>-<NONCE4>
  - <cant> x <descripcion>
  - <cant> x <descripcion>
  ...
  Total: <importe>
  Palabra clave: <3 chars>

Ejemplo:

  PEDIDO vapers-A3F2
  - 2 x Cloud Nine 50ml Menta
  - 1 x Vampire Vape 30ml Tabaco
  Total: 38,00 EUR
  Palabra clave: rojo

Reglas:
  - Project slug en kebab-case ASCII.
  - Nonce 4 chars [A-Z0-9] sin O ni 0 ni 1 ni I (no ambiguos).
  - Items: una linea cada uno, cantidad entera positiva, separador " x ".
  - Total en formato "Total: X,XX EUR" o "Total: X.XX EUR" (coma o punto).
  - Palabra clave exactamente 3 chars [a-z] minusculas.
`.trim();

const NONCE_PATTERN = /^[A-HJ-NP-Z2-9]{4}$/;
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;
const PALABRA_CLAVE_PATTERN = /^[a-z]{3}$/;

function _normalizar(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/ /g, ' ')
    .trim();
}

function _parsearImporteEur(raw) {
  if (typeof raw !== 'string') return null;
  const limpio = raw.trim().replace(/\s+EUR$/i, '').replace(/\s*EUR/i, '').trim();
  const normalizado = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio;
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  const euros = Number(normalizado);
  if (!Number.isFinite(euros) || euros < 0) return null;
  return Math.round(euros * 100);
}

function parsearPedido(textoBruto) {
  const text = _normalizar(textoBruto);
  if (!text) return { ok: false, kind: 'vacio' };

  const lineas = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lineas.length < 4) return { ok: false, kind: 'no_es_pedido' };

  const matchHeader = lineas[0].match(/^PEDIDO\s+([a-z][a-z0-9-]{1,30})-([A-HJ-NP-Z2-9]{4})$/);
  if (!matchHeader) return { ok: false, kind: 'no_es_pedido' };

  const project_slug = matchHeader[1];
  const nonce = matchHeader[2];
  if (!PROJECT_PATTERN.test(project_slug) || !NONCE_PATTERN.test(nonce)) {
    return { ok: false, kind: 'header_invalido', project_slug };
  }

  const items = [];
  let i = 1;
  while (i < lineas.length && lineas[i].startsWith('- ')) {
    const cuerpo = lineas[i].slice(2).trim();
    const m = cuerpo.match(/^(\d+)\s+x\s+(.{1,200})$/i);
    if (!m) return { ok: false, kind: 'item_invalido', project_slug, linea: lineas[i] };
    const cantidad = Number(m[1]);
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 999) {
      return { ok: false, kind: 'cantidad_invalida', project_slug, linea: lineas[i] };
    }
    items.push({ cantidad, descripcion: m[2].trim() });
    i++;
  }
  if (items.length === 0) return { ok: false, kind: 'sin_items', project_slug };

  if (i >= lineas.length) return { ok: false, kind: 'falta_total', project_slug };
  const matchTotal = lineas[i].match(/^Total:\s*(.+)$/);
  if (!matchTotal) return { ok: false, kind: 'falta_total', project_slug };
  const total_centimos = _parsearImporteEur(matchTotal[1]);
  if (total_centimos === null) return { ok: false, kind: 'total_invalido', project_slug, raw: matchTotal[1] };
  i++;

  if (i >= lineas.length) return { ok: false, kind: 'falta_palabra_clave', project_slug };
  const matchPalabra = lineas[i].match(/^Palabra clave:\s*([a-z]+)$/i);
  if (!matchPalabra) return { ok: false, kind: 'falta_palabra_clave', project_slug };
  const palabra_clave = matchPalabra[1].toLowerCase();
  if (!PALABRA_CLAVE_PATTERN.test(palabra_clave)) {
    return { ok: false, kind: 'palabra_clave_invalida', project_slug };
  }

  return {
    ok: true,
    kind: 'pedido',
    project_slug,
    nonce,
    items,
    total_centimos,
    palabra_clave
  };
}

module.exports = {
  parsearPedido,
  FORMATO_PEDIDO_DOC
};
