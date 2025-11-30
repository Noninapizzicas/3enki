<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Card from '$components/ui/Card.svelte';
  import Badge from '$components/ui/Badge.svelte';
  import Input from '$components/ui/Input.svelte';

  type Prompt = {
    id: string;
    name: string;
    description?: string;
    category?: string;
    template: string;
    variables?: string[];
    icon?: string;
  };

  export let prompts: Prompt[] = [];
  export let selectedPrompt: Prompt | null = null;
  export let searchable = true;
  export let grouped = true;

  const dispatch = createEventDispatcher<{
    select: Prompt;
  }>();

  let searchQuery = '';

  $: filteredPrompts = searchQuery
    ? prompts.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : prompts;

  $: categories = grouped
    ? [...new Set(filteredPrompts.map(p => p.category || 'General'))]
    : [];

  $: promptsByCategory = grouped
    ? categories.reduce((acc, cat) => {
        acc[cat] = filteredPrompts.filter(p => (p.category || 'General') === cat);
        return acc;
      }, {} as Record<string, Prompt[]>)
    : { all: filteredPrompts };

  function selectPrompt(prompt: Prompt) {
    selectedPrompt = prompt;
    dispatch('select', prompt);
  }
</script>

<div class="space-y-4">
  {#if searchable}
    <Input
      type="search"
      placeholder="Buscar prompts..."
      bind:value={searchQuery}
      size="sm"
    />
  {/if}

  {#if filteredPrompts.length === 0}
    <div class="text-center py-8 text-text-muted">
      <span class="text-3xl block mb-2">📝</span>
      <p>No se encontraron prompts</p>
    </div>
  {:else}
    <div class="space-y-6">
      {#each Object.entries(promptsByCategory) as [category, categoryPrompts]}
        <div>
          {#if grouped && category !== 'all'}
            <h3 class="text-sm font-medium text-text-muted mb-2">{category}</h3>
          {/if}

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each categoryPrompts as prompt (prompt.id)}
              <button
                type="button"
                class="text-left p-3 rounded-lg border transition-all {
                  selectedPrompt?.id === prompt.id
                    ? 'border-primary bg-primary bg-opacity-5'
                    : 'border-border hover:border-primary hover:border-opacity-50 hover:bg-bg-hover'
                }"
                on:click={() => selectPrompt(prompt)}
              >
                <div class="flex items-start gap-3">
                  {#if prompt.icon}
                    <span class="text-xl">{prompt.icon}</span>
                  {:else}
                    <span class="text-xl">📝</span>
                  {/if}
                  <div class="flex-1 min-w-0">
                    <h4 class="font-medium truncate">{prompt.name}</h4>
                    {#if prompt.description}
                      <p class="text-sm text-text-muted mt-0.5 line-clamp-2">
                        {prompt.description}
                      </p>
                    {/if}
                    {#if prompt.variables && prompt.variables.length > 0}
                      <div class="flex flex-wrap gap-1 mt-2">
                        {#each prompt.variables as variable}
                          <Badge variant="default" size="sm">{variable}</Badge>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
