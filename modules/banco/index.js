/**
 * banco — CUSTODIO single-writer del banco de nichos (HOJA 1 del plan-construccion).
 *
 * Contrato: aplica la máquina de estados del candidato (CRUDO→EN_EVALUACION→APROBADO→
 * SELECCIONADO→PUBLICADO, con EN_OBSERVACION por falta de evidencia y RECHAZADO por el
 * dueño), el tope de 100 candidatos con rotación (M6) y el aparcado por falta de
 * evidencia (M10). NO decide: el evaluador evalúa, el dueño confirma (M11).
 *
 * FORMA: REFLEJO + PosPersistencia por proyecto (patrón custodio, gemelo de
 * project-profile). Store: /radar/banco.json (single-writer, fs.write atómico).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const ESTADOS = Object.freeze([
  'CRUDO', 'EN_EVALUACION', 'APROBADO', 'SELECCIONADO', 'PUBLICADO',
  'EN_OBSERVACION', 'RECHAZADO'
]);
const TOPE = 100;                       // M6
const nowISO = () => new Date().toISOString();
const _key = (pid, id) => `${pid}:${id}`;

class BancoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'banco';
    this.version = 'reflejo-0.1.0';
    this.candidatos = new Map();   // `${project_id}:${id}` → candidato
    this.historico = new Map();    // `${project_id}:${id}` → candidato (rotado/rechazado, p6)

    this._persist = new PosPersistencia({
      modulo: this, file: 'banco.json', dir: '/radar',
      snapshot: (pid) => {
        const suyos = (m) => [...m.values()].filter(c => c.project_id === pid);
        return { project_id: pid, candidatos: suyos(this.candidatos), historico: suyos(this.historico) };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        for (const c of (data.candidatos || [])) this.candidatos.set(_key(pid, c.id), c);
        for (const c of (data.historico || [])) this.historico.set(_key(pid, c.id), c);
      }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers RPC ──
  onAnadirRequest(e)      { return this._atender(e, 'anadir', 'banco.anadir.response', d => this._anadir(d)); }
  onObtenerRequest(e)     { return this._atender(e, 'obtener', 'banco.obtener.response', d => this._obtener(d)); }
  onListarRequest(e)      { return this._atender(e, 'listar', 'banco.listar.response', d => this._listar(d)); }
  onAparcarRequest(e)     { return this._atender(e, 'aparcar', 'banco.aparcar.response', d => this._aparcar(d)); }
  onSeleccionarRequest(e) { return this._atender(e, 'seleccionar', 'banco.seleccionar.response', d => this._seleccionar(d)); }
  onPublicarRequest(e)    { return this._atender(e, 'publicar', 'banco.publicar.response', d => this._publicar(d)); }

  // ── Handlers de eventos de dominio (fire-and-forget entrantes) ──
  onVeredictoEmitido(e)   { return this._aplicarVeredicto((e && (e.data || e)) || {}); }
  onVeredictoConfirmado(e){ return this._aplicarConfirmacion((e && (e.data || e)) || {}); }

  // ── PROYECCIONES (dominio) ──

  // _anadir: crea candidato(s) CRUDO. Acepta { señales: [...] } (reloj) o un candidato
  // directo (interfaz, fuente 'manual'). Dedupe por (fuente, url). Aplica tope 100 → _rotar.
  async _anadir(input) {
    if (!input.project_id) return this._invalid('project_id');

    const entrantes = Array.isArray(input.señales) && input.señales.length
      ? input.señales
      : (input.titulo ? [input] : null);
    if (!entrantes) return { status: 400, data: { error: 'INVALID_INPUT', message: 'se requieren señales o un candidato {titulo,fuente,url}' } };

    const doc = await this._cargar(input.project_id);
    const nuevos = [];
    const duplicados = [];

    for (const s of entrantes) {
      if (!s.titulo || !s.fuente || !s.url) {
        duplicados.push({ motivo: 'forma_incompleta', señal: s });
        continue;
      }
      const dupe = [...doc.candidatos.values()].find(c => c.fuente === s.fuente && c.url === s.url);
      if (dupe) { duplicados.push({ motivo: 'duplicado', id: dupe.id }); continue; }

      const id = `cand_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
      const candidato = {
        id, project_id: input.project_id,
        titulo: String(s.titulo),
        fuente: String(s.fuente),
        url: String(s.url),
        sector: s.sector ? String(s.sector) : null,
        fechaCosecha: s.fechaCosecha || nowISO(),
        estado: 'CRUDO',
        ficha: s.ficha || { criterios: {}, detalle: {} },
        historial: [{ estado: 'CRUDO', en: nowISO() }]
      };
      doc.candidatos.set(_key(input.project_id, id), candidato);
      nuevos.push(candidato);
    }

    // M6: tope 100 → rotar (descarta el de menor prioridad local al histórico)
    const rotados = [];
    while (doc.candidatos.size > TOPE) {
      const victima = this._menorPrioridad([...doc.candidatos.values()]);
      doc.candidatos.delete(_key(input.project_id, victima.id));
      doc.historico.set(_key(input.project_id, victima.id), { ...victima, estado: 'ROTADO', rotado_en: nowISO() });
      rotados.push(victima);
    }

    await this._guardar(input.project_id, doc);

    for (const c of nuevos) this._publicarEvento('banco.candidato_anadido', { project_id: input.project_id, candidato: c });
    for (const c of rotados) this._publicarEvento('banco.candidato_rotado', { project_id: input.project_id, candidato: c, motivo: 'tope_100' });

    return { status: 201, data: { añadidos: nuevos, duplicados, rotados } };
  }

  // _rotar (M6): comparador local de la regla M4 — prioridad = nº criterios con
  // evidencia + (disposición a pagar ? 1 : 0). El de menor prioridad se descarta.
  _menorPrioridad(lista) {
    return lista.sort((a, b) => this._prioridadLocal(a) - this._prioridadLocal(b))[0];
  }

  _prioridadLocal(c) {
    const crit = (c.ficha && c.ficha.criterios) || {};
    const conEvidencia = Object.values(crit).filter(v => v && v.evidencia && v.evidencia.length > 0).length;
    const pagar = (c.ficha && c.ficha.detalle && c.ficha.detalle.disposicionAPagar) ? 1 : 0;
    return conEvidencia + pagar;
  }

  async _obtener(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id) return this._invalid('id');
    const doc = await this._cargar(input.project_id);
    const candidato = doc.candidatos.get(_key(input.project_id, input.id)) || doc.historico.get(_key(input.project_id, input.id));
    if (!candidato) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'candidato_no_encontrado', { id: input.id });
    return { status: 200, data: { candidato } };
  }

  async _listar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const doc = await this._cargar(input.project_id);
    let lista = [...doc.candidatos.values()].filter(c => c.project_id === input.project_id);
    if (input.estado) {
      if (!ESTADOS.includes(input.estado)) return this._invalid('estado');
      lista = lista.filter(c => c.estado === input.estado);
    }
    lista.sort((a, b) => (a.fechaCosecha < b.fechaCosecha ? 1 : -1));
    return { status: 200, data: { candidatos: lista, total: lista.length } };
  }

  // _aparcar (M10): falta de evidencia → EN_OBSERVACION, con criterios_faltantes.
  async _aparcar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id) return this._invalid('id');
    const doc = await this._cargar(input.project_id);
    const c = doc.candidatos.get(_key(input.project_id, input.id));
    if (!c) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'candidato_no_encontrado', { id: input.id });

    c.estado = 'EN_OBSERVACION';
    c.aparcado_en = nowISO();
    c.criterios_faltantes = input.criterios_faltantes || [];
    c.historial.push({ estado: 'EN_OBSERVACION', en: nowISO(), motivo: input.motivo || 'falta_evidencia' });
    await this._guardar(input.project_id, doc);

    this._publicarEvento('banco.candidato_aparcado', {
      project_id: input.project_id, candidato: c,
      criterios_faltantes: c.criterios_faltantes, motivo: input.motivo || 'falta_evidencia'
    });
    return { status: 200, data: { candidato: c } };
  }

  // _seleccionar (M1): solo 1 por ciclo; valida APROBADO → SELECCIONADO.
  async _seleccionar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id) return this._invalid('id');
    const doc = await this._cargar(input.project_id);

    const yaSeleccionado = [...doc.candidatos.values()].find(c => c.estado === 'SELECCIONADO');
    if (yaSeleccionado) {
      return this._errorResponse(409, 'CONFLICT_STATE', 'ya_hay_un_seleccionado_este_ciclo', { id: yaSeleccionado.id });
    }

    const c = doc.candidatos.get(_key(input.project_id, input.id));
    if (!c) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'candidato_no_encontrado', { id: input.id });
    if (c.estado !== 'APROBADO') {
      return this._errorResponse(409, 'CONFLICT_STATE', 'seleccion_requiere_estado_APROBADO', { id: input.id, estado: c.estado });
    }

    c.estado = 'SELECCIONADO';
    c.seleccionado_en = nowISO();
    c.historial.push({ estado: 'SELECCIONADO', en: nowISO() });
    await this._guardar(input.project_id, doc);

    this._publicarEvento('banco.candidato_seleccionado', { project_id: input.project_id, candidato: c });
    return { status: 200, data: { candidato: c } };
  }

  // _publicar: valida SELECCIONADO previo (estado ilegal imposible) → PUBLICADO.
  async _publicar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id) return this._invalid('id');
    const doc = await this._cargar(input.project_id);
    const c = doc.candidatos.get(_key(input.project_id, input.id));
    if (!c) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'candidato_no_encontrado', { id: input.id });
    if (c.estado !== 'SELECCIONADO') {
      return this._errorResponse(409, 'CONFLICT_STATE', 'publicar_requiere_estado_SELECCIONADO', { id: input.id, estado: c.estado });
    }

    c.estado = 'PUBLICADO';
    c.publicado_en = nowISO();
    c.historial.push({ estado: 'PUBLICADO', en: nowISO() });
    await this._guardar(input.project_id, doc);

    this._publicarEvento('banco.candidato_publicado', { project_id: input.project_id, candidato: c });
    return { status: 200, data: { candidato: c } };
  }

  // _aplicarVeredicto (máquina): FALTA_EVIDENCIA→aparcar · PASA→APROBADO · NO_PASA→RECHAZADO.
  async _aplicarVeredicto(e) {
    if (!e || !e.candidatoId || !e.veredicto) return;
    const pid = e.project_id;
    if (!pid) return;
    const doc = await this._cargar(pid);
    const c = doc.candidatos.get(_key(pid, e.candidatoId));
    if (!c) return;

    if (e.veredicto === 'FALTA_EVIDENCIA') {
      c.estado = 'EN_OBSERVACION';
      c.criterios_faltantes = e.criterios_faltantes || [];
      c.aparcado_en = nowISO();
      c.historial.push({ estado: 'EN_OBSERVACION', en: nowISO(), motivo: 'falta_evidencia' });
      await this._guardar(pid, doc);
      this._publicarEvento('banco.candidato_aparcado', {
        project_id: pid, candidato: c, criterios_faltantes: c.criterios_faltantes, motivo: 'falta_evidencia'
      });
    } else if (e.veredicto === 'PASA') {
      c.estado = 'APROBADO';
      if (e.detalle) c.ficha.detalle = { ...(c.ficha.detalle || {}), ...e.detalle };
      c.historial.push({ estado: 'APROBADO', en: nowISO(), veredicto: 'PASA' });
      await this._guardar(pid, doc);
    } else if (e.veredicto === 'NO_PASA') {
      c.estado = 'RECHAZADO';
      c.rechazado_en = nowISO();
      c.historial.push({ estado: 'RECHAZADO', en: nowISO(), veredicto: 'NO_PASA' });
      doc.candidatos.delete(_key(pid, c.id));
      doc.historico.set(_key(pid, c.id), c);
      await this._guardar(pid, doc);
    }
  }

  // _aplicarConfirmacion (M11): la voz del dueño sella (PASA) o revierte (NO_PASA→RECHAZADO).
  async _aplicarConfirmacion(e) {
    if (!e || !e.candidatoId || !e.confirmacion) return;
    const pid = e.project_id;
    if (!pid) return;
    const doc = await this._cargar(pid);
    const c = doc.candidatos.get(_key(pid, e.candidatoId));
    if (!c) return;

    if (e.confirmacion === 'PASA') {
      c.ficha = c.ficha || { criterios: {}, detalle: {} };
      c.ficha.detalle = { ...(c.ficha.detalle || {}), confirmado_por_dueño: true, confirmado_en: nowISO() };
      if (c.estado === 'EN_OBSERVACION') c.estado = 'APROBADO';   // re-evaluado y sellado
      c.historial.push({ estado: c.estado, en: nowISO(), confirmacion: 'PASA' });
      await this._guardar(pid, doc);
    } else if (e.confirmacion === 'NO_PASA') {
      c.estado = 'RECHAZADO';
      c.rechazado_en = nowISO();
      c.historial.push({ estado: 'RECHAZADO', en: nowISO(), confirmacion: 'NO_PASA' });
      doc.candidatos.delete(_key(pid, c.id));
      doc.historico.set(_key(pid, c.id), c);
      await this._guardar(pid, doc);
    }
  }

  // ── store (single-writer, por proyecto) ──
  async _cargar(project_id) {
    const doc = {
      candidatos: new Map([...this.candidatos].filter(([k]) => k.startsWith(`${project_id}:`))),
      historico: new Map([...this.historico].filter(([k]) => k.startsWith(`${project_id}:`)))
    };
    return doc;
  }

  async _guardar(project_id, doc) {
    // Reemplazo completo por proyecto: el doc es la fuente de verdad tras la op
    // (incluye los deletes de la rotación M6 y del rechazo). Las entradas del
    // proyecto que ya no están en el doc se eliminan del estado vivo.
    for (const k of [...this.candidatos.keys()]) if (k.startsWith(`${project_id}:`)) this.candidatos.delete(k);
    for (const k of [...this.historico.keys()]) if (k.startsWith(`${project_id}:`)) this.historico.delete(k);
    for (const c of doc.candidatos.values()) this.candidatos.set(_key(project_id, c.id), c);
    for (const c of doc.historico.values()) this.historico.set(_key(project_id, c.id), c);
    this._persist.marcarDirty(project_id);
  }
}

module.exports = BancoReflejo;
