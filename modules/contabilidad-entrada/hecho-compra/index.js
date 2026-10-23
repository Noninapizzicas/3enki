/**
 * contabilidad-entrada/hecho-compra — REFLEJO STATELESS (D · extracción → HECHO CONTABLE).
 *
 * PORQUÉ: la cadena documental ya sabe leer (lector-documento), clasificar
 * (clasificador-documento), extraer campos (extraccion-dato) y cuadrar cifras
 * (control-cuadre-documento). Pero un puñado de campos NO es un asiento: falta el eslabón que
 * los convierta en el HECHO que `escritor-diario` sabe apilar. Sin él, la entrada se queda en
 * "propuesta" y en cola de excepciones: el gasto nunca llega al libro. Este módulo es ese
 * eslabón, y SOLO ese: compone la partida doble y la declara; NO escribe el diario (eso es B2).
 *
 * EL CERROJO DE ESTE MÓDULO — NO SE INVENTA NADA (PGC español, determinista, cero LLM):
 *   - ALBARÁN NO ASIENTA: un albarán no devenga gasto (no hay obligación todavía). Se declara
 *     `asienta:false` con motivo `albaran_pendiente_de_factura` y se encadena al cotejo
 *     (`cruce-factura-recepcion`, N5) para esperar la factura. NO es un error, es el estado
 *     natural de una compra a medias.
 *   - TICKET y FACTURA asientan SOLO si hay fecha, base, IVA y total que cuadren
 *     (|base + cuota − total| ≤ 0,02). Sin `iva_pct` ni `iva_importe` NO se supone el 21 %:
 *     se declara `abierto.iva` y se encola. Un IVA supuesto es un IVA inventado.
 *   - La CUENTA de gasto se resuelve en orden declarado (input → config → regla-contrapartida)
 *     y se declara CUÁL se usó. Sin ninguna de las tres NO hay asiento: `abierto.cuenta_gasto`
 *     y a la cola. Jamás se elige una cuenta "razonable" por el nombre del proveedor.
 *   - Fecha normalizada a YYYY-MM-DD; si no es una fecha REAL (31/02 no existe) → `abierto.fecha`.
 *   - La suma del DEBE tiene que igualar la del HABER al céntimo; si no, no hay asiento.
 *
 * LO QUE PUBLICA:
 *   · `asienta:true`  → el HECHO `contabilidad.hecho_recibido`
 *     `{project_id, asiento, hecho, origen:'hecho-compra', correlation_id}` → lo asienta
 *     escritor-diario (B2), que es el ÚNICO que escribe el libro.
 *   · `asienta:false` → NO publica el hecho; encola en `encolado-excepcion` (A8.1) la compra
 *     dudosa con su clave natural `compra:<nif>:<numero>` (idempotente por clave aguas abajo).
 *   · albarán → NO encola (no es una excepción): encadena `cruce-factura-recepcion.cotejar.request`.
 *
 * Forma: REFLEJO → STATELESS (sin PosPersistencia, sin estado en disco). La op `componer` es
 * PREGUNTA → SIN ui_handler. Contrato congelado: docs/entrada-documental-contrato.md § 'D · hecho-compra'.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Tolerancia de cuadre del documento (céntimos de redondeo, no descuadre real).
const EPSILON = 0.02;

// Las clases que este contrato reconoce. Cualquier otra NO se interpreta: se declara.
const CLASES = ['factura', 'ticket', 'albaran', 'otro'];

class HechoCompra extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'hecho-compra';
    this.version = 'reflejo-0.1.0';
    // Defaults: el módulo funciona sin core (los tests lo instancian a pelo). onLoad los
    // sobreescribe desde el manifest. `cuenta_gasto_default:null` = NO se inventa cuenta.
    this.config = {
      cuenta_gasto_default: null,
      cuenta_iva_soportado: '472',
      cuenta_proveedores: '400',
      // Default de la CLASE: asienta (comportamiento histórico). La POLÍTICA real la declara el
      // manifest (`asentar_automatico:false` en producción = propone y espera confirmación).
      asentar_automatico: true,
      timeout_regla_ms: 6000
    };
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config[this.name]))) || {};
    // Una cuenta vacía en el manifest NO es una cuenta: se queda en null (no se inventa).
    if (cfg.cuenta_gasto_default != null && String(cfg.cuenta_gasto_default).trim() !== '') {
      this.config.cuenta_gasto_default = String(cfg.cuenta_gasto_default).trim();
    }
    if (cfg.cuenta_iva_soportado != null && String(cfg.cuenta_iva_soportado).trim() !== '') {
      this.config.cuenta_iva_soportado = String(cfg.cuenta_iva_soportado).trim();
    }
    if (cfg.cuenta_proveedores != null && String(cfg.cuenta_proveedores).trim() !== '') {
      this.config.cuenta_proveedores = String(cfg.cuenta_proveedores).trim();
    }
    if (Number(cfg.timeout_regla_ms) > 0) this.config.timeout_regla_ms = Number(cfg.timeout_regla_ms);
    // POLITICA DEL VERTICAL: mientras el dueno no lo autorice, un asiento se PROPONE y espera
    // confirmacion humana; NO se escribe el libro. Solo `true` (declarado) asienta solo.
    if (cfg.asentar_automatico !== undefined) this.config.asentar_automatico = cfg.asentar_automatico === true;
    this.logger?.info(`${this.name}.reflejo.loaded`, {
      cuenta_gasto_default: this.config.cuenta_gasto_default,
      cuenta_iva_soportado: this.config.cuenta_iva_soportado,
      cuenta_proveedores: this.config.cuenta_proveedores
    });
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una línea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onComponerRequest(e) {
    return this._atender(e, 'componer', 'hecho-compra.componer.response', async (d) => {
      const res = await this._componer(d);
      if (res.status !== 200) {
        this.eventBus?.publish('hecho-compra.componer.failed', res);
        return res;
      }
      await this._reaccionar(res, d);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // Efectos de bus: o el HECHO (lo asienta escritor-diario) o la cola / el cotejo.
  // ══════════════════════════════════════════════════════════════════════
  async _reaccionar(res, d) {
    const x = res.data;
    if (!x) return;

    // ALBARÁN: no devenga gasto. Se encadena al COTEJO (N5) para esperar la factura.
    // No va a la cola de excepciones: no es un error, es una compra a medias (§D.1).
    if (x.asienta === false && x.motivo === 'albaran_pendiente_de_factura') {
      this.eventBus?.publish('cruce-factura-recepcion.cotejar.request', {
        project_id: x.project_id,
        // El albarán es la cara de RECEPCIÓN de la compra: se entrega tal cual, sin adornos.
        recepcion: {
          proveedor: x.tercero ? x.tercero.nombre : null,
          nif: x.tercero ? x.tercero.nif : null,
          numero: x.numero,
          fecha: x.fecha_documento,
          importe: x.importe_documento,
          extraido: x.extraido
        },
        clave: x.clave,
        origen: 'hecho-compra',
        correlation_id: d.correlation_id
      });
      return;
    }

    if (x.asienta === true && x.hecho && x.hecho.asiento) {
      // MODO REVISIÓN (asentar_automatico=false, el que manda hoy): el asiento está COMPUESTO
      // y se deja en la cola tal cual, esperando al dueño. No se escribe el libro.
      // `desatasco-entrada` con accion 'resolver' lo asienta cuando se confirme.
      if (this.config.asentar_automatico !== true) {
        x.requiere_confirmacion = true;
        x.encolada = true;
        this.eventBus?.publish('encolado-excepcion.encolar.request', {
          project_id: x.project_id,
          rol: 'ENCOLADO_EXCEPCION',
          clave: x.clave,
          motivo: 'pendiente_de_confirmacion (asentar_automatico=false): asiento propuesto, el libro no se toca hasta que el dueno lo confirme',
          origen: 'hecho-compra',
          payload: {
            clase: x.clase,
            extraido: x.extraido,
            documento: x.documento,
            asiento: x.hecho.asiento,
            hecho: x.hecho,
            cuenta_gasto: x.cuenta_gasto,
            cuenta_gasto_origen: x.cuenta_gasto_origen
          },
          correlation_id: d.correlation_id
        });
        return;
      }
      // R2 · si hay HECHO, se anuncia: escritor-diario (B2) es el único que escribe el libro.
      this.eventBus?.publish('contabilidad.hecho_recibido', {
        project_id: x.project_id,
        asiento: x.hecho.asiento,
        hecho: x.hecho,
        origen: 'hecho-compra',
        correlation_id: d.correlation_id
      });
      return;
    }

    // El resto de "no asienta" son compras DUDOSAS: a la cola de lo dudoso (A8.1), con clave
    // natural (idempotente aguas abajo: la misma compra no se encola dos veces).
    if (x.asienta === false) {
      this.eventBus?.publish('encolado-excepcion.encolar.request', {
        project_id: x.project_id,
        rol: 'ENCOLADO_EXCEPCION',
        clave: x.clave,
        motivo: x.motivo,
        origen: 'hecho-compra',
        payload: {
          clase: x.clase,
          extraido: x.extraido,
          documento: x.documento,
          abierto: x.abierto
        },
        correlation_id: d.correlation_id
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // componer(input) → { status, data }  ·  campos → partida doble
  // ══════════════════════════════════════════════════════════════════════
  async _componer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const extraido = (input.extraido && typeof input.extraido === 'object') ? input.extraido : {};
    const documento = (input.documento && typeof input.documento === 'object') ? input.documento : null;

    // La clase la decide el `clasificador-documento`, no este módulo: se toma la PRIMERA clase
    // DECLARADA que venga en el input (no se adivina mirando el texto ni el nombre del proveedor).
    // El respaldo existe porque en la cadena real la clase puede viajar dentro del `documento`.
    const clase = this._clase(input, extraido, documento);

    // Identidad del tercero/documento: se declara SOLO lo que viene (nada se rellena).
    const nombre = this._texto(extraido.proveedor);
    const nif = this._texto(extraido.nif);
    const numero = this._texto(extraido.numero);
    const concepto = [nombre, numero].filter(Boolean).join(' ') || null;

    // La clave natural de la compra: idempotencia de la cola y del cotejo.
    const clave = `compra:${nif || 's/nif'}:${numero || 's/num'}`;

    const base = this._importe(extraido.base);
    const total = this._importe(extraido.total);
    const fecha = this._fecha(extraido.fecha);
    const moneda = this._texto(extraido.moneda) || 'EUR';

    // Esqueleto común de la respuesta: se rellena a medida que se puede afirmar algo.
    const salida = {
      project_id: pid,
      tipo: 'hecho-compra',
      clase,
      hecho: null,
      asienta: false,
      cuenta_gasto: null,
      cuenta_gasto_origen: null,
      cuadra: null,
      motivo: null,
      abierto: { iva: null, cuenta_gasto: null, fecha: null, clase: null, asiento: null, cifras: null },
      // Trazabilidad: lo que se usó para decidir (no se expone el texto completo del OCR).
      clave,
      tercero: { nif, nombre },
      numero,
      fecha_documento: fecha,
      importe_documento: total,
      extraido,
      documento
    };

    const noAsienta = (motivo, abierto) => {
      salida.asienta = false;
      salida.motivo = motivo;
      if (abierto) salida.abierto = { ...salida.abierto, ...abierto };
      return { status: 200, data: salida };
    };

    // ── 5. clase 'otro' (o no declarada): no hay hecho contable que componer ──
    if (clase === 'otro') {
      return noAsienta('clase_sin_asiento', {
        clase: 'el documento es de clase "otro": no hay hecho de compra que asentar (no se adivina el tipo)'
      });
    }
    if (!clase || !CLASES.includes(clase)) {
      const declarada = this._texto(input.clase) || (documento && this._texto(documento.tipo)) || null;
      return noAsienta('clase_no_declarada', {
        clase: declarada
          ? `clase declarada desconocida ("${declarada}"): sin tipo reconocido no se compone un asiento`
          : 'el input no declara la clase del documento (factura/ticket/albaran/otro): sin tipo no se compone un asiento'
      });
    }

    // ── 1. ALBARÁN: no devenga gasto; espera la factura por el cotejo ──
    if (clase === 'albaran') {
      return noAsienta('albaran_pendiente_de_factura', null);
    }

    // ── fecha: si no es una fecha REAL, no hay asiento (va a la cola) ──
    if (!fecha) {
      return noAsienta(extraido.fecha == null ? 'fecha_no_declarada' : 'fecha_invalida', {
        fecha: extraido.fecha == null
          ? 'el documento no declara fecha: una compra sin fecha no se asienta (no se pone la de hoy)'
          : `fecha no reconocida o inexistente ("${String(extraido.fecha)}"): no se asienta`
      });
    }

    // ── cifras mínimas: sin base ni total no se compone nada ──
    if (base === null || total === null) {
      return noAsienta('cifras_no_declaradas', {
        cifras: `faltan cifras (base:${base === null ? 'null' : base}, total:${total === null ? 'null' : total}): no se inventa el importe`
      });
    }

    // ── 2. IVA: `iva_importe` si viene; si no `base * iva_pct / 100`. Sin ninguno → NO se inventa ──
    let cuota = this._importe(extraido.iva_importe);
    const ivaPct = this._importe(extraido.iva_pct);
    let ivaOrigen = cuota !== null ? 'iva_importe' : null;
    if (cuota === null && ivaPct !== null) {
      cuota = this._round((base * ivaPct) / 100, 2);
      ivaOrigen = 'iva_pct';
    }
    if (cuota === null) {
      return noAsienta('iva_no_declarado', {
        iva: 'el documento no declara ni iva_importe ni iva_pct: la cuota NO se supone (sería un IVA inventado)'
      });
    }

    // ── 3. Cuenta de gasto: input → config → regla-contrapartida (A6.2). Si no, no hay asiento ──
    const cuenta = await this._resolverCuenta(input, { nif, proveedor: nombre, concepto });
    salida.cuenta_gasto = cuenta.cuenta;
    salida.cuenta_gasto_origen = cuenta.origen;
    if (!cuenta.cuenta) {
      return noAsienta('cuenta_gasto_no_declarada', {
        cuenta_gasto: 'ninguna cuenta de gasto declarada (input, config ni regla): NUNCA se inventa una cuenta'
      });
    }

    // ── cuadre del DOCUMENTO: |base + cuota − total| ≤ 0,02 (si no, a la cola, no se asienta mal) ──
    const diferencia = this._round(base + cuota - total, 2);
    salida.cuadra = Math.abs(diferencia) <= EPSILON;
    if (!salida.cuadra) {
      return noAsienta('documento_no_cuadra', {
        cifras: `base(${base}) + cuota(${cuota}) != total(${total}): diferencia ${diferencia}; no se asienta un documento que no cuadra`
      });
    }

    // ── 4. Asiento (partida doble, PGC): DEBE gasto + DEBE IVA soportado / HABER proveedores ──
    const lineas = [{ cuenta: cuenta.cuenta, debe: base, haber: 0, concepto: 'compra' }];
    if (cuota > 0) {
      lineas.push({ cuenta: this.config.cuenta_iva_soportado, debe: cuota, haber: 0, concepto: 'IVA soportado' });
    }
    lineas.push({ cuenta: this.config.cuenta_proveedores, debe: 0, haber: total, concepto: 'proveedor' });

    const sumaDebe = this._round(lineas.reduce((s, l) => s + l.debe, 0), 2);
    const sumaHaber = this._round(lineas.reduce((s, l) => s + l.haber, 0), 2);
    if (Math.abs(this._round(sumaDebe - sumaHaber, 2)) > 0.005) {
      return noAsienta('partida_doble_rota', {
        asiento: 'la partida doble no cuadra'
      });
    }

    const asiento = { fecha, concepto, lineas };
    salida.hecho = {
      fecha,
      concepto,
      importe: total,
      moneda,
      // `referencia` = el número del documento sin su prefijo de tipo (F-2026-004512 → 2026-004512),
      // que es la forma que cita el contrato congelado.
      referencia: this._referencia(numero),
      vertical: 'compras',
      tercero: { nif, nombre },
      asiento,
      // La evidencia del cálculo: con qué cuota y de dónde salió la cuenta (auditable).
      detalle: {
        base,
        iva_pct: ivaPct,
        cuota,
        iva_origen: ivaOrigen,
        total,
        suma_debe: sumaDebe,
        suma_haber: sumaHaber,
        cuenta_gasto_origen: cuenta.origen
      }
    };
    salida.asienta = true;
    salida.motivo = null;
    salida.abierto = {
      iva: null,
      cuenta_gasto: null,
      fecha: null,
      clase: null,
      asiento: null,
      cifras: null
    };
    return { status: 200, data: salida };
  }

  // ── Resolución de la cuenta de gasto (orden del contrato, se declara cuál se usó) ──
  async _resolverCuenta(input, contexto) {
    // a) la cuenta que trae el propio input (la más explícita: gana siempre)
    const delInput = this._texto(input.cuenta_gasto);
    if (delInput) return { cuenta: delInput, origen: 'input' };

    // b) la REGLA declarada del proveedor (A6.2) — lo ESPECIFICO gana a la politica general.
    //    Antes iba DESPUES de la config, así que el default (629) tapaba cualquier regla por
    //    proveedor y la regla no se usaba NUNCA. Y el contexto viajaba como OBJETO: el custodio
    //    compara strings exactos (`String(r.contexto) === contexto`) → jamas casaba.
    const claveRegla = this._claveRegla(contexto);
    const resp = claveRegla ? await this._rpc('regla-contrapartida.aplicar.request', {
      project_id: input.project_id || this.project_id,
      contexto: claveRegla
    }, { timeout_ms: this.config.timeout_regla_ms }) : null;
    // Sin respuesta / sin regla → null. `contrapartida` es el campo real de regla-contrapartida;
    // se acepta `cuenta` por si el contrato se cita con ese nombre.
    if (resp && (resp.status === 200 || resp.status === undefined)) {
      // La response del custodio viaja como { request_id, status, data:{ contrapartida, ... } }:
      // el cuerpo UTIL esta en `.data`. Leerlo solo en plano hacia que la regla nunca se viera
      // aunque el custodio respondiera 200 con su cuenta.
      const cuerpo = (resp.data && typeof resp.data === 'object') ? resp.data : resp;
      const deRegla = this._texto(cuerpo.contrapartida) || this._texto(cuerpo.cuenta);
      if (deRegla) return { cuenta: deRegla, origen: 'regla' };
    }

    // c) la cuenta declarada en la config del modulo (politica del vertical; null = no se inventa)
    const deConfig = this._texto(this.config.cuenta_gasto_default);
    if (deConfig) return { cuenta: deConfig, origen: 'config' };

    return { cuenta: null, origen: null };
  }

  // Clave canonica del contexto para la regla: `nif:<NIF>` (sin puntos ni guiones) o
  // `proveedor:<nombre>`. Es un STRING: el custodio compara contextos exactos.
  _claveRegla(contexto = {}) {
    const nif = this._texto(contexto.nif);
    if (nif) return `nif:${nif.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
    const prov = this._texto(contexto.proveedor);
    if (prov) return `proveedor:${prov}`;
    return null;
  }

  // ── Clase del documento: SOLO se acepta una clase declarada y RECONOCIDA ──
  // Orden: input.clase → documento.clase → documento.tipo → extraido.clase. Un valor que no sea
  // exactamente una de las cuatro clases NO se interpreta (podría ser un mime o el nombre de un
  // módulo): se cae al siguiente candidato y, si no hay ninguno válido, la clase queda null.
  _clase(input, extraido, documento) {
    const candidatos = [
      input.clase,
      documento ? documento.clase : null,
      documento ? documento.tipo : null,
      extraido ? extraido.clase : null
    ];
    for (const c of candidatos) {
      const t = this._texto(c);
      if (!t) continue;
      const norm = t.toLowerCase();
      if (CLASES.includes(norm)) return norm;
    }
    return null;
  }

  // ── Parseo de importes ESPAÑOLES: '69,96' → 69.96 · '1.234,56' → 1234.56 · '1234.56' → 1234.56 ──
  _importe(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? this._round(v, 2) : null;
    let s = String(v).trim().replace(/\s|\u00a0/g, '').replace(/EUR|€/gi, '');
    if (s === '') return null;
    if (s.includes(',') && s.includes('.')) {
      // Formato español: el punto agrupa millares y la coma es decimal.
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    // Cualquier otra cosa (guiones sueltos, letras, varios puntos) NO es un importe.
    if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? this._round(n, 2) : null;
  }

  // ── Normalización de fecha a YYYY-MM-DD (dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, ISO) ──
  // Una fecha que no existe (31/02) NO se "arregla": devuelve null.
  _fecha(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (s === '') return null;

    let d; let m; let y;
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]); }
    else {
      const es = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
      if (!es) return null;
      d = Number(es[1]); m = Number(es[2]); y = Number(es[3]);
      if (y < 100) y += 2000;  // '21/10/26' → 2026 (dos cifras = siglo actual)
    }
    if (!(y >= 1900 && y <= 2999) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
    // Comprobación real contra el calendario: 31/02 se cae aquí (no se normaliza a 03/03).
    const fecha = new Date(Date.UTC(y, m - 1, d));
    if (fecha.getUTCFullYear() !== y || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) return null;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // `referencia` sin el prefijo de tipo del número (F-2026-004512 → 2026-004512), si lo trae.
  _referencia(numero) {
    if (!numero) return null;
    const m = numero.match(/^[A-Za-z]{1,3}[-/ ](\d.*)$/);
    return m ? m[1] : numero;
  }

  _texto(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  }

  // ── Tools ──
  toolComponer(params) { return this._componer(params); }
}

module.exports = HechoCompra;
