<script lang="ts">
  /**
   * VariacionesPanel — EL PANEL DEL JEFE de las reglas de variación (F7,
   * composición 3 capas según pasada-4-consolidacion-formas-ui.md):
   *
   *   1. SELECCIONAR   ref-select a productos.carta_completa (nombre → id).
   *   2. INFORMARSE    variaciones.get: las 4 palancas vigentes con transparencia
   *                    de ORIGEN (H3): chip verde-jefe si la carta trae
   *                    producto.variaciones (declarado) · gris-sistema si no
   *                    (derivado: sin = base, añadir = paleta de su categoría).
   *   3. DECLARAR      editor-bloque (1 modal, 4 palancas) → variaciones.configurar
   *                    → custodio carta.update_product → carta.editada → re-lectura.
   *
   * R4 — el dictamen del simulador lo pone el MOTOR (variaciones.evaluar); la UI
   *      jamás calcula precio. R6 — euros en la UI: precio base mostrado como
   *      centimos/100; el precio_extra que escribe el jefe va en euros.
   *      Lote [ABIERTO H1]: botón deshabilitado, sin implementar.
   */

  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    productosCartaStore,
    reglasStore,
    reglasDeclaradas,
    productoElegidoStore,
    catalogoLoading,
    catalogoError,
    informeLoading,
    informeError,
    dictamenStore,
    dictamenLoading,
    mutacionesPendientes,
    errorMutacion,
    formatearCentimos,
    formatearEuros,
    eurosACentimos,
    loadProductos,
    loadReglas,
    evaluar,
    configurar,
    resetVariaciones,
    initVariacionesSubscriptions,
    type IngredienteBase,
    type ProductoCarta,
    type ValorOpcion
  } from './stores/variaciones';
  import { activeProjectId } from '$lib/stores/projects';

  export let panelId: string = '';

  // ---- selección (capa 1) ----
  let productoSeleccionado = '';

  // ---- formas abiertas ----
  let editorAbierto = false;
  let simuladorAbierto = false;

  // ---- simulador: selección de prueba (un valor por modo) ----
  let quitarPrueba: string[] = [];
  let anadirPrueba: string[] = [];

  /* Señal-refresh (R3): carta.editada + catalogo.actualizado con debounce. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initVariacionesSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetVariaciones();
    };
  });

  // Reacción al proyecto activo: cargar catálogo o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $activeProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      productoSeleccionado = '';
      void loadProductos(pid);
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      productoSeleccionado = '';
      resetVariaciones();
    }
  }

  /* Capa 2: elegir producto → get (el store escribe las stores; la vista lee). */
  function elegirProducto(): void {
    editorAbierto = false;
    simuladorAbierto = false;
    quitarPrueba = [];
    anadirPrueba = [];
    void loadReglas(productoSeleccionado);
  }

  // ---- simulador (opcional, neutro: el dictamen lo pone el motor, R4) ----
  function abrirSimulador(): void {
    quitarPrueba = [];
    anadirPrueba = [];
    simuladorAbierto = true;
  }

  function ejecutarSimulacion(): void {
    const pid = get(productoElegidoStore)?.id;
    if (!pid) return;
    const selecciones: Record<string, string[]> = {};
    if (quitarPrueba.length) selecciones['sin'] = quitarPrueba; // opción QUITAR derivada
    if (anadirPrueba.length) selecciones['anadir'] = anadirPrueba; // opción ELEGIR_VARIOS
    void evaluar(pid, selecciones);
  }

  // ---- editor-bloque (capa 3): borrador de captura + un submit → configurar ----
  let quitarBorrador: string[] = [];
  let anadirBorrador = true; // default del motor: sí se puede añadir
  let maxExtrasBorrador = 5;
  /** precio_extra EUROS por ingrediente de la paleta; '' = precio estándar del catálogo. */
  let preciosExtrasBorrador: Record<string, string> = {};

  /** Paleta de AÑADIR para editor y simulador: opciones[] del get cuando existen;
   *  si el producto aún no tiene reglas (derivación local, H3 gris), el informe usa
   *  atributos del producto (categorias/Statement) sin asumir reglas declaradas. */
  $: opcionQuitarUI = $reglasStore?.opciones?.find((o) => o.modo === 'QUITAR') ?? null;
  $: opcionAnadeUI = $reglasStore?.opciones?.find((o) => o.modo === 'ELEGIR_VARIOS') ?? null;
  $: labelsDeclaradas = ($reglasStore?.permite_quitar ?? []).map((id) => etiquetaIngrediente(id));

  function etiquetaIngrediente(id: string): string {
    const p = get(productoElegidoStore);
    const ing = (p?.ingredientes_base ?? []).find((i) => i.id === id);
    return ing ? `${ing.emoji ?? ''} ${ing.nombre ?? id}`.trim() : id;
  }

  /** Paleta candidata del editor (opcion 'anadir' del get) + fallback base propia
   *  menos propios — misma unión-por-categoría que hace _paletasPorCategoria. */
  $: paletaExtras = unionPaletaCategoria($productoElegidoStore, $productosCartaStore);
  function unionPaletaCategoria(
    elegido: ProductoCarta | null,
    catalogo: ProductoCarta[]
  ): ValorOpcion[] {
    if (!elegido) return [];
    // 1) si el get trae la opción ELEGIR_VARIOS, esa es la paleta viva del motor.
    const opcion = get(reglasStore)?.opciones?.find((o) => o.modo === 'ELEGIR_VARIOS');
    if (opcion) return opcion.valores;
    // 2) fallback Local (solo captura): unión de bases de la categoría − propias.
    const cat = (elegido.categoria_id as string) || (elegido.categoria as string) || '';
    const propios = new Set((elegido.ingredientes_base ?? []).map((i) => i.id));
    const union = new Map<string, ValorOpcion>();
    for (const p of catalogo) {
      const pc = (p.categoria_id as string) || (p.categoria as string) || '';
      if (pc !== cat) continue;
      for (const ing of p.ingredientes_base ?? []) {
        if (ing?.id && !union.has(ing.id)) {
          union.set(ing.id, {
            id: ing.id,
            etiqueta: ing.nombre ?? ing.id,
            emoji: ing.emoji,
            delta_precio_centimos: eurosACentimos(Number(ing.precio_extra ?? 0))
          });
        }
      }
    }
    return [...union.values()].filter((v) => !propios.has(v.id));
  }

  function abrirEditor(): void {
    const reglas = get(reglasStore);
    const producto = get(productoElegidoStore);
    // Borrador desde lo VIGENTE (get). Sin reglas aún: defaults del motor
    // (quitables = todos los base, añadir sí, max 5 — ver _configurar).
    quitarBorrador = reglas?.permite_quitar ? [...reglas.permite_quitar] : (producto?.ingredientes_base ?? []).map((i: IngredienteBase) => i.id);
    anadirBorrador = reglas ? reglas.permite_anadir : true;
    maxExtrasBorrador = reglas?.max_ingredientes_extra ?? 5;
    preciosExtrasBorrador = {};
    // Pre-cargar precios DECLARADOS en euros (R6): cada extra con precio propio.
    if (reglas?.extras_sugeridos?.length) {
      const conPrecio = reglas.extras_sugeridos.filter(
        (e) => typeof e.precio_extra === 'number'
      );
      for (const e of conPrecio) {
        preciosExtrasBorrador[e.ingrediente_id] = String(Math.round(e.precio_extra! * 100) / 100);
      }
    }
    editorAbierto = true;
  }

  function guardarPalancas(): void {
    const pid = get(activeProjectId);
    const producto = get(productoElegidoStore);
    if (!pid || !producto) return;
    // R6: precio_extra en EUROS (número); vacío → no se manda (precio estándar catálogo).
    const extrasSugeridos = Object.entries(preciosExtrasBorrador)
      .filter(([, texto]) => texto !== '' && texto != null)
      .map(([ingId, texto]) => ({ ingrediente_id: ingId, precio_extra: Number(String(texto).replace(',', '.')) }))
      .filter((e) => Number.isFinite(e.precio_extra));

    void configurar(pid, producto.id, {
      permite_quitar: [...quitarBorrador],
      permite_anadir: anadirBorrador,
      max_ingredientes_extra: Math.max(0, Math.floor(Number(maxExtrasBorrador) || 0)),
      extras_sugeridos: extrasSugeridos
    })
      .then(() => {
        editorAbierto = false; // el feedback lo da la señal refrescando el informe
      })
      .catch(() => {
        /* error ya nombrado en errorMutacion → el editor permanece abierto */
      });
  }

  /* Chips de origen (H3) — presentes en informe y editor. */
  function chipOrigen(declarado: boolean): { clase: string; texto: string } {
    return declarado
      ? { clase: 'chip chip-jefe', texto: 'jefe' }
      : { clase: 'chip chip-sistema', texto: 'sistema' };
  }

  /* Esc cierra la forma abierta (un solo svelte:window a nivel de componente). */
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (editorAbierto) editorAbierto = false;
      else if (simuladorAbierto) simuladorAbierto = false;
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="jefe-variaciones" data-variaciones-panel={panelId}>
  <!-- ══════════ CINTA-ESTADO ══════════ -->
  <div class="cinta-estado">
    {#if $catalogoError}
      <span class="cinta-nombre error" title={$catalogoError}>⚠ catálogo no disponible</span>
    {:else if $mutacionesPendientes > 0}
      <span class="sync" aria-live="polite">⏳ sincronizando…</span>
      <span class="cinta-num">{$productosCartaStore.length}</span> productos
    {:else if $productosCartaStore.length > 0}
      <span class="cinta-num">{$productosCartaStore.length}</span> productos en carta
    {:else if $catalogoLoading}
      <span class="cinta-nombre muted">cargando carta…</span>
    {:else}
      <span class="cinta-nombre muted">sin carta activa</span>
    {/if}
  </div>

  <!-- ══════════ CAPA 1 · SELECCIONAR (ref-select) ══════════ -->
  <div class="barra">
    <select
      class="ref-select"
      bind:value={productoSeleccionado}
      on:change={elegirProducto}
      disabled={$catalogoLoading || $productosCartaStore.length === 0}
    >
      <option value="" disabled>selecciona un producto</option>
      {#each $productosCartaStore as p (p.id)}
        <option value={p.id}>
          {p.nombre}{p.tiene_variaciones ? ' 🔀' : ''}
        </option>
      {/each}
    </select>
    <!-- [ABIERTO H1] lote — configurar es 1 producto por llamada; decisión del dueño -->
    <button class="btn-lote" disabled title="[ABIERTO H1] lote: pendiente de decisión">
      en lote…
    </button>
  </div>

  <!-- ══════════ CAPA 2 · INFORMARSE (get + transparencia H3) ══════════ -->
  <div class="zona-informe">
    {#if !productoSeleccionado}
      <div class="estado muted">Elige un producto para ver qué rige hoy.</div>
    {:else if $informeLoading}
      <div class="estado muted">leyendo reglas…</div>
    {:else if $reglasStore}
      <div class="informe">
        <div class="informe-cabecera">
          <span class="informe-nombre">
            {#if $productoElegidoStore?.variaciones}
              <span class="chip chip-jefe" title="El jefe declaró estas reglas en la carta">jefe ✍</span>
            {:else}
              <span class="chip chip-sistema" title="El sistema derivó estas reglas por defecto">sistema ⚙</span>
            {/if}
            {$productoElegidoStore?.nombre ?? $productoElegidoStore.id}
            {#if $productoElegidoStore?.precio !== undefined}
              <span class="precio-base">· base {formatearCentimos(eurosACentimos(Number($productoElegidoStore.precio ?? 0)))}</span>
            {/if}
          </span>
          <button class="btn-secundario" on:click={abrirSimulador}>▶ simular</button>
          <button class="btn-primario" on:click={abrirEditor}>⚙ configurar</button>
        </div>

        <div class="palancas-informe">
          <div class="palanca">
            <div class="palanca-titulo">
              Se puede QUITAR <span class={chipOrigen($reglasDeclaradas).clase}>{chipOrigen($reglasDeclaradas).texto}</span>
            </div>
            {#if labelsDeclaradas.length}
              <div class="lista-chips">
                {#each labelsDeclaradas as nombre}
                  <span class="ing-chip">{nombre}</span>
                {/each}
              </div>
            {:else if $opcionQuitarUI?.valores?.length}
              <div class="lista-chips">
                {#each $opcionQuitarUI.valores as v}
                  <span class="ing-chip">{v.emoji ?? ''} {v.etiqueta}</span>
                {/each}
              </div>
            {:else}
              <span class="muted">— sin quitables</span>
            {/if}
          </div>

          <div class="palanca">
            <div class="palanca-titulo">
              Se puede AÑADIR <span class={chipOrigen($reglasDeclaradas).clase}>{chipOrigen($reglasDeclaradas).texto}</span>
            </div>
            <div class="lista-chips">
              <span class="ing-chip {$reglasStore.permite_anadir ? 'ing-chip-si' : 'ing-chip-no'}">
                {$reglasStore.permite_anadir ? 'sí' : 'no'}
              </span>
              {#if $reglasStore.permite_anadir}
                <span class="muted">· límite máximo de extras: <b>{$reglasStore.max_ingredientes_extra}</b></span>
              {/if}
            </div>
          </div>

          <div class="palanca">
            <div class="palanca-titulo">
              Extras ofertados <span class={chipOrigen($reglasDeclaradas).clase}>{chipOrigen($reglasDeclaradas).texto}</span>
            </div>
            {#if $reglasStore.extras_sugeridos?.length}
              <div class="lista-chips">
                {#each $reglasStore.extras_sugeridos as extra}
                  <span class="ing-chip">
                    {etiquetaIngrediente(extra.ingrediente_id)}
                    {#if typeof extra.precio_extra === 'number'}
                      <em>+{formatearEuros(extra.precio_extra)}</em>
                    {/if}
                  </span>
                {/each}
              </div>
            {:else}
              <span class="muted">— sin extras declarados con precio (precio estándar del catálogo)</span>
            {/if}
          </div>

          <div class="palanca">
            <div class="palanca-titulo">Opciones derivadas (motor)</div>
            {#if $opcionAnadeUI?.valores?.length}
              <div class="lista-chips">
                {#each $opcionAnadeUI.valores as v}
                  <span class="ing-chip" title="delta céntimos del motor">
                    {v.emoji ?? ''} {v.etiqueta}
                    {#if (v.delta_precio_centimos ?? 0) > 0}
                      <em>+{formatearCentimos(v.delta_precio_centimos)}</em>
                    {/if}
                  </span>
                {/each}
              </div>
            {:else}
              <span class="muted">— sin paleta derivada</span>
            {/if}
          </div>
        </div>

        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>
    {:else if $informeError === 'aún sin reglas'}
      <div class="estado">
        <p class="sin-reglas-titulo">Aún sin reglas para <b>{$productoElegidoStore?.nombre ?? 'este producto'}</b>.</p>
        <p class="muted">
          El sistema deriva por defecto: «sin» = los ingredientes base · «añadir» = la paleta
          de su categoría. Configúralas para declararlas:
        </p>
        <button class="btn-primario" on:click={abrirEditor}>⚙ configurar reglas</button>
        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>
    {:else if $informeError}
      <div class="estado error" role="alert">⚠ No se pudo leer el informe: {$informeError}</div>
    {/if}
  </div>
</div>

<!-- ══════════ SIMULADOR (neutro · dictamen del motor, R4) ══════════ -->
{#if simuladorAbierto && $reglasStore}
  <div class="editor-overlay" role="dialog" aria-modal="true" aria-label="Simulador de variaciones" tabindex="-1" on:mousedown={(e) => { if (e.target === e.currentTarget) simuladorAbierto = false; }}>
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>▶ Simulador · {$productoElegidoStore?.nombre}</h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (simuladorAbierto = false)}>✕</button>
      </header>
      <div class="editor-cuerpo">
        <p class="nota-motor">elige una selección de PRUEBA — el MOTOR dictamina (la UI no calcula)</p>

        {#if $opcionQuitarUI?.valores?.length}
          <fieldset class="campo">
            <legend>Sin (quitar)</legend>
            <div class="lista-chips">
              {#each $opcionQuitarUI.valores as v (v.id)}
                <label class="check-chip">
                  <input type="checkbox" bind:group={quitarPrueba} value={v.id} />
                  {v.emoji ?? ''} {v.etiqueta}
                </label>
              {/each}
            </div>
          </fieldset>
        {/if}

        {#if $opcionAnadeUI?.valores?.length}
          <fieldset class="campo">
            <legend>Añadir <small>(máximo {$opcionAnadeUI.max ?? 5})</small></legend>
            <div class="lista-chips">
              {#each $opcionAnadeUI.valores as v (v.id)}
                <label class="check-chip">
                  <input type="checkbox" bind:group={anadirPrueba} value={v.id} disabled={v.disponible === false} />
                  {v.emoji ?? ''} {v.etiqueta}
                  {#if (v.delta_precio_centimos ?? 0) > 0}
                    <em>+{formatearCentimos(v.delta_precio_centimos)}</em>
                  {/if}
                </label>
              {/each}
            </div>
          </fieldset>
        {/if}

        <button class="btn-primario" disabled={$dictamenLoading} on:click={ejecutarSimulacion}>
          {$dictamenLoading ? 'consultando al motor…' : 'evaluar selección'}
        </button>

        {#if $dictamenStore}
          <div class="dictamen {$dictamenStore.valida ? 'valida' : 'invalida'}" aria-live="polite">
            {#if $dictamenStore.valida}
              ✔ VÁLIDA — precio final <b>{formatearCentimos($dictamenStore.precio_final_centimos)}</b>
            {:else}
              ✘ INVÁLIDA — el motor rechaza:
              <ul>
                {#each $dictamenStore.errores as err}
                  <li>{err}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </div>
     </div>
  </div>
{/if}

<!-- ══════════ EDITOR-BLOQUE (capa 3 · las 4 palancas, 1 modal) ══════════ -->
{#if editorAbierto}
  <div
    class="editor-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Configurar variaciones de {$productoElegidoStore?.nombre}"
    tabindex="-1"
    on:mousedown={(e) => {
      if (e.target === e.currentTarget) editorAbierto = false;
    }}
  >
    <div class="editor-bloque">
      <header class="editor-cabecera">
        <h3>
          ⚙ Reglas · {$productoElegidoStore?.nombre}
          {#if $productoElegidoStore?.variaciones}
            <span class="chip chip-jefe">edita lo declarado</span>
          {:else}
            <span class="chip chip-sistema">declara por 1ª vez</span>
          {/if}
        </h3>
        <button class="btn-cerrar" title="Cerrar (Esc)" on:click={() => (editorAbierto = false)}>✕</button>
      </header>

      <div class="editor-cuerpo">
        <!-- (a) quitables: checkboxes sobre ingredientes_base del producto -->
        <fieldset class="campo">
          <legend>① Se puede QUITAR <small>(ingredientes base)</small></legend>
          {#if ($productoElegidoStore?.ingredientes_base ?? []).length}
            <div class="lista-chips">
              {#each $productoElegidoStore.ingredientes_base ?? [] as ing (ing.id)}
                <label class="check-chip">
                  <input type="checkbox" bind:group={quitarBorrador} value={ing.id} />
                  {ing.emoji ?? ''} {ing.nombre ?? ing.id}
                </label>
              {/each}
            </div>
          {:else}
            <span class="muted">— el producto no tiene ingredientes base en la carta</span>
          {/if}
        </fieldset>

        <!-- (b) toggle permite_anadir -->
        <label class="campo fila">
          <span>② Se puede AÑADIR extras</span>
          <input type="checkbox" bind:checked={anadirBorrador} />
        </label>

        <!-- (c) max_ingredientes_extra -->
        <label class="campo fila">
          <span>③ Máximo de extras por selección</span>
          <input type="number" min="0" max="99" bind:value={maxExtrasBorrador} class="input-max" />
        </label>

        <!-- (d) extras con precio € (opcional; vacío = precio estándar catálogo) -->
        <fieldset class="campo">
          <legend>④ Extras ofertados — precio € (opcional)</legend>
          {#if paletaExtras.length}
            {#each paletaExtras as v (v.id)}
              <div class="fila-extra">
                <span class="check-chip check-extra">
                  <span>{v.emoji ?? ''} {v.etiqueta}</span>
                  {#if (v.delta_precio_centimos ?? 0) > 0}
                    <em>catálogo +{formatearCentimos(v.delta_precio_centimos)}</em>
                  {/if}
                </span>
                <input
                  class="input-precio"
                  type="text"
                  inputmode="decimal"
                  placeholder="€ vacío = precio catálogo"
                  bind:value={preciosExtrasBorrador[v.id]}
                />
              </div>
            {/each}
          {:else}
            <span class="muted">— sin paleta de extras para este producto</span>
          {/if}
        </fieldset>

        <p class="nota-euro">
          💰 R6: escribes € — el motor razona en céntimos. Vacío = el catálogo pone el precio.
        </p>

        {#if $errorMutacion}
          <div class="feedback error" role="alert">⚠ {$errorMutacion}</div>
        {/if}
      </div>

      <footer class="editor-pie">
        <button class="btn-secundario" disabled={$mutacionesPendientes > 0} on:click={() => (editorAbierto = false)}>
          Cancelar
        </button>
        <button class="btn-primario" disabled={$mutacionesPendientes > 0} on:click={guardarPalancas}>
          {$mutacionesPendientes > 0 ? 'Guardando…' : 'Guardar reglas'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .jefe-variaciones {
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

  /* barra + ref-select */
  .barra {
    display: flex;
    gap: 0.5rem;
  }
  .ref-select {
    flex: 1;
    background: var(--color-input-bg, rgba(0, 0, 0, 0.3));
    color: var(--color-text, #e4e4e7);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 0.4rem 0.6rem;
    font-size: 0.78rem;
  }
  .ref-select:focus {
    outline: none;
    border-color: var(--color-primary, #eab308);
  }
  .btn-lote {
    background: none;
    border: 1px dashed var(--color-border, #444);
    color: var(--color-text-muted, #888);
    border-radius: 8px;
    padding: 0.4rem 0.7rem;
    font-size: 0.78rem;
    cursor: not-allowed;
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
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
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
  .informe-nombre {
    flex: 1;
    font-weight: 700;
    color: var(--color-text, #e4e4e7);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .precio-base {
    font-weight: 400;
    color: var(--color-text-muted, #888);
  }

  /* chips de origen (H3) */
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
  .ing-chip em {
    font-style: normal;
    color: var(--color-text-muted, #a1a1aa);
    font-size: 0.66rem;
  }
  .ing-chip-si {
    color: var(--color-success, #22c55e);
    border-color: rgba(34, 197, 94, 0.4);
  }
  .ing-chip-no {
    color: var(--color-error, #ef4444);
    border-color: rgba(239, 68, 68, 0.4);
  }
  .check-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.72rem;
    background: var(--color-input-bg, rgba(0, 0, 0, 0.3));
    border: 1px solid var(--color-border, #3f3f46);
    cursor: pointer;
  }
  .check-chip em {
    font-style: normal;
    color: var(--color-text-muted, #a1a1aa);
    font-size: 0.66rem;
  }

  .feedback.error {
    font-size: 0.74rem;
    color: var(--color-error, #ef4444);
  }

  /* editor-bloque / simulador (molde EditorFicha) */
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
    width: min(32rem, 92vw);
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
  .campo.fila input[type='number'] {
    width: 5rem;
  }
  .campo legend {
    padding: 0 0.3rem;
    font-weight: 700;
    color: var(--color-text-muted, #a1a1aa);
  }
  .campo input[type='number'],
  .campo input[type='text'] {
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
  .input-max {
    background: var(--color-input-bg, rgba(0, 0, 0, 0.3));
    color: var(--color-text, #e4e4e7);
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    font-size: 0.82rem;
  }
  .input-max:focus {
    outline: none;
    border-color: var(--color-primary, #eab308);
  }
  .fila-extra {
    display: grid;
    grid-template-columns: 1fr 9rem;
    gap: 0.4rem;
    align-items: center;
  }
  .check-extra {
    cursor: default;
  }
  .nota-euro,
  .nota-motor {
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

  /* dictamen del motor */
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
  .dictamen.invalida {
    color: var(--color-error, #ef4444);
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.08);
  }
  .dictamen ul {
    margin: 0.3rem 0 0;
    padding-left: 1.1rem;
  }
</style>