#!/usr/bin/env node
'use strict';

/**
 * Puente de ENTRADA: mensajes del puente whatsapp-rust -> pedido real en el POS de Enki.
 *
 * El binario Rust (enki-wa-bridge) no habla con el bus: deja una linea JSON por
 * evento en data/eventos-<slug>.jsonl. Nadie leia ese fichero, asi que los pedidos
 * que llegaban por WhatsApp morian ahi. Este proceso es el lector que faltaba:
 *
 *   JSONL  ->  parsearPedido (parser REAL de Enki)  ->  re-tasado contra la carta viva
 *          ->  POST /tienda/pedido/<slug>          (el mismo camino que la web)
 *          ->  POST /send del puente               (confirmacion al cliente)
 *
 * Uso:
 *   node ingest.js --slug rapitvapers [--eventos <ruta>] [--once] [--dry-run] [--desde-inicio]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes('--' + n);

const SLUG = arg('slug', 'rapitvapers');
const EVENTOS = arg('eventos', path.join(process.env.HOME, 'wa-rust/data/eventos-tienda.jsonl'));
const OFFSET_FILE = path.join(__dirname, `.offset-${SLUG}`);
const ONCE = flag('once');
const DRY = flag('dry-run');
const DESDE_INICIO = flag('desde-inicio');

// Raiz del runtime de Enki: por defecto el deploy vivo; ENKI_HOME permite apuntar
// a un clon (así el mismo fichero sirve en cualquier máquina).
const ENKI = process.env.ENKI_HOME || '/opt/enki';
// La carta se puede fijar por argumento: hay proyectos cuya carta viva NO se llama
// carta_<slug>.json (the-pirate publica desde the-pirate-v4.json). Sin esto el lector
// arranca, no encuentra fichero y todo pedido entra "sin producto en carta".
const CARTA = arg('carta', path.join(ENKI, 'data/projects', SLUG, 'storage/pizzepos/cartas', `carta_${SLUG}.json`));
const TIENDA = `http://127.0.0.1:3000/modules/tienda-api/tienda/pedido/${SLUG}`;
const PUENTE = 'http://127.0.0.1:8235/send';
// El slug del PUENTE no es el del proyecto: un mismo puente sirve varios negocios y
// cada uno entra por su cuenta ("tienda" para rapitvapers). La confirmacion al cliente
// tiene que salir por la cuenta del negocio que atendio el pedido.
const SEND_SLUG = arg('send-slug', 'tienda');

const parser = require(path.join(ENKI, 'modules/_shared/pedido-mensaje-parser.js'));

function log(...a) { console.log(new Date().toISOString(), ...a); }

function leerOffset() {
  try { return parseInt(fs.readFileSync(OFFSET_FILE, 'utf8').trim(), 10) || 0; } catch { return 0; }
}
function guardarOffset(n) {
  fs.mkdirSync(path.dirname(OFFSET_FILE), { recursive: true });
  fs.writeFileSync(OFFSET_FILE + '.tmp', String(n));
  fs.renameSync(OFFSET_FILE + '.tmp', OFFSET_FILE);
}

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

let cartaCache = null; let cartaMtime = 0;
function carta() {
  const st = fs.statSync(CARTA);
  if (!cartaCache || st.mtimeMs !== cartaMtime) {
    const d = JSON.parse(fs.readFileSync(CARTA, 'utf8'));
    cartaCache = d.productos || [];
    cartaMtime = st.mtimeMs;
    log(`carta cargada: ${cartaCache.length} productos`);
  }
  return cartaCache;
}

/** Resuelve una descripcion del texto contra la carta. Exacto primero, luego inclusion. */
function buscarProducto(descripcion) {
  const prods = carta();
  const objetivo = norm(descripcion);
  let p = prods.find((x) => norm(x.nombre) === objetivo);
  if (p) return p;
  // el texto puede traer el detalle entre corchetes o el nombre pelado
  p = prods.find((x) => objetivo === norm(x.nombre.replace(/\s*\([^)]*\)\s*$/, '')));
  if (p) return p;
  const cands = prods.filter((x) => {
    const n = norm(x.nombre);
    return objetivo.includes(n) || n.includes(objetivo);
  });
  if (cands.length === 1) return cands[0];
  return null;
}

/** Re-tasa: los precios SIEMPRE salen de la carta, nunca del texto. */
function reTasar(parsed) {
  const avisos = [];
  const items = [];
  for (const it of parsed.items) {
    const p = buscarProducto(it.descripcion);
    if (p) {
      const unit = Math.round(Number(p.precio) * 100);
      items.push({
        cantidad: it.cantidad,
        descripcion: it.descripcion,
        producto_id: p.id,
        precio_unitario_centimos: unit,
        precio_total_centimos: unit * it.cantidad,
      });
    } else {
      avisos.push(`sin producto en carta: ${it.descripcion}`);
      items.push({
        cantidad: it.cantidad,
        descripcion: it.descripcion,
        // sin producto_id el POS colapsa la linea; se manda el precio del texto
        ...(Number.isInteger(it.precio_unitario_centimos) ? {
          precio_unitario_centimos: it.precio_unitario_centimos,
          precio_total_centimos: it.precio_total_centimos,
        } : {}),
      });
    }
  }
  const total = items.reduce((s, i) => s + (i.precio_total_centimos || 0), 0);
  return { items, total_centimos: total || parsed.total_centimos, avisos };
}

/** La referencia humana (ref_display) del pedido recien creado, leida de los eventos del proyecto.
 *  El POS persiste pedido.creado un instante DESPUES de responder el 201: reintenta. */
async function buscarRef(pedidoId) {
  if (!pedidoId) return null;
  const p = path.join(ENKI, 'data/projects', SLUG, 'persistencia/current/eventos.json');
  for (let intento = 0; intento < 5; intento++) {
    try {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      const evs = (d.eventos || []).filter((e) => e.event_type === 'pedido.creado'
        && (e.payload?.pedido_id === pedidoId || e.payload?.id === pedidoId));
      const ult = evs[evs.length - 1];
      if (ult?.payload?.ref_display) return ult.payload.ref_display;
    } catch { /* fichero en escritura */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let json = null;
  try { json = JSON.parse(txt); } catch { /* texto plano */ }
  return { status: r.status, json, txt };
}

async function procesar(ev) {
  const texto = ev.texto || '';
  if (!/^\s*PEDIDO\s+/i.test(texto)) return; // no es un pedido

  const parsed = parser.parsearPedido(texto);
  if (!parsed.ok) { log('texto PEDIDO no parseable', parsed.error || ''); return; }
  if (parsed.project_slug !== SLUG) {
    log(`pedido de otro negocio (${parsed.project_slug}), se ignora`);
    return;
  }
  if (parsed.mayor_edad_confirmado === false) {
    log('rechazado: el cliente no confirmo mayoria de edad');
    return;
  }

  const { items, total_centimos, avisos } = reTasar(parsed);
  const de = ev.de || '';
  // `de` puede ser un PN (numero real, `@s.whatsapp.net`) o un LID (id interno de
  // WhatsApp, `@lid`) — WhatsApp ya casi no manda el movil. Solo el PN es un telefono:
  // guardar el LID como `cliente_telefono` deja en el POS un numero que no existe.
  const esPN = /@s\.whatsapp\.net$/i.test(de);
  const tel = esPN ? de.split('@')[0] : null;

  const payload = {
    items,
    total_centimos,
    nombre_cliente: parsed.cliente_nombre || 'Cliente WhatsApp',
    cliente_telefono: tel,
    modo_consumo: parsed.modo_consumo || 'recoger',
    hora_recogida: parsed.hora_recogida || null,
    mayor_edad_confirmado: parsed.mayor_edad_confirmado,
    notas_generales: `WhatsApp ${de} · ${parsed.nonce || ''}${avisos.length ? ' · ' + avisos.join('; ') : ''}`,
  };

  log(`pedido ${parsed.nonce} · ${items.length} linea(s) · ${(total_centimos / 100).toFixed(2)} EUR` +
      (avisos.length ? ` · AVISOS: ${avisos.join('; ')}` : ''));

  if (DRY) { console.log(JSON.stringify(payload, null, 1)); return; }

  // Post al POS. Un fallo aqui NO puede consumir el mensaje: si Enki aun no esta
  // arriba (justo despues de un reinicio) o la red parpadea, el pedido se perderia
  // para siempre porque el offset ya habria avanzado. Devolvemos 'reintentar' para
  // que el bucle no lo consuma, y solo saltamos cuando el rechazo es definitivo (4xx).
  let res;
  try {
    res = await postJson(TIENDA, payload);
  } catch (e) {
    log(`POS no responde (${e.message}) · reintento en el proximo ciclo`);
    return 'reintentar';
  }
  if (res.status === 429 || res.status >= 500) {
    log(`POS no disponible: HTTP ${res.status} · reintento en el proximo ciclo`);
    return 'reintentar';
  }
  if (res.status !== 200 && res.status !== 201) {
    log(`FALLO al crear el pedido: HTTP ${res.status} ${res.txt.slice(0, 300)} · se descarta`);
    return 'ok';
  }
  const ped = res.json?.pedido || res.json?.data?.pedido || res.json?.data || res.json || {};
  const pedidoId = ped.pedido_id || ped.id || '';
  // la respuesta del POS trae pedido_id, no la referencia humana: la busca en los
  // eventos del proyecto (pedido.creado.ref_display) para que el cliente pueda decirla
  const ref = (await buscarRef(pedidoId)) || (pedidoId ? String(pedidoId).slice(0, 8) : '');

  log(`PEDIDO CREADO · HTTP ${res.status} · ref=${ref}`);

  // Confirmacion al cliente por el mismo puente. Se responde a la JID COMPLETA de
  // origen (`ev.de`), no al telefono: si el remitente es un LID no hay movil que
  // componer, y el puente sabe contestar a un LID desde que acepta JIDs enteras.
  if (tel || de) {
    const msg = `Pedido recibido, ${payload.nombre_cliente}.\n` +
      items.map((i) => `${i.cantidad} x ${i.descripcion}`).join('\n') +
      `\nTotal: ${(total_centimos / 100).toFixed(2).replace('.', ',')} EUR` +
      (ref ? `\nReferencia: ${ref}` : '') +
      `\nTe avisamos cuando este listo para recoger.`;
    const env = await postJson(PUENTE, { slug: SEND_SLUG, to: de, text: msg });
    log(`confirmacion al cliente: ${env.json?.ok ? 'enviada ' + (env.json.id || '') : 'NO enviada (' + (env.json?.error || env.status) + ')'}`);
  } else {
    log('confirmacion no enviada: el evento no trae remitente');
  }
}

async function main() {
  let offset = DESDE_INICIO ? 0 : leerOffset();
  let reintentos = 0;
  log(`vigilante ${SLUG} · eventos=${EVENTOS} · offset=${offset}${DRY ? ' · DRY-RUN' : ''}`);
  for (;;) {
    try {
      const st = fs.statSync(EVENTOS);
      if (st.size < offset) { offset = 0; log('fichero rotado, offset a 0'); }
      if (st.size > offset) {
        const fd = fs.openSync(EVENTOS, 'r');
        const buf = Buffer.alloc(st.size - offset);
        fs.readSync(fd, buf, 0, buf.length, offset);
        fs.closeSync(fd);
        const lineas = buf.toString('utf8').split('\n');
        let consumido = 0;
        for (let i = 0; i < lineas.length - 1; i++) {
          const cruda = lineas[i];
          const bytes = Buffer.byteLength(cruda + '\n');
          let ev; try { ev = JSON.parse(cruda); } catch { consumido += bytes; continue; }
          let r = 'ok';
          if (ev.tipo === 'mensaje') {
            try { r = await procesar(ev); } catch (e) { log('error procesando:', e.message); }
          }
          if (r === 'reintentar') {
            reintentos++;
            if (reintentos === 1 || reintentos % 30 === 0) {
              log(`mensaje sin consumir · reintento ${reintentos} · no se pierde, se reintenta`);
            }
            break;   // el offset NO avanza: la linea se relee en el proximo ciclo
          }
          reintentos = 0;
          consumido += bytes;
        }
        offset += consumido;
        guardarOffset(offset);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') log('bucle:', e.message);
    }
    if (ONCE) return;
    await new Promise((r) => setTimeout(r, reintentos > 0 ? 10000 : 2000));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
