/**
 * contabilidad-analitica/puente-lenguaje-dueno — MICRO-AGENTE (Q2, hoja del plan).
 *
 * Traductor BIDIRECCIONAL entre el lenguaje del DUENO y el de la contabilidad:
 *   · a_consulta — su pregunta en lenguaje natural → una CONSULTA contable estructurada.
 *   · a_cifra    — un CALCULO/cifra contable → esa cifra en SU idioma (frase legible).
 *
 * El JUICIO linguistico (interpretar frases libres) es la mitad FUZZY del hibrido y vive
 * en el blueprint del modulo. Esta mitad REFLEJO es la parte DETERMINISTA y HONESTA:
 * traduce con el VOCABULARIO y las PLANTILLAS **DECLARADOS** por el sitio. NO adivina el
 * significado de una palabra ni inventa una frase: sin vocabulario/plantilla declarados,
 * lo no reconocido se DECLARA (no se estima). Lenguaje → juicio; cifra → plantilla.
 *
 * Invariante: dato ausente = desconocido. Terminos no reconocidos y frases sin plantilla
 * quedan en `no_reconocido`/`abierto`; jamas se rellenan con una suposicion.
 *
 * ESCUCHA (R3): el plan declara escucha de `contabilidad.asiento_asentado`; NINGUN modulo
 * del repo lo emite AUN (lo emite `escritor-diario` B2, de un grupo posterior): declararlo
 * daria cadena colgada. NO se declara.
 *
 * Forma: MICRO-AGENTE (mitad refleja) → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja Q2 del plan-construccion y diseno-oop.md (CLASE PuenteLenguajeDueno).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PuenteLenguajeDueno extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puente-lenguaje-dueno';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC (una linea cada uno, delegan a _atender). CLASE PREGUNTA → sin ui_handler ──
  onAConsultaRequest(e) {
    return this._atender(e, 'a_consulta', 'puente-lenguaje-dueno.a_consulta.response', async (d) => {
      const res = this._a_consulta(d);
      // Traductor: no escribe estado → no hay hecho que anunciar (R2). Su cara es el bus.
      if (res.status !== 200) this.eventBus?.publish('puente-lenguaje-dueno.a_consulta.failed', res);
      return res;
    });
  }

  onACifraRequest(e) {
    return this._atender(e, 'a_cifra', 'puente-lenguaje-dueno.a_cifra.response', async (d) => {
      const res = this._a_cifra(d);
      if (res.status !== 200) this.eventBus?.publish('puente-lenguaje-dueno.a_cifra.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // a_consulta: su pregunta (lenguaje natural) → consulta contable estructurada
  // ══════════════════════════════════════════════════════════════════════
  _a_consulta(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const pregunta = input.pregunta != null ? String(input.pregunta).trim() : '';
    if (!pregunta) return this._invalid('pregunta');

    // El VOCABULARIO es DECLARABLE (termino del dueno → campo/cuenta contable). No hay ninguno cableado.
    const vocabulario = this._vocabulario(input);

    const reconocidos = [];
    const noReconocidos = [];
    const consulta = {};

    // Se recorren las ENTRADAS DECLARADAS: se reconoce por el termino del dueno, sin adivinar.
    for (const [termino, destino] of Object.entries(vocabulario)) {
      if (!termino) continue;
      if (this._contiene(pregunta, termino)) {
        reconocidos.push(termino);
        if (destino && typeof destino === 'object') Object.assign(consulta, destino);
        else consulta[termino] = destino;
      }
    }

    // Los terminos del dueno que NO estan en el vocabulario declarado: se declaran (juicio fuzzy).
    const palabras = this._palabras(pregunta);
    for (const p of palabras) {
      if (!reconocidos.some((t) => this._contiene(p, t) || this._contiene(t, p))) noReconocidos.push(p);
    }
    const no_reconocido = noReconocidos.filter((p) => !this._ESTOP.has(p));

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'puente-lenguaje-dueno',
        direccion: 'pregunta_a_consulta',
        pregunta,
        consulta,
        // Solo lo DECLARADO se traduce; el resto es juicio (mitad fuzzy), no se adivina aqui.
        terminos_reconocidos: [...new Set(reconocidos)],
        no_reconocido: [...new Set(no_reconocido)],
        vocabulario_declarado: Object.keys(vocabulario).length > 0,
        abierto: {
          vocabulario: Object.keys(vocabulario).length > 0 ? null
            : 'no se declaro vocabulario (termino del dueno → campo contable): sin el, el puente no traduce y lo declara',
          juicio: no_reconocido.length > 0
            ? 'la interpretacion de lo no reconocido es juicio (mitad fuzzy del puente)'
            : null
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // a_cifra: un calculo/cifra contable → la cifra en SU idioma (plantilla declarada)
  // ══════════════════════════════════════════════════════════════════════
  _a_cifra(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const cifra = input.cifra !== undefined ? input.cifra : input.calculo;
    if (cifra === undefined || cifra === null) return this._invalid('cifra');

    // Las PLANTILLAS del dueno son DECLARABLES (clave → frase con marcadores). No hay ninguna cableada.
    const plantillas = this._plantillas(input);
    const clave = input.clave != null ? String(input.clave) : (input.tipo_cifra != null ? String(input.tipo_cifra) : null);

    let frase = null;
    let plantilla_usada = null;

    if (clave && plantillas[clave] != null) {
      plantilla_usada = String(plantillas[clave]);
      frase = this._render(plantilla_usada, cifra, input);
    } else if (plantillas.canonica != null) {
      // Plantilla canonica declarada: sirve de traduccion por defecto SIN inventar lengua.
      plantilla_usada = String(plantillas.canonica);
      frase = this._render(plantilla_usada, cifra, input);
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'puente-lenguaje-dueno',
        direccion: 'calculo_a_cifra',
        clave,
        cifra,
        frase,
        plantilla_usada,
        // Sin plantilla declarada, la cifra NO se viste con una frase inventada.
        traducido: frase !== null,
        abierto: {
          plantilla: frase === null
            ? 'no hay plantilla declarada para esta cifra: se declara la cifra sin frase inventada'
            : null
        }
      }
    };
  }

  // ── utilidades de traduccion (deterministas, sin juicio) ──
  _vocabulario(input = {}) {
    const v = (input.vocabulario && typeof input.vocabulario === 'object') ? input.vocabulario
      : ((input.diccionario && typeof input.diccionario === 'object') ? input.diccionario : {});
    return v && typeof v === 'object' ? v : {};
  }

  _plantillas(input = {}) {
    const p = (input.plantillas && typeof input.plantillas === 'object') ? input.plantillas
      : ((input.frases && typeof input.frases === 'object') ? input.frases : {});
    return p && typeof p === 'object' ? p : {};
  }

  // Render de una plantilla declarada con sus marcadores: {campo} → valor de la cifra (o null si falta).
  _render(plantilla, cifra, input) {
    const datos = (cifra && typeof cifra === 'object') ? { ...input, ...cifra } : { ...input, cifra };
    return String(plantilla).replace(/\{([a-z0-9_]+)\}/gi, (_m, campo) => {
      const v = datos[campo];
      return (v === undefined || v === null) ? '' : String(v);
    }).replace(/\s+/g, ' ').trim();
  }

  _contiene(texto, termino) {
    if (!termino) return false;
    return String(texto).toLowerCase().includes(String(termino).toLowerCase());
  }

  _palabras(texto) {
    return String(texto).split(/[^\p{L}\p{N}]+/u).map((p) => p.trim()).filter(Boolean);
  }

  // ── Tools ──
  toolAConsulta(params) { return this._a_consulta(params); }
  toolACifra(params) { return this._a_cifra(params); }
}

// Palabras vacias de enlace: no aportan termino contable, no se declaran como no reconocidas.
PuenteLenguajeDueno.prototype._ESTOP = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'que', 'en', 'del', 'al', 'por',
  'con', 'para', 'me', 'mi', 'lo', 'se', 'es', 'cuanto', 'cuanta', 'cuantos', 'cuantas',
  'como', 'cual', 'cuales', 'donde', 'cuando', 'este', 'esta', 'mes', 'ano', 'año'
]);

module.exports = PuenteLenguajeDueno;
