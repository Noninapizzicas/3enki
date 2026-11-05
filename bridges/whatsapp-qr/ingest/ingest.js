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

const SLUG = arg('slug', 'tienda');
const EVENTOS = arg('eventos', path.join(process.env.HOME, 'wa-rust/data/eventos-tienda.jsonl'));
// El estado del lector vive JUNTO AL LECTOR (no en un directorio con nombre fijo): así
// el mismo fichero sirve instalado en /opt/whatsapp o ejecutado desde el repo, y el
// offset nunca "se pierde" (perderlo = reprocesar la cola entera y duplicar pedidos).
const STATE_DIR = process.env.WA_ESTADO_DIR || __dirname;
const OFFSET_FILE = path.join(STATE_DIR, `.offset-${SLUG}`);
// Ids de mensaje YA procesados. El puente Rust emite el MISMO mensaje dos veces
// (mismo `id`, 3 ms de diferencia: medido el 5-nov con el pedido 7YFF -> dos
// pedidos L 391 y L 392 y dos confirmaciones al cliente). El offset del fichero
// NO protege de eso: son dos lineas distintas con el mismo mensaje dentro. La
// identidad del mensaje es su `id`, no su posicion en el JSONL.
const VISTOS_FILE = path.join(STATE_DIR, `.vistos-${SLUG}.json`);
const VISTOS_MAX = 2000;
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
const TIENDA = process.env.ENKI_TIENDA_URL || `http://127.0.0.1:3000/modules/tienda-api/tienda/pedido/${SLUG}`;
const PUENTE = process.env.WA_PUENTE_URL || 'http://127.0.0.1:8235/send';
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

// Un mensaje = un pedido. El puente repite el mismo mensaje dos veces en el JSONL;
// visto el `id`, la segunda linea no crea nada. Se persiste para que un reinicio del
// lector no reabre la puerta a los duplicados que ya pasaron.
function leerVistos() {
  try {
    const d = JSON.parse(fs.readFileSync(VISTOS_FILE, 'utf8'));
    return new Set(Array.isArray(d) ? d : []);
  } catch { return new Set(); }
}
function guardarVistos(set) {
  const arr = [...set].slice(-VISTOS_MAX);
  try {
    fs.mkdirSync(path.dirname(VISTOS_FILE), { recursive: true });
    fs.writeFileSync(VISTOS_FILE + '.tmp', JSON.stringify(arr));
    fs.renameSync(VISTOS_FILE + '.tmp', VISTOS_FILE);
  } catch (e) { log('no pude guardar los ids vistos:', e.message); }
}
const vistos = leerVistos();

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

/** El detalle que la carta publica entre corchetes: "La Clasica [sin cebolla · +bacon]".
 *  Ese corchete NO es parte del nombre: si no se quita, el plato no casa con la carta
 *  y la linea viaja sin producto. Se separa para (a) buscar por el nombre limpio y
 *  (b) sacar de ahi las variaciones cuando el pedido no trae #P1. */
function partirDetalle(descripcion) {
  const m = String(descripcion || '').match(/^(.*?)\s*\[([^\]]*)\]\s*$/);
  if (!m) return { nombre: String(descripcion || '').trim(), detalle: null };
  return { nombre: m[1].trim(), detalle: m[2].trim() || null };
}

/** Resuelve una descripcion del texto contra la carta. Exacto primero, luego inclusion. */
function buscarProducto(descripcion) {
  const prods = carta();
  const objetivo = norm(partirDetalle(descripcion).nombre);
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

/** Indice id→{nombre, precio_extra} de TODOS los ingredientes de la carta (los `anadir`
 *  del #P1 viajan por id). Incluye las opciones de la ficha, que es donde el dueno
 *  declara el nombre que ve el cliente. */
let ingCache = null; let ingMtime = 0;
function indiceIngredientes() {
  const st = fs.statSync(CARTA);
  if (!ingCache || st.mtimeMs !== ingMtime) {
    const d = JSON.parse(fs.readFileSync(CARTA, 'utf8'));
    const prods = d.productos || [];
    const porId = new Map();
    // 1) La ficha del ingrediente: nombre + su precio_extra.
    for (const p of prods) {
      for (const ing of (p.ingredientes || p.ingredientes_base || [])) {
        if (!ing || !ing.id) continue;
        porId.set(ing.id, { nombre: ing.nombre || ing.id, precio_extra: Number(ing.precio_extra) || 0 });
      }
    }
    // 2) El catálogo de OPCIONES manda en el PRECIO cuando lo declara (es el que el
    //    cliente vio en el panel). Si no lo declara (delta 0: las opciones de QUITAR)
    //    se respeta el precio_extra de la ficha. El nombre de la opción es el que ve
    //    el cliente, así que también manda.
    for (const p of prods) {
      for (const op of (p.opciones || [])) {
        for (const v of (op.valores || [])) {
          if (!v || !v.id) continue;
          const delta = (Number(v.delta_precio_centimos) || 0) / 100;
          const nombre = v.etiqueta || v.nombre || null;
          const previo = porId.get(v.id);
          if (previo) {
            if (delta > 0) previo.precio_extra = delta;
            if (nombre) previo.nombre = nombre;
          } else {
            porId.set(v.id, { nombre: nombre || v.id, precio_extra: delta });
          }
        }
      }
    }
    // 3) Indice por nombre normalizado → el MISMO objeto (un solo precio).
    const porNombre = new Map();
    for (const info of porId.values()) {
      const k = norm(info.nombre);
      if (k && !porNombre.has(k)) porNombre.set(k, info);
    }
    ingCache = { porId, porNombre }; ingMtime = st.mtimeMs;
  }
  return ingCache;
}

/** Lo que LLEVA el plato, por nombre — es lo que la cocina pinta en la ficha. */
function ingredientesDe(p) {
  const lista = (Array.isArray(p?.ingredientes_base) && p.ingredientes_base.length)
    ? p.ingredientes_base
    : (Array.isArray(p?.ingredientes) ? p.ingredientes : []);
  return lista.map((i) => (typeof i === 'string' ? i : i?.nombre)).filter(Boolean);
}

/** Info de un ingrediente venga por id o por nombre ("Anchoas" en el corchete). */
const infoIng = (x) => {
  if (x == null) return null;
  const { porId, porNombre } = indiceIngredientes();
  if (typeof x === 'string') return porId.get(x) || porNombre.get(norm(x)) || null;
  return porId.get(x.id) || porNombre.get(norm(x.nombre || x.etiqueta || '')) || null;
};
const nombrarIng = (x) => {
  if (x == null) return null;
  if (typeof x === 'string') return infoIng(x)?.nombre || x;
  return x.nombre || x.etiqueta || infoIng(x)?.nombre || (x.id ? x.id : null);
};

/** Variaciones de una linea: quitar (lo que NO quiere) y anadir (lo que pide de mas).
 *  Fuente autoritativa = el #P1 (ids). Si el pedido es texto viejo, se lee el corchete
 *  del detalle ("sin cebolla, +bacon"), que es lo que la carta escribio para el cliente. */
function variacionesDe(est, detalle) {
  const quitar = [];
  const anadir = [];
  const sumarQuitar = (xs) => { for (const x of (Array.isArray(xs) ? xs : [])) { const n = nombrarIng(x); if (n && !quitar.includes(n)) quitar.push(n); } };
  const sumarAnadir = (xs) => {
    for (const x of (Array.isArray(xs) ? xs : [])) {
      const n = nombrarIng(x);
      if (!n || anadir.some((a) => a.nombre === n)) continue;
      const id = typeof x === 'string' ? x : x?.id;
      anadir.push({ nombre: n, cantidad: 1, precio_extra: infoIng(x)?.precio_extra || 0 });
    }
  };

  if (est) {
    sumarQuitar(est.quitar);
    sumarAnadir(est.anadir);
    for (const mitad of [est.pizza_izquierda, est.pizza_derecha]) {
      if (mitad) { sumarQuitar(mitad.quitar); sumarAnadir(mitad.anadir); }
    }
  }
  if (!quitar.length && !anadir.length && detalle) {
    for (const parte of detalle.split(/[·,]/)) {
      const t = parte.trim();
      if (!t) continue;
      const sin = t.match(/^sin\s+(.+)$/i);
      const mas = t.match(/^\+\s*(.+)$/);
      if (sin) sumarQuitar([sin[1].trim()]);
      else if (mas) sumarAnadir([mas[1].trim()]);
    }
  }
  return (quitar.length || anadir.length)
    ? { ingredientes_quitar: quitar, ingredientes_anadir: anadir }
    : null;
}

/** Mitades: el #P1 trae solo ids; la cocina necesita nombre e ingredientes de cada mitad. */
function mitadDe(idMitad, quitar, anadir) {
  const p = (carta() || []).find((x) => x.id === idMitad);
  return {
    id: idMitad,
    nombre: p?.nombre || idMitad,
    ingredientes_base: ingredientesDe(p),
    quitar: (quitar || []).map(nombrarIng).filter(Boolean),
    anadir: (anadir || []).map(nombrarIng).filter(Boolean)
  };
}

/** Re-tasa: los precios SIEMPRE salen de la carta, nunca del texto. Y con ellos viaja
 *  la FICHA del plato (ingredientes_base + variaciones) — sin eso la cocina ve el nombre
 *  y nada mas. */
function reTasar(parsed) {
  const avisos = [];
  const items = [];
  const estructuras = Array.isArray(parsed.estructura?.items) ? parsed.estructura.items : [];
  const alineada = estructuras.length === parsed.items.length;

  parsed.items.forEach((it, idx) => {
    const est = alineada ? (estructuras[idx] || null) : null;
    const { nombre: nombreLimpio, detalle } = partirDetalle(it.descripcion);
    const porId = est?.producto_id || est?.base_id || null;
    const p = (porId && (carta() || []).find((x) => x.id === porId)) || buscarProducto(nombreLimpio);
    const variaciones = variacionesDe(est, detalle);
    const esMitad = est?.tipo === 'mitad_mitad' && (est.pizza_izquierda || est.pizza_derecha);

    if (!p && !esMitad) {
      avisos.push(`sin producto en carta: ${nombreLimpio}`);
      items.push({
        cantidad: it.cantidad,
        descripcion: nombreLimpio,
        ...(variaciones ? { variaciones } : {}),
        // sin producto_id el POS colapsa la linea; se manda el precio del texto
        ...(Number.isInteger(it.precio_unitario_centimos) ? {
          precio_unitario_centimos: it.precio_unitario_centimos,
          precio_total_centimos: it.precio_total_centimos,
        } : {}),
      });
      return;
    }

    // Precio: base de la carta + extras de la carta (nunca el total que teclee el cliente).
    let unit;
    if (esMitad) {
      const izq = (carta() || []).find((x) => x.id === est.pizza_izquierda?.id);
      const der = (carta() || []).find((x) => x.id === est.pizza_derecha?.id);
      // Política de la casa (= comandero y carta): base = la mitad más cara + los extras
      // COMPLETOS de cada mitad. Nunca el precio que teclee el cliente.
      const base = Math.max(Number(izq?.precio) || 0, Number(der?.precio) || 0);
      const extras = [...(est.pizza_izquierda?.anadir || []), ...(est.pizza_derecha?.anadir || [])]
        .reduce((s, x) => s + Math.round((infoIng(x)?.precio_extra || 0) * 100), 0);
      unit = Math.round(base * 100) + extras;
    } else {
      unit = Math.round(Number(p.precio) * 100);
    }
    if (Number.isInteger(it.precio_unitario_centimos) && !esMitad) {
      // el texto ya incluye los extras que el cliente vio; se respeta SOLO si la carta
      // no sabe sumarlos (evita cobrar de menos y evita inventarse un precio)
      const extras = (variaciones?.ingredientes_anadir || []).reduce((s, a) => s + Math.round((a.precio_extra || 0) * 100), 0);
      if (extras === 0 && it.precio_unitario_centimos !== unit) {
        // misma base, precio distinto: manda la carta (re-tasado)
      } else if (extras > 0) {
        unit = unit + extras;
      }
    }

    const linea = {
      cantidad: it.cantidad,
      descripcion: p?.nombre || nombreLimpio,
      producto_id: p?.id || null,
      precio_unitario_centimos: unit,
      precio_total_centimos: unit * it.cantidad,
    };
    // LA FICHA: lo que lleva (de la carta) + lo que quita / anade (del pedido).
    const ings = ingredientesDe(p);
    if (ings.length) linea.ingredientes_base = ings;
    if (variaciones) linea.variaciones = variaciones;

    if (esMitad) {
      linea.tipo = 'mitad_mitad';
      linea.pizza_izquierda = mitadDe(est.pizza_izquierda?.id, est.pizza_izquierda?.quitar, est.pizza_izquierda?.anadir);
      linea.pizza_derecha = mitadDe(est.pizza_derecha?.id, est.pizza_derecha?.quitar, est.pizza_derecha?.anadir);
    } else if (est?.tipo === 'al_gusto') {
      linea.tipo = 'al_gusto';
    }
    if (!linea.producto_id) delete linea.producto_id;
    items.push(linea);
  });

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

  // Mismo mensaje ya atendido: el puente lo emite dos veces. Se consume (para que el
  // offset avance) pero no crea pedido ni manda confirmacion.
  if (ev.id && vistos.has(ev.id)) {
    log(`duplicado del puente (id ${ev.id}), se ignora`);
    return 'ok';
  }

  const parsed = parser.parsearPedido(texto);
  if (!parsed.ok) { log('texto PEDIDO no parseable', parsed.error || '', JSON.stringify(texto.slice(0, 160))); return; }
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
    // JID COMPLETA (`...@s.whatsapp.net` o `...@lid`). Es el destino real del aviso de
    // recogida: contestar un LID por telefono es imposible, y hoy WhatsApp identifica
    // asi a los remitentes con numero oculto. El puente acepta la JID entera.
    cliente_jid: de || null,
    // Cuenta del PUENTE por la que entro el pedido (la misma por la que se le confirma).
    // El aviso de "ya esta listo" sale por aqui: contestarle desde otra cuenta es
    // escribirle desde un numero que el cliente no conoce.
    canal_cuenta: SEND_SLUG || null,
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
    // La puerta del pedido puede rechazarlo por una razon de NEGOCIO, no tecnica:
    // cerrado por horario (412) o por el interruptor del dueño (409). Al cliente hay
    // que decírselo, o se queda esperando una pizza que nadie ha empezado a hacer.
    // Mismo criterio que la puerta de Meta (whatsapp-bot): se le da la verdad que
    // devolvio el POS, no un "intentalo de nuevo" que no va a funcionar.
    const code = res.json?.error?.code;
    if (code === 'TIENDA_CERRADA' || code === 'FUERA_DE_HORARIO') {
      const motivo = res.json?.error?.message || 'Ahora mismo no estamos aceptando pedidos.';
      try {
        const env = await postJson(PUENTE, { slug: SEND_SLUG, to: de, text: `${motivo}\nNo se ha cobrado nada.` });
        log(`aviso de cierre al cliente: ${env.json?.ok ? 'enviado ' + (env.json.id || '') : 'NO enviado (' + (env.json?.error || env.status) + ')'}`);
      } catch (e) {
        log('aviso de cierre NO enviado:', e.message);
      }
    }
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
          // Atendido de verdad (pedido creado o descartado con motivo): su id queda
          // visto. Con 'reintentar' NO se marca: la linea se va a releer. Solo se
          // recuerdan los textos de PEDIDO: el resto no crea nada, duplicarlo es inocuo.
          if (ev.id && /^\s*PEDIDO\s+/i.test(ev.texto || '') && !vistos.has(ev.id)) {
            vistos.add(ev.id); guardarVistos(vistos);
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
