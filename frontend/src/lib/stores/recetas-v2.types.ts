/**
 * TIPOS TYPESCRIPT PARA RECETAS V2
 *
 * Tipos compartidos entre frontend y backend para type safety
 */

// ==========================================
// ENTIDADES BASE
// ==========================================

export interface Ingrediente {
  id: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  precio_mercado?: number;
  precio_compra?: number;
  categoria?: string;
  alerge nos?: string[];
  notas?: string;
}

export interface RecetaBase {
  id: string;
  nombre: string;
  descripcion?: string;
  porciones: number;
  tiempo_preparacion?: number;
  dificultad?: number;
  categorias?: string[];
  etiquetas?: string[];
  ingredientes: Ingrediente[];
  instrucciones?: string[];
}

export interface RecetaCompleta extends RecetaBase {
  proyecto_id: string;
  fuente?: 'url' | 'pdf' | 'imagen' | 'manual' | 'investigada';
  fuente_url?: string;
  version_actual: number;
  estado: 'activa' | 'archivada' | 'borrador';
  created_at: number;
  updated_at: number;
  created_by?: string;
  updated_by?: string;

  // Análisis
  analisis?: RecetaAnalisis;

  // Costes calculados
  coste_total?: number;
  coste_porcion?: number;

  // Búsqueda
  viabilidad?: 'baja' | 'media' | 'alta';
  metodos_coccion?: string[];
  tipos_plato?: string[];
  caracteristicas?: string[];
  tags?: string[];
}

export interface RecetaResumen {
  id: string;
  nombre: string;
  estado: string;
  fuente: string;
  updated_at: number;
  porciones?: number;
  coste_porcion?: number;
  viabilidad?: string;
}

// ==========================================
// VERSIONADO Y AUDITORÍA
// ==========================================

export interface RecetaVersion {
  id: string;
  version_num: number;
  datos_json: string;
  cambios_json?: Record<string, any>;
  changed_at: number;
  changed_by?: string;
  es_revertida?: boolean;
  revertida_a_version_id?: string;
}

export interface RecetaDiff {
  campo: string;
  anterior: any;
  nuevo: any;
}

// ==========================================
// INGESTION
// ==========================================

export type IngestionTipo = 'url' | 'pdf' | 'imagen' | 'json' | 'manual' | 'auto';

export interface IngestionRequest {
  proyecto_id: string;
  input: string | object;
  tipo?: IngestionTipo;
  fuente_referencia?: string;
}

export interface IngestionStep {
  step: 'intake' | 'download' | 'parse' | 'normalize' | 'index';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message: string;
  progress?: number;
  duracion_ms?: number;
  error?: string;
}

export interface IngestionProgress {
  ingestion_id: string;
  estado: 'iniciada' | 'procesando' | 'completada' | 'fallida';
  pasos: IngestionStep[];
  receta_normalizada?: RecetaBase;
  error?: string;
  timestamp: number;
}

// ==========================================
// ANÁLISIS
// ==========================================

export interface RecetaAnalisis {
  viabilidad: 'baja' | 'media' | 'alta';
  es_realista: boolean;

  // Tiempos
  tiempo_documento: number;
  tiempo_realista: number;
  tiempo_diferencia: string;

  // Costes
  coste_estimado_documento: number;
  coste_realista: number;
  coste_diferencia_pct: number;

  // Dificultad
  dificultad_documento: number;
  dificultad_realista: number;

  // Análisis de ingredientes
  ingredientes_comunes: string[];
  ingredientes_problematicos: string[];
  alerge nos_detectados: string[];

  // Recomendaciones
  notas_viabilidad: string;
  sustituciones_posibles: Array<{
    ingrediente: string;
    alternativas: string[];
  }>;
  puntos_debiles: string[];
  puntos_fuertes: string[];
  potencial_mejora: string;

  // Metadata
  analizado_por?: string;
  analizado_at: number;
  profundidad: 'rapida' | 'normal' | 'profunda';
}

export interface AnalisisRequest {
  receta_id: string;
  proyecto_id: string;
  profundidad?: 'rapida' | 'normal' | 'profunda';
}

// ==========================================
// BÚSQUEDA
// ==========================================

export interface CriterioBusqueda {
  proyecto_id: string;

  // Texto
  nombre?: string;

  // Ingredientes
  ingredientes?: string[];
  ingredientes_excluir?: string[];

  // Dificultad
  dificultad_min?: number;
  dificultad_max?: number;

  // Tiempo
  tiempo_min?: number;
  tiempo_max?: number;

  // Coste
  coste_min?: number;
  coste_max?: number;

  // Características
  caracteristicas?: string[];
  alerge nos_excluir?: string[];
  viabilidad?: 'baja' | 'media' | 'alta';

  // Paginación
  limit?: number;
}

export interface ResultadoBusqueda {
  recetas: RecetaResumen[];
  total_encontradas: number;
  criterios_aplicados: Partial<CriterioBusqueda>;
  tiempo_busqueda_ms: number;
}

// ==========================================
// INGREDIENTES
// ==========================================

export interface IngredienteCatalogo {
  id: string;
  nombre: string;
  categoria?: string;
  unidad_base: string;
  precio_mercado_kg?: number;
  precio_compra_kg?: number;
  fuente_precio?: string;
  alerge nos?: string[];
  created_at: number;
  updated_at: number;
}

export interface ActualizarPrecioRequest {
  ingrediente_id: string;
  proyecto_id: string;
  precio_mercado: number;
  fuente?: string;
}

// ==========================================
// ESTADÍSTICAS
// ==========================================

export interface EstadisticasProyecto {
  proyecto_id: string;
  total_recetas: number;
  recetas_activas: number;
  recetas_archivadas: number;
  total_ingredientes: number;
  coste_promedio?: number;
  coste_minimo?: number;
  coste_maximo?: number;
}

// ==========================================
// ESTADO DEL STORE (SVELTE)
// ==========================================

export interface RecetasStoreState {
  // Datos
  recetas: RecetaCompleta[];
  selectedReceta: RecetaCompleta | null;
  selectedVersion: RecetaVersion | null;
  versionHistory: RecetaVersion[];
  ingredientes: IngredienteCatalogo[];

  // Búsqueda
  ultimaCriterioBusqueda: CriterioBusqueda | null;
  ultimosResultados: RecetaResumen[];

  // Ingestion en progreso
  ingestionProgress: IngestionProgress | null;

  // Análisis en progreso
  analisisEnProgreso: boolean;

  // Estados
  loading: boolean;
  error: string | null;

  // Metadata
  proyecto_id: string | null;
}

// ==========================================
// EVENTOS INTERNOS
// ==========================================

export interface EventoReceta {
  tipo: 'creada' | 'actualizada' | 'eliminada' | 'versionada';
  receta_id: string;
  timestamp: number;
  cambios?: Record<string, any>;
}

export interface EventoIngestion {
  tipo: 'iniciada' | 'progreso' | 'completada' | 'fallida';
  ingestion_id: string;
  progress: IngestionProgress;
  timestamp: number;
}

export interface EventoAnalisis {
  tipo: 'iniciado' | 'completado' | 'fallido';
  receta_id: string;
  analisis?: RecetaAnalisis;
  error?: string;
  timestamp: number;
}

// ==========================================
// RESPUESTAS API
// ==========================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface ApiResponseListar extends ApiResponse<RecetaResumen[]> {
  total: number;
  filtros_aplicados?: Partial<CriterioBusqueda>;
}

export interface ApiResponseHistorial extends ApiResponse<RecetaVersion[]> {
  receta_id: string;
}

export interface ApiResponseEstadisticas extends ApiResponse<EstadisticasProyecto> {}
