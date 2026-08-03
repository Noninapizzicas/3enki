/**
 * planos — REFLEJO JS: generador de planos CAD (DXF abierto + SVG para visualizar).
 *
 * Entrada: { plan: { nombre, unidades, capas[], entidades[], cotas? }, formato }
 * Entidades: rect {x,y,ancho,alto} · circulo {cx,cy,radio} · linea {x1,y1,x2,y2}
 *            arco {cx,cy,radio,angulo_inicio,angulo_fin} · texto {x,y,valor,altura}
 * Con cotas:true (o por entidad) dibuja las DIMENSIONES con su medida → visualizar.
 * Salida: archivo(s) en data/planos/ + contenido para previsualizar en el chat.
 * Determinista: una respuesta correcta computable → reflejo puro (patrón costeador).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// Colores de capa → ACI (DXF). Suficiente para planos de taller.
const ACI = { rojo: 1, rojo_oscuro: 1, amarillo: 2, verde: 3, cian: 4, azul: 5, magenta: 6, blanco: 7, gris: 8, negro: 7 };
const SUFIX = { mm: 'mm', cm: 'cm', m: 'm' };
const r2 = (n) => Math.round(n * 100) / 100;

class PlanosReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'planos';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  onGenerarRequest(e) { return this._atender(e, 'generar', 'planos.generar.response', d => this._generar(d)); }

  // ── VALIDACIÓN (contrato tipado) ──
  _validar(plan) {
    const motivos = [];
    if (!plan || typeof plan !== 'object') return ['plan requerido'];
    if (!plan.nombre || typeof plan.nombre !== 'string') motivos.push('plan.nombre requerido');
    if (plan.unidades && !SUFIX[plan.unidades]) motivos.push(`plan.unidades debe ser ${Object.keys(SUFIX).join('|')}`);
    if (!Array.isArray(plan.entidades)) motivos.push('plan.entidades debe ser un array');
    else if (plan.entidades.length === 0) motivos.push('plan.entidades vacío — no hay nada que dibujar');
    else {
      for (let i = 0; i < plan.entidades.length; i++) {
        const e = plan.entidades[i];
        if (!e || typeof e !== 'object') { motivos.push(`entidades[${i}] no es objeto`); continue; }
        const t = e.tipo;
        if (!['rect', 'circulo', 'linea', 'arco', 'texto'].includes(t)) { motivos.push(`entidades[${i}].tipo '${t}' no soportado`); continue; }
        if (t === 'rect' && (!isFinite(e.x) || !isFinite(e.y) || !(e.ancho > 0) || !(e.alto > 0))) motivos.push(`entidades[${i}] rect necesita x,y,ancho>0,alto>0`);
        if (t === 'circulo' && (!isFinite(e.cx) || !isFinite(e.cy) || !(e.radio > 0))) motivos.push(`entidades[${i}] circulo necesita cx,cy,radio>0`);
        if (t === 'linea' && (!isFinite(e.x1) || !isFinite(e.y1) || !isFinite(e.x2) || !isFinite(e.y2))) motivos.push(`entidades[${i}] linea necesita x1,y1,x2,y2`);
        if (t === 'arco' && (!isFinite(e.cx) || !isFinite(e.cy) || !(e.radio > 0) || !isFinite(e.angulo_inicio) || !isFinite(e.angulo_fin))) motivos.push(`entidades[${i}] arco necesita cx,cy,radio,angulo_inicio,angulo_fin`);
        if (t === 'texto' && (!isFinite(e.x) || !isFinite(e.y) || typeof e.valor !== 'string')) motivos.push(`entidades[${i}] texto necesita x,y,valor`);
      }
    }
    return motivos;
  }

  // ── BOUNDING BOX (para el viewBox SVG + margen de cotas) ──
  _bbox(entidades) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of entidades) {
      if (e.tipo === 'rect') { minX = Math.min(minX, e.x); minY = Math.min(minY, e.y); maxX = Math.max(maxX, e.x + e.ancho); maxY = Math.max(maxY, e.y + e.alto); }
      if (e.tipo === 'circulo') { minX = Math.min(minX, e.cx - e.radio); minY = Math.min(minY, e.cy - e.radio); maxX = Math.max(maxX, e.cx + e.radio); maxY = Math.max(maxY, e.cy + e.radio); }
      if (e.tipo === 'linea') { minX = Math.min(minX, e.x1, e.x2); minY = Math.min(minY, e.y1, e.y2); maxX = Math.max(maxX, e.x1, e.x2); maxY = Math.max(maxY, e.y1, e.y2); }
      if (e.tipo === 'arco') { minX = Math.min(minX, e.cx - e.radio); minY = Math.min(minY, e.cy - e.radio); maxX = Math.max(maxX, e.cx + e.radio); maxY = Math.max(maxY, e.cy + e.radio); }
      if (e.tipo === 'texto') { minX = Math.min(minX, e.x); minY = Math.min(minY, e.y - (e.altura || 20)); maxX = Math.max(maxX, e.x + (e.valor || '').length * (e.altura || 20) * 0.6); maxY = Math.max(maxY, e.y); }
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
    const margen = Math.max((maxX - minX) * 0.15, 40);   // margen para cotas
    return { minX: minX - margen, minY: minY - margen, maxX: maxX + margen, maxY: maxY + margen, w: maxX - minX + margen * 2, h: maxY - minY + margen * 2 };
  }

  // ── COTAS: genera entidades de dimensión (línea de cota + medida) ──
  _cotasDe(e, unidades, out) {
    const suf = SUFIX[unidades] || '';
    const off = 12;
    if (e.tipo === 'rect') {
      // cota inferior (ancho) + cota derecha (alto)
      const y0 = e.y - off, x0 = e.x + e.ancho + off;
      out.push({ tipo: 'linea', x1: e.x, y1: y0, x2: e.x + e.ancho, y2: y0, capa: 'cota' });
      out.push({ tipo: 'linea', x1: e.x, y1: e.y, x2: e.x, y2: y0, capa: 'cota' });
      out.push({ tipo: 'linea', x1: e.x + e.ancho, y1: e.y, x2: e.x + e.ancho, y2: y0, capa: 'cota' });
      out.push({ tipo: 'texto', x: e.x + e.ancho / 2, y: y0 - 6, valor: `${r2(e.ancho)}${suf}`, altura: 14, capa: 'cota' });
      out.push({ tipo: 'linea', x1: x0, y1: e.y, x2: x0, y2: e.y + e.alto, capa: 'cota' });
      out.push({ tipo: 'linea', x1: e.x, y1: e.y, x2: x0, y2: e.y, capa: 'cota' });
      out.push({ tipo: 'linea', x1: e.x, y1: e.y + e.alto, x2: x0, y2: e.y + e.alto, capa: 'cota' });
      out.push({ tipo: 'texto', x: x0 + 6, y: e.y + e.alto / 2, valor: `${r2(e.alto)}${suf}`, altura: 14, capa: 'cota' });
    } else if (e.tipo === 'linea') {
      const dx = e.x2 - e.x1, dy = e.y2 - e.y1, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * off, ny = dx / len * off;
      const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
      out.push({ tipo: 'linea', x1: e.x1 + nx, y1: e.y1 + ny, x2: e.x2 + nx, y2: e.y2 + ny, capa: 'cota' });
      out.push({ tipo: 'texto', x: mx + nx, y: my + ny - 6, valor: `${r2(len)}${suf}`, altura: 14, capa: 'cota' });
    } else if (e.tipo === 'circulo') {
      out.push({ tipo: 'texto', x: e.cx + e.radio + 6, y: e.cy, valor: `Ø${r2(e.radio * 2)}${suf}`, altura: 14, capa: 'cota' });
    }
  }

  // ── DXF R12 (texto ASCII, lo abren AutoCAD/LibreCAD/Fusion/CNC) ──
  _dxf(plan, entidades, capas) {
    const L = [];
    const line = (code, val) => L.push(String(code), String(val));
    const capaDe = (e) => (e.capa || '0');
    const capasUsadas = [...new Set(entidades.map(capaDe))];

    line(0, 'SECTION'); line(2, 'HEADER'); line(9, '$ACADVER'); line(1, 'AC1009'); line(0, 'ENDSEC');
    line(0, 'SECTION'); line(2, 'TABLES'); line(0, 'TABLE'); line(2, 'LAYER'); line(70, capasUsadas.length);
    for (const c of capasUsadas) {
      line(0, 'LAYER'); line(2, c); line(70, 0);
      const aci = ACI[(capas[c] || '').toLowerCase()] || 7;
      line(62, aci); line(6, 'CONTINUOUS');
    }
    line(0, 'ENDTAB'); line(0, 'ENDSEC');
    line(0, 'SECTION'); line(2, 'ENTITIES');
    for (const e of entidades) {
      const c = capaDe(e);
      if (e.tipo === 'rect') {
        for (const [x1, y1, x2, y2] of [[e.x, e.y, e.x + e.ancho, e.y], [e.x + e.ancho, e.y, e.x + e.ancho, e.y + e.alto], [e.x + e.ancho, e.y + e.alto, e.x, e.y + e.alto], [e.x, e.y + e.alto, e.x, e.y]]) {
          line(0, 'LINE'); line(8, c); line(10, x1); line(20, y1); line(11, x2); line(21, y2);
        }
      } else if (e.tipo === 'circulo') {
        line(0, 'CIRCLE'); line(8, c); line(10, e.cx); line(20, e.cy); line(40, e.radio);
      } else if (e.tipo === 'linea') {
        line(0, 'LINE'); line(8, c); line(10, e.x1); line(20, e.y1); line(11, e.x2); line(21, e.y2);
      } else if (e.tipo === 'arco') {
        line(0, 'ARC'); line(8, c); line(10, e.cx); line(20, e.cy); line(40, e.radio); line(50, e.angulo_inicio); line(51, e.angulo_fin);
      } else if (e.tipo === 'texto') {
        line(0, 'TEXT'); line(8, c); line(10, e.x); line(20, e.y); line(40, e.altura || 20); line(1, e.valor || '');
      }
    }
    line(0, 'ENDSEC'); line(0, 'EOF');
    return L.join('\n');
  }

  // ── SVG (visualizar en navegador/chat) ──
  _svg(plan, entidades, bbox) {
    const W = 800, H = 600;
    const sx = W / bbox.w, sy = H / bbox.h, s = Math.min(sx, sy);
    const ox = bbox.minX, oy = bbox.minY;
    const X = (x) => r2((x - ox) * s);
    const Y = (y) => r2(H - (y - oy) * s);   // y matemática ↑ → SVG ↓
    const colorDe = (e) => (plan.capas || []).find(c => c.nombre === e.capa)?.color || (e.capa === 'cota' ? '#d97706' : '#111827');
    const grosorDe = (e) => (e.capa === 'cota' ? 1 : 1.6);

    let body = '';
    for (const e of entidades) {
      const col = colorDe(e), g = grosorDe(e);
      if (e.tipo === 'rect') {
        body += `<rect x="${X(e.x)}" y="${Y(e.y + e.alto)}" width="${r2(e.ancho * s)}" height="${r2(e.alto * s)}" fill="none" stroke="${col}" stroke-width="${g}"/>\n`;
      } else if (e.tipo === 'circulo') {
        body += `<circle cx="${X(e.cx)}" cy="${Y(e.cy)}" r="${r2(e.radio * s)}" fill="none" stroke="${col}" stroke-width="${g}"/>\n`;
      } else if (e.tipo === 'linea') {
        body += `<line x1="${X(e.x1)}" y1="${Y(e.y1)}" x2="${X(e.x2)}" y2="${Y(e.y2)}" stroke="${col}" stroke-width="${g}"/>\n`;
      } else if (e.tipo === 'arco') {
        const a0 = e.angulo_inicio * Math.PI / 180, a1 = e.angulo_fin * Math.PI / 180;
        const P = (a) => [X(e.cx + e.radio * Math.cos(a)), Y(e.cy + e.radio * Math.sin(a))];
        const [px, py] = P(a0), [qx, qy] = P(a1);
        const large = (e.angulo_fin - e.angulo_inicio) > 180 ? 1 : 0;
        body += `<path d="M ${px} ${py} A ${r2(e.radio * s)} ${r2(e.radio * s)} 0 ${large} 1 ${qx} ${qy}" fill="none" stroke="${col}" stroke-width="${g}"/>\n`;
      } else if (e.tipo === 'texto') {
        body += `<text x="${X(e.x)}" y="${Y(e.y)}" font-size="${r2((e.altura || 20) * s * 0.8)}" fill="${col}" font-family="sans-serif">${String(e.valor).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>\n`;
      }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${body}</svg>\n`;
  }

  // ── GENERAR ──
  async _generar({ plan, formato } = {}) {
    const motivos = this._validar(plan);
    if (motivos.length) return { status: 422, data: { ok: false, motivo: 'PLAN_INVALIDO', errores: motivos } };
    const f = (formato || 'ambos').toLowerCase();
    if (!['dxf', 'svg', 'ambos'].includes(f)) return { status: 422, data: { ok: false, motivo: 'FORMATO_INVALIDO', errores: [`formato debe ser dxf|svg|ambos`] } };

    const nombre = plan.nombre.replace(/[^a-zA-Z0-9-_]/g, '_');
    const cotas = plan.cotas === true;
    const entidades = [];
    for (const e of plan.entidades) {
      entidades.push(e);
      if (cotas || e.cotas === true) this._cotasDe(e, plan.unidades, entidades);
    }

    const dir = path.join(process.cwd(), 'data', 'planos');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* best-effort */ }
    const urlBase = (plan.url_base || '').replace(/\/$/, '');
    const salida = { ok: true, nombre: plan.nombre, unidades: plan.unidades || 'mm', entidades: entidades.length, archivos: [] };

    if (f === 'dxf' || f === 'ambos') {
      const archivo = path.join(dir, `${nombre}.dxf`);
      const contenido = this._dxf(plan, entidades, Object.fromEntries((plan.capas || []).map(c => [c.nombre, c.color])));
      fs.writeFileSync(archivo, contenido);
      salida.archivos.push({ formato: 'dxf', archivo, url: urlBase ? `${urlBase}/${nombre}.dxf` : null, bytes: contenido.length });
    }
    if (f === 'svg' || f === 'ambos') {
      const archivo = path.join(dir, `${nombre}.svg`);
      const bbox = this._bbox(entidades);
      const contenido = this._svg(plan, entidades, bbox);
      fs.writeFileSync(archivo, contenido);
      salida.archivos.push({ formato: 'svg', archivo, url: urlBase ? `${urlBase}/${nombre}.svg` : null, bytes: contenido.length, svg: contenido });
    }

    // AUDIT de dominio — ningún plano nace invisible (la propiocepción lo capta).
    try {
      this.eventBus?.publish('planos.generado', {
        nombre: plan.nombre, unidades: plan.unidades || 'mm', entidades: entidades.length,
        archivos: salida.archivos.map(a => ({ formato: a.formato, archivo: a.archivo, url: a.url, bytes: a.bytes })),
        timestamp: new Date().toISOString()
      });
    } catch (_) { /* best-effort */ }

    return { status: 200, data: salida };
  }
}

module.exports = PlanosReflejo;
