/**
 * FloatingInputBar Component
 * Barra de entrada de texto flotante ancho completo (20mm) con botón 10x10mm
 * Version: 1.0.0
 */

class FloatingInputBar {
    constructor(options = {}) {
        // Configuración por defecto
        this.options = {
            // Input
            placeholder: 'Escribe algo...',
            maxLength: 500,
            initialValue: '',
            clearOnSubmit: true,
            submitOnEnter: true,
            escToClear: true,

            // Botón
            buttonEmoji: '➤',
            buttonTooltip: 'Enviar',
            buttonAction: 'submit',  // 'submit', 'voice', 'search', 'custom'

            // Voice integration
            voiceEnabled: false,
            voiceLanguage: 'es-ES',
            voiceContinuous: false,

            // Posición
            position: 'bottom',      // 'bottom', 'top'
            draggable: true,
            rememberPosition: true,
            storageKey: 'floating-input-bar-pos',

            // Visual
            variant: 'default',      // 'default', 'search', 'chat', 'compact'
            showHandle: true,
            showCounter: false,
            showTooltip: true,

            // Comportamiento
            autoFocus: false,
            autoHide: false,
            loading: false,

            // Callbacks
            onSubmit: null,
            onChange: null,
            onFocus: null,
            onBlur: null,
            onVoiceStart: null,
            onVoiceEnd: null,
            onError: null,

            ...options
        };

        // Estado
        this.isVisible = true;
        this.isDragging = false;
        this.currentPosition = null;
        this.voiceInput = null;

        // Referencias
        this.element = null;
        this.inputField = null;
        this.button = null;
        this.handle = null;

        // Inicializar
        this.init();
    }

    /**
     * Inicializar componente
     */
    init() {
        this.createElement();
        this.attachEventListeners();
        this.loadPosition();

        if (this.options.autoFocus) {
            setTimeout(() => this.focus(), 100);
        }
    }

    /**
     * Crear elemento DOM
     */
    createElement() {
        // Contenedor principal
        this.element = document.createElement('div');
        this.element.className = `floating-input-bar variant-${this.options.variant}`;

        if (!this.options.showHandle) {
            this.element.classList.add('no-handle');
        }

        // Handle para drag
        if (this.options.draggable && this.options.showHandle) {
            this.handle = document.createElement('div');
            this.handle.className = 'floating-input-bar-handle';
            this.element.appendChild(this.handle);
        }

        // Wrapper interno
        const wrapper = document.createElement('div');
        wrapper.className = 'floating-input-bar-wrapper';

        // Input field
        this.inputField = document.createElement('input');
        this.inputField.type = 'text';
        this.inputField.className = 'floating-input-bar-field';
        this.inputField.placeholder = this.options.placeholder;
        this.inputField.maxLength = this.options.maxLength;
        this.inputField.value = this.options.initialValue;
        this.inputField.setAttribute('aria-label', this.options.placeholder);

        // Botón de acción
        this.button = document.createElement('button');
        this.button.className = 'floating-input-bar-button';
        this.button.innerHTML = this.options.buttonEmoji;
        this.button.title = this.options.buttonTooltip;
        this.button.setAttribute('aria-label', this.options.buttonTooltip);

        // Ensamblar
        wrapper.appendChild(this.inputField);
        wrapper.appendChild(this.button);
        this.element.appendChild(wrapper);

        // Counter (opcional)
        if (this.options.showCounter) {
            this.counter = document.createElement('div');
            this.counter.className = 'floating-input-bar-counter';
            this.updateCounter();
            this.element.appendChild(this.counter);
        }

        // Tooltip (opcional)
        if (this.options.showTooltip) {
            this.tooltip = document.createElement('div');
            this.tooltip.className = 'floating-input-bar-tooltip';
            this.element.appendChild(this.tooltip);
        }

        // Añadir al body
        document.body.appendChild(this.element);

        // Voice integration (si está habilitado)
        if (this.options.voiceEnabled && typeof VoiceInput !== 'undefined') {
            this.setupVoiceIntegration();
        }
    }

    /**
     * Configurar integración con VoiceInput
     */
    setupVoiceIntegration() {
        // Cambiar icono del botón a micrófono
        this.button.innerHTML = '🎤';
        this.button.title = 'Activar micrófono';

        // Crear instancia de VoiceInput en modo "headless"
        // (sin UI propia, solo lógica)
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.warn('FloatingInputBar: Speech Recognition no soportado');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = this.options.voiceLanguage;
        this.recognition.continuous = this.options.voiceContinuous;
        this.recognition.interimResults = true;

        // Event: Result
        this.recognition.onresult = (event) => {
            let transcript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    transcript += event.results[i][0].transcript + ' ';
                }
            }

            if (transcript) {
                this.inputField.value += transcript;
                this.updateCounter();

                if (this.options.onChange) {
                    this.options.onChange(this.inputField.value);
                }
            }
        };

        // Event: Start
        this.recognition.onstart = () => {
            this.button.classList.add('listening');
            this.button.innerHTML = '🔴';
            this.showTooltip('Escuchando...');

            if (this.options.onVoiceStart) {
                this.options.onVoiceStart();
            }
        };

        // Event: End
        this.recognition.onend = () => {
            this.button.classList.remove('listening');
            this.button.innerHTML = '🎤';
            this.hideTooltip();

            if (this.options.onVoiceEnd) {
                this.options.onVoiceEnd(this.inputField.value);
            }
        };

        // Event: Error
        this.recognition.onerror = (event) => {
            console.error('Speech Recognition Error:', event.error);
            this.button.classList.remove('listening');
            this.button.innerHTML = '🎤';
            this.element.classList.add('error');

            setTimeout(() => {
                this.element.classList.remove('error');
            }, 400);

            if (this.options.onError) {
                this.options.onError(event.error);
            }
        };
    }

    /**
     * Adjuntar event listeners
     */
    attachEventListeners() {
        // Submit al presionar Enter
        if (this.options.submitOnEnter) {
            this.inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.submit();
                }
            });
        }

        // Limpiar al presionar ESC
        if (this.options.escToClear) {
            this.inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.clear();
                }
            });
        }

        // Botón de acción
        this.button.addEventListener('click', () => {
            if (this.options.voiceEnabled && this.recognition) {
                this.toggleVoice();
            } else {
                this.submit();
            }
        });

        // Input change
        this.inputField.addEventListener('input', () => {
            this.updateCounter();

            if (this.options.onChange) {
                this.options.onChange(this.inputField.value);
            }
        });

        // Focus/Blur
        this.inputField.addEventListener('focus', () => {
            this.element.classList.add('focus');

            if (this.options.onFocus) {
                this.options.onFocus();
            }
        });

        this.inputField.addEventListener('blur', () => {
            this.element.classList.remove('focus');

            if (this.options.onBlur) {
                this.options.onBlur();
            }
        });

        // Drag & Drop
        if (this.options.draggable && this.handle) {
            this.setupDragAndDrop();
        }

        // Auto-hide on scroll (opcional)
        if (this.options.autoHide) {
            let lastScrollY = window.scrollY;

            window.addEventListener('scroll', () => {
                const currentScrollY = window.scrollY;

                if (currentScrollY > lastScrollY && currentScrollY > 100) {
                    this.hide();
                } else {
                    this.show();
                }

                lastScrollY = currentScrollY;
            });
        }
    }

    /**
     * Configurar drag and drop
     */
    setupDragAndDrop() {
        let startY = 0;
        let startX = 0;
        let currentY = 0;

        const onDragStart = (e) => {
            if (e.target !== this.handle) return;

            this.isDragging = true;
            this.element.classList.add('dragging');

            const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
            const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;

            startY = clientY - currentY;
            startX = clientX;

            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onDragEnd);
            document.addEventListener('touchmove', onDrag);
            document.addEventListener('touchend', onDragEnd);
        };

        const onDrag = (e) => {
            if (!this.isDragging) return;
            e.preventDefault();

            const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

            currentY = clientY - startY;

            // Limitar movimiento dentro del viewport
            const maxY = window.innerHeight - this.element.offsetHeight - 16;
            currentY = Math.max(16, Math.min(currentY, maxY));

            this.element.style.bottom = 'auto';
            this.element.style.top = `${currentY}px`;
        };

        const onDragEnd = () => {
            if (!this.isDragging) return;

            this.isDragging = false;
            this.element.classList.remove('dragging');

            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', onDragEnd);
            document.removeEventListener('touchmove', onDrag);
            document.removeEventListener('touchend', onDragEnd);

            this.savePosition();
        };

        this.handle.addEventListener('mousedown', onDragStart);
        this.handle.addEventListener('touchstart', onDragStart);
    }

    /**
     * Submit (enviar)
     */
    submit() {
        const value = this.inputField.value.trim();

        if (!value) return;

        // Mostrar estado de éxito
        this.button.classList.add('success');
        setTimeout(() => {
            this.button.classList.remove('success');
        }, 600);

        // Callback
        if (this.options.onSubmit) {
            this.options.onSubmit(value);
        }

        // Limpiar si está configurado
        if (this.options.clearOnSubmit) {
            this.clear();
        }
    }

    /**
     * Toggle voice recognition
     */
    toggleVoice() {
        if (!this.recognition) return;

        if (this.button.classList.contains('listening')) {
            this.recognition.stop();
        } else {
            try {
                this.recognition.start();
            } catch (error) {
                console.error('Error al iniciar reconocimiento:', error);
            }
        }
    }

    /**
     * Limpiar input
     */
    clear() {
        this.inputField.value = '';
        this.updateCounter();
        this.inputField.focus();
    }

    /**
     * Obtener valor
     */
    getValue() {
        return this.inputField.value;
    }

    /**
     * Establecer valor
     */
    setValue(value) {
        this.inputField.value = value;
        this.updateCounter();
    }

    /**
     * Focus en el input
     */
    focus() {
        this.inputField.focus();
    }

    /**
     * Blur del input
     */
    blur() {
        this.inputField.blur();
    }

    /**
     * Mostrar barra
     */
    show() {
        this.element.classList.remove('hidden');
        this.isVisible = true;
    }

    /**
     * Ocultar barra
     */
    hide() {
        this.element.classList.add('hidden');
        this.isVisible = false;
    }

    /**
     * Toggle visibilidad
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Actualizar counter
     */
    updateCounter() {
        if (!this.counter) return;

        const current = this.inputField.value.length;
        const max = this.options.maxLength;
        const remaining = max - current;

        this.counter.textContent = `${current} / ${max}`;

        this.counter.classList.remove('warning', 'danger');

        if (remaining < max * 0.2) {
            this.counter.classList.add('warning');
        }

        if (remaining < max * 0.1) {
            this.counter.classList.add('danger');
        }
    }

    /**
     * Mostrar tooltip
     */
    showTooltip(message) {
        if (!this.tooltip) return;

        this.tooltip.textContent = message;
        this.tooltip.classList.add('show');
    }

    /**
     * Ocultar tooltip
     */
    hideTooltip() {
        if (!this.tooltip) return;

        this.tooltip.classList.remove('show');
    }

    /**
     * Guardar posición en localStorage
     */
    savePosition() {
        if (!this.options.rememberPosition) return;

        const rect = this.element.getBoundingClientRect();

        localStorage.setItem(this.options.storageKey, JSON.stringify({
            top: rect.top,
            bottom: window.innerHeight - rect.bottom
        }));
    }

    /**
     * Cargar posición desde localStorage
     */
    loadPosition() {
        if (!this.options.rememberPosition) return;

        const saved = localStorage.getItem(this.options.storageKey);

        if (saved) {
            try {
                const pos = JSON.parse(saved);

                if (pos.top !== undefined) {
                    this.element.style.bottom = 'auto';
                    this.element.style.top = `${pos.top}px`;
                }
            } catch (error) {
                console.error('Error al cargar posición:', error);
            }
        }
    }

    /**
     * Establecer estado de loading
     */
    setLoading(loading) {
        if (loading) {
            this.element.classList.add('loading');
            this.button.disabled = true;
        } else {
            this.element.classList.remove('loading');
            this.button.disabled = false;
        }
    }

    /**
     * Destruir componente
     */
    destroy() {
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (error) {
                // Ignorar errores al detener
            }
        }

        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}

// Export para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FloatingInputBar;
}
