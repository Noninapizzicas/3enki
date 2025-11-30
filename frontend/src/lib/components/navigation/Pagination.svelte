<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Button from '$components/ui/Button.svelte';

  export let currentPage = 1;
  export let totalPages = 1;
  export let totalItems = 0;
  export let pageSize = 10;
  export let siblingCount = 1;
  export let showInfo = true;

  const dispatch = createEventDispatcher<{
    change: number;
  }>();

  function goToPage(page: number) {
    if (page < 1 || page > totalPages || page === currentPage) return;
    currentPage = page;
    dispatch('change', currentPage);
  }

  function generatePageNumbers(): (number | 'ellipsis')[] {
    const pages: (number | 'ellipsis')[] = [];

    // Always show first page
    pages.push(1);

    // Calculate range around current page
    const leftSibling = Math.max(2, currentPage - siblingCount);
    const rightSibling = Math.min(totalPages - 1, currentPage + siblingCount);

    // Add left ellipsis
    if (leftSibling > 2) {
      pages.push('ellipsis');
    }

    // Add pages around current
    for (let i = leftSibling; i <= rightSibling; i++) {
      if (i !== 1 && i !== totalPages) {
        pages.push(i);
      }
    }

    // Add right ellipsis
    if (rightSibling < totalPages - 1) {
      pages.push('ellipsis');
    }

    // Always show last page
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  }

  $: pages = generatePageNumbers();
  $: startItem = (currentPage - 1) * pageSize + 1;
  $: endItem = Math.min(currentPage * pageSize, totalItems);
</script>

<div class="flex items-center justify-between gap-4 flex-wrap">
  {#if showInfo && totalItems > 0}
    <p class="text-sm text-text-muted">
      Mostrando {startItem} - {endItem} de {totalItems}
    </p>
  {:else}
    <div></div>
  {/if}

  <nav class="flex items-center gap-1" aria-label="Pagination">
    <!-- Previous button -->
    <Button
      variant="ghost"
      size="sm"
      disabled={currentPage === 1}
      on:click={() => goToPage(currentPage - 1)}
      aria-label="Página anterior"
    >
      ←
    </Button>

    <!-- Page numbers -->
    {#each pages as page, index (index)}
      {#if page === 'ellipsis'}
        <span class="px-2 text-text-muted">...</span>
      {:else}
        <Button
          variant={page === currentPage ? 'primary' : 'ghost'}
          size="sm"
          on:click={() => goToPage(page)}
          aria-label="Página {page}"
          aria-current={page === currentPage ? 'page' : undefined}
        >
          {page}
        </Button>
      {/if}
    {/each}

    <!-- Next button -->
    <Button
      variant="ghost"
      size="sm"
      disabled={currentPage === totalPages}
      on:click={() => goToPage(currentPage + 1)}
      aria-label="Página siguiente"
    >
      →
    </Button>
  </nav>
</div>
