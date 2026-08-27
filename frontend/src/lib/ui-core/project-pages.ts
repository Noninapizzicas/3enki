/**
 * project-pages — el PAGE-SET emerge del PROYECTO, no de una lista clavada.
 *
 * El rail (PageNavStrip) y la work-bar dejan de mostrar una constante pizzepos: proyectan
 * las páginas que ESTE proyecto tiene vivas. Fuente (escalera de determinismo):
 *   1. config del proyecto (opción A: project-manager la siembra y la CRECE en runtime, persistida)
 *   2. semilla por tipo de proyecto (fallback determinista mientras la config no la traiga)
 *
 * Un proyecto `prisma` nace con page-set VACÍO — sus páginas emergen cuando el comercio las
 * crea (en tiempo de ejecución, persistidas). Un `pizzepos` trae su set histórico. La identidad
 * de la navegación EMERGE del proyecto — misma tesis que el BOSS con los órganos.
 */

export interface PageDef {
  id: string;
  icon: string;
  label: string;
  // false = página NO navegable (panel de work-bar, sin ruta propia): el rail
  // lateral (PageNavStrip) la omite. El page-set la declara para gatear la
  // work-bar, pero no hay /<proyecto>/<id> que visitar.
  nav?: boolean;
}

/** Catálogo de páginas conocidas: id → icono + etiqueta. El page-set del proyecto indexa aquí. */
export const PAGE_CATALOG: Record<string, PageDef> = {
  // — pizzepos / recetario —
  recetas:          { id: 'recetas',          icon: '📖',  label: 'Recetas' },
  escandallo:       { id: 'escandallo',       icon: '📊',  label: 'Escandallo' },
  viabilidad:       { id: 'viabilidad',       icon: '📈',  label: 'Viabilidad' },
  'carta-manager':  { id: 'carta-manager',    icon: '🗂️',  label: 'Carta manager' },
  'menu-generator': { id: 'menu-generator',   icon: '✨',  label: 'Menú generator' },
  'carta-design':   { id: 'carta-design',     icon: '🎨',  label: 'Carta diseño' },
  'carta-digital':  { id: 'carta-digital',    icon: '📱',  label: 'Carta digital' },
  'carta-marketing':{ id: 'carta-marketing',  icon: '📣',  label: 'Carta marketing' },
  'carta-scheduler':{ id: 'carta-scheduler',  icon: '📅',  label: 'Programación' },
  ingredientes:     { id: 'ingredientes',     icon: '🥬',  label: 'Ingredientes' },
  tarifas:          { id: 'tarifas',          icon: '🏷️',  label: 'Tarifas' },
  // — prisma (comercio universal): entran cuando el proyecto las declara/crea en runtime —
  catalogo:         { id: 'catalogo',         icon: '🔷',  label: 'Catálogo' },
  pos:              { id: 'pos',              icon: '🧾',  label: 'POS' },
  escaparate:       { id: 'escaparate',       icon: '🪟',  label: 'Escaparate' },
  agenda:           { id: 'agenda',           icon: '📅',  label: 'Agenda' },
  // — buscador de nichos (radar): visible SOLO si el proyecto declara 'interfaz' en su page-set —
  // nav:false → el rail lateral NO la pinta (no hay ruta /<proyecto>/interfaz); el botón
  // vive en la work-bar (manifest zone work-bar + loader en panels.ts), que abre el panel.
  interfaz:         { id: 'interfaz',         icon: '📡',  label: 'Radar de nichos', nav: false },
  // — F6½/F7 (The Pirate — prisma): paneles generados del blueprint. nav:false → el rail
  // lateral no los pinta (sin ruta /<proyecto>/<id>); el page-set los gatea en la work-bar
  // (masa/lotes/mise-en-place) y el chat-tools (producir, que además exige loader en panels.ts).
  masa:             { id: 'masa',             icon: '🍞',  label: 'Masa', nav: false },
  lotes:            { id: 'lotes',            icon: '🧊',  label: 'Lotes', nav: false },
  'mise-en-place':  { id: 'mise-en-place',    icon: '🥘',  label: 'Mise en Place', nav: false },
  producir:         { id: 'producir',         icon: '🏭',  label: 'Producir', nav: false },
  pedidos:          { id: 'pedidos',          icon: '📋',  label: 'Pedidos', nav: false },
  variaciones:      { id: 'variaciones',      icon: '🔧',  label: 'Variaciones', nav: false },
  productos:        { id: 'productos',        icon: '🍕',  label: 'Productos', nav: false }
};

/** Semilla por tipo: lo que un proyecto trae al nacer, antes de que crezca en runtime. */
const SEED_BY_TYPE: Record<string, string[]> = {
  pizzepos: [
    'recetas', 'escandallo', 'viabilidad', 'carta-manager', 'menu-generator',
    'carta-design', 'carta-digital', 'carta-marketing', 'carta-scheduler',
    'ingredientes', 'tarifas'
  ],
  prisma: [] // nace VACÍO — las páginas emergen en runtime, persistidas
};

/** El tipo de proyecto, best-effort desde lo que devuelve project.get. */
export function resolveType(project: any): string {
  if (!project) return 'general';
  if (project.metadata?.projectType) return String(project.metadata.projectType);
  if (project.type) return String(project.type);
  const features: string[] = project.metadata?.features || [];
  if (features.includes('pizzepos') || project.metadata?.workspaceType === 'pizzepos') return 'pizzepos';
  if (features.includes('prisma') || project.config?.prisma?.enabled || project.metadata?.workspaceType === 'prisma') return 'prisma';
  return project.metadata?.workspaceType || 'general';
}

/** El page-set del proyecto: config manda (opción A); si no, la semilla del tipo. */
export function resolvePages(project: any, type: string): string[] {
  const fromConfig = project?.config?.ui?.pages ?? project?.metadata?.pages;
  if (Array.isArray(fromConfig)) return fromConfig.map(String);
  return SEED_BY_TYPE[type] ?? [];
}

/** Ids → PageDef, filtrando lo desconocido. El orden lo fija el page-set. */
export function pagesFromIds(ids: string[]): PageDef[] {
  return (Array.isArray(ids) ? ids : []).map((id) => PAGE_CATALOG[id]).filter(Boolean) as PageDef[];
}

/** Fallback para rutas SIN proyecto en contexto (rutas planas): el set histórico pizzepos. */
export function seedFallback(): string[] {
  return SEED_BY_TYPE.pizzepos;
}

/** ¿Es `id` una página de navegación conocida (gateable por page-set)? */
export function isNavPage(id: string): boolean {
  return !!id && Object.prototype.hasOwnProperty.call(PAGE_CATALOG, id);
}
