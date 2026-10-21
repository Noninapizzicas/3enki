/**
 * contabilidad-libro/frontera-planos — REFLEJO STATELESS (M1, hoja del plan).
 *
 * 🧱 **UNA DE LAS 3 PIEZAS ANTI-BUCLE DEL DOMINIO. EL CERROJO ESTRUCTURAL.**
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * POR QUE EXISTE (el bucle que evita)
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Contabilidad OBSERVA la operacion (los hechos que las verticales emiten) y produce SUS
 * DERIVADOS (calculos: saldos, mayores, estados, informes). Si un derivado de contabilidad
 * pudiera volver a entrar como si fuera un HECHO de la operacion, el sistema se realimentaria
 * a si mismo: contabilidad fabricaria los hechos que luego observa y el bucle no tendria suelo.
 * Este cerrojo separa los DOS PLANOS y lo hace VERIFICABLE:
 *
 *   · `plano_operacion` — los HECHOS del negocio (una venta, una entrega, un cobro real...).
 *     Contabilidad los RECIBE; NUNCA los produce.
 *   · `plano_calculo`   — los DERIVADOS de contabilidad (saldo, balanza, informe, delta...).
 *     Contabilidad los PRODUCE; NUNCA deben realimentar la operacion.
 *
 * Esta es la FRONTERA: **a la salida solo viajan calculos**. Un hecho de negocio a la salida
 * del sistema contable = FALLO (contabilidad observa los hechos y produce SUS documentos; no
 * produce los hechos que observa).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * COMO GUARDA (fail-safe, sin cablear nada)
 * ══════════════════════════════════════════════════════════════════════════════════════
 *  1 · EVIDENCIA DURA (siempre detectable): si la propia salida DECLARA ser un hecho de negocio
 *      (`plano:'hecho'`/`plano:'operacion'`, `es_hecho:true`) o DECLARA que realimenta/escribe
 *      la operacion (`realimenta:true`, `escribe_operacion:true`), el cerrojo RECHAZA (422): el
 *      bucle queda cortado aunque no haya patron declarado. Es un fallo, no una advertencia.
 *  2 · PATRON DECLARADO (`permitido:PatronDeCalculo`): el patron dice QUE planos estan permitidos
 *      a la salida. Con patron, cada salida se clasifica contra el.
 *  3 · SIN PATRON: el cerrojo NO puede verificar. Y NO se da por bueno: se declara
 *      `verificable:false`, `conforme:null` y `abierto:['patron']`. El silencio NO es
 *      conformidad — un cerrojo que aprueba lo que no sabe verificar es un cerrojo falso.
 *
 * ATRIBUTOS del diseno: `permitido:PatronDeCalculo`.
 * METODOS: `verificar(salida):bool`.
 *
 * Invariantes:
 *  - DETERMINISTA: misma salida + mismo patron → mismo veredicto. Un test lo afirma.
 *  - Dato ausente = desconocido: sin patron no hay veredicto (conforme:null), no una aprobacion.
 *  - NO escribe, NO persiste, NO muta y NO decide: verifica y declara. El veredicto es un DERIVADO.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja M1 del plan-construccion y diseno-oop.md (CLASE FronteraPlanos).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Los DOS planos que el cerrojo separa. Son IDENTIDADES de plano (las nombra el dominio), no
// criterios cableados: QUE se admite a la salida lo decide el PATRON DECLARADO.
const PLANO_OPERACION = 'operacion';
const PLANO_CALCULO = 'calculo';

class FronteraPlanos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'frontera-planos';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onVerificarRequest(e) {
    return this._atender(e, 'verificar', 'frontera-planos.verificar.response', async (d) => {
      const res = this._verificar(d);
      // Reflejo: verifica y declara; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('frontera-planos.verificar.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // verificar(salida) → bool de conformidad (solo calculos; jamas hechos de negocio)
  // ══════════════════════════════════════════════════════════════════════
  _verificar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const salida = input.salida !== undefined ? input.salida : input.s;
    if (salida === undefined || salida === null) return this._invalid('salida');

    // 1 · EVIDENCIA DURA — la propia salida declara ser un HECHO de negocio o declara
    //     realimentar la operacion. Es un FALLO estructural: se rechaza sin necesitar patron.
    const dura = this._evidenciaDura(salida, input);
    if (dura.length > 0) {
      return this._errorResponse(422, 'FRONTERA_PLANOS_ROTA',
        'solo se emiten calculos: un hecho de negocio (o una realimentacion de la operacion) a la salida es FALLO',
        {
          project_id: pid,
          evidencia: dura,
          plano_detectado: PLANO_OPERACION,
          plano_esperado: PLANO_CALCULO,
          salida,
          // El cerrojo CORTA el bucle: el derivado no vuelve a entrar como hecho.
          bucle_cortado: true
        });
    }

    // 2 · EL PATRON DECLARADO (atributo `permitido:PatronDeCalculo`): dice que planos admite la
    //     salida. Sin patron no hay veredicto posible.
    const patron = this._patron(input);
    const salidas = this._items(salida);
    const clasificadas = salidas.map((x) => ({
      plano: this._planoDe(x),
      permitido: this._permitido(x, patron)
    }));
    const noPermitidas = clasificadas.filter((c) => !c.permitido);

    // 3 · SIN PATRON: NO se da por bueno. El silencio no es conformidad (cerrojo fail-safe honesto).
    if (!patron) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'frontera-planos',
          // desconocido, no aprobado: no se puede afirmar que solo haya calculos.
          conforme: null,
          verificable: false,
          no_realimenta: null,
          salida,
          plano: null,
          planos_clasificados: clasificadas,
          num_salidas: salidas.length,
          num_no_permitidas: noPermitidas.length,
          patron_aplicado: null,
          evidencia_dura: [],
          revisa: 'asesor (el cerrojo no puede verificar sin patron declarado)',
          abierto: {
            patron: 'no se declaro el patron de calculo (`permitido`): el cerrojo NO da por bueno lo que no puede verificar (el silencio no es conformidad)'
          }
        }
      };
    }

    // 4 · CON PATRON: veredicto determinista. Conforme SOLO si toda la salida queda en los planos
    //     permitidos (y el patron no admite `operacion`, que es la frontera).
    const conforme = noPermitidas.length === 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'frontera-planos',
        conforme,
        verificable: true,
        // El cerrojo existe para esto: afirmar que el derivado NO realimenta la operacion.
        no_realimenta: conforme,
        salida,
        plano: PLANO_CALCULO,
        planos_clasificados: clasificadas,
        num_salidas: salidas.length,
        num_no_permitidas: noPermitidas.length,
        no_permitidas: noPermitidas,
        patron_aplicado: patron,
        evidencia_dura: [],
        revisa: 'asesor (el cerrojo declara; no decide que es un calculo por su cuenta)',
        abierto: {
          patron: null,
          planos: noPermitidas.length > 0
            ? `hay ${noPermitidas.length} salida(s) en planos no permitidos por el patron declarado: la frontera no se cruza`
            : null
        }
      }
    };
  }

  // EVIDENCIA DURA: la salida se declara hecho de negocio o realimentacion. Solo SEÑALES
  // ESTRUCTURALES de la propia salida (no criterios de negocio): el bucle no necesita patron.
  _evidenciaDura(salida, input) {
    const ev = [];
    const objs = this._items(salida);
    const candidatos = [salida, input, ...objs];
    for (const o of candidatos) {
      if (!o || typeof o !== 'object') continue;
      const plano = o.plano != null ? String(o.plano).toLowerCase().trim() : null;
      if (plano === PLANO_OPERACION || plano === 'hecho' || plano === 'hecho_negocio') {
        ev.push({ senal: 'plano_declarado', plano, motivo: 'la salida se declara un hecho de negocio: contabilidad observa hechos, no los produce' });
      }
      if (o.es_hecho === true) {
        ev.push({ senal: 'es_hecho', motivo: 'la salida se declara un hecho de negocio' });
      }
      if (o.realimenta === true || o.realimenta_operacion === true) {
        ev.push({ senal: 'realimenta', motivo: 'la salida declara realimentar la operacion: seria el bucle' });
      }
      if (o.escribe_operacion === true) {
        ev.push({ senal: 'escribe_operacion', motivo: 'la salida declara escribir la operacion observada' });
      }
    }
    return ev;
  }

  // El PATRON (`permitido`): DECLARABLE. Puede ser una lista de planos permitidos o un objeto
  // { planos: [...], permite_operacion: bool }. Sin patron → null (no se verifica).
  _patron(input) {
    const raw = input.permitido !== undefined ? input.permitido
      : (input.patron !== undefined ? input.patron : null);
    if (raw === null || raw === undefined) return null;
    let planos = null;
    let permite_operacion = false;
    if (Array.isArray(raw)) {
      planos = raw.map((x) => String(x).toLowerCase().trim());
    } else if (typeof raw === 'object') {
      if (Array.isArray(raw.planos)) planos = raw.planos.map((x) => String(x).toLowerCase().trim());
      permite_operacion = raw.permite_operacion === true;
    } else if (typeof raw === 'string') {
      planos = [raw.toLowerCase().trim()];
    }
    if (!planos || planos.length === 0) return null;
    return { planos, permite_operacion };
  }

  _planoDe(x) {
    if (x && typeof x === 'object' && x.plano != null) return String(x.plano).toLowerCase().trim();
    // Sin plano declarado: la salida es un derivado por defecto del cerrojo (el calculo no se declara).
    return null;
  }

  // Una salida esta permitida si el patron admite su plano (y `operacion` solo si el patron lo admite
  // explicitamente — que por defecto NO, porque es la frontera).
  _permitido(x, patron) {
    if (!patron) return false;
    const plano = this._planoDe(x);
    const p = plano === null ? PLANO_CALCULO : plano;   // sin plano declarado → derivado (calculo)
    if (p === PLANO_OPERACION) return patron.permite_operacion === true;
    return patron.planos.includes(p);
  }

  _items(salida) {
    if (Array.isArray(salida)) return salida;
    return [salida];
  }

  // ── Tools ──
  toolVerificar(params) { return this._verificar(params); }
}

module.exports = FronteraPlanos;
