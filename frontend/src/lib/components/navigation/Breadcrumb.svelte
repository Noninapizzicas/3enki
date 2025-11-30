<script lang="ts">
  type BreadcrumbItem = {
    label: string;
    href?: string;
    icon?: string;
  };

  export let items: BreadcrumbItem[] = [];
  export let separator = '/';
</script>

<nav aria-label="Breadcrumb">
  <ol class="flex items-center gap-2 text-sm">
    {#each items as item, index (index)}
      <li class="flex items-center gap-2">
        {#if index > 0}
          <span class="text-text-muted">{separator}</span>
        {/if}

        {#if item.href && index < items.length - 1}
          <a
            href={item.href}
            class="flex items-center gap-1 text-text-muted hover:text-text transition-colors"
          >
            {#if item.icon}
              <span>{item.icon}</span>
            {/if}
            {item.label}
          </a>
        {:else}
          <span
            class="flex items-center gap-1"
            class:text-text={index === items.length - 1}
            class:text-text-muted={index !== items.length - 1}
            class:font-medium={index === items.length - 1}
            aria-current={index === items.length - 1 ? 'page' : undefined}
          >
            {#if item.icon}
              <span>{item.icon}</span>
            {/if}
            {item.label}
          </span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
