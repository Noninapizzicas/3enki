/**
 * contabilidad-libro/flujo-firma — CUSTODIO CON PERSISTENCIA (L3, hoja del plan).
 *
 * **LA PARCELA DE ESTADO REVISADO/FIRMADO DEL ASESOR.**
 *
 * 🔴 EL SISTEMA NO FIRMA Y NO DECIDE. Este custodio ARMA y (a traves de la capa de avisos)
 * ENTREGA la SOLICITUD de firma al asesor; la FIRMA la pone EL ASESOR. Un intento de firmar
 * con un rol que no sea el del asesor (incluido el rol del SISTEMA) se RECHAZA (403): el
 * sistema jamas firma en nombre de nadie.
 *
 * 🔴 SI VENCE SIN FIRMA → EXPIRA Y SE RE-PREGUNTA, JAMAS ASUME. Una solicitud cuya validez
 * declarada pasa sin firma NO se da por firmada ni por rechazada: se marca EXPIRADA y se ARMA
 * una solicitud NUEVA (`re_preguntada:true`). La ausencia de firma NUNCA se interpreta como un
 * si. La validez es DECLARABLE (`vence_en` ISO o `validez_ms`): sin validez declarada la
 * solicitud no expira — y se declara que no vence (cero plazos cableados).
 *
 * ATRIBUTOS del diseno: `firmas:Map<Ambito,Firma>`.
 * METODOS: `firmar(asesor, ambito, marca)`, `estado(ambito):MarcaEstado`.
 *
 * Invariantes:
 *  - APPEND-ONLY: la firma se AÑADE; una firma previa no se borra ni se muta. Un ambito puede
 *    tener varias firmas (revisiones sucesivas); la VIGENTE es la ultima.
 *  - UN SOLO ESCRITOR por la parcela `libro/firma`: se pide el turno a single-writer (M2) POR
 *    EVENTO y se RESPETA su GUARD (403 si el turno es de otro).
 *  - El AMBITO es DECLARABLE (periodo/estado/documento — [ABIERTO]): no hay ambitos cableados.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD (single-writer + asesor).
 * Ver hoja L3 del plan-construccion y diseno-oop.md (CLASE FlujoFirma).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// La parcela de la firma. El turno lo concede single-writer (M2).
const PARCELA = 'libro/firma';
// Rol que reclama el turno en single-writer.
const ROL_RECLAMANTE = 'RECLAMANTE_ESCRITOR';
// 🔴 EL UNICO QUE FIRMA ES EL ASESOR. Cualquier otro rol (SISTEMA incluido) → 403.
const ROL_ASESOR = 'ASESOR';

class FlujoFirma extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'flujo-firma';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, firmas:[append-only], solicitudes:[append-only] }
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'flujo-firma.json',
      dir: '/contabilidad/flujo-firma',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, firmas: p.firmas, solicitudes: p.solicitudes };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        this._parcelas.set(pid, {
          esquema: data.esquema || 'contabilidad-flujo-firma-v1',
          firmas: Array.isArray(data.firmas) ? data.firmas : [],
          solicitudes: Array.isArray(data.solicitudes) ? data.solicitudes : []
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las firmas y solicitudes del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onFirmarRequest(e) {
    return this._atender(e, 'firmar', 'flujo-firma.firmar.response', async (d) => {
      const res = await this._firmar(d);
      if (res.status === 200) {
        // Solo una FIRMA REAL (puesta por el asesor) emite el evento de dominio.
        if (res.data.registrada === true) {
          this.eventBus?.publish('contabilidad.firma_registrada', {
            project_id: res.data.project_id,
            ambito: res.data.firma.ambito,
            firma: res.data.firma,
            asesor: res.data.firma.asesor,
            marca: res.data.firma.marca,
            correlation_id: d.correlation_id
          });
        }
      } else {
        // Incluye 403 cuando quien pretende firmar NO es el asesor: el sistema no firma.
        this.eventBus?.publish('flujo-firma.firmar.failed', res);
      }
      return res;
    });
  }

  onEstadoRequest(e) {
    return this._atender(e, 'estado', 'flujo-firma.estado.response', async (d) => {
      const res = await this._estado(d);
      if (res.status !== 200) this.eventBus?.publish('flujo-firma.estado.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // firmar: DOS caminos, jamas confundidos.
  //   · con `asesor`      → REGISTRA la firma DEL ASESOR (guard de rol + single-writer).
  //   · sin `asesor`      → el SISTEMA ARMA la solicitud (pregunta); NO firma.
  // ══════════════════════════════════════════════════════════════════════
  async _firmar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const ambito = input.ambito != null ? String(input.ambito).trim() : '';
    if (!ambito) return this._invalid('ambito');

    // Sin asesor declarado → el sistema ARMA la solicitud. NO es una firma.
    if (input.asesor === undefined || input.asesor === null || String(input.asesor).trim() === '') {
      return this._armar(pid, input, ambito);
    }
    return this._registrarFirma(pid, input, ambito, String(input.asesor).trim());
  }

  // ── ARMA la solicitud de firma (el sistema pregunta; NO firma) ──
  _armar(pid, input, ambito) {
    const ahora = new Date().toISOString();
    const validez = this._validez(input, ahora);
    const solicitud = {
      id: `solicitud_${pid}_${ambito}_${ahora}`,
      ambito,
      // Que hay que revisar/firmar: DECLARADO (el sistema no elige el ambito ni su alcance).
      asunto: input.asunto != null ? String(input.asunto) : null,
      alcance: input.alcance !== undefined ? input.alcance : null,
      motivo: input.motivo != null ? String(input.motivo) : null,
      // A quien se pregunta: DECLARABLE ([ABIERTO] quien firma). Sin declarar → null.
      destinatario: input.destinatario != null ? String(input.destinatario) : null,
      destinatario_declarado: input.destinatario != null && String(input.destinatario).trim() !== '',
      // La validez es DECLARABLE: sin validez declarada la solicitud no vence (no se cablea plazo).
      vence_en: validez.vence_en,
      validez_ms: validez.validez_ms,
      estado: 'PENDIENTE',
      armada_en: ahora,
      correlation_id: input.correlation_id || null
    };

    const p = this._obtenerOCrear(pid);
    p.solicitudes.push(solicitud);
    p.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        ambito,
        // El sistema ARMA y deja la solicitud lista; la ENTREGA la hace la capa de avisos (R1).
        solicitud,
        registrada: false,
        firmada: false,
        armada: true,
        // Deja claro quien firma y quien no: el sistema jamas firma.
        firma_por: 'asesor',
        firma_del_sistema: false,
        abierto: {
          destinatario: solicitud.destinatario_declarado ? null : 'el destinatario de la pregunta no esta declarado ([ABIERTO] quien firma)',
          vence_en: solicitud.vence_en ? null : 'no se declaro validez: la solicitud no vence (cero plazos cableados)'
        }
      }
    };
  }

  // ── REGISTRA la firma del ASESOR (la unica firma posible) ──
  async _registrarFirma(pid, input, ambito, asesor) {
    // 🔴 GUARD 1 — EL SISTEMA NO FIRMA: solo el rol del asesor puede firmar.
    const rol = input.rol != null ? String(input.rol).toUpperCase() : ROL_ASESOR;
    if (rol !== ROL_ASESOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'la firma es del asesor: el sistema NO firma ni decide',
        { rol_esperado: ROL_ASESOR, rol_recibido: rol, ambito });
    }

    // 🔴 GUARD 2 — UN SOLO ESCRITOR de la parcela `libro/firma` (se respeta el GUARD de M2).
    const escritor_id = input.id != null ? String(input.id) : asesor;
    const turno = await this._rpc('single-writer.reclamar.request',
      { project_id: pid, rol: ROL_RECLAMANTE, parcela: PARCELA, id: escritor_id }, { timeout_ms: 4000 });
    const turno_data = turno && turno.data ? turno.data : null;
    if (turno_data && turno_data.concedido === false) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor con el turno de la parcela libro/firma puede registrar firmas',
        { parcela: PARCELA, dueno: turno_data.dueno ?? null, solicitante: escritor_id });
    }
    const turno_confirmado = Boolean(turno_data && turno_data.concedido === true);

    const p = this._obtenerOCrear(pid);
    const ahora = new Date().toISOString();
    const solicitud = this._solicitudVigente(p, ambito);

    // APPEND-ONLY: la firma se AÑADE. Una firma previa no se borra ni se muta; la vigente sera esta.
    const firma = {
      n: p.firmas.filter((f) => f.ambito === ambito).length + 1,
      ambito,
      // Quien firma: EL ASESOR (dato declarado). El sistema solo custodia la marca.
      asesor,
      // La MARCA de la decision del asesor: DECLARADA. Nada se interpreta por el asesor.
      marca: input.marca !== undefined ? input.marca : null,
      decision: input.decision != null ? String(input.decision) : null,
      comentario: input.comentario != null ? String(input.comentario) : null,
      // Referencia a la solicitud que se responde (si habia una armada).
      solicitud_id: solicitud ? solicitud.id : null,
      revisado_en: ahora
    };
    p.firmas.push(firma);
    if (solicitud && solicitud.estado === 'PENDIENTE') solicitud.estado = 'FIRMADA';
    p.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        ambito,
        firma,
        registrada: true,
        firmada: true,
        armada: false,
        turno_confirmado,
        // Deja constancia de que la firma la puso el asesor, no el sistema.
        firma_por: 'asesor',
        firma_del_sistema: false
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // estado(ambito) → MarcaEstado (vence sin firma → EXPIRA y RE-PREGUNTA)
  // ══════════════════════════════════════════════════════════════════════
  _estado(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const ambito = input.ambito != null ? String(input.ambito).trim() : '';
    if (!ambito) return this._invalid('ambito');

    const ahora = input.ahora != null ? new Date(input.ahora) : new Date();
    const p = this._obtenerOCrear(pid);
    const firmas = p.firmas.filter((f) => f.ambito === ambito);
    const firma = firmas.length > 0 ? firmas[firmas.length - 1] : null;
    const solicitud = this._solicitudVigente(p, ambito);

    // La FIRMA ya existe → el ambito esta FIRMADO. Ni expira ni se re-pregunta.
    if (firma) {
      return {
        status: 200,
        data: {
          project_id: pid, ambito, revisado: true, estado: 'FIRMADA', firma,
          firma_del_sistema: false, firma_por: 'asesor',
          solicitud, re_preguntada: false, vencida: false,
          abierto: { solicitud: solicitud ? null : 'no hay solicitud armada para este ambito (ABIERTO)' }
        }
      };
    }

    // Sin firma y sin solicitud → nada que firmar todavia. NO se asume nada.
    if (!solicitud) {
      return {
        status: 200,
        data: {
          project_id: pid, ambito, revisado: false, estado: 'SIN_SOLICITUD', firma: null,
          firma_del_sistema: false, firma_por: 'asesor', solicitud: null,
          re_preguntada: false, vencida: false,
          abierto: {
            solicitud: 'no hay solicitud de firma armada para este ambito: el sistema la arma cuando se le pide (no la inventa)'
          }
        }
      };
    }

    // Solicitud PENDIENTE: ¿vencio? Si vencio → EXPIRA y se RE-PREGUNTA (jamas se asume).
    const vencida = this._vencida(solicitud, ahora);
    if (vencida) {
      // 🔴 NO SE ASUME: ni firmada ni rechazada. Se EXPIRA y se ARMA una solicitud NUEVA.
      solicitud.estado = 'EXPIRADA';
      solicitud.expirada_en = ahora.toISOString();
      const validez = this._validez(solicitud, ahora.toISOString());
      const nueva = {
        id: `solicitud_${pid}_${ambito}_${ahora.toISOString()}_re`,
        ambito,
        asunto: solicitud.asunto,
        alcance: solicitud.alcance,
        motivo: solicitud.motivo != null ? solicitud.motivo : 'la solicitud anterior vencio sin firma',
        destinatario: solicitud.destinatario,
        destinatario_declarado: solicitud.destinatario_declarado,
        vence_en: validez.vence_en,
        validez_ms: validez.validez_ms,
        estado: 'PENDIENTE',
        re_de: solicitud.id,
        armada_en: ahora.toISOString(),
        correlation_id: input.correlation_id || null
      };
      p.solicitudes.push(nueva);
      p.updated_at = ahora.toISOString();
      this._persist.marcarDirty(pid);

      return {
        status: 200,
        data: {
          project_id: pid, ambito, revisado: false, estado: 'EXPIRADA', firma: null,
          firma_del_sistema: false, firma_por: 'asesor',
          solicitud: nueva,
          solicitud_expirada: solicitud,
          // 🔴 Vencida sin firma → NO se asume: se re-pregunta.
          vencida: true,
          re_preguntada: true,
          motivo: 'la solicitud de firma vencio sin firma: se expira y se RE-PREGUNTA, jamas se asume',
          abierto: { firma: 'la firma del asesor sigue pendiente: el sistema no la suple' }
        }
      };
    }

    // Pendiente y vigente → sigue preguntando. Sin asumir.
    return {
      status: 200,
      data: {
        project_id: pid, ambito, revisado: false, estado: 'PENDIENTE', firma: null,
        firma_del_sistema: false, firma_por: 'asesor',
        solicitud, vencida: false, re_preguntada: false,
        abierto: {
          firma: 'la firma del asesor esta pendiente: el sistema NO firma ni asume el silencio',
          vence_en: solicitud.vence_en ? null : 'no se declaro validez: la solicitud no vence'
        }
      }
    };
  }

  // La solicitud VIGENTE de un ambito: la ultima PENDIENTE (las expiradas quedan como historial).
  _solicitudVigente(p, ambito) {
    const ss = p.solicitudes.filter((s) => s.ambito === ambito && s.estado === 'PENDIENTE');
    return ss.length > 0 ? ss[ss.length - 1] : null;
  }

  _vencida(solicitud, ahora) {
    if (solicitud.vence_en) {
      const v = new Date(solicitud.vence_en);
      if (!Number.isNaN(v.getTime())) return ahora.getTime() > v.getTime();
    }
    if (typeof solicitud.validez_ms === 'number') {
      const armada = new Date(solicitud.armada_en);
      if (!Number.isNaN(armada.getTime())) return ahora.getTime() > armada.getTime() + solicitud.validez_ms;
    }
    // Sin validez declarada la solicitud NO vence: cero plazos cableados.
    return false;
  }

  // La validez es DATO: `vence_en` (ISO) o `validez_ms`. Sin declarar → null (no vence).
  _validez(input, armada_iso) {
    const validez_ms = (input.validez_ms !== undefined && input.validez_ms !== null && Number.isFinite(Number(input.validez_ms)))
      ? Number(input.validez_ms) : null;
    let vence_en = input.vence_en != null ? String(input.vence_en) : null;
    if (!vence_en && validez_ms !== null) {
      vence_en = new Date(new Date(armada_iso).getTime() + validez_ms).toISOString();
    }
    return { vence_en, validez_ms };
  }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-flujo-firma-v1', firmas: [], solicitudes: [] };
      this._parcelas.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // Lectura directa (mismo proceso) — no muta. El estado vigente de un ambito.
  estadoDe(pid, ambito) {
    const p = pid ? this._parcelas.get(pid) : null;
    if (!p) return null;
    const fs = p.firmas.filter((f) => f.ambito === String(ambito));
    return fs.length > 0 ? fs[fs.length - 1] : null;
  }

  // ── Tools ──
  toolFirmar(params) { return this._firmar(params); }
  toolEstado(params) { return this._estado(params); }
}

module.exports = FlujoFirma;
