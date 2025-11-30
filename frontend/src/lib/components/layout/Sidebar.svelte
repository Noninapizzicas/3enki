<script lang="ts">
  import { page } from '$app/stores';
  import { uiModules, mqttState } from '$stores';
  import Badge from '$components/ui/Badge.svelte';

  export let collapsed = false;

  // Navigation items
  const navItems = [
    { href: '/', label: 'Dashboard', icon: '📊' },
    { href: '/modules', label: 'Módulos', icon: '📦' },
    { href: '/events', label: 'Eventos', icon: '⚡' },
    { href: '/settings', label: 'Configuración', icon: '⚙️' }
  ];

  function toggleCollapse() {
    collapsed = !collapsed;
  }
</script>

<aside
  class="fixed left-0 top-0 h-screen bg-bg-card border-r border-border flex flex-col transition-all duration-normal z-dropdown"
  class:w-sidebar={!collapsed}
  class:w-sidebar-collapsed={collapsed}
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
            class:justify-center={collapsed}
            title={collapsed ? item.label : undefined}
          >
            <span class="text-lg">{item.icon}</span>
            {#if !collapsed}
              <span>{item.label}</span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>

    <!-- Modules Section -->
    {#if $uiModules.length > 0}
      <div class="mt-6 px-2">
        {#if !collapsed}
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
                class:justify-center={collapsed}
                title={collapsed ? mod.ui?.title || mod.name : undefined}
              >
                <span class="text-lg">{mod.ui?.icon || '📦'}</span>
                {#if !collapsed}
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
