/**
 * prisma/producir — REFLEJO JS: el MOTOR que PROYECTA un COMPUESTO a un OBJETIVO FÍSICO.
 *
 * El órgano que la hoja masa demostró: masa construyó 3 calculadoras de producción
 * (gramaje por formato, rendimiento, reamasado) que son la MISMA lógica que necesita
 * cualquier fabricante de productos compuestos — mortero (cemento + arena A + arena B,
 * por sacos), jarabe (concentrado + agua, por litros), fórmula química, pre-mezcla —
 * con un solo cambio: la NOMENCLATURA y la REGLA DE ESCALA.
 *
 * Regla rectora: la lógica es universal; los nombres son del dominio que la bautizó.
 * masa pasa a ser una INSTANCIA de este órgano (compuesto 'masa-pan' + formatos + políticas).
 *
 * Reparto de la casa: custodio GUARDA · motor CALCULA · puente CONECTA · actor INTERPRETA.
 * PRODUCIR es un MOTOR: sin store, lee compuestos + insumos por RPC (patrón costeador),
 * y emite producir.proyeccion.calculada. Nunca decide por el negocio: un compuesto sin
 * regla de escala declarada responde pendiente_declaracion — NO se inventa el factor.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const U = require('../../_shared/prisma-unidades');   // conversor PURO: unidades por insumo (g→kg, ml→l, densidad)

const nowISO = () => new Date().toISOString();
const ROUND6 = (n) => Math.round(n * 1e6) / 1e6;      // estabilidad numérica (patrón masa: round6)

class PrismaProducirReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'producir';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  onProyectarRequest(e)   { return this._atender(e, 'proyectar', 'producir.proyectar.response', d => this._proyectar(d)); }
  onRendimientoRequest(e) { return this._atender(e, 'rendimiento', 'producir.rendimiento.response', d => this._rendimiento(d)); }
  onValidarRequest(e)     { return this._atender(e, 'validar', 'producir.validar.response', d => this._validar(d)); }

  // ── REGLAS DE ESCALA (el registro — añadir una regla = añadir una entrada, sin tocar handlers) ──
  //    Cada entrada: { id, schema (qué declara el formato), descripcion, factor(comp, formato, objetivo) → factor_escala | null }
  //    factor_escala multiplica la composición BASE (por unidad de producción) para llegar al objetivo.
  //    null = no se puede resolver → pendiente_declaracion (NUNCA se inventa).
  ESCALAS = {
    // la composición base ES la unidad de producción (1 saco / 1 bola / 1 litro): pido N → N×1
    lineal: {
      descripcion: 'proporciones por unidad de producción (jarabe, mortero, composición base)',
      factor: (f, obj) => 1,
    },
    // escala por SUPERFICIE: la cantidad crece con el área (diámetro²), no lineal.
    // referencia: formato declarado con cantidad + diámetro; pedido: diámetro distinto sin cantidad → interpola.
    area: {
      descripcion: 'la cantidad escala con el ÁREA (diam²): disco 33cm=315g → 30cm≈260g (masa)',
      factor: (f, obj, ref) => {
        if (!ref || !ref.diametro_cm || !(f && f.diametro_cm)) return null;
        return (f.diametro_cm ** 2) / (ref.diametro_cm ** 2);
      },
    },
    // proporciones fijas por lote: el objetivo ES el número de lotes (mortero 1:4, pre-mezcla)
    fija: {
      descripcion: 'proporciones fijas por lote (mortero 1:4, pre-mezcla): el objetivo es el nº de lotes',
      factor: (f, obj) => 1,
    },
    // el objetivo viene en otra dimensión y el compuesto declara densidad: masa = volumen × ρ
    densidad: {
      descripcion: 'objetivo en volumen → masa por densidad declarada (masa = vol × ρ)',
      factor: (f, obj, ref, comp) => {
        const dens = comp && comp.naturalezas && comp.naturalezas.densidad_g_ml;
        if (!dens || !obj.unidad || !comp.unidad_produccion) return null;
        const conv = U.convertir(obj.cantidad, obj.unidad, comp.unidad_produccion, dens);
        return conv == null ? null : conv / obj.cantidad;
      },
    },
  };

  // ── resuelve el FACTOR de escala para el objetivo (formato declarado → interpola → default → PENDIENTE) ──
  //    Devuelve { factor, desc } o { factor: null, motivo } (pendiente_declaracion).
  _resolverFactor(comp, objetivo) {
    const formatos = comp.formatos || [];
    const reglaDefault = comp.regla_escala_default || 'lineal';

    // ── con FORMATO (id declarado en comp.formatos) ──
    if (typeof objetivo.formato === 'string') {
      const f = formatos.find(x => x.id === objetivo.formato);
      if (!f) return { factor: null, motivo: `formato '${objetivo.formato}' no declarado en el compuesto` };
      // el formato DECLARADO es la unidad de producción: pido N → N × 1
      if (f.cantidad > 0) {
        return { factor: objetivo.cantidad, desc: `formato '${f.id}' (${f.cantidad}${f.unidad || ''}) × ${objetivo.cantidad}` };
      }
      // formato sin cantidad: necesita regla area contra una referencia con cantidad + diámetro
      const regla = this.ESCALAS[f.regla] || this.ESCALAS[reglaDefault];
      const ref = formatos.find(x => x.cantidad > 0 && x.diametro_cm);
      const esc = regla.factor(f, objetivo, ref, comp);
      if (esc == null) return { factor: null, motivo: `formato '${f.id}' sin cantidad y sin referencia de escala (área)` };
      return { factor: ROUND6(objetivo.cantidad * esc), desc: `formato '${f.id}' regla ${f.regla || reglaDefault} ×${ROUND6(esc)} × ${objetivo.cantidad}` };
    }

    // ── sin FORMATO: la composición es por unidad_produccion ──
    const up = comp.unidad_produccion;
    if (!up) return { factor: null, motivo: 'el compuesto no declara unidad_produccion (declárala o usa un formato)' };
    if (objetivo.unidad && objetivo.unidad !== up) {
      const regla = this.ESCALAS[comp.regla_escala_default || 'densidad'];
      const esc = regla.factor(null, objetivo, null, comp);
      if (esc == null) return { factor: null, motivo: `objetivo.unidad '${objetivo.unidad}' ≠ unidad_produccion '${up}' y sin densidad para convertir` };
      return { factor: ROUND6(objetivo.cantidad * esc), desc: `${objetivo.cantidad}${objetivo.unidad} → ${ROUND6(objetivo.cantidad * esc)}${up} por densidad` };
    }
    return { factor: objetivo.cantidad, desc: `${objetivo.cantidad} ${up || ''}` };
  }

  // ── resuelve los componentes escalados a TOTALS por insumo en SU unidad base (el desmembramiento) ──
  //    Cada componente {ref, cantidad, unidad} → insumo.unidad_base (vía conversor, con densidad).
  //    Lo que no reconcilia unidades se agrega por (ref, unidad) tal cual — NO se inventa la conversión.
  async _desmembrar(project_id, componentes) {
    const porInsumo = new Map();
    for (const c of componentes || []) {
      let cantidad = c.cantidad, unidad = c.unidad;
      const ins = await this._rpc('insumos.get.request', { project_id, insumo_id: c.ref });
      if (ins && ins.status === 200 && ins.data?.insumo) {
        const nat = ins.data.insumo.naturalezas || {};
        if (nat.unidad_base && unidad) {
          const conv = U.convertir(c.cantidad, c.unidad, nat.unidad_base, nat.densidad_g_ml);
          if (conv != null) { cantidad = conv; unidad = nat.unidad_base; }
        }
      }
      const k = `${c.ref}|${unidad}`;
      if (!porInsumo.has(k)) porInsumo.set(k, { ref: c.ref, cantidad: 0, unidad });
      porInsumo.get(k).cantidad = ROUND6(porInsumo.get(k).cantidad + cantidad);
    }
    return [...porInsumo.values()];
  }

  // ── el MOTOR: compuesto + objetivo físico → componentes escalados en SU unidad + totales por insumo ──
  async _proyectar({ project_id, compuesto_id, objetivo } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!compuesto_id) return this._invalid('compuesto_id');

    const g = await this._rpc('compuestos.get.request', { project_id, compuesto_id });
    if (!g || g.status !== 200 || !g.data?.compuesto) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'compuesto no existe', { entity_type: 'compuesto', id: compuesto_id });
    }
    const comp = g.data.compuesto;

    const freno = this._validar(comp, objetivo);
    if (!freno.valid) return this._invalid(freno.error || 'objetivo inválido');

    const { factor, desc, motivo } = this._resolverFactor(comp, objetivo || {});
    if (factor == null) {
      return { status: 200, data: { status: 'pendiente_declaracion', motivo, compuesto_id } };
    }

    const componentes = (comp.componentes || []).map(c => ({
      ref: c.ref,
      cantidad: ROUND6((c.cantidad || 0) * factor),
      unidad: c.unidad,
    }));
    const totales = await this._desmembrar(project_id, componentes);

    this.eventBus?.publish?.('producir.proyeccion.calculada', {
      project_id, compuesto_id, objetivo, factor, totales, timestamp: nowISO(),
    });
    this.metrics?.increment?.('producir.proyecciones.total', {});

    return { status: 200, data: { status: 'calculada', factor, desc, componentes, totales } };
  }

  // ── la INVERSA: con lo que tengo en stock → cuántas unidades de producción salen (floor) + sobrante ──
  async _rendimiento({ project_id, compuesto_id, stock } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!compuesto_id) return this._invalid('compuesto_id');
    if (!Array.isArray(stock)) return this._invalid('stock (array [{ref, cantidad, unidad}])');

    const g = await this._rpc('compuestos.get.request', { project_id, compuesto_id });
    if (!g || g.status !== 200 || !g.data?.compuesto) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'compuesto no existe', { entity_type: 'compuesto', id: compuesto_id });
    }
    const comp = g.data.compuesto;
    if (!comp.unidad_produccion) {
      return { status: 200, data: { status: 'pendiente_declaracion', motivo: 'el compuesto no declara unidad_produccion', compuesto_id } };
    }

    // necesidad de componentes por 1 unidad de producción (la proyección más simple, silenciosa)
    const necesidad = await this._proyectar({ project_id, compuesto_id, objetivo: { cantidad: 1, unidad: comp.unidad_produccion } });
    if (necesidad.status !== 200 || necesidad.data?.status !== 'calculada') {
      return { status: 200, data: { status: 'pendiente_declaracion', motivo: necesidad.data?.motivo || 'composición no proyectable', compuesto_id } };
    }

    // cuántas unidades cubre el stock: min sobre componentes de (stock_en_unidad_del_componente / necesidad)
    const porRef = new Map((necesidad.data.componentes || []).map(c => [c.ref, c]));
    let unidades = Infinity;
    const detalle = [];
    for (const s of stock || []) {
      const n = porRef.get(s.ref);
      if (!n) continue;                                    // stock de algo que no es componente → no limita
      let cant = s.cantidad;
      if (s.unidad && n.unidad && s.unidad !== n.unidad) {
        const conv = U.convertir(s.cantidad, s.unidad, n.unidad, null);
        if (conv == null) continue;                        // no reconcilia → esa ref no se puede juzgar
        cant = conv;
      }
      if (n.cantidad <= 0) continue;
      const u = cant / n.cantidad;
      detalle.push({ ref: s.ref, cubre: u });
      if (u < unidades) unidades = u;
    }
    if (!isFinite(unidades)) {
      return { status: 200, data: { status: 'pendiente_declaracion', motivo: 'el stock no cubre ningún componente comparable', compuesto_id } };
    }

    const nUnidades = Math.floor(unidades);
    const sobrante = [];
    for (const s of stock || []) {
      const n = porRef.get(s.ref);
      if (!n) continue;
      let cant = s.cantidad;
      if (s.unidad && n.unidad && s.unidad !== n.unidad) {
        const conv = U.convertir(s.cantidad, s.unidad, n.unidad, null);
        if (conv == null) continue;
        cant = conv;
      }
      sobrante.push({ ref: s.ref, cantidad: ROUND6(cant - nUnidades * n.cantidad), unidad: n.unidad });
    }

    this.metrics?.increment?.('producir.rendimientos.total', {});
    return { status: 200, data: { status: 'calculada', unidades: nUnidades, detalle, sobrante, unidad_produccion: comp.unidad_produccion } };
  }

  // ── FRENO: función pura (patrón escandallo.validar) — unidad coherente, formato conocido, cantidad > 0 ──
  _validar(comp, objetivo) {
    const errors = [];
    if (!objetivo || typeof objetivo !== 'object') return { valid: false, error: 'INVALID_INPUT', errors: ['objetivo requerido'] };
    if (!(objetivo.cantidad > 0)) errors.push('objetivo.cantidad debe ser > 0');
    if (typeof objetivo.formato === 'string' && comp) {
      const formatos = comp.formatos || [];
      if (formatos.length && !formatos.some(f => f.id === objetivo.formato)) errors.push(`formato '${objetivo.formato}' desconocido`);
    }
    if (typeof objetivo.formato === 'object' && !objetivo.formato.cantidad && !objetivo.formato.diametro_cm) {
      errors.push('formato objeto necesita cantidad o diametro_cm');
    }
    if (errors.length) return { valid: false, error: 'INVALID_INPUT', errors };
    return { valid: true, errors: [] };
  }
}

module.exports = PrismaProducirReflejo;
