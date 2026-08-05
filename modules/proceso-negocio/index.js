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
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

// ── EL MAPA DE PROCESO: evento de fase completada → skill siguiente ──
// El espinazo del proceso. Cada entrada: el evento que marca el fin de una fase
// y la skill que el chat debe ejecutar a continuación (con su mensaje).
const MAPA_PROCESO = {
  // project.created NO es fin de fase: es el NACIMIENTO → arranca la fase 0.
  'project.created': {
    skill: 'identidad-negocio',
    mensaje: 'El proyecto acaba de nacer. Primera fase (FASE 0): dar identidad al negocio — ¿qué estás construyendo, qué vendes, cómo lo elaboras?'
  },
  'negocio.identificado': {
    skill: 'esquematizar-negocio',
    mensaje: 'El negocio ya tiene identidad declarada. Siguiente fase (FASE 1/2): esquematizar el negocio — lee la identidad (project-profile.get) y aplica el método del esquematizador para descubrir las PIEZAS que el negocio necesita. Al terminar: proceso-negocio.completar_fase { fase: "esquematizado" }.'
  },
  'negocio.esquematizado': {
    // La FASE 2 (agente esquematizar-negocio) INCLUYE la disección punto a
    // punto (pasada-N-diseccion.md con la FORMA de cada hoja). El siguiente
    // paso es PLANIFICAR la construcción: quién ordena la obra por etapas.
    skill: 'planificar-construccion',
    mensaje: 'El esquema y la disección del negocio están listos. Siguiente fase (FASE 3): planificar la CONSTRUCCIÓN — lee esquemas/pasada-N-diseccion.md y esquema.md, ordena las hojas por DEPENDENCIAS, agrupa en ETAPAS con entregable verificable cada una, y escribe el plan en esquemas/plan-construccion.md. Al terminar: proceso-negocio.completar_fase { fase: "planificado" }.'
  },
  'negocio.planificado': {
    skill: 'construir-modulos',
    mensaje: 'El plan de construcción está listo (esquemas/plan-construccion.md). Siguiente fase (FASE 4): CONSTRUIR — ejecuta el plan etapa a etapa, UNA hoja a la vez: lee el contrato de cada hoja en esquema.md, genera module.json + index.js según su FORMA (REFLEJO · CUSTODIO · CONVERSOR · PUENTE) y llámalo con productor.producir. Verifica cada uno antes de seguir. Al terminar: proceso-negocio.completar_fase { fase: "construido" }.'
  },
  'negocio.construido': {
    skill: 'escribir-skills',
    mensaje: 'Un módulo del negocio acaba de construirse. Siguiente paso (FASE 5): escribir la SKILL FULL de ese módulo en la cantera — lee modules/<slug>/module.json + index.js y escribe modules/cosecha/cantera/enki/<slug>/SKILL.md con TODA la lógica real embebida (ops, eventos, datos, errores — SIN RESTAR NADA). Al terminar: proceso-negocio.completar_fase { fase: "skills" }.'
  },
  'negocio.skills': {
    // CICLO POR PIEZA (decisión de Paco: "fase 4 1º, fase 5 1º" — no todos de
    // una): cada módulo construido recibe su skill ANTES de pasar al siguiente.
    // construir-modulos construye UNA hoja; escribir-skills escribe SU skill;
    // el mapa vuelve a construir-modulos para la siguiente hoja. Cuando no
    // queden hojas sin construir, construir-modulos cierra con fase
    // 'completado' → fin del proceso.
    skill: 'construir-modulos',
    mensaje: 'La skill del módulo está escrita. Siguiente paso (FASE 4): construir el SIGUIENTE módulo del plan — UNA hoja a la vez, en el orden de las etapas de esquemas/plan-construccion.md, sin tocar los ya construidos. Al terminar: proceso-negocio.completar_fase { fase: "construido" }. Si NO quedan hojas sin construir: proceso-negocio.completar_fase { fase: "completado" }.'
  },
  'negocio.completado': {
    // FIN DEL PROCESO — todas las piezas construidas y con skill.
    skill: null,
    mensaje: 'El proceso de construcción del negocio está COMPLETO: todas las hojas de la disección tienen su módulo y su skill. El negocio está construido y documentado.'
  }
  // Fases siguientes (cuando existan y emitan su evento):
  // 'negocio.verificado':   { skill: 'verificar-vivo', mensaje: '...' }
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
    return this._atender(e, 'completar_fase', 'proceso-negocio.completar_fase.response', async d => {
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
      // Marcar la fase completada (idempotente) y empujar la siguiente.
      const clave = `${project_id}::${eventoFase}`;
      if (!this._emitidos.has(clave)) {
        this._emitidos.set(clave, Date.now());
        // skill:null = FIN DEL PROCESO (no hay siguiente fase) → no empujar.
        if (paso.skill) this._empujar(project_id, eventoFase, paso);
      }
      return { status: 200, data: { project_id, fase_completada: eventoFase, siguiente: paso.skill, entregable, fin: !paso.skill } };
    });
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
      }
    };
    const spec = ESPERADOS[fase];
    if (!spec) return { ok: true };   // fase sin gate declarado → se acepta
    // Fases con gate de SISTEMA (módulos/skills): el slug viene del resumen
    // del agente (d.resumen.modulos[0] o d.resumen.skills[0]).
    if (spec.tipo === 'sistema') {
      return this._verificarSistema(fase, extra);
    }
    try {
      // Listar el directorio del entregable (fs.list) → nombres reales.
      const r = await this._rpc('fs.list.request', { project_id, path: spec.dir });
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
    const slug = (extra && extra.slug) || (extra && extra.modulos && extra.modulos[0]) || (extra && extra.skills && extra.skills[0]);
    if (!slug) {
      return { ok: false, esperado: ['<slug> del módulo construido'], mensaje: 'Falta el slug del módulo en el resumen de completar_fase.' };
    }
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
      return { ok: true, verificados: [`skill ${slug} en la cantera`] };
    }
    return { ok: true };
  }

  // ── NÚCLEO: evento → empujón de la skill siguiente ──
  _encadenar(event, eventoNombre) {
    const d = (event && event.data) || event || {};
    const project_id = d.project_id || d.id;
    if (!project_id) return;

    const paso = MAPA_PROCESO[eventoNombre];
    if (!paso) return;   // evento no mapeado → no-op (el proceso no lo conoce)

    // Idempotencia: este proyecto ya recibió el empujón de esta fase → no repetir.
    const clave = `${project_id}::${eventoNombre}`;
    if (this._emitidos.has(clave)) return;
    this._emitidos.set(clave, Date.now());

    this._empujar(project_id, eventoNombre, paso);
  }

  // Publica el empujón (pendientes + conserje.empujon → el nervio lo surfacea).
  _empujar(project_id, eventoNombre, paso) {
    const empujon = {
      tipo: 'proceso',
      recurso: paso.skill,
      mensaje: paso.mensaje,
      accion_sugerida: `cosecha.obtener:${paso.skill}`,
      fase: eventoNombre,
      project_id
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
  toolCompletarFase(params) {
    const project_id = params.project_id;
    if (!project_id) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };
    const fase = params.fase;
    const eventoFase = `negocio.${fase}`;
    const paso = MAPA_PROCESO[eventoFase];
    if (!paso) {
      return { status: 400, data: { error: 'FASE_NO_MAPEADA', message: `No hay siguiente fase para '${eventoFase}'`, fase } };
    }
    const clave = `${project_id}::${eventoFase}`;
    if (!this._emitidos.has(clave)) {
      this._emitidos.set(clave, Date.now());
      this._empujar(project_id, eventoFase, paso);
    }
    return { status: 200, data: { project_id, fase_completada: eventoFase, siguiente: paso.skill, resumen: params.resumen || null } };
  }
}

module.exports = ProcesoNegocioReflejo;
