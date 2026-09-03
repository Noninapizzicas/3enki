<script lang="ts">
  /**
   * EntregaPanel — EL PANEL DEL JEFE de la política de entrega (F7, composición
   * 3 capas según esquema-jefe/ de entrega):
   *
   *   1. INFORMARSE   entrega.reglas.leer: la política vigente con su FUENTE
   *                   ordenando la vista por ese origen (chip jefe = 'persistida'
   *                   · chip sistema = 'default'). SIN 404 (INV2): fuente==='default'
   *                   es el estado nombrado «sin política — usa los defaults», no
   *                   un error que reparar.
   *   2. DECLARAR     editor-bloque REPARTO (toggle activo + radio_km / coste /
   *                   minutos_por_km, vacío = null «por declarar») y editor-bloque
   *                   ESTIMACIÓN (2 cifras) → reglas.actualizar enviando SOLO su
   *                   bloque (INV3: merge profundo preserva el otro).
   *   3. DICTAMEN     doble confirmación (R2+R3): el dictamen llega EN LA
   *                   RESPUESTA de la mutación (200 { reglas: nuevas } — INV5)
   *                   entrega.reglas.actualizadas (VERIFICADA:
   *                   ConfigCustodio L119 → eventBus del core → MQTT
   *                   core/STAR/events/…, misma familia que masa.reglas.actualizadas)
   *                   re-lee el informe con debounce 60ms. NUNCA recarga ni asume.
   *
   * R2 — la UI jamás escribe el store: los borradores se rellenan desde la
   *      LECTURA vigente; solo las respuestas RPC escriben.
   * Moneda — reparto.coste en EUR sin céntimos (convención del dominio): NO hay
   *      eurosACentimos aquí — el contrato valida número >= 0 (INV6).
   *
   * Molde: modules/variaciones/VariacionesPanel.svelte (informe + editor-bloque + chips).
   */

  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    reglasStore,
    cinta,
    lecturaLoading,
    lecturaError,
    mutacionesPendientes,
    errorMutacion,
    formatearCifra,
    parsearCifra,
    loadReglas,
    resetEntrega,
    declararReparto,
    declararEstimacion,
    initEntregaSubscriptions,
    type ReglasReparto,
    type ReglasEstimacion,
    type DictamenDeclaracion
  } from './stores/entrega';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  // ---- editores-bloque abiertos (1 modal por bloque) ----
  let editorRepartoAbierto = false;
  let editorEstimacionAbierto = false;

  // ---- borradores (texto: '' = 'por declarar' = null del contrato, INV4) ----
  let activoBorrador = false;
  let radioKmBorrador = '';
  let costeBorrador = '';
  let minPorKmBorrador = '';
  let minBaseBorrador = '';
  let minItemBorrador = '';

  // errores de VALIDACIÓN por editor (los de red los nombra errorMutacion)
  let errReparto = '';
  let errEstimacion = '';

  /** DICTAMEN por editor, construido desde la RESPUESTA de la mutación (INV5). */
  interface DictamenEditor {
    bloque: 'reparto' | 'estimacion';
    texto: string;
  }
  let dictamen: DictamenEditor | null = null;

  /* Señal-refresh (R3): init monta la suscripción entrega.reglas.actualizadas
   * con debounce 60ms; devuelve su cleanup. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initEntregaSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetEntrega();
    };
  });

  // Reacción al proyecto activo: cargar política o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $sessionProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      cerrarEditores();
      void loadReglas();
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      cerrarEditores();
      resetEntrega();
    }
  }

  function cerrarEditores(): void {
    editorRepartoAbierto = false;
    editorEstimacionAbierto = false;
    dictamen = null;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (editorRepartoAbierto) editorRepartoAbierto = false;
      else if (editorEstimacionAbierto) editorEstimacionAbierto = false;
    }
  }

  /** cifra vigente → input ('' si es null = por declarar). */
  function aInput(v: number | null | undefined): string {
    return v == null ? '' : String(v);
  }

  // ---- editor REPARTO (borrador desde lo VIGENTE — R2) ----
  function abrirEditorReparto(): void {
    const rep: ReglasReparto = get(reglasStore)?.reglas?.reparto ?? {};
    activoBorrador = rep.activo === true;
    radioKmBorrador = aInput(rep.radio_km);
    costeBorrador = aInput(rep.coste);
    minPorKmBorrador = aInput(rep.minutos_por_km);
    errReparto = '';
    dictamen = null;
    editorRepartoAbierto = true;
  }

  function guardarReparto(): void {
    const radio = parsearCifra(radioKmBorrador);
    const coste = parsearCifra(costeBorrador);
    const minutos = parsearCifra(minPorKmBorrador);
    const err = radio.error ?? coste.error ?? minutos.error;
    if (err) {
      errReparto = err;
      return;
    }
    // SOLO el bloque reparto (INV3) — el store lo manda como { reparto: {...} }.
    void declararReparto({
      activo: activoBorrador,
      radio_km: radio.valor ?? null,
      coste: coste.valor ?? null,
      minutos_por_km: minutos.valor ?? null
    })
      .then((d) => {
        editorRepartoAbierto = false; // el refresco completo lo da la señal (R3)
        dictamen = dictamenDe(d); // dictamen de la RESPUESTA (INV5)
        errReparto = '';
      })
      .catch(() => {
        /* error ya nombrado en errorMutacion → el editor permanece abierto */
      });
  }

  // ---- editor ESTIMACIÓN (2 cifras, set-once) ----
  function abrirEditorEstimacion(): void {
    const est: ReglasEstimacion = get(reglasStore)?.reglas?.estimacion ?? {};
    minBaseBorrador = aInput(est.minutos_preparacion_base);
    minItemBorrador = aInput(est.minutos_por_item);
    errEstimacion = '';
    dictamen = null;
    editorEstimacionAbierto = true;
  }

  function guardarEstimacion(): void {
    const base = parsearCifra(minBaseBorrador);
    const porItem = parsearCifra(minItemBorrador);
    const err = base.error ?? porItem.error;
    if (err) {
      errEstimacion = err;
      return;
    }
    void declararEstimacion({
      minutos_preparacion_base: base.valor ?? null,
      minutos_por_item: porItem.valor ?? null
    })
      .then((d) => {
        editorEstimacionAbierto = false;
        dictamen = dictamenDe(d);
        errEstimacion = '';
      })
      .catch(() => {
        /* error ya nombrado en errorMutacion → el editor permanece abierto */
      });
  }

  /** Dictamen legible desde la respuesta de reglas.actualizar (nunca del local). */
  function dictamenDe(d: DictamenDeclaracion): DictamenEditor {
    const vacio = !d.reglas || Object.keys(d.reglas).length === 0;
    if (vacio) {
      return { bloque: d.bloque, texto: `${d.bloque}: política persistida — el informe se re-lee con la señal entrega.reglas.actualizadas` };
    }
    if (d.bloque === 'reparto') {
      const r = d.reglas.reparto ?? {};
      return {
        bloque: d.bloque,
        texto: `reparto persistido — ${r.activo === true ? 'activo' : 'inactivo'} · radio ${formatearCifra(r.radio_km, 'km')} · coste ${formatearCifra(r.coste, '€')} · ${formatearCifra(r.minutos_por_km, 'min/km')}`
      };
    }
    const e = d.reglas.estimacion ?? {};
    return {
      bloque: d.bloque,
      texto: `estimación persistida — preparación ${formatearCifra(e.minutos_preparacion_base, 'min')} · por item ${formatearCifra(e.minutos_por_item, 'min/item')}`
    };
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="jefe-entrega" data-entrega-panel={panelId}>
  <!-- ══════════ CINTA-ESTADO ══════════ -->
  <div class="cinta-estado">
    {#if $lecturaError}
      <span class="cinta-nombre error" title={$lecturaError}>⚠ política no disponible</span>
    {:else if $lecturaLoading && !$reglasStore}
      <span class="cinta-nombre muted">leyendo política…</span>
    {:else if $mutacionesPendientes > 0}
      <span class="sync" aria-live="polite">⏳ sincronizando…</span>
    {:else if $reglasStore}
      <span class="cinta-nombre muted">🛵 política de entrega</span>
      <span class="cinta-num">{$cinta.porDeclarar}</span> cifras por declarar
    {:else}
      <span class="cinta-nombre muted">sin proyecto activo</span>
    {/if}
  </div>

  <!-- ══════════ CAPA 1+3 · INFORMARSE (reglas.leer, ordenado por FUENTE) ══════════ -->
  <div class="zona-informe">
    {#if $lecturaError}
      <div class="estado error" role="alert">⚠ No se pudo leer la política: {$lecturaError}</div>
    {:else if $reglasStore}
      <div class="informe">
        <div class="informe-cabecera">
          {#if $cinta.sinPolitica}
            <span class="chip chip-sistema" title="reglas.leer respondió con fuente='default'">sin política ⚙</span>
          {:else}
            <span class="chip chip-jefe" title="reglas.leer respondió con fuente='persistida'">jefe ✍</span>
          {/if}
          <span class="informe-sub">{$cinta.porDeclarar} por declarar</span>
          <button class="btn-secundario" on:click={abrirEditorEstimacion}>⏱ tiempos</button>
          <button class="btn-primario" on:click={abrirEditorReparto}>🛵 reparto</button>
        </div>

        {#if $cinta.sinPolitica}
          <p class="aviso-default">
            <b>sin política — usa los defaults</b>: reparto inactivo, cifras «por declarar».
            No hay error que reparar (no existe el 404): es una declaración pendiente.
          </p>
        {:else if !$cinta.repartoActivo}
          <p class="aviso-default">
            El reparto está <b>inactivo</b> — sin la palanca maestra no hay delivery propio.
          </p>
        {/if}

        <div class="palancas-informe">
          <div class="palanca">
            <div class="palanca-titulo">🛵 Reparto — la palanca maestra</div>
            <div class="lista-chips">
              <span class="ing-chip {$cinta.repartoActivo ? 'ing-chip-si' : 'ing-chip-no'}">
                {$cinta.repartoActivo ? 'activo' : 'inactivo'}
              </span>
              <span class="ing-chip">radio: {formatearCifra($reglasStore.reglas?.reparto?.radio_km ?? null, 'km')}</span>
              <span class="ing-chip">coste: {formatearCifra($reglasStore.reglas?.reparto?.coste ?? null, '€')}</span>
              <span class="ing-chip">tiempo: {formatearCifra($reglasStore.reglas?.reparto?.minutos_por_km ?? null, 'min/km')}</span>
            </div>
          </div>

          <div class="palanca">
            <div class="palanca-titulo">⏱ Estimación de tiempo (set-once)</div>
            <div class="lista-chips">
              <span class="ing-chip">preparación: {formatearCifra($reglasStore.reglas?.estimacion?.minutos_preparacion_base ?? null, 'min')}</span>
              <span class="ing-chip">por item: {formatearCifra($reglasStore.reglas?.estimacion?.minutos_por_item ?? null, 'min/item')}</span>
            </div>
          </div>
        </div>

        {#if dictamen}
          <div class="dictamen valida" aria-live="polite">
            ✔ {dictamen.texto}
            <em>· señal entrega.reglas.actualizadas releyendo el informe (debounce 60ms)</em>
          </div>
        {:else if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>
    {:else}
      <div class="estado muted">
        {#if $lecturaLoading}leyendo política…{:else}elige un negocio activo para leer su política de entrega.{/if}
      </div>
    {/if}
  </div>
</div>

<!-- ══════════ EDITOR-BLOQUE · REPARTO (toggle + 3 cifras, vacío = null) ══════════ -->
{#if editorRepartoAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Declarar política de reparto"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) editorRepartoAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          🛵 Política de reparto
          {#if $cinta.sinPolitica}
            <span class="chip chip-sistema">declara por 1ª vez</span>
          {:else}
            <span class="chip chip-jefe">edita lo declarado</span>
          {/if}
        </h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (editorRepartoAbierto = false)}>✕</button>
      </header>

      <div class="editor-cuerpo">
        <!-- (a) palanca maestra -->
        <label class="campo fila">
          <span>① reparto con medios propios (delivery)</span>
          <input type="checkbox" bind:checked={activoBorrador} />
        </label>

        <!-- (b) radio en km -->
        <fieldset class="campo">
          <legend>② radio de reparto (km)</legend>
          <input type="text" inputmode="decimal" placeholder="vacío = por declarar (ej. 5)" bind:value={radioKmBorrador} />
        </fieldset>

        <!-- (c) coste por reparto en € -->
        <fieldset class="campo">
          <legend>③ coste por reparto (€)</legend>
          <input type="text" inputmode="decimal" placeholder="vacío = por declarar (ej. 2,5)" bind:value={costeBorrador} />
        </fieldset>

        <!-- (d) minutos por km -->
        <fieldset class="campo">
          <legend>④ minutos por km</legend>
          <input type="text" inputmode="decimal" placeholder="vacío = por declarar (ej. 3)" bind:value={minPorKmBorrador} />
        </fieldset>

        <p class="nota-euro">
          💰 coste en € sin conversión a céntimos (INV6) · vacío = «por declarar» (el contrato
          admite valores null). Se envía SOLO el bloque <b>reparto</b> — el merge profundo
          preserva estimación (INV3). El dictamen llega en la respuesta; la señal re-lee el informe.
        </p>

        {#if errReparto}
          <div class="feedback error" role="alert">⚠ {errReparto}</div>
        {/if}
        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        <button class="btn-secundario" disabled={$mutacionesPendientes > 0} on:click={() => (editorRepartoAbierto = false)}>
          Cancelar
        </button>
        <button class="btn-primario" disabled={$mutacionesPendientes > 0} on:click={guardarReparto}>
          {$mutacionesPendientes > 0 ? 'Guardando…' : 'Declarar reparto'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<!-- ══════════ EDITOR-BLOQUE · ESTIMACIÓN (2 cifras) ══════════ -->
{#if editorEstimacionAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Declarar estimación de tiempo"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) editorEstimacionAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          ⏱ Estimación de tiempo
          {#if $cinta.sinPolitica}
            <span class="chip chip-sistema">declara por 1ª vez</span>
          {:else}
            <span class="chip chip-jefe">edita lo declarado</span>
          {/if}
        </h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (editorEstimacionAbierto = false)}>✕</button>
      </header>

      <div class="editor-cuerpo">
        <fieldset class="campo">
          <legend>① preparación base (min)</legend>
          <input type="text" inputmode="decimal" placeholder="vacío = por declarar (ej. 10)" bind:value={minBaseBorrador} />
        </fieldset>

        <fieldset class="campo">
          <legend>② minutos por item</legend>
          <input type="text" inputmode="decimal" placeholder="vacío = por declarar (ej. 2)" bind:value={minItemBorrador} />
        </fieldset>

        <p class="nota-euro">
          ⏱ cifras set-once: con ellas <b>tiempo.estimar</b> calcula (preparación + reparto);
          sin ellas responde «pendiente» (no rompe). Vacío = «por declarar». Se envía SOLO el
          bloque <b>estimacion</b> (INV3) — dictamen por respuesta + señal (R3).
        </p>

        {#if errEstimacion}
          <div class="feedback error" role="alert">⚠ {errEstimacion}</div>
        {/if}
        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        <button class="btn-secundario" disabled={$mutacionesPendientes > 0} on:click={() => (editorEstimacionAbierto = false)}>
          Cancelar
        </button>
        <button class="btn-primario" disabled={$mutacionesPendientes > 0} on:click={guardarEstimacion}>
          {$mutacionesPendientes > 0 ? 'Guardando…' : 'Declarar tiempos'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .jefe-entrega {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0.5rem;
    overflow: hidden;
    font-size: 13px;
    color: var(--color-text, #e4e4e7);
  }

  /* cinta-estado */
  .cinta-estado {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 0.7rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    font-size: 0.76rem;
    color: var(--color-text-muted, #888);
  }
  .cinta-num {
    color: var(--color-text, #e4e4e7);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .cinta-nombre.muted {
    color: var(--color-text-muted, #888);
  }
  .cinta-nombre.error {
    color: var(--color-error, #ef4444);
  }
  .sync {
    color: var(--color-warning, #f59e0b);
    font-size: 0.7rem;
  }

  /* informe */
  .zona-informe {
    flex: 1;
    overflow-y: auto;
  }
  .estado {
    padding: 1.4rem 1rem;
    text-align: center;
    font-size: 0.8rem;
    border: 1px dashed var(--color-border, #333);
    border-radius: 8px;
  }
  .estado.muted {
    color: var(--color-text-muted, #888);
  }
  .estado.error {
    color: var(--color-error, #ef4444);
    border-color: var(--color-error, #ef4444);
  }
  .informe {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    background: var(--color-surface, rgba(255, 255, 255, 0.03));
  }
  .informe-cabecera {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .informe-sub {
    flex: 1;
    font-size: 0.72rem;
    color: var(--color-text-muted, #888);
  }

  /* chips de fuente (transparencia de origen) */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .chip-jefe {
    background: rgba(34, 197, 94, 0.15);
    color: var(--color-success, #22c55e);
    border: 1px solid rgba(34, 197, 94, 0.4);
  }
  .chip-sistema {
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    color: var(--color-text-muted, #a1a1aa);
    border: 1px solid var(--color-border, #3f3f46);
  }

  .aviso-default {
    margin: 0;
    font-size: 0.74rem;
    color: var(--color-warning, #f59e0b);
    background: rgba(245, 158, 11, 0.07);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: 8px;
    padding: 0.5rem 0.6rem;
  }

  .palancas-informe {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .palanca-titulo {
    font-size: 0.72rem;
    color: var(--color-text-muted, #888);
    margin-bottom: 0.25rem;
  }
  .lista-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .ing-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.72rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, #3f3f46);
    color: var(--color-text, #e4e4e7);
  }
  .ing-chip-si {
    color: var(--color-success, #22c55e);
    border-color: rgba(34, 197, 94, 0.4);
  }
  .ing-chip-no {
    color: var(--color-error, #ef4444);
    border-color: rgba(239, 68, 68, 0.4);
  }

  .dictamen {
    padding: 0.6rem 0.7rem;
    border-radius: 8px;
    font-size: 0.78rem;
    border: 1px solid;
  }
  .dictamen.valida {
    color: var(--color-success, #22c55e);
    border-color: rgba(34, 197, 94, 0.4);
    background: rgba(34, 197, 94, 0.08);
  }
  .dictamen em {
    font-style: normal;
    color: var(--color-text-muted, #a1a1aa);
    font-size: 0.66rem;
  }

  .feedback.error {
    font-size: 0.74rem;
    color: var(--color-error, #ef4444);
  }

  /* editor-bloque (molde VariacionesPanel) */
  .editor-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
  }
  .editor-bloque {
    display: flex;
    flex-direction: column;
    width: min(30rem, 92vw);
    max-height: 85vh;
    background: var(--color-panel-bg, #1a1a1e);
    border: 1px solid var(--color-border, #333);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  }
  .editor-cabecera {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.7rem 0.9rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .editor-cabecera h3 {
    margin: 0;
    font-size: 0.9rem;
    color: var(--color-text, #e4e4e7);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .btn-cerrar {
    background: none;
    border: none;
    color: var(--color-text-muted, #888);
    font-size: 0.95rem;
    cursor: pointer;
    padding: 0.2rem 0.4rem;
    border-radius: 5px;
  }
  .btn-cerrar:hover {
    color: var(--color-text, #e4e4e7);
    background: var(--color-surface-hover, rgba(255, 255, 255, 0.06));
  }
  .editor-cuerpo {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.9rem;
    overflow-y: auto;
  }
  .campo {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.74rem;
    color: var(--color-text-muted, #888);
    border: 1px dashed var(--color-border, #3f3f46);
    border-radius: 8px;
    padding: 0.5rem 0.6rem;
    margin: 0;
  }
  .campo.fila {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .campo legend {
    padding: 0 0.3rem;
    font-weight: 700;
    color: var(--color-text-muted, #a1a1aa);
  }
  .campo input[type='text'] {
    width: 100%;
    background: var(--color-input-bg, rgba(0, 0, 0, 0.3));
    color: var(--color-text, #e4e4e7);
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    font-size: 0.82rem;
    font-family: inherit;
  }
  .campo input:focus {
    outline: none;
    border-color: var(--color-primary, #eab308);
  }
  .nota-euro {
    margin: 0;
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }
  .editor-pie {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.7rem 0.9rem;
    border-top: 1px solid var(--color-border, #333);
  }
  .btn-secundario,
  .btn-primario {
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-size: 0.78rem;
    cursor: pointer;
    border: 1px solid var(--color-border, #333);
  }
  .btn-secundario {
    background: none;
    color: var(--color-text-muted, #888);
  }
  .btn-secundario:hover {
    color: var(--color-text, #e4e4e7);
  }
  .btn-primario {
    background: var(--color-primary, #eab308);
    color: #18181b;
    border-color: var(--color-primary, #eab308);
    font-weight: 600;
  }
  .btn-primario:hover:not(:disabled) {
    background: var(--color-primary-hover, #ca8a04);
  }
  .btn-primario:disabled {
    opacity: 0.6;
    cursor: wait;
  }
</style>