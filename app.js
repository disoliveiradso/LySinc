import Config from './config.js';
import SpotifyService from './spotify.js';
import LyricsService from './lyrics.js';


const wrapText = (ctx, text, maxWidth) => {
    const breakWordWithHyphen = (word) => {
        if (!word.includes('-') || word.indexOf('-') === 0 || word.indexOf('-') === word.length - 1) {
            return [word];
        }
        const parts = word.split('-');
        let result = [];
        let currentPart = parts[0] + '-';
        for (let j = 1; j < parts.length; j++) {
            let nextPart = parts[j] + (j === parts.length - 1 ? '' : '-');
            if (ctx.measureText(currentPart + nextPart).width <= maxWidth) {
                currentPart += nextPart;
            } else {
                if (currentPart) result.push(currentPart);
                currentPart = nextPart;
            }
        }
        if (currentPart) result.push(currentPart);
        return result;
    };

    const words = text.split(' ');
    let lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const candidate = currentLine ? currentLine + ' ' + word : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
            currentLine = candidate;
        } else {
            if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
            }
            if (ctx.measureText(word).width <= maxWidth) {
                currentLine = word;
            } else {
                const broken = breakWordWithHyphen(word);
                for (let b = 0; b < broken.length - 1; b++) {
                    lines.push(broken[b]);
                }
                currentLine = broken[broken.length - 1] || '';
            }
        }
    }
    if (currentLine) lines.push(currentLine);

    const balanceOrphans = (linesArray) => {
        if (linesArray.length <= 1) return linesArray;
        let wordsPerLine = linesArray.map(l => l.trim().split(/\s+/).filter(Boolean));
        
        if (wordsPerLine[wordsPerLine.length - 1].length === 1 && wordsPerLine.length > 1) {
            if (wordsPerLine[wordsPerLine.length - 2].length > 1) {
                let word = wordsPerLine[wordsPerLine.length - 2].pop();
                wordsPerLine[wordsPerLine.length - 1].unshift(word);
            }
        }
        
        if (wordsPerLine[0].length === 1 && wordsPerLine.length > 1) {
            if (wordsPerLine[1].length > 1) {
                let word = wordsPerLine[1].shift();
                wordsPerLine[0].push(word);
            }
        }
        
        return wordsPerLine.map(wArr => wArr.join(' '));
    };

    return balanceOrphans(lines);
};

const groupSyllablesByLines = (syllables, wrappedStrings) => {
    const lines = [];
    let sylIdx = 0;
    
    wrappedStrings.forEach(lineStr => {
        const lineSyls = [];
        let currentText = '';
        const targetText = lineStr.replace(/\s+/g, '').toLowerCase();
        
        while (sylIdx < syllables.length) {
            const syl = syllables[sylIdx];
            const sylClean = syl.text.replace(/\s+/g, '').toLowerCase();
            
            if (currentText.length + sylClean.length <= targetText.length || lineSyls.length === 0) {
                lineSyls.push(syl);
                currentText += sylClean;
                sylIdx++;
            } else {
                break;
            }
        }
        lines.push(lineSyls);
    });
    
    while (sylIdx < syllables.length) {
        if (lines.length > 0) {
            lines[lines.length - 1].push(syllables[sylIdx]);
        }
        sylIdx++;
    }
    
    return lines;
};

class WakeLockManager {
    constructor() {
        this.wakeLock = null;
        document.addEventListener('visibilitychange', async () => {
            if (this.wakeLock !== null && document.visibilityState === 'visible') {
                await this.request();
            }
        });
    }

    async request() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {
                console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
            }
        }
    }

    release() {
        if (this.wakeLock !== null) {
            this.wakeLock.release().then(() => {
                this.wakeLock = null;
            });
        }
    }
}

class CustomTooltipManager {
    constructor() {
        this.tooltip = document.getElementById('custom-tooltip');
        this.activeElement = null;
        this.showTimeout = null;
        this.isTouch = window.matchMedia("(hover: none)").matches;
        
        if (this.isTouch) {
            this.setupTouchTooltips();
        }
    }

    setupTouchTooltips() {
        document.addEventListener('touchstart', (e) => {
            const btn = e.target.closest('button[title], button[data-title]');
            if (btn) {
                if (btn.hasAttribute('title')) {
                    btn.dataset.title = btn.getAttribute('title');
                    btn.removeAttribute('title');
                }
                this.activeElement = btn;
            }
        }, { passive: true });

        document.addEventListener('contextmenu', (e) => {
            if (this.activeElement && this.activeElement.contains(e.target)) {
                e.preventDefault();
                this.show(this.activeElement);
            }
        });

        const hideHandler = () => this.hide();
        document.addEventListener('touchend', hideHandler, { passive: true });
        document.addEventListener('touchcancel', hideHandler, { passive: true });
        document.addEventListener('click', hideHandler, { passive: true });
    }

    show(element) {
        if (!this.tooltip || !element.dataset.title) return;
        
        this.tooltip.textContent = element.dataset.title;
        const rect = element.getBoundingClientRect();
        
        const tooltipWidth = this.tooltip.offsetWidth || 100;
        const tooltipHeight = this.tooltip.offsetHeight || 30;
        
        let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        let top = rect.top - tooltipHeight - 10;
        
        if (left < 10) left = 10;
        if (left + tooltipWidth > window.innerWidth - 10) left = window.innerWidth - tooltipWidth - 10;
        if (top < 10) top = rect.bottom + 10;
        
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
        this.tooltip.classList.add('visible');
    }

    hide() {
        if (this.showTimeout) clearTimeout(this.showTimeout);
        this.activeElement = null;
        if (this.tooltip) {
            this.tooltip.classList.remove('visible');
        }
    }
}

class LySincApp {
    constructor() {

        this.wakeLockManager = new WakeLockManager();
        this.tooltipManager = new CustomTooltipManager();

        this.screenPreLogin = document.getElementById('screen-pre-login');
        this.screenMain = document.getElementById('screen-main');
        this.screenIdle = document.getElementById('screen-idle');

        this.albumArt = document.getElementById('album-art');
        this.albumArtBlur = document.getElementById('album-art-blur');
        this.trackName = document.getElementById('track-name');
        this.trackArtists = document.getElementById('track-artists');
        this.explicitIconHeader = document.getElementById('explicit-icon-header');
        this.footerExplicit = document.getElementById('footer-explicit');
        this.lyricsContainer = document.getElementById('lyrics-container');
        this.progressBar = document.getElementById('progress-bar');

        this.btnDemoMode = document.getElementById('btn-demo-mode');
        this.demoContainer = document.getElementById('demo-container');

        this.btnTopPrev = document.getElementById('btn-top-prev');
        this.btnTopPlayPause = document.getElementById('btn-top-playpause');
        this.btnTopNext = document.getElementById('btn-top-next');
        
        this.btnFloatingPrev = document.getElementById('btn-floating-prev');
        this.btnFloatingPlayPause = document.getElementById('btn-floating-playpause');
        this.btnFloatingNext = document.getElementById('btn-floating-next');

        this.iconTopPlay = document.getElementById('icon-top-play');
        this.iconTopPause = document.getElementById('icon-top-pause');
        this.iconFloatingPlay = document.getElementById('icon-floating-play');
        this.iconFloatingPause = document.getElementById('icon-floating-pause');

        this.btnConnect = document.getElementById('btn-connect');
        this.btnRecenter = document.getElementById('btn-recenter');
        this.btnClearCache = document.getElementById('btn-clear-cache');
        this.btnLogout = document.getElementById('btn-logout');
        this.btnSettings = document.getElementById('btn-settings');
        this.btnSettingsClose = document.getElementById('btn-settings-close');
        this.settingsModal = document.getElementById('settings-modal');
        this.inputClientId = document.getElementById('input-client-id');
        this.btnSaveSettings = document.getElementById('btn-save-settings');
        this.confirmLogoutModal = document.getElementById('confirm-logout-modal');

        this.btnToggleControls = document.getElementById('btn-toggle-controls');
        this.headerControlsContainer = document.getElementById('header-controls-container');
        this.btnFullscreen = document.getElementById('btn-fullscreen');
        this.btnFullscreenTop = document.getElementById('btn-fullscreen-top');
        this.iconToggleControlsMobile = document.getElementById('icon-toggle-controls-mobile');
        this.iconToggleControlsDesktop = document.getElementById('icon-toggle-controls-desktop');

        this.floatingControlsWrapper = document.getElementById('floating-controls-wrapper');
        this.floatingMenu = document.getElementById('floating-lyrics-menu');
        this.btnFloatingToggle = document.getElementById('btn-floating-toggle');
        this.floatingMenuContent = document.getElementById('floating-menu-content');
        this.floatingToggleIconMobile = document.getElementById('icon-floating-toggle-mobile');
        this.floatingToggleIconDesktop = document.getElementById('icon-floating-toggle-desktop');

        this.btnPipTop = document.getElementById('btn-pip-top');
        this.btnFloatingPip = document.getElementById('btn-floating-pip');

        // Light Mode & Info Stutter Modal Elements
        this.btnLightMode = document.getElementById('btn-light-mode');
        this.btnInfoStutter = document.getElementById('btn-info-stutter');
        this.infoStutterModal = document.getElementById('info-stutter-modal');
        this.btnInfoStutterClose = document.getElementById('btn-info-stutter-close');

        this.syncOffset = 0;

        this.currentTrackId = null;
        this.lyrics = [];
        this.lyricsData = null;
        this.currentLyricsMode = 'original';
        this.activeLineId = null;
        this.tempDisableScroll = false;
        this.currentLyricsProvider = 'lrclib';

        this.isPlaying = false;
        this.progressMs = 0;
        this.lastSyncTime = 0;
        this.durationMs = 0;
        this.animationFrameId = null;
        this.lastUserSeekTime = 0;

        this.pollingIntervalId = null;

        this.isUserInteracting = false;
        this.userScrollTimeout = null;
        this.lastAutoScrollTime = 0;

        window.showToast = (message, type) => this.showToast(message, type);

        this.init();
    }

    getDocument() {
        return this.pipWindow ? this.pipWindow.document : document;
    }

    getRaf() {
        return (this.pipWindow || window).requestAnimationFrame.bind(this.pipWindow || window);
    }

    cancelRaf(id) {
        return (this.pipWindow || window).cancelAnimationFrame(id);
    }

    getScrollY() {
        return (this.pipWindow || window).scrollY;
    }

    scrollToPosition(y) {
        (this.pipWindow || window).scrollTo(0, y);
    }

    async init() {
        try {
            console.log("%c LySinc v1.0.1 - Melhorias de Karaoke e Scroll Ativas ", "background: #10b981; color: #000; font-weight: bold; padding: 4px; border-radius: 4px;");
            this.setupEventListeners();
            this.loadSettings();

            const urlParams = new URLSearchParams(window.location.search);
            this.isDemoMode = urlParams.get('mock') === 'true';

            if (this.isDemoMode) {
                this.setupDemoMode();
                return;
            }

            const hadRefreshToken = !!localStorage.getItem('lysinc_spotify_refresh_token');

            if (hadRefreshToken) {
                const btnConnectText = this.btnConnect.querySelector('span');
                if (btnConnectText) {
                    btnConnectText.textContent = 'Continuar com o Spotify';
                }

                try {
                    const authenticated = await SpotifyService.isAuthenticated();
                    if (authenticated) {
                        this.showScreen('idle');
                        this.startPolling();
                        this.startTicker();
                        this.btnLogout.classList.remove('hidden');
                        return;
                    }
                } catch (e) {
                    console.error('Falha silenciosa ao autenticar refresh token:', e);
                }
            }

            let authenticated = false;
            try {
                authenticated = await SpotifyService.handleCallback();
            } catch (e) {
                console.error('Falha no handleCallback:', e);
            }
            
            if (authenticated) {
                this.showScreen('idle');
                this.startPolling();
                this.startTicker();
                this.btnLogout.classList.remove('hidden');
            } else {
                this.showScreen('pre-login');
                this.btnLogout.classList.add('hidden');

                if (hadRefreshToken) {
                    this.showToast('Sessão expirada. Por favor, conecte-se novamente ao Spotify.', 'info');
                }

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
            durationMs: 32000,
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

        this.syncOffset = 0;

        this.btnLogout.classList.add('hidden');
    }

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (window.matchMedia("(hover: none)").matches) {
                const btn = e.target.closest('button');
                if (btn) {
                    setTimeout(() => btn.blur(), 50);
                }
            }
        });

        this.btnConnect.addEventListener('click', () => SpotifyService.login());

        if (this.btnClearCache) {
            this.btnClearCache.addEventListener('click', () => {
                let keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('lysinc_cache_')) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
                this.showToast('Cache de letras apagado do navegador.', 'success');
            });
        }

        this.btnLogout.addEventListener('click', () => {
            if (this.confirmLogoutModal) {
                this.confirmLogoutModal.classList.remove('hidden');
                this.confirmLogoutModal.classList.add('flex');
            } else {
                if (window.confirm("Tem certeza que deseja sair e remover seus dados de login?")) {
                    window.localStorage.removeItem(Config.CLIENT_ID_KEY);
                    SpotifyService.logout();
                }
            }
        });
        
        this.btnSettings.addEventListener('click', () => this.toggleSettingsModal(true));
        this.btnSettingsClose.addEventListener('click', () => this.toggleSettingsModal(false));
        this.btnSaveSettings.addEventListener('click', () => this.saveSettings());

        const btnConfirmLogout = document.getElementById('btn-confirm-logout');
        const btnCancelLogout = document.getElementById('btn-cancel-logout');
        
        if (btnConfirmLogout) {
            btnConfirmLogout.addEventListener('click', () => {
                window.localStorage.removeItem(Config.CLIENT_ID_KEY);
                this.confirmLogoutModal.classList.add('hidden');
                this.confirmLogoutModal.classList.remove('flex');
                
                SpotifyService.logout();
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
            if (this.headerControlsContainer && !this.headerControlsContainer.classList.contains('closed')) {
                this.headerControlsContainer.classList.add('closed');
                this.headerControlsContainer.classList.remove('open');
                if (this.iconToggleControlsMobile) this.iconToggleControlsMobile.classList.remove('scale-y-[-1]');
                if (this.iconToggleControlsDesktop) this.iconToggleControlsDesktop.classList.remove('scale-x-[-1]');
            }
        };

        const resetControlsTimeout = () => {
            if (controlsTimeout) clearTimeout(controlsTimeout);
            controlsTimeout = setTimeout(closeControls, 4000);
        };

        if (this.btnToggleControls) {
            this.btnToggleControls.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = this.headerControlsContainer.classList.contains('closed');
                if (isHidden) {
                    this.headerControlsContainer.classList.remove('closed');
                    this.headerControlsContainer.classList.add('open');
                    if (this.iconToggleControlsMobile) this.iconToggleControlsMobile.classList.add('scale-y-[-1]');
                    if (this.iconToggleControlsDesktop) this.iconToggleControlsDesktop.classList.add('scale-x-[-1]');
                    resetControlsTimeout();
                } else {
                    closeControls();
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (this.headerControlsContainer && !this.headerControlsContainer.classList.contains('closed')) {
                const isClickInside = this.headerControlsContainer.contains(e.target);
                const isClickOnToggle = this.btnToggleControls && this.btnToggleControls.contains(e.target);
                
                if (!isClickInside && !isClickOnToggle) {
                    closeControls();
                }

                if (isClickInside) {
                    setTimeout(closeControls, 300);
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

        if (this.btnFullscreenTop) {
            this.btnFullscreenTop.addEventListener('click', () => {
                if (this.pipWindow) {
                    this.pipWindow.close();
                }
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(err => console.error(err));
                } else {
                    if (document.exitFullscreen) document.exitFullscreen();
                }
            });
        }

        let mouseHideTimeout = null;
        
        const hideMousePointer = () => {
            if (document.fullscreenElement) {
                document.body.style.cursor = 'none';
                if (this.btnFloatingToggle) {
                    this.btnFloatingToggle.style.opacity = '';
                    this.btnFloatingToggle.style.pointerEvents = '';
                    this.btnFloatingToggle.classList.remove('opacity-100', 'scale-100', 'w-10', 'mr-3');
                    this.btnFloatingToggle.classList.add('opacity-0', 'scale-95', 'w-0', 'border-0', 'px-0', 'mr-0');
                }
                if (this.floatingMenuContent && !this.floatingMenuContent.classList.contains('closed')) {
                    this.toggleFloatingMenu(false);
                }
            }
        };

        const resetMousePointer = () => {
            document.body.style.cursor = 'default';
            if (this.btnFloatingToggle) {
                this.btnFloatingToggle.style.opacity = '';
                this.btnFloatingToggle.style.pointerEvents = '';
            }
            this.updateFloatingMenuVisibility();
            
            if (mouseHideTimeout) clearTimeout(mouseHideTimeout);
            
            if (document.fullscreenElement) {
                mouseHideTimeout = setTimeout(hideMousePointer, 3000);
            }
        };

        const handleScrollAction = (e) => {
            if (e && e.type === 'scroll' && (Date.now() - this.lastAutoScrollTime < 800)) {
                return;
            }
            resetMousePointer();
            if (this.floatingMenuContent && !this.floatingMenuContent.classList.contains('closed')) {
                this.toggleFloatingMenu(false);
            }
        };

        document.addEventListener('mousemove', resetMousePointer);
        document.addEventListener('wheel', handleScrollAction, { passive: true });
        document.addEventListener('touchmove', handleScrollAction, { passive: true });
        document.addEventListener('scroll', handleScrollAction, { passive: true });
        document.addEventListener('touchstart', resetMousePointer, { passive: true });
        
        const iconFullscreen = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>`;
        const iconExitFullscreen = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8h4V4m12 4h-4V4M4 16h4v4m12-4h-4v4" /></svg>`;

        document.addEventListener('fullscreenchange', () => {
            resetMousePointer();
            if (!document.fullscreenElement) {
                if (mouseHideTimeout) clearTimeout(mouseHideTimeout);
                document.body.style.cursor = 'default';
                if (this.btnFloatingToggle) {
                    this.btnFloatingToggle.style.opacity = '';
                    this.btnFloatingToggle.style.pointerEvents = '';
                }
                if (this.btnFullscreen) this.btnFullscreen.innerHTML = iconFullscreen;
                if (this.btnFullscreenTop) this.btnFullscreenTop.innerHTML = iconFullscreen;
            } else {
                if (this.btnFullscreen) this.btnFullscreen.innerHTML = iconExitFullscreen;
                if (this.btnFullscreenTop) this.btnFullscreenTop.innerHTML = iconExitFullscreen;
            }
        });

        const customTooltip = document.createElement('div');
        customTooltip.id = 'custom-tooltip';
        customTooltip.className = 'fixed pointer-events-none z-[100] opacity-0 transition-opacity duration-200 bg-[#141414]/70 backdrop-blur-sm text-white/70 text-[11px] px-2.5 py-1.5 rounded-lg shadow-md border border-white/5 whitespace-nowrap font-normal';
        document.body.appendChild(customTooltip);

        let tooltipTarget = null;
        let tooltipTimeout = null;

        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[title], [data-tooltip]');
            if (target) {
                if (target.hasAttribute('title')) {
                    target.setAttribute('data-tooltip', target.getAttribute('title'));
                    target.removeAttribute('title');
                }
                const text = target.getAttribute('data-tooltip');
                if (text) {
                    if (tooltipTimeout) clearTimeout(tooltipTimeout);
                    tooltipTarget = target;
                    
                    tooltipTimeout = setTimeout(() => {
                        if (tooltipTarget === target) {
                            customTooltip.textContent = text;

                            customTooltip.style.opacity = '0'; 

                            setTimeout(() => {
                                const rect = target.getBoundingClientRect();
                                const tooltipRect = customTooltip.getBoundingClientRect();
                                let top = rect.top - tooltipRect.height - 8;
                                let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                                
                                if (top < 0) top = rect.bottom + 8;
                                if (left < 0) left = 8;
                                if (left + tooltipRect.width > window.innerWidth) left = window.innerWidth - tooltipRect.width - 8;
                                
                                customTooltip.style.top = `${top}px`;
                                customTooltip.style.left = `${left}px`;
                                customTooltip.style.opacity = '1';
                            }, 10);
                        }
                    }, 1500);
                }
            }
        });

        document.addEventListener('mouseout', (e) => {
            const target = e.target.closest('[data-tooltip]');
            if (target && target === tooltipTarget) {
                if (tooltipTimeout) clearTimeout(tooltipTimeout);
                customTooltip.style.opacity = '0';
                tooltipTarget = null;
            }
        });

        document.addEventListener('mousedown', (e) => {
            const target = e.target.closest('[data-tooltip]');
            if (target && target === tooltipTarget) {
                if (tooltipTimeout) clearTimeout(tooltipTimeout);
                customTooltip.style.opacity = '0';
                tooltipTarget = null;
            }
        });

        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) {
                this.toggleSettingsModal(false);
            }
        });

        document.querySelectorAll('.lyric-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.getAttribute('data-mode');
                this.changeLyricsMode(mode);
            });
        });

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

        const handleUserInteraction = () => {
            if (!this.isUserInteracting && this.lyrics.length > 0) {
                this.isUserInteracting = true;

                if (this.btnRecenterTimeoutId) clearTimeout(this.btnRecenterTimeoutId);
                
                if (this.lyricsContainer) this.lyricsContainer.classList.add('user-scrolling');

                if (this.btnRecenter && !this.pipWindow) {
                    this.btnRecenter.classList.remove('hidden');
                    requestAnimationFrame(() => {
                        this.btnRecenter.classList.remove('opacity-0', 'scale-95');
                        this.btnRecenter.classList.add('opacity-100', 'scale-100');
                    });
                }
            }
        };

        this.btnRecenter.addEventListener('click', () => {
            this.isUserInteracting = false;
            if (this.lyricsContainer) this.lyricsContainer.classList.remove('user-scrolling');
            this.btnRecenter.classList.remove('opacity-100', 'scale-100');
            this.btnRecenter.classList.add('opacity-0', 'scale-95');
            
            if (this.btnRecenterTimeoutId) clearTimeout(this.btnRecenterTimeoutId);
            this.btnRecenterTimeoutId = setTimeout(() => {
                this.btnRecenter.classList.add('hidden');
            }, 500);
            
            let targetLineId = this.activeLineId;


            if (targetLineId === null && this.lyrics.length > 0) {
                let closestLine = null;
                let minDiff = Infinity;
                
                const elapsedSinceSync = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
                const currentProgressMs = Math.min(this.progressMs + elapsedSinceSync + this.syncOffset, this.durationMs);

                this.lyrics.forEach(line => {
                    const diff = Math.abs(currentProgressMs - line.timestamp);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestLine = line;
                    }
                });
                
                if (closestLine) {
                    targetLineId = closestLine.id;
                }
            }
            
            if (targetLineId !== null) {
                const activeEl = document.getElementById(`line-${targetLineId}`);
                if (activeEl) {
                    this.scrollToLine(activeEl);
                } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        window.addEventListener('wheel', handleUserInteraction, { passive: true });
        window.addEventListener('touchmove', handleUserInteraction, { passive: true });

        window.addEventListener('scroll', () => {

            this.updateFloatingMenuVisibility();

            if (Date.now() - this.lastAutoScrollTime < 800) {
                return;
            }

            handleUserInteraction();
        });

        if (this.btnFloatingToggle) {
            this.btnFloatingToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = this.floatingMenuContent.classList.contains('open');
                this.toggleFloatingMenu(!isOpen);
            });
        }

        if (this.btnFloatingScrollTop) {
            this.btnFloatingScrollTop.addEventListener('click', () => {
                this.isUserInteracting = true;
                if (this.btnRecenterTimeoutId) clearTimeout(this.btnRecenterTimeoutId);
                
                if (this.lyricsContainer) this.lyricsContainer.classList.add('user-scrolling');

                if (this.btnRecenter && !this.pipWindow) {
                    this.btnRecenter.classList.remove('hidden');
                    requestAnimationFrame(() => {
                        this.btnRecenter.classList.remove('opacity-0', 'scale-95');
                        this.btnRecenter.classList.add('opacity-100', 'scale-100');
                    });
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
                this.toggleFloatingMenu(false);
            });
        }

        document.querySelectorAll('#floating-lyrics-menu button').forEach(btn => {
            if (btn.id !== 'btn-floating-toggle') {
                btn.addEventListener('click', () => {
                    this.toggleFloatingMenu(false);
                });
            }
        });

        document.addEventListener('click', (e) => {
            if (this.floatingMenu && !this.floatingMenu.classList.contains('hidden')) {
                const isClickInside = this.floatingMenu.contains(e.target);
                if (!isClickInside) {
                    this.toggleFloatingMenu(false);
                }
            }
        });

        const setupMediaEvent = (btn, action) => {
            if (btn) {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (action === 'prev') {
                        const elapsed = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
                        const currentMs = this.progressMs + elapsed;
                        if (currentMs > 3000) {
                            await this.seekToTime(0);
                        } else {
                            await SpotifyService.previousTrack();
                        }
                    }
                    if (action === 'next') await SpotifyService.nextTrack();
                    if (action === 'playpause') {
                        if (this.isPlaying) {
                            await SpotifyService.pauseTrack();
                        } else {
                            await SpotifyService.playTrack();
                        }
                    }

                    setTimeout(() => this.pollPlayerState(), 200);
                });
            }
        };

        setupMediaEvent(this.btnTopPrev, 'prev');
        setupMediaEvent(this.btnFloatingPrev, 'prev');
        setupMediaEvent(this.btnTopNext, 'next');
        setupMediaEvent(this.btnFloatingNext, 'next');
        setupMediaEvent(this.btnTopPlayPause, 'playpause');
        setupMediaEvent(this.btnFloatingPlayPause, 'playpause');

        // Light Mode Handler
        if (this.btnLightMode) {
            this.btnLightMode.addEventListener('click', () => {
                const isActive = document.body.classList.contains('light-mode');
                if (isActive) {
                    document.body.classList.remove('light-mode');
                    this.btnLightMode.classList.remove('active-light');
                    localStorage.setItem('lysinc_light_mode', 'false');
                    this.showToast('Modo Light desativado.', 'info');
                } else {
                    document.body.classList.add('light-mode');
                    this.btnLightMode.classList.add('active-light');
                    localStorage.setItem('lysinc_light_mode', 'true');
                    this.showToast('Modo Light (Desempenho) ativado.', 'success');
                }
            });
        }

        // Info Stutter Modal Handlers
        if (this.btnInfoStutter) {
            this.btnInfoStutter.addEventListener('click', () => {
                if (this.infoStutterModal) {
                    this.infoStutterModal.classList.remove('hidden');
                    this.infoStutterModal.classList.add('flex');
                }
            });
        }

        if (this.btnInfoStutterClose) {
            this.btnInfoStutterClose.addEventListener('click', () => {
                if (this.infoStutterModal) {
                    this.infoStutterModal.classList.add('hidden');
                    this.infoStutterModal.classList.remove('flex');
                }
            });
        }

        if (this.infoStutterModal) {
            this.infoStutterModal.addEventListener('click', (e) => {
                if (e.target === this.infoStutterModal) {
                    this.infoStutterModal.classList.add('hidden');
                    this.infoStutterModal.classList.remove('flex');
                }
            });
        }

        this.setupPiP();
    }

    setupPiP() {

        if (this.btnPipTop) this.btnPipTop.classList.remove('hidden');
        if (this.btnFloatingPip) this.btnFloatingPip.classList.remove('hidden');

        let pipVideo = null;
        let pipCanvas = null;
        let pipCtx = null;
        let pipAnimationId = null;
        let pipIntervalId = null;
        let silentAudio = null;

        const renderPipCanvas = () => {
            if (!pipCanvas || !pipCtx) return;
            
            try {
                pipCtx.fillStyle = this.currentAlbumColor || '#121212';
                pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);
                
                const scale = pipCanvas.width / 1080;
                // Wider margin space (88% width, 6% each side)
                const maxWidth = pipCanvas.width * 0.88;
                const activeFontSize = Math.round(85 * scale);
                const activeLineHeight = Math.round(110 * scale);
                const activeSpacing = Math.round(60 * scale);
                
                if (this.lyrics && this.lyrics.length > 0) {
                    const elapsedSinceSync = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
                    const smoothProgress = this.progressMs + elapsedSinceSync + this.syncOffset;

                    // Support multiple active lines (duets, overlapping vocals, backing vocals)
                    const activeLines = this.lyrics.filter(line => smoothProgress >= line.timestamp && smoothProgress < line.endtime);
                    const activeLineIndices = new Set(activeLines.map(line => this.lyrics.indexOf(line)));                    // Keep scrolling focus on the last line that has started, so it stays centered until the next line timestamp
                    let activeIndex = this.lyrics.findLastIndex(l => smoothProgress >= l.timestamp);
                    if (activeIndex === -1) {
                        activeIndex = 0;
                    }
                    
                    if (activeIndex !== -1) {
                        const mode = this.currentLyricsMode;
                        
                        // Frame-independent delta-time smooth active index interpolation
                        const now = Date.now();
                        if (this.pipLastFrameTime === undefined) {
                            this.pipLastFrameTime = now;
                        }
                        const deltaTime = (now - this.pipLastFrameTime) / 1000;
                        this.pipLastFrameTime = now;
                        const clampedDelta = Math.min(deltaTime, 1.0);

                        if (this.pipActiveIndexSmooth === undefined || isNaN(this.pipActiveIndexSmooth)) {
                            this.pipActiveIndexSmooth = activeIndex;
                        } else {
                            const k = 6.0; // scrolling speed factor
                            const lerpFactor = 1 - Math.exp(-k * clampedDelta);
                            this.pipActiveIndexSmooth += (activeIndex - this.pipActiveIndexSmooth) * lerpFactor;
                        }

                        const baseIndex = Math.floor(this.pipActiveIndexSmooth);
                        const centerY = pipCanvas.height / 2;
                        
                        // Pre-calculate wrapped lines and active-scale heights for nearby lines (with layout caching to prevent stutters)
                        const linesToDraw = [];
                        const getWrapped = (lyric) => {
                            if (!lyric) return [];
                            // We ALWAYS wrap the original lyrics as the main line in PiP, regardless of currentLyricsMode
                            const cacheKey = `original_${maxWidth}_${activeFontSize}`;
                            if (lyric._wrapCache && lyric._wrapCache.key === cacheKey) {
                                return lyric._wrapCache.lines;
                            }
                            
                            let lines = [];
                            pipCtx.font = `bold ${activeFontSize}px Satoshi, Inter, sans-serif`;
                            
                            const text = this.getLineText(lyric, 'original');
                            lines = wrapText(pipCtx, text, maxWidth);
                            
                            lyric._wrapCache = { key: cacheKey, lines: lines };
                            return lines;
                        };

                        const hasSubTextMode = (mode === 'translation' || mode === 'romanized');

                        for (let i = baseIndex - 3; i <= baseIndex + 3; i++) {
                            if (i >= 0 && i < this.lyrics.length) {
                                const lyric = this.lyrics[i];
                                const wrapped = getWrapped(lyric);
                                const mainHeight = wrapped.length * activeLineHeight;
                                
                                // Calculate background vocals (backing vocals) or translation/romanized subtitle height and layout info
                                let bgWrapped = [];
                                let bgHeight = 0;
                                let bgOpacity = 0;
                                
                                const hasSubText = (mode === 'translation' && lyric.translation) || (mode === 'romanized' && lyric.romanizedText);
                                if (hasSubText) {
                                    const subText = mode === 'translation' ? lyric.translation : lyric.romanizedText;
                                    const bgCacheKey = `sub_${mode}_${maxWidth}_${activeFontSize}`;
                                    if (lyric._subWrapCache && lyric._subWrapCache.key === bgCacheKey) {
                                        bgWrapped = lyric._subWrapCache.lines;
                                    } else {
                                        pipCtx.font = `bold ${Math.round(activeFontSize * 0.65)}px Satoshi, Inter, sans-serif`;
                                        bgWrapped = wrapText(pipCtx, subText, maxWidth);
                                        lyric._subWrapCache = { key: bgCacheKey, lines: bgWrapped };
                                    }
                                    
                                    const bgFullHeight = bgWrapped.length * (activeLineHeight * 0.65) + activeSpacing * 0.25;
                                    bgHeight = bgFullHeight;
                                    bgOpacity = 1.0; 
                                } else if (lyric.background && lyric.backgroundText && lyric.backgroundText.length > 0) {
                                    // Fallback to background vocals if no translation/romanized subtitle is active
                                    const bgCacheKey = `bg_original_${maxWidth}_${activeFontSize}`;
                                    if (lyric._bgWrapCache && lyric._bgWrapCache.key === bgCacheKey) {
                                        bgWrapped = lyric._bgWrapCache.lines;
                                    } else {
                                        const bgText = this.getBgText(lyric);
                                        pipCtx.font = `bold ${Math.round(activeFontSize * 0.65)}px Satoshi, Inter, sans-serif`;
                                        bgWrapped = wrapText(pipCtx, bgText, maxWidth);
                                        lyric._bgWrapCache = { key: bgCacheKey, lines: bgWrapped };
                                    }
                                    
                                    const bgFullHeight = bgWrapped.length * (activeLineHeight * 0.65) + activeSpacing * 0.25;
                                    
                                    // Background vocals should ONLY appear when their exact time window is active
                                    let bgFactor = 0;
                                    if (i === activeIndex) {
                                        const bgStart = lyric.backgroundText[0].timestamp;
                                        const bgEnd = lyric.backgroundText[lyric.backgroundText.length - 1].endtime;
                                        if (smoothProgress >= bgStart && smoothProgress <= bgEnd) {
                                            const fadeDur = Math.min(300, (bgEnd - bgStart) / 2);
                                            if (smoothProgress < bgStart + fadeDur) {
                                                bgFactor = (smoothProgress - bgStart) / fadeDur;
                                            } else if (smoothProgress > bgEnd - fadeDur) {
                                                bgFactor = (bgEnd - smoothProgress) / fadeDur;
                                            } else {
                                                bgFactor = 1.0;
                                            }
                                        }
                                    }
                                    
                                    bgHeight = bgFullHeight * bgFactor;
                                    bgOpacity = bgFactor;
                                }
                                
                                linesToDraw.push({
                                    index: i,
                                    lyric: lyric,
                                    wrapped: wrapped,
                                    height: mainHeight + bgHeight,
                                    mainHeight: mainHeight,
                                    bgWrapped: bgWrapped,
                                    bgHeight: bgHeight,
                                    bgOpacity: bgOpacity,
                                    hasSubText: hasSubText
                                });
                            }
                        }

                        // Calculate Y positions relative to each other in a virtual stack
                        if (linesToDraw.length > 0) {
                            linesToDraw[0].stackY = 0;
                            for (let j = 1; j < linesToDraw.length; j++) {
                                linesToDraw[j].stackY = linesToDraw[j-1].stackY + 
                                                        (linesToDraw[j-1].height + linesToDraw[j].height) / 2 + 
                                                        activeSpacing;
                            }
                        }

                        // Find interpolated scrollY at smooth index
                        const getInterpolatedStackY = (smoothIdx) => {
                            const idx1 = Math.floor(smoothIdx);
                            const idx2 = Math.ceil(smoothIdx);
                            
                            const item1 = linesToDraw.find(item => item.index === idx1);
                            const item2 = linesToDraw.find(item => item.index === idx2);
                            
                            if (item1 && item2) {
                                if (idx1 === idx2) return item1.stackY;
                                const progress = smoothIdx - idx1;
                                return item1.stackY * (1 - progress) + item2.stackY * progress;
                            } else if (item1) {
                                return item1.stackY;
                            } else if (item2) {
                                return item2.stackY;
                            }
                            return 0;
                        };

                        // Keep scrolling center directly on the active line, allowing vertical centering at start and end
                        const scrollY = getInterpolatedStackY(this.pipActiveIndexSmooth);

                        // Draw each line in range
                        linesToDraw.forEach(item => {
                            const distance = Math.abs(item.index - this.pipActiveIndexSmooth);
                            const isItemActive = activeLineIndices.has(item.index);
                            
                            // Smoothly animate scale down transition when active lines end
                            const targetScaleMult = isItemActive ? 1.0 : 0.72;
                            if (item.lyric._scaleMult === undefined) {
                                item.lyric._scaleMult = targetScaleMult;
                            } else {
                                const lerpVal = 1 - Math.exp(-10 * clampedDelta);
                                item.lyric._scaleMult += (targetScaleMult - item.lyric._scaleMult) * lerpVal;
                            }
                            
                            const s = Math.max(0.45, 1.0 - distance * 0.25) * item.lyric._scaleMult;
                            const op = Math.max(0.15, 1.0 - distance * 0.30);
                            
                            pipCtx.save();
                            pipCtx.globalAlpha = op;
                            
                            const canvasY = centerY + (item.stackY - scrollY);
                            pipCtx.translate(pipCanvas.width / 2, canvasY);
                            pipCtx.scale(s, s);
                            
                            // Align LEFT by default, align RIGHT only for opposite voice turn / end alignment
                            const alignRight = item.lyric.oppositeTurn || item.lyric.alignment === 'end';
                            // 88% width means half-width is 44%
                            const halfWidth = (pipCanvas.width * 0.44) / s;
                            
                            let startX;
                            if (alignRight) {
                                pipCtx.textAlign = 'right';
                                startX = halfWidth;
                            } else {
                                pipCtx.textAlign = 'left';
                                startX = -halfWidth;
                            }
                            pipCtx.textBaseline = 'middle';
                            
                            const mainHeight = item.mainHeight;
                            const bgHeight = item.bgHeight;
                            
                            // Main Vocal start Y centered relative to the combined block
                            let startY = -bgHeight / 2 - (mainHeight / 2) + (activeLineHeight / 2);
                            
                            pipCtx.font = `bold ${activeFontSize}px Satoshi, Inter, sans-serif`;
                            
                            if (isItemActive) {
                                // Draw active main lyrics (word-synced or line-synced)
                                if (item.lyric.isWordSynced && Array.isArray(item.lyric.text)) {
                                    const syllables = item.lyric.text;
                                    const wrappedStrings = item.wrapped;
                                    const wrappedSyllableLines = groupSyllablesByLines(syllables, wrappedStrings);
                                    
                                    wrappedStrings.forEach((lineStr, r) => {
                                        const lineSyls = wrappedSyllableLines[r] || [];
                                        const totalLineWidth = pipCtx.measureText(lineStr).width;
                                        
                                        // 1. Measure completed syllable progress width
                                        let completedW = 0;
                                        let sumSyllablesWidth = 0;
                                        
                                        lineSyls.forEach(syl => {
                                            const sylWidth = pipCtx.measureText(syl.text).width;
                                            sumSyllablesWidth += sylWidth;
                                            if (smoothProgress >= syl.endtime) {
                                                completedW += sylWidth;
                                            } else if (smoothProgress >= syl.timestamp && smoothProgress < syl.endtime) {
                                                const pct = (smoothProgress - syl.timestamp) / (syl.endtime - syl.timestamp);
                                                completedW += sylWidth * pct;
                                            }
                                        });
                                        
                                        if (sumSyllablesWidth > 0) {
                                            completedW = completedW * (totalLineWidth / sumSyllablesWidth);
                                        }
                                        
                                        // 2. Draw using Linear Gradient for soft feathered color transition
                                        let grad;
                                        const completedPct = completedW / totalLineWidth;
                                        const isInstrumental = item.lyric.isInstrumental || lineStr.trim() === '♪';
                                        
                                        if (isInstrumental) {
                                            // Vertical gradient (to bottom / de cima para baixo) for instrumental notes
                                            grad = pipCtx.createLinearGradient(0, startY - activeFontSize * 0.45, 0, startY + activeFontSize * 0.45);
                                            grad.addColorStop(0, '#ffffff');
                                            const transitionStart = Math.max(0, completedPct - 0.10);
                                            const transitionEnd = Math.min(1, completedPct);
                                            grad.addColorStop(transitionStart, '#ffffff');
                                            grad.addColorStop(transitionEnd, 'rgba(255, 255, 255, 0.45)');
                                            grad.addColorStop(1, 'rgba(255, 255, 255, 0.45)');
                                        } else {
                                            // Horizontal gradient (to right) for standard lyrics and Fim
                                            grad = pipCtx.createLinearGradient(
                                                alignRight ? startX - totalLineWidth : startX,
                                                0,
                                                alignRight ? startX : startX + totalLineWidth,
                                                0
                                            );
                                            grad.addColorStop(0, '#ffffff');
                                            
                                            // 15% soft transition zone (feathered highlight edge)
                                            const transitionStart = Math.max(0, (completedW - 15 * scale) / totalLineWidth);
                                            const transitionEnd = Math.min(1, completedW / totalLineWidth);
                                            grad.addColorStop(transitionStart, '#ffffff');
                                            grad.addColorStop(transitionEnd, 'rgba(255, 255, 255, 0.45)');
                                            grad.addColorStop(1, 'rgba(255, 255, 255, 0.45)');
                                        }
                                        
                                        pipCtx.save();
                                        pipCtx.fillStyle = grad;
                                        
                                        const isLightMode = document.body.classList.contains('light-mode');
                                        if (!isLightMode) {
                                            // Bright, centered glowing shadow on active text
                                            pipCtx.shadowColor = 'rgba(255, 255, 255, 0.85)';
                                            pipCtx.shadowBlur = 24 * scale;
                                            pipCtx.shadowOffsetX = 0;
                                            pipCtx.shadowOffsetY = 0;
                                        }
                                        
                                        let currentX = alignRight ? startX - totalLineWidth : startX;
                                        lineSyls.forEach(syl => {
                                            const sylWidth = pipCtx.measureText(syl.text).width;
                                            const isActiveWord = (smoothProgress >= syl.timestamp && smoothProgress < syl.endtime);
                                            const isLightMode = document.body.classList.contains('light-mode');
                                            
                                            pipCtx.save();
                                            if (isActiveWord && !isLightMode) {
                                                const duration = syl.endtime - syl.timestamp;
                                                const elapsed = smoothProgress - syl.timestamp;
                                                const wave = duration > 0 ? Math.sin((elapsed / duration) * Math.PI) : 0;
                                                
                                                const popScale = 1 + 0.05 * wave;
                                                const popY = -4 * wave * scale;
                                                
                                                const centerX = currentX + sylWidth / 2;
                                                pipCtx.translate(centerX, startY);
                                                pipCtx.scale(popScale, popScale);
                                                pipCtx.translate(-centerX, -startY);
                                                pipCtx.fillText(syl.text, currentX, startY + popY);
                                            } else {
                                                pipCtx.fillText(syl.text, currentX, startY);
                                            }
                                            pipCtx.restore();
                                            currentX += sylWidth;
                                        });
                                        pipCtx.restore();
                                        
                                        startY += activeLineHeight;
                                    });
                                } else {
                                    // Line-synced active main lyrics: full bright glow
                                    item.wrapped.forEach(lineStr => {
                                        pipCtx.save();
                                        pipCtx.fillStyle = '#ffffff';
                                        pipCtx.shadowColor = 'rgba(255, 255, 255, 0.85)';
                                        pipCtx.shadowBlur = 24 * scale;
                                        pipCtx.shadowOffsetX = 0;
                                        pipCtx.shadowOffsetY = 0;
                                        pipCtx.fillText(lineStr, startX, startY);
                                        pipCtx.restore();
                                        startY += activeLineHeight;
                                    });
                                }
                            } else {
                                // Draw static non-active main lyrics (translucent gray, no glow)
                                if (item.index < activeIndex) {
                                    // Passed lines: darker gray
                                    pipCtx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                                } else {
                                    // Future lines: medium gray
                                    pipCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
                                }
                                pipCtx.shadowBlur = 0;
                                
                                item.wrapped.forEach(lineStr => {
                                    pipCtx.fillText(lineStr, startX, startY);
                                    startY += activeLineHeight;
                                });
                            }
                            
                            // Draw background vocals (backing vocals) or subtitles (translation/romanized) if present
                            if (item.bgWrapped.length > 0 && item.bgHeight > 0) {
                                // startY is already pointing past the last main line at this point
                                // Add a small gap (half the bg font size) to position bg text right below
                                let bgStartY = startY + (activeLineHeight * 0.65) * 0.1;
                                pipCtx.font = `bold ${Math.round(activeFontSize * 0.65)}px Satoshi, Inter, sans-serif`;
                                
                                if (isItemActive) {
                                    if (item.hasSubText) {
                                        // Draw active translation or romanization subtitle (brighter white, line-based)
                                        item.bgWrapped.forEach(bgLineStr => {
                                            pipCtx.save();
                                            pipCtx.globalAlpha = op * item.bgOpacity;
                                            pipCtx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                                            pipCtx.fillText(bgLineStr, startX, bgStartY);
                                            pipCtx.restore();
                                            bgStartY += activeLineHeight * 0.65;
                                        });
                                    } else if (item.lyric.backgroundText && Array.isArray(item.lyric.backgroundText)) {
                                        // Word-synced background vocal check
                                        const bgSyllables = item.lyric.backgroundText;
                                        const wrappedBgSyllableLines = groupSyllablesByLines(bgSyllables, item.bgWrapped);
                                        
                                        item.bgWrapped.forEach((bgLineStr, r) => {
                                            const bgLineSyls = wrappedBgSyllableLines[r] || [];
                                            const totalBgLineWidth = pipCtx.measureText(bgLineStr).width;
                                            
                                            // Measure completed bg progress
                                            let completedBgW = 0;
                                            let sumBgSyllablesWidth = 0;
                                            
                                            bgLineSyls.forEach(syl => {
                                                const sylWidth = pipCtx.measureText(syl.text).width;
                                                sumBgSyllablesWidth += sylWidth;
                                                if (smoothProgress >= syl.endtime) {
                                                    completedBgW += sylWidth;
                                                } else if (smoothProgress >= syl.timestamp && smoothProgress < syl.endtime) {
                                                    const pct = (smoothProgress - syl.timestamp) / (syl.endtime - syl.timestamp);
                                                    completedBgW += sylWidth * pct;
                                                }
                                            });
                                            
                                            if (sumBgSyllablesWidth > 0) {
                                                completedBgW = completedBgW * (totalBgLineWidth / sumBgSyllablesWidth);
                                            }
                                            
                                            // Linear gradient for background vocals highlight
                                            const bgGrad = pipCtx.createLinearGradient(
                                                alignRight ? startX - totalBgLineWidth : startX,
                                                0,
                                                alignRight ? startX : startX + totalBgLineWidth,
                                                0
                                            );
                                            bgGrad.addColorStop(0, '#ffffff');
                                            const transitionStart = Math.max(0, (completedBgW - 15 * scale) / totalBgLineWidth);
                                            const transitionEnd = Math.min(1, completedBgW / totalBgLineWidth);
                                            bgGrad.addColorStop(transitionStart, '#ffffff');
                                            bgGrad.addColorStop(transitionEnd, 'rgba(255, 255, 255, 0.45)');
                                            bgGrad.addColorStop(1, 'rgba(255, 255, 255, 0.45)');
                                            
                                            pipCtx.save();
                                            pipCtx.globalAlpha = op * item.bgOpacity;
                                            pipCtx.fillStyle = bgGrad;
                                            
                                            const isLightMode = document.body.classList.contains('light-mode');
                                            if (!isLightMode) {
                                                pipCtx.shadowColor = 'rgba(255, 255, 255, 0.75)';
                                                pipCtx.shadowBlur = 14 * scale;
                                                pipCtx.shadowOffsetX = 0;
                                                pipCtx.shadowOffsetY = 0;
                                            }
                                            
                                            let currentBgX = alignRight ? startX - totalBgLineWidth : startX;
                                            bgLineSyls.forEach(syl => {
                                                const sylWidth = pipCtx.measureText(syl.text).width;
                                                const isActiveWord = (smoothProgress >= syl.timestamp && smoothProgress < syl.endtime);
                                                
                                                pipCtx.save();
                                                if (isActiveWord && !isLightMode) {
                                                    const duration = syl.endtime - syl.timestamp;
                                                    const elapsed = smoothProgress - syl.timestamp;
                                                    const wave = duration > 0 ? Math.sin((elapsed / duration) * Math.PI) : 0;
                                                    
                                                    const popScale = 1 + 0.05 * wave;
                                                    const popY = -4 * wave * scale;
                                                    
                                                    const centerX = currentBgX + sylWidth / 2;
                                                    pipCtx.translate(centerX, bgStartY);
                                                    pipCtx.scale(popScale, popScale);
                                                    pipCtx.translate(-centerX, -bgStartY);
                                                    pipCtx.fillText(syl.text, currentBgX, bgStartY + popY);
                                                } else {
                                                    pipCtx.fillText(syl.text, currentBgX, bgStartY);
                                                }
                                                pipCtx.restore();
                                                currentBgX += sylWidth;
                                            });
                                            pipCtx.restore();
                                            
                                            bgStartY += activeLineHeight * 0.65;
                                        });
                                    } else {
                                        // Line-synced background vocal
                                        item.bgWrapped.forEach(bgLineStr => {
                                            pipCtx.save();
                                            pipCtx.globalAlpha = op * item.bgOpacity;
                                            pipCtx.fillStyle = '#ffffff';
                                            pipCtx.shadowColor = 'rgba(255, 255, 255, 0.75)';
                                            pipCtx.shadowBlur = 14 * scale;
                                            pipCtx.shadowOffsetX = 0;
                                            pipCtx.shadowOffsetY = 0;
                                            pipCtx.fillText(bgLineStr, startX, bgStartY);
                                            pipCtx.restore();
                                            bgStartY += activeLineHeight * 0.65;
                                        });
                                    }
                                } else {
                                    // Static translucent background vocal or subtitle
                                    if (item.index < activeIndex) {
                                        pipCtx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                                    } else {
                                        pipCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
                                    }
                                    pipCtx.shadowBlur = 0;
                                    
                                    item.bgWrapped.forEach(bgLineStr => {
                                        pipCtx.save();
                                        pipCtx.globalAlpha = op * item.bgOpacity;
                                        pipCtx.fillText(bgLineStr, startX, bgStartY);
                                        pipCtx.restore();
                                        bgStartY += activeLineHeight * 0.65;
                                    });
                                }
                            }
                            
                            pipCtx.restore();
                        });
                    } else {
                        const fontSize = Math.round(40 * scale);
                        pipCtx.font = `bold ${fontSize}px Satoshi, Inter, sans-serif`;
                        pipCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                        pipCtx.textAlign = 'center';
                        pipCtx.textBaseline = 'middle';
                        pipCtx.fillText('Instrumental / Pausa', pipCanvas.width / 2, pipCanvas.height / 2);
                    }
                } else {
                    const fontSize = Math.round(50 * scale);
                    pipCtx.font = `bold ${fontSize}px Satoshi, Inter, sans-serif`;
                    pipCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    pipCtx.textAlign = 'center';
                    pipCtx.textBaseline = 'middle';
                    pipCtx.fillText('Carregando letras...', pipCanvas.width / 2, pipCanvas.height / 2);
                }
                
                // Draw single large L resize handle in bottom-left corner
                pipCtx.save();
                pipCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                pipCtx.lineWidth = Math.round(10 * scale); // slightly thicker
                pipCtx.lineCap = 'round';
                
                const handleSize = Math.round(48 * scale); // smaller size
                const pad = Math.round(30 * scale);
                const blX = pad;
                const blY = pipCanvas.height - pad;
                
                // Outer angle
                pipCtx.beginPath();
                pipCtx.moveTo(blX, blY - handleSize);
                pipCtx.lineTo(blX, blY);
                pipCtx.lineTo(blX + handleSize, blY);
                pipCtx.stroke();
                
                pipCtx.restore();
            } catch (err) {
                pipCtx.fillStyle = '#ff0000';
                pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);
                pipCtx.fillStyle = '#ffffff';
                pipCtx.font = '24px sans-serif';
                pipCtx.textAlign = 'center';
                pipCtx.textBaseline = 'middle';
                pipCtx.fillText("Err: " + err.message, pipCanvas.width / 2, pipCanvas.height / 2);
            }
        };

        const startCanvasPip = async () => {
            let handleVisibilityChange = null;

            const startLoop = () => {
                stopLoop();
                if (!silentAudio) {
                    silentAudio = document.createElement('audio');
                    silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAD';
                    silentAudio.loop = true;
                }
                silentAudio.play().catch(e => console.log("Silent audio blocked:", e));

                if (document.visibilityState === 'visible') {
                    const tick = () => {
                        if (!pipAnimationId) return;
                        renderPipCanvas();
                        pipAnimationId = requestAnimationFrame(tick);
                    };
                    pipAnimationId = requestAnimationFrame(tick);
                } else {
                    // Full 30 FPS in background (prevented from throttling by silent audio)
                    pipIntervalId = setInterval(renderPipCanvas, 1000 / 30);
                }
            };

            const stopLoop = () => {
                if (pipAnimationId) {
                    cancelAnimationFrame(pipAnimationId);
                    pipAnimationId = null;
                }
                if (pipIntervalId) {
                    clearInterval(pipIntervalId);
                    pipIntervalId = null;
                }
                if (silentAudio) {
                    silentAudio.pause();
                }
            };

            if (!pipVideo) {
                pipCanvas = document.createElement('canvas');
                
                // 3:4 portrait canvas — vertical rectangle, compact height on mobile
                const pipW = 1080;
                const pipH = 1440;
                
                pipCanvas.width = pipW;
                pipCanvas.height = pipH;
                
                pipCanvas.style.position = 'fixed';
                pipCanvas.style.top = '0';
                pipCanvas.style.left = '0';
                pipCanvas.style.width = '1px';
                pipCanvas.style.height = '1px';
                pipCanvas.style.opacity = '0.001';
                pipCanvas.style.pointerEvents = 'none';
                pipCanvas.style.zIndex = '-9999';
                document.body.appendChild(pipCanvas);
                pipCtx = pipCanvas.getContext('2d');

                pipVideo = document.createElement('video');
                pipVideo.muted = true;
                pipVideo.playsInline = true;
                pipVideo.style.position = 'fixed';
                pipVideo.style.top = '0';
                pipVideo.style.left = '0';
                
                // Adapts initial PiP window size based on screen size (small on phone, larger on tablet)
                const screenWidth = window.screen.width || window.innerWidth;
                const videoW = Math.round(screenWidth * 0.32);
                const videoH = Math.round(videoW * (pipH / pipW)); // 3:4 portrait (vertical)
                
                pipVideo.style.width = videoW + 'px';
                pipVideo.style.height = videoH + 'px';
                pipVideo.style.opacity = '0.001';
                pipVideo.style.pointerEvents = 'none';
                pipVideo.style.zIndex = '-9999';
                document.body.appendChild(pipVideo);

                pipVideo.addEventListener('enterpictureinpicture', () => {
                    startLoop();
                    
                    handleVisibilityChange = () => {
                        startLoop();
                    };
                    document.addEventListener('visibilitychange', handleVisibilityChange);
                    
                    const btnPipTop = document.getElementById('btn-pip-top');
                    if (btnPipTop) {
                        btnPipTop.classList.add('!text-green-500');
                        btnPipTop.classList.remove('text-white/50');
                    }
                    
                    const lyricsContainer = document.getElementById('lyrics-container');
                    const floatingControls = document.getElementById('floating-controls-wrapper');
                    
                    if (lyricsContainer) {
                        lyricsContainer.style.display = 'none';
                    }
                    if (floatingControls) floatingControls.style.display = 'none';

                    const placeholder = document.createElement('div');
                    placeholder.id = 'mobile-pip-placeholder';
                    placeholder.className = 'flex-1 flex flex-col items-center justify-center text-white/70 text-center px-4 pt-10 pb-10';
                    placeholder.innerHTML = `
                        <svg class="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 19H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2zM12 11h7v6h-7z" />
                        </svg>
                        <h2 class="text-xl font-bold mb-2 text-white">Modo Picture-in-Picture ativo</h2>
                        <p class="text-sm">As letras estão sendo exibidas na janela flutuante.</p>
                        <button id="btn-mobile-pip-return" class="mt-6 bg-white text-black px-6 py-2 rounded-full font-bold hover:scale-105 transition-transform">
                            Voltar para cá
                        </button>
                    `;
                    
                    if (lyricsContainer && lyricsContainer.parentNode) {
                        lyricsContainer.parentNode.insertBefore(placeholder, lyricsContainer);
                    } else {
                        document.body.appendChild(placeholder);
                    }
                    
                    document.getElementById('btn-mobile-pip-return').addEventListener('click', () => {
                        if (document.pictureInPictureElement) {
                            document.exitPictureInPicture();
                        }
                    });
                });

                pipVideo.addEventListener('leavepictureinpicture', () => {
                    stopLoop();
                    if (handleVisibilityChange) {
                        document.removeEventListener('visibilitychange', handleVisibilityChange);
                        handleVisibilityChange = null;
                    }
                    
                    const btnPipTop = document.getElementById('btn-pip-top');
                    if (btnPipTop) {
                        btnPipTop.classList.remove('!text-green-500');
                        btnPipTop.classList.add('text-white/50');
                    }
                    
                    const lyricsContainer = document.getElementById('lyrics-container');
                    const floatingControls = document.getElementById('floating-controls-wrapper');
                    
                    if (lyricsContainer) {
                        lyricsContainer.style.display = '';
                    }
                    if (floatingControls) floatingControls.style.display = '';

                    const placeholder = document.getElementById('mobile-pip-placeholder');
                    if (placeholder) placeholder.remove();
                    
                    this.currentActiveIdsKey = '';
                    setTimeout(() => {
                        this.isUserInteracting = false;
                        if (this.lyricsContainer) this.lyricsContainer.classList.remove('user-scrolling');
                        if (this.btnRecenter) this.btnRecenter.classList.add('hidden');
                        this.updateLyricsSync(this.progressMs);
                    }, 150);
                });
            }

            startLoop();
            renderPipCanvas();

            const stream = pipCanvas.captureStream(30);
            pipVideo.srcObject = stream;
            
            try {
                await pipVideo.play();
                await pipVideo.requestPictureInPicture();
            } catch (err) {
                console.error("Erro ao abrir Video PiP:", err);
                this.showToast('Picture-in-Picture falhou.', 'error');
                stopLoop();
            }
        };
        
        const handlePipClick = async (event) => {
            if (event && event.currentTarget) {
                event.currentTarget.blur();
            }
            if (!(false && 'documentPictureInPicture' in window)) {
                if (document.pictureInPictureElement) {
                    document.exitPictureInPicture();
                } else {
                    await startCanvasPip();
                }
                return;
            }
            try {

                if (window.documentPictureInPicture.window) return;
                    
                    const pipWindow = await window.documentPictureInPicture.requestWindow({
                        width: 400,
                        height: 600,
                    });
                    this.pipWindow = pipWindow;

                    [...document.styleSheets].forEach((styleSheet) => {
                        try {
                            const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
                            const style = document.createElement('style');
                            style.textContent = cssRules;
                            pipWindow.document.head.appendChild(style);
                        } catch (e) {
                            const link = document.createElement('link');
                            link.rel = 'stylesheet';
                            link.type = styleSheet.type;
                            link.media = styleSheet.media;
                            link.href = styleSheet.href;
                            pipWindow.document.head.appendChild(link);
                        }
                    });

                    pipWindow.document.body.className = 'pip-mode bg-[#050505] text-white flex flex-col min-h-screen relative';

                    const bgClone = document.querySelector('.blur-background-container').cloneNode(true);
                    pipWindow.document.body.appendChild(bgClone);

                    const originalContainer = document.getElementById('lyrics-container');

                    const pipMain = document.createElement('main');
                    pipMain.className = 'flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 py-8 relative z-10';
                    
                    const placeholder = document.createElement('div');
                    placeholder.id = 'pip-placeholder';
                    placeholder.className = 'flex-1 flex flex-col justify-center items-center text-white/50 text-center px-4';
                    placeholder.innerHTML = `
                        <svg class="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 19H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2zM12 11h7v6h-7z" />
                        </svg>
                        <h2 class="text-xl font-bold mb-2 text-white">Modo Picture-in-Picture ativo</h2>
                        <p class="text-sm">As letras estão sendo exibidas na janela flutuante.</p>
                        <button id="btn-close-pip" class="mt-6 bg-white text-black font-bold py-2 px-6 rounded-full hover:scale-105 transition-transform">Voltar para cá</button>
                    `;
originalContainer.parentNode.insertBefore(placeholder, originalContainer);
                    pipMain.appendChild(originalContainer);
                    pipWindow.document.body.appendChild(pipMain);

                    if (this.btnRecenter) {
                        this.btnRecenter.classList.add('hidden');
                    }

                    const btnRecenterClone = document.getElementById('btn-recenter').cloneNode(true);
                    btnRecenterClone.id = 'btn-recenter-pip';
                    btnRecenterClone.style.position = 'fixed';
                    btnRecenterClone.style.bottom = '2rem';
                    btnRecenterClone.style.left = '50%';
                    btnRecenterClone.style.transform = 'translateX(-50%)';
                    btnRecenterClone.style.zIndex = '50';
                    btnRecenterClone.style.display = 'flex';
                    btnRecenterClone.style.alignItems = 'center';
                    btnRecenterClone.style.justifyContent = 'center';
                    btnRecenterClone.style.whiteSpace = 'nowrap';
                    pipWindow.document.body.appendChild(btnRecenterClone);

                    let pipScrollTimeout;
                    const handlePipUserInteraction = () => {
                        this.isUserInteracting = true;
                        if (this.lyricsContainer) this.lyricsContainer.classList.add('user-scrolling');
                        btnRecenterClone.classList.remove('hidden');
                        pipWindow.requestAnimationFrame(() => {
                            btnRecenterClone.classList.remove('opacity-0', 'scale-95');
                            btnRecenterClone.classList.add('opacity-100', 'scale-100');
                        });
                        
                        clearTimeout(pipScrollTimeout);
                        pipScrollTimeout = setTimeout(() => {
                            if (!this.isUserInteracting) {
                                btnRecenterClone.classList.remove('opacity-100', 'scale-100');
                                btnRecenterClone.classList.add('opacity-0', 'scale-95');
                                setTimeout(() => btnRecenterClone.classList.add('hidden'), 300);
                            }
                        }, 3000);
                    };

                    pipWindow.addEventListener('wheel', handlePipUserInteraction, { passive: true });
                    pipWindow.addEventListener('touchmove', handlePipUserInteraction, { passive: true });
                    pipWindow.addEventListener('scroll', () => {

                        if (Date.now() - this.lastAutoScrollTime < 800) {
                            return;
                        }
                        handlePipUserInteraction();
                    });

                    btnRecenterClone.addEventListener('click', () => {
                        this.isUserInteracting = false;
                        if (this.lyricsContainer) this.lyricsContainer.classList.remove('user-scrolling');
                        btnRecenterClone.classList.remove('opacity-100', 'scale-100');
                        btnRecenterClone.classList.add('opacity-0', 'scale-95');
                        setTimeout(() => btnRecenterClone.classList.add('hidden'), 300);
                        this.updateLyricsSync(this.progressMs);
                    });

                    if (this.btnFloatingRestart) this.btnFloatingRestart.classList.add('hidden');
                    const btnPipTop = document.getElementById('btn-pip-top');
                    if (btnPipTop) {
                        btnPipTop.classList.add('text-green-500');
                    }

                    placeholder.querySelector('#btn-close-pip').addEventListener('click', () => {
                        pipWindow.close();
                    });

                    pipWindow.addEventListener("pagehide", (event) => {
                        placeholder.parentNode.insertBefore(originalContainer, placeholder);
                        placeholder.remove();
                        this.pipWindow = null;
                        if (this.btnFloatingRestart) this.btnFloatingRestart.classList.remove('hidden');
                        const btnPipTop = document.getElementById('btn-pip-top');
                        if (btnPipTop) {
                            btnPipTop.classList.remove('text-green-500');
                        }

                        this.isUserInteracting = false;
                        if (this.lyricsContainer) this.lyricsContainer.classList.remove('user-scrolling');
                        if (this.btnRecenter) {
                            this.btnRecenter.classList.remove('opacity-100', 'scale-100');
                            this.btnRecenter.classList.add('opacity-0', 'scale-95');
                            setTimeout(() => this.btnRecenter.classList.remove('hidden'), 300);
                        }
                        this.updateLyricsSync(this.progressMs);
                    });
                    
                } catch (error) {
                    console.error('Erro ao iniciar PiP:', error);
                    this.showToast('Erro ao abrir Picture-in-Picture.', 'error');
                }
            };
            
            if (this.btnPipTop) this.btnPipTop.addEventListener('click', handlePipClick);
            if (this.btnFloatingPip) this.btnFloatingPip.addEventListener('click', handlePipClick);
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

        this.activeLineId = null;
        if (this.lyricsContainer) {
            const els = this.lyricsContainer.querySelectorAll('.lyric-line, .lyrics-syllable');
            els.forEach(el => el.classList.remove('active', 'passed', 'current'));
            
            const elapsed = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
            this.updateLyricsSync(this.progressMs + elapsed + this.syncOffset);
        }
    }

    loadSettings() {
        this.inputClientId.value = localStorage.getItem(Config.CLIENT_ID_KEY) || '';

        // Load Light Mode
        const lightModeActive = localStorage.getItem('lysinc_light_mode') === 'true';
        if (lightModeActive) {
            document.body.classList.add('light-mode');
            if (this.btnLightMode) this.btnLightMode.classList.add('active-light');
        }
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

        this.pollPlayerState();

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

        if (Date.now() - this.lastUserSeekTime < 3000) {
            console.log('[LySinc] Ignorando pollPlayerState devido a clique/seek recente do usuário.');
            return;
        }

        const state = await SpotifyService.getCurrentlyPlaying();

        if (!state) {

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

        const latencyCompensation = Date.now() - state.requestTime;
        const stateTrackId = state.trackId || (state.trackName + state.albumName);

        let safeCompensation = Math.max(0, Math.min(1500, latencyCompensation));
        if (!state.isPlaying) {
            safeCompensation = 0;
        }

        if (this.isPlaying !== state.isPlaying) {
            this.isPlaying = state.isPlaying;
            if (this.isPlaying) {
                this.wakeLockManager.request();
            } else {
                this.wakeLockManager.release();
            }
        }
        this.durationMs = state.durationMs;

        if (this.isPlaying) {
            if (this.iconTopPlay) this.iconTopPlay.classList.add('hidden');
            if (this.iconTopPause) this.iconTopPause.classList.remove('hidden');
            if (this.iconFloatingPlay) this.iconFloatingPlay.classList.add('hidden');
            if (this.iconFloatingPause) this.iconFloatingPause.classList.remove('hidden');
        } else {
            if (this.iconTopPlay) this.iconTopPlay.classList.remove('hidden');
            if (this.iconTopPause) this.iconTopPause.classList.add('hidden');
            if (this.iconFloatingPlay) this.iconFloatingPlay.classList.remove('hidden');
            if (this.iconFloatingPause) this.iconFloatingPause.classList.add('hidden');
        }

        if (stateTrackId !== this.currentTrackId) {
            const isAutoSkip = this.currentTrackId !== null && this.isPlaying;
            this.currentTrackId = stateTrackId;
            this.hasAutoSeekedToFirstLine = false;
            this.adjustSyncOffset(0, true);
            
            this.progressMs = state.progressMs + safeCompensation;
            this.lastSyncTime = Date.now();
            
            if (isAutoSkip) {


                this.seekToTime(this.progressMs, true).catch(() => {});
            }

            this.updateTrackDetails(state);
            await this.loadLyricsForTrack(state);
        } else {



            const elapsed = Date.now() - this.lastSyncTime;
            const currentLocalProgress = this.progressMs + elapsed;
            const diff = Math.abs(state.progressMs - currentLocalProgress);
            const isSeek = diff > 5000;

            const syncThreshold = (state.progressMs < 10000) ? 150 : 800;
            const isOutOfSync = diff > syncThreshold;

            if (isSeek || isOutOfSync) {
                this.progressMs = state.progressMs + safeCompensation;
                this.lastSyncTime = Date.now();
                console.log(`[LySinc] Sincronização alinhada com Spotify: API=${state.progressMs}ms, Local=${currentLocalProgress}ms (diff=${diff}ms)`);
            } else {

                console.log(`[LySinc] Ignorado lag menor do Spotify: API=${state.progressMs}ms, Local=${currentLocalProgress}ms`);
            }
        }

        this.showScreen('main');

        if (this.lyrics.length > 0) {
            const elapsed = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
            const currentEstimatedTime = this.progressMs + elapsed + this.syncOffset;
            this.updateLyricsSync(currentEstimatedTime);
        }
    }

    updateTrackDetails(state) {
        this.trackName.textContent = state.trackName;
        this.trackArtists.textContent = state.artists;

        if (this.explicitIconHeader && this.footerExplicit) {
            if (state.explicit) {
                this.explicitIconHeader.classList.remove('hidden');
                this.footerExplicit.classList.remove('hidden');
                this.footerExplicit.classList.add('flex');
            } else {
                this.explicitIconHeader.classList.add('hidden');
                this.footerExplicit.classList.add('hidden');
                this.footerExplicit.classList.remove('flex');
            }
        }

        setTimeout(() => {
            this.setupMarquee(this.trackName);
            this.setupMarquee(this.trackArtists);
        }, 50);

        if (state.albumArtUrl) {
            this.albumArt.src = state.albumArtUrl;
            this.albumArtBlur.style.backgroundImage = `url('${state.albumArtUrl}')`;
            if (this.pipWindow) {
                const pipBlur = this.pipWindow.document.getElementById('album-art-blur');
                if (pipBlur) pipBlur.style.backgroundImage = `url('${state.albumArtUrl}')`;
            }
            
            this.currentAlbumColor = '#121212';
            try {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    canvas.width = img.width || 64;
                    canvas.height = img.height || 64;
                    ctx.drawImage(img, 0, 0);
                    try {
                        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        let r = 0, g = 0, b = 0, count = 0;
                        for (let i = 0; i < data.data.length; i += 20) {
                            r += data.data[i];
                            g += data.data[i+1];
                            b += data.data[i+2];
                            count++;
                        }
                        if (count > 0) {
                            r = Math.floor((r/count) * 0.4);
                            g = Math.floor((g/count) * 0.4);
                            b = Math.floor((b/count) * 0.4);
                            this.currentAlbumColor = `rgb(${r}, ${g}, ${b})`;
                            document.documentElement.style.setProperty('--album-color', this.currentAlbumColor);
                        }
                    } catch(e) {}
                };
                img.src = state.albumArtUrl;
            } catch(e) {}
        } else {
            this.albumArt.src = '';
            this.albumArtBlur.style.backgroundImage = 'none';
            this.currentAlbumColor = '#121212';
            document.documentElement.style.setProperty('--album-color', '#121212');
            if (this.pipWindow) {
                const pipBlur = this.pipWindow.document.getElementById('album-art-blur');
                if (pipBlur) pipBlur.style.backgroundImage = 'none';
            }
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

        this.adjustSyncOffset(0, true);
        
        const requestTrackId = state.trackId || (state.trackName + state.albumName);
        this._currentLyricsRequest = requestTrackId;
        this.currentTrackArtists = state.artists || '';

        this.activeLineId = null;
        this.currentActiveIdsKey = '';
        this.isUserInteracting = false;
        this.lyrics = [];
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
            this.btnRecenter.classList.add('hidden', 'opacity-0');
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

        const fetchedLyrics = await LyricsService.getLyrics(
            state.trackName, 
            state.artists, 
            state.albumName, 
            state.durationMs,
            this.userForcedProvider ? this.currentLyricsProvider : null,
            state.isrc
        );

        if (requestTrackId !== this.currentTrackId) return;

        if (fetchedLyrics) {
            this.currentLyricsProvider = fetchedLyrics.source;
        }
        this.userForcedProvider = false;

        if (requestTrackId !== this.currentTrackId) {
            return;
        }

        if (fetchedLyrics && fetchedLyrics.original && fetchedLyrics.original.length > 0) {
            this.lyricsData = fetchedLyrics;

            if (this.currentLyricsMode !== 'original' && !this.lyricsData[this.currentLyricsMode]) {
                this.lyrics = this.injectInstrumentalLines(this.lyricsData.original);
                this.renderLyrics();
                this.changeLyricsMode(this.currentLyricsMode);
            } else {
                this.lyrics = this.injectInstrumentalLines(this.lyricsData[this.currentLyricsMode] || this.lyricsData.original);
                this.renderLyrics();
            }

            if (topMenu) {
                topMenu.classList.remove('hidden');

                topMenu.classList.add('flex');
            }

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

    async changeLyricsMode(mode) {
        if (!this.lyricsData) return;

        document.querySelectorAll('.lyric-tab-btn').forEach(btn => {
            if (btn.getAttribute('data-mode') === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        this.currentLyricsMode = mode;

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

        this.renderLyrics(true);
        
        const elapsedSinceSync = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
        const currentProgressMs = Math.min(this.progressMs + elapsedSinceSync + this.syncOffset, this.durationMs);
        this.activeLineId = null;

        this.isUserInteracting = false;
        this.lastAutoScrollTime = Date.now();
        if (this.lyricsContainer) this.lyricsContainer.classList.remove('user-scrolling');
        if (this.btnRecenter) {
            this.btnRecenter.classList.remove('opacity-100', 'scale-100');
            this.btnRecenter.classList.add('opacity-0', 'scale-95');
            setTimeout(() => this.btnRecenter.classList.add('hidden'), 300);
        }

        this.updateLyricsSync(currentProgressMs);
    }

    injectInstrumentalLines(lines) {
        if (!lines || lines.length === 0) return lines;

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

        const firstLine = lines[0];
        if (firstLine.timestamp > 5000) {
            result.push({
                id: -1,
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

                const prevEndtime = prevLine.endtime || (prevLine.timestamp + 3000);
                
                if (currentLine.timestamp - prevEndtime > 5000) {
                    result.push({
                        id: i - 0.5,
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

        if (lines.length > 0 && this.durationMs) {
            const lastLine = lines[lines.length - 1];
            const lastEndtime = lastLine.endtime || (lastLine.timestamp + 3000);
            if (this.durationMs - lastEndtime > 5000) {
                const alignRight = lastLine ? (lastLine.oppositeTurn || lastLine.alignment === 'end') : false;
                result.push({
                    id: lines.length + 0.5,
                    text: [{ text: 'Fim', timestamp: lastEndtime + 500, endtime: this.durationMs }],
                    background: false,
                    backgroundText: [],
                    timestamp: lastEndtime + 500,
                    endtime: this.durationMs,
                    isWordSynced: true,
                    alignment: alignRight ? 'end' : 'start',
                    oppositeTurn: alignRight
                });
            }
        }
        
        return result;
    }

    getDOMWrapContext() {
        if (!this._domCtx) {
            const canvas = document.createElement('canvas');
            this._domCtx = canvas.getContext('2d');
        }
        
        const dummy = document.createElement('div');
        dummy.className = 'lyric-line md:py-3 max-md:py-1.5 font-black inline-block';
        dummy.style.visibility = 'hidden';
        dummy.style.position = 'absolute';
        dummy.textContent = 'test';
        if (this.lyricsContainer) this.lyricsContainer.appendChild(dummy);
        
        const style = window.getComputedStyle(dummy);
        this._domCtx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        
        if (this.lyricsContainer) this.lyricsContainer.removeChild(dummy);
        
        const maxWidth = this.lyricsContainer ? (this.lyricsContainer.clientWidth - 48) : 300;
        return { ctx: this._domCtx, maxWidth: maxWidth > 100 ? maxWidth : 300 };
    }

    renderLyrics(keepScroll = false) {
        const currentScrollY = window.scrollY;
        this.lyricsContainer.innerHTML = '';
        this.lastAutoScrollTime = Date.now();
        if (!keepScroll) {
            this.scrollToPosition(0);
        }

        const { ctx: domCtx, maxWidth } = this.getDOMWrapContext();

        this.lyrics.forEach((line) => {
            const lineEl = document.createElement('div');
            lineEl.id = `line-${line.id}`;
            
            let lineClass = 'lyric-line max-md:py-1.5 max-md:my-1 md:py-3 md:my-2 transition-all duration-300';
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
            
            const isInstrumental = line.isInstrumental || (line.text.length === 1 && (line.text[0].text.trim() === '♪' || line.text[0].text.trim().includes('♪')));
            if (isInstrumental) {
                lineClass += ' instrumental-line';
            }
            
            lineEl.className = lineClass;

            lineEl.addEventListener('click', () => {
                const firstSyl = line.text[0];
                if (firstSyl) {
                    this.seekToTime(firstSyl.timestamp);
                }
            });

            const lineContainer = document.createElement('div');
            lineContainer.className = 'lyrics-line-container';

            const mainVocal = document.createElement('div');
            mainVocal.className = 'main-vocal-container';
            if (isInstrumental) {
                const sylSpan = document.createElement('span');
                sylSpan.className = 'lyrics-syllable instrumental-icon';
                sylSpan.id = `word-${line.id}-0`;
                sylSpan.innerHTML = '♪';
                mainVocal.appendChild(sylSpan);
            } else {
                let domLines = [];
                
                if (Array.isArray(line.text) && line.isWordSynced) {
                    const text = this.getLineText(line, 'original');
                    const wrappedStrings = wrapText(domCtx, text, maxWidth);
                    const syllableLines = groupSyllablesByLines(line.text, wrappedStrings);
                    domLines = syllableLines.map(sylArray => ({ text: sylArray, isSynced: true }));
                } else {
                    const text = this.getLineText(line, 'original');
                    const wrappedStrings = wrapText(domCtx, text, maxWidth);
                    domLines = wrappedStrings.map(str => ({ text: str, isSynced: false }));
                }

                domLines.forEach((domLine, lineIdx) => {
                    const currentWordWrapper = document.createElement('div');
                    currentWordWrapper.className = 'dom-lyric-line-wrapper inline-block max-w-full break-words';
                    
                    if (domLine.isSynced) {
                        domLine.text.forEach((syl, sylSubIdx) => {
                            // Recover global index of the syllable
                            const idx = line.text.indexOf(syl);
                            const hasSpace = syl.text.endsWith(' ') && syl.text !== ' ';
                            const cleanText = hasSpace ? syl.text.slice(0, -1) : syl.text;
                            
                            const sylSpan = document.createElement('span');
                            sylSpan.className = 'lyrics-syllable';
                            sylSpan.id = `word-${line.id}-${idx}`;
                            sylSpan.textContent = cleanText;
                            
                            currentWordWrapper.appendChild(sylSpan);
                            if (hasSpace) {
                                currentWordWrapper.appendChild(document.createTextNode(' '));
                            }
                        });
                    } else {
                        currentWordWrapper.textContent = domLine.text;
                    }
                    
                    mainVocal.appendChild(currentWordWrapper);
                    
                    if (lineIdx < domLines.length - 1) {
                        mainVocal.appendChild(document.createElement('br'));
                    }
                });
            }
            lineContainer.appendChild(mainVocal);

            if (line.background && line.backgroundText && line.backgroundText.length > 0) {
                const bgVocal = document.createElement('div');
                bgVocal.className = 'background-vocal-container';
                
                let domBgLines = [];
                
                if (Array.isArray(line.backgroundText)) {
                    // Check if they are synced
                    const isSyncedBg = line.backgroundText[0] && line.backgroundText[0].timestamp !== undefined;
                    const bgText = this.getBgText(line);
                    const wrappedStrings = wrapText(domCtx, bgText, maxWidth);
                    if (isSyncedBg) {
                        const syllableLines = groupSyllablesByLines(line.backgroundText, wrappedStrings);
                        domBgLines = syllableLines.map(sylArray => ({ text: sylArray, isSynced: true }));
                    } else {
                        domBgLines = wrappedStrings.map(str => ({ text: str, isSynced: false }));
                    }
                } else {
                    const bgText = this.getBgText(line);
                    const wrappedStrings = wrapText(domCtx, bgText, maxWidth);
                    domBgLines = wrappedStrings.map(str => ({ text: str, isSynced: false }));
                }

                domBgLines.forEach((domLine, lineIdx) => {
                    const bgWordWrapper = document.createElement('div');
                    bgWordWrapper.className = 'dom-lyric-line-wrapper inline-block max-w-full break-words';
                    
                    if (domLine.isSynced) {
                        domLine.text.forEach((syl, sylSubIdx) => {
                            const idx = line.backgroundText.indexOf(syl);
                            const hasSpace = syl.text.endsWith(' ') && syl.text !== ' ';
                            const cleanText = hasSpace ? syl.text.slice(0, -1) : syl.text;
                            
                            const sylSpan = document.createElement('span');
                            sylSpan.className = 'lyrics-syllable backing-vocal';
                            sylSpan.id = `bgword-${line.id}-${idx}`;
                            sylSpan.textContent = cleanText;
                            
                            bgWordWrapper.appendChild(sylSpan);
                            if (hasSpace) {
                                bgWordWrapper.appendChild(document.createTextNode(' '));
                            }
                        });
                    } else {
                        bgWordWrapper.textContent = domLine.text;
                        bgWordWrapper.className += ' backing-vocal';
                    }
                    
                    bgVocal.appendChild(bgWordWrapper);
                    
                    if (lineIdx < domBgLines.length - 1) {
                        bgVocal.appendChild(document.createElement('br'));
                    }
                });
                lineContainer.appendChild(bgVocal);
            }

            if (this.currentLyricsMode === 'translation' && line.translation) {
                const transEl = document.createElement('div');
                transEl.className = 'lyrics-translation-container';
                const transText = this.getLineText(line, 'translation');
                const wrappedTrans = wrapText(domCtx, transText, maxWidth);
                
                wrappedTrans.forEach((str, lineIdx) => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'dom-lyric-line-wrapper inline-block max-w-full break-words';
                    wrapper.textContent = str;
                    transEl.appendChild(wrapper);
                    if (lineIdx < wrappedTrans.length - 1) transEl.appendChild(document.createElement('br'));
                });
                
                lineContainer.appendChild(transEl);
            } else if (this.currentLyricsMode === 'romanized' && line.romanizedText) {
                const romEl = document.createElement('div');
                romEl.className = 'lyrics-romanization-container';
                
                const romText = this.getLineText(line, 'romanized');
                const wrappedRom = wrapText(domCtx, romText, maxWidth);
                
                wrappedRom.forEach((str, lineIdx) => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'dom-lyric-line-wrapper inline-block max-w-full break-words';
                    wrapper.textContent = str;
                    romEl.appendChild(wrapper);
                    if (lineIdx < wrappedRom.length - 1) romEl.appendChild(document.createElement('br'));
                });
                
                lineContainer.appendChild(romEl);
            }

            lineEl.appendChild(lineContainer);
            this.lyricsContainer.appendChild(lineEl);
        });

        if (this.lyrics.length > 0) {
            const creditsBlock = document.createElement('div');
            creditsBlock.id = 'lyrics-credits-block';
            creditsBlock.className = 'mt-10 mb-8 pt-6 flex flex-wrap gap-3 items-center justify-start opacity-70 hover:opacity-100 transition-opacity';

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

            const providerText = this.lyricsData?.source || 'Desconhecida';
            
            const btnChangeSource = document.createElement('button');
            btnChangeSource.id = 'btn-change-source-inline';
            btnChangeSource.className = 'flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer';
            btnChangeSource.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-500/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <span class="font-medium">Fonte: ${providerText}</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 ml-1 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
            `;
            creditsBlock.appendChild(btnChangeSource);

            const btnRestartTrack = document.createElement('button');
            btnRestartTrack.className = 'flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer';
            btnRestartTrack.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12.5 5L5.5 12l7 7M5.5 12h13M18.5 5v14" />
                </svg>
                <span class="font-medium">Reiniciar Música</span>
            `;
            btnRestartTrack.addEventListener('click', () => {
                this.seekToTime(0);
                this.isUserInteracting = false;
                if (this.lyricsContainer) this.lyricsContainer.classList.remove('user-scrolling');
                if (this.btnRecenter) {
                    this.btnRecenter.classList.add('opacity-0', 'hidden');
                }
            });
            creditsBlock.appendChild(btnRestartTrack);

            this.lyricsContainer.appendChild(creditsBlock);

            btnChangeSource.addEventListener('click', () => {
                if (!this.lyricsData || !this.lyricsData.availableSources || this.lyricsData.availableSources.length <= 1) {
                    this.showToast('Nenhuma outra fonte disponível para esta música.', 'info');
                    return;
                }

                const available = this.lyricsData.availableSources.map(s => s.source);
                let currentIdx = available.indexOf(this.lyricsData.source);
                if (currentIdx === -1) currentIdx = 0;
                
                const nextIdx = (currentIdx + 1) % available.length;
                const nextSource = this.lyricsData.availableSources[nextIdx];

                this.lyricsData.original = nextSource.lines;
                this.lyricsData.source = nextSource.source;
                this.currentLyricsProvider = nextSource.source;
                this.userForcedProvider = true;
                
                this.showToast(`Fonte alterada para: ${nextSource.source}`, 'success');

                this.changeLyricsMode(this.currentLyricsMode);
            });
        }
        
        if (keepScroll) {
            window.scrollTo(0, currentScrollY);
            this.lastAutoScrollTime = Date.now();
        }
    }

    startTicker() {
        const tick = () => {
            if (this.isPlaying && this.lastSyncTime > 0) {
                const elapsedSinceSync = Date.now() - this.lastSyncTime;
                const currentProgressMs = Math.min(this.progressMs + elapsedSinceSync + this.syncOffset, this.durationMs);
                
                this.updateProgressBar(currentProgressMs);

                this.updateLyricsSync(currentProgressMs);

                if (currentProgressMs >= this.durationMs && this.durationMs > 0 && !this.isWaitingForNextTrack) {
                    this.isWaitingForNextTrack = true;
                    this.pollPlayerState().finally(() => {
                        setTimeout(() => { this.isWaitingForNextTrack = false; }, 3000);
                    });
                }
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

        const activeLines = this.lyrics.filter(line => currentProgressMs >= line.timestamp && currentProgressMs < line.endtime);
        const activeLineIds = new Set(activeLines.map(l => l.id));
        
        let minActiveId = Infinity;
        if (activeLines.length > 0) {
            activeLines.forEach(l => {
                if (l.id < minActiveId) minActiveId = l.id;
            });
        }

        const activeIdsKey = Array.from(activeLineIds).sort().join(',');

        if (activeLines.length > 0) {
            const primaryActiveId = minActiveId;

            if (activeIdsKey !== this.currentActiveIdsKey) {
                this.currentActiveIdsKey = activeIdsKey;
                this.activeLineId = primaryActiveId;
                this.highlightActiveLines(activeLineIds, primaryActiveId);
            }
        } else if (this.activeLineId !== null) {
            this.activeLineId = null;
            this.currentActiveIdsKey = '';
            this.clearHighlights();

            if (currentProgressMs < (this.lyrics[0]?.timestamp || 0)) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        this.lyrics.forEach((line) => {
            const isActive = activeLineIds.has(line.id);
            const isPassed = activeLines.length > 0 
                ? line.id < minActiveId 
                : (this.activeLineId !== null ? line.id < this.activeLineId : false);

            line.text.forEach((syl, idx) => {
                const wordEl = this.getDocument().getElementById(`word-${line.id}-${idx}`);
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
                        if (line.isWordSynced) {
                            const pct = duration > 0 ? (elapsed / duration) : 0;
                            const wave = Math.sin(pct * Math.PI);
                            wordEl.style.setProperty('--wave-progress', wave);
                        } else {
                            wordEl.style.setProperty('--wave-progress', 0);
                        }
                        wordEl.classList.add('current');
                        wordEl.classList.remove('passed');
                    }
                }
            });

            if (line.backgroundText && line.backgroundText.length > 0) {
                line.backgroundText.forEach((syl, idx) => {
                    const wordEl = this.getDocument().getElementById(`bgword-${line.id}-${idx}`);
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
                            if (line.isWordSynced) {
                                const pct = duration > 0 ? (elapsed / duration) : 0;
                                const wave = Math.sin(pct * Math.PI);
                                wordEl.style.setProperty('--wave-progress', wave);
                            } else {
                                wordEl.style.setProperty('--wave-progress', 0);
                            }
                            wordEl.classList.add('current');
                            wordEl.classList.remove('passed');
                        }
                    }
                });
            }
        });
    }

    highlightActiveLines(activeLineIds, scrollTargetId) {

        this.lyrics.forEach((line) => {
            const el = this.getDocument().getElementById(`line-${line.id}`);
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

        if (!this.isUserInteracting) {
            const targetEl = this.getDocument().getElementById(`line-${scrollTargetId}`);
            if (targetEl) {

                const viewportHeight = this.pipWindow ? this.pipWindow.innerHeight : window.innerHeight;

                const targetY = targetEl.getBoundingClientRect().top + this.getScrollY() - viewportHeight * 0.4 + targetEl.offsetHeight / 2;
                this.smoothScrollTo(targetY);
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

            line.text.forEach((_, idx) => {
                const wordEl = document.getElementById(`word-${line.id}-${idx}`);
                if (wordEl) {
                    wordEl.style.removeProperty('--word-progress');
                    wordEl.classList.remove('passed', 'current');
                }
            });

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

    getAbsoluteOffsetTop(el) {
        let top = 0;
        while (el) {
            top += el.offsetTop;
            el = el.offsetParent;
        }
        return top;
    }

    scrollToLine(lineElement) {
        if (this.tempDisableScroll) return;
        const absoluteLineTop = this.getAbsoluteOffsetTop(lineElement);
        const height = lineElement.offsetHeight;

        const targetScrollTop = absoluteLineTop - (window.innerHeight * 0.35) + (height / 2);
        
        this.lastAutoScrollTime = Date.now();

        this.smoothScrollTo(Math.max(0, targetScrollTop));
    }

    smoothScrollTo(target) {
        const startPosition = this.getScrollY();
        const distance = target - startPosition;
        let startTime = null;
        const duration = 650;

        if (this.scrollAnimationId) {
            this.cancelRaf(this.scrollAnimationId);
        }

        const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
        
        const animation = (currentTime) => {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1);
            
            this.scrollToPosition(startPosition + distance * easeOutQuart(progress));
            this.lastAutoScrollTime = Date.now();
            
            if (timeElapsed < duration) {
                this.scrollAnimationId = this.getRaf()(animation);
            } else {
                this.scrollAnimationId = null;
            }
        };
        
        this.scrollAnimationId = this.getRaf()(animation);
    }

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

            this.progressMs = timeMs;
            this.lastSyncTime = Date.now();
            this.lastUserSeekTime = Date.now();
            this.updateLyricsSync(timeMs);
        } catch (error) {
            console.error('Erro ao pular reprodução:', error);
            this.showToast('Erro ao atualizar a reprodução no Spotify.', 'error');
        }
    }

    updateFloatingMenuVisibility() {
        const topMenu = document.getElementById('lyrics-top-menu');
        const floatingMenu = document.getElementById('floating-lyrics-menu');
        const wrapper = document.getElementById('floating-controls-wrapper');
        const btnFloatingToggle = document.getElementById('btn-floating-toggle');
        
        if (!topMenu || !floatingMenu || !wrapper || !btnFloatingToggle) return;

        if (document.body.style.cursor !== 'none') {
            wrapper.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            wrapper.classList.add('opacity-100');
            wrapper.style.opacity = '1';
        }

        const rect = topMenu.getBoundingClientRect();



        const minTop = 88;
        const dynamicTop = Math.max(minTop, rect.bottom + 16);
        wrapper.style.top = `${dynamicTop}px`;

        if (rect.bottom < 0) {

            if (this.floatingMenuTimeoutId) clearTimeout(this.floatingMenuTimeoutId);

            if (document.body.style.cursor !== 'none') {
                if (btnFloatingToggle && btnFloatingToggle.classList.contains('opacity-0')) {
                    btnFloatingToggle.classList.remove('hidden');
                    
                    void btnFloatingToggle.offsetWidth;
                    
                    btnFloatingToggle.classList.remove('opacity-0', 'scale-95', 'w-0', 'border-0', 'px-0', 'mr-0');
                    btnFloatingToggle.classList.add('opacity-100', 'scale-100', 'w-10', 'mr-3');
                }
            }
        } else {
            if (btnFloatingToggle && !btnFloatingToggle.classList.contains('opacity-0')) {
                btnFloatingToggle.classList.remove('opacity-100', 'scale-100', 'w-10', 'mr-3');
                btnFloatingToggle.classList.add('opacity-0', 'scale-95', 'w-0', 'border-0', 'px-0', 'mr-0');
                this.toggleFloatingMenu(false);
                
                if (this.floatingMenuTimeoutId) clearTimeout(this.floatingMenuTimeoutId);
                this.floatingMenuTimeoutId = setTimeout(() => {

                    const currentRect = topMenu.getBoundingClientRect();
                    if (currentRect.bottom >= 0) {
                        btnFloatingToggle.classList.add('hidden');
                    }
                }, 300);
            }
        }
    }

    toggleFloatingMenu(show) {
        if (!this.floatingMenuContent) return;

        if (show) {
            this.floatingMenuContent.classList.add('open');
            this.floatingMenuContent.classList.remove('closed');
            if (this.floatingToggleIconMobile) this.floatingToggleIconMobile.classList.add('scale-y-[-1]');
            if (this.floatingToggleIconDesktop) this.floatingToggleIconDesktop.classList.add('scale-x-[-1]');
        } else {
            this.floatingMenuContent.classList.remove('open');
            this.floatingMenuContent.classList.add('closed');
            if (this.floatingToggleIconMobile) this.floatingToggleIconMobile.classList.remove('scale-y-[-1]');
            if (this.floatingToggleIconDesktop) this.floatingToggleIconDesktop.classList.remove('scale-x-[-1]');
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;

        const indicator = document.createElement('div');
        indicator.className = 'toast-type-indicator';
        toast.appendChild(indicator);

        const textContainer = document.createElement('div');
        textContainer.className = 'flex-1 text-sm font-medium mr-4';
        textContainer.textContent = message;
        toast.appendChild(textContainer);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'text-white/40 hover:text-white transition-colors focus:outline-none';
        closeBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
        `;
        toast.appendChild(closeBtn);

        container.appendChild(toast);

        const removeToast = () => {
            if (toast.classList.contains('toast-hide')) return;
            toast.classList.add('toast-hide');

            setTimeout(() => {
                toast.remove();
            }, 300);
        };

        closeBtn.addEventListener('click', removeToast);

        setTimeout(removeToast, 4000);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new LySincApp();
    });
} else {
    window.app = new LySincApp();
}

