'use strict';

/**
 * BLOQUE carta — su identidad es lo que se vende hoy. Dos formas:
 *   · carta.dia    → una ficha, cadencia 'dia' (cambia con la fecha, no con el reloj)
 *   · carta.vitrina→ el carrusel: fotos y fichas mezcladas, cadencia 'tanda'
 *
 * Fuente: proyectarCartaPublica (carta-digital) — la MISMA proyección que la PWA,
 * no una copia. Aquí solo se cura (qué entra) y se da forma (cómo se cuenta).
 * La curación la manda el cableado del proyecto, no este fichero.
 */

const { euros } = require('../contrato');

/* Los 14 alérgenos del Anexo II, en palabra. La pantalla NO traduce: si el
   bloque manda el código crudo, el render no debe inventarse la etiqueta. */
const ALERGENOS = {
  gluten: 'gluten', crustaceos: 'crustáceos', huevos: 'huevo', pescado: 'pescado',
  cacahuetes: 'cacahuetes', soja: 'soja', lacteos: 'leche', frutos_cascara: 'frutos de cáscara',
  apio: 'apio', mostaza: 'mostaza', sesamo: 'sésamo', sulfitos: 'sulfitos',
  altramuces: 'altramuces', moluscos: 'moluscos'
};

function alergenosTexto(lista) {
  const t = (Array.isArray(lista) ? lista : [])
    .map(a => ALERGENOS[a] || String(a).replace(/_/g, ' '))
    .filter(Boolean);
  return t.length ? t.join(' · ') : null;
}

function etiquetasDe(p, max) {
  const ing = Array.isArray(p.ingredientes) ? p.ingredientes : [];
  return ing.slice(0, max || 4).map(i => String(i.nombre || i).trim()).filter(Boolean);
}

function argumento(p) {
  const d = (p.descripcion || '').trim();
  // DATO SUCIO CONOCIDO (11-nov-2026): varias fichas de esta carta llevan en
  // `descripcion` un inventario de variantes viejas ("Blues (+cebolla) · Punk (+maíz)").
  // Eso no es una descripción para el cliente: si aparece ese patrón, se usa el
  // gancho o los ingredientes reales. El dato hay que arreglarlo en la carta.
  const esVariantesViejas = /\(\+[^)]*\)/.test(d);
  if (d && !esVariantesViejas) return d;
  const ing = etiquetasDe(p, 5);
  if (ing.length) return ing.join(' · ');
  return null;
}

function ficha(p, seccion, bloque, cadencia, extra) {
  return {
    id: `${bloque}.${p.id}`, bloque, forma: p.imagen ? 'foto' : 'ficha', cadencia,
    titulo: p.nombre,
    subtitulo: argumento(p),
    precio: euros(p.precio),
    imagen: p.imagen || null,
    etiquetas: etiquetasDe(p, 4),
    datos: Object.assign({
      producto_id: p.id,
      seccion,
      alergenos: p.alergenos || [],
      alergenos_texto: alergenosTexto(p.alergenos),
      gancho: p.gancho || null,
      extras_desde: (function () {
        const ex = (p.ingredientes || []).map(i => Number(i.precio_extra)).filter(n => Number.isFinite(n) && n > 0);
        return ex.length ? euros(Math.min(...ex)) : null;
      })()
    }, extra || {})
  };
}

module.exports = {
  id: 'carta',
  cadencia: 'tanda',
  forma: 'ficha',

  piezas(ctx) {
    const cur = ctx.cableado.curacion || {};
    const cat = new Map((ctx.proyeccion.categorias || []).map(c => [c.id, c.nombre]));
    const productos = ctx.proyeccion.productos || [];

    const excluir = new Set(cur.excluir_categorias || []);
    const precioMin = Number(cur.precio_min || 0);

    const candidatos = productos.filter(p =>
      !excluir.has(p.categoria) && Number(p.precio || 0) >= precioMin
    );

    const piezas = [];
    let idDelDia = null;

    // ── zona del día: UNA, elegida por fecha (determinista: mismo día, misma pieza)
    //    Solo si el cableado de ESTE proyecto la tiene cableada. Si no, no se
    //    roba un producto al carrusel para una zona que no existe.
    const hayDia = (ctx.cableado.bloques || []).some(b => b.id === 'carta.dia' && b.activo !== false);
    const diaCfg = cur.dia || {};
    const diaBase = candidatos.filter(p => Number(p.precio || 0) >= Number(diaCfg.precio_min || 0));
    const diaConFoto = diaBase.filter(p => p.imagen);
    const diaCand = (diaCfg.preferir_foto !== false && diaConFoto.length) ? diaConFoto : diaBase;
    if (hayDia && diaCand.length) {
      const fecha = ctx.hoy; // YYYY-MM-DD
      const h = [...fecha].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100000, 7);
      const p = diaCand[h % diaCand.length];
      idDelDia = p.id;
      piezas.push(ficha(p, cat.get(p.categoria) || null, 'carta.dia', 'dia', {
        rotulo: 'Solo hoy',
        vigencia: 'Hasta cerrar'
      }));
    }

    // ── vitrina: el carrusel
    const v = cur.vitrina || {};
    const max = Number(v.max || 12);
    const pesoTope = { foto: Number(v.peso_foto || 3), caro: Number(v.peso_precio_alto || 2), base: Number(v.peso_base || 1) };
    const techo = Number(v.precio_alto || 12);

    const sinDia = candidatos.filter(p => p.id !== idDelDia);
    const puntuadas = sinDia.map((p, i) => ({
      p, i,
      peso: (p.imagen ? pesoTope.foto : 0) + (Number(p.precio || 0) >= techo ? pesoTope.caro : 0) + pesoTope.base
    }));
    puntuadas.sort((a, b) => (b.peso - a.peso) || (a.i - b.i));

    for (const { p } of puntuadas.slice(0, max)) {
      piezas.push(ficha(p, cat.get(p.categoria) || null, 'carta.vitrina', 'tanda'));
    }

    return piezas;
  }
};
