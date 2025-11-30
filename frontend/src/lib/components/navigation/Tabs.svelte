<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  type Tab = {
    id: string;
    label: string;
    icon?: string;
    disabled?: boolean;
    badge?: string | number;
  };

  export let tabs: Tab[] = [];
  export let activeTab: string = tabs[0]?.id ?? '';
  export let variant: 'default' | 'pills' | 'underline' = 'default';
  export let fullWidth = false;

  const dispatch = createEventDispatcher<{
    change: string;
  }>();

  function selectTab(tab: Tab) {
    if (tab.disabled) return;
    activeTab = tab.id;
    dispatch('change', activeTab);
  }

  const variantClasses = {
    default: {
      container: 'border-b border-border',
      tab: 'px-4 py-2 -mb-px border-b-2 border-transparent',
      active: 'border-primary text-primary',
      inactive: 'text-text-muted hover:text-text hover:border-border'
    },
    pills: {
      container: 'bg-bg-card p-1 rounded-lg',
      tab: 'px-4 py-2 rounded-md',
      active: 'bg-primary text-white',
      inactive: 'text-text-muted hover:text-text hover:bg-bg-hover'
    },
    underline: {
      container: '',
      tab: 'px-4 py-2 border-b-2 border-transparent',
      active: 'border-primary text-primary',
      inactive: 'text-text-muted hover:text-text'
    }
  };

  $: classes = variantClasses[variant];
</script>

<div class="flex {classes.container}" class:w-full={fullWidth} role="tablist">
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === tab.id}
      aria-disabled={tab.disabled}
      class="flex items-center gap-2 font-medium transition-colors {classes.tab} {activeTab === tab.id ? classes.active : classes.inactive}"
      class:flex-1={fullWidth}
      class:opacity-50={tab.disabled}
      class:cursor-not-allowed={tab.disabled}
      class:cursor-pointer={!tab.disabled}
      disabled={tab.disabled}
      on:click={() => selectTab(tab)}
    >
      {#if tab.icon}
        <span>{tab.icon}</span>
      {/if}
      <span>{tab.label}</span>
      {#if tab.badge !== undefined}
        <span class="px-1.5 py-0.5 text-xs rounded-full bg-primary bg-opacity-20 text-primary">
          {tab.badge}
        </span>
      {/if}
    </button>
  {/each}
</div>

<div class="mt-4" role="tabpanel">
  <slot {activeTab} />
</div>
