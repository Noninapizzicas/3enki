#!/usr/bin/env node
/**
 * spec-maker.js — REFLEJO de piel-del-sistema.
 *
 * Convierte la anatomía cruda de un proyecto en un UI-SPEC determinista.
 * No hay LLM aquí. Misma entrada → misma salida. Sin I/O, sin red.
 *
 * Input:  { identidad, dominios[], capacidades[], cupulas[], marca? }
 * Output: { esquema, marca, nav[], secciones[], operaciones[] }
 *
 * Uso:
 *   node spec-maker.js < anatomia.json    # CLI
 *   const spec = makeSpec(anatomia);      # require
 */

'use strict';

// ── Valores por defecto ──
const COLORES_BASE = Object.freeze({
  fondo: '#f5f5f5',
  texto: '#333333',
  acento: '#0066cc'
});

const FUENTE_BASE = 'system-ui, sans-serif';

// ── Utilidades de texto ──
function aId(raw) {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function aTitulo(raw) {
  if (!raw) return '';
  const t = String(raw).replace(/[_-]+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : raw;
}

// ── Extraer campos desde un schema de parámetros ──
function extraerCampos(schema) {
  if (!schema || !schema.properties || typeof schema.properties !== 'object') return [];

  const props = schema.properties;
  const reqs = new Set(Array.isArray(schema.required) ? schema.required : []);

  return Object.keys(props).map(k => ({
    nombre: k,
    tipo: (props[k] && props[k].type) || 'string',
    obligatorio: reqs.has(k),
    ayuda: (props[k] && props[k].description) || ''
  }));
}

// ── Generar el UI-SPEC ──
function makeSpec(entrada = {}) {
  const identidad = entrada.identidad || {};
  const dominios = Array.isArray(entrada.dominios) ? entrada.dominios : [];
  const capacidades = Array.isArray(entrada.capacidades) ? entrada.capacidades : [];
  lasCupulas = Array.isArray(entrada.cupulas) ? entrada.cupulas : [];

  // 1. Marca: desde identidad, desde parámetro, o defaults
  const marcaEntrada = entrada.marca || identidad.marca || {};
  const marca = {
    nombre: identidad.name || identidad.nombre || '(proyecto)',
    tipo: identidad.tipo || identidad.type || null,
    colores: { ...COLORES_BASE, ...(marcaEntrada.colores || {}) },
    fuentes: marcaEntrada.fuentes || FUENTE_BASE,
    logo: marcaEntrada.logo || null
  };

  const secciones = [];

  // 2. Secciones de datos: una por dominio activo
  for (const d of dominios) {
    const clave = d.clave || d.id || d.titulo;
    if (!clave) continue;
    secciones.push({
      id: aId(clave),
      etiqueta: d.titulo || aTitulo(clave),
      tipo: 'datos',
      resumen: d.resumen || '',
      preview: d.muestra !== undefined ? d.muestra : (d.sample !== undefined ? d.sample : null)
    });
  }

  // 3. Operaciones: desde las capacidades del bus
  const operaciones = capacidades
    .filter(c => c && c.name)
    .map(c => ({
      nombre: c.name,
      dominio: c.name.includes('.') ? c.name.split('.')[0] : (c.tipo || 'general'),
      clase: c.tipo || 'tool',
      descripcion: c.descripcion || c.description || '',
      parametros: extraerCampos(c.request_shape || c.parameters)
    }))
    .sort((a, b) => {
      if (a.dominio < b.dominio) return -1;
      if (a.dominio > b.dominio) return 1;
      return a.nombre.localeCompare(b.nombre);
    });

  if (operaciones.length) {
    secciones.push({
      id: 'panel',
      etiqueta: 'Acciones',
      tipo: 'operaciones',
      total: operaciones.length
    });
  }

  // 4. Inventario de cúpulas
  const items = lasCupulas
    .filter(c => c && (c.id || c.tema))
    .map(c => ({
      id: aId(c.id || c.tema),
      nombre: c.tema || c.id,
      clase: c.tipo || '',
      entradas: c.notas_count || 0
    }));

  if (items.length) {
    secciones.push({
      id: 'inventario',
      etiqueta: 'Inventario',
      tipo: 'inventario',
      items
    });
  }

  // 5. Navegación: derivada de las secciones, mismo orden
  const nav = secciones.map(s => ({
    id: s.id,
    texto: s.etiqueta
  }));

  return {
    esquema: 'piel-spec-v1',
    marca,
    nav,
    secciones,
    operaciones
  };
}

module.exports = { makeSpec, extraerCampos, COLORES_BASE };

// ── CLI ──
if (require.main === module) {
  let buffer = '';
  process.stdin.on('data', c => buffer += c);
  process.stdin.on('end', () => {
    let entrada = {};
    try {
      entrada = buffer.trim() ? JSON.parse(buffer) : {};
    } catch (e) {
      console.error('spec-maker: JSON inválido —', e.message);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(makeSpec(entrada), null, 2) + '\n');
  });
}
