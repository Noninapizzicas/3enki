'use strict';

/**
 * nichos/sondeador-territorio — MICRO-AGENTE del vertical NICHOS.
 *
 * Sondea un territorio a partir de una semilla normalizada:
 *   0. Consulta el NORTE (catalogo de capacidades: lo que el sistema SABE
 *      entregar y cobrar) y lo usa como iman de seleccion.
 *   1. Consulta reglas de exclusion.
 *   2. Consulta limites del perfil.
 *   3. Consume fuentes externas — con la CONSULTA que nombra QUÉ buscamos y
 *      DÓNDE ("<nicho> en <territorio>"), no el territorio pelado: buscar
 *      "Lorca" a secas devuelve la Wikipedia de Lorca, no mercado.
 *   4. Filtra duplicados contra exclusiones.
 *   5. Ordena por encaje con el norte y ANOTA cada candidato (nunca descarta).
 *   6. Emite nichos.candidato.detectado por cada candidato valido.
 *   7. Emite nichos.sondeo.completado o nichos.sondeo.failed.
 *
 * ── EL NORTE (por que existe este paso 0) ──────────────────────────────────
 * F1 manda "explora amplio, sin limites previos". Sin norte, una busqueda
 * amplia cae por fisica en la senal mas barata: quien YA ofrece el servicio
 * (competencia que el sistema no puede servir). El norte NO es una puerta que
 * prohibe: es un IMAN que selecciona. El sondeo sigue explorando igual de
 * amplio y devuelve TODOS los candidatos; lo que cambia es que cada uno viaja
 * anotado con `puede_cobrar` (true/false/null) y los que encajan van primero.
 *
 * Norte ABIERTO (catalogo sin capacidades declaradas): el sondeo explora
 * amplio como siempre, marca `puede_cobrar: null` y PULSA
 * nichos.sondeo.sin_norte — jamas se asume ni se inventa el norte.
 *
 * Sin estado persistido — micro-agente puro.
 * Patron: ModuloHibridoReflejo.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

// Palabras vacias: no discriminan dominio. Se quitan para que el encaje mida
// dominio real, no relleno.
const VACIAS = new Set([
  'para', 'con', 'sin', 'los', 'las', 'del', 'una', 'unos', 'unas', 'este', 'esta',
  'the', 'and', 'of', 'from', 'your', 'you', 'que', 'por', 'como', 'mas', 'muy',
  'local', 'locales', 'negocio', 'negocios', 'empresa', 'empresas', 'cliente',
  'clientes', 'servicio', 'servicios', 'capacidad', 'capacidades', 'sistema',
  'https', 'http', 'www', 'com', 'org', 'net'
]);

// Ejes genericos del id de capacidad (los anade el ensamblador: <nicho>:captura
// /:entrega/:cobro). Solos no dicen NADA del dominio → no cuentan para el encaje.
const EJES = new Set(['captura', 'entrega', 'cobro']);

/** Palabras significativas de un texto (minusculas, sin tildes, sin vacias). */
function palabras(texto) {
  return String(texto == null ? '' : texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !VACIAS.has(t) && !EJES.has(t));
}

class SondeadorTerritorio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'sondeador-territorio';
    this.version = '0.1.0';
  }

  // -- RPC HANDLER --
  onSondearRequest(e) {
    return this._atender(e, 'sondear', 'nichos.territorio.sondear.response', d => this._sondear(d));
  }

  // =============================================================
  // PROYECCION: _sondear
  // =============================================================
  async _sondear(input) {
    if (!input.semilla_normalizada) return this._invalid('semilla_normalizada');

    const projectId = input.project_id;
    const correlationId = input.correlation_id;
    const semilla = input.semilla_normalizada;
    const territorio = semilla.territorio || semilla.nombre || String(semilla);
    const firma = semilla.firma || semilla.senal || territorio;
    const id_nicho = semilla.id_nicho || `sondeo-${Date.now()}`;
    const ts = nowISO();

    try {
      // 0. Consultar el NORTE — el iman (catalogo de lo que sabemos entregar y
      //    cobrar). Se consulta SIEMPRE, aunque el catalogo este vacio: un
      //    norte sin declarar es un DATO (se pulsa), no un motivo de silencio.
      const norte = await this._consultarNorte(projectId);

      // 1. Consultar reglas de exclusion (por firma de semilla).
      const exclusiones = await this._consultarExclusiones(projectId, firma);

      // 2. Consultar limites del perfil.
      const limites = await this._consultarLimites(projectId);
      const maxCandidatos = (limites && limites.max_candidatos_por_semilla !== 'ABIERTO')
        ? limites.max_candidatos_por_semilla
        : 50;

      // 3. Consumir fuentes externas.
      const datosCrudos = await this._consumirFuentes(projectId, semilla, territorio);

      if (!datosCrudos || datosCrudos.length === 0) {
        this.eventBus?.publish('nichos.sondeo.failed', {
          id_nicho,
          razon_codigo: 'SIN_DATOS',
          detalle: 'las fuentes no devolvieron datos para este territorio',
          timestamp: ts
        });
        return {
          status: 200,
          data: { candidatos: [], solicitud_decision: null }
        };
      }

      // 4. Filtrar contra exclusiones (dedupe).
      const filtrados = this._dedupeContraExclusion(datosCrudos, exclusiones);

      // 5. NORTE — anotar cada candidato con su encaje con lo que sabemos
      //    entregar y cobrar, y poner delante los que encajan. NO se descarta
      //    ninguno: el iman ordena y marca; nunca cierra la puerta.
      const anotados = filtrados.map((c) => ({
        ...c,
        ...this._encajeConNorte(c, norte)
      }));
      const ordenados = this._ordenarPorNorte(anotados);

      // 6. Limitar al tope del perfil.
      const candidatos = ordenados.slice(0, maxCandidatos);

      // 7. Emitir pulso por cada candidato detectado.
      for (const c of candidatos) {
        this.eventBus?.publish('nichos.candidato.detectado', {
          id_nicho: c.id_nicho || `${id_nicho}-${candidatos.indexOf(c)}`,
          titulo: c.titulo || c.nombre || territorio,
          territorio,
          senal: c.senal || null,
          evidencia: c.evidencia || [],
          // El norte viaja CON el candidato: el juicio (F2) puede distinguir
          // "no hay datos de este dominio" de "este dominio no es negocio nuestro".
          puede_cobrar: c.puede_cobrar,
          encaje_cobrable: c.encaje_cobrable,
          capacidades_cobrables: c.capacidades_cobrables,
          timestamp: ts
        });
      }

      // PULSO: el norte no esta declarado → se dice, no se esconde.
      if (norte.sin_norte) {
        this.eventBus?.publish('nichos.sondeo.sin_norte', {
          id_nicho,
          territorio,
          detalle: 'el catalogo de capacidades esta vacio — el sondeo exploro amplio, sin iman; el norte espera ser declarado',
          timestamp: ts
        });
      }

      // PULSO: sondeo completado.
      // Lleva `candidatos` + `correlation_id` porque el orquestador
      // (onSondeoCompletado) los exige para disparar el batch de validacion.
      // Sin ellos, la cadena moría aquí (sondeo OK, validacion nunca arrancaba).
      this.eventBus?.publish('nichos.sondeo.completado', {
        id_nicho,
        candidatos_total: candidatos.length,
        candidatos,
        norte: this._resumenNorte(norte, candidatos),
        correlation_id: correlationId || null,
        project_id: projectId || null,
        timestamp: ts
      });

      // Si hay candidatos que requieren decision (limites alcanzados).
      if (filtrados.length > maxCandidatos) {
        return {
          status: 200,
          data: {
            candidatos,
            solicitud_decision: {
              tipo: 'limite_candidatos_alcanzado',
              total_disponibles: filtrados.length,
              limite_aplicado: maxCandidatos
            }
          }
        };
      }

      return {
        status: 200,
        data: { candidatos }
      };

    } catch (err) {
      this.eventBus?.publish('nichos.sondeo.failed', {
        id_nicho,
        razon_codigo: 'ERROR_SONDEO',
        detalle: err.message || 'error durante el sondeo del territorio',
        timestamp: ts
      });
      return this._errorResponse(500, 'SONDEO_ERROR', err.message || 'error durante el sondeo');
    }
  }

  // =============================================================
  // PROYECCION: _dedupeContraExclusion
  // =============================================================
  _dedupeContraExclusion(datos, exclusiones) {
    if (!exclusiones || exclusiones.length === 0) return datos;

    const exclusionSet = new Set(
      exclusiones.map(e => (e.patron || e.nombre || e).toString().toLowerCase())
    );

    return datos.filter(d => {
      const clave = (d.titulo || d.nombre || '').toLowerCase();
      // Filtrar si coincide exactamente con alguna exclusion.
      if (exclusionSet.has(clave)) return false;
      // Filtrar si contiene alguna exclusion como subcadena.
      for (const ex of exclusionSet) {
        if (clave.includes(ex)) return false;
      }
      return true;
    });
  }

  // =============================================================
  // EL NORTE — catalogo de lo que el sistema SABE entregar y cobrar
  // =============================================================

  /**
   * _consultarNorte — lee el catalogo de capacidades y lo convierte en
   * vocabulario de dominio. Degradacion honesta: sin catalogo, sin respuesta
   * o sin project_id, el norte nace ABIERTO (`sin_norte:true`) — el sondeo
   * sigue explorando amplio y lo PULSA. Nunca se asume un norte.
   */
  async _consultarNorte(projectId) {
    let capacidades = [];
    try {
      const resp = await this._rpc('nichos.catalogo.capacidad.disponibles.request', {
        project_id: projectId
      }, { timeout_ms: 5000 });
      const lista = resp && resp.data && Array.isArray(resp.data.capacidades)
        ? resp.data.capacidades
        : [];
      capacidades = lista.map((c) => {
        const id = (c && (c.id || c.nombre)) || null;
        const texto = [
          id,
          c && c.descripcion,
          c && c.meta && c.meta.dominio,
          c && c.meta && Array.isArray(c.meta.etiquetas) ? c.meta.etiquetas.join(' ') : ''
        ].filter(Boolean).join(' ');
        return { id: id || texto, descripcion: (c && c.descripcion) || '', vocabulario: new Set(palabras(texto)) };
      }).filter((c) => c.vocabulario.size > 0);
    } catch (_e) {
      capacidades = [];
    }

    const vocabulario = new Set();
    for (const c of capacidades) for (const p of c.vocabulario) vocabulario.add(p);

    return {
      origen: 'catalogo-capacidades',
      sin_norte: capacidades.length === 0,
      capacidades,
      vocabulario
    };
  }

  /**
   * _encajeConNorte — ¿aqui podemos entregar y cobrar? Medida determinista
   * (sin LLM): cuanta de la senal del candidato cae dentro del vocabulario
   * del norte. Devuelve `puede_cobrar` en tres estados, porque tres son las
   * respuestas honestas:
   *   true  — encaja con una capacidad declarada
   *   false — el sondeo tiene norte y el candidato no encaja con ninguno
   *   null  — no hay norte declarado: no se puede afirmar ni negar
   */
  _encajeConNorte(candidato, norte) {
    if (!norte || norte.sin_norte) {
      return { puede_cobrar: null, encaje_cobrable: null, capacidades_cobrables: [] };
    }

    const texto = [
      candidato.titulo, candidato.nombre, candidato.descripcion,
      candidato.territorio, candidato.senal,
      Array.isArray(candidato.evidencia) ? candidato.evidencia.join(' ') : candidato.evidencia
    ].filter(Boolean).join(' ');

    const suyas = palabras(texto);
    if (suyas.length === 0) {
      return { puede_cobrar: false, encaje_cobrable: 0, capacidades_cobrables: [] };
    }

    const cobrables = [];
    let coincidencias = 0;
    for (const palabra of new Set(suyas)) {
      if (!norte.vocabulario.has(palabra)) continue;
      coincidencias++;
      for (const c of norte.capacidades) if (c.vocabulario.has(palabra) && !cobrables.includes(c.id)) cobrables.push(c.id);
    }

    // Encaje = porcion de la senal del candidato que habla el idioma del norte.
    const encajeCrudo = coincidencias / new Set(suyas).size;
    return {
      puede_cobrar: cobrables.length > 0,
      encaje_cobrable: this._round(Math.min(1, encajeCrudo), 4),
      capacidades_cobrables: cobrables
    };
  }

  /**
   * _ordenarPorNorte — el iman: los que encajan van delante. Orden ESTABLE
   * (sin norte, o con empate, se respeta el orden de la fuente). Nunca quita
   * a nadie de la lista.
   */
  _ordenarPorNorte(candidatos) {
    return candidatos
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const ea = a.c.encaje_cobrable == null ? -1 : a.c.encaje_cobrable;
        const eb = b.c.encaje_cobrable == null ? -1 : b.c.encaje_cobrable;
        if (eb !== ea) return eb - ea;
        return a.i - b.i;
      })
      .map((x) => x.c);
  }

  /** _resumenNorte — el norte, resumido, para que viaje en el pulso de cierre. */
  _resumenNorte(norte, candidatos) {
    const cobrables = candidatos.filter((c) => c.puede_cobrar === true).length;
    const fuera = candidatos.filter((c) => c.puede_cobrar === false).length;
    const indeterminados = candidatos.filter((c) => c.puede_cobrar == null).length;
    return {
      origen: norte.origen,
      sin_norte: norte.sin_norte,
      capacidades_total: norte.capacidades.length,
      dominios: norte.capacidades.map((c) => c.id),
      mina: { cobrables, fuera_del_norte: fuera, indeterminados }
    };
  }

  // =============================================================
  // Consultas al bus
  // =============================================================
  async _consultarExclusiones(projectId, firma) {
    const resp = await this._rpc('nichos.reglas.exclusion.consultar.request', {
      project_id: projectId,
      semilla_firma: firma || 'sin_firma'
    }, { timeout_ms: 5000 });
    return (resp && resp.data && resp.data.conjunto_reglas && Array.isArray(resp.data.conjunto_reglas.patrones_excluir))
      ? resp.data.conjunto_reglas.patrones_excluir
      : [];
  }

  async _consultarLimites(projectId) {
    const resp = await this._rpc('nichos.perfil.limite.leer.request', {
      project_id: projectId
    }, { timeout_ms: 5000 });
    return (resp && resp.data && resp.data.perfil_limite && resp.data.perfil_limite.limites)
      ? resp.data.perfil_limite.limites
      : null;
  }

  async _consumirFuentes(projectId, semilla, territorio) {
    const resp = await this._rpc('nichos.fuente.consumir.request', {
      project_id: projectId,
      semilla,
      territorio,
      // La fuente recibe la CONSULTA, no el territorio pelado: buscar "Lorca"
      // devuelve "Lorca" de Wikipedia. Ver _consultaDe.
      query: this._consultaDe(semilla, territorio)
    }, { timeout_ms: 20000 });
    return (resp && resp.data && Array.isArray(resp.data.resultados))
      ? resp.data.resultados
      : [];
  }

  /**
   * _consultaDe — la consulta que sale a la fuente nombra QUÉ buscamos y DÓNDE:
   * "<nicho> en <territorio>". El territorio solo es una localizacion, no una
   * pregunta: sondeado en pelota, la fuente devolvia la Wikipedia de "Lorca"
   * (ruido) en vez de mercado. Sin nicho declarado, cae al territorio — nunca
   * se inventa uno.
   */
  _consultaDe(semilla, territorio) {
    const nicho = String(
      (semilla && (semilla.vertical_sugerido || semilla.nombre || semilla.descripcion)) || ''
    ).trim();
    const donde = String(territorio || '').trim();
    if (nicho && donde) return `${nicho} en ${donde}`;
    return nicho || donde || String(semilla || '');
  }
}

module.exports = SondeadorTerritorio;
