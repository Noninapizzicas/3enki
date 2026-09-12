<script lang="ts">
  /**
   * HistorialImpresionesPanel — la CINTA CRONOLÓGICA del historial de impresiones (F7, prisma-universal).
   *
   * REEMPLAZA el envoltorio genérico (BlueprintForm): panel ESPECÍFICO con store MQTT,
   * siguiendo el patrón de CatalogoModelosPanel (modules/catalogo-modelos, 2ª iteración
   * de la práctica F7).
   *
   * MATIZ CLAVE — el jefe aquí es LECTOR, NO escritor: a diferencia de catalogo-modelos
   * (donde el jefe registra modelos), aquí el REGISTRO llega automáticamente por el evento
   * `impresion.completada` (onImpresionCompletada, fire-and-forget) o por RPC de
   * ciclo-impresion. El jefe SOLO consulta el historial. Por eso el panel NO tiene botón
   * de alta del jefe — es una CINTA CRONOLÓGICA de impresiones pasadas. La señal pareada
   * `historial.impresion_registrada` (escritura del sistema) refresca la cinta en vivo,
   * sin recargar (R3).
   *
   * Composición (esquema-jefe rol JEFE):
   *   - CABECERA de pulso (total): "n registros en total" vía listar → total.
   *   - CINTA cronológica (listar): tarjetas/filas por impresión, más reciente primero.
   *     Cada entrada: fecha · modelo (id/nombre) · material · filamento · tiempo · resultado.
   *     Huecos mostrados como "desconocido" (invariante 5: dato ausente nombrado, nunca inventado).
   *   - Estados: cargando → vacío ("sin impresiones registradas aún — el ciclo de impresión
   *     las registrará" con icono) → con datos.
   *   - REFRESCO automático por la señal historial.impresion_registrada (sin botón de
   *     recargar: la vista re-lee, nunca recarga).
   *
   * Lenguaje visual: color=estado (resultado: completada/ok verde, fallo/cancelado rojo,
   * desconocido gris), icono=entidad (🖨️/cinta), texto=precisión. Los 3 canales refuerzan
   * el mismo mensaje.
   */

  import { onMount } from 'svelte';
  import {
    registros,
    historialLoading,
    historialError,
    totalRegistros,
    ultimoRegistrado,
    loadHistorial,
    resetHistorial,
    initHistorialSubscriptions,
    describeError,
    type RegistroHistorial
  } from './stores/historial';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  /* Suscripción a la señal pareada — R3. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initHistorialSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetHistorial();
    };
  });

  // Reaccionar al proyecto activo: cargar o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $sessionProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      void loadHistorial(pid);
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      resetHistorial();
    }
  }

  /** DD/MM/YYYY HH:MM (es-ES) de un ISO; 'desconocido' si no hay fecha válida. */
  function fechacorta(iso: string | null | undefined): string {
    if (!iso) return 'desconocido';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'desconocido';
    return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  }

  /** Rotula un hueco 'desconocido' (invariante 5) o devuelve el valor real. */
  function campoValor(v: string | null | undefined): string {
    return v && v !== 'desconocido' ? v : 'desconocido';
  }

  /** Badge de resultado: color=estado. 'completada'/'ok' → verde · fallo → rojo · resto gris. */
  function resultadoClase(resultado: string | null | undefined): string {
    const r = (resultado || '').toLowerCase();
    if (['completada', 'ok', 'completado', 'exito', 'exito'].includes(r)) return 'res-ok';
    if (['fallo', 'fallida', 'fallido', 'error', 'cancelada', 'cancelado', 'no'].includes(r)) return 'res-fallo';
    return 'res-desc';
  }
</script>

<div class="historial-panel" data-historial-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">🖨️</span>
    <span class="badge-label">Historial de impresiones</span>
    <span class="badge-scope">CUSTODIO · jefe LECTOR · el registro llega solo por impresion.completada</span>
  </div>

  {#if $historialError}
    <div class="cinta-error">⚠️ {$historialError}</div>
  {/if}

  <!-- CABECERA: pulso total (listar → total) -->
  <div class="cabecera">
    <span class="pulso">🖨️ {$totalRegistros} impresiones</span>
    <span class="pulso-hint">memoria del taller · append-only</span>
  </div>

  {#if $ultimoRegistrado}
    <div class="senal-confirmacion">
      🆕 registrada <strong>{campoValor($ultimoRegistrado.modelo_nombre)}</strong> · la cinta se refrescó sola
    </div>
  {/if}

  <!-- CINTA CRONOLÓGICA (listar, más reciente primero) -->
  {#if $historialLoading && $registros.length === 0}
    <div class="vacio">
      <div class="vacio-ico">🖨️</div>
      <div class="vacio-txt">cargando historial…</div>
    </div>
  {:else if $registros.length === 0}
    <div class="vacio">
      <div class="vacio-ico">🧭</div>
      <div class="vacio-txt">sin impresiones registradas aún — el ciclo de impresión las registrará por evento</div>
      <div class="vacio-sub">cuando una impresión se complete aparecerá aquí arriba, sin recargar</div>
    </div>
  {:else}
    <ol class="cinta">
      {#each $registros as reg (reg.id)}
        <li class="fila">
          <div class="fila-fecha">
            <span class="fecha-ico">📅</span>
            <span>{fechacorta(reg.fecha ?? reg.registrado_en)}</span>
          </div>
          <div class="fila-cuerpo">
            <div class="fila-encabezado">
              <span class="fila-nombre" title="modelo_id: {reg.modelo_id}">🧊 {campoValor(reg.modelo_nombre)}</span>
              <span class="chip-res {resultadoClase(reg.resultado)}">{campoValor(reg.resultado)}</span>
            </div>
            <div class="fila-meta">
              <span class="chip-chip">🧵 {campoValor(reg.material)}</span>
              <span class="chip-chip">🪡 {campoValor(reg.filamento_usado)}</span>
              <span class="chip-chip">⏱ {campoValor(reg.tiempo)}</span>
            </div>
          </div>
        </li>
      {/each}
    </ol>
  {/if}

  <div class="pie-hint">el historial crece solo: al completarse una impresión, la cinta se actualiza en vivo por señal, sin recargar · los datos ausentes se muestran como "desconocido"</div>
</div>

<style>
  .historial-panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.5rem;
  }
  .actor-badge {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.7rem;
    margin-bottom: 0.25rem;
    font-size: 0.7rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .badge-icon { font-size: 0.85rem; }
  .badge-label {
    font-weight: 700;
    color: var(--color-primary, #eab308);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge-scope { color: var(--color-text-muted, #888); font-size: 0.65rem; }
  .cinta-error { font-size: 0.75rem; color: #ef4444; padding: 0.3rem 0.7rem; }
  .cabecera {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.45rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .pulso {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.75rem;
    color: #60a5fa;
    background: rgba(96, 165, 250, 0.12);
  }
  .pulso-hint { font-size: 0.65rem; color: var(--color-text-muted, #888); margin-left: auto; }
  .senal-confirmacion {
    font-size: 0.72rem;
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.25);
  }
  .vacio {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 140px;
    border: 1px dashed var(--color-border, #444);
    border-radius: 8px;
    color: var(--color-text-muted, #888);
    font-size: 0.8rem;
    text-align: center;
  }
  .vacio-ico { font-size: 2rem; }
  .vacio-sub { font-size: 0.7rem; opacity: 0.8; }
  .cinta { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .fila {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 0.6rem;
    align-items: center;
    padding: 0.55rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    font-size: 0.78rem;
  }
  .fila-fecha {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--color-text-muted, #aaa);
    font-size: 0.7rem;
  }
  .fecha-ico { opacity: 0.7; }
  .fila-cuerpo { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
  .fila-encabezado { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .fila-nombre { font-weight: 600; display: inline-flex; align-items: center; gap: 0.3rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fila-meta { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .chip-chip {
    font-size: 0.66rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: rgba(163, 163, 163, 0.14);
    color: inherit;
  }
  .chip-res {
    font-size: 0.66rem;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    font-weight: 700;
  }
  .res-ok { color: #22c55e; background: rgba(34, 197, 94, 0.14); }
  .res-fallo { color: #ef4444; background: rgba(239, 68, 68, 0.14); }
  .res-desc { color: #a3a3a3; background: rgba(163, 163, 163, 0.14); }
  .pie-hint { font-size: 0.62rem; color: var(--color-text-muted, #888); padding: 0 0.2rem; }
</style>
