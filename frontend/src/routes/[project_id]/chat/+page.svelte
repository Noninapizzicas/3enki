<script lang="ts">
  /**
   * /{project_id}/chat — Chat principal del proyecto
   *
   * Ruta project-scoped. El project_id viene de la URL
   * y se sincroniza con el store en el layout padre.
   *
   * Page Context: inyecta contexto general del proyecto para que la IA
   * sepa que el usuario está en el chat principal y tiene acceso a todas
   * las herramientas disponibles.
   */
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { LazyShell } from '$lib/components/layout';
  import { setPageContext, clearPageContext } from '$lib/stores/page-context';

  $: project_id = $page.params.project_id;

  onMount(() => {
    setPageContext({
      route: '/chat',
      title: 'Chat',
      description: 'Chat principal del proyecto. Interfaz general para interactuar con la IA y usar cualquier herramienta disponible.',
      instructions: `El usuario está en el chat principal del proyecto "${project_id}". Desde aquí puede pedirte cualquier cosa relacionada con el proyecto.

No estás en una página específica de funcionalidad — el usuario puede preguntar sobre cualquier tema o usar cualquier tool disponible. Adapta tu respuesta al contexto de lo que pida.

Grupos de herramientas disponibles:
- **recetas**: crear, investigar, listar, buscar, duplicar, escandallo, resumen
- **menu**: generar carta, listar cartas, productos, categorías, precios, exportar
- **facturas**: procesar (OCR), listar, estadísticas
- **escandallo**: receta, global, comparar precios, simular, optimizar, ficha técnica
- **viabilidad**: estudio, punto de equilibrio, escenarios, proyección
- **fs**: leer, escribir, copiar, mover, buscar archivos del proyecto
- **db**: consultas SQL, listar tablas, esquemas
- **telegram**: enviar mensajes, fotos, documentos
- **pdf**: crear, listar, extraer
- **scheduler**: programar tareas
- **shell**: ejecutar comandos

Si el usuario no especifica qué quiere, pregúntale. Si menciona un área concreta (recetas, carta, facturas, etc.), usa las tools de ese grupo.`,
      state: {
        projectId: project_id
      }
    });
  });

  onDestroy(() => {
    clearPageContext();
  });
</script>

<svelte:head>
  <title>Chat</title>
</svelte:head>

<LazyShell />
