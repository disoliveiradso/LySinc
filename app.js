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
        this.btnRecenter = document.getElementById('btn-recenter');
        this.btnLogout = document.getElementById('btn-logout');
        this.btnSettings = document.getElementById('btn-settings');
        this.btnSettingsClose = document.getElementById('btn-settings-close');
        this.settingsModal = document.getElementById('settings-modal');
        this.inputClientId = document.getElementById('input-client-id');
        this.btnSaveSettings = document.getElementById('btn-save-settings');
        this.confirmLogoutModal = document.getElementById('confirm-logout-modal');
        
        // Controles de UI adicionais
        this.btnToggleControls = document.getElementById('btn-toggle-controls');
        this.headerControlsContainer = document.getElementById('header-controls-container');
        this.btnFullscreen = document.getElementById('btn-fullscreen');
        this.iconToggleControls = document.getElementById('icon-toggle-controls');

        // Offset Global
        this.syncOffset = 0;

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

        // Offset manual de sincronização (em ms)
        this.syncOffset = 0;

        // Oculta o botão logout na demonstração
        this.btnLogout.classList.add('hidden');
    }

    setupEventListeners() {
        this.btnConnect.addEventListener('click', () => SpotifyService.login());
        this.btnLogout.addEventListener('click', () => {
            if (this.confirmLogoutModal) {
                this.confirmLogoutModal.classList.remove('hidden');
                this.confirmLogoutModal.classList.add('flex');
            } else {
                if (window.confirm("Tem certeza que deseja sair e remover seus dados de login?")) {
                    window.localStorage.removeItem(Config.CLIENT_ID_KEY);
                    this.btnLogout.classList.add('hidden');
                    this.showToast('Sessão encerrada com o Spotify.', 'info');
                }
            }
        });
        
        this.btnSettings.addEventListener('click', () => this.toggleSettingsModal(true));
        this.btnSettingsClose.addEventListener('click', () => this.toggleSettingsModal(false));
        this.btnSaveSettings.addEventListener('click', () => this.saveSettings());
        
        // Botão Fechar Modal Customizado de Sair
        const btnConfirmLogout = document.getElementById('btn-confirm-logout');
        const btnCancelLogout = document.getElementById('btn-cancel-logout');
        
        if (btnConfirmLogout) {
            btnConfirmLogout.addEventListener('click', () => {
                window.localStorage.removeItem(Config.CLIENT_ID_KEY);
                this.confirmLogoutModal.classList.add('hidden');
                this.confirmLogoutModal.classList.remove('flex');
                this.btnLogout.classList.add('hidden');
                this.showToast('Sessão encerrada com o Spotify.', 'info');
                // Opcionalmente dar um reload na página
                setTimeout(() => window.location.reload(), 1500);
            });
        }
        
        if (btnCancelLogout) {
            btnCancelLogout.addEventListener('click', () => {
                this.confirmLogoutModal.classList.add('hidden');
                this.confirmLogoutModal.classList.remove('flex');
            });
        }

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

        // Lógica de ocultar cursor em Tela Cheia após 3s inativo
        let mouseHideTimeout = null;
        
        const hideMousePointer = () => {
            if (document.fullscreenElement) {
                document.body.style.cursor = 'none';
            }
        };

        const resetMousePointer = () => {
            document.body.style.cursor = 'default';
            if (mouseHideTimeout) clearTimeout(mouseHideTimeout);
            
            if (document.fullscreenElement) {
                mouseHideTimeout = setTimeout(hideMousePointer, 3000);
            }
        };

        document.addEventListener('mousemove', resetMousePointer);
        
        document.addEventListener('fullscreenchange', () => {
            resetMousePointer(); // Reseta imediatamente se entrou ou saiu do fullscreen
            if (!document.fullscreenElement) {
                if (mouseHideTimeout) clearTimeout(mouseHideTimeout);
                document.body.style.cursor = 'default';
            }
        });
        
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

        // Controles de Sincronização (Offset)
        const btnSyncUp = document.getElementById('btn-sync-up');
        const btnSyncDown = document.getElementById('btn-sync-down');
        const btnSyncReset = document.getElementById('btn-sync-reset');

        if (btnSyncUp) {
            btnSyncUp.addEventListener('click', () => this.adjustSyncOffset(100));
        }
        if (btnSyncDown) {
            btnSyncDown.addEventListener('click', () => this.adjustSyncOffset(-100));
        }
        if (btnSyncReset) {
            btnSyncReset.addEventListener('click', () => this.adjustSyncOffset(0, true));
        }
        
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
            if (!this.isUserInteracting && this.activeLineId !== null) {
                this.isUserInteracting = true;
                // Mostra botão de Sincronizar
                this.btnRecenter.classList.remove('hidden');
                // Pequeno delay para animação de fade in (por causa do display:none do hidden)
                requestAnimationFrame(() => {
                    this.btnRecenter.classList.remove('opacity-0', 'translate-y-4');
                });
            }
        };
        
        // Listener do botão de ressincronizar
        this.btnRecenter.addEventListener('click', () => {
            this.isUserInteracting = false;
            this.btnRecenter.classList.add('opacity-0', 'translate-y-4');
            setTimeout(() => this.btnRecenter.classList.add('hidden'), 300);
            
            if (this.activeLineId !== null) {
                const activeEl = document.getElementById(`line-${this.activeLineId}`);
                if (activeEl) {
                    this.scrollToLine(activeEl);
                }
            }
        });

        // Ouvintes físicos de interação para capturar rolagem de mouse e toque
        window.addEventListener('wheel', handleUserInteraction, { passive: true });
        window.addEventListener('touchmove', handleUserInteraction, { passive: true });

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

    adjustSyncOffset(ms, reset = false) {
        if (reset) {
            this.syncOffset = 0;
        } else {
            this.syncOffset += ms;
        }
        
        const display = document.getElementById('sync-offset-display');
        if (display) {
            display.textContent = (this.syncOffset / 1000).toFixed(1) + 's';
        }
        
        // Re-sincroniza as letras instantaneamente
        this.activeLineId = null;
        if (this.lyricsContainer) {
            const els = this.lyricsContainer.querySelectorAll('.lyric-line, .lyrics-syllable');
            els.forEach(el => el.classList.remove('active', 'passed', 'current'));
            
            const elapsed = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
            this.updateLyricsSync(this.progressMs + elapsed + this.syncOffset);
        }
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
        const stateTrackId = state.trackId || (state.trackName + state.albumName);

        // Se a música é nova ou tá no começo, ignora a compensação de latência
        // Isso previne o "adiantamento" (aceleração artificial) das letras enquanto o Spotify carrega o buffer de áudio real
        let safeCompensation = Math.max(0, Math.min(1500, latencyCompensation));
        if (stateTrackId !== this.currentTrackId || state.progressMs < 2000) {
            safeCompensation = 0;
        }

        const oldProgressMs = this.progressMs;
        const oldDurationMs = this.durationMs;

        this.isPlaying = state.isPlaying;
        this.progressMs = state.progressMs + safeCompensation;
        this.lastSyncTime = Date.now();
        this.durationMs = state.durationMs;

        // Se mudou de música ou ainda não carregou as letras
        if (stateTrackId !== this.currentTrackId) {
            this.currentTrackId = stateTrackId;
            this.adjustSyncOffset(0, true);
            
            this.progressMs = state.progressMs + safeCompensation;
            this.lastSyncTime = Date.now();
            
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
        
        // Aplica o marquee (Ping-Pong Effect) para Título e Artistas
        setTimeout(() => {
            this.setupMarquee(this.trackName);
            this.setupMarquee(this.trackArtists);
        }, 50);
        
        // Efeito de imagem e fundo desfocado dinâmico (Apple Music style)
        if (state.albumArtUrl) {
            this.albumArt.src = state.albumArtUrl;
            this.albumArtBlur.style.backgroundImage = `url('${state.albumArtUrl}')`;
        } else {
            this.albumArt.src = '';
            this.albumArtBlur.style.backgroundImage = 'none';
        }
    }

    setupMarquee(element) {
        const containerWidth = element.parentElement.clientWidth;
        element.classList.remove('truncate');
        const textWidth = element.scrollWidth;

        if (textWidth > containerWidth) {
            element.style.setProperty('--scroll-dist', `-${textWidth - containerWidth + 30}px`);
            element.classList.add('marquee-text');
            element.parentElement.classList.add('overflow-hidden');
        } else {
            element.classList.add('truncate');
            element.classList.remove('marquee-text');
            element.style.removeProperty('--scroll-dist');
            element.parentElement.classList.remove('overflow-hidden');
        }
    }

    async loadLyricsForTrack(state) {
        // Zera o offset sempre que mudar de música
        this.adjustSyncOffset(0, true);
        
        const requestTrackId = state.trackId || (state.trackName + state.albumName);
        this._currentLyricsRequest = requestTrackId;
        this.currentTrackArtists = state.artists || '';

        this.activeLineId = null;
        this.currentActiveIdsKey = '';
        this.isUserInteracting = false;
        this.lyrics = []; // Limpa as letras antigas para evitar bugs de UI e scroll durante o loading
        this.lyricsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full pt-32">
                <div class="w-20 h-20 rounded-full flex items-center justify-center bg-white/5 border border-white/10 mb-8 listening-indicator">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div class="text-emerald-400/80 text-lg font-medium tracking-wide">Carregando letras sincronizadas...</div>
            </div>
        `;
        if (this.btnRecenter) {
            this.btnRecenter.classList.add('hidden', 'opacity-0', 'translate-y-4');
        }
        const topMenu = document.getElementById('lyrics-top-menu');
        if (topMenu) topMenu.classList.add('hidden');
        
        this.currentTrackArtistsRaw = state.artistsRaw || [];
        if (this.currentTrackArtistsRaw.length > 0) {
            const ids = this.currentTrackArtistsRaw.map(a => a.id).filter(id => id);
            this.artistImages = await SpotifyService.getArtistsImages(ids);
        } else {
            this.artistImages = {};
        }

        const providers = ['Apple Music', 'Musixmatch', 'LRCLIB', 'NetEase'];
        let startIndex = providers.indexOf(this.currentLyricsProvider);
        if (startIndex === -1 || !this.userForcedProvider) {
            startIndex = 0; // Se automático, sempre começa do melhor
        }

        let bestLyrics = null;
        let successfulProvider = null;
        let fetchedLyrics = null;

        for (let i = 0; i < providers.length; i++) {
            const providerToTry = providers[(startIndex + i) % providers.length];
            
            // Só muda o texto pra avisar se não for a primeira tentativa
            if (i > 0) {
                const indicatorText = this.lyricsContainer.querySelector('.tracking-wide');
                if (indicatorText) indicatorText.textContent = `Buscando no ${providerToTry}...`;
            }

            const currentFetchedLyrics = await LyricsService.getLyrics(
                state.trackName, 
                state.artists, 
                state.albumName, 
                state.durationMs,
                providerToTry
            );

            // Previne Race Condition
            if (requestTrackId !== this.currentTrackId) return;

            if (currentFetchedLyrics && currentFetchedLyrics.original && currentFetchedLyrics.original.length > 0) {
                const isWord = currentFetchedLyrics.original.some(line => line.isWordSynced);
                const isLine = currentFetchedLyrics.original.some(line => line.timestamp !== undefined && line.timestamp > 0);
                
                if (isWord) {
                    bestLyrics = currentFetchedLyrics;
                    successfulProvider = providerToTry;
                    break; // Perfeito, tem sincronia de palavra! Para a busca.
                } else if (isLine && !bestLyrics) {
                    bestLyrics = currentFetchedLyrics;
                    successfulProvider = providerToTry;
                    if (this.userForcedProvider) break; // Salva como fallback e continua procurando
                } else if (!bestLyrics) {
                    bestLyrics = currentFetchedLyrics;
                    successfulProvider = providerToTry;
                    if (this.userForcedProvider) break;
                }
            }
        }
        
        fetchedLyrics = bestLyrics;

        this.currentLyricsProvider = successfulProvider;
        this.userForcedProvider = false; // Reset pro autoplay automático da próxima música

        // Previne Race Condition: Verifica se a música não mudou ENQUANTO buscava a atual
        if (requestTrackId !== this.currentTrackId) {
            return; // O usuário já pulou para outra música, descarta este resultado
        }

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
            if (topMenu) {
                topMenu.classList.remove('hidden');
                // Adicionar um pouco de display flex com fadeIn
                topMenu.classList.add('flex');
            }

            // Força a atualização de sincronização e o scroll imediato para a linha ativa atual após renderizar
            this.activeLineId = null;
            this.currentActiveIdsKey = '';
            const elapsed = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
            this.updateLyricsSync(this.progressMs + elapsed + this.syncOffset);
        } else {
            this.lyricsData = null;
            this.lyrics = [];
            this.lyricsContainer.innerHTML = `
                <div class="text-center text-white/40 text-xl py-20">
                    Letras não disponíveis para esta música.<br>
                    <span class="text-sm mt-2 block">Tente tocar outra música no Spotify para testar a sincronização!</span>
                </div>`;
            if (topMenu) {
                topMenu.classList.add('hidden');
                topMenu.classList.remove('flex');
            }
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
        const currentProgressMs = Math.min(this.progressMs + elapsedSinceSync + this.syncOffset, this.durationMs);
        this.activeLineId = null; // Força re-realce da linha
        this.updateLyricsSync(currentProgressMs);
    }

    injectInstrumentalLines(lines) {
        if (!lines || lines.length === 0) return lines;
        
        // Corrige o endtime de cada linha para incluir os backing vocals
        lines.forEach(line => {
            let maxEnd = line.endtime || 0;
            if (line.backgroundText) {
                line.backgroundText.forEach(syl => {
                    if (syl.endtime > maxEnd) maxEnd = syl.endtime;
                });
            }
            if (line.text) {
                line.text.forEach(syl => {
                    if (syl.endtime > maxEnd) maxEnd = syl.endtime;
                });
            }
            if (maxEnd > 0) {
                line.endtime = maxEnd;
            }
        });

        const result = [];
        
        // Verifica o intervalo do início da música até a primeira letra
        const firstLine = lines[0];
        if (firstLine.timestamp > 5000) {
            result.push({
                id: -1, // ID numérico para funcionar no comparador isPassed
                text: [{ text: '♪', timestamp: 0, endtime: firstLine.timestamp - 1500 }],
                background: false,
                backgroundText: [],
                timestamp: 0,
                endtime: firstLine.timestamp - 500,
                isWordSynced: true
            });
        }
        
        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];
            if (i > 0) {
                const prevLine = lines[i - 1];
                // Se a música não for word-synced, prevLine.endtime é undefined. Assumimos timestamp + 3000ms.
                const prevEndtime = prevLine.endtime || (prevLine.timestamp + 3000);
                
                if (currentLine.timestamp - prevEndtime > 5000) {
                    result.push({
                        id: i - 0.5, // ID numérico intermediário
                        text: [{ text: '♪', timestamp: prevEndtime + 1000, endtime: currentLine.timestamp - 1500 }],
                        background: false,
                        backgroundText: [],
                        timestamp: prevEndtime + 1000,
                        endtime: currentLine.timestamp - 1500,
                        isWordSynced: true
                    });
                }
            }
            result.push(currentLine);
        }
        
        // Instrumental no final da música
        if (lines.length > 0 && this.durationMs) {
            const lastLine = lines[lines.length - 1];
            const lastEndtime = lastLine.endtime || (lastLine.timestamp + 3000);
            if (this.durationMs - lastEndtime > 5000) {
                result.push({
                    id: lines.length + 0.5,
                    text: [{ text: '♪', timestamp: lastEndtime + 500, endtime: this.durationMs - 500 }],
                    background: false,
                    backgroundText: [],
                    timestamp: lastEndtime + 500,
                    endtime: this.durationMs - 500,
                    isWordSynced: true
                });
            }
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
            
            const isInstrumental = line.isInstrumental || (line.text.length === 1 && line.text[0].text.trim() === '♪');
            if (isInstrumental) {
                lineClass += ' instrumental-line';
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
                let currentWordWrapper = document.createElement('span');
                currentWordWrapper.className = 'inline-block whitespace-nowrap';
                
                let totalWords = 0;
                line.text.forEach((syl, idx) => {
                    if (syl.text.endsWith(' ') || idx === line.text.length - 1) totalWords++;
                });

                let wordsProcessed = 0;

                line.text.forEach((syl, idx) => {
                    const sylSpan = document.createElement('span');
                    sylSpan.className = 'lyrics-syllable';
                    sylSpan.id = `word-${line.id}-${idx}`;
                    sylSpan.textContent = syl.text;
                    currentWordWrapper.appendChild(sylSpan);
                    
                    if (syl.text.endsWith(' ') || idx === line.text.length - 1) {
                        wordsProcessed++;
                        const wordsRemaining = totalWords - wordsProcessed;
                        const shouldGroup = (totalWords >= 4 && wordsRemaining < 3);

                        if (!shouldGroup || idx === line.text.length - 1) {
                            mainVocal.appendChild(currentWordWrapper);
                            if (idx < line.text.length - 1) {
                                currentWordWrapper = document.createElement('span');
                                currentWordWrapper.className = 'inline-block whitespace-nowrap';
                            }
                        }
                    }
                });
            }
            lineContainer.appendChild(mainVocal);

            // Voz secundária (Backing Vocal)
            if (line.background && line.backgroundText && line.backgroundText.length > 0) {
                const bgVocal = document.createElement('div');
                bgVocal.className = 'background-vocal-container';
                
                let bgWordWrapper = document.createElement('span');
                bgWordWrapper.className = 'inline-block whitespace-nowrap';
                
                let bgTotalWords = 0;
                line.backgroundText.forEach((syl, idx) => {
                    if (syl.text.endsWith(' ') || idx === line.backgroundText.length - 1) bgTotalWords++;
                });

                let bgWordsProcessed = 0;

                line.backgroundText.forEach((syl, idx) => {
                    const sylSpan = document.createElement('span');
                    sylSpan.className = 'lyrics-syllable backing-vocal';
                    sylSpan.id = `bgword-${line.id}-${idx}`;
                    sylSpan.textContent = syl.text;
                    bgWordWrapper.appendChild(sylSpan);
                    
                    if (syl.text.endsWith(' ') || idx === line.backgroundText.length - 1) {
                        bgWordsProcessed++;
                        const wordsRemaining = bgTotalWords - bgWordsProcessed;
                        const shouldGroup = (bgTotalWords >= 4 && wordsRemaining < 3);

                        if (!shouldGroup || idx === line.backgroundText.length - 1) {
                            bgVocal.appendChild(bgWordWrapper);
                            if (idx < line.backgroundText.length - 1) {
                                bgWordWrapper = document.createElement('span');
                                bgWordWrapper.className = 'inline-block whitespace-nowrap';
                            }
                        }
                    }
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

        // Bloco de Créditos e Fonte (No final das letras)
        if (this.lyrics.length > 0) {
            const creditsBlock = document.createElement('div');
            creditsBlock.className = 'mt-10 mb-8 pt-6 flex flex-wrap gap-3 items-center justify-start opacity-70 hover:opacity-100 transition-opacity';
            
            // Intérpretes (Artistas) - Balão Pill para cada artista
            if (this.currentTrackArtistsRaw && this.currentTrackArtistsRaw.length > 0) {
                this.currentTrackArtistsRaw.forEach(artist => {
                    const artistInfo = document.createElement('div');
                    artistInfo.className = 'flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full pl-2 pr-4 py-1.5 text-sm text-white/80';
                    
                    const imgUrl = this.artistImages && this.artistImages[artist.id];
                    let iconHtml = '';
                    if (imgUrl) {
                        iconHtml = `<img src="${imgUrl}" class="w-6 h-6 rounded-full object-cover" alt="${artist.name}">`;
                    } else {
                        iconHtml = `
                            <div class="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-emerald-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                        `;
                    }
                    
                    artistInfo.innerHTML = `
                        ${iconHtml}
                        <span class="font-medium">${artist.name}</span>
                    `;
                    creditsBlock.appendChild(artistInfo);
                });
            } else {
                const artistInfo = document.createElement('div');
                artistInfo.className = 'flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white/80';
                artistInfo.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span class="font-medium">${this.currentTrackArtists || 'Desconhecido'}</span>
                `;
                creditsBlock.appendChild(artistInfo);
            }

            // Fonte e Botão de Trocar Fonte - Balão Pill Clicável
            const providerText = this.lyricsData?.source || 'Desconhecida';
            
            const btnChangeSource = document.createElement('button');
            btnChangeSource.id = 'btn-change-source-inline';
            btnChangeSource.className = 'flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer';
            btnChangeSource.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-500/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <span class="font-medium">Fonte: ${providerText}</span>
                <div class="ml-1 opacity-50 flex space-x-0.5">
                    <div class="w-1 h-1 bg-current rounded-full"></div>
                    <div class="w-1 h-1 bg-current rounded-full"></div>
                    <div class="w-1 h-1 bg-current rounded-full"></div>
                </div>
            `;
            creditsBlock.appendChild(btnChangeSource);

            this.lyricsContainer.appendChild(creditsBlock);

            // Listener de troca de provedor
            btnChangeSource.addEventListener('click', () => {
                    // Providers conhecidos no backend
                    const providers = ['Musixmatch', 'LRCLIB', 'Apple Music', 'NetEase'];
                    let currentIdx = providers.indexOf(this.currentLyricsProvider || 'Musixmatch');
                    if (currentIdx === -1) currentIdx = 0;
                    const nextIdx = (currentIdx + 1) % providers.length;
                    
                    this.currentLyricsProvider = providers[nextIdx];
                    this.showToast(`Buscando letras em: ${this.currentLyricsProvider}...`, 'info');
                    
                    this.userForcedProvider = true;

                    // Força carregamento
                    this.loadLyricsForTrack({
                        trackName: this.trackName.textContent,
                        artists: this.trackArtists.textContent,
                        albumName: '', 
                        durationMs: this.durationMs,
                        trackId: this.currentTrackId
                    });
                });
        }
    }

    // Calcula o progresso em milissegundos localmente a cada frame
    startTicker() {
        const tick = () => {
            if (this.isPlaying && this.lastSyncTime > 0) {
                const elapsedSinceSync = Date.now() - this.lastSyncTime;
                const currentProgressMs = Math.min(this.progressMs + elapsedSinceSync + this.syncOffset, this.durationMs);
                
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

        // Verifica se qualquer linha ativa entrou ou saiu
        const activeIdsKey = Array.from(activeLineIds).sort().join(',');

        if (activeLines.length > 0) {
            const primaryActiveId = minActiveId;
            // Se o conjunto de linhas ativas mudou (adicionou ou removeu uma sobreposição)
            if (activeIdsKey !== this.currentActiveIdsKey) {
                this.currentActiveIdsKey = activeIdsKey;
                this.activeLineId = primaryActiveId;
                this.highlightActiveLines(activeLineIds, primaryActiveId);
            }
        } else if (this.activeLineId !== null) {
            this.activeLineId = null;
            this.currentActiveIdsKey = '';
            this.clearHighlights();
            
            // Se as letras foram resetadas pro vazio e o tempo está antes do primeiro verso, volta pro topo!
            if (currentProgressMs < (this.lyrics[0]?.timestamp || 0)) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
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
                    el.classList.remove('inactive', 'passed');
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                    el.classList.add('inactive');
                    const isPassed = this.activeLineId !== null && line.id < this.activeLineId;
                    if (isPassed) {
                        el.classList.add('passed');
                    } else {
                        el.classList.remove('passed');
                    }
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

        this.smoothScrollTo(Math.max(0, targetScrollTop));
    }

    // Scroll fluido interpolado personalizado (muito superior ao behavior: 'smooth' nativo)
    smoothScrollTo(target) {
        const startPosition = window.scrollY;
        const distance = target - startPosition;
        let startTime = null;
        const duration = 650; // milissegundos para a transição
        
        // Cancela qualquer rolagem em andamento para evitar tremedeira (jittering)
        if (this.scrollAnimationId) {
            cancelAnimationFrame(this.scrollAnimationId);
        }
        
        // Easing function super fluida (Quart Ease Out) parecida com o iOS/Apple Music
        const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
        
        const animation = (currentTime) => {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1);
            
            window.scrollTo(0, startPosition + distance * easeOutQuart(progress));
            
            if (timeElapsed < duration) {
                this.scrollAnimationId = requestAnimationFrame(animation);
            } else {
                this.scrollAnimationId = null;
            }
        };
        
        this.scrollAnimationId = requestAnimationFrame(animation);
    }

    // Navega para o tempo clicado usando o Spotify Connect API (Premium requerido)
    async seekToTime(timeMs, isAutoSync = false) {
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
                if (!isAutoSync) {
                    this.showToast('Navegação temporal por letras requer conta Spotify Premium.', 'error');
                }
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
