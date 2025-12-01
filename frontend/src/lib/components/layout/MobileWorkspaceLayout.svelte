<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import FloatingPanel from '$components/feedback/FloatingPanel.svelte';
  import ChatInput from '$components/ai/ChatInput.svelte';
  import Badge from '$components/ui/Badge.svelte';
  import Spinner from '$components/feedback/Spinner.svelte';

  // Types
  type ActionType = 'navigate' | 'panel' | 'emit' | 'function';

  type ButtonAction = {
    type: ActionType;
    target?: string;
    emoji?: string;
    label: string;
    panelId?: string;
    holdDuration?: number;
  };

  type ActionButton = {
    id: string;
    emoji: string;
    label?: string;
    variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
    primaryAction: ButtonAction;
    secondaryAction?: ButtonAction;
    tertiaryAction?: ButtonAction;
    badge?: string | number;
  };

  type PanelConfig = {
    title: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  };

  // Props
  export let title = '';
  export let topButtons: ActionButton[] = [];
  export let bottomButtons: ActionButton[] = [];
  export let sideButtons: ActionButton[] = [];
  export let panels: Record<string, PanelConfig> = {};
  export let showChat = true;
  export let chatPlaceholder = 'Escribe un mensaje...';
  export let chatLoading = false;
  export let showSideBar = true;
  export let sideBarPosition: 'left' | 'right' = 'right';

  const dispatch = createEventDispatcher<{
    buttonAction: { buttonId: string; actionType: 'primary' | 'secondary' | 'tertiary'; action: ButtonAction };
    chatSubmit: { message: string; attachments: File[] };
    panelOpen: { panelId: string };
    panelClose: { panelId: string };
  }>();

  // State
  let activePanel: string | null = null;
  let chatExpanded = false;
  let isMobile = true;

  // Button interaction state
  let buttonStates: Record<string, {
    tapCount: number;
    holdTimer: ReturnType<typeof setTimeout> | null;
    holding: boolean;
    holdProgress: number;
  }> = {};

  onMount(() => {
    const checkMobile = () => {
      isMobile = window.innerWidth < 768;
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  });

  // Initialize button states
  function initButtonState(buttonId: string) {
    if (!buttonStates[buttonId]) {
      buttonStates[buttonId] = {
        tapCount: 0,
        holdTimer: null,
        holding: false,
        holdProgress: 0
      };
    }
  }

  // Haptic feedback
  function vibrate(pattern: number | number[]) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }

  // Handle touch start
  function handleTouchStart(button: ActionButton, e: TouchEvent) {
    e.preventDefault();
    initButtonState(button.id);

    vibrate(10);

    const state = buttonStates[button.id];
    state.holding = true;
    state.holdProgress = 0;

    // Start hold timer (3s for tertiary action)
    if (button.tertiaryAction) {
      const duration = button.tertiaryAction.holdDuration || 3000;
      const interval = 50;
      const steps = duration / interval;
      let step = 0;

      const progressInterval = setInterval(() => {
        step++;
        state.holdProgress = (step / steps) * 100;
        buttonStates = buttonStates; // Trigger reactivity

        if (step >= steps) {
          clearInterval(progressInterval);
        }
      }, interval);

      state.holdTimer = setTimeout(() => {
        clearInterval(progressInterval);
        if (state.holding) {
          vibrate([10, 50, 10, 50, 10]);
          executeAction(button, 'tertiary', button.tertiaryAction!);
          state.holding = false;
          state.holdProgress = 0;
          buttonStates = buttonStates;
        }
      }, duration);
    }
  }

  // Handle touch end
  function handleTouchEnd(button: ActionButton, e: TouchEvent) {
    e.preventDefault();
    initButtonState(button.id);

    const state = buttonStates[button.id];

    // Cancel hold timer
    if (state.holdTimer) {
      clearTimeout(state.holdTimer);
      state.holdTimer = null;
    }

    if (state.holding && state.holdProgress < 100) {
      // Was not a complete hold, check for tap
      state.tapCount++;

      setTimeout(() => {
        if (state.tapCount === 1) {
          // Single tap - primary action
          vibrate(10);
          executeAction(button, 'primary', button.primaryAction);
        } else if (state.tapCount >= 2 && button.secondaryAction) {
          // Double tap - secondary action
          vibrate([10, 50, 10]);
          executeAction(button, 'secondary', button.secondaryAction);
        }
        state.tapCount = 0;
      }, 300);
    }

    state.holding = false;
    state.holdProgress = 0;
    buttonStates = buttonStates;
  }

  // Handle touch cancel
  function handleTouchCancel(button: ActionButton) {
    initButtonState(button.id);
    const state = buttonStates[button.id];

    if (state.holdTimer) {
      clearTimeout(state.holdTimer);
      state.holdTimer = null;
    }
    state.holding = false;
    state.holdProgress = 0;
    state.tapCount = 0;
    buttonStates = buttonStates;
  }

  // Execute action
  function executeAction(button: ActionButton, actionType: 'primary' | 'secondary' | 'tertiary', action: ButtonAction) {
    if (action.type === 'panel' && action.panelId) {
      openPanel(action.panelId);
    } else if (action.type === 'navigate' && action.target) {
      window.location.href = action.target;
    } else {
      dispatch('buttonAction', { buttonId: button.id, actionType, action });
    }
  }

  // Panel management
  function openPanel(panelId: string) {
    activePanel = panelId;
    dispatch('panelOpen', { panelId });
  }

  function closePanel() {
    if (activePanel) {
      dispatch('panelClose', { panelId: activePanel });
      activePanel = null;
    }
  }

  // Chat
  function handleChatSubmit(e: CustomEvent<{ message: string; attachments: File[] }>) {
    dispatch('chatSubmit', e.detail);
  }

  function toggleChatExpanded() {
    chatExpanded = !chatExpanded;
  }

  // Get panel config
  function getPanelConfig(panelId: string): PanelConfig {
    return panels[panelId] || { title: panelId, size: 'md' };
  }
</script>

<div class="mobile-workspace" class:mobile-workspace--chat-expanded={chatExpanded}>
  <!-- Top Bar -->
  {#if topButtons.length > 0}
    <div class="mobile-workspace__bar mobile-workspace__bar--top" transition:fly={{ y: -50, duration: 200 }}>
      <div class="mobile-workspace__bar-scroll">
        {#each topButtons as button (button.id)}
          <button
            class="mobile-workspace__button mobile-workspace__button--{button.variant || 'default'}"
            class:mobile-workspace__button--holding={buttonStates[button.id]?.holding}
            on:touchstart={(e) => handleTouchStart(button, e)}
            on:touchend={(e) => handleTouchEnd(button, e)}
            on:touchcancel={() => handleTouchCancel(button)}
            aria-label={button.label || button.emoji}
          >
            <span class="mobile-workspace__button-emoji">{button.emoji}</span>
            {#if button.label && !isMobile}
              <span class="mobile-workspace__button-label">{button.label}</span>
            {/if}
            {#if button.badge}
              <span class="mobile-workspace__button-badge">{button.badge}</span>
            {/if}
            {#if buttonStates[button.id]?.holding && buttonStates[button.id]?.holdProgress > 0}
              <svg class="mobile-workspace__progress-ring" viewBox="0 0 36 36">
                <circle
                  cx="18" cy="18" r="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-dasharray="100"
                  stroke-dashoffset={100 - (buttonStates[button.id]?.holdProgress || 0)}
                  transform="rotate(-90 18 18)"
                />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Main Content Area -->
  <main class="mobile-workspace__content">
    <slot />
  </main>

  <!-- Side Bar (Right or Left) -->
  {#if showSideBar && sideButtons.length > 0}
    <div
      class="mobile-workspace__bar mobile-workspace__bar--side mobile-workspace__bar--{sideBarPosition}"
      transition:fly={{ x: sideBarPosition === 'right' ? 50 : -50, duration: 200 }}
    >
      <div class="mobile-workspace__bar-scroll mobile-workspace__bar-scroll--vertical">
        {#each sideButtons as button (button.id)}
          <button
            class="mobile-workspace__button mobile-workspace__button--side mobile-workspace__button--{button.variant || 'default'}"
            class:mobile-workspace__button--holding={buttonStates[button.id]?.holding}
            on:touchstart={(e) => handleTouchStart(button, e)}
            on:touchend={(e) => handleTouchEnd(button, e)}
            on:touchcancel={() => handleTouchCancel(button)}
            aria-label={button.label || button.emoji}
          >
            <span class="mobile-workspace__button-emoji">{button.emoji}</span>
            {#if button.badge}
              <span class="mobile-workspace__button-badge">{button.badge}</span>
            {/if}
            {#if buttonStates[button.id]?.holding && buttonStates[button.id]?.holdProgress > 0}
              <svg class="mobile-workspace__progress-ring" viewBox="0 0 36 36">
                <circle
                  cx="18" cy="18" r="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-dasharray="100"
                  stroke-dashoffset={100 - (buttonStates[button.id]?.holdProgress || 0)}
                  transform="rotate(-90 18 18)"
                />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Bottom Bar -->
  <div class="mobile-workspace__bar mobile-workspace__bar--bottom" transition:fly={{ y: 50, duration: 200 }}>
    {#if bottomButtons.length > 0}
      <div class="mobile-workspace__bar-scroll">
        {#each bottomButtons as button (button.id)}
          <button
            class="mobile-workspace__button mobile-workspace__button--{button.variant || 'default'}"
            class:mobile-workspace__button--holding={buttonStates[button.id]?.holding}
            on:touchstart={(e) => handleTouchStart(button, e)}
            on:touchend={(e) => handleTouchEnd(button, e)}
            on:touchcancel={() => handleTouchCancel(button)}
            aria-label={button.label || button.emoji}
          >
            <span class="mobile-workspace__button-emoji">{button.emoji}</span>
            {#if button.label && !isMobile}
              <span class="mobile-workspace__button-label">{button.label}</span>
            {/if}
            {#if button.badge}
              <span class="mobile-workspace__button-badge">{button.badge}</span>
            {/if}
            {#if buttonStates[button.id]?.holding && buttonStates[button.id]?.holdProgress > 0}
              <svg class="mobile-workspace__progress-ring" viewBox="0 0 36 36">
                <circle
                  cx="18" cy="18" r="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-dasharray="100"
                  stroke-dashoffset={100 - (buttonStates[button.id]?.holdProgress || 0)}
                  transform="rotate(-90 18 18)"
                />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    <!-- Chat Input -->
    {#if showChat}
      <div class="mobile-workspace__chat" class:mobile-workspace__chat--expanded={chatExpanded}>
        <button
          class="mobile-workspace__chat-toggle"
          on:click={toggleChatExpanded}
          aria-label={chatExpanded ? 'Colapsar chat' : 'Expandir chat'}
        >
          <span class="mobile-workspace__chat-handle"></span>
        </button>
        <ChatInput
          placeholder={chatPlaceholder}
          loading={chatLoading}
          on:submit={handleChatSubmit}
        />
      </div>
    {/if}
  </div>

  <!-- Floating Panel -->
  {#if activePanel}
    <FloatingPanel
      open={true}
      position="bottom"
      size={getPanelConfig(activePanel).size === 'full' ? 'xl' : getPanelConfig(activePanel).size || 'md'}
      title={getPanelConfig(activePanel).title}
      on:close={closePanel}
    >
      <slot name="panel" panelId={activePanel} />
    </FloatingPanel>
  {/if}
</div>

<style>
  .mobile-workspace {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh; /* Dynamic viewport height for mobile */
    position: relative;
    overflow: hidden;
    background: var(--color-bg);
  }

  /* Bars */
  .mobile-workspace__bar {
    position: fixed;
    z-index: 40;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .mobile-workspace__bar--top {
    top: 0;
    left: 0;
    right: 0;
    padding: 0.5rem;
    padding-top: max(0.5rem, env(safe-area-inset-top));
    border-top: none;
    border-left: none;
    border-right: none;
  }

  .mobile-workspace__bar--bottom {
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.5rem;
    padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
    border-bottom: none;
    border-left: none;
    border-right: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .mobile-workspace__bar--side {
    top: 50%;
    transform: translateY(-50%);
    padding: 0.5rem;
    border-radius: 12px;
    max-height: 70vh;
  }

  .mobile-workspace__bar--right {
    right: 0.5rem;
    border-right: none;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .mobile-workspace__bar--left {
    left: 0.5rem;
    border-left: none;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  /* Bar scroll containers */
  .mobile-workspace__bar-scroll {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding: 0.25rem;
  }

  .mobile-workspace__bar-scroll::-webkit-scrollbar {
    display: none;
  }

  .mobile-workspace__bar-scroll--vertical {
    flex-direction: column;
    overflow-x: visible;
    overflow-y: auto;
  }

  /* Buttons */
  .mobile-workspace__button {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 48px;
    min-height: 48px;
    padding: 0.5rem;
    border-radius: 12px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-card);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.15s ease;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .mobile-workspace__button:active,
  .mobile-workspace__button--holding {
    transform: scale(0.95);
    background: var(--color-bg-hover);
  }

  .mobile-workspace__button--primary {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .mobile-workspace__button--success {
    background: var(--color-success);
    color: white;
    border-color: var(--color-success);
  }

  .mobile-workspace__button--side {
    width: 56px;
    height: 56px;
  }

  .mobile-workspace__button-emoji {
    font-size: 1.25rem;
    line-height: 1;
  }

  .mobile-workspace__button-label {
    font-size: 0.625rem;
    margin-top: 0.25rem;
    white-space: nowrap;
  }

  .mobile-workspace__button-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    font-size: 0.625rem;
    font-weight: 600;
    background: var(--color-danger);
    color: white;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Progress ring */
  .mobile-workspace__progress-ring {
    position: absolute;
    inset: -2px;
    width: calc(100% + 4px);
    height: calc(100% + 4px);
    pointer-events: none;
    opacity: 0.8;
  }

  .mobile-workspace__progress-ring circle {
    stroke: var(--color-primary);
    transition: stroke-dashoffset 0.05s linear;
  }

  /* Content */
  .mobile-workspace__content {
    flex: 1;
    overflow-y: auto;
    padding: calc(60px + env(safe-area-inset-top)) 1rem 140px 1rem;
  }

  .mobile-workspace__bar--side.mobile-workspace__bar--right ~ .mobile-workspace__content {
    padding-right: 4.5rem;
  }

  .mobile-workspace__bar--side.mobile-workspace__bar--left ~ .mobile-workspace__content {
    padding-left: 4.5rem;
  }

  /* Chat */
  .mobile-workspace__chat {
    background: var(--color-bg-card);
    border-radius: 12px;
    border: 1px solid var(--color-border);
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .mobile-workspace__chat--expanded {
    position: fixed;
    inset: 1rem;
    inset-bottom: calc(1rem + env(safe-area-inset-bottom));
    z-index: 50;
    display: flex;
    flex-direction: column;
  }

  .mobile-workspace__chat-toggle {
    display: flex;
    justify-content: center;
    padding: 0.5rem;
    background: transparent;
    border: none;
    cursor: pointer;
    width: 100%;
  }

  .mobile-workspace__chat-handle {
    width: 32px;
    height: 4px;
    background: var(--color-border);
    border-radius: 2px;
  }

  .mobile-workspace__chat--expanded .mobile-workspace__chat-toggle {
    border-bottom: 1px solid var(--color-border);
  }

  /* Responsive */
  @media (min-width: 768px) {
    .mobile-workspace__content {
      padding-right: 5rem;
    }

    .mobile-workspace__button {
      min-width: 56px;
    }

    .mobile-workspace__button-emoji {
      font-size: 1.5rem;
    }
  }
</style>
