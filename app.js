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
        this.activeLineId = null;
        
        // Estado do Relógio Interno (Ticker)
        this.isPlaying = false;
        this.progressMs = 0;
        this.lastSyncTime = 0; // Timestamp local do momento em que sincronizamos com a API
        this.durationMs = 0;
        this.animationFrameId = null;

        // Intervalo de Polling
        this.pollingIntervalId = null;

        // Expõe o gerenciador de notificações globalmente
        window.showToast = (message, type) => this.showToast(message, type);

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadSettings();

        // Verifica se havia indicação de login anterior no localStorage para saber se expirou
        const hadRefreshToken = !!localStorage.getItem('lysinc_spotify_refresh_token');

        // Trata o callback do Spotify OAuth ou tenta renovação silenciosa em runtime
        const authenticated = await SpotifyService.handleCallback();
        
        if (authenticated) {
            this.showScreen('idle'); // Mostra tela de espera até obter a primeira resposta do player
            this.startPolling();
            this.startTicker();
            this.btnLogout.classList.remove('hidden'); // Exibe o botão de sair se logado
        } else {
            this.showScreen('pre-login');
            this.btnLogout.classList.add('hidden');
            
            // Se tinha refresh token mas falhou, a sessão expirou
            if (hadRefreshToken) {
                this.showToast('Sessão expirada. Por favor, conecte-se novamente ao Spotify.', 'info');
            }

            // Se o Client ID não estiver configurado, abre as configurações para facilitar o uso
            if (!Config.getClientId()) {
                this.toggleSettingsModal(true);
            }
        }
    }

    setupEventListeners() {
        this.btnConnect.addEventListener('click', () => SpotifyService.login());
        this.btnLogout.addEventListener('click', () => SpotifyService.logout());
        
        this.btnSettings.addEventListener('click', () => this.toggleSettingsModal(true));
        this.btnSettingsClose.addEventListener('click', () => this.toggleSettingsModal(false));
        this.btnSaveSettings.addEventListener('click', () => this.saveSettings());
        
        // Clica fora do modal para fechar
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) {
                this.toggleSettingsModal(false);
            }
        });
    }

    loadSettings() {
        this.inputClientId.value = Config.getClientId();
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

        // Atualiza a sincronização do tempo
        this.isPlaying = state.isPlaying;
        this.progressMs = state.progressMs;
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
        
        const fetchedLyrics = await LyricsService.getLyrics(
            state.trackName, 
            state.artists, 
            state.albumName, 
            state.durationMs
        );

        if (fetchedLyrics && fetchedLyrics.length > 0) {
            this.lyrics = fetchedLyrics;
            this.renderLyrics();
        } else {
            this.lyrics = [];
            this.lyricsContainer.innerHTML = `
                <div class="text-center text-white/40 text-xl py-20">
                    Letras não disponíveis para esta música.<br>
                    <span class="text-sm mt-2 block">Tente tocar outra música no Spotify para testar a sincronização!</span>
                </div>`;
        }
    }

    renderLyrics() {
        this.lyricsContainer.innerHTML = '';
        
        // Espaçador no início para empurrar a primeira linha para o centro
        const topSpacer = document.createElement('div');
        topSpacer.className = 'h-24';
        this.lyricsContainer.appendChild(topSpacer);

        this.lyrics.forEach((line) => {
            const lineEl = document.createElement('div');
            lineEl.id = `line-${line.id}`;
            lineEl.className = 'lyric-line inactive py-3 my-2 pr-6';
            
            // Clica na linha para saltar no player do Spotify (Se implementado no futuro)
            lineEl.addEventListener('click', () => {
                this.seekToTime(line.startTime);
            });

            // Constrói a estrutura de palavras (spans)
            line.words.forEach((word, idx) => {
                const wordSpan = document.createElement('span');
                wordSpan.className = 'word';
                wordSpan.id = `word-${line.id}-${idx}`;
                wordSpan.textContent = word.text;
                
                // Adiciona espaço após a palavra
                lineEl.appendChild(wordSpan);
            });

            this.lyricsContainer.appendChild(lineEl);
        });

        // Espaçador no final
        const bottomSpacer = document.createElement('div');
        bottomSpacer.className = 'h-48';
        this.lyricsContainer.appendChild(bottomSpacer);
    }

    // Calcula o progresso em milissegundos localmente a cada frame
    startTicker() {
        const tick = () => {
            if (this.isPlaying && this.lastSyncTime > 0) {
                const elapsedSinceSync = Date.now() - this.lastSyncTime;
                const currentProgressMs = Math.min(this.progressMs + elapsedSinceSync, this.durationMs);
                
                this.updateProgressBar(currentProgressMs);
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

        // Encontra a linha atual correspondente ao tempo
        let activeLine = null;
        for (let i = 0; i < this.lyrics.length; i++) {
            const line = this.lyrics[i];
            if (currentProgressMs >= line.startTime && currentProgressMs < line.endTime) {
                activeLine = line;
                break;
            }
        }

        // Caso o tempo seja anterior à primeira linha
        if (!activeLine && this.lyrics.length > 0 && currentProgressMs < this.lyrics[0].startTime) {
            activeLine = null;
        }
        
        // Se a linha ativa mudou
        if (activeLine && activeLine.id !== this.activeLineId) {
            this.activeLineId = activeLine.id;
            this.highlightActiveLine(activeLine.id);
        } else if (!activeLine && this.activeLineId !== null) {
            this.activeLineId = null;
            this.clearHighlights();
        }

        // Atualiza a sincronização interna das palavras da linha ativa
        if (activeLine) {
            activeLine.words.forEach((word, idx) => {
                const wordEl = document.getElementById(`word-${activeLine.id}-${idx}`);
                if (wordEl) {
                    if (currentProgressMs >= word.startTime) {
                        wordEl.classList.add('active');
                    } else {
                        wordEl.classList.remove('active');
                    }
                }
            });
        }
    }

    highlightActiveLine(lineId) {
        // Atualiza classes das linhas
        this.lyrics.forEach((line) => {
            const el = document.getElementById(`line-${line.id}`);
            if (el) {
                if (line.id === lineId) {
                    el.classList.remove('inactive');
                    el.classList.add('active');
                    
                    // Rola a linha ativa suavemente para a posição ideal (terço central)
                    this.scrollToLine(el);
                } else {
                    el.classList.remove('active');
                    el.classList.add('inactive');
                    
                    // Remove destaque de palavras de outras linhas
                    line.words.forEach((_, idx) => {
                        const wordEl = document.getElementById(`word-${line.id}-${idx}`);
                        if (wordEl) wordEl.classList.remove('active');
                    });
                }
            }
        });
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
                if (wordEl) wordEl.classList.remove('active');
            });
        });
    }

    scrollToLine(lineElement) {
        const containerHeight = this.lyricsContainer.clientHeight;
        const lineOffsetTop = lineElement.offsetTop;
        const lineLimitTop = containerHeight / 3.2; // Alinha perto do terço superior/médio da tela
        
        this.lyricsContainer.scrollTo({
            top: lineOffsetTop - lineLimitTop,
            behavior: 'smooth'
        });
    }

    // Funcionalidade opcional: controle local se o usuário clicar na linha (necessita escopos de escrita e conta Premium)
    async seekToTime(timeMs) {
        const token = await SpotifyService.getValidToken();
        if (!token) return;

        try {
            await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${timeMs}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            // Atualiza localmente para resposta rápida imediata
            this.progressMs = timeMs;
            this.lastSyncTime = Date.now();
        } catch (error) {
            console.error('Erro ao pular reprodução:', error);
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

// Inicializa a aplicação quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.app = new LySincApp();
});
