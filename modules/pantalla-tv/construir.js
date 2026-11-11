'use strict';

/**
 * CONSTRUCTOR — la parte PURA del módulo.
 *
 * Entra   { cableado, datos, proyectar, hoy }
 * Sale    { salida, informe }
 *
 * No lee discos, no conoce rutas, no sabe de proyectos ni de precios. Los datos
 * los trae quien llama (el módulo, por el bus; un CLI, leyendo el storage). Así
 * el MISMO constructor sirve para la pantalla viva y para verificarla offline
 * contra ella: si los dos no dan las mismas piezas, hay una divergencia.
 *
 * Si un bloque no tiene fuente devuelve cero piezas y se dice en el informe.
 * Nunca se rellena con un invento: un «— €» en el escaparate es peor que no
 * enseñar la franja.
 */

const crypto = require('crypto');
const { piezaValida, alternar } = require('./contrato');

/** Huella del CONTENIDO (no de los bytes en disco): cambia si cambia el dato. */
function huella(...partes) {
  const h = crypto.createHash('sha256');
  for (const p of partes) h.update(p === undefined || p === null ? '∅' : JSON.stringify(p));
  return h.digest('hex');
}

/**
 * Identidad de una IMAGEN.
 *
 * Regla (bug corregido nov-2026): la identidad es la del fichero o la URL, NO la
 * del nombre. Si las fotos son remotas, dos URLs distintas son dos fotos; la
 * misma URL dos veces está repetida. Si son locales y `huellas` trae su hash
 * (lo aporta quien lee, best-effort), manda el hash: así dos copias del MISMO
 * fichero con nombres distintos —el caso de the-pirate: 13 nombres, un solo
 * fichero— se reconocen como una.
 */
function huellaImagen(url, huellas) {
  if (!url) return null;
  if (/^(https?:)?\/\//i.test(url) || String(url).startsWith('data:')) return 'url:' + url;
  const base = String(url).split('/').pop().split('?')[0];
  return 'img:' + ((huellas && huellas[base]) || base);
}

/** La fecha del negocio, no la del servidor. */
function hoyEn(zona) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona || 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function construir({ cableado, datos, proyectar, hoy }) {
  if (!cableado) throw new Error('falta el cableado del proyecto');
  if (!datos) throw new Error('faltan los datos');
  if (typeof proyectar !== 'function') throw new Error('falta el proyector (proyectarCartaPublica)');

  const carta = datos.carta;
  if (!carta) throw new Error('no hay carta en servicio');
  const cartaId = datos.carta_id || (carta.meta && carta.meta.id) || null;
  if (carta.meta && carta.meta.estado && carta.meta.estado !== 'en_servicio') {
    throw new Error(`la carta ${cartaId} está en estado "${carta.meta.estado}", no en servicio`);
  }

  const marca = datos.marca || null;
  const contenido = datos.contenido || {};
  const servicio = datos.servicio || {};

  const proyeccion = proyectar(
    carta, marca, contenido,
    { dominio_publico: null, opciones_visualizacion: {} }, {}
  );

  const tel = (marca && marca.negocio && marca.negocio.local && marca.negocio.local.telefono) || null;

  const ctx = {
    proyecto: cableado.proyecto || datos.proyecto || null,
    cableado,
    hoy: hoy || hoyEn((datos.servicio && datos.servicio.zona_horaria) || 'Europe/Madrid'),
    carta_id: cartaId,
    carta, marca, servicio, contenido,
    tarifas: datos.tarifas || {},
    porciones: datos.porciones || null,
    promos: datos.promos || null,
    huellas: datos.huellas || null,
    proyeccion,
    logo_url: cableado.logo_url || null,
    qr_url: cableado.qr_url || null,
    telefono: tel,
    whatsapp_url: datos.whatsapp_url || null
  };

  // ── ejecutar bloques (una llamada por fuente, se reutiliza entre zonas)
  const fuentes = new Map();
  const piezas = [];
  const informe = [];

  for (const bloque of cableado.bloques || []) {
    if (bloque.activo === false) { informe.push({ bloque: bloque.id, estado: 'apagado', n: 0 }); continue; }
    if (!fuentes.has(bloque.fuente)) {
      const mod = require(`./fuentes/${bloque.fuente}.js`);
      let salida = [];
      try { salida = mod.piezas(ctx) || []; } catch (e) { salida = []; informe.push({ bloque: bloque.id, estado: 'error', n: 0, errores: [e.message] }); }
      fuentes.set(bloque.fuente, { mod, piezas: salida });
    }
    const fuente = fuentes.get(bloque.fuente);
    const suyas = fuente.piezas.filter(p => p.bloque === bloque.id);
    const errores = [];
    for (const p of suyas) {
      p.zona = bloque.zona;
      const e = piezaValida(p);
      if (e.length) errores.push(`${p.id}: ${e.join(', ')}`);
      else piezas.push(p);
    }
    informe.push({
      bloque: bloque.id, zona: bloque.zona, n: suyas.length - errores.length,
      estado: errores.length ? 'invalido' : (suyas.length ? 'ok' : (fuente.mod.requiere ? 'sin fuente' : 'vacio')),
      requiere: fuente.mod.requiere || null, errores
    });
  }

  // ── una misma FOTO no se repite: si el fichero es idéntico, la segunda pasa
  //    a ficha (mismo texto, sin imagen). El carrusel entra primero: la foto
  //    única va al sitio más grande.
  const vistas = new Map();
  for (const p of [...piezas].sort((a, b) => ((a.zona === 'C') ? 0 : 1) - ((b.zona === 'C') ? 0 : 1))) {
    if (!p.imagen || (p.zona !== 'C' && p.zona !== 'B')) continue;
    const h = huellaImagen(p.imagen, ctx.huellas);
    if (!h) continue;
    if (vistas.has(h)) { p.forma = 'ficha'; p.imagen = null; p.datos = Object.assign({}, p.datos, { foto_repetida: true }); }
    else vistas.set(h, p.id);
  }

  // ── alternancia dentro del carrusel (foto / ficha / cifra, sin dos iguales)
  const carrusel = piezas.filter(p => p.zona === 'C' && p.cadencia === 'tanda');
  const resto = piezas.filter(p => !(p.zona === 'C' && p.cadencia === 'tanda'));

  const b = proyeccion.branding || {};
  const salida = {
    esquema: 'pantalla-tv/bloques-v1',
    sello: {
      proyecto: ctx.proyecto,
      hoy: ctx.hoy,
      carta: { id: cartaId, version: (carta.meta && carta.meta.version) || null, estado: (carta.meta && carta.meta.estado) || null },
      huella: huella(carta, marca, contenido, servicio, datos.porciones, datos.promos).slice(0, 16),
      generado_por: 'pantalla-tv'
    },
    presentacion: {
      nombre: b.nombre || null,
      lema: b.lema || null,
      colores: b.colores || {},
      tipografias: b.tipografias || {},
      logo: cableado.logo_url || null,
      qr: cableado.qr_url || null,
      redes: (marca && marca.negocio && marca.negocio.redes) || {},
      local: (marca && marca.negocio && marca.negocio.local) || {}
    },
    zonas: cableado.zonas || {},
    piezas: [...resto, ...alternar(carrusel)]
  };

  return { salida, informe };
}

module.exports = { construir, huella, huellaImagen, hoyEn };
