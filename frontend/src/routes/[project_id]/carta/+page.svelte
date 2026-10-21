<script lang="ts">
  /**
   * Carta Digital — Carta del cliente
   *
   * Scoped por proyecto: /{project_id}/carta
   * El cliente ve la carta, personaliza productos y pide por WhatsApp.
   */
  import { page } from '$app/stores';
  import { activeProjectId } from '$lib/stores/projects';
  import CartaScreen from '$lib/components/carta/CartaScreen.svelte';

  $: urlProjectId = $page.params.project_id;
  $: projectId = $activeProjectId || urlProjectId;
</script>

<svelte:head>
  <title>Carta - Pizzicas</title>
  <meta name="theme-color" content="#0a0a0a" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>

<CartaScreen {projectId} />
