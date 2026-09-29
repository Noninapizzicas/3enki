/**
 * contabilidad-analitica/motor-avisos — PUENTE STATELESS (K2, hoja del plan).
 *
 * **LA PIEZA QUE DESBLOQUEA.** PRODUCE el aviso (requisito 4 del dueño): recoge las
 * SEÑALES que ya emiten las piezas del sistema (`contabilidad.aviso_revision`,
 * `contabilidad.aviso_cuadre`, `contabilidad.vencimiento_fiscal`,
 * `contabilidad.vencimiento_proximo`, `contabilidad.desviacion`,
 * `contabilidad.fuente_faltante`) y las CONVIERTE en un `Aviso` canonico con su asunto,
 * su motivo, su destino y su canal.
 *
 * **PRODUCE; NO ENTREGA Y NO DECIDE.** El motor es el CANAL DE AVISOS, no el mensajero:
 *   - NO habla con ningun canal (telegram, email, push): la ENTREGA + CONFIRMA es R1
 *     (`aviso-negocio`, oleada posterior). Aqui solo se produce el aviso y se publica.
 *   - NO decide QUE avisos existen, A QUIEN van ni POR QUE CANAL: eso es el CATALOGO
 *     (`catalogo-avisos` K6), que se consulta POR EVENTO (`catalogo-avisos.resolver.request`,
 *     best-effort). Sin catalogo NO se inventa la politica: se produce el aviso con lo que la
 *     señal ya traia declarado y se marca `catalogo_disponible:false`.
 *   - NO inventa DESTINO: el destino es `ParametroDeclarable` ([ABIERTO] Q70 quien actua).
 *     Si la señal no lo trae y el catalogo no lo resuelve → `destino:null`,
 *     `destino_declarado:false`. Jamas se asume a quien avisar.
 *
 * ATRIBUTOS del diseno: `destino:ParametroDeclarable`, `catalogo:Set<Senal>`.
 * METODOS: `producir(senal):Aviso`. REGLA: PRODUCE el aviso; conecta por evento.
 *
 * Invariantes:
 *  - Una señal sin naturaleza identificable NO es un aviso: se declara y cierra el circulo
 *    con el par `.failed` (nada se estima).
 *  - DETERMINISTA: misma señal + mismo catalogo declarado → mismo aviso.
 *  - LEY/PARAMETRO COMO DATO: los tipos de aviso, destinos y canales son DECLARABLES; cero
 *    catalogo cableado en el codigo.
 *  - Sin estado de dominio: no recuerda avisos, no los cuenta, no los re-emite. Un puente.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja K2 del plan-construccion y diseno-oop.md (CLASE MotorAvisos).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Las señales que el motor escucha, cada una con la naturaleza que DECLARA su emisor.
// El mapeo señal → tipo/asunto NO es criterio de negocio: es la IDENTIDAD de la señal.
const SENALES = {
  'contabilidad.aviso_revision': { tipo: 'revision', asunto: 'revision' },
  'contabilidad.aviso_cuadre': { tipo: 'cuadre', asunto: 'cuadre' },
  'contabilidad.vencimiento_fiscal': { tipo: 'vencimiento', asunto: 'vencimiento_fiscal' },
  'contabilidad.vencimiento_proximo': { tipo: 'vencimiento', asunto: 'vencimiento' },
  'contabilidad.desviacion': { tipo: 'desviacion', asunto: 'desviacion' },
  'contabilidad.fuente_faltante': { tipo: 'fuente_faltante', asunto: 'fuente_faltante' }
};

class MotorAvisos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-avisos';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onProducirRequest(e) {
    return this._atender(e, 'producir', 'motor-avisos.producir.response', async (d) => {
      const res = await this._producir(d);
      if (res.status === 200) {
        this._emitirProducido(res.data, d.correlation_id);
      } else {
        this.eventBus?.publish('motor-avisos.producir.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // SEÑALES (fire-and-forget): cada pieza ya emitio su señal de dominio.
  // El motor la convierte en Aviso. Todas son TOLERANTES: si la señal llega
  // malformada se ignora (no se cuelga el bus por una señal suelta).
  // ══════════════════════════════════════════════════════════════════════

  // A8.2 (aviso-revision): una excepcion necesita revision.
  async onAvisoRevision(e) {
    return this._senal('contabilidad.aviso_revision', e);
  }

  // C6 (aviso-cuadre): LA metrica unica de cobertura no esta completa.
  async onAvisoCuadre(e) {
    return this._senal('contabilidad.aviso_cuadre', e);
  }

  // D6 (calendario-fiscal): un vencimiento fiscal entra en la ventana declarada.
  async onVencimientoFiscal(e) {
    return this._senal('contabilidad.vencimiento_fiscal', e);
  }

  // E5/N8 (prevision-caja / vencimiento-pago): un vencimiento de pago se acerca.
  async onVencimientoProximo(e) {
    return this._senal('contabilidad.vencimiento_proximo', e);
  }

  // J4 (desviacion): el real se salio del umbral DECLARADO.
  async onDesviacion(e) {
    return this._senal('contabilidad.desviacion', e);
  }

  // A15 (declaracion-fuente-faltante): una vertical no publica un hecho necesario.
  async onFuenteFaltante(e) {
    return this._senal('contabilidad.fuente_faltante', e);
  }

  // ── conversion señal → aviso (una sola proyeccion, misma para las 6 señales) ──
  async _senal(evento, e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = await this._producir({ ...d, project_id: d.project_id, evento, senal: evento });
    if (res.status === 200) {
      this._emitirProducido(res.data, d.correlation_id);
      return res;
    }
    this.eventBus?.publish('motor-avisos.producir.failed', res);
    return res;
  }

  // Se emite UNA vez por aviso producido. Lo consume R1 (aviso-negocio: ENTREGA + CONFIRMA).
  _emitirProducido(data, correlation_id) {
    this.eventBus?.publish('contabilidad.aviso_producido', {
      project_id: data.project_id,
      aviso: data.aviso,
      aviso_id: data.aviso.id,
      tipo: data.aviso.tipo,
      asunto: data.aviso.asunto,
      destino: data.aviso.destino,
      canal: data.aviso.canal,
      catalogo_disponible: data.catalogo_disponible,
      correlation_id
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // PROYECCION: producir(senal) → Aviso (PRODUCE, no entrega y no decide)
  // ══════════════════════════════════════════════════════════════════════
  async _producir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La SEÑAL: de que evento viene, o declarada explicitamente en la peticion.
    const evento = input.evento != null ? String(input.evento) : (input.senal != null ? String(input.senal) : null);
    const identidad = evento && SENALES[evento] ? SENALES[evento] : null;

    // Sin identidad de señal declarada, el TIPO y el ASUNTO deben venir declarados: nada se estima.
    const tipo = input.tipo != null ? String(input.tipo).trim()
      : (identidad ? identidad.tipo : '');
    const asunto = input.asunto != null ? String(input.asunto).trim()
      : (identidad ? identidad.asunto : tipo);
    if (!tipo) {
      return this._errorResponse(400, 'SENAL_NO_IDENTIFICABLE',
        'la señal no declara su naturaleza (tipo/asunto): el motor no inventa de que avisa',
        { evento_declarado: evento });
    }

    // El MOTIVO es el porque declarado por la señal. Sin motivo, se declara que falta.
    const motivo = input.motivo != null ? String(input.motivo)
      : (input.aviso && input.aviso.motivo != null ? String(input.aviso.motivo) : null);

    // El CATALOGO (K6) resuelve QUE avisos, A QUIEN y POR QUE CANAL — POR EVENTO.
    // Sin catalogo NO se inventa la politica: se produce con lo declarado.
    const catalogo = await this._catalogo(pid, input, tipo);

    // El DESTINO es ParametroDeclarable ([ABIERTO] Q70): señal > catalogo > null. Jamas se asume.
    const destino_declarado = this._declarado(input.destino) || this._declarado(input.aviso && input.aviso.destino)
      || this._declarado(catalogo && catalogo.destino);
    const destino = destino_declarado
      ? String(input.destino != null ? input.destino
        : (input.aviso && input.aviso.destino != null ? input.aviso.destino : catalogo.destino)).trim()
      : null;

    // El CANAL tambien es declarable: el motor NO habla con canales (eso es R1).
    const canal_declarado = this._declarado(input.canal) || this._declarado(catalogo && catalogo.canal);
    const canal = canal_declarado
      ? String(input.canal != null ? input.canal : catalogo.canal).trim()
      : null;

    const ahora = new Date().toISOString();
    const aviso = {
      id: `aviso_${pid}_${ahora}_${tipo}`,
      tipo,
      asunto,
      // La señal ORIGINAL viaja entera: el aviso es trazable hasta su causa.
      senal: evento,
      motivo,
      detalle: input.detalle && typeof input.detalle === 'object' ? input.detalle
        : (input.aviso && input.aviso.detalle && typeof input.aviso.detalle === 'object' ? input.aviso.detalle : null),
      vertical: input.vertical != null ? input.vertical : (catalogo ? catalogo.vertical ?? null : null),
      ejercicio: input.ejercicio != null ? input.ejercicio : null,
      periodo: input.periodo != null ? input.periodo : null,
      // Destino y canal: declarables. Sin declarar → null (no se asume a quien avisar).
      destino,
      destino_declarado,
      canal,
      canal_declarado,
      requiere_revision: true,
      // El aviso ES producido; su ENTREGA y su CONFIRMACION son de R1.
      entregado: false,
      entregado_por: 'aviso-negocio(R1)',
      producido_en: ahora
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        aviso,
        aviso_id: aviso.id,
        catalogo_disponible: Boolean(catalogo),
        fuente_catalogo: catalogo ? catalogo.origen : null,
        abierto: {
          destino: destino_declarado ? null : 'el destino del aviso no esta declarado ([ABIERTO] Q70 quien actua)',
          canal: canal_declarado ? null : 'el canal no esta declarado en la señal ni en el catalogo (K6)',
          motivo: motivo ? null : 'la señal no declaro un motivo',
          catalogo: catalogo ? null : 'catalogo-avisos (K6) no respondio: la politica de avisos no se inventa'
        }
      }
    };
  }

  // El catalogo (K6) declarado en la peticion o pedido POR EVENTO. Best-effort.
  async _catalogo(pid, input, tipo) {
    if (input.catalogo && typeof input.catalogo === 'object') {
      return { ...input.catalogo, origen: 'declarado' };
    }
    const r = await this._rpc('catalogo-avisos.resolver.request',
      { project_id: pid, tipo, evento: input.evento != null ? input.evento : null }, { timeout_ms: 4000 });
    const data = r && r.data && r.data.aviso ? r.data.aviso : (r && r.data ? r.data : null);
    if (data && typeof data === 'object') return { ...data, origen: 'catalogo-avisos' };
    return null;
  }

  _declarado(raw) {
    if (raw === undefined || raw === null) return false;
    return String(raw).trim().length > 0;
  }

  // ── Tools ──
  toolProducir(params) { return this._producir(params); }
}

module.exports = MotorAvisos;
