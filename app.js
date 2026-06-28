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

        // Estado Interno da Música
        this.currentTrackId = null;
        this.lyrics = [];
        this.lyricsData = null; // Guardará o objeto completo de idiomas
        this.currentLyricsMode = 'original'; // original, translation, romanized
        this.activeLineId = null;
        this.currentLyricsProvider = 'betterlyrics'; // Provedor de letras padrão (Better-Lyrics style)
        
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
        this.btnLogout.addEventListener('click', () => SpotifyService.logout());
        
        this.btnSettings.addEventListener('click', () => this.toggleSettingsModal(true));
        this.btnSettingsClose.addEventListener('click', () => this.toggleSettingsModal(false));
        this.btnSaveSettings.addEventListener('click', () => this.saveSettings());
        
        const btnClearSession = document.getElementById('btn-clear-session');
        if (btnClearSession) {
            btnClearSession.addEventListener('click', () => {
                this.showToast('Limpando sessão e removendo dados locais...', 'info');
                setTimeout(() => {
                    SpotifyService.logout();
                }, 800);
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
                const providers = ['betterlyrics', 'musixmatch', 'spotify', 'lrclib', 'netease', 'genius'];
                const currentIndex = providers.indexOf(this.currentLyricsProvider);
                const nextIndex = (currentIndex + 1) % providers.length;
                this.currentLyricsProvider = providers[nextIndex];
                
                const providerLabels = {
                    'betterlyrics': 'Better Lyrics',
                    'musixmatch': 'Musixmatch',
                    'spotify': 'Spotify',
                    'lrclib': 'LrcLib',
                    'netease': 'NetEase',
                    'genius': 'Genius'
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
            }, 4000); // 4 segundos de inatividade
        };

        // Ouvintes físicos de interação para capturar mouse, teclado e toque imediatamente
        this.lyricsContainer.addEventListener('wheel', handleUserInteraction, { passive: true });
        this.lyricsContainer.addEventListener('touchmove', handleUserInteraction, { passive: true });
        this.lyricsContainer.addEventListener('mousedown', handleUserInteraction, { passive: true });
        this.lyricsContainer.addEventListener('keydown', handleUserInteraction, { passive: true });

        // Ouvimos o evento 'scroll' do container apenas para prolongar o timer de inatividade
        // caso o scroll continue ocorrendo por inércia física após o usuário soltar a tela
        this.lyricsContainer.addEventListener('scroll', () => {
            if (this.isUserInteracting) {
                if (this.userScrollTimeout) {
                    clearTimeout(this.userScrollTimeout);
                }
                this.userScrollTimeout = setTimeout(() => {
                    this.isUserInteracting = false;
                    if (this.activeLineId !== null) {
                        const activeEl = document.getElementById(`line-${this.activeLineId}`);
                        if (activeEl) {
                            this.scrollToLine(activeEl);
                        }
                    }
                }, 4000);
            }
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

        // Atualiza a sincronização do tempo com compensação de latência de tráfego de rede
        const latencyCompensation = state.timestamp ? (Date.now() - state.timestamp) : 0;
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
            // Mantém o modo anterior se suportado, senão reseta para original
            this.lyrics = this.lyricsData[this.currentLyricsMode] || this.lyricsData.original;
            this.renderLyrics();
            
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

    // Alterna o idioma das letras mantendo a reprodução
    changeLyricsMode(mode) {
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
        this.lyrics = this.lyricsData[mode] || [];
        
        // Re-renderiza e alinha instantaneamente
        this.renderLyrics();
        
        const elapsedSinceSync = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
        const currentProgressMs = Math.min(this.progressMs + elapsedSinceSync, this.durationMs);
        this.activeLineId = null; // Força re-realce da linha
        this.updateLyricsSync(currentProgressMs);
    }

    renderLyrics() {
        this.lyricsContainer.innerHTML = '';

        this.lyrics.forEach((line) => {
            const lineEl = document.createElement('div');
            lineEl.id = `line-${line.id}`;
            
            // Determina as classes de alinhamento da linha (dueto / voz principal)
            let lineClass = 'lyric-line inactive py-3 my-2 transition-all duration-300';
            if (line.isBackingVocal) {
                lineClass += ' backing-vocal-line';
            }
            
            // singerIndex === 1 -> Alinhamento à direita (dueto)
            // singerIndex === 0 -> Alinhamento à esquerda (voz principal)
            if (line.singerIndex === 1) {
                lineClass += ' text-right justify-end ml-auto pl-6 pr-0';
            } else {
                lineClass += ' text-left justify-start mr-auto pr-6 pl-0';
            }
            
            lineEl.className = lineClass;
            
            // Clica na linha para saltar no player do Spotify
            lineEl.addEventListener('click', () => {
                this.seekToTime(line.startTime);
            });

            // Constrói a estrutura de palavras (spans) fluindo continuamente na mesma linha
            line.words.forEach((word, idx) => {
                const wordSpan = document.createElement('span');
                let wordClass = 'word';
                if (line.singerIndex === 1) wordClass += ' duet-word';
                
                wordSpan.className = wordClass;
                wordSpan.id = `word-${line.id}-${idx}`;
                wordSpan.textContent = word.text;
                
                lineEl.appendChild(wordSpan);
            });

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
                
                // Aplica compensação temporal de 150ms (Timing Offset) contra atrasos/latência de reprodução
                this.updateLyricsSync(currentProgressMs + 150);
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
        const activeLines = this.lyrics.filter(line => currentProgressMs >= line.startTime && currentProgressMs < line.endTime);
        const activeLineIds = new Set(activeLines.map(l => l.id));
        
        let minActiveId = Infinity;
        let maxActiveId = -Infinity;
        if (activeLines.length > 0) {
            activeLines.forEach(l => {
                if (l.id < minActiveId) minActiveId = l.id;
                if (l.id > maxActiveId) maxActiveId = l.id;
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

        // Atualiza a sincronização interna de todas as palavras (karaoke fluido de 0% a 100%)
        this.lyrics.forEach((line) => {
            const isActive = activeLineIds.has(line.id);
            // Considera linha passada se for anterior à primeira das ativas
            const isPassed = activeLines.length > 0 
                ? line.id < minActiveId 
                : (this.activeLineId !== null ? line.id < this.activeLineId : false);

            if (isActive) {
                // Linha ativa: calcula o preenchimento proporcional de cada palavra
                line.words.forEach((word, idx) => {
                    const wordEl = document.getElementById(`word-${line.id}-${idx}`);
                    if (wordEl) {
                        if (currentProgressMs >= word.endTime) {
                            wordEl.style.setProperty('--word-progress', '100%');
                            wordEl.classList.add('passed');
                            wordEl.classList.remove('current');
                        } else if (currentProgressMs < word.startTime) {
                            wordEl.style.setProperty('--word-progress', '0%');
                            wordEl.classList.remove('passed', 'current');
                        } else {
                            // Palavra sendo cantada no frame atual
                            const duration = word.endTime - word.startTime;
                            const elapsed = currentProgressMs - word.startTime;
                            const progress = duration > 0 ? (elapsed / duration) * 100 : 0;
                            wordEl.style.setProperty('--word-progress', `${progress}%`);
                            wordEl.classList.add('current');
                            wordEl.classList.remove('passed');
                        }
                    }
                });
            } else if (isPassed) {
                // Linhas passadas: define progresso de todas as palavras para 100%
                line.words.forEach((word, idx) => {
                    const wordEl = document.getElementById(`word-${line.id}-${idx}`);
                    if (wordEl) {
                        wordEl.style.setProperty('--word-progress', '100%');
                        wordEl.classList.add('passed');
                        wordEl.classList.remove('current');
                    }
                });
            } else {
                // Linhas futuras: define progresso de todas as palavras para 0%
                line.words.forEach((word, idx) => {
                    const wordEl = document.getElementById(`word-${line.id}-${idx}`);
                    if (wordEl) {
                        wordEl.style.setProperty('--word-progress', '0%');
                        wordEl.classList.remove('passed', 'current');
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
            line.words.forEach((_, idx) => {
                const wordEl = document.getElementById(`word-${line.id}-${idx}`);
                if (wordEl) {
                    wordEl.style.removeProperty('--word-progress');
                    wordEl.classList.remove('passed', 'current');
                }
            });
        });
    }

    scrollToLine(lineElement) {
        const containerRect = this.lyricsContainer.getBoundingClientRect();
        const lineRect = lineElement.getBoundingClientRect();
        
        // Distância física da linha em relação ao topo atual da viewport do container (soma o scrollTop corrente)
        const relativeLineTop = lineRect.top - containerRect.top + this.lyricsContainer.scrollTop;
        
        // Alinhamento matemático perfeito no meio do visor
        const targetScrollTop = relativeLineTop - (containerRect.height / 2) + (lineRect.height / 2);
        
        this.lastAutoScrollTime = Date.now();

        this.lyricsContainer.scrollTo({
            top: targetScrollTop,
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
