/**
 * VoiceInput Component
 * Input de texto con reconocimiento de voz (Speech-to-Text)
 * Usa Web Speech API para convertir voz a texto
 * Version: 1.0.0
 */

class VoiceInput {
    constructor(container, options = {}) {
        // Configuración por defecto
        this.options = {
            language: 'es-ES',
            continuous: false,
            interimResults: true,
            maxLength: 5000,
            autoActivateOnFocus: false,
            placeholder: 'Escribe o presiona 🎤 para hablar...',
            showLanguageSelector: true,
            showClearButton: true,
            showWaveform: true,
            textarea: false,
            autoPunctuation: true,
            onResult: null,
            onStart: null,
            onEnd: null,
            onError: null,
            ...options
        };

        // Referencias
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this.container) {
            throw new Error('Container not found');
        }

        // Estado
        this.isListening = false;
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.recognition = null;
        this.currentLanguage = this.options.language;

        // Verificar soporte del navegador
        this.checkBrowserSupport();

        // Inicializar
        this.init();
    }

    /**
     * Verificar soporte de Speech Recognition
     */
    checkBrowserSupport() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            this.isSupported = false;
            console.warn('VoiceInput: Web Speech API no soportada en este navegador');
        } else {
            this.isSupported = true;
            this.SpeechRecognition = SpeechRecognition;
        }
    }

    /**
     * Inicializar componente
     */
    init() {
        this.createElements();
        this.setupRecognition();
        this.attachEventListeners();
    }

    /**
     * Crear elementos del DOM
     */
    createElements() {
        this.container.innerHTML = '';
        this.container.className = 'voice-input-container';

        // Mensaje de navegador no soportado
        if (!this.isSupported) {
            const unsupported = document.createElement('div');
            unsupported.className = 'voice-unsupported';
            unsupported.innerHTML = `
                <div class="voice-unsupported-icon">⚠️</div>
                <div>Tu navegador no soporta reconocimiento de voz.</div>
                <div style="font-size: 12px; margin-top: 4px;">
                    Usa Chrome, Edge o Safari para esta funcionalidad.
                </div>
            `;
            this.container.appendChild(unsupported);
        }

        // Wrapper principal
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'voice-input-wrapper';

        // Input field (input o textarea)
        this.inputField = document.createElement(this.options.textarea ? 'textarea' : 'input');
        this.inputField.className = 'voice-input-field' + (this.options.textarea ? ' textarea' : '');
        this.inputField.type = this.options.textarea ? undefined : 'text';
        this.inputField.placeholder = this.options.placeholder;
        this.inputField.maxLength = this.options.maxLength;

        // Waveform (animación de ondas)
        if (this.options.showWaveform) {
            this.waveform = document.createElement('div');
            this.waveform.className = 'voice-waveform';
            for (let i = 0; i < 5; i++) {
                const bar = document.createElement('div');
                bar.className = 'voice-wave-bar';
                this.waveform.appendChild(bar);
            }
        }

        // Contenedor de botones
        this.buttonsContainer = document.createElement('div');
        this.buttonsContainer.className = 'voice-input-buttons';

        // Botón de limpiar
        if (this.options.showClearButton) {
            this.clearButton = document.createElement('button');
            this.clearButton.className = 'voice-btn voice-btn-clear';
            this.clearButton.innerHTML = '🗑️';
            this.clearButton.title = 'Limpiar texto';
            this.clearButton.setAttribute('aria-label', 'Limpiar texto');
            this.buttonsContainer.appendChild(this.clearButton);
        }

        // Botón de idioma
        if (this.options.showLanguageSelector && this.isSupported) {
            this.langButton = document.createElement('button');
            this.langButton.className = 'voice-btn voice-btn-lang';
            this.langButton.innerHTML = '🌐';
            this.langButton.title = 'Cambiar idioma';
            this.langButton.setAttribute('aria-label', 'Selector de idioma');
            this.buttonsContainer.appendChild(this.langButton);

            // Selector de idioma
            this.langSelector = this.createLanguageSelector();
            this.wrapper.appendChild(this.langSelector);
        }

        // Botón de micrófono
        if (this.isSupported) {
            this.micButton = document.createElement('button');
            this.micButton.className = 'voice-btn voice-btn-mic';
            this.micButton.innerHTML = '🎤';
            this.micButton.title = 'Activar micrófono';
            this.micButton.setAttribute('aria-label', 'Activar reconocimiento de voz');
            this.buttonsContainer.appendChild(this.micButton);
        }

        // Waveform (si está habilitado)
        if (this.options.showWaveform && this.waveform) {
            this.buttonsContainer.insertBefore(this.waveform, this.buttonsContainer.firstChild);
        }

        // Ensamblar
        this.wrapper.appendChild(this.inputField);
        this.wrapper.appendChild(this.buttonsContainer);
        this.container.appendChild(this.wrapper);

        // Indicador de estado
        this.statusIndicator = document.createElement('div');
        this.statusIndicator.className = 'voice-status';
        this.statusIndicator.innerHTML = '<span class="voice-status-icon">🎤</span><span class="voice-status-text">Listo</span>';
        this.container.appendChild(this.statusIndicator);
    }

    /**
     * Crear selector de idiomas
     */
    createLanguageSelector() {
        const selector = document.createElement('div');
        selector.className = 'voice-lang-selector';

        const languages = [
            { code: 'es-ES', name: '🇪🇸 Español (España)' },
            { code: 'es-MX', name: '🇲🇽 Español (México)' },
            { code: 'es-AR', name: '🇦🇷 Español (Argentina)' },
            { code: 'en-US', name: '🇺🇸 English (US)' },
            { code: 'en-GB', name: '🇬🇧 English (UK)' },
            { code: 'pt-BR', name: '🇧🇷 Português (Brasil)' },
            { code: 'fr-FR', name: '🇫🇷 Français' },
            { code: 'de-DE', name: '🇩🇪 Deutsch' },
            { code: 'it-IT', name: '🇮🇹 Italiano' }
        ];

        languages.forEach(lang => {
            const option = document.createElement('div');
            option.className = 'voice-lang-option';
            if (lang.code === this.currentLanguage) {
                option.classList.add('selected');
            }
            option.textContent = lang.name;
            option.dataset.lang = lang.code;
            selector.appendChild(option);
        });

        return selector;
    }

    /**
     * Configurar Speech Recognition API
     */
    setupRecognition() {
        if (!this.isSupported) return;

        this.recognition = new this.SpeechRecognition();
        this.recognition.lang = this.currentLanguage;
        this.recognition.continuous = this.options.continuous;
        this.recognition.interimResults = this.options.interimResults;
        this.recognition.maxAlternatives = 1;

        // Event: Resultado
        this.recognition.onresult = (event) => {
            let interim = '';
            let final = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;

                if (event.results[i].isFinal) {
                    final += transcript;
                } else {
                    interim += transcript;
                }
            }

            // Actualizar transcripts
            if (final) {
                this.finalTranscript += final + ' ';
                this.updateInputValue();
            }

            this.interimTranscript = interim;
            this.displayInterimResults();

            // Callback
            if (this.options.onResult) {
                this.options.onResult({
                    final: this.finalTranscript,
                    interim: this.interimTranscript,
                    complete: final.length > 0
                });
            }
        };

        // Event: Start
        this.recognition.onstart = () => {
            this.isListening = true;
            this.updateUI('listening');
            this.showStatus('listening', '🔴 Escuchando...');

            if (this.options.onStart) {
                this.options.onStart();
            }
        };

        // Event: End
        this.recognition.onend = () => {
            this.isListening = false;
            this.updateUI('idle');
            this.showStatus('success', '✓ Completado', 2000);

            if (this.options.onEnd) {
                this.options.onEnd(this.finalTranscript);
            }
        };

        // Event: Error
        this.recognition.onerror = (event) => {
            console.error('VoiceInput Error:', event.error);
            this.isListening = false;
            this.updateUI('error');

            let errorMessage = 'Error desconocido';

            switch (event.error) {
                case 'no-speech':
                    errorMessage = 'No se detectó voz';
                    break;
                case 'audio-capture':
                    errorMessage = 'Micrófono no disponible';
                    break;
                case 'not-allowed':
                    errorMessage = 'Permiso denegado';
                    break;
                case 'network':
                    errorMessage = 'Error de red';
                    break;
                case 'aborted':
                    errorMessage = 'Reconocimiento cancelado';
                    break;
            }

            this.showStatus('error', `⚠️ ${errorMessage}`, 3000);

            if (this.options.onError) {
                this.options.onError(event.error, errorMessage);
            }
        };
    }

    /**
     * Adjuntar event listeners
     */
    attachEventListeners() {
        // Botón de micrófono
        if (this.micButton) {
            this.micButton.addEventListener('click', () => {
                this.toggleListening();
            });
        }

        // Botón de limpiar
        if (this.clearButton) {
            this.clearButton.addEventListener('click', () => {
                this.clear();
            });
        }

        // Botón de idioma
        if (this.langButton) {
            this.langButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.langSelector.classList.toggle('active');
            });

            // Opciones de idioma
            this.langSelector.querySelectorAll('.voice-lang-option').forEach(option => {
                option.addEventListener('click', () => {
                    this.setLanguage(option.dataset.lang);
                    this.langSelector.classList.remove('active');
                });
            });

            // Cerrar selector al hacer click fuera
            document.addEventListener('click', (e) => {
                if (!this.langSelector.contains(e.target) && e.target !== this.langButton) {
                    this.langSelector.classList.remove('active');
                }
            });
        }

        // Auto-activar al focus (opcional)
        if (this.options.autoActivateOnFocus && this.isSupported) {
            this.inputField.addEventListener('focus', () => {
                if (!this.isListening) {
                    this.startListening();
                }
            });
        }

        // Input manual (escribir a mano)
        this.inputField.addEventListener('input', () => {
            this.finalTranscript = this.inputField.value;
        });
    }

    /**
     * Toggle listening (activar/desactivar micrófono)
     */
    toggleListening() {
        if (this.isListening) {
            this.stopListening();
        } else {
            this.startListening();
        }
    }

    /**
     * Iniciar escucha
     */
    startListening() {
        if (!this.isSupported) {
            console.warn('VoiceInput: Speech Recognition no soportado');
            return;
        }

        if (this.isListening) return;

        try {
            this.recognition.start();
        } catch (error) {
            console.error('VoiceInput: Error al iniciar reconocimiento', error);
        }
    }

    /**
     * Detener escucha
     */
    stopListening() {
        if (!this.isListening) return;

        try {
            this.recognition.stop();
        } catch (error) {
            console.error('VoiceInput: Error al detener reconocimiento', error);
        }
    }

    /**
     * Actualizar UI según estado
     */
    updateUI(state) {
        // Wrapper
        this.wrapper.classList.remove('listening', 'error');

        if (state === 'listening') {
            this.wrapper.classList.add('listening');
            this.micButton.innerHTML = '🔴';
            this.micButton.classList.add('listening');
            this.micButton.title = 'Detener grabación';

            if (this.waveform) {
                this.waveform.classList.add('active');
            }
        } else if (state === 'error') {
            this.wrapper.classList.add('error');
            this.micButton.innerHTML = '🎤';
            this.micButton.classList.remove('listening');
            this.micButton.title = 'Activar micrófono';

            if (this.waveform) {
                this.waveform.classList.remove('active');
            }
        } else {
            // idle
            this.micButton.innerHTML = '🎤';
            this.micButton.classList.remove('listening');
            this.micButton.title = 'Activar micrófono';

            if (this.waveform) {
                this.waveform.classList.remove('active');
            }
        }
    }

    /**
     * Mostrar status
     */
    showStatus(type, message, duration = 0) {
        this.statusIndicator.className = `voice-status active ${type}`;
        this.statusIndicator.querySelector('.voice-status-text').textContent = message;

        if (duration > 0) {
            setTimeout(() => {
                this.statusIndicator.classList.remove('active');
            }, duration);
        }
    }

    /**
     * Mostrar resultados provisionales (interim)
     */
    displayInterimResults() {
        if (!this.options.interimResults) return;

        // Mostrar final + interim en el input
        const displayValue = this.finalTranscript + this.interimTranscript;
        this.inputField.value = displayValue;
    }

    /**
     * Actualizar valor del input
     */
    updateInputValue() {
        this.inputField.value = this.finalTranscript.trim();
    }

    /**
     * Limpiar input
     */
    clear() {
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.inputField.value = '';
        this.inputField.focus();
        this.showStatus('success', '✓ Limpiado', 1500);
    }

    /**
     * Cambiar idioma
     */
    setLanguage(langCode) {
        this.currentLanguage = langCode;

        if (this.recognition) {
            this.recognition.lang = langCode;
        }

        // Actualizar UI del selector
        this.langSelector.querySelectorAll('.voice-lang-option').forEach(option => {
            if (option.dataset.lang === langCode) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });

        this.showStatus('success', `✓ Idioma: ${langCode}`, 2000);
    }

    /**
     * Obtener valor actual
     */
    getValue() {
        return this.finalTranscript.trim();
    }

    /**
     * Establecer valor
     */
    setValue(value) {
        this.finalTranscript = value;
        this.inputField.value = value;
    }

    /**
     * Resetear componente
     */
    reset() {
        this.stopListening();
        this.clear();
    }

    /**
     * Destruir componente
     */
    destroy() {
        this.stopListening();

        if (this.recognition) {
            this.recognition = null;
        }

        this.container.innerHTML = '';
    }
}

// Export para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VoiceInput;
}
