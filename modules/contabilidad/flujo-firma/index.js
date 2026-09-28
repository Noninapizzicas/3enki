/**
 * contabilidad/flujo-firma — CUSTODIO (L3 + L9, hoja del plan).
 *
 * EL CIRCUITO DE FIRMA ES DEL ASESOR. El sistema ARMA y ENTREGA la marca; NO
 * firma y NO decide. Un solo escritor de la parcela: el ASESOR (guard de rol;
 * cualquier otro rol que intente marcar/firmar se rechaza con
 * ERROR_DOS_ESCRITORES — dos escritores sobre el visto bueno = la firma deja de
 * significar algo). El nivel de firma (PERIODO / ESTADO / DOCUMENTO) es
 * DECLARABLE. Y el DELTA (L9): lo que cambio desde el ULTIMO visto bueno —
 * asientos nuevos, ajustes, reglas cambiadas — para que el asesor revise SOLO lo
 * que cambio, no todo otra vez.
 *
 * VENCE SIN FIRMA -> EXPIRA Y SE RE-PREGUNTA; JAMAIS SE ASUMA. Una firma con
 * fecha_limite vencida (o una solicitud ya expirada) no se puede marcar: se
 * declara EXPIRADA y hay que volver a solicitar. El sistema NUNCA asume el visto
 * bueno por silencio.
 *
 * CUSTODIO (patron real): store en memoria (firmas por alcance + secuencia
 * append-only de marcas + solicitudes/expedientes); PosPersistencia (storage
 * /contabilidad/flujo-firma/*.json); restaura en project.activated; flush en
 * onUnload. Dependencias por EVENTO, NUNCA por require cruzado: asiento-ajuste
 * (B5), regla-contrapartida (A6.2), regla-movimiento-bancario (E8) y el diario
 * (B2) se LEEN por EVENTO (contrato TOLERANTE: si no responden, el delta declara
 * la dependencia no disponible — no se inventa el cambio).
 *
 * Emisor/par de fallo: exito publica contabilidad.firma_registrada /
 * contabilidad.delta_revision_calculado; error su par determinista.
 * NO REUTILIZA: no existe flujo de firma del asesor en el inventario.
 *
 * Ver hojas L3/L9 del diseno-oop y bloque `flujo-firma` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol UNICO autorizado a marcar/firmar en el circuito (L3): el ASESOR.
const ROL_ASESOR = 'ASESOR';

// Codigos simbolicos deterministas del cerrojo (clase L3).
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';
const CODE_FIRMA_EXPIRADA = 'ERROR_FIRMA_EXPIRADA';

// Niveles de firma DECLARABLES (periodo/estado/documento).
const NIVELES = new Set(['PERIODO', 'ESTADO', 'DOCUMENTO']);

class FlujoFirma extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'flujo-firma';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, firmas:{<alcance>:{...}},
    //   marcas:[], ultima_firma:{<alcance>:{...}}, solicitudes:{} }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'flujo-firma.json',
      dir: '/contabilidad/flujo-firma',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.firmas) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las firmas y los expedientes del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onMarcarRequest(e) {
    return this._atender(e, 'marcar', 'contabilidad.firma.marcar.response', async (d) => {
      const res = this._procesarMarca(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.firma_registrada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.firma.marcar.failed', res);
      }
      return res;
    });
  }

  onDeltaRequest(e) {
    return this._atender(e, 'delta', 'contabilidad.firma.delta.response', async (d) => {
      const res = await this._procesarDelta(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.delta_revision_calculado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.firma.delta.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = {
        esquema: 'contabilidad-flujo-firma-v1',
        firmas: {},
        marcas: [],
        ultima_firma: {},
        solicitudes: {},
        escritor: ROL_ASESOR
      };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor (L3): solo el ASESOR marca/firma. El SISTEMA no firma.
  _verificarEscritorUnico(rol) {
    const r = String(rol || '').toUpperCase();
    if (r !== ROL_ASESOR) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'el circuito de firma tiene UN escritor: solo el ASESOR marca y firma; el sistema NO firma', {
          escritor_vigente: ROL_ASESOR,
          rol_intentado: r || null,
          simbolico: CODE_DOS_ESCRITORES,
          el_sistema_no_firma: true
        });
    }
    return null;
  }

  _nivelDe(input) {
    const n = String((input && (input.nivel || input.alcance_nivel)) || 'PERIODO').toUpperCase();
    return NIVELES.has(n) ? n : null;
  }

  _alcanceDe(input) {
    const alcance = (input && (input.alcance || input.id_alcance)) || null;
    if (alcance) return String(alcance);
    const periodo = (input && input.periodo) || null;
    const estado = (input && input.estado) || null;
    const documento = (input && input.documento) || null;
    const nivel = this._nivelDe(input) || 'PERIODO';
    if (nivel === 'PERIODO' && periodo) return `PERIODO:${periodo}`;
    if (nivel === 'ESTADO' && estado) return `ESTADO:${estado}`;
    if (nivel === 'DOCUMENTO' && documento) return `DOCUMENTO:${documento}`;
    return null;
  }

  // marcarRevisado(rol, alcance) -> ok — un solo escritor (el ASESOR).
  _marcarRevisado(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const alcance = this._alcanceDe(input);
    if (!alcance) return this._invalid('alcance');

    const d = this._obtenerOCrear(pid);
    const ahora = new Date().toISOString();
    const expirada = this._estaExpirada(pid, d, alcance, input, ahora);
    if (expirada) return expirada;

    const marca = {
      tipo: 'REVISADO',
      alcance,
      nivel: this._nivelDe(input) || 'PERIODO',
      periodo: (input && input.periodo) || null,
      estado: (input && input.estado) || null,
      documento: (input && input.documento) || null,
      rol: ROL_ASESOR,
      quien: (input && input.quien) || ROL_ASESOR,
      cuando: ahora,
      secuencia: d.marcas.length + 1,
      fecha_limite: (input && input.fecha_limite) || null,
      el_sistema_no_firma: true,
      borrable: false
    };
    d.marcas.push(marca);
    d.firmas[alcance] = marca;
    d.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        op: 'marcar',
        marca: { tipo: 'REVISADO', alcance, nivel: marca.nivel, cuando: ahora },
        registrado_por_sistema: true,
        el_sistema_no_firma: true,
        n_marcas: d.marcas.length
      }
    };
  }

  // firmar(rol, alcance) -> MarcaFirma (L3): el ASESOR firma; el sistema REGISTRA la marca.
  _firmar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const alcance = this._alcanceDe(input);
    if (!alcance) return this._invalid('alcance');

    const d = this._obtenerOCrear(pid);
    const ahora = new Date().toISOString();
    const expirada = this._estaExpirada(pid, d, alcance, input, ahora);
    if (expirada) return expirada;

    const firma = {
      alcance,
      nivel: this._nivelDe(input) || 'PERIODO',
      periodo: (input && input.periodo) || null,
      estado: (input && input.estado) || null,
      documento: (input && input.documento) || null,
      rol_firmante: ROL_ASESOR,
      firmante: (input && input.firmante) || ROL_ASESOR,
      firmado_en: ahora,
      secuencia: d.marcas.length + 1,
      hash_alcance: this._hash(`${pid}|${alcance}|${ahora}`),
      el_sistema_no_firma: true,
      sistema_solo_registra: true,
      borrable: false
    };
    d.marcas.push({ tipo: 'FIRMA', ...firma });
    d.firmas[alcance] = { tipo: 'FIRMA', ...firma };
    d.ultima_firma[alcance] = {
      alcance,
      nivel: firma.nivel,
      firmado_en: ahora,
      hash_alcance: firma.hash_alcance,
      secuencia: firma.secuencia
    };
    d.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        op: 'firmar',
        marca_firma: firma,
        el_sistema_no_firma: true,
        sistema_solo_registra: true,
        nivel_declarable: firma.nivel,
        n_marcas: d.marcas.length
      }
    };
  }

  _hash(txt) {
    let h = 0;
    for (let i = 0; i < txt.length; i++) {
      h = (h * 31 + txt.charCodeAt(i)) | 0;
    }
    return `f${(h >>> 0).toString(16)}`;
  }

  // EXPIRACION: si el alcance ya venció sin firma → NO se firma; EXPIRA y se re-pregunta.
  // JAMAS se asume el visto bueno por silencio.
  _estaExpirada(pid, d, alcance, input, ahora) {
    const sol = d.solicitudes[alcance];
    const limite = (input && input.fecha_limite) || (sol && sol.fecha_limite) || null;
    const yaExpirada = !!(sol && sol.estado === 'EXPIRADA');
    if (yaExpirada) {
      return this._errorResponse(409, CODE_FIRMA_EXPIRADA,
        'la solicitud de firma EXPURO: se re-pregunta; jamas se asume la firma', {
          alcance, estado: 'EXPIRADA', accion: 'RE_SOLICITAR', asumida: false
        });
    }
    if (limite && String(limite).slice(0, 10) < String(ahora).slice(0, 10)) {
      if (d.solicitudes[alcance]) {
        d.solicitudes[alcance].estado = 'EXPIRADA';
        d.solicitudes[alcance].expirada_en = ahora;
        d.updated_at = ahora;
        this._persist.marcarDirty(pid);
      }
      return this._errorResponse(409, CODE_FIRMA_EXPIRADA,
        `la firma del alcance ${alcance} vencio sin respuesta: EXPIRA y se re-pregunta`, {
          alcance, fecha_limite: limite, estado: 'EXPIRADA', accion: 'RE_SOLICITAR', asumida: false
        });
    }
    return null;
  }

  // procesar marcar: 'marcar' | 'firmar' segun el payload (el mismo circuito, dos actos).
  _procesarMarca(input) {
    const op = String((input && input.op) || 'FIRMA').toUpperCase();
    if (op === 'REVISADO' || op === 'MARCAR_REVISADO') return this._marcarRevisado(input);
    return this._firmar(input);
  }

  // calcularDelta(desdeUltimaFirma) -> Delta {asientosNuevos, ajustes, reglasCambiadas} (L9).
  async _calcularDelta(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const alcance = this._alcanceDe(input) || (input && input.alcance) || null;
    const d = this._obtenerOCrear(pid);
    const ultima = (alcance && d.ultima_firma[alcance]) || null;
    const desde = (input && input.desde) || (ultima && ultima.firmado_en) || null;
    const noDisponibles = [];

    // Asientos: payload o escritor-diario (B2) por EVENTO.
    let asientos = (input && (input.asientos || input.diario)) || null;
    if (!Array.isArray(asientos)) {
      const resp = await this._rpc('contabilidad.diario.leer.request', { project_id: pid }, { timeout_ms: 4000 });
      if (resp && resp.status === 200 && resp.data) {
        asientos = resp.data.diario || resp.data.asientos || [];
      } else {
        asientos = null;
        noDisponibles.push('escritor-diario');
      }
    }

    // Ajustes (B5): payload o asiento-ajuste por EVENTO.
    let ajustes = (input && input.ajustes) || null;
    if (!Array.isArray(ajustes)) {
      const resp = await this._rpc('contabilidad.ajuste.leer.request', { project_id: pid }, { timeout_ms: 4000 });
      if (resp && resp.status === 200 && resp.data) {
        ajustes = resp.data.ajustes || [];
      } else {
        ajustes = null;
        noDisponibles.push('asiento-ajuste');
      }
    }

    // Reglas cambiadas (A6.2 / E8): payload o por EVENTO.
    let reglas = (input && (input.reglas || input.reglas_cambiadas)) || null;
    if (!Array.isArray(reglas)) {
      const resp = await this._rpc('contabilidad.regla_movimiento.leer.request', { project_id: pid }, { timeout_ms: 4000 });
      if (resp && resp.status === 200 && resp.data) {
        reglas = resp.data.reglas || [];
      } else {
        reglas = null;
        noDisponibles.push('regla-contrapartida/regla-movimiento-bancario');
      }
    }

    const posteriores = (item, campo) => {
      if (!desde) return true;
      const f = item && (item[campo] || item.asentado_en || item.actualizado_en || item.fecha);
      if (!f) return true;
      return String(f) >= String(desde);
    };

    const asientosNuevos = (asientos || []).filter((a) => posteriores(a, 'asentado_en'));
    const ajustesNuevos = (ajustes || []).filter((a) => posteriores(a, 'asentado_en'));
    const reglasCambiadas = (reglas || []).filter((r) => posteriores(r, 'declarado_en'));

    return {
      status: 200,
      data: {
        project_id: pid,
        alcance,
        desde_ultima_firma: desde,
        ultima_firma: ultima,
        delta: {
          asientos_nuevos: asientosNuevos,
          n_asientos_nuevos: asientosNuevos.length,
          ajustes: ajustesNuevos,
          n_ajustes: ajustesNuevos.length,
          reglas_cambiadas: reglasCambiadas,
          n_reglas_cambiadas: reglasCambiadas.length,
          total_cambios: asientosNuevos.length + ajustesNuevos.length + reglasCambiadas.length
        },
        dependencias_no_disponibles: noDisponibles,
        determinista: true,
        nota: 'el delta da al asesor SOLO lo que cambio desde su ultimo visto bueno'
      }
    };
  }

  async _procesarDelta(input) {
    return this._calcularDelta(input);
  }

  // solicitar(alcance, fechaLimite) -> ok — abre el expediente de firma (arma y entrega).
  _solicitar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const alcance = this._alcanceDe(input);
    if (!alcance) return this._invalid('alcance');

    const d = this._obtenerOCrear(pid);
    const solicitud = {
      alcance,
      nivel: this._nivelDe(input) || 'PERIODO',
      fecha_limite: (input && input.fecha_limite) || null,
      estado: 'PENDIENTE',
      solicitada_en: new Date().toISOString(),
      solicitada_por: String((input && input.solicitante) || 'SISTEMA').toUpperCase(),
      el_sistema_no_firma: true,
      expira_sin_respuesta: true
    };
    d.solicitudes[alcance] = solicitud;
    d.updated_at = solicitud.solicitada_en;
    this._persist.marcarDirty(pid);
    return { status: 200, data: { project_id: pid, solicitud, el_sistema_no_firma: true, expira_sin_respuesta: true } };
  }

  // ── Tools ──
  toolMarcarRevisado(params) { return this._marcarRevisado(params); }
  toolFirmar(params) { return this._firmar(params); }
  toolSolicitar(params) { return this._solicitar(params); }
  toolCalcularDelta(params) { return this._calcularDelta(params); }
}

module.exports = FlujoFirma;
