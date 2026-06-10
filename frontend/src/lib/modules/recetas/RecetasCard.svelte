<script lang="ts">
  /**
   * RecetasCard — card resumen de una receta para el grid del Browser.
   * Solo lectura: click delega en onClick(receta.id). Estilos heredados
   * del monolito legacy (colores via rgb/rgba para respetar la paleta
   * canonica del frontend.contract: cero hex 6-digit fuera de paleta).
   */

  import type { RecetaResumen, EstadoOperativo, TipoReceta } from '$lib/stores/recetas';

  export let receta: RecetaResumen;
  export let onClick: (id: string) => void;

  function estadoLabel(e: EstadoOperativo): string {
    if (e === 'en_servicio') return 'en servicio';
    return e;
  }

  // Triplete RGB (no hex) para componer background rgba + color rgb sin
  // recurrir al truco hex+alpha "{color}20" que exigiria hex literal.
  function estadoRgb(e: EstadoOperativo): string {
    if (e === 'en_servicio') return '34, 197, 94';
    if (e === 'borrador') return '245, 158, 11';
    if (e === 'archivada') return '113, 113, 122';
    return '161, 161, 170';
  }

  function tipoRgb(t: TipoReceta): string {
    if (t === 'pizza') return '239, 68, 68';
    if (t === 'masa') return '245, 158, 11';
    if (t === 'salsa') return '168, 85, 247';
    if (t === 'base') return '59, 130, 246';
    return '161, 161, 170';
  }

  function rindeLabel(r: RecetaResumen): string {
    if (!r.rinde) return '';
    return `rinde ${r.rinde.cantidad} ${r.rinde.unidad}`;
  }
</script>

<button
  class="receta-card"
  class:incompleta={receta.incompleta}
  on:click={() => onClick(receta.id)}
>
  <div class="card-header">
    <span class="card-name">{receta.nombre}</span>
    <span class="card-version">v{receta.version}</span>
  </div>
  <div class="card-badges">
    <span class="badge" style="background-color: rgba({estadoRgb(receta.estado_operativo)}, 0.13); color: rgb({estadoRgb(receta.estado_operativo)})">
      {estadoLabel(receta.estado_operativo)}
    </span>
    <span class="badge" style="background-color: rgba({tipoRgb(receta.tipo)}, 0.13); color: rgb({tipoRgb(receta.tipo)})">
      {receta.tipo}
    </span>
    {#if receta.incompleta}
      <span class="badge warn">incompleta</span>
    {/if}
  </div>
  <div class="card-meta">
    <span>{receta.lineas_count} ingrediente{receta.lineas_count !== 1 ? 's' : ''}</span>
    {#if receta.rinde}<span>{rindeLabel(receta)}</span>{/if}
    {#if typeof receta.coste_unidad === 'number'}
      <span class="card-coste">
        {receta.coste_unidad.toFixed(2)}€/{receta.rinde?.unidad ?? 'ud'}{#if receta.coste_incompleto}<span class="coste-asterisco" title="Coste parcial — hay líneas sin precio">*</span>{/if}
      </span>
    {/if}
  </div>
  {#if receta.incompleta && receta.campos_pendientes.length > 0}
    <div class="card-pendientes">
      Pendiente: {receta.campos_pendientes.slice(0, 3).join(', ')}
      {#if receta.campos_pendientes.length > 3}…{/if}
    </div>
  {/if}
</button>

<style>
  .receta-card {
    display: block;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    color: inherit;
  }
  .receta-card:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--accent-color, rgba(96, 165, 250, 1));
  }
  .receta-card.incompleta { border-left: 3px solid rgba(245, 158, 11, 1); }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .card-name { font-weight: 600; }
  .card-version {
    font-size: 10px;
    color: var(--text-secondary, rgba(113, 113, 122, 1));
    font-family: monospace;
  }

  .card-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }
  .badge.warn { background: rgba(245, 158, 11, 0.15); color: rgba(245, 158, 11, 1); }

  .card-meta {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    align-items: center;
  }
  .card-coste {
    margin-left: auto;
    font-family: monospace;
    font-weight: 600;
    color: var(--accent-color, rgba(96, 165, 250, 1));
  }
  .coste-asterisco {
    color: rgba(245, 158, 11, 1);
    margin-left: 1px;
  }
  .card-pendientes {
    margin-top: 6px;
    font-size: 11px;
    color: rgba(245, 158, 11, 1);
    font-style: italic;
  }
</style>
