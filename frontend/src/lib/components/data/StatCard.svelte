<script lang="ts">
  export let title: string;
  export let value: string | number;
  export let change: number | undefined = undefined;
  export let icon = '';
  export let trend: 'up' | 'down' | 'neutral' = 'neutral';

  $: trendColor = {
    up: 'text-success',
    down: 'text-danger',
    neutral: 'text-text-muted'
  }[trend];

  $: trendIcon = {
    up: '↑',
    down: '↓',
    neutral: '→'
  }[trend];
</script>

<div class="bg-bg-card border border-border rounded-lg p-4">
  <div class="flex items-start justify-between">
    <div>
      <p class="text-sm text-text-muted">{title}</p>
      <p class="text-2xl font-semibold mt-1">{value}</p>
      {#if change !== undefined}
        <p class="text-sm mt-2 {trendColor}">
          <span>{trendIcon}</span>
          <span>{change > 0 ? '+' : ''}{change}%</span>
        </p>
      {/if}
    </div>
    {#if icon}
      <span class="text-2xl">{icon}</span>
    {/if}
  </div>
</div>
