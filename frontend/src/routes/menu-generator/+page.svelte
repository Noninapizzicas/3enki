<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { MobileWorkspaceLayout } from '$components/layout';
  import { Button, Badge } from '$components/ui';
  import { Spinner } from '$components/feedback';
  import { FileDropZone } from '$components/input';
  import { ChatAIWorkspace } from '$components/ai';
  import type {
    AIModel,
    AICredential,
    AITool,
    AIPlugin,
    AIProvider,
    ContextItem,
    QuickPrompt,
    PromptTemplate,
    ConversationSummary,
    ProjectRef,
    StorageFile,
    StorageInfo,
    ProjectSummary,
    FileEntry,
    VoiceConfig,
    CameraCapture
  } from '$components/ai/types';
  import { subscribe, events } from '$stores/mqtt';
  import { toast } from '$stores/toast';
  import { setHideGlobalHeader, setHideGlobalSidebar, resetLayout } from '$stores/layout';
  import config from '$lib/config';

  // v2.0: Ocultar header y sidebar globales (esta página usa su propio layout)
  onMount(() => {
    setHideGlobalHeader(true);
    setHideGlobalSidebar(true);

    // Cargar datos y suscribirse a eventos MQTT
    loadAll();
    subscribe([
      'core/+/events/menu/#',
      'core/+/events/menu-generator/#',
      'core/+/events/credential/#'
    ]);
  });

  onDestroy(() => {
    resetLayout(); // Restaurar layout global al salir
  });

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

  // Types from $components/ai/types (AIModel, AITool, AIPlugin, ContextItem, QuickPrompt, etc.)

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

  // Tools state (using AITool from types)
  let availableTools: AITool[] = [
    { id: 'menu-parser', name: 'Parser de Menús', description: 'Extrae estructura de cartas', enabled: true, category: 'menu' },
    { id: 'image-ocr', name: 'OCR de Imágenes', description: 'Lee texto de imágenes', enabled: true, category: 'ai' },
    { id: 'price-extractor', name: 'Extractor de Precios', description: 'Detecta precios automáticamente', enabled: true, category: 'menu' },
    { id: 'allergen-detector', name: 'Detector de Alérgenos', description: 'Identifica alérgenos', enabled: false, category: 'menu' },
    { id: 'json-exporter', name: 'Exportador JSON', description: 'Genera JSON estructurado', enabled: true, category: 'export' },
    { id: 'csv-exporter', name: 'Exportador CSV', description: 'Genera hojas de cálculo', enabled: true, category: 'export' }
  ];

  // Plugins state (using AIPlugin from types)
  let availablePlugins: AIPlugin[] = [
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

  // Quick prompts state (using QuickPrompt from types)
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
  // BARRA LATERAL - Ecosistema (v2.0: 28px, transparente, sin ayuda)
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
    }
    // v2.0: Removido botón de ayuda (❓)
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
      secondaryAction: { type: 'panel' as const, panelId: 'credencial-crear', label: 'Nueva API Key' },
      tertiaryAction: { type: 'panel' as const, panelId: 'credenciales-gestionar', label: 'Gestionar API Keys' }
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
      id: 'historial',
      emoji: '💬',
      label: 'Chats',
      badge: 0,
      badgeColor: 'info' as const,
      primaryAction: { type: 'panel' as const, panelId: 'historial-conversaciones', label: 'Conversaciones' },
      secondaryAction: { type: 'panel' as const, panelId: 'historial-crear', label: 'Nueva conversación' },
      tertiaryAction: { type: 'panel' as const, panelId: 'historial-gestionar', label: 'Gestionar historial' }
    }
  ];

  // ===========================================
  // SUB-BARRA CHAT INFERIOR - Complementa el mensaje (ChatAIWorkspace pattern)
  // ===========================================
  const chatBottomButtons = [
    {
      id: 'adjuntar',
      emoji: '📎',
      label: 'Adjuntar',
      variant: 'primary' as const,
      primaryAction: { type: 'panel' as const, panelId: 'adjuntar-archivos', label: 'Archivos adjuntos' },
      secondaryAction: { type: 'panel' as const, panelId: 'adjuntar-subir', label: 'Subir archivo' },
      tertiaryAction: { type: 'panel' as const, panelId: 'adjuntar-gestionar', label: 'Gestionar adjuntos' }
    },
    {
      id: 'proyecto',
      emoji: '📁',
      label: 'Proyecto',
      primaryAction: { type: 'panel' as const, panelId: 'proyectos', label: 'Ver proyectos' },
      secondaryAction: { type: 'panel' as const, panelId: 'proyecto-crear', label: 'Nuevo proyecto' },
      tertiaryAction: { type: 'panel' as const, panelId: 'proyectos-gestionar', label: 'Gestionar proyectos' }
    },
    {
      id: 'explorar',
      emoji: '📂',
      label: 'Explorar',
      primaryAction: { type: 'panel' as const, panelId: 'explorar-archivos', label: 'Explorar archivos' },
      secondaryAction: { type: 'panel' as const, panelId: 'explorar-visor', label: 'Visor de archivos' },
      tertiaryAction: { type: 'panel' as const, panelId: 'explorar-gestionar', label: 'Gestionar explorador' }
    },
    {
      id: 'voz',
      emoji: '🎤',
      label: 'Voz',
      primaryAction: { type: 'panel' as const, panelId: 'voz-dictado', label: 'Dictado por voz' },
      secondaryAction: { type: 'panel' as const, panelId: 'voz-configurar', label: 'Configurar voz' },
      tertiaryAction: { type: 'panel' as const, panelId: 'voz-lectura', label: 'Lectura en voz alta' }
    },
    {
      id: 'camara',
      emoji: '📷',
      label: 'Cámara',
      primaryAction: { type: 'panel' as const, panelId: 'camara-capturar', label: 'Capturar imagen' },
      secondaryAction: { type: 'panel' as const, panelId: 'camara-configurar', label: 'Configurar cámara' },
      tertiaryAction: { type: 'panel' as const, panelId: 'camara-galeria', label: 'Galería de capturas' }
    }
  ];

  const panels = {
    // ===========================================
    // Paneles específicos de Menu Generator
    // ===========================================
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
    'settings': { title: 'Configuración', size: 'md' as const },
    'settings-full': { title: 'Configuración Avanzada', size: 'full' as const },

    // ===========================================
    // Paneles de ChatAIWorkspace (delegados al componente)
    // ===========================================
    // chatTopButtons - Modelo
    'modelo-selector': { title: 'Seleccionar Modelo', size: 'sm' as const },
    'modelo-config': { title: 'Configurar Modelo', size: 'md' as const },
    'modelos-gestionar': { title: 'Gestionar Modelos', size: 'full' as const },
    // chatTopButtons - Credencial
    'credencial-selector': { title: 'Seleccionar API Key', size: 'sm' as const },
    'credencial-crear': { title: 'Nueva Credencial', size: 'md' as const },
    'credenciales-gestionar': { title: 'Gestionar Credenciales', size: 'full' as const },
    // chatTopButtons - Prompt
    'prompts': { title: 'Prompts Rápidos', size: 'md' as const },
    'prompt-crear': { title: 'Nuevo Prompt', size: 'md' as const },
    'prompts-gestionar': { title: 'Gestionar Prompts', size: 'full' as const },
    // chatTopButtons - Historial
    'historial-conversaciones': { title: 'Conversaciones', size: 'lg' as const },
    'historial-crear': { title: 'Nueva Conversación', size: 'md' as const },
    'historial-gestionar': { title: 'Gestionar Historial', size: 'full' as const },
    // chatBottomButtons - Adjuntar
    'adjuntar-archivos': { title: 'Archivos Adjuntos', size: 'md' as const },
    'adjuntar-subir': { title: 'Subir Archivo', size: 'md' as const },
    'adjuntar-gestionar': { title: 'Gestionar Adjuntos', size: 'full' as const },
    // chatBottomButtons - Proyecto
    'proyectos': { title: 'Proyectos', size: 'lg' as const },
    'proyecto-crear': { title: 'Nuevo Proyecto', size: 'md' as const },
    'proyectos-gestionar': { title: 'Gestionar Proyectos', size: 'full' as const },
    // chatBottomButtons - Explorar
    'explorar-archivos': { title: 'Explorar Archivos', size: 'lg' as const },
    'explorar-visor': { title: 'Visor de Archivos', size: 'full' as const },
    'explorar-gestionar': { title: 'Gestionar Explorador', size: 'full' as const },
    // chatBottomButtons - Voz
    'voz-dictado': { title: 'Dictado por Voz', size: 'md' as const },
    'voz-configurar': { title: 'Configurar Voz', size: 'md' as const },
    'voz-lectura': { title: 'Lectura en Voz Alta', size: 'md' as const },
    // chatBottomButtons - Cámara
    'camara-capturar': { title: 'Capturar Imagen', size: 'md' as const },
    'camara-configurar': { title: 'Configurar Cámara', size: 'md' as const },
    'camara-galeria': { title: 'Galería de Capturas', size: 'lg' as const }
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
    if (!files || files.length === 0) return;

    for (const file of files) {
      try {
        toast.info(`Subiendo ${file.name}...`);
        const base64 = await fileToBase64(file);

        const res = await fetch(`${apiBase}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_base64: base64,
            file_name: file.name,
            file_type: file.type || 'application/octet-stream'
          })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || data.message || `Error ${res.status}`);
        }

        toast.success(`✅ Menú ${data.menu_id} en proceso de OCR`);

        // Cerrar el panel después de subir
        currentPanel = '';
      } catch (err) {
        console.error('Upload error:', err);
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
        toast.error(`❌ ${file.name}: ${errorMsg}`);
      }
    }

    // Limpiar archivos del FileDropZone
    uploadFiles = [];
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

  /**
   * Procesa archivos adjuntos (PDF/imágenes) enviándolos al OCR y esperando resultado
   * Flujo: Chat -> Adjuntar PDF -> OCR -> Texto -> AI -> Respuesta en chat
   */
  async function processAttachments(files: File[], userMessage: string = '') {
    for (const file of files) {
      // Validar tipo de archivo
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png|webp)$/i)) {
        toast.error(`Tipo de archivo no soportado: ${file.type || file.name}`);
        continue;
      }

      // Mostrar mensaje del usuario con el archivo
      const fileMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: `📎 **${file.name}**${userMessage ? `\n\n${userMessage}` : ''}`,
        timestamp: new Date()
      };
      chatMessages = [...chatMessages, fileMsg];

      // Mostrar loading con estado inicial
      const assistantId = `msg-${Date.now() + 1}`;
      chatMessages = [...chatMessages, {
        id: assistantId,
        role: 'assistant',
        content: '📤 Subiendo archivo...',
        timestamp: new Date(),
        loading: true
      }];

      chatLoading = true;

      try {
        // PASO 1: Subir archivo
        const base64 = await fileToBase64(file);
        const res = await fetch(`${apiBase}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_base64: base64,
            file_name: file.name,
            file_type: file.type || 'application/pdf'
          })
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Error ${res.status}`);
        }

        const uploadData = await res.json();
        const menuId = uploadData.menu_id;

        // Actualizar estado: procesando OCR
        chatMessages = chatMessages.map(m =>
          m.id === assistantId
            ? { ...m, content: '🔍 Extrayendo texto con OCR...' }
            : m
        );

        // PASO 2: Polling hasta que el menú esté listo
        const maxAttempts = 60; // 2 minutos máximo (60 * 2s)
        let attempts = 0;
        let menuData = null;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2s
          attempts++;

          try {
            const menuRes = await fetch(`${apiBase}/menus/${menuId}`);
            if (!menuRes.ok) continue;

            menuData = await menuRes.json();

            // Actualizar mensaje según estado
            if (menuData.estado === 'generando') {
              const dots = '.'.repeat((attempts % 3) + 1);
              chatMessages = chatMessages.map(m =>
                m.id === assistantId
                  ? { ...m, content: `🤖 Procesando con IA${dots}` }
                  : m
              );
            } else if (menuData.estado === 'generado' || menuData.estado === 'validado') {
              // Menú listo - mostrar resultado
              break;
            } else if (menuData.estado === 'error') {
              throw new Error(menuData.error || 'Error procesando menú');
            }
          } catch (pollErr) {
            console.warn('Poll error:', pollErr);
          }
        }

        if (!menuData || menuData.estado === 'generando') {
          throw new Error('Timeout: El procesamiento tardó demasiado');
        }

        // PASO 3: Mostrar resultado estructurado en el chat
        const resultContent = formatMenuResult(menuData);
        chatMessages = chatMessages.map(m =>
          m.id === assistantId
            ? { ...m, content: resultContent, loading: false }
            : m
        );

        // Actualizar lista de menús
        await fetchMenus();
        toast.success(`Menú extraído: ${menuData.productos?.length || 0} productos`);

      } catch (err) {
        console.error('Process error:', err);
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
        chatMessages = chatMessages.map(m =>
          m.id === assistantId
            ? { ...m, content: `❌ **Error:** ${errorMsg}`, loading: false }
            : m
        );
        toast.error(errorMsg);
      } finally {
        chatLoading = false;
      }
    }
  }

  /**
   * Formatea el resultado del menú para mostrar en el chat
   */
  function formatMenuResult(menu: any): string {
    if (!menu) return '❌ No se pudo procesar el menú';

    const productos = menu.productos || [];
    const categorias = menu.categorias || [];
    const ingredientes = menu.ingredientes_catalogo || [];

    let result = `✅ **Menú extraído correctamente**\n\n`;
    result += `📋 **ID:** ${menu.id}\n`;
    result += `📊 **Resumen:**\n`;
    result += `- ${productos.length} productos\n`;
    result += `- ${categorias.length} categorías\n`;
    result += `- ${ingredientes.length} ingredientes\n\n`;

    // Mostrar categorías y productos
    if (categorias.length > 0) {
      result += `---\n\n`;
      for (const cat of categorias) {
        const emoji = cat.emoji || '📂';
        result += `### ${emoji} ${cat.nombre}\n\n`;

        const catProductos = productos.filter((p: any) => p.categoria_id === cat.id);
        for (const prod of catProductos) {
          const prodEmoji = prod.emoji || '🍽️';
          const precio = prod.precio ? ` - **${prod.precio.toFixed(2)}€**` : '';
          result += `- ${prodEmoji} **${prod.nombre}**${precio}\n`;
          if (prod.descripcion) {
            result += `  _${prod.descripcion}_\n`;
          }
          if (prod.alergenos?.length > 0) {
            result += `  ⚠️ ${prod.alergenos.join(', ')}\n`;
          }
        }
        result += '\n';
      }
    }

    result += `---\n\n`;
    result += `💾 Puedes ver el menú completo en el panel lateral o exportarlo a JSON/CSV.`;

    return result;
  }

  async function handleChatSubmit(e: CustomEvent<{ message: string; attachments?: File[] }>) {
    const { message, attachments } = e.detail;

    // Si hay archivos adjuntos, procesarlos primero con OCR
    if (attachments && attachments.length > 0) {
      await processAttachments(attachments, message);
      return;
    }

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
  // Note: onMount para layout está al inicio del script (setHideGlobalHeader, etc.)
</script>

<svelte:head>
  <title>Menu Generator - Event-Core</title>
</svelte:head>

<MobileWorkspaceLayout
  title=""
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
  sideBarSize={28}
  sideBarTransparent={true}
  sideBarOpacity={0.7}
  showHeader={false}
  on:buttonAction={handleButtonAction}
  on:chatSubmit={handleChatSubmit}
  on:panelOpen={handlePanelOpen}
  on:panelClose={handlePanelClose}
>
  <!-- Main Content - v2.0: Sin stats ni instrucciones, solo chat -->
  {#if loading}
    <div class="flex items-center justify-center h-full">
      <Spinner size="lg" />
    </div>
  {:else}
    <div class="space-y-4 h-full">
      <!-- v2.0: Removido stats grid y Card de instrucciones -->

      <!-- Chat conversation (visible in main area) -->
      {#if chatMessages.length > 0}
        <div class="chat-area bg-bg-card border border-border rounded-lg p-3 max-h-64 overflow-y-auto">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-medium text-text-muted">💬 Conversación</h3>
            <span class="text-xs text-text-muted">{chatMessages.length} mensajes</span>
          </div>
          <div class="space-y-2">
            {#each chatMessages.slice(-4) as msg (msg.id)}
              <div class="chat-bubble chat-bubble--{msg.role}" class:opacity-60={msg.loading}>
                {#if msg.loading}
                  <span class="animate-pulse">Pensando...</span>
                {:else}
                  <p class="text-sm whitespace-pre-wrap">{msg.content}</p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

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
    <!-- =========================================== -->
    <!-- Paneles específicos de Menu Generator       -->
    <!-- =========================================== -->

    <!-- Menus Panel -->
    {#if panelId === 'menus'}
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

    <!-- =========================================== -->
    <!-- Paneles de IA delegados a ChatAIWorkspace  -->
    <!-- =========================================== -->
    {:else}
      <ChatAIWorkspace
        currentPanel={panelId}
        availableModels={availableModels}
        selectedModelId={selectedModelId}
        credentials={credentials.map(c => ({
          key: c.key,
          provider: c.provider,
          level: c.level,
          identifier: c.identifier,
          api_key_preview: c.api_key_preview
        }))}
        tools={availableTools}
        plugins={availablePlugins}
        contextItems={contextItems}
        quickPrompts={quickPrompts}
        conversations={conversations.map(c => ({
          id: c.id,
          title: c.title || `Conv ${c.id.slice(-6)}`,
          preview: '',
          messages_count: c.messages_count,
          updated_at: c.created_at,
          status: c.status
        }))}
        on:modelSelect={(e) => { selectedModelId = e.detail.id; currentModel = e.detail.name; currentPanel = ''; }}
        on:credentialSelect={(e) => { currentCredentialPreview = e.detail.api_key_preview; currentPanel = ''; }}
        on:toolToggle={(e) => toggleTool(e.detail.id)}
        on:pluginToggle={(e) => togglePlugin(e.detail.id)}
        on:promptSelect={(e) => applyQuickPrompt(e.detail)}
        on:panelClose={() => currentPanel = ''}
      />
    {/if}
  </svelte:fragment>
</MobileWorkspaceLayout>

<style>
  /* v2.0: stat-mini styles removidos (stats ahora solo en panel)
   * Para ver stats usar toolbar_top → 📊 Stats
   */

  /* Chat panel styles */
  .chat-panel {
    max-height: 60vh;
    overflow-y: auto;
  }

  /* Chat bubbles in main area */
  .chat-bubble {
    padding: 0.5rem 0.75rem;
    border-radius: 12px;
    max-width: 85%;
  }

  .chat-bubble--user {
    background: var(--color-primary);
    color: white;
    margin-left: auto;
    border-bottom-right-radius: 4px;
  }

  .chat-bubble--assistant {
    background: var(--color-bg-hover);
    color: var(--color-text);
    margin-right: auto;
    border-bottom-left-radius: 4px;
  }

  .chat-bubble--system {
    background: var(--color-bg-elevated);
    color: var(--color-text-muted);
    font-size: 0.75rem;
    text-align: center;
    margin: 0 auto;
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
