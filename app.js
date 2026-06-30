import Config from './config.js';
import SpotifyService from './spotify.js';
import LyricsService from './lyrics.js';

/**
 * LySinc - Lógica Principal do Aplicativo (Orquestrador de UI)
 */
class LySincApp {
    constructor() {
        // Elementos DOM de Telas
        this.screenPreLogin = document.getElementById('screen-pre-login');
        this.screenMain = document.getElementById('screen-main');
        this.screenIdle = document.getElementById('screen-idle');
        
        // Elementos DOM do Player
        this.albumArt = document.getElementById('album-art');
        this.albumArtBlur = document.getElementById('album-art-blur');
        this.trackName = document.getElementById('track-name');
        this.trackArtists = document.getElementById('track-artists');
        this.lyricsContainer = document.getElementById('lyrics-container');
        this.progressBar = document.getElementById('progress-bar');
        
        // Elementos DOM de Configuração / Modais
        this.btnConnect = document.getElementById('btn-connect');
        this.btnLogout = document.getElementById('btn-logout');
        this.btnSettings = document.getElementById('btn-settings');
        this.btnSettingsClose = document.getElementById('btn-settings-close');
        this.settingsModal = document.getElementById('settings-modal');
        this.inputClientId = document.getElementById('input-client-id');
        this.btnSaveSettings = document.getElementById('btn-save-settings');
        
        // Controles de UI adicionais
        this.btnToggleControls = document.getElementById('btn-toggle-controls');
        this.headerControlsContainer = document.getElementById('header-controls-container');
        this.btnFullscreen = document.getElementById('btn-fullscreen');
        this.iconToggleControls = document.getElementById('icon-toggle-controls');

        // Estado Interno da Música
        this.currentTrackId = null;
        this.lyrics = [];
        this.lyricsData = null; // Guardará o objeto completo de idiomas
        this.currentLyricsMode = 'original'; // original, translation, romanized
        this.activeLineId = null;
        this.currentLyricsProvider = 'lrclib'; // Provedor de letras padrão: LRCLIB
        
        // Estado do Relógio Interno (Ticker)
        this.isPlaying = false;
        this.progressMs = 0;
        this.lastSyncTime = 0; // Timestamp local do momento em que sincronizamos com a API
        this.durationMs = 0;
        this.animationFrameId = null;

        // Intervalo de Polling
        this.pollingIntervalId = null;

        // Estado do Scroll Manual do Usuário
        this.isUserInteracting = false;
        this.userScrollTimeout = null;
        this.lastAutoScrollTime = 0;

        // Expõe o gerenciador de notificações globalmente
        window.showToast = (message, type) => this.showToast(message, type);

        this.init();
    }

    async init() {
        try {
            console.log("%c LySinc v1.0.1 - Melhorias de Karaoke e Scroll Ativas ", "background: #10b981; color: #000; font-weight: bold; padding: 4px; border-radius: 4px;");
            this.setupEventListeners();
            this.loadSettings();

            // Modo de Demonstração Local (sem necessidade de API do Spotify)
            const urlParams = new URLSearchParams(window.location.search);
            this.isDemoMode = urlParams.get('mock') === 'true';

            if (this.isDemoMode) {
                this.setupDemoMode();
                return;
            }

            // Verifica se havia indicação de login anterior no localStorage para saber se expirou
            const hadRefreshToken = !!localStorage.getItem('lysinc_spotify_refresh_token');

            if (hadRefreshToken) {
                const btnConnectText = this.btnConnect.querySelector('span');
                if (btnConnectText) {
                    btnConnectText.textContent = 'Continuar com o Spotify';
                }
                // Se já tem refresh token, tenta validar imediatamente para ir direto ao app
                try {
                    const authenticated = await SpotifyService.isAuthenticated();
                    if (authenticated) {
                        this.showScreen('idle');
                        this.startPolling();
                        this.startTicker();
                        this.btnLogout.classList.remove('hidden');
                        return; // Pula o resto da inicialização convencional
                    }
                } catch (e) {
                    console.error('Falha silenciosa ao autenticar refresh token:', e);
                }
            }

            // Trata o callback do Spotify OAuth ou tenta renovação silenciosa em runtime
            let authenticated = false;
            try {
                authenticated = await SpotifyService.handleCallback();
            } catch (e) {
                console.error('Falha no handleCallback:', e);
            }
            
            if (authenticated) {
                this.showScreen('idle'); // Mostra tela de espera até obter a primeira resposta do player
                this.startPolling();
                this.startTicker();
                this.btnLogout.classList.remove('hidden'); // Exibe o botão de sair se logado
            } else {
                this.showScreen('pre-login');
                this.btnLogout.classList.add('hidden');
                
                // Se tinha refresh token mas falhou a validação agora, a sessão de fato expirou
                if (hadRefreshToken) {
                    this.showToast('Sessão expirada. Por favor, conecte-se novamente ao Spotify.', 'info');
                }

                // Se o Client ID não estiver configurado, abre as configurações para facilitar o uso
                if (!Config.getClientId()) {
                    this.toggleSettingsModal(true);
                }
            }
        } catch (globalError) {
            console.error('Erro crítico na inicialização do aplicativo LySinc:', globalError);
        }
    }

    setupDemoMode() {
        this.showScreen('main');
        
        const state = {
            isPlaying: true,
            isEmpty: false,
            progressMs: 0,
            durationMs: 32000, // 32 segundos de demo
            trackId: 'shape_of_you',
            trackName: 'Shape of You',
            artists: 'Ed Sheeran',
            albumName: 'Divide',
            albumArtUrl: 'assets/icons/lysinc-logo.svg'
        };

        this.isPlaying = true;
        this.progressMs = 0;
        this.lastSyncTime = Date.now();
        this.durationMs = state.durationMs;

        this.updateTrackDetails(state);
        this.loadLyricsForTrack(state).then(() => {
            this.startTicker();
            
            // Loop para simular o progresso da música continuamente na demonstração
            setInterval(() => {
                if (this.isPlaying) {
                    const elapsed = Date.now() - this.lastSyncTime;
                    const currentProgress = this.progressMs + elapsed;
                    if (currentProgress >= this.durationMs) {
                        this.progressMs = 0;
                        this.lastSyncTime = Date.now();
                    }
                }
            }, 1000);
        });

        // Oculta o botão logout na demonstração
        this.btnLogout.classList.add('hidden');
    }

    setupEventListeners() {
        this.btnConnect.addEventListener('click', () => SpotifyService.login());
        this.btnLogout.addEventListener('click', () => {
            if (window.confirm("Tem certeza que deseja sair e remover seus dados de login?")) {
                this.showToast('Limpando sessão e removendo dados locais...', 'info');
                setTimeout(() => {
                    SpotifyService.logout();
                }, 800);
            }
        });
        
        this.btnSettings.addEventListener('click', () => this.toggleSettingsModal(true));
        this.btnSettingsClose.addEventListener('click', () => this.toggleSettingsModal(false));
        this.btnSaveSettings.addEventListener('click', () => this.saveSettings());
        
        let controlsTimeout = null;

        const closeControls = () => {
            if (this.headerControlsContainer && !this.headerControlsContainer.classList.contains('translate-x-10')) {
                this.headerControlsContainer.classList.add('translate-x-10', 'opacity-0', 'pointer-events-none');
                if (this.iconToggleControls) this.iconToggleControls.innerHTML = '<path d="M15 18l-6-6 6-6"/>';
            }
        };

        const resetControlsTimeout = () => {
            if (controlsTimeout) clearTimeout(controlsTimeout);
            controlsTimeout = setTimeout(closeControls, 4000); // 4 segundos pra fechar
        };

        if (this.btnToggleControls) {
            this.btnToggleControls.addEventListener('click', (e) => {
                e.stopPropagation(); // Evita que o click se propague e feche imediatamente
                const isHidden = this.headerControlsContainer.classList.contains('translate-x-10');
                if (isHidden) {
                    this.headerControlsContainer.classList.remove('translate-x-10', 'opacity-0', 'pointer-events-none');
                    this.iconToggleControls.innerHTML = '<path d="M9 18l6-6-6-6"/>';
                    resetControlsTimeout();
                } else {
                    closeControls();
                }
            });
        }

        // Clicar fora ou em qualquer botão do header fecha os controles
        document.addEventListener('click', (e) => {
            if (this.headerControlsContainer && !this.headerControlsContainer.classList.contains('translate-x-10')) {
                const isClickInside = this.headerControlsContainer.contains(e.target);
                const isClickOnToggle = this.btnToggleControls && this.btnToggleControls.contains(e.target);
                
                if (!isClickInside && !isClickOnToggle) {
                    closeControls();
                }
                
                // Se clicou dentro (num botão por exemplo), fecha também
                if (isClickInside) {
                    setTimeout(closeControls, 300); // pequeno delay visual
                }
            }
        });

        if (this.btnFullscreen) {
            this.btnFullscreen.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(err => console.error(err));
                } else {
                    if (document.exitFullscreen) document.exitFullscreen();
                }
            });
        }
        
        // Clica fora do modal para fechar
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) {
                this.toggleSettingsModal(false);
            }
        });

        // Abas do rodapé de letras (Tradução / Romanização)
        document.querySelectorAll('.lyric-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.getAttribute('data-mode');
                this.changeLyricsMode(mode);
            });
        });

        // Clique no ícone para alterar dinamicamente o provedor (fonte) de letras
        const btnChangeSource = document.getElementById('btn-change-source');
        if (btnChangeSource) {
            btnChangeSource.addEventListener('click', async () => {
                const providers = ['apple', 'musixmatch', 'lrclib', 'netease'];
                const currentIndex = providers.indexOf(this.currentLyricsProvider);
                const nextIndex = (currentIndex + 1) % providers.length;
                this.currentLyricsProvider = providers[nextIndex];
                
                const providerLabels = {
                    'apple': 'Apple Music',
                    'musixmatch': 'Musixmatch',
                    'lrclib': 'LrcLib',
                    'netease': 'NetEase'
                };
                
                this.showToast(`Buscando letras via ${providerLabels[this.currentLyricsProvider]}...`, 'info');
                
                // Recarrega as letras da música atual com o novo provedor
                if (this.currentTrackId || this.isDemoMode) {
                    const currentTitle = this.trackName.textContent;
                    const currentArtists = this.trackArtists.textContent;
                    const state = {
                        trackId: this.currentTrackId || 'shape_of_you',
                        trackName: currentTitle,
                        artists: currentArtists,
                        albumName: '',
                        durationMs: this.durationMs
                    };
                    await this.loadLyricsForTrack(state);
                }
            });
        }

        // Detecção Fisiológica Dinâmica de Interação Manual do Usuário
        const handleUserInteraction = () => {
            this.isUserInteracting = true;
            if (this.userScrollTimeout) {
                clearTimeout(this.userScrollTimeout);
            }
            this.userScrollTimeout = setTimeout(() => {
                this.isUserInteracting = false;
                // Re-centraliza suavemente na linha ativa atual se ela existir
                if (this.activeLineId !== null) {
                    const activeEl = document.getElementById(`line-${this.activeLineId}`);
                    if (activeEl) {
                        this.scrollToLine(activeEl);
                    }
                }
            }, 3000); // 3 segundos de inatividade
        };

        // Ouvintes físicos de interação para capturar mouse, teclado e toque imediatamente
        window.addEventListener('wheel', handleUserInteraction, { passive: true });
        window.addEventListener('touchmove', handleUserInteraction, { passive: true });
        window.addEventListener('mousedown', handleUserInteraction, { passive: true });
        window.addEventListener('keydown', handleUserInteraction, { passive: true });

        // Ouvimos o evento 'scroll' global de forma inteligente
        window.addEventListener('scroll', () => {
            // Se o scroll ocorreu dentro de 800ms de um scroll automático, ignoramos
            if (Date.now() - this.lastAutoScrollTime < 800) {
                return;
            }
            // Caso contrário, foi uma rolagem real do usuário (inclui arrastar a barra de rolagem)
            handleUserInteraction();
        });
    }

    loadSettings() {
        // Exibe no input apenas o Client ID salvo localmente no localStorage por este usuário.
        // O Client ID padrão (Base64) embutido no código é ocultado e nunca exibido aqui.
        this.inputClientId.value = localStorage.getItem(Config.CLIENT_ID_KEY) || '';
    }

    saveSettings() {
        const id = this.inputClientId.value.trim();
        Config.setClientId(id);
        this.toggleSettingsModal(false);
        this.showToast('Configurações salvas! Agora você pode conectar sua conta do Spotify.', 'success');
    }

    toggleSettingsModal(show) {
        if (show) {
            this.settingsModal.classList.remove('hidden');
            this.settingsModal.classList.add('flex');
        } else {
            this.settingsModal.classList.add('hidden');
            this.settingsModal.classList.remove('flex');
        }
    }

    showScreen(screenName) {
        this.screenPreLogin.classList.add('hidden');
        this.screenMain.classList.add('hidden');
        this.screenIdle.classList.add('hidden');

        if (screenName === 'pre-login') {
            this.screenPreLogin.classList.remove('hidden');
        } else if (screenName === 'main') {
            this.screenMain.classList.remove('hidden');
        } else if (screenName === 'idle') {
            this.screenIdle.classList.remove('hidden');
        }
    }

    startPolling() {
        // Primeira busca imediata
        this.pollPlayerState();
        
        // Polling a cada 2.5 segundos
        this.pollingIntervalId = setInterval(() => {
            this.pollPlayerState();
        }, 2500);
    }

    stopPolling() {
        if (this.pollingIntervalId) {
            clearInterval(this.pollingIntervalId);
            this.pollingIntervalId = null;
        }
    }

    async pollPlayerState() {
        const state = await SpotifyService.getCurrentlyPlaying();
        
        // Se a chamada falhou ou não há token
        if (!state) {
            // Verifica se a autenticação caiu
            const authenticated = await SpotifyService.isAuthenticated();
            if (!authenticated) {
                this.stopPolling();
                this.showScreen('pre-login');
                this.btnLogout.classList.add('hidden');
                this.showToast('Sessão encerrada com o Spotify.', 'info');
            }
            return;
        }

        if (state.isEmpty || !state.isPlaying && !state.trackName) {
            this.isPlaying = false;
            this.currentTrackId = null;
            this.showScreen('idle');
            return;
        }

        // Atualiza a sincronização de tempo baseado puramente no relógio local para anular clock drift do servidor
        const latencyCompensation = Date.now() - state.requestTime;
        const safeCompensation = Math.max(0, Math.min(1500, latencyCompensation));

        this.isPlaying = state.isPlaying;
        this.progressMs = state.progressMs + safeCompensation;
        this.lastSyncTime = Date.now();
        this.durationMs = state.durationMs;

        // Se mudou de música ou ainda não carregou as letras
        if (state.trackId !== this.currentTrackId) {
            this.currentTrackId = state.trackId;
            this.updateTrackDetails(state);
            await this.loadLyricsForTrack(state);
        }

        this.showScreen('main');
        
        // Força sincronia imediata na interface
        if (this.lyrics.length > 0) {
            this.updateLyricsSync(this.progressMs);
        }
    }

    updateTrackDetails(state) {
        this.trackName.textContent = state.trackName;
        this.trackArtists.textContent = state.artists;
        
        // Efeito de imagem e fundo desfocado dinâmico (Apple Music style)
        if (state.albumArtUrl) {
            this.albumArt.src = state.albumArtUrl;
            this.albumArtBlur.style.backgroundImage = `url('${state.albumArtUrl}')`;
        } else {
            this.albumArt.src = '';
            this.albumArtBlur.style.backgroundImage = 'none';
        }
    }

    async loadLyricsForTrack(state) {
        this.lyricsContainer.innerHTML = '<div class="text-center text-white/50 text-xl py-20">Carregando letras sincronizadas...</div>';
        this.activeLineId = null;
        const footer = document.getElementById('lyrics-footer');
        if (footer) footer.classList.add('hidden');
        
        const fetchedLyrics = await LyricsService.getLyrics(
            state.trackName, 
            state.artists, 
            state.albumName, 
            state.durationMs,
            this.currentLyricsProvider
        );

        if (fetchedLyrics && fetchedLyrics.original && fetchedLyrics.original.length > 0) {
            this.lyricsData = fetchedLyrics;
            
            // Se o modo selecionado for tradução/romanização mas não estiver pré-carregado, aciona a carga assíncrona
            if (this.currentLyricsMode !== 'original' && !this.lyricsData[this.currentLyricsMode]) {
                this.lyrics = this.injectInstrumentalLines(this.lyricsData.original);
                this.renderLyrics();
                this.changeLyricsMode(this.currentLyricsMode);
            } else {
                this.lyrics = this.injectInstrumentalLines(this.lyricsData[this.currentLyricsMode] || this.lyricsData.original);
                this.renderLyrics();
            }
            
            // Exibe a fonte das letras e o seletor de abas
            if (footer) {
                const sourceText = document.getElementById('lyrics-source-text');
                if (sourceText) sourceText.textContent = `Letras via ${fetchedLyrics.source}`;
                footer.classList.remove('hidden');
            }

            // Força a atualização de sincronização e o scroll imediato para a linha ativa atual após renderizar
            this.activeLineId = null;
            const elapsed = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
            this.updateLyricsSync(this.progressMs + elapsed);
        } else {
            this.lyricsData = null;
            this.lyrics = [];
            this.lyricsContainer.innerHTML = `
                <div class="text-center text-white/40 text-xl py-20">
                    Letras não disponíveis para esta música.<br>
                    <span class="text-sm mt-2 block">Tente tocar outra música no Spotify para testar a sincronização!</span>
                </div>`;
            if (footer) footer.classList.add('hidden');
        }
    }

    // Alterna o idioma das letras mantendo a reprodução e processando sob demanda
    async changeLyricsMode(mode) {
        if (!this.lyricsData) return;
        
        // Altera a aba ativa na UI
        document.querySelectorAll('.lyric-tab-btn').forEach(btn => {
            if (btn.getAttribute('data-mode') === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        this.currentLyricsMode = mode;

        // Se o modo selecionado ainda não foi gerado no original, processa dinamicamente via GoogleService
        const needsTranslation = mode === 'translation' && this.lyricsData.original.some(line => !line.translation);
        const needsRomanization = mode === 'romanized' && this.lyricsData.original.some(line => !line.romanizedText);

        if (needsTranslation || needsRomanization) {
            if (mode === 'translation') {
                this.lyricsContainer.innerHTML = '<div class="text-center text-white/50 text-xl py-20">Traduzindo letras em tempo real...</div>';
                this.showToast('Traduzindo letras para o português...', 'info');
                
                const translated = await LyricsService.translateLyrics(this.lyricsData.original);
                this.lyricsData.original = translated;
            } else if (mode === 'romanized') {
                this.lyricsContainer.innerHTML = '<div class="text-center text-white/50 text-xl py-20">Gerando romanização das letras...</div>';
                this.showToast('Convertendo escrita para caracteres latinos...', 'info');
                
                const romanized = await LyricsService.romanizeLyrics(this.lyricsData.original);
                this.lyricsData.original = romanized;
            }
        }

        this.lyrics = this.injectInstrumentalLines(this.lyricsData.original);
        
        // Re-renderiza e alinha instantaneamente
        this.renderLyrics();
        
        const elapsedSinceSync = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
        const currentProgressMs = Math.min(this.progressMs + elapsedSinceSync, this.durationMs);
        this.activeLineId = null; // Força re-realce da linha
        this.updateLyricsSync(currentProgressMs);
    }

    injectInstrumentalLines(lines) {
        if (!lines || lines.length === 0) return lines;
        const result = [];
        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];
            if (i > 0) {
                const prevLine = lines[i - 1];
                if (currentLine.timestamp - prevLine.endtime > 5000) {
                    result.push({
                        id: `inst-${i}`,
                        text: [{ text: '♪', timestamp: prevLine.endtime + 500, endtime: currentLine.timestamp - 500 }],
                        background: false,
                        backgroundText: [],
                        timestamp: prevLine.endtime + 500,
                        endtime: currentLine.timestamp - 500,
                        isWordSynced: true
                    });
                }
            }
            result.push(currentLine);
        }
        return result;
    }

    renderLyrics() {
        this.lyricsContainer.innerHTML = '';
        window.scrollTo({ top: 0, behavior: 'instant' });

        this.lyrics.forEach((line) => {
            const lineEl = document.createElement('div');
            lineEl.id = `line-${line.id}`;
            
            let lineClass = 'lyric-line py-3 my-2 transition-all duration-300';
            if (this.activeLineId === line.id) {
                lineClass += ' active';
            } else {
                lineClass += ' inactive';
            }
            if (line.oppositeTurn || line.alignment === 'end') {
                lineClass += ' text-right justify-end ml-auto pl-6 pr-0 singer-right';
            } else {
                lineClass += ' text-left justify-start mr-auto pr-6 pl-0';
            }

            if (!line.isWordSynced) {
                lineClass += ' line-synced';
            }
            
            const isInstrumental = line.text.length === 1 && line.text[0].text.trim() === '♪';
            if (isInstrumental) {
                lineClass += ' instrumental-line text-center w-full justify-center mx-auto pr-0 pl-0';
            }
            
            lineEl.className = lineClass;
            
            // Clique para saltar no player do Spotify
            lineEl.addEventListener('click', () => {
                const firstSyl = line.text[0];
                if (firstSyl) {
                    this.seekToTime(firstSyl.timestamp);
                }
            });

            const lineContainer = document.createElement('div');
            lineContainer.className = 'lyrics-line-container';

            // Voz principal
            const mainVocal = document.createElement('div');
            mainVocal.className = 'main-vocal-container';
            if (isInstrumental) {
                const sylSpan = document.createElement('span');
                sylSpan.className = 'lyrics-syllable instrumental-icon';
                sylSpan.id = `word-${line.id}-0`;
                sylSpan.innerHTML = '♪';
                mainVocal.appendChild(sylSpan);
            } else {
                line.text.forEach((syl, idx) => {
                    const sylSpan = document.createElement('span');
                    sylSpan.className = 'lyrics-syllable';
                    sylSpan.id = `word-${line.id}-${idx}`;
                    sylSpan.textContent = syl.text;
                    mainVocal.appendChild(sylSpan);
                });
            }
            lineContainer.appendChild(mainVocal);

            // Voz secundária (Backing Vocal)
            if (line.background && line.backgroundText && line.backgroundText.length > 0) {
                const bgVocal = document.createElement('div');
                bgVocal.className = 'background-vocal-container';
                
                line.backgroundText.forEach((syl, idx) => {
                    const sylSpan = document.createElement('span');
                    sylSpan.className = 'lyrics-syllable backing-vocal';
                    sylSpan.id = `bgword-${line.id}-${idx}`;
                    sylSpan.textContent = syl.text;
                    bgVocal.appendChild(sylSpan);
                });
                lineContainer.appendChild(bgVocal);
            }

            // Tradução ou Romanização na interface
            if (this.currentLyricsMode === 'translation' && line.translation) {
                const transEl = document.createElement('div');
                transEl.className = 'lyrics-translation-container';
                transEl.textContent = line.translation;
                lineContainer.appendChild(transEl);
            } else if (this.currentLyricsMode === 'romanized' && line.romanizedText) {
                const romEl = document.createElement('div');
                romEl.className = 'lyrics-romanization-container';
                romEl.textContent = line.romanizedText;
                lineContainer.appendChild(romEl);
            }

            lineEl.appendChild(lineContainer);
            this.lyricsContainer.appendChild(lineEl);
        });
    }

    // Calcula o progresso em milissegundos localmente a cada frame
    startTicker() {
        const tick = () => {
            if (this.isPlaying && this.lastSyncTime > 0) {
                const elapsedSinceSync = Date.now() - this.lastSyncTime;
                const currentProgressMs = Math.min(this.progressMs + elapsedSinceSync, this.durationMs);
                
                this.updateProgressBar(currentProgressMs);
                
                // Aplica tempo exato da música (sem compensação de adiantamento, já lidado pela rede)
                this.updateLyricsSync(currentProgressMs);
            }
            this.animationFrameId = requestAnimationFrame(tick);
        };
        
        this.animationFrameId = requestAnimationFrame(tick);
    }

    updateProgressBar(currentProgressMs) {
        if (this.durationMs > 0) {
            const percentage = (currentProgressMs / this.durationMs) * 100;
            this.progressBar.style.width = `${percentage}%`;
        }
    }

    updateLyricsSync(currentProgressMs) {
        if (this.lyrics.length === 0) return;

        // Encontra todas as linhas ativas correspondentes ao tempo (suporta sobreposições!)
        const activeLines = this.lyrics.filter(line => currentProgressMs >= line.timestamp && currentProgressMs < line.endtime);
        const activeLineIds = new Set(activeLines.map(l => l.id));
        
        let minActiveId = Infinity;
        if (activeLines.length > 0) {
            activeLines.forEach(l => {
                if (l.id < minActiveId) minActiveId = l.id;
            });
        }

        // Se a linha ativa principal (a primeira das ativas) mudou
        if (activeLines.length > 0) {
            const primaryActiveId = minActiveId;
            if (primaryActiveId !== this.activeLineId) {
                this.activeLineId = primaryActiveId;
                this.highlightActiveLines(activeLineIds, primaryActiveId);
            }
        } else if (this.activeLineId !== null) {
            this.activeLineId = null;
            this.clearHighlights();
        }

        // Sincronização interna de todas as palavras (karaoke fluido de 0% a 100%)
        this.lyrics.forEach((line) => {
            const isActive = activeLineIds.has(line.id);
            const isPassed = activeLines.length > 0 
                ? line.id < minActiveId 
                : (this.activeLineId !== null ? line.id < this.activeLineId : false);

            // Sincroniza sílabas da voz principal
            line.text.forEach((syl, idx) => {
                const wordEl = document.getElementById(`word-${line.id}-${idx}`);
                if (wordEl) {
                    if (isPassed || currentProgressMs >= syl.endtime) {
                        wordEl.style.setProperty('--word-progress', '100%');
                        wordEl.classList.add('passed');
                        wordEl.classList.remove('current');
                    } else if (currentProgressMs < syl.timestamp) {
                        wordEl.style.setProperty('--word-progress', '0%');
                        wordEl.classList.remove('passed', 'current');
                    } else {
                        // Sílaba sendo cantada no frame atual
                        const duration = syl.endtime - syl.timestamp;
                        const elapsed = currentProgressMs - syl.timestamp;
                        const progress = duration > 0 ? (elapsed / duration) * 100 : 0;
                        wordEl.style.setProperty('--word-progress', `${progress}%`);
                        wordEl.classList.add('current');
                        wordEl.classList.remove('passed');
                    }
                }
            });

            // Sincroniza sílabas da voz secundária (backing vocal)
            if (line.backgroundText && line.backgroundText.length > 0) {
                line.backgroundText.forEach((syl, idx) => {
                    const wordEl = document.getElementById(`bgword-${line.id}-${idx}`);
                    if (wordEl) {
                        if (isPassed || currentProgressMs >= syl.endtime) {
                            wordEl.style.setProperty('--word-progress', '100%');
                            wordEl.classList.add('passed');
                            wordEl.classList.remove('current');
                        } else if (currentProgressMs < syl.timestamp) {
                            wordEl.style.setProperty('--word-progress', '0%');
                            wordEl.classList.remove('passed', 'current');
                        } else {
                            const duration = syl.endtime - syl.timestamp;
                            const elapsed = currentProgressMs - syl.timestamp;
                            const progress = duration > 0 ? (elapsed / duration) * 100 : 0;
                            wordEl.style.setProperty('--word-progress', `${progress}%`);
                            wordEl.classList.add('current');
                            wordEl.classList.remove('passed');
                        }
                    }
                });
            }
        });
    }

    highlightActiveLines(activeLineIds, scrollTargetId) {
        // Atualiza classes de todas as linhas
        this.lyrics.forEach((line) => {
            const el = document.getElementById(`line-${line.id}`);
            if (el) {
                if (activeLineIds.has(line.id)) {
                    el.classList.remove('inactive');
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                    el.classList.add('inactive');
                }
            }
        });

        // Rola a linha ativa suavemente para o centro se o usuário não estiver interagindo manualmente
        if (!this.isUserInteracting) {
            const targetEl = document.getElementById(`line-${scrollTargetId}`);
            if (targetEl) {
                this.scrollToLine(targetEl);
            }
        }
    }

    clearHighlights() {
        this.lyrics.forEach((line) => {
            const el = document.getElementById(`line-${line.id}`);
            if (el) {
                el.classList.remove('active');
                el.classList.add('inactive');
            }
            
            // Limpa voz principal
            line.text.forEach((_, idx) => {
                const wordEl = document.getElementById(`word-${line.id}-${idx}`);
                if (wordEl) {
                    wordEl.style.removeProperty('--word-progress');
                    wordEl.classList.remove('passed', 'current');
                }
            });

            // Limpa voz secundária
            if (line.backgroundText && line.backgroundText.length > 0) {
                line.backgroundText.forEach((_, idx) => {
                    const wordEl = document.getElementById(`bgword-${line.id}-${idx}`);
                    if (wordEl) {
                        wordEl.style.removeProperty('--word-progress');
                        wordEl.classList.remove('passed', 'current');
                    }
                });
            }
        });
    }

    scrollToLine(lineElement) {
        const lineRect = lineElement.getBoundingClientRect();
        
        // Posição absoluta da linha na página
        const absoluteLineTop = window.scrollY + lineRect.top;
        
        // Alinhamento ideal a 35% do topo da janela do navegador
        const targetScrollTop = absoluteLineTop - (window.innerHeight * 0.35) + (lineRect.height / 2);
        
        this.lastAutoScrollTime = Date.now();

        window.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
        });
    }

    // Navega para o tempo clicado usando o Spotify Connect API (Premium requerido)
    async seekToTime(timeMs) {
        const token = await SpotifyService.getValidToken();
        if (!token) return;

        try {
            const response = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${timeMs}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 403) {
                this.showToast('Navegação temporal por letras requer conta Spotify Premium.', 'error');
                return;
            }

            if (!response.ok) {
                throw new Error('Falha ao pular reprodução');
            }

            // Atualiza localmente para resposta rápida imediata
            this.progressMs = timeMs;
            this.lastSyncTime = Date.now();
            this.updateLyricsSync(timeMs);
        } catch (error) {
            console.error('Erro ao pular reprodução:', error);
            this.showToast('Erro ao atualizar a reprodução no Spotify.', 'error');
        }
    }

    // Exibe notificação popup estilizada (Toast) na tela
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        // Cria o elemento da notificação
        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;

        // Indicador de tipo colorido
        const indicator = document.createElement('div');
        indicator.className = 'toast-type-indicator';
        toast.appendChild(indicator);

        // Texto do conteúdo
        const textContainer = document.createElement('div');
        textContainer.className = 'flex-1 text-sm font-medium mr-4';
        textContainer.textContent = message;
        toast.appendChild(textContainer);

        // Botão de fechar
        const closeBtn = document.createElement('button');
        closeBtn.className = 'text-white/40 hover:text-white transition-colors focus:outline-none';
        closeBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
        `;
        toast.appendChild(closeBtn);

        // Injeta no contêiner
        container.appendChild(toast);

        // Função de remoção com animação
        const removeToast = () => {
            if (toast.classList.contains('toast-hide')) return;
            toast.classList.add('toast-hide');
            // Aguarda a animação terminar
            setTimeout(() => {
                toast.remove();
            }, 300);
        };

        // Evento de clique para fechar imediatamente
        closeBtn.addEventListener('click', removeToast);

        // Auto-dismiss após 4 segundos
        setTimeout(removeToast, 4000);
    }
}

// Inicializa a aplicação quando o DOM estiver completamente pronto e os nós do cabeçalho acessíveis
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new LySincApp();
    });
} else {
    window.app = new LySincApp();
}
