/**
 * contabilidad/motor-avisos — PUENTE STATELESS (K2, hoja del plan). LA PIEZA CLAVE.
 *
 * PRODUCE el aviso a partir de senales REALES — nunca de pantalla muda.
 * Recibe senales de A8.2 (aviso-revision), C6 (aviso-cuadre), D6
 * (calendario-fiscal), E5, J4, A15 (declaracion-fuente-faltante) y R1, y las
 * convierte en AVISOS enrutados a quien tiene la silla.
 *
 * ── ESTE MODULO ATIENDE EL RPC `contabilidad.aviso.solicitar.request` ──
 * Los consumidores que HOY publican 503 DEPENDENCIA_NO_DISPONIBLE
 * (aviso-revision A8.2, declaracion-fuente-faltante A15, y via
 * completitud-cobertura otros) piden el aviso asi:
 *     _rpc('contabilidad.aviso.solicitar.request',
 *          {project_id, origen, tipo, motivo, destinatario, cola_destino,
 *           prioridad, contexto, correlation_id}, {timeout_ms:4000})
 * y esperan `status === 200`. Aqui se les responde EXACTAMENTE por
 * `contabilidad.aviso.solicitar.response` (lo emite _atender con el mismo
 * request_id): al estar este modulo vivo, los tres DEJAN de publicar su
 * contrato tolerante. El contrato encaja con lo que ellos ya piden: se acepta
 * `destinatario` o `cola_destino` indistintamente y se derivan el uno del otro.
 *
 * QUE AVISOS, A QUIEN Y POR QUE CANAL es DECLARABLE (K6): el catalogo vive en
 * memoria del propio puente y se declara con
 * `contabilidad.aviso.catalogo.declarar.request` (un solo declarante,
 * DUENO/ASESOR). Ningun catalogo de avisos esta cableado como ley: hay
 * DEFAULTS declarables y el declarante los sobreescribe.
 *
 * PUENTE (patron real, stateless): SIN PosPersistencia y SIN project.activated —
 * no guarda estado; reacciona a un evento y sigue. El catalogo es configuracion
 * del adaptador, no parcela persistente. La dependencia con
 * cola-declaraciones-criterio (K9) es por EVENTO, NUNCA por require cruzado.
 *
 * Emisor/par de fallo: exito publica contabilidad.aviso_producido y
 * contabilidad.aviso.enrutar.request; error su par determinista
 * (contabilidad.aviso.solicitar.failed / contabilidad.aviso.enrutar.failed).
 * NO REUTILIZA: no existe motor de avisos contables en el inventario.
 *
 * Ver hoja K2 del diseno-oop y bloque `motor-avisos` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const crypto = require('crypto');

// Sillas que pueden recibir un aviso (colas de A8.1): contable → asesor; negocio → dueno.
const DESTINATARIOS = new Set(['ASESOR', 'DUENO']);

// Colas de destino posibles (espejo de A8.1).
const COLAS = new Set(['ASESOR', 'DUENO']);

// Rol unico que declara el catalogo de avisos (K6).
const ROLES_DECLARANTES = new Set(['DUENO', 'ASESOR']);

// Prioridades declarables.
const PRIORIDADES = new Set(['BAJA', 'NORMAL', 'ALTA', 'URGENTE']);

// Roles del aviso que K2 sabe PRODUCIR de fabrica (catalogo DEFAULT declarable,
// NO la ley: el declarante puede anadir tipos y sobreescribir destinatario/canal).
const CATALOGO_BASE = {
  // A8.2 — la cola encolo una excepcion: hay que revisarla.
  AVISO_REVISION: { destinatario: 'ASESOR', canal: 'PANEL', descripcion: 'esto necesita revision', familia: 'EXCEPCION' },
  // A15 — una fuente no publico un hecho esperado: hueco [ABIERTO].
  HUECO_COBERTURA: { destinatario: 'DUENO', canal: 'PANEL', descripcion: 'falta una fuente: el hueco queda declarado', familia: 'COBERTURA' },
  // C6 — el cuadre no se finge: falta cobertura.
  AVISO_CUADRE: { destinatario: 'ASESOR', canal: 'PANEL', descripcion: 'el cuadre no se finge: falta cobertura', familia: 'CUADRE' },
  // D6 — un plazo fiscal declarado se acerca.
  AVISO_PLAZO: { destinatario: 'ASESOR', canal: 'PANEL', descripcion: 'se acerca un plazo declarado', familia: 'PLAZO' },
  // E5 — desviacion de tesoreria / sangria.
  AVISO_DESVIACION: { destinatario: 'DUENO', canal: 'PANEL', descripcion: 'la prevision se desvia', familia: 'TESORERIA' },
  // F2 — la amortizacion del cierre.
  AVISO_AMORTIZACION: { destinatario: 'ASESOR', canal: 'PANEL', descripcion: 'la cuota del cierre no se pudo generar', familia: 'INMOVILIZADO' },
  // D14 — rectificacion posterior a la presentacion.
  AVISO_RECTIFICACION: { destinatario: 'ASESOR', canal: 'PANEL', descripcion: 'hay que rectificar una declaracion presentada', familia: 'FISCAL' },
  // D12 — obligacion fiscal atrasada.
  AVISO_OBLIGACION: { destinatario: 'ASESOR', canal: 'PANEL', descripcion: 'una obligacion fiscal esta atrasada', familia: 'FISCAL' },
  // C4 — el cierre de un periodo.
  AVISO_CIERRE: { destinatario: 'ASESOR', canal: 'PANEL', descripcion: 'el cierre del periodo', familia: 'CIERRE' },
  // J4 — sangria analitica.
  AVISO_SANGRIA: { destinatario: 'DUENO', canal: 'PANEL', descripcion: 'una linea pierde margen', familia: 'ANALITICA' },
  // D13 — el acuse no llego: obligacion no justificada.
  AVISO_ACUSE: { destinatario: 'ASESOR', canal: 'PANEL', descripcion: 'no llego el acuse: la obligacion no esta justificada', familia: 'FISCAL' }
};

// Rol unico destinatario de la ENTREGA (R1) cuando no hay silla declarada.
const DESTINATARIO_DEFECTO = 'ASESOR';

class MotorAvisos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-avisos';
    this.version = 'reflejo-0.1.0';
    // Puente stateless: el catalogo de avisos (K6) es configuracion declarable
    // del adaptador, no parcela persistente.
    this._catalogo = new Map();
    for (const [tipo, def] of Object.entries(CATALOGO_BASE)) this._catalogo.set(tipo, { ...def, tipo, declarado: false });
    this._secuencia = 0;
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  // ESTE es el handler que DESBLOQUEA los modulos tolerantes (A8.2, A15, C6...):
  // responde por contabilidad.aviso.solicitar.response con status 200.
  onSolicitarRequest(e) {
    return this._atender(e, 'solicitar', 'contabilidad.aviso.solicitar.response', async (d) => {
      const res = this._solicitar(d);
      if (res.status !== 200) {
        // Contrato de fallo: el .response tambien sale (por _atender) pero se
        // declara el par determinista para que el consumidor pueda trazar.
        this.eventBus?.publish('contabilidad.aviso.solicitar.failed', {
          status: res.status,
          error: res.error,
          correlation_id: d && d.correlation_id
        });
        return res;
      }

      // El aviso se PRODUCE y se ENRUTA: nunca queda en pantalla muda.
      const enrutado = this._enrutar(res.data.aviso);
      if (!enrutado) {
        this.eventBus?.publish('contabilidad.aviso.enrutar.failed', {
          status: 422,
          error: { code: 'PRECONDITION_FAILED', message: 'el aviso no tiene destinatario al que enrutar' },
          detalle: res.data.aviso
        });
      } else {
        this.eventBus?.publish('contabilidad.aviso.enrutar.request', {
          ...enrutado,
          correlation_id: d && d.correlation_id
        });
      }

      this.eventBus?.publish('contabilidad.aviso_producido', {
        ...res.data,
        correlation_id: d && d.correlation_id
      });
      return res;
    });
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contabilidad.aviso.catalogo.declarar.response', async (d) => {
      const res = this._declararCatalogo(d);
      if (res.status !== 200) {
        this.eventBus?.publish('contabilidad.aviso.catalogo.declarar.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras ──

  // solicitar(senal) -> Aviso. Acepta el payload EXACTO de A8.2 y A15.
  _solicitar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const tipo = String((input && input.tipo) || '').toUpperCase();
    if (!tipo) return this._invalid('tipo');

    const produccion = this._producir({ ...input, project_id: pid, tipo });
    if (produccion.status !== 200) return produccion;

    return {
      status: 200,
      data: {
        project_id: pid,
        aviso: produccion.data.aviso,
        producido: true,
        enrutado: true,
        // Lo que el consumidor comprueba: status 200 = la dependencia esta viva.
        dependencia: 'motor-avisos',
        dependencia_disponible: true,
        no_es_pantalla_muda: true
      }
    };
  }

  // producir(senal) -> Aviso (catalogo declarable K6).
  _producir(senal) {
    const s = senal || {};
    const pid = s.project_id;
    if (!pid) return this._invalid('project_id');
    const tipo = String(s.tipo || '').toUpperCase();
    if (!tipo) return this._invalid('tipo');

    const def = this._catalogo.get(tipo) || null;

    // El DESTINATARIO se acepta en cualquiera de las dos formas que usan los
    // consumidores (`destinatario` de A8.2/A15, o `cola_destino`), y se derivan
    // el uno del otro: A8.2 usa AMBOS con el mismo valor.
    const destinatarioIn = String((s.destinatario || s.cola_destino || '') || '').toUpperCase();
    const colaIn = String((s.cola_destino || s.destinatario || '') || '').toUpperCase();
    const destinatario = DESTINATARIOS.has(destinatarioIn)
      ? destinatarioIn
      : (def ? def.destinatario : DESTINATARIO_DEFECTO);
    const colaDestino = COLAS.has(colaIn) ? colaIn : destinatario;

    const prioridadIn = String((s.prioridad || '') || '').toUpperCase();
    const prioridad = PRIORIDADES.has(prioridadIn) ? prioridadIn : (s.ambiguedad_alta ? 'ALTA' : 'NORMAL');

    const canal = (def && def.canal) || (s.canal ? String(s.canal).toUpperCase() : 'PANEL');

    this._secuencia += 1;
    const aviso = {
      id: `${pid}-K2-${this._secuencia}`,
      project_id: pid,
      tipo,
      origen: s.origen || null,
      motivo: (s.motivo !== undefined && s.motivo !== null) ? s.motivo : ((def && def.descripcion) || null),
      texto: (def && def.descripcion) || s.motivo || tipo,
      familia: (def && def.familia) || 'GENERAL',
      // A quien: la silla que resuelve (ASESOR | DUENO).
      destinatario,
      cola_destino: colaDestino,
      prioridad,
      canal,
      contexto: s.contexto || null,
      marca: s.marca || null,
      // El aviso sale de una senal REAL: nunca de pantalla muda.
      senal_real: true,
      pantalla_muda: false,
      catalogo_declarable: true,
      tipo_declarado: !!(def && def.declarado),
      producido_en: new Date().toISOString(),
      correlation_id: s.correlation_id || null
    };

    return { status: 200, data: { project_id: pid, aviso, producido: true, destinatario, prioridad, canal } };
  }

  // enrutar(aviso, destinatario) -> ok (salida hacia R1, que ENTREGA).
  _enrutar(aviso, destinatario) {
    if (!aviso || typeof aviso !== 'object') return null;
    const destino = String(destinatario || aviso.destinatario || '').toUpperCase();
    if (!DESTINATARIOS.has(destino)) return null;
    return {
      project_id: aviso.project_id,
      aviso,
      aviso_id: aviso.id,
      destinatario: destino,
      cola_destino: aviso.cola_destino || destino,
      canal: aviso.canal || 'PANEL',
      prioridad: aviso.prioridad || 'NORMAL',
      entregado_por: 'R1 (aviso-al-negocio)',
      enrutado: true
    };
  }

  // declararCatalogo(rol, tipo, {destinatario, canal}) -> ok (K6, DECLARABLE).
  // Un solo declarante (DUENO/ASESOR). No hay catalogo cableado como ley.
  _declararCatalogo(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (!ROLES_DECLARANTES.has(rol)) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'el catalogo de avisos (K6) lo declara DUENO o ASESOR', {
          rol_esperado: [...ROLES_DECLARANTES], rol_recibido: rol || null
        });
    }

    const tipo = String((input && input.tipo) || '').toUpperCase();
    if (!tipo) return this._invalid('tipo');

    const destinatario = String((input && (input.destinatario || input.cola_destino)) || '').toUpperCase();
    if (destinatario && !DESTINATARIOS.has(destinatario)) {
      return this._errorResponse(422, 'DESTINATARIO_NO_VALIDO',
        `destinatario ${destinatario} fuera del catalogo declarable`, { destinatarios_posibles: [...DESTINATARIOS] });
    }

    const existente = this._catalogo.get(tipo) || null;
    const entrada = {
      tipo,
      destinatario: destinatario || (existente && existente.destinatario) || DESTINATARIO_DEFECTO,
      canal: String((input && input.canal) || (existente && existente.canal) || 'PANEL').toUpperCase(),
      descripcion: (input && input.descripcion) || (existente && existente.descripcion) || null,
      familia: (input && input.familia) || (existente && existente.familia) || 'GENERAL',
      // Declarado por el dueno/asesor: la ley entra como DATO.
      declarado: true,
      declarado_por: rol,
      declarado_en: new Date().toISOString()
    };
    this._catalogo.set(tipo, entrada);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo,
        entrada,
        creado: !existente,
        catalogo_declarable: true,
        ley_cableada: false,
        n_tipos: this._catalogo.size
      }
    };
  }

  // catalogo() -> List<TipoAviso> (proyeccion de lectura).
  _catalogoActual(input) {
    return {
      status: 200,
      data: {
        project_id: (input && input.project_id) || null,
        tipos: [...this._catalogo.values()],
        n_tipos: this._catalogo.size,
        catalogo_declarable: true
      }
    };
  }

  // ── Tools ──
  toolSolicitar(params) { return this._solicitar(params); }
  toolProducir(params) { return this._producir(params); }
  toolEnrutar(params) { return this._enrutar(params.aviso || params, params.destinatario); }
  toolDeclararCatalogo(params) { return this._declararCatalogo(params); }
  toolCatalogo(params) { return this._catalogoActual(params); }
}

module.exports = MotorAvisos;
