<script lang="ts">
  /**
   * ViabilidadPanel — lista de expedientes de evaluacion de viabilidad
   * por receta.
   *
   * Lectura directa de /viabilidad.json del proyecto activo via fs.read
   * (patron lecturas-frontend-via-fs-read). El blueprint del modulo
   * viabilidad persiste un expediente por cada evaluacion ejecutada (audit
   * trail). Este panel muestra esa lista; las evaluaciones nuevas las
   * pide el usuario al chat.
   */

  import { onMount } from 'svelte';
  import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';
  import ViabilidadBrowser from './ViabilidadBrowser.svelte';
  import ViabilidadDetail from './ViabilidadDetail.svelte';

  export let panelId: string = '';

  const VIABILIDAD_PATH = '/viabilidad.json';

  let activeView: 'browser' | 'detail' = 'browser';
  let selectedViabilidad: any = null;
  let results: any[] = [];
  let recomendaciones: any[] = [];
  let historico: any[] = [];
  let summary: any = null;
  let loading = false;
  let error: string | null = null;

  onMount(() => loadViabilidades());

  interface Expediente {
    id: string;
    fecha_evaluacion?: string;
    estado?: string;
    input?: { nombre?: string; receta_id?: string; porciones?: number };
    calculo?: { coste_total?: number; coste_porcion?: number };
    pvp_efectivo?: number;
    pvp_sugerido?: number;
    food_cost_pct?: number;
    margen_porcion?: number;
    veredicto?: string;
    advertencias?: string[];
  }

  async function readExpedientes(): Promise<Expediente[]> {
    try {
      const res = await mqttRequest<{ content: string }>('fs', 'read', { path: VIABILIDAD_PATH });
      const content = res.data?.content;
      if (typeof content !== 'string') return [];
      const parsed = JSON.parse(content);
      return Array.isArray(parsed.expedientes) ? parsed.expedientes : [];
    } catch (err) {
      if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') return [];
      throw err;
    }
  }

  function buildSummary(expedientes: Expediente[]) {
    const total = expedientes.length;
    const por_veredicto: Record<string, number> = {};
    let suma_food_cost = 0;
    let con_food_cost = 0;
    for (const e of expedientes) {
      const v = e.veredicto || 'desconocido';
      por_veredicto[v] = (por_veredicto[v] || 0) + 1;
      if (typeof e.food_cost_pct === 'number') {
        suma_food_cost += e.food_cost_pct;
        con_food_cost++;
      }
    }
    return {
      total,
      por_veredicto,
      food_cost_medio: con_food_cost > 0 ? suma_food_cost / con_food_cost : null
    };
  }

  async function loadViabilidades(criteria: any = {}) {
    loading = true;
    error = null;
    try {
      const expedientes = await readExpedientes();
      let filtered = expedientes;
      if (criteria.estado) filtered = filtered.filter(e => e.estado === criteria.estado);
      if (criteria.veredicto) filtered = filtered.filter(e => e.veredicto === criteria.veredicto);
      filtered = filtered.slice().sort((a, b) =>
        String(b.fecha_evaluacion || '').localeCompare(String(a.fecha_evaluacion || ''))
      );
      results = filtered;
      summary = buildSummary(expedientes);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  async function selectViabilidad(id: string) {
    selectedViabilidad = results.find(r => r.id === id);
    if (selectedViabilidad) {
      // Sin /api/viabilidad/{id} backend; el detalle vive en el expediente mismo.
      // recomendaciones e historico se quedan vacios — la UI del Detail los
      // renderizara como vacios. Si en el futuro escandallo persiste un
      // historico de coste por receta, conectarlo aqui.
      recomendaciones = [];
      historico = [];
      activeView = 'detail';
    }
  }

  function implementRecomendacion(_recId: string) {
    // Sin /api/viabilidad/recomendacion/{id}/implement backend; las
    // recomendaciones se piden al chat (el LLM las aplica con context).
    error = 'Las recomendaciones se piden al chat. El agente las aplica con contexto.';
  }

  function handleSearch(criteria: any) {
    loadViabilidades(criteria);
  }

  function handleSelectCard(id: string) {
    selectViabilidad(id);
  }

  function handleBack() {
    activeView = 'browser';
    selectedViabilidad = null;
  }
</script>

<div class="panel-container">
  {#if error}
    <div class="error-banner">
      <span>{error}</span>
      <button on:click={() => (error = null)}>×</button>
    </div>
  {/if}

  {#if activeView === 'browser'}
    <ViabilidadBrowser
      {results}
      {summary}
      {loading}
      onSearch={handleSearch}
      onSelect={handleSelectCard}
    />
  {:else if activeView === 'detail'}
    <ViabilidadDetail
      viabilidad={selectedViabilidad}
      {recomendaciones}
      {historico}
      onImplementRecondacion={implementRecomendacion}
      onBack={handleBack}
    />
  {/if}
</div>

<style>
  .panel-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: white;
    overflow: hidden;
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: #fee2e2;
    color: #991b1b;
    font-size: 12px;
    border-bottom: 1px solid #fca5a5;
    flex-shrink: 0;
  }

  .error-banner button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 18px;
    padding: 0;
    opacity: 0.7;
  }

  .error-banner button:hover {
    opacity: 1;
  }
</style>
