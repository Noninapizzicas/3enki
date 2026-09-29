/**
 * contabilidad-libro/control-calidad-muestreo — REFLEJO STATELESS (L8, hoja del plan).
 *
 * **CONTROL POR MUESTREO: excepcion + muestra, NO revisar todo.**
 *
 * Selecciona los asientos que EXIGEN OJO HUMANO por SEÑALES DURAS (alto importe, sin regla de
 * contrapartida, contrapartida nueva, cuadre dudoso...) y, ademas, una MUESTRA aleatoria del
 * resto. El asesor revisa ESA seleccion — no el volumen entero.
 *
 * ATRIBUTOS del diseno: `umbrales:Set<Umbral>`, `reglas:ReglaContrapartida`.
 * METODOS: `seleccionar(periodo):Set<Asiento>`.
 *
 * 🔴 LOS CRITERIOS Y EL TAMANO DE MUESTRA SON DECLARABLES (ley/parametro como dato). Este
 * reflejo NO cablea ningun importe, ningun porcentaje ni ningun tamano: si el negocio no declara
 * un umbral, esa señal NO dispara y se declara que falta el criterio. Un umbral inventado
 * mandaria al asesor a revisar lo que no pidio.
 *
 * Invariantes:
 *  - DETERMINISTA: mismos asientos + mismos criterios + misma semilla → misma seleccion (una sola
 *    respuesta correcta; reproducible para que el asesor pueda rehacerla).
 *  - Excepcion + muestra, jamas "todo": un asiento ya seleccionado por señal dura no se repite en
 *    la muestra.
 *  - Dato ausente = desconocido: sin asientos no se selecciona nada; un criterio sin umbral no
 *    dispara. Nada se estima.
 *  - NO escribe, NO persiste, NO muta y NO decide: la seleccion es un DERIVADO; revisar es del asesor.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja L8 del plan-construccion y diseno-oop.md (CLASE ControlCalidadMuestreo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Señales DURAS que el reflejo sabe evaluar. Cada una es una IDENTIDAD de señal, no un criterio:
// su UMBRAL/valores los declara el negocio (cero constantes cableadas).
const SENALES_DURAS = new Set(['alto_importe', 'sin_regla', 'contrapartida_nueva', 'cuadre_dudoso', 'fuera_de_plantilla', 'sin_documento']);

class ControlCalidadMuestreo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'control-calidad-muestreo';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onSeleccionarRequest(e) {
    return this._atender(e, 'seleccionar', 'control-calidad-muestreo.seleccionar.response', async (d) => {
      const res = await this._seleccionar(d);
      if (res.status !== 200) this.eventBus?.publish('control-calidad-muestreo.seleccionar.failed', res);
      return res;
    });
  }

  // ── Fire-and-forget: un asiento quedo registrado. La seleccion es BAJO DEMANDA (stateless),
  // asi que aqui solo se deja constancia de que hay material nuevo que muestrear. No acumula.
  onAsientoRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    this.logger?.info('control-calidad-muestreo.asiento_registrado', {
      module: this.name,
      project_id: d.project_id,
      numero: d.numero !== undefined ? d.numero : (d.asiento && d.asiento.numero !== undefined ? d.asiento.numero : null),
      correlation_id: d.correlation_id
    });
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // seleccionar(periodo) → Set<Asiento> (excepcion + muestra, determinista)
  // ══════════════════════════════════════════════════════════════════════
  async _seleccionar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const periodo = input.periodo != null ? String(input.periodo) : null;

    // 1 · Los ASIENTOS: declarados, o pedidos al diario (B2) POR EVENTO. Sin asientos no se
    //     selecciona nada (no se inventa material que muestrear).
    const { asientos, fuente_asientos, asientos_disponible } = await this._asientos(pid, input, periodo);
    if (!asientos_disponible) {
      return {
        status: 200,
        data: {
          project_id: pid, periodo, tipo: 'control-calidad-muestreo',
          seleccionados: [], total_asientos: 0, total_seleccionados: 0,
          fuente_asientos: null, asientos_disponible: false,
          excepciones: [], muestra: [],
          faltan: ['asientos'],
          abierto: { asientos: 'no hay asientos declarados y escritor-diario (B2) no respondio: no se inventa material que muestrear' }
        }
      };
    }

    // 2 · Los CRITERIOS (señales duras) son DECLARABLES. Sin criterios declarados no hay excepcion.
    const criterios = this._criterios(input);
    // Las contrapartidas CONOCIDAS (para "contrapartida nueva") son dato declarable o de
    // regla-contrapartida (A6) POR EVENTO. Sin ellas, esa señal NO dispara (no se asume).
    const conocidas = await this._contrapartidasConocidas(pid, input);

    const excepciones = [];
    const restantes = [];
    for (let i = 0; i < asientos.length; i++) {
      const a = asientos[i];
      const motivos = this._evaluar(a, criterios, conocidas);
      if (motivos.length > 0) {
        excepciones.push({
          indice: i,
          numero: a && a.numero !== undefined ? a.numero : null,
          clave_natural: a && a.clave_natural !== undefined ? a.clave_natural : null,
          fecha: a && a.fecha !== undefined ? a.fecha : null,
          importe: this._importe(a),
          // La excepcion viaja CON sus MOTIVOS: el asesor ve POR QUE se le manda.
          motivos,
          asiento: a
        });
      } else {
        restantes.push({ indice: i, asiento: a });
      }
    }

    // 3 · La MUESTRA del resto: tamano DECLARABLE + semilla DECLARABLE (determinista).
    const muestra = this._muestra(restantes, input, pid, periodo);

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        tipo: 'control-calidad-muestreo',
        // La seleccion es la UNION de excepcion + muestra: jamas "revisar todo".
        seleccionados: [...excepciones, ...muestra],
        total_asientos: asientos.length,
        total_seleccionados: excepciones.length + muestra.length,
        fuente_asientos,
        asientos_disponible: true,
        excepciones,
        muestra,
        // Se declara que se aplico y con que umbral: el control es AUDITABLE, no una caja negra.
        criterios_declarados: criterios.map((c) => ({ senal: c.senal, umbral: c.umbral !== undefined ? c.umbral : null, aplicable: c.aplicable })),
        criterios_inaplicables: criterios.filter((c) => !c.aplicable).map((c) => c.senal),
        contrapartidas_conocidas: conocidas ? conocidas.valor : null,
        fuente_contrapartidas: conocidas ? conocidas.fuente : null,
        muestreo: {
          tamano_declarado: this._tamano(input),
          semilla: this._semilla(input, pid, periodo),
          universo_restante: restantes.length
        },
        // Control por muestreo, no exhaustivo: revisar TODO el volumen no es lo que se pide.
        exhaustivo: false,
        revisa: 'asesor (la seleccion es una propuesta de donde poner el ojo)',
        abierto: {
          criterios: criterios.length > 0 ? null : 'no hay criterios declarados: sin señales duras declaradas no hay excepcion (nada se cablea)',
          umbrales: criterios.filter((c) => !c.aplicable).length > 0
            ? `hay criterios sin umbral declarado: ${criterios.filter((c) => !c.aplicable).map((c) => c.senal).join(', ')}`
            : null,
          tamano_muestra: this._tamano(input) > 0 ? null : 'no se declaro tamano de muestra: solo se seleccionan excepciones (cero tamanos cableados)',
          contrapartidas: conocidas ? null : 'no se declararon contrapartidas conocidas ni respondio regla-contrapartida: la señal "contrapartida_nueva" no dispara'
        }
      }
    };
  }

  // ── Los criterios declarables: [{senal, umbral?, campo?, ...}] ──
  _criterios(input) {
    const raw = input.criterios != null ? input.criterios
      : (input.umbrales != null ? input.umbrales : null);
    if (!raw) return [];
    const lista = Array.isArray(raw) ? raw : [raw];
    const out = [];
    for (const c of lista) {
      if (c === null || c === undefined) continue;
      const obj = (typeof c === 'object') ? c : { senal: String(c) };
      const senal = obj.senal != null ? String(obj.senal).trim() : (obj.tipo != null ? String(obj.tipo).trim() : '');
      if (!senal || !SENALES_DURAS.has(senal)) continue;
      const umbral = this._num(obj.umbral);
      // "cuadre_dudoso" y "sin_regla" no necesitan umbral: son señales intrínsecas del asiento.
      const necesita_umbral = senal === 'alto_importe' || senal === 'fuera_de_plantilla';
      out.push({
        senal,
        umbral,
        campo: obj.campo != null ? String(obj.campo) : null,
        valor: obj.valor !== undefined ? obj.valor : null,
        // Un criterio de umbral SIN umbral declarado NO es aplicable: cero constantes.
        aplicable: necesita_umbral ? umbral !== null : true
      });
    }
    return out;
  }

  // Evalua un asiento contra los criterios aplicables. Devuelve los MOTIVOS (vacio = no es excepcion).
  _evaluar(a, criterios, conocidas) {
    const motivos = [];
    if (!a || typeof a !== 'object') return motivos;

    for (const c of criterios) {
      if (!c.aplicable) continue;
      if (c.senal === 'alto_importe') {
        const importe = this._importe(a);
        if (importe !== null && Math.abs(importe) >= c.umbral) {
          motivos.push({ senal: 'alto_importe', umbral: c.umbral, importe, motivo: `el importe alcanza el umbral declarado (${c.umbral})` });
        }
      } else if (c.senal === 'sin_regla') {
        // Señal DURA declarada por el asiento: no se derivo ninguna regla de contrapartida.
        if (a.sin_regla === true || a.regla_contrapartida === null) {
          motivos.push({ senal: 'sin_regla', motivo: 'el asiento no tiene regla de contrapartida asociada' });
        }
      } else if (c.senal === 'contrapartida_nueva') {
        // Necesita el conjunto de contrapartidas CONOCIDAS (dato declarable); sin el, no dispara.
        const contras = this._contrapartidas(a);
        if (conocidas && contras.length > 0) {
          const nuevas = contras.filter((x) => !conocidas.valor.includes(x));
          if (nuevas.length > 0) {
            motivos.push({ senal: 'contrapartida_nueva', contrapartidas: nuevas, motivo: 'la contrapartida no esta entre las conocidas declaradas' });
          }
        }
      } else if (c.senal === 'cuadre_dudoso') {
        // Señal intrínseca: el propio asiento declara que no cuadra o que su cuadre es dudoso.
        if (a.cuadra === false || a.cuadre_dudoso === true) {
          motivos.push({ senal: 'cuadre_dudoso', descuadre: a.descuadre !== undefined ? a.descuadre : null, motivo: 'el asiento no cuadra o su cuadre es dudoso' });
        }
      } else if (c.senal === 'sin_documento') {
        if (a.documento === null || a.sin_documento === true) {
          motivos.push({ senal: 'sin_documento', motivo: 'el asiento no declara documento origen' });
        }
      } else if (c.senal === 'fuera_de_plantilla') {
        const valor = c.campo ? (a[c.campo] !== undefined ? a[c.campo] : null) : null;
        if (c.valor !== null && valor !== null && String(valor) !== String(c.valor)) {
          motivos.push({ senal: 'fuera_de_plantilla', campo: c.campo, valor, esperado: c.valor, motivo: 'el valor declarado queda fuera de la plantilla declarada' });
        }
      }
    }
    return motivos;
  }

  // ── La MUESTRA: tamano + semilla DECLARABLES; seleccion determinista y reproducible. ──
  _muestra(restantes, input, pid, periodo) {
    const tamano = this._tamano(input);
    // Tamano 0 (o no declarado) → NO hay muestra: cero tamanos cableados, solo excepciones.
    if (tamano <= 0 || restantes.length === 0) return [];

    const n = Math.min(tamano, restantes.length);
    const rnd = this._prng(this._semilla(input, pid, periodo));
    const copia = restantes.slice();
    // Fisher-Yates determinista: misma semilla → misma muestra.
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = copia[i]; copia[i] = copia[j]; copia[j] = tmp;
    }
    return copia.slice(0, n).map((x) => ({
      indice: x.indice,
      numero: x.asiento && x.asiento.numero !== undefined ? x.asiento.numero : null,
      clave_natural: x.asiento && x.asiento.clave_natural !== undefined ? x.asiento.clave_natural : null,
      fecha: x.asiento && x.asiento.fecha !== undefined ? x.asiento.fecha : null,
      importe: this._importe(x.asiento),
      motivos: [{ senal: 'muestra', motivo: 'seleccionado por muestreo aleatorio determinista' }],
      asiento: x.asiento
    }));
  }

  _tamano(input) {
    const raw = input.muestra_tamano !== undefined ? input.muestra_tamano
      : (input.tamano_muestra !== undefined ? input.tamano_muestra
        : (input.muestra && typeof input.muestra === 'object' ? input.muestra.tamano : input.muestra));
    const n = this._num(raw);
    return n !== null && n > 0 ? Math.floor(n) : 0;
  }

  // La semilla: declarada; si no, derivada de proyecto+periodo (reproducible). Cero aleatoriedad oculta.
  _semilla(input, pid, periodo) {
    if (input.semilla !== undefined && input.semilla !== null && String(input.semilla).trim() !== '') {
      return String(input.semilla);
    }
    if (input.muestra && typeof input.muestra === 'object' && input.muestra.semilla !== undefined) {
      return String(input.muestra.semilla);
    }
    return `${pid}|${periodo != null ? periodo : ''}`;
  }

  // PRNG determinista (mulberry32) sembrado con la semilla declarada/derivada.
  _prng(semilla) {
    let h = 1779033703 ^ String(semilla).length;
    const s = String(semilla);
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── Los asientos: declarados, o pedidos al diario (B2) POR EVENTO. ──
  async _asientos(pid, input, periodo) {
    const candidatos = input.asientos != null ? input.asientos : input.libro;
    if (Array.isArray(candidatos)) return { asientos: candidatos, fuente_asientos: 'declarados', asientos_disponible: true };
    if (candidatos && typeof candidatos === 'object' && Array.isArray(candidatos.asientos)) {
      return { asientos: candidatos.asientos, fuente_asientos: 'declarados', asientos_disponible: true };
    }
    // Lectura del diario POR EVENTO (escritor-diario B2). Best-effort; si no responde, no se inventa.
    const r = await this._rpc('escritor-diario.asientos.request', { project_id: pid, periodo }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (data && Array.isArray(data.asientos)) {
      return { asientos: data.asientos, fuente_asientos: 'escritor-diario', asientos_disponible: true };
    }
    return { asientos: [], fuente_asientos: null, asientos_disponible: false };
  }

  // El conjunto de contrapartidas CONOCIDAS: declarado, o de regla-contrapartida (A6) POR EVENTO.
  async _contrapartidasConocidas(pid, input) {
    const raw = input.contrapartidas_conocidas !== undefined ? input.contrapartidas_conocidas : input.contrapartidas;
    if (Array.isArray(raw)) return { valor: raw.map((x) => String(x)), fuente: 'declaradas' };
    const r = await this._rpc('regla-contrapartida.listar.request', { project_id: pid }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    const reglas = data && Array.isArray(data.reglas) ? data.reglas : null;
    if (reglas) {
      const valor = reglas.map((x) => String((x && (x.contrapartida != null ? x.contrapartida : x.cuenta)) || '')).filter(Boolean);
      return { valor, fuente: 'regla-contrapartida' };
    }
    return null;
  }

  // Las contrapartidas que declara un asiento (cuentas de sus apuntes).
  _contrapartidas(a) {
    const apuntes = Array.isArray(a && a.apuntes) ? a.apuntes : [];
    const out = [];
    for (const ap of apuntes) {
      const c = ap && ap.cuenta != null ? String(ap.cuenta) : null;
      if (c) out.push(c);
    }
    if (a && a.contrapartida != null) out.push(String(a.contrapartida));
    return [...new Set(out)];
  }

  // El importe de un asiento: el declarado (mayor apunte de debe) — NO se recalcula el asiento.
  _importe(a) {
    if (!a || typeof a !== 'object') return null;
    const directo = this._num(a.importe != null ? a.importe : (a.total != null ? a.total : a.suma_debe));
    if (directo !== null) return directo;
    const apuntes = Array.isArray(a.apuntes) ? a.apuntes : [];
    let max = null;
    for (const ap of apuntes) {
      const v = this._num(ap && (ap.debe != null ? ap.debe : ap.haber));
      if (v === null) continue;
      if (max === null || Math.abs(v) > Math.abs(max)) max = v;
    }
    return max;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolSeleccionar(params) { return this._seleccionar(params); }
}

module.exports = ControlCalidadMuestreo;
