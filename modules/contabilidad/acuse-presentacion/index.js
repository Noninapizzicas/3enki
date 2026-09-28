/**
 * contabilidad/acuse-presentacion — PUENTE STATELESS (D13, hoja del plan).
 *
 * EL SISTEMA NO PRESENTA. Aqui se RECIBE el justificante/acuse que la
 * administracion devuelve TRAS la presentacion que hizo el ASESOR, y se LIGA a
 * su modelo (estado-presentacion-fiscal D12) y a su asiento (escritor-diario B2):
 * cierra el bucle hacia fuera. Sin acuse -> la obligacion queda NO justificada ->
 * aviso (nunca se marca justificada sin justificante).
 *
 * El CANAL de recepcion del acuse es DECLARABLE (carga manual del asesor,
 * descarga del programa, otro); si falta un canal -> se CREA (invariante de
 * puerto abierto, _conectarCanal). Las credenciales van por credential-manager
 * por EVENTO, jamas aqui.
 *
 * PUENTE (patron real, stateless): sin PosPersistencia ni project.activated EN EL
 * CODIGO. Cada op entra objeto, sale objeto. La ligadura con D12 y con el libro
 * es por EVENTO (contrato TOLERANTE: si no responden, se DECLARA la dependencia no
 * disponible y NUNCA se asume que la obligacion quedo justificada o que el acuse
 * quedo ligado). Dependencia por EVENTO, NUNCA require cruzado.
 *
 * Emisor/par de fallo: exito publica contabilidad.acuse_ligado; error su par
 * determinista. NO REUTILIZA: el retorno del acuse administrativo no existe en el
 * inventario.
 *
 * Ver hoja D13 del diseno-oop y bloque `acuse-presentacion` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Canales DECLARABLES de recepcion del acuse (la LISTA orienta; el acuse es dato).
const CANALES = ['MANUAL', 'DESCARGA_PROGRAMA', 'CORREO', 'API_ADMINISTRACION'];
// Estados posibles del acuse recibido (el juicio de si vale NO es de aqui: se registra).
const CLASES = ['ACUSE', 'JUSTIFICANTE', 'REQUERIMIENTO', 'NOTIFICACION'];

class AcusePresentacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'acuse-presentacion';
    this.version = 'reflejo-0.1.0';
    // Catalogo DECLARABLE de canales de recepcion: solo memoria (si falta, se crea).
    this._canales = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onRecibirRequest(e) {
    return this._atender(e, 'recibir', 'contabilidad.acuse.recibir.response', async (d) => {
      const res = this._recibir(d);
      if (res.status !== 200) {
        this.eventBus?.publish('contabilidad.acuse.recibir.failed', res);
        return res;
      }
      // Se LIGA el acuse a su modelo (D12) y a su asiento (B2) por EVENTO.
      const ligadura = await this._ligar({ ...d, acuse: res.data.acuse });
      if (ligadura.status === 200) {
        this.eventBus?.publish('contabilidad.acuse_ligado', {
          ...ligadura.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.acuse_ligado.failed', ligadura);
      }
      return { ...res, data: { ...res.data, ligadura: ligadura.status === 200 ? ligadura.data : null, ligado: ligadura.status === 200 } };
    });
  }

  // ── proyecciones puras (deterministas) ──

  // recibir(justificante) -> ok (canal declarable; credenciales via credential-manager).
  // El sistema RECIBE/REGISTRA: NO presenta, NO firma.
  _recibir(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const justificante = (input && (input.justificante || input.acuse)) || null;
    if (!justificante || typeof justificante !== 'object') return this._invalid('justificante');

    // De donde llega: canal declarado (o se CREA si el negocio lo declara nuevo).
    const canal = this._canalDe(input);
    if (canal.error) return canal.error;

    // A que modelo/apunta: se DECLARA, no se asume.
    const modelo = (input && (input.modelo || input.numero_modelo)) || justificante.modelo || null;
    if (!modelo) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el acuse no declara a que modelo apunta: se declara, no se asume', { no_declarado: true });
    }

    const acuse = {
      modelo,
      ejercicio: (input && input.ejercicio) || justificante.ejercicio || null,
      periodo: (input && input.periodo) || justificante.periodo || null,
      clase: this._claseDe(justificante),
      nif: (input && input.nif) || justificante.nif || null,
      sociedad: (input && (input.sociedad || input.id_sociedad)) || null,
      csv: justificante.csv || justificante.nrc || justificante.referencia || null,
      fecha_acuse: justificante.fecha || justificante.fecha_acuse || null,
      canal: canal.canal,
      recibido_en: new Date().toISOString(),
      // EL SISTEMA NO PRESENTA: el acuse es un hecho RECIBIDO, no emitido por el sistema.
      presentado_por_el_sistema: false,
      firmado_por_el_sistema: false,
      presentado_por_el_asesor: true
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        acuse,
        canal: canal.canal,
        recibido: true,
        ligado: false, // la ligadura se confirma en _ligar (por EVENTO)
        nota: 'el acuse de la presentacion del ASESOR se RECIBE y se registra: el sistema no presenta ni firma'
      }
    };
  }

  // ligar(acuse, modelo, asiento) -> ok — cierra el bucle hacia fuera.
  async _ligar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const acuse = input && (input.acuse || input.justificante);
    if (!acuse || typeof acuse !== 'object') return this._invalid('acuse');

    const modelo = (input && (input.modelo || input.numero_modelo)) || acuse.modelo || null;
    if (!modelo) return this._invalid('modelo');

    // Ligadura con la obligacion (D12): se AVANZA a justificada por EVENTO.
    // Contrato TOLERANTE: si D12 no responde, se DECLARA — no se asume justificada.
    const obligacion = await this._rpc('contabilidad.obligacion.avanzar.request', {
      project_id: pid,
      modelo,
      ejercicio: acuse.ejercicio,
      periodo: acuse.periodo,
      estado: 'JUSTIFICADA',
      acuse_ref: acuse.csv || null
    }, { timeout_ms: 4000 });
    if (!obligacion || obligacion.status !== 200) {
      return {
        status: 200,
        data: {
          project_id: pid,
          modelo,
          acuse,
          ligado: false,
          obligacion_justificada: false,
          dependencia: 'estado-presentacion-fiscal',
          simbolico: 'NO_CONFIRMADO',
          aviso: { senal: 'OBLIGACION_NO_JUSTIFICADA', motivo: 'D12 (estado-presentacion-fiscal) no confirmo el avance' },
          nota: 'no se asume justificada: sin confirmacion, la obligacion sigue sin justificante'
        }
      };
    }

    // Ligadura con el asiento (B2): el asiento del modelo se referencia por EVENTO.
    const asiento = input && (input.asiento || input.asiento_id || input.clave_natural) || null;
    let asientoLigado = false;
    if (asiento) {
      const resp = await this._rpc('contabilidad.traza.consultar.request', {
        project_id: pid,
        clave_natural: asiento.clave_natural || asiento
      }, { timeout_ms: 4000 });
      asientoLigado = !!(resp && resp.status === 200);
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        modelo,
        ejercicio: acuse.ejercicio,
        periodo: acuse.periodo,
        acuse,
        asiento: asiento || null,
        asiento_ligado: asientoLigado,
        ligado: true,
        obligacion_justificada: true,
        estado: 'JUSTIFICADA',
        cierra_el_bucle_hacia_fuera: true
      }
    };
  }

  // conectarCanal(canal) -> ok — invariante de puerto abierto: si falta, se crea.
  _conectarCanal(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const canal = (input && (input.canal || input.nombre)) || null;
    if (!canal) return this._invalid('canal');
    const entrada = {
      canal: String(canal).toUpperCase(),
      credencial_ref: (input && input.credencial_ref) || null,
      conectado: true,
      creado_en: new Date().toISOString()
    };
    this._canales.set(entrada.canal, entrada);
    return { status: 200, data: { project_id: pid, canal: entrada, creado: true, puerto_abierto: true } };
  }

  // ── helpers internos ──
  _canalDe(input) {
    const declarado = (input && (input.canal || input.canal_acuse)) || null;
    if (!declarado) {
      // Sin canal declarado no se asume: se pide declararlo (o se creara).
      return { error: this._errorResponse(422, 'PRECONDITION_FAILED',
        'el canal de recepcion del acuse no esta declarado: entra como DATO (si falta, se crea)', {
          canales: CANALES, no_declarado: true
        }) };
    }
    const canal = String(declarado).toUpperCase();
    if (!this._canales.has(canal)) this._canales.set(canal, { canal, conectado: true, creado_en: new Date().toISOString() });
    return { canal };
  }

  _claseDe(j) {
    const c = String((j && (j.clase || j.tipo)) || 'ACUSE').toUpperCase();
    return CLASES.includes(c) ? c : 'ACUSE';
  }

  // ── Tools ──
  toolRecibir(params) { return this._recibir(params); }
  toolLigar(params) { return this._ligar(params); }
  toolConectarCanal(params) { return this._conectarCanal(params); }
}

module.exports = AcusePresentacion;
