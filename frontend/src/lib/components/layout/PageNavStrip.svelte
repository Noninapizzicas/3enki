<script lang="ts">
  /**
   * PageNavStrip — rail derecho. SOLO el botón ⚙ Config Interfaz.
   *
   * Los paneles del proyecto NO tienen página propia (se abren como overlay desde
   * la workbar); listarlos aquí intentaría navegar a rutas que no existen
   * ([proyecto]/catalogo…). La barra lateral queda desierta salvo el ⚙, consistente
   * con «paneles sin página, workbar configurable por proyecto».
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  $: segs = $page.url.pathname.split('/').filter(Boolean);
  $: project = segs[0] ?? '';
  $: currentPage = segs[1] ?? '';

  function navigate(pid: string) {
    if (!pid || pid === currentPage) return;
    goto(project ? `/${project}/${pid}` : `/${pid}`);
  }
</script>

<!-- RAIL LATERAL — SOLO Config Interfaz.
     Los paneles NO tienen página propia (se abren como overlay desde la workbar);
     listarlos aqui intentaria navegar a rutas que no existen ([proyecto]/catalogo…).
     La barra lateral queda desierta salvo el boton ⚙, consistente con "paneles sin
     pagina, workbar configurable por proyecto". -->
<nav class="page-nav-strip" aria-label="Configuración de interfaz">
  <button
    class="pn-btn"
    class:current={currentPage === 'configuracion'}
    on:click={() => navigate('configuracion')}
    disabled={currentPage === 'configuracion'}
    title="Configuración de interfaz — elige qué paneles ves en este proyecto"
  >
    <span class="ic" aria-hidden="true">⚙</span>
  </button>
</nav>

<style>
  .page-nav-strip {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.45rem 0.3rem;
    background: var(--color-system-bar-bg, rgba(0, 0, 0, 0.55));
    border: 1px solid var(--color-border, #2a2a30);
    border-right: none;
    border-top-left-radius: 0.6rem;
    border-bottom-left-radius: 0.6rem;
    backdrop-filter: blur(8px);
    z-index: 100;
    max-height: 88vh;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }
  .page-nav-strip::-webkit-scrollbar { display: none; }

  .pn-btn {
    width: 2.2rem;
    height: 2.2rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-elevated, #1c1c21);
    border: 1px solid var(--color-border, #2a2a30);
    border-radius: 0.55rem;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    transition: background-color 0.12s, border-color 0.12s, transform 0.08s;
  }
  .pn-btn .ic { font-size: 1.05rem; line-height: 1; }

  .pn-btn:not(.current):hover {
    background: var(--color-hover, rgba(91, 157, 246, 0.16));
    border-color: var(--accent-color, #5b9df6);
  }
  .pn-btn:active { transform: scale(0.94); }

  .pn-btn.current {
    background: var(--accent-bg, rgba(91, 157, 246, 0.18));
    border-color: var(--accent-color, #5b9df6);
    cursor: default;
  }
</style>
