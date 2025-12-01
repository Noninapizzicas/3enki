<script lang="ts">
  import { page } from '$app/stores';
  import { uiModules, mqttState } from '$stores';
  import Badge from '$components/ui/Badge.svelte';
  import { createEventDispatcher, onMount } from 'svelte';

  export let collapsed = false;
  export let mobileOpen = false;

  const dispatch = createEventDispatcher();

  // Navigation items
  const navItems = [
    { href: '/', label: 'Dashboard', icon: '📊' },
    { href: '/workspace', label: 'Workspace', icon: '🖥️' },
    { href: '/modules', label: 'Módulos', icon: '📦' },
    { href: '/blueprints', label: 'Blueprints', icon: '🏗️' },
    { href: '/credenciales', label: 'Credenciales', icon: '🔐' },
    { href: '/menu-generator', label: 'Menu Generator', icon: '📄' },
    { href: '/notas', label: 'Notas', icon: '📝' },
    { href: '/events', label: 'Eventos', icon: '⚡' }
  ];

  let isMobile = false;

  onMount(() => {
    const checkMobile = () => {
      isMobile = window.innerWidth < 768;
      if (isMobile) {
        collapsed = true;
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  });

  function toggleCollapse() {
    if (isMobile) {
      mobileOpen = !mobileOpen;
      dispatch('mobileToggle', mobileOpen);
    } else {
      collapsed = !collapsed;
    }
  }

  function closeMobile() {
    if (isMobile) {
      mobileOpen = false;
      dispatch('mobileToggle', false);
    }
  }
</script>

<!-- Mobile overlay -->
{#if isMobile && mobileOpen}
  <button
    class="fixed inset-0 bg-black bg-opacity-50 z-[99] md:hidden"
    on:click={closeMobile}
    aria-label="Cerrar menú"
  />
{/if}

<aside
  class="fixed left-0 top-0 h-screen bg-bg-card border-r border-border flex flex-col transition-all duration-normal z-dropdown"
  class:w-sidebar={!collapsed && (!isMobile || mobileOpen)}
  class:w-sidebar-collapsed={collapsed && !isMobile}
  class:translate-x-0={!isMobile || mobileOpen}
  class:-translate-x-full={isMobile && !mobileOpen}
  class:md:translate-x-0={true}
>
  <!-- Header -->
  <div class="flex items-center justify-between p-4 border-b border-border">
    {#if !collapsed}
      <div class="flex items-center gap-2">
        <span class="text-2xl">⚡</span>
        <span class="font-bold text-lg">Event-Core</span>
      </div>
    {:else}
      <span class="text-2xl mx-auto">⚡</span>
    {/if}
    <button
      class="p-1 hover:bg-bg-hover rounded transition-colors"
      on:click={toggleCollapse}
      title={collapsed ? 'Expandir' : 'Colapsar'}
    >
      {collapsed ? '→' : '←'}
    </button>
  </div>

  <!-- Connection Status -->
  <div class="px-4 py-2 border-b border-border">
    <div class="flex items-center gap-2">
      <div
        class="w-2 h-2 rounded-full"
        class:bg-success={$mqttState.connected}
        class:bg-danger={!$mqttState.connected}
      ></div>
      {#if !collapsed}
        <span class="text-sm text-text-muted">
          {$mqttState.connected ? 'Conectado' : 'Desconectado'}
        </span>
      {/if}
    </div>
  </div>

  <!-- Navigation -->
  <nav class="flex-1 py-4 overflow-y-auto">
    <ul class="space-y-1 px-2">
      {#each navItems as item}
        <li>
          <a
            href={item.href}
            class="flex items-center gap-3 px-3 py-2 rounded-md transition-colors"
            class:bg-primary={$page.url.pathname === item.href}
            class:text-white={$page.url.pathname === item.href}
            class:hover:bg-bg-hover={$page.url.pathname !== item.href}
            class:justify-center={collapsed && !isMobile}
            title={collapsed ? item.label : undefined}
            on:click={closeMobile}
          >
            <span class="text-lg">{item.icon}</span>
            {#if !collapsed || isMobile}
              <span>{item.label}</span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>

    <!-- Modules Section -->
    {#if $uiModules.length > 0}
      <div class="mt-6 px-2">
        {#if !collapsed || isMobile}
          <h3 class="px-3 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
            Módulos
          </h3>
        {/if}
        <ul class="space-y-1">
          {#each $uiModules as mod}
            <li>
              <a
                href="/modules/{mod.name}"
                class="flex items-center gap-3 px-3 py-2 rounded-md transition-colors"
                class:bg-primary={$page.url.pathname === `/modules/${mod.name}`}
                class:text-white={$page.url.pathname === `/modules/${mod.name}`}
                class:hover:bg-bg-hover={$page.url.pathname !== `/modules/${mod.name}`}
                class:justify-center={collapsed && !isMobile}
                title={collapsed ? mod.ui?.title || mod.name : undefined}
                on:click={closeMobile}
              >
                <span class="text-lg">{mod.ui?.icon || '📦'}</span>
                {#if !collapsed || isMobile}
                  <span class="truncate">{mod.ui?.title || mod.name}</span>
                {/if}
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </nav>

  <!-- Footer -->
  <div class="p-4 border-t border-border">
    {#if !collapsed}
      <div class="flex items-center justify-between text-sm text-text-muted">
        <span>v0.2.0</span>
        <Badge variant="success" size="sm">Svelte</Badge>
      </div>
    {/if}
  </div>
</aside>
