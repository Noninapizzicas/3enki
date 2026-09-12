<script lang="ts">
  /**
   * ImportacionModeloJefePanel — el FORMULARIO DE ACCIÓN del jefe que IMPORTA
   * modelos 3D al taller (F7, prisma-universal, 5ª y ÚLTIMA iteración de la
   * práctica de la vertical 3D).
   *
   * MATIZ CLAVE — a diferencia de catalogo-modelos (lector + alta) o
   * historial/cola (cintas CRUD), aquí el jefe EJERCE una acción: IMPORTAR.
   * El módulo es un PUENTE stateless: NO hay lista propia de "mis
   * importaciones" (los modelos importados viven en catalogo-modelos).
   *
   * Composición:
   *   - FORMULARIO DE ACCIÓN (editor-bloque, rol JEFE): url (obligatoria) +
   *     select origen + categoría + nombre (opcional) → dispara
   *     importacion.importar.request.
   *   - FEEDBACK DE ESTADO (señal pareada, R3): badge en_progreso (⏳ importando…)
   *     → importada (✅ modelo con id/nombre) → fallida (❌ motivo tipado).
   *   - RESULTADO: cuando importacion.importada llega, muestra el modelo y
   *     enlaza a verlo en el catálogo (cara de catalogo-modelos).
   *
   * HONESTIDAD sobre la búsqueda previa: el flujo del dueño es buscar →
   * elegir → importar. PERO la búsqueda (_buscar) es DELEGACIÓN interna a
   * busqueda-repositorios (NO existe onBuscarRequest en index.js ni module.json
   * subscrito a busqueda.buscar.request). Por LEY DE CERO SUPUESTOS este panel
   * NO implementa una caja de búsqueda propia del módulo ni llama a un handler
   * inexistente: la forma REAL es "pegar la URL" (que es lo que el dueño hace
   * cuando ya eligió en el PC/repo). Documentado en interfaz-decisiones.md.
   *
   * Lenguaje visual: color=estado, icono=entidad (📥/🧊), texto=precisión.
   */

  import { onMount } from 'svelte';
  import {
    importando,
    resultadoImportacion,
    importacionError,
    estadoImportacion,
    ultimaSenal,
    motivoFallo,
    importarModelo,
    resetImportacion,
    initImportacionSubscriptions,
    type OrigenModelo
  } from './stores/importacion';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  // ---- campos del formulario de importación ----
  let formUrl = '';
  let formOrigen: OrigenModelo | '' = 'desconocido';
  let formCategoria = '';
  let formNombre = '';

  // ---- error local de validación del form (no del backend) ----
  let formError: string | null = null;

  /* Suscripción a las señales pareadas — R3. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initImportacionSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetImportacion();
    };
  });

  const ORIGENES: OrigenModelo[] = [
    'printables',
    'makerworld',
    'cults3d',
    'thingiverse',
    'diseno propio',
    'desconocido'
  ];

  const categoriasSugeridas = [
    'mecanico',
    'funcional',
    'decorativo',
    'organizador',
    'prototipo',
    'sin_categoria'
  ];

  async function ejecutarImportar(): Promise<void> {
    const pid = $sessionProjectId;
    if (!pid) {
      formError = 'no hay proyecto activo';
      return;
    }
    if (!formUrl.trim()) {
      formError = 'la URL del modelo es obligatoria';
      return;
    }
    formError = null;
    await importarModelo(pid, {
      url: formUrl,
      origen: formOrigen || undefined,
      categoria: formCategoria || undefined,
      nombre: formNombre || undefined
    });
  }

  /** ¿El badge del feedback de estado es terminal? (en_progreso es transitorio). */
  function estadoTerminal(): boolean {
    const e = $estadoImportacion;
    return e === 'importada' || e === 'fallida';
  }

  // Estado "listo para empezar": no hay importación ni en curso ni resuelta.
  const idle = $estadoImportacion === 'idle';
</script>

<div class="importacion-panel" data-importacion-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">📥</span>
    <span class="badge-label">Importar modelo 3D</span>
    <span class="badge-scope">PUENTE · el jefe importa lo que entra al taller · los modelos viven en el catálogo</span>
    {#if $importando}
      <span class="badge-sync">importando…</span>
    {/if}
  </div>

  <!-- FEEDBACK DE ESTADO (señal pareada, R3) -->
  {#if $estadoImportacion === 'en_progreso'}
    <div class="feedback feedback-enprogreso">
      <span class="fb-ico">⏳</span>
      <div class="fb-body">
        <span class="fb-titulo">Importando…</span>
        <span class="fb-detalle">el puente descarga, lee el .3mf y registra en el catálogo</span>
      </div>
      <div class="spinner"></div>
    </div>
  {:else if $estadoImportacion === 'importada' && $resultadoImportacion}
    <div class="feedback feedback-importada">
      <span class="fb-ico">✅</span>
      <div class="fb-body">
        <span class="fb-titulo">Modelo importado</span>
        <span class="fb-detalle">
          <strong>{$resultadoImportacion.nombre}</strong>
          {#if $resultadoImportacion.origen && $resultadoImportacion.origen !== 'desconocido'}
            · desde {$resultadoImportacion.origen}
          {/if}
          · id: <code>{$resultadoImportacion.modelo_id}</code>
        </span>
      </div>
      <a class="fb-accion" href="/{$sessionProjectId}/catalogo-modelos" title="ver el modelo en el catálogo (cara de catalogo-modelos)">ver catálogo →</a>
    </div>
  {:else if $estadoImportacion === 'fallida'}
    <div class="feedback feedback-fallida">
      <span class="fb-ico">❌</span>
      <div class="fb-body">
        <span class="fb-titulo">Importación fallida</span>
        <span class="fb-detalle">
          {#if $motivoFallo}
            <code>{$motivoFallo}</code> — {$importacionError}
          {:else}
            {$importacionError}
          {/if}
        </span>
      </div>
      <button class="btn-neutro" on:click={() => importarModelo($sessionProjectId ?? '', { url: formUrl, origen: formOrigen || undefined, categoria: formCategoria || undefined, nombre: formNombre || undefined })}>
        reintentar
      </button>
    </div>
  {/if}

  <!-- FORMULARIO DE ACCIÓN (editor-bloque, ROL JEFE) -->
  {#if idle || $estadoImportacion === 'en_progreso'}
    {#if idle}
    <div class="vacio">
      <div class="vacio-ico">📥</div>
      <div class="vacio-txt">pega la URL de un modelo para importarlo al taller</div>
    </div>
    {/if}

    {#if $estadoImportacion === 'idle'}
      <div class="form editor-bloque">
        <div class="form-titulo">Importar modelo</div>

        {#if formError}
          <div class="err-form">⚠️ {formError}</div>
        {/if}

        <label class="campo">
          <span>URL del modelo <em>· obligatorio</em></span>
          <input
            class="input"
            bind:value={formUrl}
            placeholder="https://…"
            on:keydown={(e) => e.key === 'Enter' && ejecutarImportar()}
          />
        </label>

        <label class="campo">
          <span>Origen</span>
          <select class="input" bind:value={formOrigen}>
            {#each ORIGENES as o (o)}
              <option value={o}>{o}</option>
            {/each}
          </select>
        </label>

        <label class="campo">
          <span>Categoría</span>
          <input class="input" list="importacion-categorias" bind:value={formCategoria} placeholder="sin_categoria" />
          <datalist id="importacion-categorias">
            {#each categoriasSugeridas as c (c)}
              <option value={c}></option>
            {/each}
          </datalist>
        </label>

        <label class="campo">
          <span>Nombre <em class="opcional">· opcional</em></span>
          <input class="input" bind:value={formNombre} placeholder="se usa el de los metadatos del .3mf" />
        </label>

        <div class="panel-gestos">
          <button class="btn-jefe" disabled={$importando} on:click={ejecutarImportar}>
            {$importando ? '⏳ importando…' : '📥 Importar'}
          </button>
          <button class="btn-neutro" on:click={() => { resetImportacion(); formUrl = ''; formError = null; }}>limpiar</button>
        </div>
      </div>
    {/if}
  {:else if estadoTerminal()}
    <!-- Tras el feedback terminal, ofrecer importar otro (cerrar el ciclo). -->
    <button class="btn-jefe btn-siguiente" on:click={() => { resetImportacion(); formUrl = ''; formError = null; formNombre = ''; }}>
      ➕ Importar otro modelo
    </button>
  {/if}

  <div class="pie-hint">
    el resultado se confirma por la señal, sin recargar · el modelo importado se ve en el catálogo 3D ·
    busca el modelo antes en tu PC/repo y pega su URL aquí (la búsqueda delega a busqueda-repositorios)
  </div>
</div>

<style>
  .importacion-panel {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.5rem;
  }
  .actor-badge {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.7rem;
    margin-bottom: 0.1rem;
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
  .badge-sync { margin-left: auto; color: var(--color-primary, #eab308); font-size: 0.65rem; }

  /* ---- feedback de estado (color=estado) ---- */
  .feedback {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    font-size: 0.78rem;
    border: 1px solid var(--color-border, #333);
  }
  .fb-ico { font-size: 1.1rem; }
  .fb-body { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; }
  .fb-titulo { font-weight: 700; }
  .fb-detalle { color: var(--color-text-muted, #bbb); }
  .fb-detalle code { font-size: 0.7rem; background: var(--color-surface, #1a1a1a); padding: 0.05rem 0.35rem; border-radius: 4px; }
  .fb-accion { font-size: 0.72rem; color: var(--color-primary, #eab308); text-decoration: none; white-space: nowrap; }
  .feedback-enprogreso { color: #60a5fa; background: rgba(96, 165, 250, 0.1); }
  .feedback-importada { color: #22c55e; background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.25); }
  .feedback-fallida { color: #ef4444; background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.25); }
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ---- vacío "listo para empezar" ---- */
  .vacio {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 110px;
    border: 1px dashed var(--color-border, #444);
    border-radius: 8px;
    color: var(--color-text-muted, #888);
    font-size: 0.8rem;
  }
  .vacio-ico { font-size: 1.8rem; }

  /* ---- formulario editor-bloque ---- */
  .form {
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 0.9rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .form-titulo { margin: 0; font-size: 0.9rem; font-weight: 700; }
  .err-form { font-size: 0.72rem; color: #ef4444; }
  .campo { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.74rem; color: var(--color-text-muted, #aaa); }
  .campo em { font-style: normal; color: #f59e0b; }
  .campo em.opcional { color: var(--color-text-muted, #888); }
  .input {
    background: var(--color-bg, #141414);
    color: inherit;
    border: 1px solid var(--color-border, #444);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
  }
  .panel-gestos { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn-jefe, .btn-neutro {
    font-size: 0.78rem;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    border: 1px solid transparent;
    cursor: pointer;
  }
  .btn-jefe { background: var(--color-primary, #eab308); color: #111; font-weight: 700; }
  .btn-jefe:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-neutro { background: transparent; color: inherit; border-color: var(--color-border, #444); }
  .btn-siguiente { align-self: flex-start; }
  .pie-hint { font-size: 0.62rem; color: var(--color-text-muted, #888); padding: 0 0.2rem; }
</style>
