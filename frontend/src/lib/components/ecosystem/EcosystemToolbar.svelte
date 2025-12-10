<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fly } from 'svelte/transition';
  import ToolbarIcon from '$components/toolbar/ToolbarIcon.svelte';
  import FloatingPanel from '$components/feedback/FloatingPanel.svelte';

  /**
   * EcosystemToolbar - Barra lateral de ecosistema (UI-SYSTEM-PLAN compliant)
   *
   * Siguiendo UI-SYSTEM-PLAN.md:
   * - Posición: Lado derecho, fija
   * - Dominio: Sistema global, navegación entre módulos
   * - Interacción: Triple (tap/doubleTap/longPress)
   * - Paneles: Select (tap), Add (doubleTap si enableAdd), Config (longPress)
   *
   * Botones:
   * - Módulos (enableAdd=true): marketplace de módulos
   * - Sistema (enableAdd=false): configuración
   * - Alertas (enableAdd=false): notificaciones
   * - Usuario (enableAdd=false): perfil
   */

  // Props
  export let expanded = false;
  export let notificationCount = 0;
  export let currentModule = '';
  export let userName = 'Usuario';
  export let userEmail = '';
  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher<{
    selectModule: { moduleId: string };
    installModule: { url: string };
    configModule: { moduleId: string; action: 'update' | 'disable' | 'uninstall' };
    configSystem: { section: string };
    readNotification: { id: string };
    clearNotifications: void;
    userAction: { action: 'activity' | 'favorites' | 'history' | 'logout' };
    configUser: { field: string; value: string };
  }>();

  // Estado de paneles
  let activePanel: string | null = null;
  let panelType: 'select' | 'add' | 'config' = 'select';

  // Configuración de botones del ecosistema
  const ecosystemButtons = [
    {
      id: 'modules',
      icon: '🧩',
      label: 'Módulos',
      enableAdd: true,
      badgeColor: 'primary' as const
    },
    {
      id: 'system',
      icon: '⚙️',
      label: 'Sistema',
      enableAdd: false,
      badgeColor: 'info' as const
    },
    {
      id: 'alerts',
      icon: '🔔',
      label: 'Alertas',
      enableAdd: false,
      badgeColor: 'danger' as const
    },
    {
      id: 'user',
      icon: '👤',
      label: 'Perfil',
      enableAdd: false,
      badgeColor: 'success' as const
    }
  ];

  // Handlers de interacción
  function handleTap(event: CustomEvent<{ id: string }>) {
    activePanel = event.detail.id;
    panelType = 'select';
  }

  function handleDoubleTap(event: CustomEvent<{ id: string }>) {
    const button = ecosystemButtons.find(b => b.id === event.detail.id);
    if (button?.enableAdd) {
      activePanel = event.detail.id;
      panelType = 'add';
    }
  }

  function handleLongPress(event: CustomEvent<{ id: string }>) {
    activePanel = event.detail.id;
    panelType = 'config';
  }

  function closePanel() {
    activePanel = null;
  }

  function toggleExpand() {
    expanded = !expanded;
  }

  // Badge para notificaciones
  $: alertsBadge = notificationCount > 0
    ? (notificationCount > 99 ? '99+' : notificationCount)
    : undefined;

  // Datos mock (en producción vendrían de stores/API)
  const mockModules = [
    { id: 'menu-generator', name: 'Menu Generator', icon: '🍽️', active: true },
    { id: 'ai-gateway', name: 'AI Gateway', icon: '🤖', active: true },
    { id: 'file-browser', name: 'File Browser', icon: '📁', active: true },
    { id: 'analytics', name: 'Analytics', icon: '📊', active: false }
  ];

  const mockNotifications = [
    { id: '1', type: 'success', title: 'Credencial validada', desc: 'OpenAI ****3f2a', time: 'hace 5 min' },
    { id: '2', type: 'warning', title: 'Menú exportado', desc: 'menu_navidad.json', time: 'hace 2h' },
    { id: '3', type: 'error', title: 'Error de conexión', desc: 'MQTT timeout', time: 'hace 4h' }
  ];
</script>

<div
  class="ecosystem-toolbar"
  class:ecosystem-toolbar--expanded={expanded}
  class={className}
  transition:fly={{ x: 50, duration: 200 }}
>
  <!-- Botones del ecosistema -->
  <div class="ecosystem-toolbar__buttons">
    {#each ecosystemButtons as button (button.id)}
      <ToolbarIcon
        id={button.id}
        icon={button.icon}
        label={button.label}
        badge={button.id === 'alerts' ? alertsBadge : undefined}
        badgeColor={button.badgeColor}
        active={activePanel === button.id}
        on:tap={handleTap}
        on:doubleTap={handleDoubleTap}
        on:longPress={handleLongPress}
      />
    {/each}
  </div>

  <!-- Toggle expandir/colapsar -->
  <button
    class="ecosystem-toolbar__toggle"
    on:click={toggleExpand}
    aria-label={expanded ? 'Colapsar' : 'Expandir'}
  >
    {expanded ? '▶' : '◀'}
  </button>
</div>

<!-- Panel: Módulos Select -->
{#if activePanel === 'modules' && panelType === 'select'}
  <FloatingPanel
    open={true}
    position="right"
    size="md"
    title="🧩 Módulos"
    on:close={closePanel}
  >
    <div class="panel-content">
      <div class="panel-search">
        <input type="text" placeholder="🔍 Buscar módulo..." class="panel-input" />
      </div>

      <div class="panel-section">
        <div class="panel-section__title">ACTIVOS</div>
        {#each mockModules.filter(m => m.active) as mod (mod.id)}
          <button
            class="panel-item"
            class:panel-item--selected={currentModule === mod.id}
            on:click={() => { dispatch('selectModule', { moduleId: mod.id }); closePanel(); }}
          >
            <span class="panel-item__icon">{mod.icon}</span>
            <span class="panel-item__name">{mod.name}</span>
            {#if currentModule === mod.id}
              <span class="panel-item__check">✓</span>
            {/if}
          </button>
        {/each}
      </div>

      <div class="panel-section">
        <div class="panel-section__title">DISPONIBLES</div>
        {#each mockModules.filter(m => !m.active) as mod (mod.id)}
          <button class="panel-item panel-item--inactive">
            <span class="panel-item__icon">{mod.icon}</span>
            <span class="panel-item__name">{mod.name}</span>
            <span class="panel-item__action">[Activar]</span>
          </button>
        {/each}
      </div>
    </div>
  </FloatingPanel>
{/if}

<!-- Panel: Módulos Add (Marketplace) -->
{#if activePanel === 'modules' && panelType === 'add'}
  <FloatingPanel
    open={true}
    position="right"
    size="lg"
    title="➕ Instalar Módulo"
    on:close={closePanel}
  >
    <div class="panel-content">
      <div class="panel-search">
        <input type="text" placeholder="🔍 Buscar en marketplace..." class="panel-input" />
      </div>

      <div class="panel-section">
        <div class="panel-section__title">POPULARES</div>
        <div class="marketplace-item">
          <div class="marketplace-item__info">
            <span class="marketplace-item__icon">📈</span>
            <div>
              <div class="marketplace-item__name">Dashboard Pro</div>
              <div class="marketplace-item__meta">⭐ 4.8 • 1.2k descargas</div>
            </div>
          </div>
          <button class="btn btn--primary btn--sm">Instalar</button>
        </div>
        <div class="marketplace-item">
          <div class="marketplace-item__info">
            <span class="marketplace-item__icon">🔗</span>
            <div>
              <div class="marketplace-item__name">API Monitor</div>
              <div class="marketplace-item__meta">⭐ 4.5 • 800 descargas</div>
            </div>
          </div>
          <button class="btn btn--primary btn--sm">Instalar</button>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-section__title">DESDE URL</div>
        <div class="panel-form-row">
          <input type="text" placeholder="https://github.com/..." class="panel-input" />
          <button class="btn btn--secondary">📥 Instalar</button>
        </div>
      </div>
    </div>
  </FloatingPanel>
{/if}

<!-- Panel: Módulos Config -->
{#if activePanel === 'modules' && panelType === 'config'}
  <FloatingPanel
    open={true}
    position="right"
    size="md"
    title="⚙️ Gestionar Módulos"
    on:close={closePanel}
  >
    <div class="panel-content">
      <div class="config-header">
        <span class="config-header__icon">🍽️</span>
        <span class="config-header__name">Menu Generator</span>
        <span class="config-header__status config-header__status--active">● Activo</span>
      </div>

      <div class="config-stats">
        <div class="config-stat">
          <span class="config-stat__label">Versión</span>
          <span class="config-stat__value">1.2.0</span>
        </div>
        <div class="config-stat">
          <span class="config-stat__label">Memoria</span>
          <span class="config-stat__value">24 MB</span>
        </div>
      </div>

      <div class="config-actions">
        <button class="btn btn--info btn--block">
          🔄 Actualizar (v1.3.0 disponible)
        </button>
        <button class="btn btn--warning btn--block">
          ⏸️ Desactivar
        </button>
        <button class="btn btn--danger btn--block">
          🗑️ Desinstalar
        </button>
      </div>

      <button class="panel-link">Ver lista completa →</button>
    </div>
  </FloatingPanel>
{/if}

<!-- Panel: Sistema Select -->
{#if activePanel === 'system' && panelType === 'select'}
  <FloatingPanel
    open={true}
    position="right"
    size="sm"
    title="⚙️ Configuración Rápida"
    on:close={closePanel}
  >
    <div class="panel-content">
      <div class="config-field">
        <label class="config-field__label">Tema</label>
        <div class="config-field__options">
          <label class="radio-option">
            <input type="radio" name="theme" value="dark" checked /> Oscuro
          </label>
          <label class="radio-option">
            <input type="radio" name="theme" value="light" /> Claro
          </label>
          <label class="radio-option">
            <input type="radio" name="theme" value="auto" /> Auto
          </label>
        </div>
      </div>

      <div class="config-field">
        <label class="config-field__label">Idioma</label>
        <select class="panel-select">
          <option>Español</option>
          <option>English</option>
          <option>Português</option>
        </select>
      </div>

      <div class="config-field">
        <label class="config-field__label">Notificaciones</label>
        <div class="config-field__checkboxes">
          <label class="checkbox-option">
            <input type="checkbox" checked /> Sonido
          </label>
          <label class="checkbox-option">
            <input type="checkbox" checked /> Vibración
          </label>
        </div>
      </div>

      <button class="panel-link">Más opciones →</button>
    </div>
  </FloatingPanel>
{/if}

<!-- Panel: Sistema Config -->
{#if activePanel === 'system' && panelType === 'config'}
  <FloatingPanel
    open={true}
    position="right"
    size="lg"
    title="⚙️ Configuración del Sistema"
    on:close={closePanel}
  >
    <div class="panel-content">
      <div class="panel-section">
        <div class="panel-section__title">APARIENCIA</div>
        <div class="config-row">
          <span>Tema</span>
          <span class="config-row__value">Oscuro</span>
        </div>
        <div class="config-row">
          <span>Densidad</span>
          <span class="config-row__value">Compacta</span>
        </div>
        <div class="config-row">
          <span>Animaciones</span>
          <span class="config-row__value">Activadas</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-section__title">CONEXIÓN</div>
        <div class="config-row">
          <span>MQTT</span>
          <span class="config-row__status config-row__status--ok">● Conectado</span>
        </div>
        <div class="config-row">
          <span>API</span>
          <span class="config-row__value">localhost:3000</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-section__title">ALMACENAMIENTO</div>
        <div class="config-row">
          <span>Cache: 128 MB</span>
          <button class="btn btn--sm btn--ghost">Limpiar</button>
        </div>
        <div class="config-row">
          <span>Logs: 45 MB</span>
          <button class="btn btn--sm btn--ghost">Ver</button>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-section__title">AVANZADO</div>
        <div class="config-actions config-actions--row">
          <button class="btn btn--secondary">Exportar config</button>
          <button class="btn btn--secondary">Importar config</button>
        </div>
        <button class="btn btn--danger btn--block">Restablecer todo</button>
      </div>

      <div class="panel-footer">
        <span class="panel-footer__version">Event-Core v2.1.0</span>
      </div>
    </div>
  </FloatingPanel>
{/if}

<!-- Panel: Alertas Select -->
{#if activePanel === 'alerts' && panelType === 'select'}
  <FloatingPanel
    open={true}
    position="right"
    size="md"
    title="🔔 Notificaciones"
    on:close={closePanel}
  >
    <div class="panel-content">
      <button class="btn btn--ghost btn--block" on:click={() => dispatch('clearNotifications')}>
        Marcar todas como leídas
      </button>

      <div class="panel-section">
        <div class="panel-section__title">HOY</div>
        {#each mockNotifications as notif (notif.id)}
          <button
            class="notification-item notification-item--{notif.type}"
            on:click={() => dispatch('readNotification', { id: notif.id })}
          >
            <span class="notification-item__dot"></span>
            <div class="notification-item__content">
              <div class="notification-item__title">{notif.title}</div>
              <div class="notification-item__desc">{notif.desc} • {notif.time}</div>
            </div>
          </button>
        {/each}
      </div>

      <button class="panel-link">Ver más...</button>
    </div>
  </FloatingPanel>
{/if}

<!-- Panel: Alertas Config -->
{#if activePanel === 'alerts' && panelType === 'config'}
  <FloatingPanel
    open={true}
    position="right"
    size="md"
    title="⚙️ Configurar Alertas"
    on:close={closePanel}
  >
    <div class="panel-content">
      <div class="config-field">
        <label class="config-field__label">Filtrar por tipo</label>
        <div class="config-field__checkboxes">
          <label class="checkbox-option checkbox-option--success">
            <input type="checkbox" checked /> Éxito
          </label>
          <label class="checkbox-option checkbox-option--info">
            <input type="checkbox" checked /> Info
          </label>
          <label class="checkbox-option checkbox-option--warning">
            <input type="checkbox" checked /> Warning
          </label>
          <label class="checkbox-option checkbox-option--danger">
            <input type="checkbox" checked /> Error
          </label>
        </div>
      </div>

      <div class="config-field">
        <label class="config-field__label">Retención</label>
        <select class="panel-select">
          <option>7 días</option>
          <option>14 días</option>
          <option>30 días</option>
        </select>
      </div>

      <div class="config-actions">
        <button class="btn btn--danger btn--block">
          🗑️ Limpiar todas (23 items)
        </button>
        <button class="btn btn--secondary btn--block">
          📤 Exportar historial
        </button>
      </div>
    </div>
  </FloatingPanel>
{/if}

<!-- Panel: Usuario Select -->
{#if activePanel === 'user' && panelType === 'select'}
  <FloatingPanel
    open={true}
    position="right"
    size="sm"
    title="👤 Mi Perfil"
    on:close={closePanel}
  >
    <div class="panel-content">
      <div class="user-header">
        <div class="user-avatar">👤</div>
        <div class="user-info">
          <div class="user-name">{userName}</div>
          <div class="user-email">{userEmail || 'user@email.com'}</div>
        </div>
      </div>

      <div class="user-actions">
        <button class="panel-item" on:click={() => dispatch('userAction', { action: 'activity' })}>
          <span class="panel-item__icon">📊</span>
          <span class="panel-item__name">Mi actividad</span>
        </button>
        <button class="panel-item" on:click={() => dispatch('userAction', { action: 'favorites' })}>
          <span class="panel-item__icon">⭐</span>
          <span class="panel-item__name">Favoritos</span>
        </button>
        <button class="panel-item" on:click={() => dispatch('userAction', { action: 'history' })}>
          <span class="panel-item__icon">📜</span>
          <span class="panel-item__name">Historial</span>
        </button>
      </div>

      <div class="user-logout">
        <button class="btn btn--danger btn--block" on:click={() => dispatch('userAction', { action: 'logout' })}>
          🚪 Cerrar sesión
        </button>
      </div>
    </div>
  </FloatingPanel>
{/if}

<!-- Panel: Usuario Config -->
{#if activePanel === 'user' && panelType === 'config'}
  <FloatingPanel
    open={true}
    position="right"
    size="md"
    title="⚙️ Configurar Cuenta"
    on:close={closePanel}
  >
    <div class="panel-content">
      <div class="config-field">
        <label class="config-field__label">Nombre</label>
        <input type="text" class="panel-input" value={userName} />
      </div>

      <div class="config-field">
        <label class="config-field__label">Email</label>
        <input type="email" class="panel-input" value={userEmail || 'user@email.com'} />
      </div>

      <div class="config-field">
        <label class="config-field__label">Avatar</label>
        <div class="avatar-config">
          <div class="user-avatar user-avatar--lg">👤</div>
          <button class="btn btn--secondary btn--sm">Cambiar</button>
        </div>
      </div>

      <div class="config-actions">
        <button class="btn btn--secondary btn--block">
          🔐 Cambiar contraseña
        </button>
        <button class="btn btn--danger btn--block">
          🗑️ Eliminar cuenta
        </button>
      </div>

      <div class="panel-footer panel-footer--actions">
        <button class="btn btn--ghost" on:click={closePanel}>Cancelar</button>
        <button class="btn btn--primary">💾 Guardar</button>
      </div>
    </div>
  </FloatingPanel>
{/if}

<style>
  /* ============================================
     ECOSYSTEM TOOLBAR - UI-SYSTEM-PLAN Compliant
     ============================================ */

  .ecosystem-toolbar {
    --_bg: var(--ecosystem-bg, var(--color-bg-card, #1a1d24));
    --_border: var(--ecosystem-border, var(--color-border, #374151));
    --_radius: var(--ecosystem-radius, var(--radius-lg, 12px));
    --_padding: var(--ecosystem-padding, 0.5rem);

    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 100;

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;

    padding: var(--_padding);
    background: var(--_bg);
    border: 1px solid var(--_border);
    border-right: none;
    border-radius: var(--_radius) 0 0 var(--_radius);

    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .ecosystem-toolbar__buttons {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .ecosystem-toolbar__toggle {
    margin-top: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--color-text-muted, #9ca3af);
    cursor: pointer;
    font-size: 0.625rem;
    transition: color 0.15s ease;
  }

  .ecosystem-toolbar__toggle:hover {
    color: var(--color-text, #ffffff);
  }

  /* ============================================
     PANEL STYLES
     ============================================ */

  .panel-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .panel-search {
    margin-bottom: 0.5rem;
  }

  .panel-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--color-bg, #0f1115);
    border: 1px solid var(--color-border, #374151);
    border-radius: var(--radius-md, 8px);
    color: var(--color-text, #ffffff);
    font-size: 0.875rem;
  }

  .panel-input::placeholder {
    color: var(--color-text-muted, #9ca3af);
  }

  .panel-input:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .panel-select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--color-bg, #0f1115);
    border: 1px solid var(--color-border, #374151);
    border-radius: var(--radius-md, 8px);
    color: var(--color-text, #ffffff);
    font-size: 0.875rem;
  }

  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .panel-section__title {
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--color-text-muted, #9ca3af);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .panel-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: var(--color-bg, #0f1115);
    border: 1px solid transparent;
    border-radius: var(--radius-md, 8px);
    color: var(--color-text, #ffffff);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .panel-item:hover {
    background: var(--color-bg-hover, #1f2937);
    border-color: var(--color-border, #374151);
  }

  .panel-item--selected {
    border-color: var(--color-primary, #3b82f6);
    background: rgb(59 130 246 / 0.1);
  }

  .panel-item--inactive {
    opacity: 0.6;
  }

  .panel-item__icon {
    font-size: 1.25rem;
  }

  .panel-item__name {
    flex: 1;
    font-size: 0.875rem;
  }

  .panel-item__check {
    color: var(--color-success, #22c55e);
  }

  .panel-item__action {
    font-size: 0.75rem;
    color: var(--color-primary, #3b82f6);
  }

  .panel-link {
    display: block;
    width: 100%;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--color-primary, #3b82f6);
    font-size: 0.875rem;
    text-align: center;
    cursor: pointer;
  }

  .panel-link:hover {
    text-decoration: underline;
  }

  .panel-form-row {
    display: flex;
    gap: 0.5rem;
  }

  .panel-form-row .panel-input {
    flex: 1;
  }

  .panel-footer {
    padding-top: 1rem;
    border-top: 1px solid var(--color-border, #374151);
    text-align: center;
  }

  .panel-footer__version {
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
  }

  .panel-footer--actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  /* ============================================
     MARKETPLACE STYLES
     ============================================ */

  .marketplace-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: var(--color-bg, #0f1115);
    border: 1px solid var(--color-border, #374151);
    border-radius: var(--radius-md, 8px);
  }

  .marketplace-item__info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .marketplace-item__icon {
    font-size: 1.5rem;
  }

  .marketplace-item__name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text, #ffffff);
  }

  .marketplace-item__meta {
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
  }

  /* ============================================
     CONFIG STYLES
     ============================================ */

  .config-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--color-bg, #0f1115);
    border-radius: var(--radius-md, 8px);
  }

  .config-header__icon {
    font-size: 1.5rem;
  }

  .config-header__name {
    flex: 1;
    font-weight: 500;
  }

  .config-header__status {
    font-size: 0.75rem;
  }

  .config-header__status--active {
    color: var(--color-success, #22c55e);
  }

  .config-stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .config-stat {
    display: flex;
    flex-direction: column;
    padding: 0.5rem;
    background: var(--color-bg, #0f1115);
    border-radius: var(--radius-sm, 4px);
    text-align: center;
  }

  .config-stat__label {
    font-size: 0.625rem;
    color: var(--color-text-muted, #9ca3af);
    text-transform: uppercase;
  }

  .config-stat__value {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .config-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .config-actions--row {
    flex-direction: row;
  }

  .config-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .config-field__label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-text-muted, #9ca3af);
  }

  .config-field__options {
    display: flex;
    gap: 1rem;
  }

  .config-field__checkboxes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .radio-option,
  .checkbox-option {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .config-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0;
    font-size: 0.875rem;
  }

  .config-row__value {
    color: var(--color-text-muted, #9ca3af);
  }

  .config-row__status--ok {
    color: var(--color-success, #22c55e);
  }

  /* ============================================
     NOTIFICATION STYLES
     ============================================ */

  .notification-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem;
    background: var(--color-bg, #0f1115);
    border: 1px solid var(--color-border, #374151);
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .notification-item:hover {
    background: var(--color-bg-hover, #1f2937);
  }

  .notification-item__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 0.375rem;
    flex-shrink: 0;
  }

  .notification-item--success .notification-item__dot {
    background: var(--color-success, #22c55e);
  }

  .notification-item--warning .notification-item__dot {
    background: var(--color-warning, #f59e0b);
  }

  .notification-item--error .notification-item__dot {
    background: var(--color-danger, #ef4444);
  }

  .notification-item__content {
    flex: 1;
    min-width: 0;
  }

  .notification-item__title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text, #ffffff);
  }

  .notification-item__desc {
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
  }

  /* ============================================
     USER STYLES
     ============================================ */

  .user-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    text-align: center;
  }

  .user-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    font-size: 1.5rem;
    background: var(--color-bg, #0f1115);
    border: 2px solid var(--color-border, #374151);
    border-radius: 50%;
  }

  .user-avatar--lg {
    width: 64px;
    height: 64px;
    font-size: 2rem;
  }

  .user-name {
    font-size: 1rem;
    font-weight: 500;
  }

  .user-email {
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
  }

  .user-actions {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .user-logout {
    padding-top: 1rem;
    border-top: 1px solid var(--color-border, #374151);
  }

  .avatar-config {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  /* ============================================
     BUTTON STYLES
     ============================================ */

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: var(--radius-md, 8px);
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn--sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
  }

  .btn--block {
    width: 100%;
  }

  .btn--primary {
    background: var(--color-primary, #3b82f6);
    color: white;
  }

  .btn--primary:hover {
    background: var(--color-primary-hover, #2563eb);
  }

  .btn--secondary {
    background: var(--color-bg-elevated, #1f2937);
    border-color: var(--color-border, #374151);
    color: var(--color-text, #ffffff);
  }

  .btn--secondary:hover {
    background: var(--color-bg-hover, #374151);
  }

  .btn--danger {
    background: var(--color-danger, #ef4444);
    color: white;
  }

  .btn--danger:hover {
    background: rgb(239 68 68 / 0.8);
  }

  .btn--warning {
    background: var(--color-warning, #f59e0b);
    color: black;
  }

  .btn--info {
    background: var(--color-info, #0ea5e9);
    color: white;
  }

  .btn--ghost {
    background: transparent;
    color: var(--color-text-muted, #9ca3af);
  }

  .btn--ghost:hover {
    color: var(--color-text, #ffffff);
    background: var(--color-bg-hover, #1f2937);
  }

  /* ============================================
     RESPONSIVE
     ============================================ */

  @media (max-width: 768px) {
    .ecosystem-toolbar {
      --_padding: 0.375rem;
    }
  }
</style>
