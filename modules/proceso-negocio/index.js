/**
 * proceso-negocio — REFLEJO JS: el ORQUESTADOR de fases de un proyecto.
 *
 * Encadena las skills del proceso por eventos, usando el mecanismo REAL de Enki:
 *   - project.created            → empuja la FASE 0 (skill identidad-negocio)
 *   - negocio.identificado       → empuja la FASE 1 (skill esquematizador)
 *   - (siguientes fases se añaden al mapa cuando sus skills emitan su evento)
 *
 * El empujón replica el patrón del conserje: pendientes.set + conserje.empujon.
 * El nervio (ai-gateway) lo surfacea en el chat una vez; el LLM ejecuta la
 * skill sugerida (accion_sugerida: 'cosecha.obtener:<skill>'). Cero cambios en
 * el nervio, cero en las skills — solo este mapa de proceso.
 *
 * Idempotente: por proyecto+fase, un empujón una sola vez (no spamea).
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const { extraerEspina } = require('../_shared/motor/verificador');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Vocabulario del PATRÓN (no hojas del negocio): palabras con guion que la
// doctrina del adaptador escribe y el plano puede repetir por eco. Solo aplica
// al fallback de planos SIN espina — con espina, las hojas van declaradas.
// Los slugs de módulos REALES no entran aquí: si existen en disco, cuentan.
const VOCABULARIO_DEL_PATRON = new Set([
  'event-driven', 'micro-servicio', 'micro-agente', 'single-writer',
  'base-module', 'pos-persistencia', 'modulo-hibrido', 'modulo-hibrido-reflejo',
  'modulo-real', 'request-response', 'plan-construccion', 'enki-plan',
  'adaptar-a-enki', 'construir-modulos', 'construir-interfaz', 'diseno-oop',
  'kebab-case', 'json-schema', 'state-machine', 'dead-letter',
  'circuit-breaker', 'correlation-id'
]);

// Ruta del árbol de módulos del SISTEMA (no del proyecto). El gate de la FASE 4
// verifica aquí que el módulo construido EXISTE Y CARGA — no se fía del reporte
// del agente (lección en vivo: el agente reportó 15 módulos que el deploy borró
// o que nunca existieron de forma verificable).
const MODULES_DIR = path.resolve(__dirname, '..');
// El deploy usa rsync --delete desde el REPO → un módulo que no está en el repo
// se borra en el siguiente deploy (lección en vivo: 15 módulos generados y
// barridos). El gate verifica contra el REPO de desarrollo (si existe): si el
// módulo no está commiteado, la fase NO se cierra — se avisa que falta el commit.
const REPO_MODULES_DIR = (() => {
  try {
    const home = require('os').homedir();
    const p = path.join(home, '3enki', 'modules');
    return fs.existsSync(p) ? p : null;
  } catch (_) { return null; }
})();

// ── PRINCIPIO ARQUITECTÓNICO (antepuesto a cada mensaje de fase) ──
// La visión del sistema: parcelas pequeñas, evento como pegamento, ensamblaje libre.
const PRINCIPIO_ARQUITECTONICO = '[PRINCIPIO] Cada módulo es una parcela pequeña que hace SU trabajo bien hecho y punto — funciona por eventos, desacoplado. La reutilización y la potencia vienen de ahí. El ensamblaje se hace DESPUÉS, según necesidades, conectando eventos. No compliques la parcela pensando en el ensamblaje.\n\n';

// ── ARCHIVO POR FASE: qué archivo JSON se escribe en el storage del proyecto ──
// Cada fase completada deja su registro determinista en <proyecto>/proceso-negocio/<archivo>.json
const ARCHIVO_FASE = {
  'project.created':              'fase0-identidad-negocio',
  'negocio.esquematizado':        null,  // F2 usa pasadas dinámicas (fase2-pasada-N.json)
  'negocio.planificado':          'fase3-planificar-construccion',
  'negocio.adaptado':             'fase3b-adaptador',
  'negocio.construido':           'fase4-construir-modulos',
  'negocio.skills':               'fase5-escribir-skills',
  'negocio.interfaz':             'fase6-decidir-interfaz',
  'negocio.interfaz_esquematizada': 'fase6h-esquematizar-interfaz',
  'negocio.interfaz_construida':  'fase7-construir-interfaz',
  'negocio.verificado':           'fase8-verificar-en-vivo',
  'negocio.completado':           'fase-completado'
};

// ── EL MAPA DE PROCESO: evento de fase completada → skill siguiente ──
// El espinazo del proceso. Cada entrada: el evento que marca el fin de una fase
// y la skill que el chat debe ejecutar a continuación (con su mensaje).
const MAPA_PROCESO = {
  'project.created': {
    skill: 'identidad-negocio',
    lee: [],
    escribe: 'proceso-negocio/fase0-identidad-negocio.json',
    mensaje: 'FASE 0: dar identidad al negocio — ¿qué estás construyendo, qué vendes, cómo lo elaboras? Al terminar: el reflejo emite negocio.identificado.'
  },
  'negocio.identificado': {
    skill: 'esquematizar-negocio',
    lee: ['proceso-negocio/fase0-identidad-negocio.json'],
    escribe: 'proceso-negocio/fase2-pasada-N.json',
    mensaje: 'FASE 2: esquematizar el negocio — lee proceso-negocio/fase0-identidad-negocio.json, aplica el prisma de 5 huecos ronda a ronda hasta seco. Al terminar: proceso-negocio.completar_fase { fase: "esquematizado" }.'
  },
  'negocio.esquematizado': {
    skill: 'planificar-construccion',
    lee: ['proceso-negocio/fase2-cierre-diseccion.json'],
    escribe: 'proceso-negocio/fase3-planificar-construccion.json',
    mensaje: 'FASE 3 · PLASMA: diseñar el SISTEMA en PSEUDOCÓDIGO OOP — lee proceso-negocio/fase2-cierre-diseccion.json, diseña entidades/clases/flujos/contratos en OOP estándar SIN conocer Enki. Al terminar: proceso-negocio.completar_fase { fase: "planificado" }.'
  },
  'negocio.planificado': {
    skill: 'construir-modulos',
    lee: ['proceso-negocio/fase3-planificar-construccion.json'],
    escribe: 'proceso-negocio/fase3b-adaptador.json',
    mensaje: 'FASE 3b · ADAPTADOR: traducir el diseño OOP al sistema Enki — lee proceso-negocio/fase3-planificar-construccion.json, mapea contra el inventario real (reutiliza/construye/adapta). Al terminar: proceso-negocio.completar_fase { fase: "adaptado" }.'
  },
  'negocio.adaptado': {
    skill: 'construir-modulos',
    lee: ['esquemas/plan-construccion.md'],
    escribe: 'modules/<slug>/',
    mensaje: 'FASE 4: construir UNA hoja del plan — lee esquemas/plan-construccion.md, construye modules/<slug>/ (index.js + module.json) en el repo. Al terminar: proceso-negocio.completar_fase { fase: "construido", resumen: { modulos: ["<slug>"] } }.'
  },
  'negocio.construido': {
    skill: 'escribir-skills',
    lee: ['modules/<slug>/module.json', 'modules/<slug>/index.js'],
    escribe: 'modules/cosecha/cantera/enki/<slug>/SKILL.md',
    mensaje: 'FASE 5: escribir la SKILL FULL del módulo — lee modules/<slug>/module.json + index.js del repo, escribe modules/cosecha/cantera/enki/<slug>/SKILL.md en el repo. Al terminar: proceso-negocio.completar_fase { fase: "skills" }.'
  },
  'negocio.skills': {
    skill: 'decidir-interfaz',
    lee: ['modules/<slug>/module.json', 'modules/cosecha/cantera/enki/<slug>/SKILL.md'],
    escribe: 'modules/<slug>/module.json',
    mensaje: 'FASE 6: decidir la INTERFAZ del módulo — lee modules/<slug>/module.json + la skill de la cantera, razona el rol, escribe ui_handlers (type+zone) en modules/<slug>/module.json. Al terminar: proceso-negocio.completar_fase { fase: "interfaz", resumen: { modulos: ["<slug>"] } }.'
  },
  'negocio.interfaz': {
    skill: 'esquematizar-interfaz',
    lee: ['modules/<slug>/module.json', 'modules/<slug>/<slug>.blueprint.json'],
    escribe: 'modules/<slug>/<slug>.blueprint.json',
    mensaje: 'FASE 6½: esquematizar la interfaz concreta — lee modules/<slug>/module.json + blueprint, declara ui.ops + ui.datos EN modules/<slug>/<slug>.blueprint.json. Al terminar: proceso-negocio.completar_fase { fase: "interfaz_esquematizada", resumen: { modulos: ["<slug>"] } }.'
  },
  'negocio.interfaz_esquematizada': {
    skill: 'construir-interfaz',
    lee: ['modules/<slug>/<slug>.blueprint.json'],
    escribe: 'frontend/src/lib/modules/<slug>/',
    mensaje: 'FASE 7: construir la interfaz operativa — lee modules/<slug>/<slug>.blueprint.json, genera frontend/src/lib/modules/<slug>/ (manifest.json + index.ts + <Slug>Panel.svelte + blueprint). Al terminar: proceso-negocio.completar_fase { fase: "interfaz_construida", resumen: { modulos: ["<slug>"] } }.'
  },
  'negocio.interfaz_construida': {
    skill: 'construir-modulos',
    lee: ['esquemas/plan-construccion.md'],
    escribe: 'modules/<slug>/',
    mensaje: 'Hoja completa. FASE 4: construir la SIGUIENTE hoja del plan — lee esquemas/plan-construccion.md, la siguiente sin módulo en el repo. Al terminar: proceso-negocio.completar_fase { fase: "construido" }. Si no quedan hojas: proceso-negocio.completar_fase { fase: "completado" }.'
  },
  'negocio.verificado': {
    skill: null,
    lee: [],
    escribe: null,
    mensaje: 'COMPLETO Y VERIFICADO: todas las hojas tienen módulo, skill e interfaz operativa verificados en vivo. F0→F8 cerrado.'
  },
  'negocio.completado': {
    skill: null,
    lee: [],
    escribe: null,
    mensaje: 'COMPLETO: todas las hojas de la disección tienen su módulo y su skill. El negocio está construido.'
  }
};

class ProcesoNegocioReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'proceso-negocio';
    this.version = 'reflejo-0.1.0';
    // idempotencia: `${project_id}::${evento}` → ts (empujón ya emitido)
    this._emitidos = new Map();
    // cola de empujones pendientes por proyecto (la lee el nervio, una vez)
    this.pendientes = new Map();
  }

  async onUnload() { return super.onUnload(); }

  onProjectCreated(e)       { return this._encadenar(e, 'project.created'); }
  onNegocioIdentificado(e)  { return this._encadenar(e, 'negocio.identificado'); }

  // El LLM llama esto al terminar una fase de skill (esquematizar-negocio,
  // diseccionador…): cierra la fase y encadena la siguiente del mapa.
  // GATE: verifica el entregable real de la fase antes de aceptar — el sistema
  // no se fía de la palabra del LLM (lección: el LLM hace lo que quiere).
  async onCompletarFaseRequest(e) {
    return this._atender(e, 'completar_fase', 'proceso-negocio.completar_fase.response',
      d => this._completarFase(d));
  }

  // UNA sola implementación del verbo, dos puertas (evento .request y tool).
  // Antes eran dos cuerpos distintos: el del evento aplicaba el gate y erraba
  // el destino; el del tool acertaba el destino y no aplicaba gate ninguno.
  // Cerrar una fase debe significar lo mismo se llame por donde se llame.
  async _completarFase(d) {
    {
      const project_id = d.project_id;
      if (!project_id) return this._invalid('project_id');
      const fase = d.fase;   // 'esquematizado' | 'diseccionado' | ...
      const eventoFase = `negocio.${fase}`;
      // La skill declara la fase completada → el mapa la encadena.
      const paso = MAPA_PROCESO[eventoFase];
      if (!paso) {
        return { status: 400, data: { error: 'FASE_NO_MAPEADA', message: `No hay siguiente fase para '${eventoFase}'`, fase } };
      }
      // GATE DE ENTREGABLE: la fase solo se cierra si el trabajo REAL existe.
      // El sistema no se fía de la palabra del LLM — verifica en disco.
      const entregable = await this._verificarEntregable(project_id, fase, d.resumen || {});
      if (!entregable.ok) {
        return { status: 409, data: { error: 'FASE_INCOMPLETA', message: entregable.mensaje, fase, esperado: entregable.esperado } };
      }

      // QUIÉN DECIDE EL SIGUIENTE PASO — el plan manda desde que EXISTE.
      // plan-construccion.md nace en la FASE 3b (el adaptador), así que en las
      // fases previas (F2 esquematizado · F3 planificado) todavía no hay plan:
      // ahí el siguiente paso lo da el MAPA. Con plan en disco toma el relevo
      // el ciclo por pieza (_decidirSiguiente), que cuenta el progreso REAL.
      //
      // BUG QUE ESTO CIERRA (verificado en vivo): _decidirSiguiente se llamaba
      // SIEMPRE y no mira el mapa. Sin plan, todos los faltan_por_* valían 0 y
      // caía en su última rama → cerrar la FASE 2 empujaba 'verificar-en-vivo'
      // (FASE 8), saltándose F3→F7 enteras; y el gate de 'verificado' pasaba
      // con "0 hojas verificadas en disco" → el proceso se declaraba COMPLETO
      // Y VERIFICADO sin haber construido nada.
      const progreso = await this._progresoPlan(project_id);
      const hayPlan  = progreso.total > 0;
      const siguiente = hayPlan ? this._decidirSiguiente(progreso, fase) : paso;

      // GATE DE COMPLETITUD DEL PLAN (decisión del sistema, no del LLM):
      // 'completado' SOLO se acepta con el plan COMPLETO en disco. Sin plan no
      // hay nada que declarar completo — el juicio sigue siendo del ciclo por
      // pieza aunque el empujón lo dé el mapa.
      if (fase === 'completado' && (!hayPlan || this._decidirSiguiente(progreso, fase).skill !== null)) {
        return { status: 409, data: {
          error: 'FASE_INCOMPLETA',
          message: hayPlan
            ? `El proceso NO está completo: ${progreso.faltan_por_construir} hojas sin construir, ${progreso.faltan_por_skill} sin skill (de ${progreso.total}). Sigue el ciclo por pieza.`
            : 'No hay plan de construcción (esquemas/plan-construccion.md): no hay nada que declarar completado. Cierra antes la FASE 3b (adaptador).',
          fase, esperado: ['plan completo'], progreso
        }};
      }

      // Marcar la fase completada (idempotente) y empujar la siguiente.
      const clave = `${project_id}::${eventoFase}`;
      if (!this._emitidos.has(clave)) {
        this._emitidos.set(clave, Date.now());
        if (fase === 'esquematizado') {
          await this._escribirFase2Pasadas(project_id, entregable);
        } else {
          await this._escribirArchivoFase(project_id, fase, eventoFase, entregable, d.resumen || {});
        }
        if (siguiente && siguiente.skill) this._empujar(project_id, eventoFase, siguiente);
      }
      return { status: 200, data: { project_id, fase_completada: eventoFase, siguiente: siguiente?.skill || null, entregable, progreso, fin: !siguiente?.skill } };
    }
  }

  // ── DECISIÓN DETERMINISTA del siguiente paso (el sistema decide, no el LLM) ──
  // MÓDULO POR MÓDULO (decisión del dueño): se recorre el plan EN ORDEN y se
  // actúa sobre la PRIMERA hoja incompleta — esa hoja recorre TODAS sus fases
  // (construir → skill → interfaz → esquematizar interfaz → interfaz operativa)
  // ANTES de que empiece la siguiente. No es fase-por-fase (todos los módulos,
  // luego todas las skills): es hoja-por-hoja, cada una terminada de una.
  //   hoja sin módulo               → construir-modulos (FASE 4)
  //   módulo sin skill              → escribir-skills (FASE 5)
  //   con skill, sin interfaz       → decidir-interfaz (FASE 6)
  //   interfaz decidida, sin spec   → esquematizar-interfaz (FASE 6½)
  //   spec hecha, sin construir     → construir-interfaz (FASE 7)
  //   hoja completa                 → la SIGUIENTE hoja
  //   todas las hojas completas     → verificación final → completado
  _decidirSiguiente(progreso, faseActual = null) {
    const hojas = progreso.hojas || [];
    const n = progreso.total || hojas.length;
    for (let i = 0; i < hojas.length; i++) {
      const h = hojas[i];
      const pos = `hoja ${i + 1}/${n} ('${h.slug}')`;
      if (!h.construido) {
        return { skill: 'construir-modulos', lee: ['esquemas/plan-construccion.md'], escribe: `modules/${h.slug}/`, mensaje: `MÓDULO POR MÓDULO — ${pos}: construir su módulo — lee esquemas/plan-construccion.md, escribe modules/${h.slug}/ (index.js + module.json) en el repo. Al terminar: proceso-negocio.completar_fase { fase: "construido", resumen: { modulos: ["${h.slug}"] } }.` };
      }
      if (!h.con_skill) {
        return { skill: 'escribir-skills', lee: [`modules/${h.slug}/module.json`, `modules/${h.slug}/index.js`], escribe: `modules/cosecha/cantera/enki/${h.slug}/SKILL.md`, mensaje: `MÓDULO POR MÓDULO — ${pos}: escribir la SKILL FULL — lee modules/${h.slug}/module.json + index.js del repo, escribe modules/cosecha/cantera/enki/${h.slug}/SKILL.md en el repo. Al terminar: proceso-negocio.completar_fase { fase: "skills", resumen: { skills: ["${h.slug}"] } }.` };
      }
      if (!h.con_interfaz) {
        return { skill: 'decidir-interfaz', lee: [`modules/${h.slug}/module.json`, `modules/cosecha/cantera/enki/${h.slug}/SKILL.md`], escribe: `modules/${h.slug}/module.json`, mensaje: `MÓDULO POR MÓDULO — ${pos}: decidir interfaz — lee modules/${h.slug}/module.json + skill de la cantera, razona el rol, escribe ui_handlers en modules/${h.slug}/module.json. Al terminar: proceso-negocio.completar_fase { fase: "interfaz", resumen: { modulos: ["${h.slug}"] } }.` };
      }
      if (!h.con_interfaz_esquematizada) {
        return { skill: 'esquematizar-interfaz', lee: [`modules/${h.slug}/module.json`, `modules/${h.slug}/${h.slug}.blueprint.json`], escribe: `modules/${h.slug}/${h.slug}.blueprint.json`, mensaje: `MÓDULO POR MÓDULO — ${pos}: esquematizar la interfaz — lee modules/${h.slug}/module.json + blueprint, declara ui.ops + ui.datos EN modules/${h.slug}/${h.slug}.blueprint.json. Al terminar: proceso-negocio.completar_fase { fase: "interfaz_esquematizada", resumen: { modulos: ["${h.slug}"] } }.` };
      }
      if (!h.con_interfaz_construida) {
        return { skill: 'construir-interfaz', lee: [`modules/${h.slug}/${h.slug}.blueprint.json`], escribe: `frontend/src/lib/modules/${h.slug}/`, mensaje: `MÓDULO POR MÓDULO — ${pos}: construir la interfaz — lee modules/${h.slug}/${h.slug}.blueprint.json, genera frontend/src/lib/modules/${h.slug}/ (manifest + index.ts + Panel.svelte). Al terminar: proceso-negocio.completar_fase { fase: "interfaz_construida", resumen: { modulos: ["${h.slug}"] } }.` };
      }
      // hoja completa → continúa a la siguiente
    }
    // FASE 8 — VERIFICACIÓN FINAL EN VIVO (determinista, sin LLM).
    // Todo el plan está construido (módulo + skill + interfaz operativa). Antes
    // de declarar 'completado', el orquestador VERIFICA EN DISCO que el negocio
    // realmente funciona: cada hoja del plan debe tener su módulo que CARGA, su
    // skill en la cantera y su interfaz operativa en el frontend. No se fía del
    // reporte del agente (lección de todo el proceso). Si ya se verificó
    // (flag persistido) o se acaba de completar la fase 'verificado', cierra.
    if (this._verificado(progreso.project_id) || faseActual === 'verificado') {
      return { skill: null, lee: [], escribe: null, mensaje: 'COMPLETO Y VERIFICADO: todas las hojas tienen módulo, skill e interfaz operativa verificados en vivo. F0→F8 cerrado.' };
    }
    return { skill: 'verificar-en-vivo', lee: ['modules/', 'modules/cosecha/cantera/enki/', 'frontend/src/lib/modules/'], escribe: null, mensaje: `FASE 8 · VERIFICACIÓN FINAL (${progreso.con_interfaz_construida}/${progreso.total}): verificar EN VIVO que cada hoja del plan tiene módulo, skill y interfaz operativa en el repo. Al terminar: proceso-negocio.completar_fase { fase: "verificado" }.` };
  }

  // ── PROGRESO DEL PLAN (determinista — el sistema decide, no el LLM) ──
  // Lee plan-construccion.md del proyecto, extrae los slugs de las hojas, y
  // verifica EN DISCO cuántas tienen módulo (modules/<slug>/), cuántas skill
  // (cosecha/cantera/enki/<slug>/SKILL.md) y cuántas interfaz decidida
  // (module.json con ui_handlers tipados o ui_decision.necesita=false).
  // El orquestador usa esto para decidir el siguiente empujón del ciclo por
  // pieza: si quedan hojas sin construir → construir-modulos; si no → completado.

  // ¿La FASE 8 (verificación final) ya se completó para este proyecto?
  // Flag persistido en _emitidos (idempotente, como el resto de fases).
  _verificado(project_id) {
    return this._emitidos.has(`${project_id}::negocio.verificado`);
  }

  async _progresoPlan(project_id) {
    try {
      const r = await this._rpc('fs.read.request', { project_id, path: 'esquemas/plan-construccion.md' });
      const contenido = (r && (r.content || r.data?.content)) || '';
      if (!contenido) return { project_id, total: 0, construidos: 0, con_skill: 0, con_interfaz: 0, con_interfaz_esquematizada: 0, con_interfaz_construida: 0, faltan_por_construir: 0, faltan_por_skill: 0, faltan_por_interfaz: 0, faltan_por_interfaz_esquematizada: 0, faltan_por_interfaz_construida: 0, slugs: [], hojas: [] };
      // Las hojas salen de la ESPINA del plano (bloque ```json enki-plan```, el
      // contrato que el adaptador declara y el JEFE verifica). El fallback es
      // cosechar kebab-case del texto — lo que se hacía siempre — y por eso
      // 'event-driven', 'base-module' o 'micro-agente' entraban como hojas a
      // construir: fantasmas que nunca existen en disco, así que
      // faltan_por_construir jamás bajaba a 0 y el rail no llegaba a completado.
      const slugs = this._hojasDelPlan(contenido);
      let construidos = 0, con_skill = 0, con_interfaz = 0, con_interfaz_esquematizada = 0, con_interfaz_construida = 0;
      // Estado POR HOJA, en orden del plan — lo que el ciclo módulo-por-módulo
      // recorre para actuar sobre la PRIMERA hoja incompleta. Cada hoja recorre
      // TODAS sus fases antes de que empiece la siguiente (decisión del dueño).
      const hojas = [];
      for (const slug of slugs) {
        const h = { slug, construido: false, con_skill: false, con_interfaz: false, con_interfaz_esquematizada: false, con_interfaz_construida: false };
        const dirModulo = this._buscarModulo(slug);
        if (dirModulo) {
          h.construido = true; construidos++;
          if (this._skillEnCantera(slug)) { h.con_skill = true; con_skill++; }
          if (this._interfazDecidida(dirModulo)) {
            h.con_interfaz = true; con_interfaz++;
            if (this._interfazSinNecesidad(dirModulo)) {
              // Sin interfaz (F6) → la spec y la construcción se dan por hechas.
              h.con_interfaz_esquematizada = true; con_interfaz_esquematizada++;
              h.con_interfaz_construida = true; con_interfaz_construida++;
            } else {
              if (this._interfazEsquematizadaEnDisco(dirModulo, slug)) { h.con_interfaz_esquematizada = true; con_interfaz_esquematizada++; }
              if (this._interfazOperativaEnDisco(slug)) { h.con_interfaz_construida = true; con_interfaz_construida++; }
            }
          }
        }
        hojas.push(h);
      }
      return {
        project_id,
        total: slugs.length,
        construidos,
        con_skill,
        con_interfaz,
        con_interfaz_esquematizada,
        con_interfaz_construida,
        faltan_por_construir: slugs.length - construidos,
        faltan_por_skill: construidos - con_skill,
        faltan_por_interfaz: construidos - con_interfaz,
        faltan_por_interfaz_esquematizada: con_interfaz - con_interfaz_esquematizada,
        faltan_por_interfaz_construida: con_interfaz_esquematizada - con_interfaz_construida,
        slugs,
        hojas
      };
    } catch (_) {
      return { project_id, total: 0, construidos: 0, con_skill: 0, con_interfaz: 0, con_interfaz_esquematizada: 0, con_interfaz_construida: 0, faltan_por_construir: 0, faltan_por_skill: 0, faltan_por_interfaz: 0, faltan_por_interfaz_esquematizada: 0, faltan_por_interfaz_construida: 0, slugs: [], hojas: [] };
    }
  }


  // ¿La skill del módulo existe en la cantera? Resuelve el prefijo de vertical:
  // el plan declara slugs SIN prefijo ('recetas', 'opciones', 'carta-digital'…)
  // pero la cantera los guarda con prefijo de vertical ('pizzepos-recetas',
  // 'prisma-opciones', 'pizzepos-carta-digital'…). Busca el slug directo y,
  // si no, con cada prefijo de vertical conocido.
  _skillEnCantera(slug) {
    const cantera = path.join(MODULES_DIR, 'cosecha', 'cantera', 'enki');
    if (fs.existsSync(path.join(cantera, slug, 'SKILL.md'))) return true;
    for (const prefijo of ['pizzepos', 'prisma']) {
      if (fs.existsSync(path.join(cantera, `${prefijo}-${slug}`, 'SKILL.md'))) return true;
    }
    return false;
  }

  // ¿La interfaz está DECLARADA en el blueprint del módulo (F6½ por generador)?

  // La sección `ui` de modules/<slug>/<slug>.blueprint.json (regla ui_declarada).
  // Existe (aunque sea vacía) → declarada (los defaults del generador cubren).
  _interfazEsquematizadaEnDisco(dirModulo, slug) {
    try {
      const bpPath = path.join(dirModulo, `${slug}.blueprint.json`);
      if (!fs.existsSync(bpPath)) return false;
      const m = JSON.parse(fs.readFileSync(bpPath, 'utf8'));
      return !!m && typeof m === 'object' && m.ui !== undefined && m.ui !== null && typeof m.ui === 'object' && !Array.isArray(m.ui);
    } catch (_) {
      return false;
    }
  }

  // ¿La interfaz OPERATIVA del módulo existe en el frontend (envoltorio real)?
  // frontend/src/lib/modules/<slug>/ con manifest.json + index.ts +
  // <Slug>Panel.svelte (envoltorio <BlueprintForm>) + <slug>.blueprint.json
  // (la copia que el Panel importa con ruta relativa).
  _interfazOperativaEnDisco(slug) {
    try {
      const baseRepo = REPO_MODULES_DIR ? path.join(REPO_MODULES_DIR, '..') : path.join(MODULES_DIR, '..');
      const frontDir = path.join(baseRepo, 'frontend', 'src', 'lib', 'modules', slug);
      const slugCap = slug.charAt(0).toUpperCase() + slug.slice(1);
      return ['manifest.json', 'index.ts', `${slugCap}Panel.svelte`, `${slug}.blueprint.json`].every(f => fs.existsSync(path.join(frontDir, f)));
    } catch (_) {
      return false;
    }
  }

  // ── LAS HOJAS DEL PLAN (el contrato, con red de seguridad) ────────────────
  // 1º la ESPINA (```json enki-plan``` → hojas[].slug): lo que el adaptador
  //    DECLARÓ y el JEFE verificó (regla plan_acoplable).
  // 2º si el plano es de los viejos (sin espina): cosecha kebab-case del texto,
  //    filtrando el vocabulario del propio patrón — 'event-driven' o
  //    'base-module' son doctrina, no hojas a construir.
  _hojasDelPlan(contenido) {
    const espina = extraerEspina(contenido);
    if (espina && Array.isArray(espina.hojas)) {
      const declarados = espina.hojas
        .map(h => h && typeof h.slug === 'string' ? h.slug.trim() : null)
        .filter(s => s && !s.includes('/'));
      if (declarados.length) return [...new Set(declarados)];
    }
    return [...new Set((contenido.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g) || [])
      .filter(s => s.length > 3 && !VOCABULARIO_DEL_PATRON.has(s)))];
  }

  // Localiza el directorio de un módulo: modules/<slug>/ o anidado
  // (modules/pizzepos/<slug>/). Devuelve null si no existe.
  _buscarModulo(slug) {
    const directo = path.join(MODULES_DIR, slug);
    if (fs.existsSync(path.join(directo, 'module.json'))) return directo;
    // búsqueda anidada de 1 nivel (verticales: pizzepos, prisma…)
    try {
      for (const grupo of fs.readdirSync(MODULES_DIR)) {
        const p = path.join(MODULES_DIR, grupo, slug, 'module.json');
        if (fs.existsSync(p)) return path.dirname(p);
      }
    } catch (_) {}
    return null;
  }

  // ¿La interfaz del módulo está DECIDIDA (en disco)?
  //   · ui_handlers con type ∈ canónicos Y zone ∈ zonas → decidida (con interfaz)
  //   · ui_decision.necesita === false → decidida (sin interfaz, documentada)
  //   · cualquier otro estado (SIN_TIPO, sin zone, sin ui_decision) → NO decidida
  _interfazDecidida(dirModulo) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dirModulo, 'module.json'), 'utf8'));
      if (m.ui_decision && m.ui_decision.necesita === false) return true;
      const uis = m.ui_handlers || [];
      if (!uis.length) return false;
      const TIPOS = new Set(['workspace_module', 'chat_tool', 'inline_render', 'system_panel']);
      const ZONAS = new Set(['barra_modulos', 'area_chat', 'barra_chat_superior', 'input_chat', 'barra_chat_inferior', 'lateral_derecha']);
      return uis.every(h => h && TIPOS.has(h.type) && ZONAS.has(h.zone));
    } catch (_) {
      return false;
    }
  }

  // Cada fase declara SU entregable verificable. Sin él → FASE_INCOMPLETA.
  // Lista el directorio del entregable (fs.list) y comprueba los archivos REALES
  // — el sistema no se fía de la palabra del LLM.
  async _verificarEntregable(project_id, fase, extra = {}) {
    const ESPERADOS = {
      'esquematizado': {
        dir: 'esquemas',
        // reglas: nombre de archivo → condición (todas deben cumplirse)
        reglas: [
          { nombre: 'esquema.md', cond: 'existe', desc: 'el árbol maestro' },
          { nombre: 'pasada-1-*', cond: 'prefijo', desc: 'ronda 1 del prisma' },
          { nombre: 'pasada-2-*', cond: 'prefijo', desc: 'ronda 2 (prisma recursivo)' },
          { nombre: '*diseccion*', cond: 'contiene', desc: 'la disección punto a punto (FORMA de cada hoja)' }
        ],
        mensaje: 'El esquema del negocio no está completo: se espera <proyecto>/esquemas/ con esquema.md (árbol maestro), las pasadas del prisma (hasta seca) Y la disección (cada hoja atómica con su FORMA). Haz el trabajo primero.'
      },
      'diseccionado': {
        dir: 'esquemas',
        reglas: [
          { nombre: 'esquema.md', cond: 'existe', desc: 'el árbol maestro' },
          { nombre: '*diseccion*', cond: 'contiene', desc: 'la disección con la FORMA asignada' }
        ],
        mensaje: 'La disección no está: se espera <proyecto>/esquemas/ con esquema.md (FORMA asignada a cada pieza) y su pasada-N-diseccion.md.'
      },
      'planificado': {
        // FASE 3 · PLASMA — el entregable es el DISEÑO OOP (pseudocódigo),
        // pensado libre (sin Enki). La traducción la hace el adaptador (3b),
        // que genera plan-construccion.md (lo consume la FASE 4).
        dir: 'esquemas',
        reglas: [
          { nombre: 'diseno-oop.md', cond: 'existe', desc: 'el diseño OOP (plasma)' }
        ],
        mensaje: 'El diseño OOP no está: se espera <proyecto>/esquemas/diseno-oop.md (el plasma — diseño en pseudocódigo OOP, pensado sin conocer Enki). Haz el trabajo primero.'
      },
      'adaptado': {
        // FASE 3b — el entregable es el PLANO traducido a Enki: la espina que
        // el ciclo por pieza consume (_hojasDelPlan) desde la FASE 4.
        dir: 'esquemas',
        reglas: [
          { nombre: 'plan-construccion.md', cond: 'existe', desc: 'el plan de construcción (la espina de hojas)' }
        ],
        mensaje: 'El plan de construcción no está: se espera <proyecto>/esquemas/plan-construccion.md con la espina de hojas (bloque ```json enki-plan```). Haz la traducción a Enki primero.'
      },
      'construido': {
        // FASE 4 — GATE REAL (lección en vivo: el agente reportó 15 módulos
        // que no existían / el deploy los borró). Verifica en el filesystem
        // del SISTEMA que modules/<slug>/ existe Y su index.js carga.
        tipo: 'sistema',
        mensaje: 'El módulo no existe o no carga: se espera modules/<slug>/index.js con require("../_shared/modulo-hibrido-reflejo") (API real). Verifica el módulo en disco — el reporte del agente no cuenta.'
      },
      'skills': {
        // FASE 5 — la skill debe existir en la cantera (la escribió el agente).
        tipo: 'sistema',
        mensaje: 'La skill no existe: se espera modules/cosecha/cantera/enki/<slug>/SKILL.md.'
      },
      'interfaz': {
        // FASE 6 — la decisión de interfaz debe estar EN DISCO, no en la
        // palabra del agente: module.json del módulo con ui_handlers tipados
        // (type+zone canónicos) o con ui_decision.necesita=false documentado.
        tipo: 'sistema',
        mensaje: 'La decisión de interfaz no está en disco: se espera modules/<slug>/module.json con ui_handlers tipados (type ∈ workspace_module|chat_tool|inline_render|system_panel + zone canónica) o con ui_decision.necesita=false (sin interfaz, documentada). El reporte del agente no cuenta.'
      },
      'interfaz_esquematizada': {
        // FASE 6½ — la DECLARACIÓN de la interfaz debe estar EN DISCO: la
        // sección `ui` del blueprint modules/<slug>/<slug>.blueprint.json
        // (regla ui_declarada). Con el generador schema→UI ya NO hay spec .md
        // en storage/esquemas: el blueprint con ui.* es el entregable.
        tipo: 'sistema',
        mensaje: 'La declaración de interfaz no está en disco: se espera modules/<slug>/<slug>.blueprint.json con sección `ui` (ui.ops con args + ui.datos, o ui mínima {} si los defaults del generador cubren). El reporte del agente no cuenta.'
      },
      'interfaz_construida': {
        // FASE 7 — la interfaz OPERATIVA debe existir en el frontend: el
        // ENVOLTORIO real (manifest.json + index.ts + <Slug>Panel.svelte +
        // <slug>.blueprint.json) en frontend/src/lib/modules/<slug>/. Si F6
        // dijo sin interfaz, el entregable se acepta sin archivos (la decisión
        // consta en module.json).
        tipo: 'sistema',
        mensaje: 'La interfaz operativa no está en disco: se espera frontend/src/lib/modules/<slug>/ con manifest.json + index.ts + <Slug>Panel.svelte (envoltorio del generador) + <slug>.blueprint.json (autodescubiertos por el loader). El reporte del agente no cuenta.'
      },
      'verificado': {
        // FASE 8 — VERIFICACIÓN FINAL EN VIVO (determinista, sin LLM).
        // El negocio está completo: TODAS las hojas del plan deben tener su
        // módulo que CARGA, su skill en la cantera y su interfaz operativa en
        // el frontend. No se fía del reporte del agente — cuenta en disco.
        tipo: 'sistema',
        mensaje: 'La verificación final no pasa: se espera que TODAS las hojas del plan tengan su módulo (modules/<slug>/index.js que carga), su skill (cosecha/cantera/enki/<slug>/SKILL.md) y su interfaz operativa (frontend/src/lib/modules/<slug>/). El reporte del agente no cuenta.'
      }
    };
    const spec = ESPERADOS[fase];
    if (!spec) return { ok: true };   // fase sin gate declarado → se acepta
    // FASE 8 — verificación final: TODAS las hojas del plan deben estar
    // construidas + con skill + con interfaz operativa. No se fía del resumen
    // del agente: cuenta el progreso REAL en disco (_progresoPlan).
    if (fase === 'verificado') {
      const progreso = await this._progresoPlan(project_id);
      // Sin plan no hay nada que verificar: "0 hojas verificadas" NO es verde.
      if (progreso.total === 0) {
        return { ok: false, esperado: ['un plan de construcción con hojas'], progreso,
          mensaje: 'No hay plan de construcción (esquemas/plan-construccion.md) con hojas: no hay nada que verificar. Cierra antes las fases 3b y 4.' };
      }
      const faltan = progreso.faltan_por_construir + progreso.faltan_por_skill
        + progreso.faltan_por_interfaz + progreso.faltan_por_interfaz_esquematizada
        + progreso.faltan_por_interfaz_construida;
      if (faltan > 0) {
        return { ok: false, esperado: ['todas las hojas construidas + skill + interfaz operativa'], mensaje: spec.mensaje, progreso };
      }
      return { ok: true, verificados: [`${progreso.total} hojas verificadas en disco`] };
    }
    // Fases con gate de SISTEMA (módulos/skills): el slug viene del resumen
    // del agente (d.resumen.modulos[0] o d.resumen.skills[0]).
    if (spec.tipo === 'sistema') {
      return this._verificarSistema(fase, extra);
    }
    try {
      // El dir puede llevar <slug> (p.ej. 'esquemas/interfaz-<slug>') — se
      // sustituye con el slug REAL del resumen (extra.slug o extra.modulos[0]).
      const slugResumen = (extra && extra.slug) || (extra && Array.isArray(extra.modulos) && extra.modulos[0]) || null;
      const dirReal = slugResumen && spec.dir.includes('<slug>')
        ? spec.dir.replace(/<slug>/g, slugResumen)
        : spec.dir;
      // Listar el directorio del entregable (fs.list) → nombres reales.
      const r = await this._rpc('fs.list.request', { project_id, path: dirReal });
      const entries = (r && (r.files || r.items)) || [];
      const nombres = entries.map(x => (typeof x === 'string' ? x : x && x.name)).filter(Boolean);
      // Comprobar cada regla contra los nombres reales.
      const resultados = spec.reglas.map(reg => {
        let ok = false;
        if (reg.cond === 'existe') ok = nombres.includes(reg.nombre);
        if (reg.cond === 'prefijo') ok = nombres.some(n => n.startsWith(reg.nombre.replace('*', '')));
        if (reg.cond === 'contiene') ok = nombres.some(n => n.includes(reg.nombre.replace(/\*/g, '')));
        return { ...reg, ok, encontrado: ok ? nombres.find(n => reg.cond === 'existe' ? n === reg.nombre : reg.cond === 'prefijo' ? n.startsWith(reg.nombre.replace('*', '')) : n.includes(reg.nombre.replace(/\*/g, ''))) : null };
      });
      const ok = resultados.every(x => x.ok);
      return ok
        ? { ok: true, verificados: resultados.map(x => x.desc) }
        : { ok: false, esperado: resultados.filter(x => !x.ok).map(x => x.desc), mensaje: spec.mensaje, encontrados: nombres };
    } catch (_) {
      return { ok: false, esperado: spec.reglas.map(x => x.desc), mensaje: 'No se pudo verificar el entregable (fs no disponible).' };
    }
  }

  // ── GATE DE SISTEMA (FASE 4 construido / FASE 5 skills) ──
  // Verifica en el filesystem REAL del sistema — no se fía del reporte del agente.
  // 'construido': modules/<slug>/ existe + index.js CARGA (require con la API real).
  // 'skills':      modules/cosecha/cantera/enki/<slug>/SKILL.md existe.
  _verificarSistema(fase, extra = {}) {
    // Modo 1 en 1: un slug. Modo "a full": TODOS los slugs del resumen — se
    // verifican todos, no solo el primero (lección: el gate no se fía del
    // reporte del agente, y un resumen con N módulos exige N verificaciones).
    const slugs = (extra && extra.slug ? [extra.slug] : [])
      || (extra && Array.isArray(extra.modulos) && extra.modulos.length ? extra.modulos : [])
      || (extra && Array.isArray(extra.skills) && extra.skills.length ? extra.skills : [])
      || [];
    if (!slugs.length) {
      return { ok: false, esperado: ['<slug> del módulo construido'], mensaje: 'Falta el slug del módulo en el resumen de completar_fase.' };
    }
    // Cada slug debe pasar su verificación individual; el primero que falle
    // devuelve FASE_INCOMPLETA con el detalle (el agente debe corregirlo).
    const verificados = [];
    for (const slug of slugs) {
      const v = this._verificarUnSlug(fase, slug);
      if (!v.ok) return v;
      verificados.push(...(v.verificados || []));
    }
    return { ok: true, verificados };
  }

  // Verificación individual de UN módulo/skill (usada por _verificarSistema).
  _verificarUnSlug(fase, slug) {
    if (fase === 'construido') {
      const dir = path.join(MODULES_DIR, slug);
      const indexJs = path.join(dir, 'index.js');
      const moduleJson = path.join(dir, 'module.json');
      if (!fs.existsSync(indexJs) || !fs.existsSync(moduleJson)) {
        return { ok: false, esperado: [`modules/${slug}/index.js + module.json en disco`], mensaje: `El módulo ${slug} NO existe en modules/ (verificado en disco). El agente lo reportó pero no está — el deploy pudo borrarlo o nunca se produjo.`, encontrados: fs.existsSync(dir) ? fs.readdirSync(dir) : [] };
      }
      // Verificar que la API es la REAL (import _shared + _atender 4 args + name/version)
      const src = fs.readFileSync(indexJs, 'utf8');
      const apiOk = src.includes("require('../_shared/modulo-hibrido-reflejo')") && /_atender\([^)]*,\s*[^)]*,\s*[^)]*,\s*[^)]*\)/.test(src) && src.includes('this.name') && src.includes('this.version');
      if (!apiOk) {
        return { ok: false, esperado: ['API real: require ../_shared · _atender 4 args · this.name/version'], mensaje: `El módulo ${slug} existe pero NO carga (API interna rota: import, _atender o constructor incorrectos).` };
      }
      // El módulo debe estar EN EL REPO (commiteado/trackeado por git) — si no,
      // el deploy (rsync --delete) lo borrará. No basta con que el archivo
      // exista en el dir: se comprueba con git ls-files (¿está en el índice?).
      if (REPO_MODULES_DIR) {
        const repoDir = path.join(REPO_MODULES_DIR, slug);
        let trackeado = false;
        try {
          const cp = require('child_process');
          const out = cp.execFileSync('git', ['ls-files', '--', `modules/${slug}`], { cwd: path.join(REPO_MODULES_DIR, '..'), encoding: 'utf8' }).trim();
          trackeado = out.length > 0;
        } catch (_) { /* git no disponible → no bloquear, confiar en la existencia */ }
        if (fs.existsSync(path.join(repoDir, 'index.js')) && !trackeado) {
          return { ok: false, esperado: [`modules/${slug}/ COMMITEADO en el repo (~/3enki)`], mensaje: `El módulo ${slug} existe en disco pero NO está commiteado en ~/3enki (git ls-files no lo ve) → el siguiente deploy (rsync --delete) lo borrará. Commitea el módulo (rama → PR → merge) antes de cerrar la fase.` };
        }
      }
      return { ok: true, verificados: [`modules/${slug}/ existe, API real, y en el repo`] };
    }
    if (fase === 'skills') {
      const skillMd = path.join(MODULES_DIR, 'cosecha', 'cantera', 'enki', slug, 'SKILL.md');
      if (!fs.existsSync(skillMd)) {
        return { ok: false, esperado: [`modules/cosecha/cantera/enki/${slug}/SKILL.md en disco`], mensaje: `La skill de ${slug} NO existe en la cantera (verificado en disco).` };
      }
      // Igual que los módulos: la skill también debe estar EN EL REPO — si no,
      // el deploy (rsync --delete) la borrará de la cantera (misma lección).
      if (REPO_MODULES_DIR) {
        const repoSkill = path.join(REPO_MODULES_DIR, 'cosecha', 'cantera', 'enki', slug, 'SKILL.md');
        let trackeada = false;
        try {
          const cp = require('child_process');
          const out = cp.execFileSync('git', ['ls-files', '--', `modules/cosecha/cantera/enki/${slug}`], { cwd: path.join(REPO_MODULES_DIR, '..'), encoding: 'utf8' }).trim();
          trackeada = out.length > 0;
        } catch (_) { /* git no disponible → no bloquear, confiar en la existencia */ }
        if (fs.existsSync(repoSkill) && !trackeada) {
          return { ok: false, esperado: [`modules/cosecha/cantera/enki/${slug}/ COMMITEADA en el repo (~/3enki)`], mensaje: `La skill de ${slug} existe en la cantera pero NO está commiteada en ~/3enki (git ls-files no la ve) → el siguiente deploy (rsync --delete) la borrará. Commitea la skill (rama → PR → merge) antes de cerrar la fase.` };
        }
      }
      return { ok: true, verificados: [`skill ${slug} en la cantera y en el repo`] };
    }
    if (fase === 'interfaz') {
      // FASE 6 — la decisión de interfaz debe estar EN DISCO: module.json con
      // ui_handlers tipados (type+zone canónicos) o ui_decision.necesita=false.
      const dir = this._buscarModulo(slug);
      if (!dir) {
        return { ok: false, esperado: [`modules/<...>/${slug}/module.json en disco`], mensaje: `El módulo ${slug} NO existe en modules/ (verificado en disco) — la interfaz no puede decidirse sobre un módulo ausente.` };
      }
      if (!this._interfazDecidida(dir)) {
        return { ok: false, esperado: ['ui_handlers tipados (type+zone canónicos) o ui_decision.necesita=false'], mensaje: `La interfaz de ${slug} NO está decidida en disco: module.json sin type canónico en sus ui_handlers (o sin ui_decision.necesita=false para módulos sin interfaz). Corre la skill decidir-interfaz y escribe el resultado en module.json.` };
      }
      // En el repo también (el deploy rsync --delete borra lo no commiteado).
      if (REPO_MODULES_DIR) {
        const repoDir = this._buscarModuloRepo(slug);
        let trackeado = false;
        try {
          const cp = require('child_process');
          const out = cp.execFileSync('git', ['ls-files', '--', `modules/${repoDir ? path.relative(MODULES_DIR, repoDir) : slug}`], { cwd: path.join(REPO_MODULES_DIR, '..'), encoding: 'utf8' }).trim();
          trackeado = out.length > 0;
        } catch (_) { /* git no disponible → no bloquear */ }
        if (repoDir && !trackeado) {
          return { ok: false, esperado: [`module.json de ${slug} COMMITEADO en el repo (~/3enki)`], mensaje: `La decisión de interfaz de ${slug} NO está commiteada en ~/3enki (git ls-files no la ve) → el siguiente deploy la borrará. Commitea el module.json (rama → PR → merge) antes de cerrar la fase.` };
        }
      }
      return { ok: true, verificados: [`interfaz de ${slug} decidida en disco y en el repo`] };
    }
    if (fase === 'interfaz_esquematizada') {
      // FASE 6½ — la DECLARACIÓN debe estar EN DISCO: la sección `ui` del
      // blueprint modules/<slug>/<slug>.blueprint.json (regla ui_declarada).
      const dirModulo = this._buscarModulo(slug);
      if (!dirModulo) {
        return { ok: false, esperado: [`modules/<...>/${slug}/ en disco`], mensaje: `El módulo ${slug} NO existe en modules/ (verificado en disco) — no puede declararse la interfaz de un módulo ausente.` };
      }
      if (this._interfazSinNecesidad(dirModulo)) {
        return { ok: true, verificados: [`interfaz de ${slug}: F6 decidió sin interfaz (ui_decision.necesita=false) — no hay nada que declarar`] };
      }
      if (!this._interfazEsquematizadaEnDisco(dirModulo, slug)) {
        return { ok: false, esperado: [`modules/<slug>/<slug>.blueprint.json con sección ui (o ui mínima {})`], mensaje: `La declaración de interfaz de ${slug} NO está en disco: modules/${slug}/${slug}.blueprint.json sin sección \`ui\`. Corre la skill esquematizar-interfaz y declara ui.ops + ui.datos EN el blueprint (o ui mínima {} si los defaults del generador cubren).` };
      }
      // En el repo también (el deploy borra lo no commiteado).
      if (REPO_MODULES_DIR) {
        const repoDir = this._buscarModuloRepo(slug);
        const bpRel = `${repoDir ? path.relative(MODULES_DIR, repoDir) : slug}/${slug}.blueprint.json`;
        let trackeado = false;
        try {
          const cp = require('child_process');
          const out = cp.execFileSync('git', ['ls-files', '--', `modules/${bpRel}`], { cwd: path.join(REPO_MODULES_DIR, '..'), encoding: 'utf8' }).trim();
          trackeado = out.length > 0;
        } catch (_) { /* git no disponible → no bloquear */ }
        if (repoDir && !trackeado) {
          return { ok: false, esperado: [`blueprint de ${slug} COMMITEADO en el repo (~/3enki)`], mensaje: `La declaración de interfaz de ${slug} NO está commiteada en ~/3enki (git ls-files no la ve) → el siguiente deploy la borrará. Commitea el blueprint (rama → PR → merge) antes de cerrar la fase.` };
        }
      }
      return { ok: true, verificados: [`interfaz de ${slug} declarada (sección ui en el blueprint), en disco y en el repo`] };
    }
    if (fase === 'interfaz_construida') {
      // FASE 7 — la interfaz OPERATIVA existe en el frontend: el ENVOLTORIO
      // (manifest.json + index.ts + <Slug>Panel.svelte + <slug>.blueprint.json)
      // autodescubierto por el loader. Excepción legítima: F6 decidió
      // ui_decision.necesita=false → el módulo NO lleva interfaz y la fase se
      // acepta sin archivos.
      const dirModulo = this._buscarModulo(slug);
      if (dirModulo && this._interfazSinNecesidad(dirModulo)) {
        return { ok: true, verificados: [`interfaz de ${slug}: F6 decidió sin interfaz (ui_decision.necesita=false) — no hay nada que construir`] };
      }
      const slugCap = slug.charAt(0).toUpperCase() + slug.slice(1);
      const frontDir = path.join(REPO_MODULES_DIR || MODULES_DIR, '..', 'frontend', 'src', 'lib', 'modules', slug);
      const envoltorio = ['manifest.json', 'index.ts', `${slugCap}Panel.svelte`, `${slug}.blueprint.json`];
      const faltantes = envoltorio.filter(f => !fs.existsSync(path.join(frontDir, f)));
      if (faltantes.length) {
        return { ok: false, esperado: [`frontend/src/lib/modules/${slug}/ con ${envoltorio.join(' + ')}`], mensaje: `La interfaz operativa de ${slug} NO está completa: faltan ${faltantes.join(', ')} en frontend/src/lib/modules/${slug}/. Corre la skill construir-interfaz y genera el ENVOLTORIO del generador (manifest + index + <Slug>Panel.svelte con <BlueprintForm blueprint moduleId /> + copia del blueprint).` };
      }
      // En el repo también (el deploy del frontend va desde el repo).
      try {
        const cp = require('child_process');
        const out = cp.execFileSync('git', ['ls-files', '--', `frontend/src/lib/modules/${slug}`], { cwd: path.join(REPO_MODULES_DIR || MODULES_DIR, '..'), encoding: 'utf8' }).trim();
        if (!out.length) {
          return { ok: false, esperado: [`frontend/src/lib/modules/${slug}/ COMMITEADO en el repo (~/3enki)`], mensaje: `La interfaz de ${slug} existe en disco pero NO está commiteada en ~/3enki (git ls-files no la ve) → el siguiente deploy la borrará. Commitea el envoltorio (rama → PR → merge) antes de cerrar la fase.` };
        }
      } catch (_) { /* git no disponible → no bloquear */ }
      return { ok: true, verificados: [`interfaz operativa de ${slug}: envoltorio completo (trío + blueprint) en frontend/ y en el repo`] };
    }
    return { ok: true };
  }

  // ¿F6 decidió que el módulo NO necesita interfaz? (ui_decision.necesita=false)
  _interfazSinNecesidad(dirModulo) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dirModulo, 'module.json'), 'utf8'));
      return !!(m.ui_decision && m.ui_decision.necesita === false);
    } catch (_) {
      return false;
    }
  }

  // Igual que _buscarModulo pero contra el repo de desarrollo (~/3enki/modules).
  _buscarModuloRepo(slug) {
    const directo = path.join(REPO_MODULES_DIR, slug);
    if (fs.existsSync(path.join(directo, 'module.json'))) return directo;
    try {
      for (const grupo of fs.readdirSync(REPO_MODULES_DIR)) {
        const p = path.join(REPO_MODULES_DIR, grupo, slug, 'module.json');
        if (fs.existsSync(p)) return path.dirname(p);
      }
    } catch (_) {}
    return null;
  }

  // ── NÚCLEO: evento → empujón de la skill siguiente ──
  async _encadenar(event, eventoNombre) {
    const d = (event && event.data) || event || {};
    const project_id = d.project_id || d.id;
    if (!project_id) return;

    const paso = MAPA_PROCESO[eventoNombre];
    if (!paso) return;   // evento no mapeado → no-op (el proceso no lo conoce)

    // Idempotencia: este proyecto ya recibió el empujón de esta fase → no repetir.
    const clave = `${project_id}::${eventoNombre}`;
    if (this._emitidos.has(clave)) return;
    this._emitidos.set(clave, Date.now());

    // negocio.identificado cierra la F0 → escribir su archivo de fase
    if (eventoNombre === 'negocio.identificado') {
      await this._escribirArchivoFase(project_id, 'identificado', 'project.created', { ok: true }, d);
    }

    this._empujar(project_id, eventoNombre, paso);
  }

  // Publica el empujón (pendientes + conserje.empujon → el nervio lo surfacea).
  _empujar(project_id, eventoNombre, paso) {
    const empujon = {
      tipo: 'proceso',
      recurso: paso.skill,
      mensaje: PRINCIPIO_ARQUITECTONICO + paso.mensaje,
      accion_sugerida: `cosecha.obtener:${paso.skill}`,
      fase: eventoNombre,
      project_id,
      lee: paso.lee || [],
      escribe: paso.escribe || null
    };
    this.pendientes.set(project_id, empujon);   // el nervio lo lee y consume (una vez)

    try {
      this.eventBus?.publish('conserje.empujon', {
        project_id, ...empujon,
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      this.metrics?.increment('proceso-negocio.empujon.total', { fase: eventoNombre, skill: paso.skill });
      this.logger?.info('proceso-negocio.empujon', { project_id, fase: eventoNombre, skill: paso.skill });
    } catch (_) { /* best-effort */ }
  }

  // ── ESCRIBIR ARCHIVO DE FASE en el storage del proyecto ──
  // Cada fase completada deja su registro JSON determinista en <proyecto>/proceso-negocio/<archivo>.json
  async _escribirArchivoFase(project_id, fase, eventoFase, entregable, resumen) {
    const nombre = ARCHIVO_FASE[eventoFase];
    if (!nombre) return;  // F2 pasadas se gestionan aparte
    const registro = {
      fase: nombre,
      evento: eventoFase,
      estado: 'completada',
      completada_el: new Date().toISOString(),
      resumen: (resumen && Object.keys(resumen).length) ? resumen : {},
      verificados: entregable.verificados || [],
      project_id
    };
    try {
      await this._rpc('fs.write.request', {
        project_id,
        path: `proceso-negocio/${nombre}.json`,
        content: JSON.stringify(registro, null, 2)
      });
    } catch (_) { /* best-effort — no bloquea el proceso */ }
  }

  // ── F2: escribir un JSON por cada pasada + cierre ──
  // Lee esquemas/ del proyecto, encuentra las pasadas y la disección,
  // y escribe fase2-pasada-N.json + fase2-cierre-diseccion.json en proceso-negocio/
  async _escribirFase2Pasadas(project_id, entregable) {
    const ts = new Date().toISOString();
    try {
      const r = await this._rpc('fs.list.request', { project_id, path: 'esquemas' });
      const archivos = (r && (r.files || r.items)) || [];
      const nombres = archivos.map(x => typeof x === 'string' ? x : x && x.name).filter(Boolean);

      const pasadas = nombres
        .filter(n => /^pasada-\d+/.test(n))
        .sort((a, b) => {
          const na = parseInt(a.match(/pasada-(\d+)/)[1], 10);
          const nb = parseInt(b.match(/pasada-(\d+)/)[1], 10);
          return na - nb;
        });

      for (const pasada of pasadas) {
        const num = pasada.match(/pasada-(\d+)/)[1];
        const contenido = await this._leerArchivoProyecto(project_id, `esquemas/${pasada}`);
        const registro = {
          fase: `fase2-pasada-${num}`,
          evento: 'negocio.esquematizado',
          tipo: 'pasada',
          numero: parseInt(num, 10),
          estado: 'completada',
          completada_el: ts,
          fuente: `esquemas/${pasada}`,
          contenido: contenido || null,
          project_id
        };
        await this._rpc('fs.write.request', {
          project_id,
          path: `proceso-negocio/fase2-pasada-${num}.json`,
          content: JSON.stringify(registro, null, 2)
        });
      }

      const diseccion = nombres.find(n => n.includes('diseccion'));
      if (diseccion) {
        const contenido = await this._leerArchivoProyecto(project_id, `esquemas/${diseccion}`);
        const registro = {
          fase: 'fase2-cierre-diseccion',
          evento: 'negocio.esquematizado',
          tipo: 'cierre',
          estado: 'completada',
          completada_el: ts,
          fuente: `esquemas/${diseccion}`,
          verificados: entregable.verificados || [],
          contenido: contenido || null,
          project_id
        };
        await this._rpc('fs.write.request', {
          project_id,
          path: 'proceso-negocio/fase2-cierre-diseccion.json',
          content: JSON.stringify(registro, null, 2)
        });
      }
    } catch (_) { /* best-effort — no bloquea el proceso */ }
  }

  async _leerArchivoProyecto(project_id, filePath) {
    try {
      const r = await this._rpc('fs.read.request', { project_id, path: filePath });
      return (r && (r.content || r.data?.content)) || null;
    } catch (_) { return null; }
  }

  // Lectura de la cola (la usa el nervio/ai-gateway si decide leerla aquí).
  onEstadoRequest(e) {
    return this._atender(e, 'estado', 'proceso-negocio.estado.response', d => this._estado(d));
  }

  _estado({ project_id } = {}) {
    if (!project_id) return this._invalid('project_id');
    const pendiente = this.pendientes.get(project_id) || null;
    return { status: 200, data: { project_id, pendiente, emitidas: [...this._emitidos.keys()].filter(k => k.startsWith(project_id + '::')) } };
  }

  // ── Tools (para el LLM del chat) ──
  // Misma puerta, mismo verbo: gate incluido. El LLM no gana permisos por
  // entrar por la tool en vez de por el evento.
  async toolCompletarFase(params) {
    return this._completarFase(params || {});
  }

}

module.exports = ProcesoNegocioReflejo;
