/**
 * redactor — REFLEJO JS del conversor de newsletters del Radar de Nichos.
 *
 * Contrato (plan-construccion.md HOJA 4):
 *   entrada = borradores producidos por el cajón `redactar` (blueprint)
 *   salida  = redactor.borrador_listo (borrador persistido) · redactor.listar.response
 *   garantía = custodia el historial de borradores (p6); validación determinista del cajón;
 *              persiste por proyecto
 *   no hace = no redacta (eso es el cajón LLM); no decide qué se publica (eso es el dueño, M11)
 *
 * FORMA: REFLEJO del híbrido — op determinista + evento de dominio. El cajón `redactar`
 * (blueprint, responde:true en redactor.redactar.request) LEER la ficha vía banco, PENSAR
 * con la plantilla M9 y DELEGA el GUARDAR aquí (redactor.borrador.guardar.request) para que
 * la persistencia y el dedupe por candidato sean deterministas. Anti-colisión: redactar
 * SOLO en el blueprint.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

class RedactorReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'redactor';
    this.version = 'reflejo-0.1.0';
    this.borradores = new Map(); // `${project_id}:${candidato_id}` -> { id, candidato_id, titulo, newsletter, version, estado, fecha, project_id }
    this._persistencia = new PosPersistencia({
      modulo: this,
      file: 'redactor.json',
      dir: '/radar',
      snapshot: (pid) => ({
        borradores: [...this.borradores.values()].filter((b) => b.project_id === pid)
      }),
      hidratar: (pid, data) => {
        (data.borradores || []).forEach((b) => this.borradores.set(`${pid}:${b.candidato_id}`, b));
      }
    });
  }

  async onLoad(context) {
    await super.onLoad(context);
    // Sin interruptor propio: el redactor NO sale al exterior (solo RPC interno al banco).
  }

  // ── Handlers ──
  onListarRequest(e) {
    return this._atender(e, 'listar', 'redactor.listar.response', (d) => this._listarBorradores(d));
  }

  onValidarRequest(e) {
    return this._atender(e, 'validar', 'redactor.validar.response', (d) => this._validarEntrada(d));
  }

  onBorradorGuardarRequest(e) {
    return this._atender(e, 'borrador.guardar', 'redactor.borrador.guardar.response', (d) => this._guardarBorrador(d));
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    const project_id = d.project_id;
    if (!project_id) return;
    await this._persistencia.restaurar(project_id);
  }

  // ── Ops (REFLEJO: deterministas) ──

  _listarBorradores(input) {
    const { candidato_id, estado } = input;
    const borradores = [...this.borradores.values()]
      .filter((b) => !candidato_id || b.candidato_id === candidato_id)
      .filter((b) => !estado || b.estado === estado)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    return {
      status: 200,
      data: { borradores, total: borradores.length }
    };
  }

  _validarEntrada(input) {
    // Guarda del cajón: sin candidato y ficha no hay redacción posible (anti borrador vacío).
    const candidato_id = input.candidato_id;
    const ficha = input.ficha;
    if (!candidato_id) return this._invalid('candidato_id');
    if (!ficha || typeof ficha !== 'object' || Object.keys(ficha).length === 0) {
      return this._errorResponse(400, 'INVALID_INPUT', 'ficha requerida (la lee el cajón del banco antes de redactar)', { field: 'ficha' });
    }
    return { status: 200, data: { valido: true, candidato_id } };
  }

  _guardarBorrador(input) {
    const candidato_id = input.candidato_id;
    const newsletter = input.newsletter;
    if (!candidato_id) return this._invalid('candidato_id');
    if (!newsletter || typeof newsletter !== 'string' || newsletter.trim().length === 0) {
      return this._errorResponse(400, 'INVALID_INPUT', 'newsletter requerida (la produce el cajón)', { field: 'newsletter' });
    }
    const pid = input.project_id;
    const clave = `${pid}:${candidato_id}`;
    const previo = this.borradores.get(clave);
    const borrador = {
      id: previo ? previo.id : `borrador_${candidato_id}`,
      candidato_id,
      titulo: input.titulo || (previo && previo.titulo) || 'Newsletter semanal',
      newsletter,
      version: previo ? previo.version + 1 : 1,
      estado: 'LISTO', // LISTO -> (cartero) -> ENVIADO / FALLIDO (lo anota el reloj o el cartero)
      fecha: new Date().toISOString(),
      project_id: pid
    };
    this.borradores.set(clave, borrador);
    this._persistencia.marcarDirty(pid);
    this._publicarEvento('redactor.borrador_listo', { borrador });
    return { status: 200, data: { borrador } };
  }

  _publicarEvento(evento, payload) {
    this.eventBus?.publish(evento, payload);
  }
}

module.exports = RedactorReflejo;
