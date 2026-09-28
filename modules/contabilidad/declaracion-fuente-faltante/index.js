/**
 * contabilidad/declaracion-fuente-faltante — PUENTE STATELESS (A15, hoja del plan).
 *
 * Si una vertical NO publica un hecho que se NECESITA, se DECLARA el hueco
 * (abierto + aviso). NUNCA se obliga a la fuente a producirlo: contabilidad
 * LEE, no impone (asimetria con la vertical subordinada). El hueco no se
 * rellena ni se asume vacio: se marca [ABIERTO] y se pide el aviso al motor de
 * avisos (K2). La metrica que revela el hueco es la UNICA de cobertura (A12,
 * completitud-cobertura) — aqui NO se recalcula: se LEE su `detalle.huecos`.
 *
 * PUENTE (patron real, stateless): sin PosPersistencia ni project.activated — no
 * guarda estado; reacciona a un evento de dominio y sigue. La dependencia con
 * completitud-cobertura (A12) es por EVENTO (`contabilidad.cobertura_calculada`,
 * fire-and-forget), NUNCA por require cruzado. La dependencia con `motor-avisos`
 * (K2) AUN NO EXISTE en el proyecto: el aviso se PIDE por EVENTO
 * (`contabilidad.aviso.solicitar.request`, que K2 declara en sus subscribes) y
 * si no contesta se publica CONTRATO TOLERANTE
 * (`contabilidad.aviso.solicitar.failed`, 503 DEPENDENCIA_NO_DISPONIBLE): el
 * hueco QUEDA DECLARADO igualmente (fuente_faltante_declarada), porque la
 * declaracion es de contabilidad y no depende de que K2 este vivo.
 *
 * Emisor/par de fallo: exito publica contabilidad.fuente_faltante_declarada y,
 * cuando K2 responde, el aviso queda pedido; error su par determinista.
 * NO REUTILIZA: la asimetria con la vertical subordinada es propia de esta
 * vertical (fuente: prisma de interlocutor `verticales`).
 *
 * Ver hoja A15 del diseno-oop y bloque `declaracion-fuente-faltante` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Marca de lo NO cubierto: queda abierto, no se rellena ni se asume vacio.
const MARCA_ABIERTO = 'ABIERTO';

// Origen del hueco: la fuente no publico un hecho ESPERADO (A12 -> A15).
const TIPO_HUECO = 'FUENTE_FALTANTE';

class DeclaracionFuenteFaltante extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'declaracion-fuente-faltante';
    this.version = 'reflejo-0.1.0';
    // Puente stateless: sin store que persistir.
  }

  async onUnload() { return super.onUnload(); }

  // Fire-and-forget: completitud-cobertura (A12) calculo la cobertura del periodo.
  onCoberturaCalculada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return (async () => {
      const huecos = this._detectarHueco(d);
      if (huecos.length === 0) {
        // Sin huecos NO se declara nada (nada que declarar, nada que avisar).
        return { status: 200, data: { project_id: d.project_id, huecos: [], declarado: false } };
      }
      for (const hueco of huecos) {
        const decl = this._declarar({ ...d, hueco });
        if (decl.status !== 200) {
          this.eventBus?.publish('contabilidad.fuente_faltante.failed', decl);
          continue;
        }
        // La DECLARACION es de contabilidad: se publica SIEMPRE (no depende de K2).
        this.eventBus?.publish('contabilidad.fuente_faltante_declarada', {
          ...decl.data,
          correlation_id: d.correlation_id
        });
        // Y se PIDE el aviso a K2 por EVENTO (contrato TOLERANTE).
        await this._pedirAviso(d, decl.data);
      }
      return { status: 200, data: { project_id: d.project_id, n_huecos: huecos.length, declarado: true } };
    })();
  }

  // ── proyecciones puras ──
  // detectarHueco(cobertura) -> List<Hueco> (reflejo interno; LEE la metrica unica A12).
  _detectarHueco(cobertura) {
    const c = cobertura || {};
    const detalle = c.detalle || {};
    const lista = Array.isArray(detalle.huecos) ? detalle.huecos : [];
    const verticales = Array.isArray(c.verticales_esperadas) ? c.verticales_esperadas : [];

    return lista.map((clave) => {
      // La clave de la metrica es `<pid>:<vertical>:<unidad>`: se parsea SIN inventar.
      const partes = String(clave).split(':');
      const vertical = partes.length >= 3 ? partes[1] : (verticales[0] || null);
      return {
        tipo: TIPO_HUECO,
        clave,
        project_id: c.project_id || partes[0] || null,
        vertical,
        unidad: partes.length >= 3 ? partes.slice(2).join(':') : null,
        periodo: c.periodo || null,
        marca: MARCA_ABIERTO,
        no_se_rellena: true,
        no_se_obliga_a_la_fuente: true,
        metrica: 'A12',
        recalcula_metrica: false
      };
    });
  }

  // declarar(hueco) -> declaracion [ABIERTO] + aviso pedido (K2).
  _declarar(input) {
    const hueco = input && input.hueco;
    if (!hueco || typeof hueco !== 'object') return this._invalid('hueco');
    const pid = input.project_id || hueco.project_id;
    if (!pid) return this._invalid('project_id');

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: TIPO_HUECO,
        hueco,
        marca: MARCA_ABIERTO,
        estado: MARCA_ABIERTO,
        vertical: hueco.vertical || null,
        periodo: hueco.periodo || null,
        aviso_destinatario: 'DUENO',
        aviso_motivo: 'una fuente no publico un hecho esperado: se declara el hueco, no se obliga',
        no_se_obliga_a_la_fuente: true,
        no_se_asume_vacio: true,
        declarado_por: 'CONTABILIDAD'
      }
    };
  }

  // Aviso a motor-avisos (K2) por EVENTO. CONTRATO TOLERANTE: K2 AUN NO EXISTE.
  async _pedirAviso(d, declaracion) {
    const payload = {
      project_id: declaracion.project_id,
      origen: 'A15_DECLARACION_FUENTE_FALTANTE',
      tipo: 'HUECO_COBERTURA',
      marca: MARCA_ABIERTO,
      motivo: declaracion.aviso_motivo,
      destinatario: declaracion.aviso_destinatario,
      contexto: {
        vertical: declaracion.vertical,
        periodo: declaracion.periodo,
        clave: declaracion.hueco && declaracion.hueco.clave,
        cobertura: { esperados: d.esperados, recibidos: d.recibidos, huecos: d.huecos, tasa: d.tasa }
      },
      correlation_id: d && d.correlation_id
    };

    const resp = await this._rpc('contabilidad.aviso.solicitar.request', payload, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) {
      // K2 no esta vivo (aun no construido) o rechazo: el hueco SIGUE declarado
      // — se declara el fallo, NO se fabrica un aviso.
      this.eventBus?.publish('contabilidad.aviso.solicitar.failed', {
        status: (resp && resp.status) || 503,
        error: {
          code: 'DEPENDENCIA_NO_DISPONIBLE',
          message: 'motor-avisos (K2) no respondio: el hueco queda DECLARADO [ABIERTO], no se fabrica el aviso',
          details: { dependencia: 'motor-avisos', vertical: declaracion.vertical, clave: declaracion.hueco && declaracion.hueco.clave }
        }
      });
      return null;
    }
    return resp;
  }

  // ── Tools ──
  toolDetectarHueco(params) { return this._detectarHueco(params.cobertura || params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = DeclaracionFuenteFaltante;
