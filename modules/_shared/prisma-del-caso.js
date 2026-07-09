/**
 * prisma-del-caso — LA ABSTRACCIÓN del caso-de-dato. Hermano meta de los prismas de
 * comercio y construcción: allí entra un producto/elemento crudo y sale su espectro;
 * aquí entra un CASO ("al proyecto x le falta el dato y, con las herramientas z") y
 * sale su descomposición universal — para que un LOOP (el rail) encuentre la senda
 * en vez de que un autor la escriba a mano.
 *
 * La tesis que lo gobierna (de la piedra angular soysuper): la línea NUNCA es
 * fuzzy/determinista — es RECTIFICABLE/IRRECTIFICABLE. Lo fuzzy trabaja libre si cada
 * afirmación deja su DIRECCIÓN DE VUELTA (evidencia re-comprobable). El determinismo
 * del sistema no se escribe: EMERGE — el loop tienta sendas (cada fallo llega fértil,
 * error-fertil), el juez declara el círculo cerrado, la senda ganadora se SELLA en la
 * cantera (cosecha.crear) y baja la escalera hasta reflejo cuando estabiliza.
 *
 * Banco PURO: sin I/O, sin bus. Lo consumen el juez del rail (circuloCerrado como
 * objetivo tipado), el LLM que loopea (descomponer → preguntas abiertas) y el sellado
 * (sellarSenda → shape para cosecha.crear). Registro de naturalezas ABIERTO por `extra`.
 */

'use strict';

// ── NATURALEZAS del dato — deciden si la ley de la evidencia aplica ──
// El orden fija la PRIORIDAD del clasificador; 'CREACION' es el default (lo que no
// afirma nada del mundo ni se deriva de lo interno, se está CREANDO).
const NATURALEZAS = [
  {
    id: 'DERIVABLE',
    reglas: [{ derivable_de_internos: true }],
    ley: 'se re-calcula de datos ya presentes — ni fe ni evidencia hacen falta, se re-deriva',
    exige_evidencia: false
  },
  {
    id: 'AFIRMACION_EXTERNA',
    reglas: [{ afirma_sobre_el_mundo: true }],
    ley: 'afirma algo del MUNDO (precio, monto, medida, stock) — entra SOLO con dirección de vuelta',
    exige_evidencia: true
  },
  {
    id: 'CREACION',
    reglas: [],
    por_defecto: true,
    ley: 'no afirma nada del mundo (receta creativa, copy) — el freno de forma del dominio basta',
    exige_evidencia: false
  }
];

const NATURALEZA_IDS = new Set(NATURALEZAS.map(n => n.id));

function _matchRegla(regla, rasgos) {
  return Object.keys(regla).every(k => rasgos[k] === regla[k]);
}

// rasgos = { afirma_sobre_el_mundo?, derivable_de_internos? } — propiedades DECLARADAS del
// dato que falta (las declara quien abre el caso; el clasificador no adivina).
function clasificar(rasgos = {}, extra = []) {
  const registro = (Array.isArray(extra) ? extra : []).concat(NATURALEZAS);
  for (const n of registro) {
    if (n.por_defecto) continue;
    if ((n.reglas || []).some(r => _matchRegla(r, rasgos))) return n.id;
  }
  const def = registro.find(n => n.por_defecto) || NATURALEZAS[NATURALEZAS.length - 1];
  return def.id;
}

function _naturaleza(id, extra = []) {
  return (Array.isArray(extra) ? extra : []).concat(NATURALEZAS).find(n => n.id === id) || null;
}

// ── DESCOMPONER: caso crudo → los 5 huecos (el espectro) ──
// caso = { necesidad, entidad, dominio, rasgos?, herramientas? }
//   necesidad    qué dato falta ("precio del ingrediente")
//   entidad      sobre qué ("mozzarella rallada", "factura 2026-071")
//   dominio      el módulo dueño del freno ("escandallo", "facturas")
//   rasgos       propiedades declaradas del dato (ver clasificar)
//   herramientas las z disponibles (candidatas del loop) — opcional, el loop puede descubrir más
function descomponer(caso = {}, extra = []) {
  const naturaleza = clasificar(caso.rasgos || {}, extra);
  const nat = _naturaleza(naturaleza, extra);
  const exigeEvidencia = !!(nat && nat.exige_evidencia);
  return {
    identidad: { afirma: caso.necesidad || null, sobre: caso.entidad || null, naturaleza },
    restricciones: {
      freno: caso.dominio ? `${caso.dominio}.validar` : null,
      ley: nat ? nat.ley : null
    },
    contrato: exigeEvidencia
      ? { valor: null, fuente: null, evidencia: null, verificado_at: null }
      : { valor: null, fuente: null },
    no_objetivos: [
      'inventar el valor desde el prior (sin dirección de vuelta = irrectificable)',
      'cablear la senda a mano (la senda se ENCUENTRA loopeando y se SELLA)'
    ],
    preguntas_abiertas: exigeEvidencia
      ? ['¿dónde vive la evidencia? (url·api_id·documento·medición·testimonio)',
         '¿qué herramienta llega hasta ella?',
         '¿qué evento PERSISTE el dato (cierra el círculo)?']
      : ['¿qué lo produce/deriva?',
         '¿qué evento PERSISTE el dato (cierra el círculo)?'],
    herramientas_candidatas: Array.isArray(caso.herramientas) ? caso.herramientas : []
  };
}

// ── CÍRCULO CERRADO: el objetivo TIPADO del juez del rail — Specification FÉRTIL ──
// estado = { naturaleza, valor?, evidencia?, freno_verde?, persistido? }
// Nunca devuelve un "no" pelado: nombra lo que FALTA (el siguiente paso del loop).
function circuloCerrado(estado = {}, extra = []) {
  const nat = _naturaleza(estado.naturaleza, extra);
  const faltan = [];
  if (estado.valor === null || estado.valor === undefined) faltan.push('valor');
  if (nat && nat.exige_evidencia) {
    const ev = estado.evidencia;
    const evOk = (typeof ev === 'string' && ev.trim().length > 0) ||
                 (ev && typeof ev === 'object' && Object.keys(ev).length > 0);
    if (!evOk) faltan.push('evidencia (la dirección de vuelta)');
  }
  if (estado.freno_verde !== true) faltan.push('freno_verde (validar del dominio)');
  if (estado.persistido !== true) faltan.push('persistido (el evento de cierre emitido)');
  return { cerrado: faltan.length === 0, faltan };
}

// ── SELLAR LA SENDA: el camino ganador → shape para cosecha.crear (la tabla EMERGE) ──
// bitacora = { caso, naturaleza, pasos:[{herramienta|evento, hace}], evento_cierre, tipo_evidencia? }
// Devuelve la senda decidida lista para sellarse como skill del proyecto; null si aún no
// hay senda que sellar (pasos vacíos o círculo sin evento de cierre).
function sellarSenda(bitacora = {}) {
  const pasos = Array.isArray(bitacora.pasos) ? bitacora.pasos.filter(p => p && (p.herramienta || p.evento)) : [];
  if (pasos.length === 0 || !bitacora.evento_cierre) return null;
  const nat = _naturaleza(bitacora.naturaleza) || _naturaleza('CREACION');
  if (nat.exige_evidencia && !bitacora.tipo_evidencia) return null;   // una afirmación sin tipo de evidencia no es senda de fiar
  const caso = bitacora.caso || {};
  return {
    nombre: `senda-${(caso.dominio || 'caso')}-${(caso.necesidad || 'dato')}`.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60),
    naturaleza: nat.id,
    caso: { necesidad: caso.necesidad || null, entidad: caso.entidad || null, dominio: caso.dominio || null },
    pasos,
    evento_cierre: bitacora.evento_cierre,
    ...(nat.exige_evidencia ? { tipo_evidencia: bitacora.tipo_evidencia } : {}),
    escalera: 'skill (sellada) → reflejo cuando la senda se repita estable'
  };
}

// ── LEY DE LA EVIDENCIA: el juez universal de PROCEDENCIA (Specification fértil) ──
// La fuente JAMÁS se veta por nombre — se clasifica su naturaleza y se le exige lo suyo.
// Los sets de abajo NO son whitelists (lo desconocido no se rechaza): son ATAJOS de
// clasificación para las naturalezas internas; cualquier fuente no listada es una
// afirmación externa y entra nombrando su evidencia. El único rechazo por esencia es
// la estimación: afirma sobre el mundo SIN dirección de vuelta → IRRECTIFICABLE.
//
// dato = { fuente?, evidencia? | url? | referencia_id? | mercadona_producto_id? }
// → { ok, naturaleza, falta? } — nunca un 'no' pelado: nombra lo que falta (fértil).
const PROCEDENCIAS = {
  derivadas: new Set(['catalogo', 'sub_receta']),        // se re-derivan de internos: su evidencia es el propio cálculo
  testimonio: new Set(['manual']),                       // el humano es la evidencia (quién/cuándo lo da el sistema)
  con_vuelta_propia: new Set(['mercadona']),             // su producto_id cacheado es la dirección de vuelta
  sin_vuelta: new Set(['estimado', 'estimado_llm'])      // afirman sin vuelta posible → jamás pasan como reales
};

function leyDeLaEvidencia(dato = {}) {
  const fuente = String(dato.fuente || '').toLowerCase().trim();
  if (PROCEDENCIAS.derivadas.has(fuente)) return { ok: true, naturaleza: 'DERIVABLE' };
  if (PROCEDENCIAS.testimonio.has(fuente)) return { ok: true, naturaleza: 'TESTIMONIO' };
  if (PROCEDENCIAS.con_vuelta_propia.has(fuente)) return { ok: true, naturaleza: 'AFIRMACION_EXTERNA' };
  if (PROCEDENCIAS.sin_vuelta.has(fuente)) {
    return { ok: false, naturaleza: 'IRRECTIFICABLE',
      falta: 'una estimación no tiene dirección de vuelta — re-resuelve por una fuente real o deja el dato sin valor (honesto)' };
  }
  const ev = dato.evidencia || dato.url || dato.referencia_id || dato.mercadona_producto_id;
  const evOk = (typeof ev === 'string' && ev.trim().length > 0) ||
               (ev && typeof ev === 'object' && Object.keys(ev).length > 0);
  if (evOk) return { ok: true, naturaleza: 'AFIRMACION_EXTERNA' };
  return { ok: false, naturaleza: 'AFIRMACION_EXTERNA',
    falta: `la fuente '${dato.fuente || '(sin fuente)'}' afirma sobre el mundo sin dirección de vuelta — nombra tu evidencia (url · referencia_id) y entras` };
}

module.exports = { NATURALEZAS, NATURALEZA_IDS, PROCEDENCIAS, clasificar, descomponer, circuloCerrado, sellarSenda, leyDeLaEvidencia };
