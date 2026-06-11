<script lang="ts">
  /**
   * PageNavStrip — rail derecho de navegacion rapida entre paginas del recetario.
   *
   * Tira vertical compacta pegada al borde derecho (solo icono). Lista FIJA de
   * paginas (decision del usuario): recetas, escandallo, viabilidad,
   * carta-manager, menu-generator. La pagina activa se destaca; un tap en otra
   * = goto directo, sin pasar por el chat ni por chat.cambiar_foco.
   *
   * Sin seccion de sistema (history/credentials ya viven en la fila de iconos
   * sobre el input del chat) y sin hueco central.
   *
   * Iconos del manifest de cada modulo-pagina (getDefinition). Fallback '→'.
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  // Lista fija de páginas del rail, con icono y etiqueta propios (no dependemos
  // del manifest: así ninguna sale con la flecha de fallback). En orden.
  const PAGES: { id: string; icon: string; label: string }[] = [
    { id: 'recetas',         icon: '📖', label: 'Recetas' },
    { id: 'escandallo',      icon: '📊', label: 'Escandallo' },
    { id: 'viabilidad',      icon: '📈', label: 'Viabilidad' },
    { id: 'carta-manager',   icon: '🗂️', label: 'Carta manager' },
    { id: 'menu-generator',  icon: '✨', label: 'Menú generator' },
    { id: 'carta-design',    icon: '🎨', label: 'Carta diseño' },
    { id: 'carta-digital',   icon: '📱', label: 'Carta digital' },
    { id: 'carta-marketing', icon: '📣', label: 'Carta marketing' },
    { id: 'carta-scheduler', icon: '📅', label: 'Programación' },
    { id: 'ingredientes',    icon: '🥬', label: 'Ingredientes' },
    { id: 'tarifas',         icon: '🏷️', label: 'Tarifas' }
  ];

  $: segs = $page.url.pathname.split('/').filter(Boolean);
  $: project = segs[0] ?? '';
  $: currentPage = segs[1] ?? '';

  function navigate(pid: string) {
    if (!pid || pid === currentPage) return;
    goto(project ? `/${project}/${pid}` : `/${pid}`);
  }
</script>

<nav class="page-nav-strip" aria-label="Navegación de páginas">
  {#each PAGES as p (p.id)}
    <button
      class="pn-btn"
      class:current={p.id === currentPage}
      on:click={() => navigate(p.id)}
      disabled={p.id === currentPage}
      title={p.id === currentPage ? p.label : `Ir a ${p.label}`}
    >
      <span class="ic" aria-hidden="true">{p.icon}</span>
    </button>
  {/each}
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
