'use strict';

/**
 * alta — B2 · AltaDeCuenta · PUENTE (orquesta; no reimplementa).
 *
 * Dar de alta una cuenta es la ceremonia que PONE EN MARCHA el resto del puente.
 * No es un formulario: son siete pasos que ya existen en otras piezas, en un
 * orden que no se puede cambiar porque cada uno supone el anterior:
 *
 *   1. padron.inscribir              B1 · la cuenta tiene dueno y aparato
 *   2. ficha.declarar                E1 · identidad y voz declaradas por el proyecto
 *   3. catalogo.recetas_vigentes     A4.4 · el saber hacer comun de la plataforma
 *   4. ventana.declarar              H3 · W7: cuando puede ocupar el aparato
 *   5. nivel.declarar                Q3 · cuanto puede hacer sin preguntar
 *   6. ensayo.ejecutar               A4.3 · las anclas de HOY estan
 *   7. primera_operacion.leer        O1/O2 · la primera prueba, leyendo (nunca publicando)
 *
 * TRES REGLAS DURAS, y por que cada una existe:
 *
 *   1. **No hay alta sin una persona.** El puente no abre sesiones ni guarda
 *      credenciales (V1): abre el alta en `esperando_persona` y espera a que una
 *      persona ponga las manos en el aparato. La sesion la abre `dueno`; si la
 *      intenta abrir `agente` o `sistema`, se rechaza con su nombre. Un sistema
 *      que se abre solo la puerta no tiene puerta.
 *
 *   2. **Un alta atascada NO bloquea a nadie.** Cada cuenta tiene SU ceremonia y
 *      su estado; no hay un candado global de altas. Mientras la cuenta A espera
 *      a una persona, la cuenta B se da de alta y opera, y el proyecto C ni se
 *      entera. Un alta esperando es un alta esperando, no un sistema parado.
 *
 *   3. **Si un paso falta, se NOMBRA y se para ahi.** No se salta al siguiente ni
 *      se rellena con lo plausible: se devuelve `paso_sin_pieza` /
 *      `paso_rechazo` con el `paso_faltante` y el recorrido hasta ese punto. El
 *      alta se queda `detenida` en ese paso y `continuar()` la retoma EN EL MISMO
 *      SITIO cuando la pieza o el dato aparecen.
 *
 * LO QUE ESTA PIEZA NO HACE (a proposito):
 *   - NO escribe el padron: se lo pide a B1, que es el unico dueno.
 *   - NO declara la ficha: se la pide a E1 (la voz la declara el proyecto, no el puente).
 *   - NO crea recetas: el saber hacer es comun (P3).
 *   - NO decide el nivel: lo lee de Q3, que ya sabe que sin declaracion manda el
 *     conservador.
 *   - NO ensaya a mano: llama a A4.3 con la mirada que trae el aparato.
 *   - NO firma el veredicto de la primera lectura: lo trae O1/O2; aqui solo se
 *     comprueba que sea `ocurrio` CON evidencia, y que sea una LECTURA.
 *
 * PUENTE: compone y habla por el bus. Sin reloj propio (el `momento` entra en el
 * payload), sin red, sin dependencias nuevas. Nunca lanza: un paso que revienta
 * se cuenta como paso rechazado con su detalle.
 *
 * Ver plan-construccion.md (flujo 5, bloque 15) y diseno-oop.md "B2 · AltaDeCuenta".
 */

const { es_objeto, es_instante, texto_no_vacio, QUIENES, clonar } = require('../core/formas');
const padron_puro = require('./padron');
const nivel_q3 = require('../autonomia/nivel');
const ensayo_a43 = require('../recetas/ensayo');

const PLATAFORMA = 'instagram';

/**
 * Los siete pasos, en el orden en que se recorren. `id` es el nombre que se
 * devuelve cuando el alta se para; `pieza` dice de quien es el paso, para que un
 * fallo se pueda mandar a arreglar sin buscarlo.
 */
const PASOS = Object.freeze([
  Object.freeze({
    id: 'padron.inscribir',
    pieza: 'B1 · PadronDeCuentas',
    titulo: 'inscribir la cuenta en su proyecto y su aparato'
  }),
  Object.freeze({
    id: 'ficha.declarar',
    pieza: 'E1 · FichaDeCuenta',
    titulo: 'declarar identidad y voz (sin voz solo se lee)'
  }),
  Object.freeze({
    id: 'catalogo.recetas_vigentes',
    pieza: 'A4.4 · CatalogoDeRecetas',
    titulo: 'poner a disposicion las recetas vigentes de la plataforma'
  }),
  Object.freeze({
    id: 'ventana.declarar',
    pieza: 'H3 · ModoDegradado (W7)',
    titulo: 'declarar la ventana de servicio del aparato'
  }),
  Object.freeze({
    id: 'nivel.declarar',
    pieza: 'Q3 · NivelDeAutonomia',
    titulo: 'resolver el nivel de autonomia (sin declaracion, el conservador)'
  }),
  Object.freeze({
    id: 'ensayo.ejecutar',
    pieza: 'A4.3 · EnsayoEnSeco',
    titulo: 'ensayar las recetas con las anclas de hoy'
  }),
  Object.freeze({
    id: 'primera_operacion.leer',
    pieza: 'O1/O2 · el testigo',
    titulo: 'primera operacion real: LEER con testigo'
  })
]);

const PASO_IDS = Object.freeze(PASOS.map((p) => p.id));

// Estados de la ceremonia. `detenida` es un estado, no un fallo definitivo: se
// retoma con `continuar()` cuando aparece lo que faltaba.
const ESTADOS = Object.freeze(['esperando_persona', 'en_curso', 'operativa', 'detenida', 'abortada']);

// W7: el criterio por defecto es "disponible cuando la persona no lo este
// usando". Se declara aqui como VALOR DECLARADO, no como horario inventado: el
// puente no se reserva horas del movil de nadie.
const VENTANA_POR_DEFECTO = 'cuando_la_persona_no_lo_este_usando';

// La primera operacion real es LEER. Publicar de estreno es la forma mas cara de
// descubrir que la sesion no estaba bien: si la capacidad no esta en esta lista,
// el paso se rechaza.
const CAPACIDADES_DE_LECTURA = Object.freeze(['mirar', 'leer', 'observar', 'retrato']);

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  ALTA_YA_EN_CURSO: 'alta_ya_en_curso',
  ALTA_DESCONOCIDA: 'alta_desconocida',
  ALTA_YA_CERRADA: 'alta_ya_cerrada',
  ALTA_ABORTADA: 'alta_abortada',
  SESION_NO_ABIERTA: 'sesion_no_abierta',
  SESION_LA_ABRE_UNA_PERSONA: 'la_sesion_la_abre_una_persona',
  PASO_SIN_PIEZA: 'paso_sin_pieza',
  PASO_RECHAZO: 'paso_rechazo',
  ERROR_EN_EL_PASO: 'error_en_el_paso',
  SIN_RECETAS: 'sin_recetas_vigentes',
  RECETAS_NO_VIGENTES: 'recetas_no_vigentes',
  SIN_MIRADA: 'sin_mirada_del_aparato',
  ENSAYO_NO_APTO: 'ensayo_no_apto',
  SIN_PRUEBA: 'sin_prueba_de_la_primera_operacion',
  PRUEBA_NO_CONCLUYENTE: 'prueba_no_concluyente',
  PRIMERA_OPERACION_NO_ES_LECTURA: 'primera_operacion_no_es_lectura'
});

function vacio(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function fallo(motivo, extra) {
  return Object.assign({ ok: false, motivo }, extra || {});
}

/** Clave de la ceremonia: una cuenta en un proyecto. */
function clave_de(proyecto, cuenta) {
  return `${String(proyecto).trim()}::${padron_puro.normalizar_cuenta(cuenta)}`;
}

/** Lo que el alta puede ensenar de si misma: sin el payload crudo dentro. */
function vista(alta) {
  const v = clonar(alta);
  delete v.datos;
  return v;
}

/**
 * Contexto que recibe un puerto de paso. Lleva el alta (para leer lo ya hecho),
 * la entrada original (lo que declaro el dueno) y los datos de la ceremonia
 * (quien abrio la sesion y cuando).
 */
function contexto(alta, paso, datos) {
  return { alta: vista(alta), paso, entrada: alta.datos, datos: datos || {} };
}

// ---------------------------------------------------------------------------
// B2 · el puente
// ---------------------------------------------------------------------------

class AltaDeCuenta {
  /**
   * @param {{padron?:object, fichas?:object, catalogo?:object,
   *          puertos?:Object<string,Function>, bus?:object}} [opciones]
   *   `padron` es el modulo B1 (con `.alta()` y `.consultar()`), `fichas` el
   *   almacen E1 del mismo modulo; `catalogo` el modulo A4.4 si se compone en
   *   proceso. `puertos` permite sustituir UN paso (pruebas, o un adaptador que
   *   no viva en este bus) sin tocar los otros seis.
   */
  constructor(opciones = {}) {
    this._padron = opciones.padron || null;
    this._fichas = opciones.fichas || (this._padron && this._padron.fichas) || null;
    this._catalogo = opciones.catalogo || null;
    this._puertos = es_objeto(opciones.puertos) ? Object.assign({}, opciones.puertos) : {};
    this._bus = opciones.bus || null;
    this._altas = new Map();   // clave -> alta (una ceremonia por cuenta y proyecto)
  }

  /** El bus, cuando el modulo arranca (el puente no adivina su bus). */
  con_bus(bus) {
    this._bus = bus || null;
    return this;
  }

  /** Sustituye un paso por otro puerto (pruebas o adaptador externo). */
  con_puerto(id, fn) {
    if (PASO_IDS.includes(id) && typeof fn === 'function') this._puertos[id] = fn;
    return this;
  }

  // ---- consulta ------------------------------------------------------------

  /**
   * Abre la ceremonia. Nace SIEMPRE en `esperando_persona`: el alta no abre la
   * sesion por su cuenta, y no se toca el padron hasta que una persona la abre.
   */
  iniciar(entrada) {
    const e = es_objeto(entrada) ? entrada : {};
    const faltan = [];
    for (const campo of ['proyecto', 'cuenta', 'aparato', 'momento', 'quien']) {
      if (vacio(e[campo])) faltan.push(campo);
    }
    const cuenta = padron_puro.normalizar_cuenta(e.cuenta);
    const invalidos = [];
    if (!faltan.includes('cuenta') && !padron_puro.CUENTA_RE.test(cuenta)) invalidos.push('cuenta');
    if (!faltan.includes('momento') && !es_instante(e.momento)) invalidos.push('momento');
    if (!faltan.includes('quien') && !QUIENES.includes(String(e.quien).trim())) invalidos.push('quien');
    if (faltan.length || invalidos.length) {
      return fallo(MOTIVOS.ENTRADA_INVALIDA, { faltan, invalidos });
    }

    const proyecto = String(e.proyecto).trim();
    const aparato = String(e.aparato).trim();
    const clave = clave_de(proyecto, cuenta);
    const previa = this._altas.get(clave);
    if (previa && previa.estado === 'operativa') {
      return fallo(MOTIVOS.ALTA_YA_CERRADA, {
        clave,
        alta: vista(previa),
        pista: 'la cuenta ya esta operativa: cambiar de proyecto es traspaso y retirarla es baja'
      });
    }
    if (previa && (previa.estado === 'esperando_persona' || previa.estado === 'en_curso' || previa.estado === 'detenida')) {
      return fallo(MOTIVOS.ALTA_YA_EN_CURSO, {
        clave,
        alta: vista(previa),
        pista: 'la ceremonia de esta cuenta ya esta abierta: se continua o se aborta, no se abre otra'
      });
    }

    const alta = {
      clave,
      cuenta,
      plataforma: texto_no_vacio(e.plataforma) ? String(e.plataforma).trim().toLowerCase() : PLATAFORMA,
      proyecto,
      aparato,
      estado: 'esperando_persona',
      paso_actual: null,        // no se ha recorrido ningun paso todavia
      donde_esta: `esperando_persona: falta que una persona abra la sesion en ${aparato}; el alta no la abre`,
      sesion: { pedida: true, abierta: false, por: null, momento: null },
      pasos: PASOS.map((p) => Object.assign({}, p)),
      recorrido: [],
      asiento: null,
      ficha: null,
      recetas: [],
      ventana_servicio: null,
      nivel: null,
      ensayo: null,
      prueba: null,
      abierta_en: String(e.momento).trim(),
      cerrada_en: null,
      motivo: null,
      datos: clonar(e)
    };
    this._altas.set(clave, alta);

    return {
      ok: true,
      clave,
      alta: vista(alta),
      estado_alta: alta.estado,
      esperando_persona: true,
      pasos: PASOS.length,
      donde_esta: alta.donde_esta,
      hace_falta: `una persona abriendo la sesion en ${aparato} (el puente no escribe credenciales)`
    };
  }

  /** Pide la sesion (lo que el alta necesita de una persona). No la abre. */
  pedir_sesion(sel) {
    const alta = this._buscar(sel);
    if (!alta) return fallo(MOTIVOS.ALTA_DESCONOCIDA, { clave: this._clave_de_sel(sel) });
    return {
      ok: true,
      clave: alta.clave,
      cuenta: alta.cuenta,
      aparato: alta.aparato,
      estado_alta: alta.estado,
      esperando_persona: alta.estado === 'esperando_persona',
      hace_falta: `abrir la sesion de ${alta.cuenta} en ${alta.aparato}`,
      no_abre_credenciales: true,
      donde_esta: alta.donde_esta
    };
  }

  /** El estado de una ceremonia (o de todas, para ver que una atascada no para el resto). */
  estado(sel) {
    if (sel === undefined || sel === null) {
      return {
        ok: true,
        altas: Array.from(this._altas.values()).map((a) => ({
          clave: a.clave,
          cuenta: a.cuenta,
          proyecto: a.proyecto,
          estado: a.estado,
          paso_actual: a.paso_actual,
          donde_esta: a.donde_esta
        })),
        total: this._altas.size
      };
    }
    const alta = this._buscar(sel);
    if (!alta) return fallo(MOTIVOS.ALTA_DESCONOCIDA, { clave: this._clave_de_sel(sel) });
    return { ok: true, alta: vista(alta), estado_alta: alta.estado, donde_esta: alta.donde_esta };
  }

  /** Las cuentas que hoy estan esperando a una persona (sin bloquear a las demas). */
  esperando_persona() {
    return Array.from(this._altas.values())
      .filter((a) => a.estado === 'esperando_persona')
      .map((a) => ({ clave: a.clave, cuenta: a.cuenta, proyecto: a.proyecto, desde: a.abierta_en }));
  }

  abortar(sel, motivo) {
    const alta = this._buscar(sel);
    if (!alta) return fallo(MOTIVOS.ALTA_DESCONOCIDA, { clave: this._clave_de_sel(sel) });
    if (alta.estado === 'operativa') {
      return fallo(MOTIVOS.ALTA_YA_CERRADA, { clave: alta.clave, alta: vista(alta) });
    }
    alta.estado = 'abortada';
    alta.motivo = texto_no_vacio(motivo) ? String(motivo).trim() : 'abortada sin motivo declarado';
    alta.donde_esta = `abortada: ${alta.motivo}`;
    return { ok: true, clave: alta.clave, estado_alta: alta.estado, alta: vista(alta) };
  }

  // ---- la sesion de una persona -------------------------------------------

  /**
   * Una persona abre la sesion en el aparato. ESTE es el unico punto del sistema
   * donde un humano tiene que poner las manos; despues se recorren los siete
   * pasos, en orden, parando en el primero que falte o rechace.
   *
   * @param {string|object} sel clave `proyecto::cuenta` o `{proyecto, cuenta}`
   * @param {{quien?:string, momento?:string, mirada?:object, prueba?:object}} [datos]
   */
  async abrir_sesion(sel, datos = {}) {
    const alta = this._buscar(sel);
    if (!alta) return fallo(MOTIVOS.ALTA_DESCONOCIDA, { clave: this._clave_de_sel(sel) });
    if (alta.estado === 'operativa') return fallo(MOTIVOS.ALTA_YA_CERRADA, { clave: alta.clave, alta: vista(alta) });
    if (alta.estado === 'abortada') return fallo(MOTIVOS.ALTA_ABORTADA, { clave: alta.clave, motivo: alta.motivo, alta: vista(alta) });

    const d = es_objeto(datos) ? datos : {};
    const quien = texto_no_vacio(d.quien) ? String(d.quien).trim() : 'dueno';
    if (!QUIENES.includes(quien) || quien !== 'dueno') {
      return fallo(MOTIVOS.SESION_LA_ABRE_UNA_PERSONA, {
        clave: alta.clave,
        quien,
        pista: 'la sesion la abre el dueno delante del aparato; el agente y el sistema no abren sesiones'
      });
    }
    const momento = texto_no_vacio(d.momento) ? String(d.momento).trim() : alta.abierta_en;
    if (!es_instante(momento)) {
      return fallo(MOTIVOS.ENTRADA_INVALIDA, { faltan: [], invalidos: ['momento'], clave: alta.clave });
    }

    alta.sesion = { pedida: true, abierta: true, por: quien, momento };
    alta.estado = 'en_curso';
    alta.donde_esta = 'en_curso: sesion abierta por una persona; empezando el paso 1 de 7';
    return this._recorrer(alta, d);
  }

  /**
   * Retoma una ceremonia `detenida` EN EL PASO donde se paro. No reinicia: lo ya
   * recorrido sigue hecho y el padron no se reinscribe (B1 rechazaria el alta).
   */
  async continuar(sel, datos = {}) {
    const alta = this._buscar(sel);
    if (!alta) return fallo(MOTIVOS.ALTA_DESCONOCIDA, { clave: this._clave_de_sel(sel) });
    if (alta.estado === 'operativa') return fallo(MOTIVOS.ALTA_YA_CERRADA, { clave: alta.clave, alta: vista(alta) });
    if (alta.estado === 'abortada') return fallo(MOTIVOS.ALTA_ABORTADA, { clave: alta.clave, motivo: alta.motivo });
    if (!alta.sesion.abierta) {
      return fallo(MOTIVOS.SESION_NO_ABIERTA, {
        clave: alta.clave,
        hace_falta: 'una persona abriendo la sesion (el alta no la abre)',
        alta: vista(alta)
      });
    }
    alta.estado = 'en_curso';
    return this._recorrer(alta, es_objeto(datos) ? datos : {});
  }

  // ---- el recorrido --------------------------------------------------------

  async _recorrer(alta, datos) {
    const desde = alta.paso_actual ? PASO_IDS.indexOf(alta.paso_actual) : alta.recorrido.length;
    const inicio = desde < 0 ? 0 : desde;

    for (let i = inicio; i < PASOS.length; i += 1) {
      const paso = PASOS[i];
      alta.paso_actual = paso.id;
      const puerto = this._puerto(paso.id);

      // Un paso sin pieza se NOMBRA y se para aqui: no se salta al siguiente.
      if (!puerto) {
        return this._parar(alta, paso, MOTIVOS.PASO_SIN_PIEZA, {
          falta: `la pieza que hace ${paso.id} (${paso.pieza})`,
          donde_esta: `detenida en ${paso.id} (${paso.pieza}): falta la pieza`
        });
      }

      let r;
      try {
        r = await puerto(contexto(alta, paso, datos));
      } catch (err) {
        r = fallo(MOTIVOS.ERROR_EN_EL_PASO, { detalle: err && err.message });
      }

      if (!r || r.ok !== true) {
        const motivo = (r && r.motivo) || MOTIVOS.PASO_RECHAZO;
        return this._parar(alta, paso, motivo, {
          falta: (r && r.falta) || null,
          detalle: r && r.detalle,
          faltan: (r && r.faltan) || [],
          invalidos: (r && r.invalidos) || [],
          faltas: (r && r.faltas) || [],
          donde_esta: `detenida en ${paso.id} (${paso.pieza}): ${motivo}${r && r.falta ? ` · falta ${r.falta}` : ''}`
        });
      }

      this._aplicar(alta, paso.id, r);
      alta.recorrido.push({
        paso: paso.id,
        pieza: paso.pieza,
        ok: true,
        resumen: r.resumen || null,
        momento: texto_no_vacio(datos.momento) ? String(datos.momento).trim() : alta.sesion.momento
      });
      alta.paso_actual = i + 1 < PASOS.length ? PASOS[i + 1].id : null;
      alta.donde_esta = i + 1 < PASOS.length
        ? `en_curso: ${i + 1} de ${PASOS.length} hechos; ahora ${PASOS[i + 1].id}`
        : 'en_curso: los siete pasos hechos; cerrando el alta';
    }

    alta.estado = 'operativa';
    alta.cerrada_en = texto_no_vacio(datos.momento) ? String(datos.momento).trim() : alta.sesion.momento;
    alta.motivo = null;
    alta.donde_esta = 'operativa: los siete pasos recorridos y la primera lectura con testigo';
    return {
      ok: true,
      clave: alta.clave,
      alta: vista(alta),
      estado_alta: alta.estado,
      cuenta_operativa: true,
      pasos_recorridos: alta.recorrido.length,
      donde_esta: alta.donde_esta
    };
  }

  _parar(alta, paso, motivo, extra) {
    alta.estado = 'detenida';
    alta.motivo = motivo;
    alta.donde_esta = (extra && extra.donde_esta) || `detenida en ${paso.id}: ${motivo}`;
    alta.recorrido.push({
      paso: paso.id,
      pieza: paso.pieza,
      ok: false,
      motivo,
      falta: (extra && extra.falta) || null,
      momento: alta.sesion.momento
    });

    const out = {
      ok: false,
      motivo,
      clave: alta.clave,
      paso_faltante: paso.id,
      pieza: paso.pieza,
      estado_alta: alta.estado,
      donde_esta: alta.donde_esta,
      alta: vista(alta),
      pasos_hechos: alta.recorrido.filter((p) => p.ok).length,
      continuable: true
    };
    for (const campo of ['falta', 'detalle', 'faltan', 'invalidos', 'faltas']) {
      if (extra && extra[campo] !== undefined && extra[campo] !== null) out[campo] = extra[campo];
    }
    return out;
  }

  /** Guarda el resultado de un paso en la ceremonia (nunca el estado del almacen). */
  _aplicar(alta, id, r) {
    if (id === 'padron.inscribir') {
      alta.asiento = r.asiento ? clonar(r.asiento) : null;
      return;
    }
    if (id === 'ficha.declarar') {
      alta.ficha = r.ficha ? clonar(r.ficha) : null;
      alta.ficha_modo = r.modo || null;            // lectura | operativa
      alta.puede_operar = r.puede_operar === true; // con voz declarada, si
      return;
    }
    if (id === 'catalogo.recetas_vigentes') {
      alta.recetas = Array.isArray(r.recetas) ? r.recetas.map(clonar) : [];
      return;
    }
    if (id === 'ventana.declarar') {
      alta.ventana_servicio = clonar(r.ventana);
      return;
    }
    if (id === 'nivel.declarar') {
      alta.nivel = { nivel: r.nivel, origen: r.origen, motivo: r.motivo || null };
      return;
    }
    if (id === 'ensayo.ejecutar') {
      alta.ensayo = { apto: r.apto === true, recetas: r.recetas || 0, faltas: r.faltas || [] };
      return;
    }
    if (id === 'primera_operacion.leer') {
      alta.prueba = clonar(r.prueba);
    }
  }

  // ---- los puertos ---------------------------------------------------------

  _puerto(id) {
    if (typeof this._puertos[id] === 'function') return this._puertos[id];
    switch (id) {
      case 'padron.inscribir':
        return this._padron ? (ctx) => this._paso_padron(ctx) : null;
      case 'ficha.declarar':
        return this._fichas ? (ctx) => this._paso_ficha(ctx) : null;
      case 'catalogo.recetas_vigentes':
        return (ctx) => this._paso_catalogo(ctx);
      case 'ventana.declarar':
        return (ctx) => this._paso_ventana(ctx);
      case 'nivel.declarar':
        return (ctx) => this._paso_nivel(ctx);
      case 'ensayo.ejecutar':
        return (ctx) => this._paso_ensayo(ctx);
      case 'primera_operacion.leer':
        return (ctx) => this._paso_primera_operacion(ctx);
      default:
        return null;
    }
  }

  /** 1 · B1 inscribe. El alta NO escribe el padron: se lo pide. */
  async _paso_padron(ctx) {
    const e = ctx.entrada;
    const a = ctx.alta;
    const r = await this._padron.alta({
      plataforma: a.plataforma,
      cuenta: a.cuenta,
      proyecto: a.proyecto,
      aparato: a.aparato,
      momento: ctx.datos.momento || e.momento,
      quien: ctx.datos.quien || e.quien,
      motivo: e.motivo,
      sello: e.sello
    });
    if (!r || r.ok !== true) {
      return fallo((r && r.motivo) || MOTIVOS.PASO_RECHAZO, {
        falta: r && r.faltan && r.faltan.length ? `en la inscripcion: ${r.faltan.join(', ')}` : null,
        faltan: (r && r.faltan) || [],
        invalidos: (r && r.invalidos) || [],
        pista: r && r.pista
      });
    }
    return { ok: true, asiento: r.asiento, resumen: `inscrita ${a.cuenta} en ${a.proyecto}/${a.aparato}` };
  }

  /** 2 · E1 declara la ficha. La voz la trae el proyecto; aqui no se inventa. */
  async _paso_ficha(ctx) {
    const e = ctx.entrada;
    const a = ctx.alta;
    const r = await this._fichas.declarar({
      plataforma: a.plataforma,
      cuenta: a.cuenta,
      proyecto: a.proyecto,
      aparato: a.aparato,
      momento: ctx.datos.momento || e.momento,
      quien: ctx.datos.quien || 'dueno',
      autorizacion_id: e.autorizacion_id,
      identidad_visible: e.identidad_visible,
      voz: e.voz,
      limites: e.limites
    });
    if (!r || r.ok !== true) {
      return fallo((r && r.motivo) || MOTIVOS.PASO_RECHAZO, {
        falta: r && r.faltan && r.faltan.length ? `en la ficha: ${r.faltan.join(', ')}` : null,
        faltan: (r && r.faltan) || [],
        invalidos: (r && r.invalidos) || [],
        pista: r && r.pista
      });
    }
    return {
      ok: true,
      ficha: r.ficha,
      modo: r.modo,
      puede_operar: r.puede_operar === true,
      resumen: `ficha declarada (modo ${r.modo}${r.puede_operar ? '' : ': sin voz solo se lee'})`
    };
  }

  /**
   * 3 · A4.4 pone a disposicion las recetas vigentes. El alta no las crea: o las
   * trae el catalogo (modulo/puerto) o vienen ya en la entrada. Sin recetas
   * vigentes no hay nada que ensayar, y sin ensayo no se opera.
   */
  async _paso_catalogo(ctx) {
    const a = ctx.alta;
    const e = ctx.entrada;

    let recetas = Array.isArray(e.recetas) ? e.recetas : null;
    if (!recetas && this._catalogo) {
      const r = await this._catalogo.listar({ plataforma: a.plataforma, estado: 'vigente' });
      if (!r || r.ok !== true) {
        return fallo((r && r.motivo) || MOTIVOS.PASO_RECHAZO, {
          falta: 'el listado de recetas vigentes del catalogo',
          pista: 'A4.4 no contesto: sin recetas vigentes no hay ensayo y sin ensayo no se opera'
        });
      }
      recetas = r.recetas || [];
    }
    if (!Array.isArray(recetas)) {
      return fallo(MOTIVOS.SIN_RECETAS, {
        falta: 'las recetas vigentes de la plataforma (A4.4): ni el catalogo ni la entrada las traen'
      });
    }
    if (recetas.length === 0) {
      return fallo(MOTIVOS.SIN_RECETAS, { falta: `recetas vigentes de ${a.plataforma}` });
    }

    // No se valida la FORMA de la receta (eso es A4.1/A4.3): solo se comprueba
    // que lo que llega dice ser de esta plataforma y estar vigente.
    const no_vigentes = [];
    for (const receta of recetas) {
      if (!es_objeto(receta)) { no_vigentes.push('receta_ilegible'); continue; }
      if (texto_no_vacio(receta.plataforma) && String(receta.plataforma).trim().toLowerCase() !== a.plataforma) {
        no_vigentes.push(`${receta.plataforma}:${receta.capacidad || '?'}`);
        continue;
      }
      if (texto_no_vacio(receta.estado) && String(receta.estado).trim() !== 'vigente') {
        no_vigentes.push(`${receta.plataforma || a.plataforma}:${receta.capacidad || '?'}`);
      }
    }
    if (no_vigentes.length) {
      return fallo(MOTIVOS.RECETAS_NO_VIGENTES, {
        falta: 'recetas vigentes de la plataforma (llegaron otras)',
        no_vigentes
      });
    }

    return {
      ok: true,
      recetas,
      resumen: `${recetas.length} receta(s) vigente(s) puestas a disposicion (el saber hacer es comun)`
    };
  }

  /**
   * 4 · H3/W7 declara la ventana de servicio. Sin declaracion explicita, se
   * aplica el criterio por defecto de W7 y se dice que es por defecto: no se
   * inventa un horario ni se reserva el movil de nadie.
   */
  async _paso_ventana(ctx) {
    const e = ctx.entrada;
    const declarada = e.ventana_servicio;

    if (declarada === undefined || declarada === null || (typeof declarada === 'string' && declarada.trim() === '')) {
      return { ok: true, ventana: { criterio: VENTANA_POR_DEFECTO, origen: 'W7_por_defecto' }, resumen: `ventana W7 por defecto: ${VENTANA_POR_DEFECTO}` };
    }
    if (typeof declarada === 'string') {
      return { ok: true, ventana: { criterio: declarada.trim(), origen: 'declarada' }, resumen: `ventana declarada: ${declarada.trim()}` };
    }
    if (es_objeto(declarada)) {
      const criterio = texto_no_vacio(declarada.criterio) ? declarada.criterio.trim() : null;
      if (!criterio && (vacio(declarada.desde) || vacio(declarada.hasta))) {
        return fallo(MOTIVOS.ENTRADA_INVALIDA, { falta: 'ventana_servicio.criterio (o un tramo desde/hasta)' });
      }
      return {
        ok: true,
        ventana: { criterio: criterio || `${declarada.desde}-${declarada.hasta}`, desde: declarada.desde || null, hasta: declarada.hasta || null, origen: 'declarada' },
        resumen: 'ventana de servicio declarada por el dueno'
      };
    }
    return fallo(MOTIVOS.ENTRADA_INVALIDA, { falta: 'ventana_servicio (texto o {criterio|desde,hasta})' });
  }

  /** 5 · Q3 resuelve el nivel. Silencio = conservador; no se hereda nada. */
  async _paso_nivel(ctx) {
    const a = ctx.alta;
    const e = ctx.entrada;
    const declaracion = e.nivel_declarado !== undefined ? e.nivel_declarado : e.nivel;
    const r = nivel_q3.resolver(declaracion === undefined ? null : declaracion, {
      cuenta: a.cuenta,
      proyecto: a.proyecto,
      momento: ctx.datos.momento || e.momento
    });
    return {
      ok: true,
      nivel: r.nivel,
      origen: r.origen,
      motivo: r.motivo || null,
      resumen: `nivel ${r.nivel} (${r.origen}${r.motivo ? `: ${r.motivo}` : ''})`
    };
  }

  /**
   * 6 · A4.3 ensaya las recetas con la mirada de HOY. La mirada la trae el
   * aparato (puerto observar); sin ella el ensayo no se puede hacer y el alta se
   * para nombrando este paso, en vez de dar por bueno lo que no se ha mirado.
   */
  async _paso_ensayo(ctx) {
    const a = ctx.alta;
    const mirada = ctx.datos.mirada || ctx.entrada.mirada;

    if (!es_objeto(mirada)) {
      return fallo(MOTIVOS.SIN_MIRADA, {
        falta: 'la mirada del aparato (HechoVisible del puerto observar) para ensayar las anclas de hoy'
      });
    }

    // Se ensayan las recetas que dejo puestas el paso 3 (vengan del catalogo o de
    // la entrada): el ensayo no vuelve a elegirlas ni se inventa ninguna.
    const a_ensayar = Array.isArray(ctx.alta.recetas) && ctx.alta.recetas.length
      ? ctx.alta.recetas
      : (Array.isArray(ctx.entrada.recetas) ? ctx.entrada.recetas : null);
    if (!a_ensayar || a_ensayar.length === 0) {
      return fallo(MOTIVOS.SIN_RECETAS, { falta: 'las recetas vigentes que puso el paso 3' });
    }

    const resultados = [];
    for (const receta of a_ensayar) {
      const r = ensayo_a43.ensayar(receta, mirada);
      if (!r.ok) {
        return fallo((r && r.motivo) || MOTIVOS.PASO_RECHAZO, {
          falta: `una receta ensayable (${(r && r.defectos && r.defectos.length) || 0} defecto(s) de forma)`,
          detalle: r && r.motivo
        });
      }
      resultados.push(r);
      if (r.apto !== true) {
        return fallo(MOTIVOS.ENSAYO_NO_APTO, {
          falta: `las anclas de hoy: ${r.faltas.length} falta(s); no se opera con un ensayo no apto`,
          faltas: r.faltas
        });
      }
    }

    return {
      ok: true,
      apto: true,
      recetas: resultados.length,
      faltas: [],
      resumen: `${resultados.length} receta(s) ensayada(s): anclas de hoy presentes y postcondicion comprobable`
    };
  }

  /**
   * 7 · La primera operacion real es LEER, con testigo completo. El veredicto lo
   * trae O1/O2: aqui no se firma. Se exige `ocurrio` CON `evidencia_id`, y se
   * rechaza cualquier capacidad que escriba en el mundo: estrenar publicando es
   * la forma mas cara de descubrir que la sesion no estaba bien.
   */
  async _paso_primera_operacion(ctx) {
    const prueba = ctx.datos.prueba || ctx.entrada.prueba;
    if (!es_objeto(prueba)) {
      return fallo(MOTIVOS.SIN_PRUEBA, {
        falta: 'la primera lectura con testigo (veredicto O1/O2 con su evidencia)'
      });
    }

    const capacidad = texto_no_vacio(prueba.capacidad) ? String(prueba.capacidad).trim().toLowerCase() : null;
    if (!capacidad) {
      return fallo(MOTIVOS.ENTRADA_INVALIDA, { falta: 'prueba.capacidad (que se hizo: mirar, leer...)' });
    }
    if (!CAPACIDADES_DE_LECTURA.includes(capacidad)) {
      return fallo(MOTIVOS.PRIMERA_OPERACION_NO_ES_LECTURA, {
        capacidad,
        falta: 'una primera operacion de LECTURA: estrenar publicando no es un alta, es un riesgo'
      });
    }

    const veredicto = texto_no_vacio(prueba.veredicto) ? String(prueba.veredicto).trim().toLowerCase() : null;
    const evidencia_id = texto_no_vacio(prueba.evidencia_id) ? String(prueba.evidencia_id).trim() : null;
    if (veredicto !== 'ocurrio' || !evidencia_id) {
      return fallo(MOTIVOS.PRUEBA_NO_CONCLUYENTE, {
        falta: 'un veredicto `ocurrio` CON evidencia: una espera agotada no prueba nada',
        veredicto,
        evidencia_id
      });
    }

    return {
      ok: true,
      prueba: { capacidad, veredicto, evidencia_id, momento: prueba.momento || null },
      resumen: `primera lectura con testigo: ${capacidad} ocurrio (evidencia ${evidencia_id})`
    };
  }

  // ---- utilidades ----------------------------------------------------------

  _clave_de_sel(sel) {
    if (typeof sel === 'string') return sel;
    if (es_objeto(sel) && texto_no_vacio(sel.proyecto) && texto_no_vacio(sel.cuenta)) {
      return clave_de(sel.proyecto, sel.cuenta);
    }
    if (es_objeto(sel) && texto_no_vacio(sel.clave)) return String(sel.clave).trim();
    return null;
  }

  _buscar(sel) {
    const clave = this._clave_de_sel(sel);
    if (!clave) return null;
    return this._altas.get(clave) || null;
  }
}

/** Factory: la forma comoda para tests y para el loader. */
function crear(opciones = {}) {
  return new AltaDeCuenta(opciones);
}

function describir() {
  return {
    pasos: PASOS.map((p) => `${p.id} · ${p.pieza}`),
    estados: ESTADOS.slice(),
    regla: 'un alta atascada no bloquea a otros proyectos; si un paso falta se nombra y se para ahi',
    sesion: 'la abre una persona (dueno); el puente nunca escribe credenciales',
    ventana_por_defecto: VENTANA_POR_DEFECTO,
    primera_operacion: 'leer con testigo completo; publicar de estreno se rechaza'
  };
}

module.exports = {
  PASOS,
  PASO_IDS,
  ESTADOS,
  MOTIVOS,
  VENTANA_POR_DEFECTO,
  CAPACIDADES_DE_LECTURA,
  clave_de,
  AltaDeCuenta,
  crear,
  describir
};

// Vista "clase" para quien prefiera el nombre del diseno (B2 · AltaDeCuenta).
module.exports.Alta = Object.freeze({
  PASOS,
  iniciar: (instancia, entrada) => instancia.iniciar(entrada),
  abrir_sesion: (instancia, sel, datos) => instancia.abrir_sesion(sel, datos),
  continuar: (instancia, sel, datos) => instancia.continuar(sel, datos),
  abortar: (instancia, sel, motivo) => instancia.abortar(sel, motivo)
});
