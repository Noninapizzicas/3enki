<script lang="ts">
  import { onMount } from 'svelte';
  import { MobileWorkspaceLayout } from '$components/layout';
  import { Card, Button, Badge } from '$components/ui';
  import { Spinner } from '$components/feedback';
  import { StatCard } from '$components/data';
  import { FileDropZone } from '$components/input';
  import { subscribe, events } from '$stores/mqtt';
  import { toast } from '$stores/toast';
  import config from '$lib/config';

  // Types
  interface Menu {
    id: string;
    estado: 'generando' | 'generado' | 'validado' | 'error';
    productos_count: number;
    categorias_count: number;
    created_at: string;
    file_name?: string;
  }

  interface Conversation {
    id: string;
    title?: string;
    status: 'active' | 'completed' | 'archived';
    created_at: string;
    messages_count: number;
  }

  interface Template {
    id: string;
    name: string;
    emoji: string;
    description: string;
    categories: string[];
  }

  interface Credential {
    key: string;
    provider: string;
    level: 'GLOBAL' | 'PROJECT' | 'CLIENT' | 'CUSTOM';
    identifier: string | null;
    api_key_preview: string;
  }

  // Form state for credentials
  interface CredentialForm {
    provider: string;
    level: string;
    identifier: string;
    api_key: string;
  }

  interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    provider?: string;
    model?: string;
    loading?: boolean;
  }

  interface AIModel {
    id: string;
    name: string;
    provider: string;
    description?: string;
  }

  interface Tool {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    category: string;
  }

  interface Plugin {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    version: string;
  }

  interface ContextItem {
    type: string;
    label: string;
    value: string;
    active: boolean;
  }

  // State
  let menus: Menu[] = [];
  let conversations: Conversation[] = [];
  let templates: Template[] = [];
  let credentials: Credential[] = [];
  let chatMessages: ChatMessage[] = [];
  let loading = true;
  let chatLoading = false;

  // AI Models state
  let availableModels: AIModel[] = [
    { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DEEPSEEK', description: 'Modelo rápido y económico' },
    { id: 'deepseek-coder', name: 'DeepSeek Coder', provider: 'DEEPSEEK', description: 'Optimizado para código' },
    { id: 'gpt-4', name: 'GPT-4', provider: 'OPENAI', description: 'Modelo más capaz de OpenAI' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OPENAI', description: 'Rápido y económico' },
    { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'ANTHROPIC', description: 'Modelo más capaz de Anthropic' },
    { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'ANTHROPIC', description: 'Balance calidad/velocidad' },
    { id: 'llama3', name: 'Llama 3', provider: 'OLLAMA', description: 'Modelo local open source' }
  ];
  let selectedModelId: string = 'deepseek-chat';

  // Tools state
  let availableTools: Tool[] = [
    { id: 'menu-parser', name: 'Parser de Menús', description: 'Extrae estructura de cartas', enabled: true, category: 'menu' },
    { id: 'image-ocr', name: 'OCR de Imágenes', description: 'Lee texto de imágenes', enabled: true, category: 'ai' },
    { id: 'price-extractor', name: 'Extractor de Precios', description: 'Detecta precios automáticamente', enabled: true, category: 'menu' },
    { id: 'allergen-detector', name: 'Detector de Alérgenos', description: 'Identifica alérgenos', enabled: false, category: 'menu' },
    { id: 'json-exporter', name: 'Exportador JSON', description: 'Genera JSON estructurado', enabled: true, category: 'export' },
    { id: 'csv-exporter', name: 'Exportador CSV', description: 'Genera hojas de cálculo', enabled: true, category: 'export' }
  ];

  // Plugins state
  let availablePlugins: Plugin[] = [
    { id: 'menu-validator', name: 'Validador de Menús', description: 'Verifica estructura correcta', enabled: true, version: '1.0.0' },
    { id: 'price-formatter', name: 'Formateador de Precios', description: 'Formatea precios según moneda', enabled: true, version: '1.0.0' },
    { id: 'translation', name: 'Traductor', description: 'Traduce menús a otros idiomas', enabled: false, version: '0.9.0' }
  ];

  // Context state
  let contextItems: ContextItem[] = [
    { type: 'menu', label: 'Menú actual', value: '', active: false },
    { type: 'template', label: 'Plantilla', value: '', active: false },
    { type: 'style', label: 'Estilo', value: 'Restaurante', active: true },
    { type: 'language', label: 'Idioma', value: 'Español', active: true }
  ];

  // Modules state
  interface ModuleInfo {
    id: string;
    name: string;
    description: string;
    icon: string;
    status: 'active' | 'inactive' | 'error';
    path: string;
  }
  let modules: ModuleInfo[] = [
    { id: 'menu-generator', name: 'Menu Generator', description: 'Generador de menús con IA', icon: '🍽️', status: 'active', path: '/menu-generator' },
    { id: 'credential-manager', name: 'Credential Manager', description: 'Gestión de API keys', icon: '🔐', status: 'active', path: '/credentials' },
    { id: 'ai-gateway', name: 'AI Gateway', description: 'Pasarela IA multi-proveedor', icon: '🤖', status: 'active', path: '/ai-gateway' },
    { id: 'prompt-manager', name: 'Prompt Manager', description: 'Gestión de prompts', icon: '📝', status: 'active', path: '/prompts' },
    { id: 'tool-orchestrator', name: 'Tool Orchestrator', description: 'Orquestador de herramientas', icon: '🔧', status: 'active', path: '/tools' },
    { id: 'plugin-manager', name: 'Plugin Manager', description: 'Gestión de plugins', icon: '🔌', status: 'active', path: '/plugins' }
  ];

  // Quick prompts state
  interface QuickPrompt {
    id: string;
    name: string;
    content: string;
    category: string;
    favorite: boolean;
  }
  let quickPrompts: QuickPrompt[] = [
    { id: 'p1', name: 'Menú italiano', content: 'Genera un menú italiano con antipasti, primi, secondi y dolci', category: 'restaurant', favorite: true },
    { id: 'p2', name: 'Menú cafetería', content: 'Crea un menú de cafetería con desayunos, brunch y meriendas', category: 'cafe', favorite: true },
    { id: 'p3', name: 'Tapas españolas', content: 'Diseña un menú de tapas españolas tradicionales', category: 'restaurant', favorite: false },
    { id: 'p4', name: 'Añadir alérgenos', content: 'Añade la información de alérgenos a todos los platos del menú', category: 'enhancement', favorite: false },
    { id: 'p5', name: 'Añadir precios', content: 'Incluye precios orientativos para cada plato del menú', category: 'enhancement', favorite: true }
  ];

  // Filters state
  let menuFilters = {
    estado: '',
    periodo: 'all'
  };

  // Current panel content
  let currentPanel = '';
  let selectedMenu: Menu | null = null;
  let selectedCredential: Credential | null = null;

  // Credential form state
  let credentialForm: CredentialForm = {
    provider: 'DEEPSEEK',
    level: 'GLOBAL',
    identifier: '',
    api_key: ''
  };
  let editApiKey = '';

  // Upload
  let uploadFiles: { file: File; id: string; progress: number; status: string }[] = [];

  // API
  const apiBase = `${config.apiUrl}/modules/menu-generator`;
  const credentialsApi = `${config.apiUrl}/modules/credential-manager`;
  const aiGatewayApi = `${config.apiUrl}/modules/ai-gateway`;

  // ===========================================
  // Button Configuration
  // ===========================================

  // ===========================================
  // BARRA SUPERIOR - Acciones del módulo Menu Generator
  // ===========================================
  const topButtons = [
    {
      id: 'menus',
      emoji: '🍽️',
      label: 'Menús',
      badge: 0,
      badgeColor: 'primary' as const,
      primaryAction: { type: 'panel' as const, panelId: 'menus', label: 'Ver menús' },
      secondaryAction: { type: 'panel' as const, panelId: 'upload', label: 'Subir carta' },
      tertiaryAction: { type: 'panel' as const, panelId: 'menus-gestionar', label: 'Gestionar menús' }
    },
    {
      id: 'templates',
      emoji: '📋',
      label: 'Plantillas',
      badge: 0,
      badgeColor: 'info' as const,
      primaryAction: { type: 'panel' as const, panelId: 'templates', label: 'Ver plantillas' },
      secondaryAction: { type: 'panel' as const, panelId: 'template-aplicar', label: 'Aplicar plantilla' }
    },
    {
      id: 'filtros',
      emoji: '🔍',
      label: 'Filtros',
      primaryAction: { type: 'panel' as const, panelId: 'filtros', label: 'Filtrar menús' }
    },
    {
      id: 'stats',
      emoji: '📊',
      label: 'Stats',
      primaryAction: { type: 'panel' as const, panelId: 'stats', label: 'Estadísticas' },
      tertiaryAction: { type: 'panel' as const, panelId: 'stats-detallado', label: 'Métricas detalladas' }
    },
    {
      id: 'export',
      emoji: '⬇️',
      label: 'Exportar',
      variant: 'success' as const,
      primaryAction: { type: 'panel' as const, panelId: 'export', label: 'Exportar menú' },
      tertiaryAction: { type: 'panel' as const, panelId: 'export-lote', label: 'Exportar varios' }
    }
  ];

  // ===========================================
  // BARRA INFERIOR - Acciones secundarias
  // ===========================================
  const bottomButtons = [
    {
      id: 'historial',
      emoji: '🕐',
      label: 'Historial',
      primaryAction: { type: 'panel' as const, panelId: 'history', label: 'Ver historial' }
    }
  ];

  // ===========================================
  // BARRA LATERAL - Ecosistema
  // ===========================================
  const sideButtons = [
    {
      id: 'home',
      emoji: '🏠',
      primaryAction: { type: 'navigate' as const, target: '/', label: 'Inicio' }
    },
    {
      id: 'modulos',
      emoji: '🧩',
      primaryAction: { type: 'panel' as const, panelId: 'modulos', label: 'Módulos' },
      tertiaryAction: { type: 'panel' as const, panelId: 'modulos-gestionar', label: 'Gestionar módulos' }
    },
    {
      id: 'credentials',
      emoji: '🔐',
      badge: 0,
      badgeColor: 'warning' as const,
      primaryAction: { type: 'panel' as const, panelId: 'credentials', label: 'Ver credenciales' },
      secondaryAction: { type: 'panel' as const, panelId: 'credential-add', label: 'Añadir credencial' },
      tertiaryAction: { type: 'panel' as const, panelId: 'credential-edit', label: 'Gestionar credenciales' }
    },
    {
      id: 'settings',
      emoji: '⚙️',
      primaryAction: { type: 'panel' as const, panelId: 'settings', label: 'Configuración' },
      tertiaryAction: { type: 'panel' as const, panelId: 'settings-full', label: 'Configuración avanzada' }
    },
    {
      id: 'help',
      emoji: '❓',
      primaryAction: { type: 'panel' as const, panelId: 'help', label: 'Ayuda' }
    }
  ];

  // ===========================================
  // SUB-BARRA CHAT SUPERIOR - Prepara el mensaje
  // ===========================================
  let currentModel = 'DeepSeek';
  let currentCredentialPreview = 'sk-...abc';

  const chatTopButtons = [
    {
      id: 'modelo',
      emoji: '🤖',
      label: 'Modelo',
      displayValue: currentModel,
      primaryAction: { type: 'panel' as const, panelId: 'modelo-selector', label: 'Seleccionar modelo' },
      secondaryAction: { type: 'panel' as const, panelId: 'modelo-config', label: 'Configurar modelo' },
      tertiaryAction: { type: 'panel' as const, panelId: 'modelos-gestionar', label: 'Gestionar modelos' }
    },
    {
      id: 'credencial',
      emoji: '🔑',
      label: 'API Key',
      displayValue: currentCredentialPreview,
      variant: credentials.length > 0 ? 'success' as const : 'warning' as const,
      primaryAction: { type: 'panel' as const, panelId: 'credencial-selector', label: 'Seleccionar API Key' },
      secondaryAction: { type: 'panel' as const, panelId: 'credential-add', label: 'Nueva API Key' },
      tertiaryAction: { type: 'panel' as const, panelId: 'credentials', label: 'Gestionar API Keys' }
    },
    {
      id: 'prompt',
      emoji: '📝',
      label: 'Prompt',
      primaryAction: { type: 'panel' as const, panelId: 'prompts', label: 'Prompts rápidos' },
      secondaryAction: { type: 'panel' as const, panelId: 'prompt-crear', label: 'Nuevo prompt' },
      tertiaryAction: { type: 'panel' as const, panelId: 'prompts-gestionar', label: 'Gestionar prompts' }
    },
    {
      id: 'historial-chat',
      emoji: '💬',
      label: 'Chats',
      badge: 0,
      badgeColor: 'info' as const,
      primaryAction: { type: 'panel' as const, panelId: 'conversations', label: 'Conversaciones' },
      secondaryAction: { type: 'emit' as const, label: 'Nueva conversación' },
      tertiaryAction: { type: 'panel' as const, panelId: 'historial-gestionar', label: 'Gestionar historial' }
    }
  ];

  // ===========================================
  // SUB-BARRA CHAT INFERIOR - Complementa el mensaje
  // ===========================================
  const chatBottomButtons = [
    {
      id: 'tools',
      emoji: '🔧',
      label: 'Tools',
      badge: 0,
      primaryAction: { type: 'panel' as const, panelId: 'tools', label: 'Herramientas' },
      tertiaryAction: { type: 'panel' as const, panelId: 'tools-config', label: 'Configurar tools' }
    },
    {
      id: 'adjuntar',
      emoji: '📎',
      label: 'Adjuntar',
      variant: 'primary' as const,
      primaryAction: { type: 'panel' as const, panelId: 'upload', label: 'Subir carta' },
      secondaryAction: { type: 'emit' as const, label: 'Abrir cámara' }
    },
    {
      id: 'contexto',
      emoji: '📋',
      label: 'Contexto',
      indicator: false,
      primaryAction: { type: 'panel' as const, panelId: 'contexto', label: 'Ver contexto' },
      secondaryAction: { type: 'panel' as const, panelId: 'contexto-editar', label: 'Editar contexto' },
      tertiaryAction: { type: 'panel' as const, panelId: 'contexto-gestionar', label: 'Gestionar contextos' }
    },
    {
      id: 'plugins',
      emoji: '🔌',
      label: 'Plugins',
      badge: 0,
      primaryAction: { type: 'panel' as const, panelId: 'plugins', label: 'Plugins activos' },
      tertiaryAction: { type: 'panel' as const, panelId: 'plugins-gestionar', label: 'Gestionar plugins' }
    }
  ];

  const panels = {
    // Barra superior
    'menus': { title: 'Menús Generados', size: 'lg' as const },
    'menus-gestionar': { title: 'Gestionar Menús', size: 'full' as const },
    'menu-detail': { title: 'Detalle del Menú', size: 'full' as const },
    'templates': { title: 'Plantillas', size: 'lg' as const },
    'template-aplicar': { title: 'Aplicar Plantilla', size: 'md' as const },
    'filtros': { title: 'Filtrar Menús', size: 'sm' as const },
    'stats': { title: 'Estadísticas', size: 'md' as const },
    'stats-detallado': { title: 'Métricas Detalladas', size: 'full' as const },
    'export': { title: 'Exportar Menú', size: 'sm' as const },
    'export-lote': { title: 'Exportar Varios', size: 'md' as const },
    'upload': { title: 'Subir Carta', size: 'md' as const },
    'history': { title: 'Historial', size: 'lg' as const },

    // Barra lateral (ecosistema)
    'modulos': { title: 'Módulos Event-Core', size: 'md' as const },
    'modulos-gestionar': { title: 'Gestionar Módulos', size: 'full' as const },
    'credentials': { title: 'Credenciales', size: 'lg' as const },
    'credential-add': { title: 'Nueva Credencial', size: 'md' as const },
    'credential-edit': { title: 'Editar Credencial', size: 'md' as const },
    'credencial-selector': { title: 'Seleccionar API Key', size: 'sm' as const },
    'settings': { title: 'Configuración', size: 'md' as const },
    'settings-full': { title: 'Configuración Avanzada', size: 'full' as const },
    'help': { title: 'Ayuda', size: 'md' as const },

    // Sub-barra chat superior
    'modelo-selector': { title: 'Seleccionar Modelo', size: 'sm' as const },
    'modelo-config': { title: 'Configurar Modelo', size: 'md' as const },
    'modelos-gestionar': { title: 'Gestionar Modelos', size: 'full' as const },
    'prompts': { title: 'Prompts Rápidos', size: 'md' as const },
    'prompt-crear': { title: 'Nuevo Prompt', size: 'md' as const },
    'prompts-gestionar': { title: 'Gestionar Prompts', size: 'full' as const },
    'conversations': { title: 'Conversaciones', size: 'lg' as const },
    'historial-gestionar': { title: 'Gestionar Historial', size: 'full' as const },

    // Sub-barra chat inferior
    'tools': { title: 'Herramientas', size: 'md' as const },
    'tools-config': { title: 'Configurar Tools', size: 'full' as const },
    'contexto': { title: 'Contexto Actual', size: 'md' as const },
    'contexto-editar': { title: 'Editar Contexto', size: 'md' as const },
    'contexto-gestionar': { title: 'Gestionar Contextos', size: 'full' as const },
    'plugins': { title: 'Plugins Activos', size: 'md' as const },
    'plugins-gestionar': { title: 'Gestionar Plugins', size: 'full' as const },

    // Legacy/otros
    'chat': { title: 'Chat con IA', size: 'lg' as const }
  };

  // ===========================================
  // API Functions
  // ===========================================

  async function fetchMenus() {
    try {
      const res = await fetch(`${apiBase}/menus`);
      if (!res.ok) return;
      const data = await res.json();
      menus = data.menus || [];
    } catch (err) {
      console.error('Error fetching menus:', err);
    }
  }

  async function fetchConversations() {
    try {
      const res = await fetch(`${apiBase}/conversations`);
      if (!res.ok) return;
      const data = await res.json();
      conversations = data.conversations || [];
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  }

  async function fetchTemplates() {
    try {
      const res = await fetch(`${apiBase}/templates`);
      if (!res.ok) return;
      const data = await res.json();
      templates = data.templates || [];
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  }

  async function fetchCredentials() {
    try {
      const res = await fetch(`${credentialsApi}/credentials`);
      if (!res.ok) return;
      const data = await res.json();
      credentials = data.credentials || [];
    } catch (err) {
      console.error('Error fetching credentials:', err);
    }
  }

  async function loadAll() {
    loading = true;
    await Promise.all([fetchMenus(), fetchConversations(), fetchTemplates(), fetchCredentials()]);
    loading = false;
  }

  // ===========================================
  // Actions
  // ===========================================

  async function handleFileDrop(event: CustomEvent<File[]>) {
    const files = event.detail;
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const base64 = await fileToBase64(file);
        const res = await fetch(`${apiBase}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_base64: base64,
            file_name: file.name,
            file_type: file.type
          })
        });

        if (!res.ok) throw new Error('Error al subir');
        const data = await res.json();
        toast.success(`Menú ${data.menu_id} en proceso`);
      } catch (err) {
        toast.error(`Error subiendo ${file.name}`);
      }
    }
    await fetchMenus();
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function validateMenu(menu: Menu) {
    try {
      const res = await fetch(`${apiBase}/menus/${menu.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error('Error al validar');
      toast.success('Menú validado');
      await fetchMenus();
    } catch (err) {
      toast.error('Error validando menú');
    }
  }

  async function exportMenu(menu: Menu, format: string) {
    try {
      const res = await fetch(`${apiBase}/menus/${menu.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format })
      });
      if (!res.ok) throw new Error('Error al exportar');
      const data = await res.json();

      const blob = new Blob([data.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `menu-${menu.id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exportado como ${format.toUpperCase()}`);
    } catch (err) {
      toast.error('Error exportando');
    }
  }

  async function saveCredential() {
    if (!credentialForm.api_key.trim()) {
      toast.error('La API Key es requerida');
      return;
    }

    // Validate identifier for non-GLOBAL levels
    if (credentialForm.level !== 'GLOBAL' && !credentialForm.identifier.trim()) {
      toast.error(`El nivel ${credentialForm.level} requiere un identificador`);
      return;
    }

    try {
      const res = await fetch(`${credentialsApi}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: credentialForm.provider,
          level: credentialForm.level,
          identifier: credentialForm.level === 'GLOBAL' ? null : credentialForm.identifier,
          api_key: credentialForm.api_key
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al guardar');
      }

      toast.success('Credencial guardada');

      // Reset form
      credentialForm = {
        provider: 'DEEPSEEK',
        level: 'GLOBAL',
        identifier: '',
        api_key: ''
      };

      // Close panel and refresh
      currentPanel = '';
      await fetchCredentials();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error guardando credencial');
    }
  }

  async function updateCredential() {
    if (!selectedCredential) return;

    if (!editApiKey.trim()) {
      toast.error('La API Key es requerida');
      return;
    }

    try {
      const res = await fetch(`${credentialsApi}/credentials/${encodeURIComponent(selectedCredential.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: editApiKey
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al actualizar');
      }

      toast.success('Credencial actualizada');

      // Reset and close
      editApiKey = '';
      selectedCredential = null;
      currentPanel = '';
      await fetchCredentials();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error actualizando credencial');
    }
  }

  async function deleteCredential(cred: Credential) {
    if (!confirm(`¿Eliminar credencial ${cred.key}?`)) return;
    try {
      const res = await fetch(`${credentialsApi}/credentials/${encodeURIComponent(cred.key)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Error');
      toast.success('Credencial eliminada');
      await fetchCredentials();
    } catch (err) {
      toast.error('Error eliminando credencial');
    }
  }

  // Model selection
  function selectModel(modelId: string) {
    selectedModelId = modelId;
    const model = availableModels.find(m => m.id === modelId);
    if (model) {
      currentModel = model.name;
      toast.success(`Modelo: ${model.name}`);
    }
    currentPanel = '';
  }

  // Credential selection for chat
  function selectCredentialForChat(cred: Credential) {
    currentCredentialPreview = cred.api_key_preview;
    toast.success(`API Key: ${cred.provider}`);
    currentPanel = '';
  }

  // Tool toggle
  function toggleTool(toolId: string) {
    availableTools = availableTools.map(t =>
      t.id === toolId ? { ...t, enabled: !t.enabled } : t
    );
  }

  // Plugin toggle
  function togglePlugin(pluginId: string) {
    availablePlugins = availablePlugins.map(p =>
      p.id === pluginId ? { ...p, enabled: !p.enabled } : p
    );
  }

  // Apply quick prompt
  function applyQuickPrompt(prompt: QuickPrompt) {
    // Dispatch event to chat input
    toast.info(`Prompt aplicado: ${prompt.name}`);
    currentPanel = '';
  }

  // Toggle prompt favorite
  function togglePromptFavorite(promptId: string) {
    quickPrompts = quickPrompts.map(p =>
      p.id === promptId ? { ...p, favorite: !p.favorite } : p
    );
  }

  // Apply filters
  function applyMenuFilters() {
    toast.info('Filtros aplicados');
    currentPanel = '';
    // Filter logic would be applied here
  }

  // Clear filters
  function clearMenuFilters() {
    menuFilters = { estado: '', periodo: 'all' };
    toast.info('Filtros limpiados');
  }

  // Navigate to module
  function navigateToModule(mod: ModuleInfo) {
    window.location.href = mod.path;
  }

  // ===========================================
  // Event Handlers
  // ===========================================

  function handleButtonAction(e: CustomEvent) {
    const { buttonId, actionType, action } = e.detail;
    console.log('Button action:', buttonId, actionType, action);
  }

  async function handleChatSubmit(e: CustomEvent) {
    const { message } = e.detail;

    if (!message.trim()) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    chatMessages = [...chatMessages, userMessage];

    // Add loading placeholder for assistant
    const assistantId = `msg-${Date.now() + 1}`;
    const loadingMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loading: true
    };
    chatMessages = [...chatMessages, loadingMessage];

    chatLoading = true;

    try {
      // Build messages for AI context
      const aiMessages = [
        {
          role: 'system',
          content: 'Eres un asistente experto en generación de menús para restaurantes. Ayudas a crear, organizar y optimizar menús gastronómicos. Responde de forma concisa y útil.'
        },
        // Include recent conversation context
        ...chatMessages
          .filter(m => !m.loading)
          .slice(-10) // Last 10 messages for context
          .map(m => ({ role: m.role, content: m.content }))
      ];

      const res = await fetch(`${aiGatewayApi}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: aiMessages,
          provider: 'auto', // Use automatic provider fallback
          max_tokens: 1000,
          temperature: 0.7
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${res.status}`);
      }

      const data = await res.json();

      // Update the loading message with actual response
      chatMessages = chatMessages.map(m =>
        m.id === assistantId
          ? {
              ...m,
              content: data.content || data.message || 'Sin respuesta',
              loading: false,
              provider: data.provider,
              model: data.model
            }
          : m
      );

    } catch (err) {
      console.error('Chat error:', err);

      // Update loading message to show error
      chatMessages = chatMessages.map(m =>
        m.id === assistantId
          ? {
              ...m,
              content: `❌ Error: ${err instanceof Error ? err.message : 'No se pudo conectar con la IA'}`,
              loading: false
            }
          : m
      );

      toast.error('Error al enviar mensaje');
    } finally {
      chatLoading = false;
    }
  }

  function handlePanelOpen(e: CustomEvent) {
    currentPanel = e.detail.panelId;
  }

  function handlePanelClose() {
    currentPanel = '';
    selectedMenu = null;
    selectedCredential = null;
  }

  function viewMenuDetail(menu: Menu) {
    selectedMenu = menu;
    currentPanel = 'menu-detail';
  }

  function editCredential(cred: Credential) {
    selectedCredential = cred;
    currentPanel = 'credential-edit';
  }

  // ===========================================
  // Reactive Updates
  // ===========================================

  // Update badges
  $: {
    const convButton = topButtons.find(b => b.id === 'conversations');
    if (convButton) convButton.badge = chatMessages.filter(m => !m.loading).length;

    const templatesButton = bottomButtons.find(b => b.id === 'templates');
    if (templatesButton) templatesButton.badge = templates.length;

    const menusButton = bottomButtons.find(b => b.id === 'menus');
    if (menusButton) menusButton.badge = menus.length;

    const credButton = sideButtons.find(b => b.id === 'credentials');
    if (credButton) credButton.badge = credentials.length;
  }

  // Stats
  $: totalMenus = menus.length;
  $: generandoCount = menus.filter(m => m.estado === 'generando').length;
  $: validadosCount = menus.filter(m => m.estado === 'validado').length;

  // MQTT updates
  $: {
    const lastEvent = $events[$events.length - 1];
    if (lastEvent) {
      if (lastEvent.type.includes('menu')) fetchMenus();
      if (lastEvent.type.includes('conversation')) fetchConversations();
      if (lastEvent.type.includes('credential')) fetchCredentials();
    }
  }

  // ===========================================
  // Helpers
  // ===========================================

  const estadoColors: Record<string, string> = {
    generando: 'warning',
    generado: 'info',
    validado: 'success',
    error: 'danger'
  };

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  onMount(() => {
    loadAll();
    subscribe([
      'core/+/events/menu/#',
      'core/+/events/menu-generator/#',
      'core/+/events/credential/#'
    ]);
  });
</script>

<svelte:head>
  <title>Menu Generator - Event-Core</title>
</svelte:head>

<MobileWorkspaceLayout
  title="Menu Generator"
  {topButtons}
  {bottomButtons}
  {sideButtons}
  {chatTopButtons}
  {chatBottomButtons}
  {panels}
  {currentPanel}
  showChat={true}
  showChatBars={true}
  chatPlaceholder="Describe el menú que quieres generar..."
  chatLoading={chatLoading}
  on:buttonAction={handleButtonAction}
  on:chatSubmit={handleChatSubmit}
  on:panelOpen={handlePanelOpen}
  on:panelClose={handlePanelClose}
>
  <!-- Main Content -->
  {#if loading}
    <div class="flex items-center justify-center h-full">
      <Spinner size="lg" />
    </div>
  {:else}
    <div class="space-y-4">
      <!-- Stats compactos -->
      <div class="grid grid-cols-3 gap-2">
        <div class="stat-mini">
          <span class="stat-mini__value">{totalMenus}</span>
          <span class="stat-mini__label">Menús</span>
        </div>
        <div class="stat-mini">
          <span class="stat-mini__value">{generandoCount}</span>
          <span class="stat-mini__label">Generando</span>
        </div>
        <div class="stat-mini">
          <span class="stat-mini__value">{validadosCount}</span>
          <span class="stat-mini__label">Validados</span>
        </div>
      </div>

      <!-- Quick info -->
      <Card padding="sm">
        <div class="text-center text-sm text-text-muted">
          <p class="mb-2">👆 <strong>Tap</strong> = Ver | 👆👆 <strong>Doble</strong> = Añadir | 👇 <strong>Hold</strong> = Editar</p>
          <p>Usa los botones de las barras para navegar</p>
        </div>
      </Card>

      <!-- Recent menus preview -->
      {#if menus.length > 0}
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-text-muted">Últimos menús</h3>
          {#each menus.slice(0, 3) as menu (menu.id)}
            <button
              class="w-full text-left p-3 bg-bg-card border border-border rounded-lg hover:bg-bg-hover transition-colors"
              on:click={() => viewMenuDetail(menu)}
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Badge variant={estadoColors[menu.estado]} size="sm">{menu.estado}</Badge>
                  <span class="text-sm font-mono">{menu.id.slice(-8)}</span>
                </div>
                <span class="text-xs text-text-muted">{menu.productos_count} prod.</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Panel Content -->
  <svelte:fragment slot="panel" let:panelId>
    <!-- Credentials Panel -->
    {#if panelId === 'credentials'}
      <div class="space-y-3">
        {#if credentials.length === 0}
          <p class="text-center text-text-muted py-4">No hay credenciales</p>
        {:else}
          {#each credentials as cred (cred.key)}
            <div class="flex items-center justify-between p-3 bg-bg-hover rounded-lg">
              <div class="flex items-center gap-3">
                <span class="text-xl">
                  {#if cred.provider === 'DEEPSEEK'}🔮
                  {:else if cred.provider === 'OPENAI'}🤖
                  {:else if cred.provider === 'ANTHROPIC'}🧠
                  {:else if cred.provider === 'OLLAMA'}🦙
                  {:else}🔑{/if}
                </span>
                <div>
                  <p class="font-medium text-sm">{cred.provider}</p>
                  <p class="text-xs text-text-muted">{cred.level}{cred.identifier ? ` • ${cred.identifier}` : ''}</p>
                  <p class="text-xs font-mono text-text-muted">{cred.api_key_preview}</p>
                </div>
              </div>
              <div class="flex gap-1">
                <button class="p-2 hover:bg-bg-card rounded" on:click={() => editCredential(cred)}>✏️</button>
                <button class="p-2 hover:bg-bg-card rounded text-danger" on:click={() => deleteCredential(cred)}>🗑️</button>
              </div>
            </div>
          {/each}
        {/if}
      </div>

    <!-- Credential Add Panel -->
    {:else if panelId === 'credential-add'}
      <form class="space-y-4" on:submit|preventDefault={saveCredential}>
        <div>
          <label class="block text-sm font-medium mb-1">Proveedor</label>
          <select bind:value={credentialForm.provider} class="w-full p-2 bg-bg-input border border-border rounded-lg">
            <option value="DEEPSEEK">🔮 DeepSeek</option>
            <option value="OPENAI">🤖 OpenAI</option>
            <option value="ANTHROPIC">🧠 Anthropic</option>
            <option value="OLLAMA">🦙 Ollama</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Nivel</label>
          <select bind:value={credentialForm.level} class="w-full p-2 bg-bg-input border border-border rounded-lg">
            <option value="GLOBAL">🌐 Global (sin identificador)</option>
            <option value="PROJECT">📁 Proyecto</option>
            <option value="CLIENT">👤 Cliente</option>
            <option value="CUSTOM">⚙️ Custom</option>
          </select>
        </div>
        {#if credentialForm.level !== 'GLOBAL'}
          <div>
            <label class="block text-sm font-medium mb-1">Identificador</label>
            <input
              type="text"
              bind:value={credentialForm.identifier}
              class="w-full p-2 bg-bg-input border border-border rounded-lg"
              placeholder="proyecto-1 o cliente-xyz"
            />
          </div>
        {/if}
        <div>
          <label class="block text-sm font-medium mb-1">API Key</label>
          <input
            type="password"
            bind:value={credentialForm.api_key}
            class="w-full p-2 bg-bg-input border border-border rounded-lg"
            placeholder="sk-..."
          />
        </div>
        <Button type="submit" variant="primary" class="w-full">💾 Guardar</Button>
      </form>

    <!-- Credential Edit Panel -->
    {:else if panelId === 'credential-edit' && selectedCredential}
      <form class="space-y-4" on:submit|preventDefault={updateCredential}>
        <div>
          <label class="block text-sm font-medium mb-1">Key</label>
          <input type="text" class="w-full p-2 bg-bg-input border border-border rounded-lg text-text-muted" value={selectedCredential.key} disabled />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Proveedor</label>
          <input type="text" class="w-full p-2 bg-bg-input border border-border rounded-lg text-text-muted" value={selectedCredential.provider} disabled />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Nivel</label>
          <input type="text" class="w-full p-2 bg-bg-input border border-border rounded-lg text-text-muted" value={selectedCredential.level} disabled />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Valor actual</label>
          <input type="text" class="w-full p-2 bg-bg-input border border-border rounded-lg text-text-muted" value={selectedCredential.api_key_preview} disabled />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Nueva API Key</label>
          <input
            type="password"
            bind:value={editApiKey}
            class="w-full p-2 bg-bg-input border border-border rounded-lg"
            placeholder="sk-... (nuevo valor)"
          />
        </div>
        <Button type="submit" variant="primary" class="w-full">💾 Actualizar</Button>
        <Button variant="danger" class="w-full" on:click={() => deleteCredential(selectedCredential)}>🗑️ Eliminar</Button>
      </form>

    <!-- Menus Panel -->
    {:else if panelId === 'menus'}
      <div class="space-y-3">
        {#if menus.length === 0}
          <p class="text-center text-text-muted py-4">No hay menús generados</p>
        {:else}
          {#each menus as menu (menu.id)}
            <button
              class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors"
              on:click={() => viewMenuDetail(menu)}
            >
              <div class="flex items-center justify-between mb-2">
                <Badge variant={estadoColors[menu.estado]}>{menu.estado}</Badge>
                <span class="text-xs text-text-muted">{formatDate(menu.created_at)}</span>
              </div>
              <p class="font-mono text-sm">{menu.id}</p>
              <div class="flex gap-4 mt-2 text-xs text-text-muted">
                <span>🍽️ {menu.productos_count}</span>
                <span>📁 {menu.categorias_count}</span>
              </div>
            </button>
          {/each}
        {/if}
      </div>

    <!-- Menu Detail Panel -->
    {:else if panelId === 'menu-detail' && selectedMenu}
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <span class="text-xs text-text-muted">Estado</span>
            <p><Badge variant={estadoColors[selectedMenu.estado]}>{selectedMenu.estado}</Badge></p>
          </div>
          <div>
            <span class="text-xs text-text-muted">Productos</span>
            <p class="font-medium">{selectedMenu.productos_count}</p>
          </div>
          <div>
            <span class="text-xs text-text-muted">Categorías</span>
            <p class="font-medium">{selectedMenu.categorias_count}</p>
          </div>
          <div>
            <span class="text-xs text-text-muted">Creado</span>
            <p class="text-sm">{formatDate(selectedMenu.created_at)}</p>
          </div>
        </div>

        <div class="flex gap-2">
          {#if selectedMenu.estado === 'generado'}
            <Button variant="success" class="flex-1" on:click={() => validateMenu(selectedMenu)}>✅ Validar</Button>
          {/if}
          <Button variant="secondary" class="flex-1" on:click={() => exportMenu(selectedMenu, 'json')}>📥 JSON</Button>
          <Button variant="secondary" class="flex-1" on:click={() => exportMenu(selectedMenu, 'csv')}>📊 CSV</Button>
        </div>
      </div>

    <!-- Templates Panel -->
    {:else if panelId === 'templates'}
      <div class="space-y-3">
        {#if templates.length === 0}
          <p class="text-center text-text-muted py-4">No hay plantillas</p>
        {:else}
          {#each templates as tpl (tpl.id)}
            <button class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors">
              <div class="flex items-start gap-3">
                <span class="text-2xl">{tpl.emoji}</span>
                <div>
                  <p class="font-medium">{tpl.name}</p>
                  <p class="text-xs text-text-muted">{tpl.description}</p>
                </div>
              </div>
            </button>
          {/each}
        {/if}
      </div>

    <!-- Upload Panel -->
    {:else if panelId === 'upload'}
      <div class="space-y-4">
        <p class="text-sm text-text-muted">Sube una imagen o PDF de la carta de menú:</p>
        <FileDropZone
          accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
          maxSize={20 * 1024 * 1024}
          maxFiles={5}
          bind:files={uploadFiles}
          on:drop={handleFileDrop}
          on:error={(e) => toast.error(e.detail)}
        />
      </div>

    <!-- Conversations Panel -->
    {:else if panelId === 'conversations'}
      <div class="space-y-3">
        {#if conversations.length === 0}
          <p class="text-center text-text-muted py-4">No hay conversaciones</p>
        {:else}
          {#each conversations as conv (conv.id)}
            <button class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors">
              <div class="flex items-center justify-between mb-1">
                <span class="font-medium text-sm">{conv.title || `Conv ${conv.id.slice(-6)}`}</span>
                <Badge variant={conv.status === 'active' ? 'success' : 'default'} size="sm">{conv.messages_count}</Badge>
              </div>
              <p class="text-xs text-text-muted">{formatDate(conv.created_at)}</p>
            </button>
          {/each}
        {/if}
      </div>

    <!-- Chat Panel -->
    {:else if panelId === 'chat'}
      <div class="chat-panel">
        {#if chatMessages.length === 0}
          <div class="text-center text-text-muted py-8">
            <p class="text-2xl mb-2">💬</p>
            <p>No hay mensajes aún</p>
            <p class="text-xs mt-1">Usa el chat de abajo para empezar</p>
          </div>
        {:else}
          <div class="chat-messages space-y-3">
            {#each chatMessages as msg (msg.id)}
              <div class="chat-message chat-message--{msg.role}" class:chat-message--loading={msg.loading}>
                <div class="chat-message__bubble">
                  {#if msg.loading}
                    <div class="flex items-center gap-2">
                      <span class="animate-pulse">●</span>
                      <span class="animate-pulse delay-100">●</span>
                      <span class="animate-pulse delay-200">●</span>
                    </div>
                  {:else}
                    <p class="whitespace-pre-wrap">{msg.content}</p>
                    {#if msg.provider}
                      <p class="text-xs text-text-muted mt-1 opacity-60">{msg.provider} • {msg.model}</p>
                    {/if}
                  {/if}
                </div>
                <span class="chat-message__time text-xs text-text-muted">
                  {msg.timestamp.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            {/each}
          </div>
        {/if}

        {#if chatMessages.length > 0}
          <div class="mt-4 pt-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              class="w-full"
              on:click={() => { chatMessages = []; toast.info('Chat limpiado'); }}
            >
              🗑️ Limpiar chat
            </Button>
          </div>
        {/if}
      </div>

    <!-- Help Panel -->
    {:else if panelId === 'help'}
      <div class="space-y-4 text-sm">
        <h4 class="font-medium">Sistema de gestos</h4>
        <div class="space-y-2">
          <p><strong>👆 1 Tap:</strong> Ver/Consultar información</p>
          <p><strong>👆👆 2 Taps:</strong> Añadir/Crear nuevo</p>
          <p><strong>👇 Hold 3s:</strong> Editar/Configurar</p>
        </div>
        <h4 class="font-medium mt-4">Barras de navegación</h4>
        <p><strong>Arriba:</strong> Opciones de IA y configuración</p>
        <p><strong>Abajo:</strong> Acciones y herramientas</p>
        <p><strong>Lateral:</strong> Acceso rápido (pulgar)</p>
      </div>

    <!-- Modelo Selector Panel -->
    {:else if panelId === 'modelo-selector'}
      <div class="space-y-2">
        {#each Object.entries(availableModels.reduce((acc, m) => {
          acc[m.provider] = acc[m.provider] || [];
          acc[m.provider].push(m);
          return acc;
        }, {} as Record<string, AIModel[]>)) as [provider, models]}
          <div class="mb-3">
            <h4 class="text-xs font-medium text-text-muted mb-2 uppercase">{provider}</h4>
            {#each models as model (model.id)}
              <button
                class="w-full text-left p-3 rounded-lg transition-colors mb-1 {selectedModelId === model.id ? 'bg-primary/20 border border-primary' : 'bg-bg-hover hover:bg-bg-card'}"
                on:click={() => selectModel(model.id)}
              >
                <div class="flex items-center gap-3">
                  <span class="text-lg">
                    {#if provider === 'DEEPSEEK'}🔮
                    {:else if provider === 'OPENAI'}🤖
                    {:else if provider === 'ANTHROPIC'}🧠
                    {:else}🦙{/if}
                  </span>
                  <div class="flex-1">
                    <p class="font-medium text-sm">{model.name}</p>
                    {#if model.description}
                      <p class="text-xs text-text-muted">{model.description}</p>
                    {/if}
                  </div>
                  {#if selectedModelId === model.id}
                    <span class="text-primary">✓</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/each}
      </div>

    <!-- Credencial Selector Panel -->
    {:else if panelId === 'credencial-selector'}
      <div class="space-y-2">
        {#if credentials.length === 0}
          <p class="text-center text-text-muted py-4">No hay credenciales configuradas</p>
          <Button variant="primary" class="w-full" on:click={() => currentPanel = 'credential-add'}>
            ➕ Añadir Credencial
          </Button>
        {:else}
          {#each credentials as cred (cred.key)}
            <button
              class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors"
              on:click={() => selectCredentialForChat(cred)}
            >
              <div class="flex items-center gap-3">
                <span class="text-xl">
                  {#if cred.provider === 'DEEPSEEK'}🔮
                  {:else if cred.provider === 'OPENAI'}🤖
                  {:else if cred.provider === 'ANTHROPIC'}🧠
                  {:else if cred.provider === 'OLLAMA'}🦙
                  {:else}🔑{/if}
                </span>
                <div class="flex-1">
                  <p class="font-medium text-sm">{cred.provider}</p>
                  <p class="text-xs text-text-muted">{cred.level}{cred.identifier ? ` • ${cred.identifier}` : ''}</p>
                </div>
                <span class="text-xs font-mono text-text-muted">{cred.api_key_preview}</span>
              </div>
            </button>
          {/each}
        {/if}
      </div>

    <!-- Prompts Panel -->
    {:else if panelId === 'prompts'}
      <div class="space-y-3">
        <div class="mb-3">
          <h4 class="text-xs font-medium text-text-muted mb-2 uppercase">⭐ Favoritos</h4>
          {#each quickPrompts.filter(p => p.favorite) as prompt (prompt.id)}
            <button
              class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors mb-1"
              on:click={() => applyQuickPrompt(prompt)}
            >
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <p class="font-medium text-sm">{prompt.name}</p>
                  <p class="text-xs text-text-muted truncate">{prompt.content}</p>
                </div>
                <span
                  role="button"
                  tabindex="0"
                  class="p-1 text-warning hover:text-warning/80 cursor-pointer"
                  on:click|stopPropagation={() => togglePromptFavorite(prompt.id)}
                  on:keydown={(e) => e.key === 'Enter' && togglePromptFavorite(prompt.id)}
                >
                  ⭐
                </span>
              </div>
            </button>
          {/each}
        </div>
        <div>
          <h4 class="text-xs font-medium text-text-muted mb-2 uppercase">📝 Todos</h4>
          {#each quickPrompts.filter(p => !p.favorite) as prompt (prompt.id)}
            <button
              class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors mb-1"
              on:click={() => applyQuickPrompt(prompt)}
            >
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <p class="font-medium text-sm">{prompt.name}</p>
                  <p class="text-xs text-text-muted truncate">{prompt.content}</p>
                </div>
                <span
                  role="button"
                  tabindex="0"
                  class="p-1 text-text-muted hover:text-warning cursor-pointer"
                  on:click|stopPropagation={() => togglePromptFavorite(prompt.id)}
                  on:keydown={(e) => e.key === 'Enter' && togglePromptFavorite(prompt.id)}
                >
                  ☆
                </span>
              </div>
            </button>
          {/each}
        </div>
      </div>

    <!-- Filtros Panel -->
    {:else if panelId === 'filtros'}
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2">Estado del menú</label>
          <select bind:value={menuFilters.estado} class="w-full p-2 bg-bg-input border border-border rounded-lg">
            <option value="">Todos</option>
            <option value="generando">⏳ Generando</option>
            <option value="generado">📄 Generado</option>
            <option value="validado">✅ Validado</option>
            <option value="error">❌ Error</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">Período</label>
          <select bind:value={menuFilters.periodo} class="w-full p-2 bg-bg-input border border-border rounded-lg">
            <option value="today">Hoy</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mes</option>
            <option value="all">Todo</option>
          </select>
        </div>
        <div class="flex gap-2">
          <Button variant="primary" class="flex-1" on:click={applyMenuFilters}>Aplicar</Button>
          <Button variant="ghost" class="flex-1" on:click={clearMenuFilters}>Limpiar</Button>
        </div>
      </div>

    <!-- Tools Panel -->
    {:else if panelId === 'tools'}
      <div class="space-y-2">
        {#each Object.entries(availableTools.reduce((acc, t) => {
          acc[t.category] = acc[t.category] || [];
          acc[t.category].push(t);
          return acc;
        }, {} as Record<string, Tool[]>)) as [category, tools]}
          <div class="mb-3">
            <h4 class="text-xs font-medium text-text-muted mb-2 uppercase">
              {#if category === 'menu'}🍽️ Menú
              {:else if category === 'ai'}🤖 IA
              {:else if category === 'export'}⬇️ Exportación
              {:else}{category}{/if}
            </h4>
            {#each tools as tool (tool.id)}
              <div class="flex items-center justify-between p-3 bg-bg-hover rounded-lg mb-1">
                <div class="flex-1">
                  <p class="font-medium text-sm">{tool.name}</p>
                  <p class="text-xs text-text-muted">{tool.description}</p>
                </div>
                <button
                  class="w-12 h-6 rounded-full transition-colors {tool.enabled ? 'bg-success' : 'bg-bg-card'}"
                  on:click={() => toggleTool(tool.id)}
                >
                  <span class="block w-5 h-5 rounded-full bg-white shadow transform transition-transform {tool.enabled ? 'translate-x-6' : 'translate-x-0.5'}"></span>
                </button>
              </div>
            {/each}
          </div>
        {/each}
      </div>

    <!-- Plugins Panel -->
    {:else if panelId === 'plugins'}
      <div class="space-y-2">
        {#each availablePlugins as plugin (plugin.id)}
          <div class="flex items-center justify-between p-3 bg-bg-hover rounded-lg">
            <div class="flex items-center gap-3">
              <span class="text-xl">🔌</span>
              <div>
                <p class="font-medium text-sm">{plugin.name}</p>
                <p class="text-xs text-text-muted">{plugin.description}</p>
                <p class="text-xs text-text-muted">v{plugin.version}</p>
              </div>
            </div>
            <button
              class="w-12 h-6 rounded-full transition-colors {plugin.enabled ? 'bg-success' : 'bg-bg-card'}"
              on:click={() => togglePlugin(plugin.id)}
            >
              <span class="block w-5 h-5 rounded-full bg-white shadow transform transition-transform {plugin.enabled ? 'translate-x-6' : 'translate-x-0.5'}"></span>
            </button>
          </div>
        {/each}
      </div>

    <!-- Contexto Panel -->
    {:else if panelId === 'contexto'}
      <div class="space-y-3">
        {#each contextItems as item (item.type)}
          <div class="flex items-center justify-between p-3 bg-bg-hover rounded-lg">
            <div class="flex items-center gap-3">
              <span class="text-lg">
                {#if item.type === 'menu'}🍽️
                {:else if item.type === 'template'}📋
                {:else if item.type === 'style'}🎨
                {:else if item.type === 'language'}🌐
                {:else}📎{/if}
              </span>
              <div>
                <p class="font-medium text-sm">{item.label}</p>
                <p class="text-xs text-text-muted">{item.value || 'No definido'}</p>
              </div>
            </div>
            <Badge variant={item.active ? 'success' : 'default'} size="sm">
              {item.active ? 'Activo' : 'Inactivo'}
            </Badge>
          </div>
        {/each}
        <div class="pt-2 border-t border-border">
          <p class="text-xs text-text-muted text-center">
            El contexto se usa para enriquecer las peticiones a la IA
          </p>
        </div>
      </div>

    <!-- Modulos Panel -->
    {:else if panelId === 'modulos'}
      <div class="space-y-2">
        {#each modules as mod (mod.id)}
          <button
            class="w-full text-left p-3 bg-bg-hover rounded-lg hover:bg-bg-card transition-colors"
            on:click={() => navigateToModule(mod)}
          >
            <div class="flex items-center gap-3">
              <span class="text-2xl">{mod.icon}</span>
              <div class="flex-1">
                <p class="font-medium text-sm">{mod.name}</p>
                <p class="text-xs text-text-muted">{mod.description}</p>
              </div>
              <Badge variant={mod.status === 'active' ? 'success' : mod.status === 'error' ? 'danger' : 'default'} size="sm">
                {mod.status}
              </Badge>
            </div>
          </button>
        {/each}
      </div>

    <!-- Stats Panel -->
    {:else if panelId === 'stats'}
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-bg-hover rounded-lg text-center">
            <p class="text-2xl font-bold">{totalMenus}</p>
            <p class="text-xs text-text-muted">Total Menús</p>
          </div>
          <div class="p-3 bg-bg-hover rounded-lg text-center">
            <p class="text-2xl font-bold text-success">{validadosCount}</p>
            <p class="text-xs text-text-muted">Validados</p>
          </div>
          <div class="p-3 bg-bg-hover rounded-lg text-center">
            <p class="text-2xl font-bold text-warning">{generandoCount}</p>
            <p class="text-xs text-text-muted">En proceso</p>
          </div>
          <div class="p-3 bg-bg-hover rounded-lg text-center">
            <p class="text-2xl font-bold">{menus.reduce((sum, m) => sum + m.productos_count, 0)}</p>
            <p class="text-xs text-text-muted">Productos</p>
          </div>
        </div>
        <div class="p-3 bg-bg-card rounded-lg border border-border">
          <p class="text-sm font-medium mb-2">Tasa de validación</p>
          <div class="w-full bg-bg-hover rounded-full h-2">
            <div
              class="bg-success h-2 rounded-full transition-all"
              style="width: {totalMenus > 0 ? (validadosCount / totalMenus * 100) : 0}%"
            ></div>
          </div>
          <p class="text-xs text-text-muted mt-1">
            {totalMenus > 0 ? Math.round(validadosCount / totalMenus * 100) : 0}% de menús validados
          </p>
        </div>
      </div>

    <!-- Stats Detallado Panel -->
    {:else if panelId === 'stats-detallado'}
      <div class="space-y-4">
        <h3 class="font-medium">Métricas Detalladas</h3>
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-bg-hover rounded-lg">
            <p class="text-xl font-bold">{totalMenus}</p>
            <p class="text-xs text-text-muted">Total Menús</p>
          </div>
          <div class="p-3 bg-bg-hover rounded-lg">
            <p class="text-xl font-bold text-success">{validadosCount}</p>
            <p class="text-xs text-text-muted">Validados</p>
          </div>
          <div class="p-3 bg-bg-hover rounded-lg">
            <p class="text-xl font-bold text-warning">{generandoCount}</p>
            <p class="text-xs text-text-muted">Generando</p>
          </div>
          <div class="p-3 bg-bg-hover rounded-lg">
            <p class="text-xl font-bold text-danger">{menus.filter(m => m.estado === 'error').length}</p>
            <p class="text-xs text-text-muted">Errores</p>
          </div>
        </div>
        <div class="space-y-2">
          <h4 class="text-sm font-medium">Por estado</h4>
          {#each ['generando', 'generado', 'validado', 'error'] as estado}
            {@const count = menus.filter(m => m.estado === estado).length}
            <div class="flex items-center gap-2">
              <Badge variant={estadoColors[estado]} size="sm">{estado}</Badge>
              <div class="flex-1 bg-bg-hover rounded-full h-2">
                <div
                  class="h-2 rounded-full transition-all"
                  class:bg-warning={estado === 'generando'}
                  class:bg-info={estado === 'generado'}
                  class:bg-success={estado === 'validado'}
                  class:bg-danger={estado === 'error'}
                  style="width: {totalMenus > 0 ? (count / totalMenus * 100) : 0}%"
                ></div>
              </div>
              <span class="text-sm font-mono">{count}</span>
            </div>
          {/each}
        </div>
        <div class="p-3 bg-bg-card rounded-lg border border-border">
          <p class="text-sm font-medium mb-2">Productos totales</p>
          <p class="text-3xl font-bold">{menus.reduce((sum, m) => sum + m.productos_count, 0)}</p>
          <p class="text-xs text-text-muted">en {menus.reduce((sum, m) => sum + m.categorias_count, 0)} categorías</p>
        </div>
      </div>

    <!-- Settings Panel -->
    {:else if panelId === 'settings'}
      <div class="space-y-4 text-sm">
        <div class="p-3 bg-bg-hover rounded-lg">
          <p class="font-medium mb-1">Modelo por defecto</p>
          <p class="text-text-muted">{currentModel}</p>
        </div>
        <div class="p-3 bg-bg-hover rounded-lg">
          <p class="font-medium mb-1">Credenciales activas</p>
          <p class="text-text-muted">{credentials.length} configuradas</p>
        </div>
        <div class="p-3 bg-bg-hover rounded-lg">
          <p class="font-medium mb-1">Tools habilitadas</p>
          <p class="text-text-muted">{availableTools.filter(t => t.enabled).length} de {availableTools.length}</p>
        </div>
        <div class="p-3 bg-bg-hover rounded-lg">
          <p class="font-medium mb-1">Plugins activos</p>
          <p class="text-text-muted">{availablePlugins.filter(p => p.enabled).length} de {availablePlugins.length}</p>
        </div>
      </div>

    <!-- Default -->
    {:else}
      <p class="text-center text-text-muted py-4">Panel: {panelId}</p>
    {/if}
  </svelte:fragment>
</MobileWorkspaceLayout>

<style>
  .stat-mini {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 0.75rem;
    text-align: center;
  }

  .stat-mini__value {
    display: block;
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1;
  }

  .stat-mini__label {
    display: block;
    font-size: 0.625rem;
    color: var(--color-text-muted);
    margin-top: 0.25rem;
    text-transform: uppercase;
  }

  /* Chat panel styles */
  .chat-panel {
    max-height: 60vh;
    overflow-y: auto;
  }

  .chat-messages {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .chat-message {
    display: flex;
    flex-direction: column;
    max-width: 85%;
  }

  .chat-message--user {
    align-self: flex-end;
    align-items: flex-end;
  }

  .chat-message--assistant {
    align-self: flex-start;
    align-items: flex-start;
  }

  .chat-message__bubble {
    padding: 0.75rem 1rem;
    border-radius: 1rem;
    word-break: break-word;
  }

  .chat-message--user .chat-message__bubble {
    background: var(--color-primary);
    color: white;
    border-bottom-right-radius: 0.25rem;
  }

  .chat-message--assistant .chat-message__bubble {
    background: var(--color-bg-hover);
    color: var(--color-text);
    border-bottom-left-radius: 0.25rem;
  }

  .chat-message--loading .chat-message__bubble {
    background: var(--color-bg-card);
  }

  .chat-message__time {
    margin-top: 0.25rem;
    font-size: 0.625rem;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  .animate-pulse {
    animation: pulse 1s infinite;
  }

  .delay-100 {
    animation-delay: 0.1s;
  }

  .delay-200 {
    animation-delay: 0.2s;
  }
</style>
