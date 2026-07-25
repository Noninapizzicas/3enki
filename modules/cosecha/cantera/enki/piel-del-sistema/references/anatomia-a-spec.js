/**
 * anatomia-a-spec.js — REFLEJO de uiwebv2, adoptado por piel-del-sistema.
 *
 * Función pura: anatomía del proyecto → UI-SPEC determinista.
 * Mismo input → mismo output. Sin fs, sin bus, sin red.
 * Testeable en un assert.
 *
 * Código original en: .claude/skills/uiwebv2/anatomia-a-spec.js
 * Tests en: tests/unit/uiwebv2__anatomia-a-spec.test.js (7/7 OK)
 *
 * Uso:
 *   const { buildSpec } = require('./anatomia-a-spec');
 *   const spec = buildSpec(anatomia);
 */
'use strict';

const MARCA_DEFAULT = Object.freeze({
  colores: { fondo: '#f5f5f5', texto: '#333333', acento: '#0066cc' },
  fuentes: 'system-ui, sans-serif',
  logo: null
});

const slug = (s) => String(s || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const titulo = (s) => {
  const t = String(s || '').replace(/[_-]+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : String(s || '');
};

function camposDesdeShape(shape) {
  const props = shape && shape.properties;
  if (!props || typeof props !== 'object') return [];
  const req = new Set(Array.isArray(shape.required) ? shape.required : []);
  return Object.keys(props).map((k) => ({
    nombre: k,
    tipo: props[k] && props[k].type ? props[k].type : 'string',
    requerido: req.has(k),
    descripcion: (props[k] && props[k].description) || ''
  }));
}

function buildSpec(input = {}) {
  const identidad = input.identidad || {};
  const dominios  = Array.isArray(input.dominios) ? input.dominios : [];
  const capacidades = Array.isArray(input.capacidades) ? input.capacidades : [];
  const cupulas   = Array.isArray(input.cupulas) ? input.cupulas : [];

  const marcaIn = input.marca || identidad.marca || {};
  const marca = {
    nombre: identidad.name || identidad.nombre || 'Proyecto',
    tipo: identidad.tipo || identidad.type || null,
    colores: { ...MARCA_DEFAULT.colores, ...(marcaIn.colores || {}) },
    fuentes: marcaIn.fuentes || MARCA_DEFAULT.fuentes,
    logo: marcaIn.logo || MARCA_DEFAULT.logo
  };

  const secciones = [];

  for (const d of dominios) {
    const clave = d.clave || d.id || d.titulo;
    if (!clave) continue;
    secciones.push({
      id: slug(clave), titulo: d.titulo || titulo(clave), tipo: 'datos',
      resumen: d.resumen || '',
      muestra: d.muestra != null ? d.muestra : (d.sample != null ? d.sample : null)
    });
  }

  const operaciones = capacidades
    .filter((c) => c && c.name)
    .map((c) => ({
      name: c.name,
      dominio: c.name.includes('.') ? c.name.split('.')[0] : (c.tipo || 'general'),
      tipo: c.tipo || 'tool',
      descripcion: c.descripcion || c.description || '',
      campos: camposDesdeShape(c.request_shape || c.parameters)
    }))
    .sort((a, b) => a.dominio.localeCompare(b.dominio) || a.name.localeCompare(b.name));

  if (operaciones.length) {
    secciones.push({ id: 'operaciones', titulo: 'Operaciones', tipo: 'operaciones', total: operaciones.length });
  }

  const inventario = cupulas
    .filter((c) => c && (c.id || c.tema))
    .map((c) => ({ id: slug(c.id || c.tema), tema: c.tema || c.id, tipo: c.tipo || '', notas: c.notas_count || 0 }));
  if (inventario.length) {
    secciones.push({ id: 'cupulas', titulo: 'Cúpulas', tipo: 'inventario', items: inventario });
  }

  const nav = secciones.map((s) => ({ id: s.id, label: s.titulo }));

  return { esquema: 'ui-spec-v1', marca, nav, secciones, operaciones };
}

module.exports = { buildSpec, camposDesdeShape, MARCA_DEFAULT };

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input = {};
    try { input = raw.trim() ? JSON.parse(raw) : {}; }
    catch (e) { console.error('anatomia-a-spec: JSON inválido en stdin:', e.message); process.exit(1); }
    process.stdout.write(JSON.stringify(buildSpec(input), null, 2) + '\n');
  });
}
