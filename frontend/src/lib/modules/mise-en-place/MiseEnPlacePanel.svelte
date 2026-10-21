<script lang="ts">
  /**
   * MiseEnPlacePanel — EL PANEL DEL JEFE de la planificacion previa al servicio
   * (F7, composicion 3 capas segun esquema-jefe/ de mise-en-place):
   *
   *   1. SELECCIONAR  ref-select de receta (recetas.listar) + servicio/dia
   *                   (franja) — siempre desde el list, nunca libre.
   *   2. CALCULAR     editor-escalado: receta + porciones_origen (del rinde) +
   *                   porciones_destino (volumen objetivo) -> escalado.calcular
   *                   (el caller trae los ingredientes por recetas.obtener —
   *                   INV1). Tabla de escalado: cada ingrediente × factor.
   *   3. DECLARAR     confirmador-nombrado PLAN: publica el plan que la
   *                   produccion lee (lineas receta×porciones×franja, horizonte)
   *                   -> plan.publicar. Dictamen de COMPRA: agrega los escalados
   *                   por (ingrediente, unidad) -> compra.calcular.
   *
   *   DICTAMEN / SEÑAL: el dictamen (factor, items de compra, plan_id) llega EN
   *   LA RESPUESTA RPC (201) y la senal pareada (produccion.escalado.calculado /
   *   produccion.plan.publicado / produccion.compra.calculada, VERIFICADA en
   *   index.js _publicarEvento L587-611) re-lee planes.listar con debounce 60ms.
   *   NUNCA recarga ni asume.
   *
   * R2 — la UI jamás escribe el store: solo las lecturas y los dictamenes RPC
   *      escriben. INV6 — TODO RPC lleva project_id inyectado (leccion bug
   *      escandallo).
   *
   * Molde: marca-cliente/MarcaClientePanel.svelte + escandallo/EscandalloPanel
   * (ref-select de receta + editor + dictamen) — misma familia de panel-jefe.
   */

  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    recetario,
    planes,
    cinta,
    escaladoActivo,
    compraActiva,
    recetarioLoading,
    recetarioError,
    planesLoading,
    planesError,
    gestosPendientes,
    errorMutacion,
    formatearCantidad,
    loadRecetario,
    loadPlanes,
    resetMiseEnPlace,
    calcularEscalado,
    publicarPlan,
    calcularCompra,
    initMiseEnPlaceSubscriptions,
    type RecetaResumen,
    type EscaladoDictamen,
    type CompraDictamen
  } from './stores/mise-en-place';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  // ---- ref-select RECETA (SELECCIONAR) ----
  let recetaId = '';
  let recetaSeleccionada: RecetaResumen | null = null;

  // ---- editor-escalado (CALCULAR) ----
  let porcionesOrigen = '';
  let porcionesDestino = '';
  let escaladoBorrador = false;
  let errEscalado = '';

  // ---- franja / servicio (SELECCIONAR, para el plan) ----
  const FRANJAS = ['desayuno', 'comida', 'merienda', 'cena', 'all_day'];
  let franjaPlan = 'comida';
  let horizonteDesde = '';
  let horizonteHasta = '';

  // ---- confirmador-nombrado PLAN (DECLARAR) ----
  let confirmadorPlanAbierto = false;
  let errPlan = '';

  // ---- dictamenes (CONFIRMAR) ----
  interface Dictamen {
    tipo: 'escalado' | 'plan' | 'compra';
    texto: string;
  }
  let dictamen: Dictamen | null = null;

  /* Señal-refresh (R3): init monta la suscripcion dot notation + debounce 60ms. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initMiseEnPlaceSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetMiseEnPlace();
    };
  });

  // Reaccion al proyecto activo: cargar recetario + planes o vaciar.
  let ultimoProjectId = '';
  $: {
    const pid = $sessionProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      limpiarSeleccion();
      void loadRecetario();
      void loadPlanes();
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      limpiarSeleccion();
      resetMiseEnPlace();
    }
  }

  function limpiarSeleccion(): void {
    recetaId = '';
    recetaSeleccionada = null;
    porcionesOrigen = '';
    porcionesDestino = '';
    escaladoBorrador = false;
    escaladoActivo.set(null);
    compraActiva.set(null);
    dictamen = null;
    errEscalado = '';
    errPlan = '';
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && confirmadorPlanAbierto) confirmadorPlanAbierto = false;
  }

  // ---- ref-select de receta ----
  function onCambioReceta(): void {
    recetaSeleccionada = recetario.find((r) => r.receta_id === recetaId) ?? null;
    escaladoActivo.set(null);
    dictamen = null;
    // porciones_origen se rellena del rinde de la receta (o 0 si no lo trae)
    const rinde = recetaSeleccionada?.rinde;
    porcionesOrigen = rinde && typeof rinde.cantidad === 'number' ? String(rinde.cantidad) : '';
  }

  // ---- CALCULAR: escalar la receta al volumen objetivo ----
  function escalarReceta(): void {
    if (!recetaSeleccionada) {
      errEscalado = 'elige una receta primero';
      return;
    }
    const origen = Number(porcionesOrigen);
    const destino = Number(porcionesDestino);
    if (!origen || origen <= 0) {
      errEscalado = 'porciones_origen debe ser un número > 0';
      return;
    }
    if (!destino || destino <= 0) {
      errEscalado = 'porciones_destino (volumen del día) debe ser un número > 0';
      return;
    }
    errEscalado = '';
    void calcularEscalado(recetaSeleccionada, origen, destino).then((d) => {
      if (d) {
        escaladoBorrador = true;
        dictamen = dictamenEscalado(d);
      }
    });
  }

  function dictamenEscalado(d: EscaladoDictamen): Dictamen {
    const ings = d.ingredientes_escalados ?? [];
    const total = ings.length;
    const primera = ings[0];
    return {
      tipo: 'escalado',
      texto: `escalado calculado — ${d.receta_id} ×${formatearCantidad(d.factor)} (${total} ingrediente(s))${primera ? ` · ${primera.nombre} ${formatearCantidad(primera.cantidad)}${primera.unidad}` : ''}`
    };
  }

  // ---- construir lineas del plan desde el escalado activo ----
  function lineasDelEscalado(): Array<{ receta_id: string; porciones: number; franja: string }> {
    const esc = get(escaladoActivo);
    if (!esc || !recetaId) return [];
    const p = Number(porcionesDestino) || 0;
    if (!p || p <= 0) return [];
    return [{ receta_id: esc.receta_id, porciones: p, franja: franjaPlan }];
  }

  // ---- DECLARAR: confirmador-nombrado PLAN ----
  function abrirConfirmadorPlan(): void {
    // hoy: hoy+7 como horizonte default (la UI lo deja editable)
    if (!horizonteDesde) {
      const hoy = new Date();
      horizonteDesde = isoFecha(hoy);
      const fin = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);
      horizonteHasta = isoFecha(fin);
    }
    errPlan = '';
    confirmadorPlanAbierto = true;
  }

  function isoFecha(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function publicar(): void {
    const lineas = lineasDelEscalado();
    if (!lineas.length) {
      errPlan = 'no hay escalado activo: calcula primero un escalado, o llena líneas';
      return;
    }
    if (!horizonteDesde || !horizonteHasta) {
      errPlan = 'horizonte (desde/hasta) es obligatorio';
      return;
    }
    errPlan = '';
    const resumen = `publicar plan de ${lineas.length} línea(s) para ${franjaPlan}: ${lineas.map((l) => `${l.receta_id} ×${l.porciones}`).join(', ')}. Afecta a la producción del servicio.`;
    void publicarPlan(horizonteDesde, horizonteHasta, lineas).then((p) => {
      if (p) {
        confirmadorPlanAbierto = false;
        dictamen = { tipo: 'plan', texto: `plan publicado — ${p.plan_id} (${p.total_lineas} línea(s), estado propuesto). La señal produccion.plan.publicado re-lee los planes.` };
      }
    });
  }

  // ---- DECLARAR: dictamen COMPRA ----
  function consolidarCompra(): void {
    const esc = get(escaladoActivo);
    const p = Number(porcionesDestino) || 0;
    if (!esc || !p || p <= 0) {
      errEscalado = 'calcula primero un escalado para consolidar su compra';
      return;
    }
    const recetas = [{
      receta_id: esc.receta_id,
      porciones: p,
      ingredientes: (esc.ingredientes_escalados ?? []).map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad }))
    }];
    void calcularCompra({ tipo: 'servicio', etiqueta: franjaPlan }, recetas).then((c) => {
      if (c) dictamen = dictamenCompra(c);
    });
  }

  function dictamenCompra(c: CompraDictamen): Dictamen {
    return {
      tipo: 'compra',
      texto: `lista de compra consolidada — ${c.items_total} item(s): ${(c.items ?? []).slice(0, 3).map((i) => `${i.ingrediente} ${formatearCantidad(i.cantidad_neta)}${i.unidad}`).join(', ')}${(c.items?.length ?? 0) > 3 ? '…' : ''}`
    };
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="jefe-mise" data-mise-en-place-panel={panelId}>
  <!-- ══════════ CINTA-ESTADO ══════════ -->
  <div class="cinta-estado">
    {#if $planesError}
      <span class="cinta-nombre error" title={$planesError}>⚠ planes no disponibles</span>
    {:else if $planesLoading && !$planes.length}
      <span class="cinta-nombre muted">leyendo planes…</span>
    {:else if $gestosPendientes > 0}
      <span class="sync" aria-live="polite">⏳ sincronizando…</span>
    {:else if $sessionProjectId}
      <span class="cinta-nombre muted">🥘 Planificación del servicio</span>
      <span class="cinta-num">{$cinta.recetas}</span> recetas · <span class="cinta-num">{$planes.length}</span> planes
      {#if $cinta.escaladoActivo}<span class="chip chip-jefe">escalado activo ⚖</span>{/if}
    {:else}
      <span class="cinta-nombre muted">sin proyecto activo</span>
    {/if}
  </div>

  <!-- ══════════ CAPA 1+2 · SELECCIONAR + ESCALAR ══════════ -->
  <div class="zona-escalado">
    <div class="caja-jefe">
      <div class="caja-cabecera">
        <span class="caja-titulo">Ⓐ Escalar receta al volumen del día</span>
        {#if $recetarioLoading}<span class="chip chip-sistema">cargando recetas…</span>{/if}
      </div>

      {#if $recetarioError}
        <div class="feedback error" role="alert">⚠ {$recetarioError}</div>
      {:else if $sessionProjectId}
        <div class="fila-campos">
          <label class="campo">
            <span>receta (desde el recetario)</span>
            <select bind:value={recetaId} on:change={onCambioReceta}>
              <option value="">— elige una receta —</option>
              {#each $recetario as r}
                <option value={r.receta_id}>{r.nombre}</option>
              {/each}
            </select>
          </label>
          <label class="campo">
            <span>porciones origen</span>
            <input type="number" min="1" bind:value={porcionesOrigen} placeholder="del rinde" />
          </label>
          <label class="campo">
            <span>porciones destino (volumen)</span>
            <input type="number" min="1" bind:value={porcionesDestino} placeholder="objetivo" />
          </label>
          <button
            class="btn-primario"
            disabled={$gestosPendientes > 0}
            on:click={escalarReceta}
          >{$gestosPendientes > 0 ? 'Escalando…' : '⚖ Escalar'}</button>
        </div>
        {#if !recetaSeleccionada && recetaId}
          <p class="nota">no se pudo resolver la receta elegida para traer sus ingredientes.</p>
        {/if}
        {#if recetaSeleccionada && !(recetaSeleccionada.lineas?.length)}
          <p class="nota">esta receta no expone líneas/ingredientes desde recetas.listar — no se puede escalar (INV1: el caller pasa los ingredientes).</p>
        {/if}
        {#if errEscalado}
          <div class="feedback error" role="alert">⚠ {errEscalado}</div>
        {/if}
      {:else}
        <p class="nota muted">elige un negocio activo para ver su recetario y planear la producción.</p>
      {/if}
    </div>

    <!-- ══════════ TABLA DE ESCALADO (dictamen del escalado) ══════════ -->
    {#if $escaladoActivo}
      <div class="caja-jefe">
        <div class="caja-cabecera">
          <span class="caja-titulo">Ⓑ Tabla de escalado</span>
          <span class="chip chip-jefe" title="dictamen de escalado.calcular — derivación transitoria, no toca la receta">×{formatearCantidad($escaladoActivo.factor)}</span>
        </div>
        <p class="nota">ingredientes para las <b>{formatearCantidad(porcionesDestino)}</b> porciones objetivo (factor {formatearCantidad($escaladoActivo.factor)}). No modifica la receta canónica.</p>
        <table class="tabla-calc">
          <thead>
            <tr><th>ingrediente</th><th>cantidad</th><th>unidad</th></tr>
          </thead>
          <tbody>
            {#each $escaladoActivo.ingredientes_escalados as ing}
              <tr>
                <td>{ing.nombre}</td>
                <td class="num">{formatearCantidad(ing.cantidad)}</td>
                <td>{ing.unidad}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <!-- ══════════ CAPA 3 · DECLARAR (publicar plan + compra) ══════════ -->
  <div class="zona-declarar">
    {#if $escaladoActivo}
      <div class="caja-jefe">
        <div class="caja-cabecera">
          <span class="caja-titulo">Ⓒ Publicar plan + consolidar compra</span>
          <span class="chip chip-sistema" title="franja de servicio que se planifica">🍽 {franjaPlan}</span>
        </div>
        <div class="fila-campos">
          <label class="campo">
            <span>franja de servicio</span>
            <select bind:value={franjaPlan}>
              {#each FRANJAS as f}
                <option value={f}>{f}</option>
              {/each}
            </select>
          </label>
          <label class="campo">
            <span>horizonte desde</span>
            <input type="date" bind:value={horizonteDesde} />
          </label>
          <label class="campo">
            <span>horizonte hasta</span>
            <input type="date" bind:value={horizonteHasta} />
          </label>
        </div>
        <div class="fila-botones">
          <button class="btn-primario" disabled={$gestosPendientes > 0} on:click={abrirConfirmadorPlan}>
            📋 Publicar plan
          </button>
          <button class="btn-secundario" disabled={$gestosPendientes > 0} on:click={consolidarCompra}>
            🛒 Consolidar compra
          </button>
        </div>
      </div>
    {/if}

    {#if $compraActiva}
      <div class="caja-jefe">
        <div class="caja-cabecera">
          <span class="caja-titulo">🛒 Lista de compra (dictamen)</span>
          <span class="chip chip-jefe" title="compra.calcular — consolida por (ingrediente, unidad)">{$compraActiva.items_total} items</span>
        </div>
        <table class="tabla-calc">
          <thead>
            <tr><th>ingrediente</th><th>cant. neta</th><th>unidad</th>{#if $compraActiva.items[0]?.merma_pct != null}<th>merma</th>{/if}</tr>
          </thead>
          <tbody>
            {#each $compraActiva.items as item}
              <tr>
                <td>{item.ingrediente}</td>
                <td class="num">{formatearCantidad(item.cantidad_neta)}</td>
                <td>{item.unidad}</td>
                {#if item.merma_pct != null}<td>{formatearCantidad(item.merma_pct)}%</td>{/if}
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="nota">dictamen de compra.calcular — consolida cantidades, no compra (INV5).</p>
      </div>
    {/if}

    {#if dictamen}
      <div class="dictamen valida" aria-live="polite">
        ✔ {dictamen.texto}
        <em>· señal produccion.* releyendo los planes (debounce 60ms)</em>
      </div>
    {:else if $errorMutacion}
      <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
    {/if}
  </div>

  <!-- ══════════ INFORME DE PLANES (neutro planes.listar) ══════════ -->
  <div class="zona-planes">
    <div class="caja-jefe">
      <div class="caja-cabecera">
        <span class="caja-titulo">Planes de producción del proyecto</span>
        {#if $planesLoading}<span class="chip chip-sistema">leyendo…</span>{/if}
      </div>
      {#if $planes.length}
        <table class="tabla-calc">
          <thead>
            <tr><th>plan</th><th>horizonte</th><th>líneas</th><th>estado</th></tr>
          </thead>
          <tbody>
            {#each $planes as p}
              <tr>
                <td>{p.id}</td>
                <td>{p.horizonte_desde?.slice(0, 10) ?? '—'} → {p.horizonte_hasta?.slice(0, 10) ?? '—'}</td>
                <td class="num">{p.total_lineas}</td>
                <td>{p.estado ?? 'propuesto'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="nota muted">aún no hay planes publicados para este proyecto.</p>
      {/if}
    </div>
  </div>
</div>

<!-- ══════════ CONFIRMADOR-NAMBRADO · PLAN ══════════ -->
{#if confirmadorPlanAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Confirmar publicación del plan de producción"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) confirmadorPlanAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>📋 Publicar plan de producción</h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (confirmadorPlanAbierto = false)}>✕</button>
      </header>

      <div class="editor-cuerpo">
        <p class="nota">
          Vas a <b>publicar</b> el plan que la producción lee. Se nombrarán las recetas
          y franjas afectadas. El plan nace en estado <b>propuesto</b> (maquina cerrada:
          propuesto → aprobado → en_ejecucion → cerrado).
        </p>

        <table class="tabla-calc">
          <thead>
            <tr><th>receta</th><th>porciones</th><th>franja</th><th>dia</th></tr>
          </thead>
          <tbody>
            {#each lineasDelEscalado() as l}
              <tr>
                <td>{l.receta_id}</td>
                <td class="num">{l.porciones}</td>
                <td>{l.franja}</td>
                <td>{horizonteDesde || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>

        <fieldset class="campo">
          <legend>horizonte desde</legend>
          <input type="date" bind:value={horizonteDesde} />
        </fieldset>
        <fieldset class="campo">
          <legend>horizonte hasta</legend>
          <input type="date" bind:value={horizonteHasta} />
        </fieldset>

        {#if errPlan}
          <div class="feedback error" role="alert">⚠ {errPlan}</div>
        {/if}
        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        <button class="btn-secundario" disabled={$gestosPendientes > 0} on:click={() => (confirmadorPlanAbierto = false)}>
          Cancelar
        </button>
        <button class="btn-primario" disabled={$gestosPendientes > 0} on:click={publicar}>
          {$gestosPendientes > 0 ? 'Publicando…' : 'Sí, publicar el plan'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .jefe-mise {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    font-family: var(--font-ui, system-ui, sans-serif);
    font-size: 0.78rem;
    color: var(--color-text, #e4e4e7);
  }

  .cinta-estado {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    padding: 0.4rem 0.6rem;
    border-radius: 8px;
    border: 1px solid var(--color-border, #3f3f46);
    background: var(--color-surface, rgba(255, 255, 255, 0.03));
  }
  .cinta-nombre { font-weight: 600; }
  .cinta-num { color: var(--color-accent, #22d3ee); font-weight: 700; }
  .muted { color: var(--color-text-muted, #a1a1aa); }
  .error { color: var(--color-error, #ef4444); }
  .sync { color: var(--color-success, #22c55e); font-weight: 600; }

  .chip {
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 700;
    border: 1px solid var(--color-border, #3f3f46);
  }
  .chip-jefe { color: var(--color-success, #22c55e); border-color: rgba(34, 197, 94, 0.4); }
  .chip-sistema { color: var(--color-text-muted, #a1a1aa); }

  .zona-escalado,
  .zona-declarar,
  .zona-planes {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .caja-jefe {
    border: 1px solid var(--color-border, #3f3f46);
    border-radius: 10px;
    background: var(--color-surface, rgba(255, 255, 255, 0.02));
    padding: 0.65rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .caja-cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .caja-titulo { font-weight: 700; font-size: 0.8rem; }

  .fila-campos {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .campo {
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .campo span {
    font-size: 0.64rem;
    color: var(--color-text-muted, #a1a1aa);
  }
  .campo select,
  .campo input {
    padding: 0.32rem 0.45rem;
    border-radius: 6px;
    border: 1px solid var(--color-border, #3f3f46);
    background: var(--color-surface, rgba(255, 255, 255, 0.04));
    color: var(--color-text, #e4e4e7);
    font-size: 0.74rem;
    font-family: inherit;
  }
  .fila-botones { display: flex; gap: 0.5rem; }

  .tabla-calc {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.72rem;
  }
  .tabla-calc th,
  .tabla-calc td {
    text-align: left;
    padding: 0.3rem 0.45rem;
    border-bottom: 1px solid var(--color-border, #2f2f35);
  }
  .tabla-calc th {
    color: var(--color-text-muted, #a1a1aa);
    font-weight: 600;
  }
  .tabla-calc td.num { text-align: right; }

  .btn-primario,
  .btn-secundario {
    padding: 0.34rem 0.7rem;
    border-radius: 6px;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--color-border, #3f3f46);
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    color: var(--color-text, #e4e4e7);
  }
  .btn-primario {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.4);
    color: var(--color-success, #22c55e);
  }
  .btn-primario:disabled,
  .btn-secundario:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .nota {
    margin: 0;
    font-size: 0.68rem;
    color: var(--color-text-muted, #a1a1aa);
    background: var(--color-surface, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--color-border, #3f3f46);
    border-radius: 8px;
    padding: 0.4rem 0.5rem;
  }

  .dictamen {
    padding: 0.55rem 0.65rem;
    border-radius: 8px;
    font-size: 0.76rem;
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
    font-size: 0.64rem;
  }
  .feedback.error {
    color: var(--color-error, #ef4444);
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.08);
    padding: 0.45rem 0.55rem;
    border-radius: 8px;
    font-size: 0.72rem;
  }

  /* confirmador overlay */
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
    width: min(560px, 92vw);
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    background: var(--color-bg, #18181b);
    border: 1px solid var(--color-border, #3f3f46);
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  }
  .editor-cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.7rem 0.9rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .editor-cabecera h3 { margin: 0; font-size: 0.85rem; }
  .btn-cerrar {
    background: none;
    border: none;
    color: var(--color-text-muted, #888);
    font-size: 0.9rem;
    cursor: pointer;
  }
  .editor-cuerpo {
    padding: 0.8rem 0.9rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .editor-pie {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.7rem 0.9rem;
    border-top: 1px solid var(--color-border, #333);
  }
</style>
