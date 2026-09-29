/**
 * contabilidad-libro/vista-revisable — REFLEJO STATELESS (L2, hoja del plan).
 *
 * **LA SALIDA LEGIBLE Y REVISABLE. NO CAJA NEGRA.** Muestra cada asiento y cada calculo CON su
 * ORIGEN: la composicion determinista de la TRAZA (`traza-asiento` B4) — quien lo creo, cuando
 * y por que — junto con los apuntes y los datos declarados del asiento. El ASESOR revisa lo que
 * ve, con su procedencia a la vista.
 *
 * ATRIBUTOS del diseno: `asiento:Asiento`, `traza:TrazaAsiento`.
 * METODOS: `explicar(a:Asiento):Informe`. REGLA: composicion determinista de la traza.
 *
 * DERIVA, NO DECIDE: este reflejo NO juzga si un asiento esta bien, NO lo corrige, NO lo firma
 * (eso es de flujo-firma L3) y NO conserva la prueba (eso es de expediente-documental L7). Solo
 * EXPLICA lo que ya existe, leyendo la traza POR EVENTO. Si la traza no esta disponible, se
 * declara `traza_disponible:false` y se explica lo que si se sabe — jamas se inventa la autoria.
 *
 * Invariantes:
 *  - DETERMINISTA: mismo asiento + misma traza → misma explicacion.
 *  - Dato ausente = desconocido: sin traza NO se afirma quien ni cuando; se declara ABIERTO.
 *  - NO escribe, NO persiste, NO muta: L2 EXPLICA; el expediente (L7) CONSERVA.
 *  - Sin caja negra: toda cifra que se muestra viaja con su procedencia declarada.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja L2 del plan-construccion y diseno-oop.md (CLASE VistaRevisable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class VistaRevisable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'vista-revisable';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onExplicarRequest(e) {
    return this._atender(e, 'explicar', 'vista-revisable.explicar.response', async (d) => {
      const res = await this._explicar(d);
      if (res.status !== 200) this.eventBus?.publish('vista-revisable.explicar.failed', res);
      return res;
    });
  }

  // ── SEÑALES (fire-and-forget, TOLERANTES): el libro avisa que hay algo nuevo que explicar.
  // No se hace nada proactivo con ellas — L2 es una VISTA BAJO DEMANDA, no un acumulador:
  // solo se loguea que la vista quedo desactualizada, sin guardar nada (es stateless).
  _senal(evento, e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    this.logger?.info(`vista-revisable.senal.${evento}`, {
      module: this.name,
      project_id: d.project_id,
      asiento: d.asiento && d.asiento.numero !== undefined ? d.asiento.numero : (d.numero ?? null),
      correlation_id: d.correlation_id
    });
    return null;
  }

  // B4 → L2: una traza quedo registrada. La vista, cuando se pida, la leera.
  onTrazaRegistrada(e) { return this._senal('traza_registrada', e); }

  // B2 → L2: un asiento quedo registrado. La vista, cuando se pida, lo explicara.
  onAsientoRegistrado(e) { return this._senal('asiento_registrado', e); }

  // ── proyeccion determinista: explicar(asiento) → Informe (explica con su origen) ──
  async _explicar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const asiento = input.asiento || null;
    if (!asiento || typeof asiento !== 'object') return this._invalid('asiento');

    const numero = asiento.numero !== undefined ? asiento.numero
      : (input.numero !== undefined ? input.numero : null);
    const clave_natural = asiento.clave_natural !== undefined ? asiento.clave_natural : null;

    // 1 · Los APUNTES del asiento, tal cual estan: la vista no los recalcula ni los completa.
    const apuntes = Array.isArray(asiento.apuntes) ? asiento.apuntes.map((a) => ({
      cuenta: a && a.cuenta !== undefined ? a.cuenta : null,
      debe: a && a.debe !== undefined ? a.debe : null,
      haber: a && a.haber !== undefined ? a.haber : null
    })) : [];

    // 2 · La TRAZA (B4) POR EVENTO: quien/cuando/por que. Es el ORIGEN que evita la caja negra.
    const { marca, traza_disponible, fuente_traza } = await this._traza(pid, input, asiento, numero, clave_natural);

    // 3 · Las sumas SOLO si el asiento las trae: no se recomputan (una vista no reescribe el libro).
    const suma_debe = asiento.suma_debe !== undefined ? asiento.suma_debe
      : (asiento.cuadra !== undefined ? null : null);
    const suma_haber = asiento.suma_haber !== undefined ? asiento.suma_haber : null;

    const explicacion = {
      numero,
      clave_natural,
      fecha: asiento.fecha !== undefined ? asiento.fecha : null,
      sociedad: asiento.sociedad !== undefined ? asiento.sociedad : null,
      concepto: asiento.concepto !== undefined ? asiento.concepto : null,
      apuntes,
      suma_debe,
      suma_haber,
      cuadra: asiento.cuadra !== undefined ? asiento.cuadra : null,
      descuadre: asiento.descuadre !== undefined ? asiento.descuadre : null,
      // EL ORIGEN (sin caja negra): quien, cuando y por que quedo registrado.
      traza: marca,
      origen: {
        traza_disponible,
        fuente_traza,
        quien: marca ? marca.quien : null,
        cuando: marca ? marca.cuando : null,
        motivo: marca ? marca.motivo : null,
        // Si el asiento ya traia su propia traza declarada, se declara de donde salio.
        origen_asiento: asiento.traza && typeof asiento.traza === 'object' ? 'asiento' : (marca ? 'traza-asiento' : null)
      }
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: input.periodo != null ? input.periodo : null,
        tipo: 'vista-revisable',
        // La vista se emite SIEMPRE que haya asiento: explicar es su razon de ser.
        emitida: true,
        explicacion,
        // Todo lo que se muestra lleva su procedencia: la vista NO es una caja negra.
        procedencia: {
          apuntes: 'declarados en el asiento (no recalculados)',
          sumas: suma_debe !== null || suma_haber !== null ? 'declaradas en el asiento (no recalculadas)' : 'el asiento no trae las sumas: la vista NO las recalcula',
          traza: traza_disponible ? 'traza-asiento (B4)' : 'la traza no esta disponible: no se inventa la autoria'
        },
        // Revisable: quien revisa es el ASESOR (L3). Aqui solo se muestra.
        revisable_por: 'asesor (flujo-firma L3)',
        firmada: false,
        deriva_de: ['escritor-diario (B2)', 'traza-asiento (B4)'],
        abierto: {
          traza: traza_disponible ? null : 'traza-asiento (B4) no respondio: no se afirma quien ni cuando se creo el asiento',
          sumas: (suma_debe === null && suma_haber === null) ? 'el asiento no trae las sumas y la vista no las recalcula' : null
        }
      }
    };
  }

  // La TRAZA (B4): declarada en la peticion / en el asiento, o pedida POR EVENTO. Best-effort.
  async _traza(pid, input, asiento, numero, clave_natural) {
    if (input.traza && typeof input.traza === 'object') {
      return { marca: input.traza, traza_disponible: true, fuente_traza: 'declarada' };
    }
    if (asiento.traza && typeof asiento.traza === 'object') {
      return { marca: asiento.traza, traza_disponible: true, fuente_traza: 'asiento' };
    }
    const r = await this._rpc('traza-asiento.consultar.request',
      { project_id: pid, numero, clave_natural, asiento }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    const marca = data && data.marca ? data.marca : (Array.isArray(data && data.marcas) ? (data.marcas[data.marcas.length - 1] || null) : null);
    if (marca) return { marca, traza_disponible: true, fuente_traza: 'traza-asiento' };
    return { marca: null, traza_disponible: false, fuente_traza: null };
  }

  // ── Tools ──
  toolExplicar(params) { return this._explicar(params); }
}

module.exports = VistaRevisable;
