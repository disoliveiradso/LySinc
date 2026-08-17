import Config from './config.js?v=4.6.0';
import SpotifyService from './spotify.js?v=4.6.0';
import LyricsService from './lyrics.js?v=4.6.0';
import MusicBrainzService from './musicbrainz.js?v=4.6.0';
import SupabaseService from './supabase.js?v=4.6.0';


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
                let word = wordsPerLine[wordsPerLine.length - 2][wordsPerLine[wordsPerLine.length - 2].length - 1];
                let candidateLine = word + ' ' + wordsPerLine[wordsPerLine.length - 1].join(' ');
                if (ctx.measureText(candidateLine).width <= maxWidth) {
                    wordsPerLine[wordsPerLine.length - 2].pop();
                    wordsPerLine[wordsPerLine.length - 1].unshift(word);
                }
            }
        }

        if (wordsPerLine[0].length === 1 && wordsPerLine.length > 1) {
            if (wordsPerLine[1].length > 1) {
                let word = wordsPerLine[1][0];
                let candidateLine = wordsPerLine[0].join(' ') + ' ' + word;
                if (ctx.measureText(candidateLine).width <= maxWidth) {
                    wordsPerLine[1].shift();
                    wordsPerLine[0].push(word);
                }
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

const getLineText = (line, mode) => {
    if (!line) return '';
    if (mode === 'translation' && line.translation) return line.translation;
    if (mode === 'romanized' && line.romanizedText) return line.romanizedText;
    if (Array.isArray(line.text)) {
        return line.text.map(s => s.text).join('').trim();
    }
    return (line.text || '') + '';
};

const getBgText = (line) => {
    if (!line) return '';
    if (Array.isArray(line.backgroundText)) {
        return line.backgroundText.map(s => s.text).join('').trim();
    }
    return (line.backgroundText || '') + '';
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
        this.screenFlowStep1 = document.getElementById('screen-flow-step-1');
        this.screenFlowStep2 = document.getElementById('screen-flow-step-2');
        this.screenFlowStep3 = document.getElementById('screen-flow-step-3');
        this.screenMain = document.getElementById('screen-main');
        this.screenIdle = document.getElementById('screen-idle');
        this.screenError = document.getElementById('screen-error');
        this.screenReportError = document.getElementById('screen-report-error');
        this.screenTermsFeedback = document.getElementById('screen-terms-feedback');
        this.screenTermsPrivacy = document.getElementById('screen-terms-privacy');
        this.screenTermsClientId = document.getElementById('screen-terms-client-id');
        this.screenSpotifyDetails = document.getElementById('screen-spotify-details');
        this.errorScreenMessage = document.getElementById('error-screen-message');
        this.btnErrorBackHome = document.getElementById('btn-error-back-home');

        this.albumArt = document.getElementById('album-art');
        this.trackinfoBox = document.getElementById('trackinfo-box');
        this.trackinfoArt = document.getElementById('trackinfo-art');
        this.trackinfoTitle = document.getElementById('trackinfo-title');
        this.trackinfoArtist = document.getElementById('trackinfo-artist');
        this.trackinfoProgress = document.getElementById('trackinfo-progress');
        this.btnFloatingTrackinfo = document.getElementById('btn-floating-trackinfo');
        this.albumArtBlur = document.getElementById('album-art-blur');
        this.trackName = document.getElementById('track-name');
        this.trackArtists = document.getElementById('track-artists');
        this.explicitIconHeader = document.getElementById('explicit-icon-header');

        this.btnDetailsBack = document.getElementById('btn-details-back');
        this.detailsBackLabel = document.getElementById('details-back-label');
        this.detailsLoading = document.getElementById('details-loading');
        this.detailsContent = document.getElementById('details-content');

        this.lyricsContainer = document.getElementById('lyrics-container');
        this.progressBar = document.getElementById('progress-bar');

        this.explicitIconTrackinfo = document.getElementById('explicit-icon-trackinfo');

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
        this.floatingMenusWrapper = document.getElementById('floating-menus-wrapper');
        this.floatingToggleIconMobile = document.getElementById('icon-floating-toggle-mobile');
        this.floatingToggleIconDesktop = document.getElementById('icon-floating-toggle-desktop');

        this.btnPipTop = document.getElementById('btn-pip-top');
        this.btnFloatingPip = document.getElementById('btn-floating-pip');

        // Light Mode & Info Stutter Modal Elements
        this.btnLightMode = document.getElementById('btn-light-mode');
        this.btnInfoStutter = document.getElementById('btn-info-stutter');
        this.infoStutterModal = document.getElementById('info-stutter-modal');
        this.btnInfoStutterClose = document.getElementById('btn-info-stutter-close');

        // Font Size Controls
        this.btnFontDecreaseTop = document.getElementById('btn-font-decrease-top');
        this.btnFontIncreaseTop = document.getElementById('btn-font-increase-top');
        this.btnFontDecreaseFloating = document.getElementById('btn-font-decrease-floating');
        this.btnFontIncreaseFloating = document.getElementById('btn-font-increase-floating');
        this.lyricsFontScale = parseFloat(localStorage.getItem('lysinc_lyrics_font_scale')) || 1.0;

        // Client ID 3-Step Full Page Flow & System Account Modal Elements
        this.btnOpenClientIdFlow = document.getElementById('btn-open-client-id-flow');
        // Report Error Flow & Terms
        this.btnOpenReportError = document.getElementById('btn-open-report-error');
        this.btnReportBack = document.getElementById('btn-report-back');
        this.reportTitle = document.getElementById('report-title');
        this.reportCategory = document.getElementById('report-category');
        this.reportMessage = document.getElementById('report-message');
        this.btnSubmitReport = document.getElementById('btn-submit-report');
        this.reportTermsCheckbox = document.getElementById('report-terms-checkbox');
        this.wrapperReportTermsCheckbox = document.getElementById('wrapper-report-terms-checkbox');
        
        // Terms & Privacy Screens
        this.btnOpenFeedbackTerms = document.getElementById('btn-open-feedback-terms');
        this.btnTermsFeedbackBack = document.getElementById('btn-terms-feedback-back');
        this.btnAcceptFeedbackTerms = document.getElementById('btn-accept-feedback-terms');
        
        this.privacyTermsCheckbox = document.getElementById('privacy-terms-checkbox');
        this.wrapperPrivacyTermsCheckbox = document.getElementById('wrapper-privacy-terms-checkbox');
        this.step2PrivacyTermsCheckbox = document.getElementById('step2-privacy-terms-checkbox');
        this.wrapperStep2PrivacyTermsCheckbox = document.getElementById('wrapper-step2-privacy-terms-checkbox');
        this.btnOpenPrivacyTerms = document.getElementById('btn-open-privacy-terms');
        this.btnStep2OpenClientIdTerms = document.getElementById('btn-step2-open-client-id-terms');
        this.btnTermsPrivacyBack = document.getElementById('btn-terms-privacy-back');
        this.btnAcceptPrivacyTerms = document.getElementById('btn-accept-privacy-terms');
        this.btnTermsClientIdBack = document.getElementById('btn-terms-client-id-back');
        this.btnAcceptClientIdTerms = document.getElementById('btn-accept-client-id-terms');
        this.btnFlowStep1Back = document.getElementById('btn-flow-step1-back');

        // Clear Cache Button
        this.btnClearCache = document.getElementById('btn-clear-cache');
        this.clearCacheModal = document.getElementById('clear-cache-modal');
        this.btnCancelClearCache = document.getElementById('btn-cancel-clear-cache');
        this.btnConfirmClearCache = document.getElementById('btn-confirm-clear-cache');
        this.btnConfirmClearAllData = document.getElementById('btn-confirm-clear-all-data');
        this.btnFlowStep1Next = document.getElementById('btn-flow-step1-next');
        this.btnFlowStep2BackTop = document.getElementById('btn-flow-step2-back-top');
        this.btnFlowStep2Back = document.getElementById('btn-flow-step2-back');
        this.btnFlowStep2Save = document.getElementById('btn-flow-step2-save');
        this.btnFlowStep3Finish = document.getElementById('btn-flow-step3-finish');
        this.inputFlowClientId = document.getElementById('input-flow-client-id');

        // Profile & Settings Elements
        // Elementos da tela Idle
        this.idleUserProfileSection = document.getElementById('idle-user-profile-section');
        this.idleUserAvatar = document.getElementById('idle-user-avatar');
        this.idleUserDisplayName = document.getElementById('idle-user-display-name');
        this.idleUserUsername = document.getElementById('idle-user-username');
        this.idleInputClientIdReadonly = document.getElementById('idle-input-client-id-readonly');
        this.idleBtnRemoveClientId = document.getElementById('idle-btn-delete-credential');
        this.idleBtnAddClientIdSettings = document.getElementById('idle-btn-insert-credential-settings');

        // Elementos do Settings Modal
        this.settingsUserProfileSection = document.getElementById('settings-user-profile-section');
        this.settingsUserAvatar = document.getElementById('settings-user-avatar');
        this.settingsUserDisplayName = document.getElementById('settings-user-display-name');
        this.settingsUserUsername = document.getElementById('settings-user-username');
        this.settingsInputClientIdReadonly = document.getElementById('settings-input-client-id-readonly');
        this.settingsBtnRemoveClientId = document.getElementById('settings-btn-delete-credential');
        this.settingsBtnAddClientIdSettings = document.getElementById('settings-btn-insert-credential-settings');
        this.confirmRemoveClientIdModal = document.getElementById('confirm-remove-client-id-modal');
        this.btnCancelRemoveClientId = document.getElementById('btn-cancel-remove-client-id');
        this.btnConfirmRemoveClientId = document.getElementById('btn-confirm-remove-client-id');
        
        this.removeClientIdOptionsModal = document.getElementById('remove-client-id-options-modal');
        this.btnRemoveLocalOnly = document.getElementById('btn-remove-local-only');
        this.btnRemoveBoth = document.getElementById('btn-remove-both');
        this.btnCancelRemoveOptions = document.getElementById('btn-cancel-remove-options');
        

        this.btnOpenRepos = document.getElementById('btn-open-repos');
        this.btnReposClose = document.getElementById('btn-repos-close');
        this.reposModal = document.getElementById('repos-modal');

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
        
        this.hasAcceptedFeedback = false;
        this.hasAcceptedPrivacy = false;
        this.hasAcceptedClientIdTerms = false;        window.showToast = (message, type) => this.showToast(message, type);

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
            console.log("%c LySinc v2.0 - Sincronização & Supabase Ativos ", "background: #10b981; color: #000; font-weight: bold; padding: 4px; border-radius: 4px;");
            
            // Checkbox de termos: só manter marcado se client_id estiver salvo
            const savedClientId = Config.getClientId();
            const acceptedPrivacy = localStorage.getItem('lysinc_accepted_privacy') === 'true';
            if (acceptedPrivacy && savedClientId) {
                this.hasAcceptedPrivacy = true;
                if (this.privacyTermsCheckbox) this.privacyTermsCheckbox.checked = true;
                if (this.btnConnect) {
                    this.btnConnect.disabled = false;
                    this.btnConnect.classList.remove('disabled:bg-neutral-600', 'disabled:text-neutral-400', 'disabled:cursor-not-allowed', 'disabled:pointer-events-none');
                    const wrapper = document.getElementById('wrapper-btn-connect');
                    if (wrapper) wrapper.removeAttribute('data-tooltip-follow');
                }
            } else if (acceptedPrivacy && !savedClientId) {
                // Tem aceite mas não tem client_id: desmarcar
                localStorage.removeItem('lysinc_accepted_privacy');
                this.hasAcceptedPrivacy = false;
            }
            
            const acceptedClientIdTerms = localStorage.getItem('lysinc_accepted_client_id_terms') === 'true';
            if (acceptedClientIdTerms && savedClientId) {
                this.hasAcceptedClientIdTerms = true;
                if (this.step2PrivacyTermsCheckbox) this.step2PrivacyTermsCheckbox.checked = true;
            } else if (acceptedClientIdTerms && !savedClientId) {
                localStorage.removeItem('lysinc_accepted_client_id_terms');
                this.hasAcceptedClientIdTerms = false;
            }
            
            this.setupEventListeners();
            this.loadSettings();
            this.updateLoginButtonsState();

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
                    btnConnectText.textContent = 'Conectar com o Spotify';
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
                const profileSuccess = await this.updateUserProfile();
                if (profileSuccess) {
                    this.startPolling();
                    this.startTicker();
                    this.btnLogout.classList.remove('hidden');
                }
            } else {
                this.showScreen('pre-login');
                this.btnLogout.classList.add('hidden');

                if (hadRefreshToken) {
                    this.showToast('Sessão expirada. Por favor, conecte-se novamente ao Spotify.', 'info');
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
        // Listener global de cópia removido conforme solicitação

        const btnCopyClientId = document.getElementById('btn-copy-client-id');
        if (btnCopyClientId) {
            btnCopyClientId.addEventListener('click', () => {
                const input = document.getElementById('settings-input-client-id-readonly');
                if (input && input.value) {
                    navigator.clipboard.writeText(input.value).then(() => {
                        this.showToast('Client ID copiado!', 'success');
                    }).catch(() => {
                        this.showToast('Erro ao copiar Client ID', 'error');
                    });
                }
            });
        }

        const btnCopyUriFlow = document.getElementById('btn-copy-uri-flow');
        if (btnCopyUriFlow) {
            btnCopyUriFlow.addEventListener('click', () => {
                const uriCode = document.getElementById('flow-uri-label');
                if (uriCode && uriCode.innerText) {
                    navigator.clipboard.writeText(uriCode.innerText.trim()).then(() => {
                        this.showToast('URI copiada!', 'success');
                    }).catch(() => {
                        this.showToast('Erro ao copiar URI', 'error');
                    });
                }
            });
        }

        if (this.btnFloatingTrackinfo) {
            this.btnFloatingTrackinfo.addEventListener('click', () => {
                const isActive = localStorage.getItem('lysinc-trackinfo-active') === 'true';
                localStorage.setItem('lysinc-trackinfo-active', !isActive);
                if (this.btnFloatingTrackinfo) {
                    if (!isActive) {
                        this.btnFloatingTrackinfo.classList.add('text-green-400');
                        this.btnFloatingTrackinfo.classList.remove('text-white/60');
                    } else {
                        this.btnFloatingTrackinfo.classList.remove('text-green-400');
                        this.btnFloatingTrackinfo.classList.add('text-white/60');
                    }
                }
                const isDrawerOpen = this.floatingMenuContent && this.floatingMenuContent.classList.contains('open');
                if (this.trackinfoBox) {
                    if (this.trackinfoBoxDelayId) clearTimeout(this.trackinfoBoxDelayId);
                    if (!isActive && isDrawerOpen) {
                        this.trackinfoBox.classList.remove('closed');
                        this.trackinfoBox.classList.add('open');

                        if (this.floatingDrawerTimeoutId) {
                            clearTimeout(this.floatingDrawerTimeoutId);
                            this.floatingDrawerTimeoutId = null;
                        }

                        setTimeout(() => {
                            if (this.trackinfoTitle) this.setupMarquee(this.trackinfoTitle);
                            if (this.trackinfoArtist) this.setupMarquee(this.trackinfoArtist);
                        }, 50);
                    } else {
                        this.trackinfoBox.classList.remove('open');
                        this.trackinfoBox.classList.add('closed');

                        if (isDrawerOpen) {
                            setTimeout(() => {
                                this.toggleFloatingMenu(false);
                            }, 150);
                        }
                    }
                }
            });
            if (localStorage.getItem('lysinc-trackinfo-active') === 'true') {
                this.btnFloatingTrackinfo.classList.add('text-green-400');
                this.btnFloatingTrackinfo.classList.remove('text-white/60');
            }
        }

        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (this.trackName) this.setupMarquee(this.trackName);
                if (this.trackArtists) this.setupMarquee(this.trackArtists);
                if (this.trackinfoTitle) this.setupMarquee(this.trackinfoTitle);
                if (this.trackinfoArtist) this.setupMarquee(this.trackinfoArtist);
            }, 300);
        });

        document.addEventListener('click', (e) => {
            if (window.matchMedia("(hover: none)").matches) {
                const btn = e.target.closest('button');
                if (btn) {
                    setTimeout(() => btn.blur(), 50);
                }
            }
        });

        if (this.btnConnect) {
            this.btnConnect.addEventListener('click', () => {
                SpotifyService.login();
            });
        }

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

                this.currentTrackId = null;
                this.lyrics = [];

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
        if (this.btnSettings) {
            this.btnSettings.addEventListener('click', () => this.toggleSettingsModal(true));
        }
        if (this.btnSettingsClose) {
            this.btnSettingsClose.addEventListener('click', () => this.toggleSettingsModal(false));
        }

        // Botão Lixeira (Limpar Cache)
        if (this.btnClearCache) {
            this.updateClearCacheButtonState();
            this.btnClearCache.addEventListener('click', () => {
                const hasCache = this.hasLyricsCacheData();
                if (!hasCache) return; // desabilitado, não faz nada
                if (this.clearCacheModal) {
                    this.clearCacheModal.classList.remove('hidden');
                    this.clearCacheModal.classList.add('flex');
                }
            });
        }
        if (this.btnCancelClearCache) {
            this.btnCancelClearCache.addEventListener('click', () => {
                if (this.clearCacheModal) {
                    this.clearCacheModal.classList.add('hidden');
                    this.clearCacheModal.classList.remove('flex');
                }
            });
        }
        if (this.btnConfirmClearCache) {
            this.btnConfirmClearCache.addEventListener('click', () => {
                this.clearLyricsCache();
                if (this.clearCacheModal) {
                    this.clearCacheModal.classList.add('hidden');
                    this.clearCacheModal.classList.remove('flex');
                }
                this.updateClearCacheButtonState();
                this.showToast('Cache de letras apagado com sucesso.', 'success');
            });
        }
        if (this.btnConfirmClearAllData) {
            this.btnConfirmClearAllData.addEventListener('click', () => {
                this.clearAllSiteData();
                if (this.clearCacheModal) {
                    this.clearCacheModal.classList.add('hidden');
                    this.clearCacheModal.classList.remove('flex');
                }
            });
        }

        if (this.btnOpenRepos) {
            this.btnOpenRepos.addEventListener('click', () => {
                if (this.reposModal) {
                    this.reposModal.classList.remove('hidden');
                    this.reposModal.classList.add('flex');
                }
            });
        }

        if (this.btnReposClose) {
            this.btnReposClose.addEventListener('click', () => {
                if (this.reposModal) {
                    this.reposModal.classList.add('hidden');
                    this.reposModal.classList.remove('flex');
                }
            });
        }

        if (this.idleBtnRemoveClientId) {
            this.idleBtnRemoveClientId.addEventListener('click', () => {
                if (this.removeClientIdOptionsModal) {
                    this.removeClientIdOptionsModal.classList.remove('hidden');
                    this.removeClientIdOptionsModal.classList.add('flex');
                }
            });
        }

        if (this.settingsBtnRemoveClientId) {
            this.settingsBtnRemoveClientId.addEventListener('click', () => {
                if (this.removeClientIdOptionsModal) {
                    this.removeClientIdOptionsModal.classList.remove('hidden');
                    this.removeClientIdOptionsModal.classList.add('flex');
                }
            });
        }
        
        if (this.btnCancelRemoveOptions) {
            this.btnCancelRemoveOptions.addEventListener('click', () => {
                if (this.removeClientIdOptionsModal) {
                    this.removeClientIdOptionsModal.classList.add('hidden');
                    this.removeClientIdOptionsModal.classList.remove('flex');
                }
            });
        }
        
        if (this.btnRemoveLocalOnly) {
            this.btnRemoveLocalOnly.addEventListener('click', () => {
                if (this.removeClientIdOptionsModal) {
                    this.removeClientIdOptionsModal.classList.add('hidden');
                    this.removeClientIdOptionsModal.classList.remove('flex');
                }
                this.handleRemoveClientId(false);
            });
        }
        
        if (this.btnRemoveBoth) {
            this.btnRemoveBoth.addEventListener('click', () => {
                if (this.removeClientIdOptionsModal) {
                    this.removeClientIdOptionsModal.classList.add('hidden');
                    this.removeClientIdOptionsModal.classList.remove('flex');
                }
                if (this.confirmRemoveClientIdModal) {
                    this.confirmRemoveClientIdModal.classList.remove('hidden');
                    this.confirmRemoveClientIdModal.classList.add('flex');
                }
            });
        }

        if (this.btnCancelRemoveClientId) {
            this.btnCancelRemoveClientId.addEventListener('click', () => {
                if (this.confirmRemoveClientIdModal) {
                    this.confirmRemoveClientIdModal.classList.add('hidden');
                    this.confirmRemoveClientIdModal.classList.remove('flex');
                }
            });
        }

        if (this.btnConfirmRemoveClientId) {
            this.btnConfirmRemoveClientId.addEventListener('click', () => this.handleRemoveClientId(true));
        }

        if (this.idleBtnAddClientIdSettings) {
            this.idleBtnAddClientIdSettings.addEventListener('click', () => {
                this.toggleSettingsModal(false);
                this.showScreen('flow-step-1');
            });
        }

        if (this.settingsBtnAddClientIdSettings) {
            this.settingsBtnAddClientIdSettings.addEventListener('click', () => {
                this.toggleSettingsModal(false);
                this.showScreen('flow-step-1');
            });
        }

        // Font Size Handlers
        if (this.btnFontDecreaseTop) this.btnFontDecreaseTop.addEventListener('click', () => this.changeLyricsFontSize(-0.1));
        if (this.btnFontIncreaseTop) this.btnFontIncreaseTop.addEventListener('click', () => this.changeLyricsFontSize(0.1));
        if (this.btnFontDecreaseFloating) this.btnFontDecreaseFloating.addEventListener('click', () => this.changeLyricsFontSize(-0.1));
        if (this.btnFontIncreaseFloating) this.btnFontIncreaseFloating.addEventListener('click', () => this.changeLyricsFontSize(0.1));

        // Aplica a escala inicial de fonte no documento
        document.documentElement.style.setProperty('--lyrics-font-scale', this.lyricsFontScale);

        // 3-Step Client ID Flow Handlers (Full-Page Navigation)
        if (this.btnOpenClientIdFlow) {
            this.btnOpenClientIdFlow.addEventListener('click', () => this.showScreen('flow-step-1'));
        }
        if (this.btnFlowStep1Back) {
            this.btnFlowStep1Back.addEventListener('click', () => this.showScreen('pre-login'));
        }
        if (this.btnFlowStep1Next) {
            this.btnFlowStep1Next.addEventListener('click', () => this.showScreen('flow-step-2'));
        }
        if (this.btnFlowStep2BackTop) {
            this.btnFlowStep2BackTop.addEventListener('click', () => this.showScreen('flow-step-1'));
        }
        if (this.btnFlowStep2Back) {
            this.btnFlowStep2Back.addEventListener('click', () => this.showScreen('flow-step-1'));
        }
        if (this.inputFlowClientId) {
            this.inputFlowClientId.addEventListener('input', (e) => {
                this.updateStep2SaveButtonState();
            });
        }
        if (this.btnFlowStep2Save) {
            this.btnFlowStep2Save.addEventListener('click', async () => {
                const val = this.inputFlowClientId ? this.inputFlowClientId.value.trim() : '';
                if (val) {
                    await SupabaseService.saveClientId(val);
                    this.updateLoginButtonsState();
                    this.showScreen('flow-step-3');
                }
            });
        }
        if (this.btnFlowStep3Finish) {
            this.btnFlowStep3Finish.addEventListener('click', () => {
                this.updateLoginButtonsState();
                SpotifyService.login();
            });
        }

        if (this.btnOpenReportError) {
            this.btnOpenReportError.addEventListener('click', () => this.showScreen('report-error'));
        }
        if (this.btnReportBack) {
            this.btnReportBack.addEventListener('click', () => {
                this.resetReportForm();
                this.showScreen('pre-login');
            });
        }
        
        // Listeners for terms screens
        if (this.btnOpenFeedbackTerms) {
            this.btnOpenFeedbackTerms.addEventListener('click', () => this.showScreen('terms-feedback'));
        }
        if (this.btnTermsFeedbackBack) {
            this.btnTermsFeedbackBack.addEventListener('click', () => this.showScreen('report-error'));
        }
        if (this.btnAcceptFeedbackTerms) {
            this.btnAcceptFeedbackTerms.addEventListener('click', () => {
                this.hasAcceptedFeedback = true;
                if (this.reportTermsCheckbox) this.reportTermsCheckbox.checked = true;
                this.updateReportSubmitButtonState();
                this.showScreen('report-error');
            });
        }

        if (this.btnOpenPrivacyTerms) {
            this.btnOpenPrivacyTerms.addEventListener('click', () => this.showScreen('terms-privacy'));
        }
        if (this.btnStep2OpenClientIdTerms) {
            this.btnStep2OpenClientIdTerms.addEventListener('click', () => this.showScreen('terms-client-id'));
        }
        if (this.btnTermsPrivacyBack) {
            this.btnTermsPrivacyBack.addEventListener('click', () => {
                if (this.previousScreen) this.showScreen(this.previousScreen);
                else this.showScreen('pre-login');
            });
        }
        if (this.btnTermsClientIdBack) {
            this.btnTermsClientIdBack.addEventListener('click', () => {
                if (this.previousScreen) this.showScreen(this.previousScreen);
                else this.showScreen('pre-login');
            });
        }
        
        if (this.wrapperPrivacyTermsCheckbox) {
            this.wrapperPrivacyTermsCheckbox.addEventListener('click', (e) => {
                if (!this.hasAcceptedPrivacy) {
                    this.showBalloon(this.wrapperPrivacyTermsCheckbox, 'Você precisa visualizar os termos e aceitá-los primeiro.');
                }
            });
        }
        
        if (this.wrapperStep2PrivacyTermsCheckbox) {
            this.wrapperStep2PrivacyTermsCheckbox.addEventListener('click', (e) => {
                if (!this.hasAcceptedClientIdTerms) {
                    this.showBalloon(this.wrapperStep2PrivacyTermsCheckbox, 'Você precisa visualizar os termos e aceitá-los primeiro.');
                }
            });
        }
        
        if (this.wrapperReportTermsCheckbox) {
            this.wrapperReportTermsCheckbox.addEventListener('click', (e) => {
                if (!this.hasAcceptedFeedback) {
                    this.showBalloon(this.wrapperReportTermsCheckbox, 'Você precisa visualizar os termos e aceitá-los primeiro.');
                }
            });
        }
        
        if (this.btnAcceptPrivacyTerms) {
            this.btnAcceptPrivacyTerms.addEventListener('click', () => {
                this.hasAcceptedPrivacy = true;
                if (this.privacyTermsCheckbox) this.privacyTermsCheckbox.checked = true;
                
                if (this.btnConnect) {
                    this.btnConnect.disabled = false;
                    this.btnConnect.classList.remove('disabled:bg-neutral-600', 'disabled:text-neutral-400', 'disabled:cursor-not-allowed', 'disabled:pointer-events-none');
                    const wrapper = document.getElementById('wrapper-btn-connect');
                    if (wrapper) wrapper.removeAttribute('data-tooltip-follow');
                }
                
                localStorage.setItem('lysinc_accepted_privacy', 'true');
                
                if (this.previousScreen) this.showScreen(this.previousScreen);
                else this.showScreen('pre-login');
            });
        }
        if (this.btnAcceptClientIdTerms) {
            this.btnAcceptClientIdTerms.addEventListener('click', () => {
                this.hasAcceptedClientIdTerms = true;
                if (this.step2PrivacyTermsCheckbox) this.step2PrivacyTermsCheckbox.checked = true;
                
                if (this.btnFlowStep2Save) {
                    this.updateStep2SaveButtonState();
                }
                
                localStorage.setItem('lysinc_accepted_client_id_terms', 'true');
                
                if (this.previousScreen) this.showScreen(this.previousScreen);
                else this.showScreen('pre-login');
            });
        }
        
        // Report Form Logic
        if (this.reportTitle && this.reportCategory && this.reportMessage) {
            const checkForm = () => this.updateReportSubmitButtonState();
            this.reportTitle.addEventListener('input', checkForm);
            this.reportCategory.addEventListener('change', checkForm);
            this.reportMessage.addEventListener('input', checkForm);
        }
        
        if (this.btnSubmitReport) {
            this.btnSubmitReport.addEventListener('click', async () => {
                const title = this.reportTitle.value.trim();
                const category = this.reportCategory.value;
                const message = this.reportMessage.value.trim();
                
                if (!title || !category || !message || !this.hasAcceptedFeedback) return;
                
                const btn = this.btnSubmitReport;
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<span class="flex items-center space-x-2"><svg class="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Enviando...</span></span>';
                
                const clientId = Config.getClientId();
                const success = await SupabaseService.saveErrorReport(title, category, message, clientId);
                
                if (success) {
                    this.showToast('Relatório enviado com sucesso! Obrigado pelo feedback.', 'success');
                    this.resetReportForm();
                    this.showScreen('pre-login');
                } else {
                    this.showToast('Erro ao enviar relatório. Tente novamente mais tarde.', 'error');
                }
                
                btn.innerHTML = originalText;
                this.updateReportSubmitButtonState();
            });
        }

        this.btnFlowStep3Back = document.getElementById('btn-flow-step3-back');
        if (this.btnFlowStep3Back) {
            this.btnFlowStep3Back.addEventListener('click', () => this.showScreen('pre-login'));
        }

        // Spotify Details: back button
        if (this.btnDetailsBack) {
            this.btnDetailsBack.addEventListener('click', () => {
                const back = this.previousScreen || 'main';
                this.showScreen(back);
            });
        }

        // Spotify Details: click on album art → album details
        if (this.albumArt) {
            this.albumArt.addEventListener('click', () => {
                if (this.currentTrackState?.albumId) {
                    this.openSpotifyDetails('album', this.currentTrackState.albumId);
                }
            });
        }

        // Spotify Details: click on track name → track details
        if (this.trackName) {
            this.trackName.addEventListener('click', () => {
                if (this.currentTrackState?.trackId) {
                    this.openSpotifyDetails('track', this.currentTrackState.trackId);
                }
            });
        }

        // Spotify Details: click on track artists → first artist details
        if (this.trackArtists) {
            this.trackArtists.addEventListener('click', () => {
                const artistId = this.currentTrackState?.artistsRaw?.[0]?.id;
                if (artistId) {
                    this.openSpotifyDetails('artist', artistId);
                }
            });
        }

        if (this.btnLoginSystemAccount) {
            this.btnLoginSystemAccount.addEventListener('click', async () => {
                const isAuth = await SpotifyService.isAuthenticated();
                if (isAuth) {
                    this.showScreen('idle');
                    await this.updateUserProfile();
                    this.startPolling();
                    this.startTicker();
                    if (this.btnLogout) this.btnLogout.classList.remove('hidden');
                } else {
                    if (this.systemAccountModal) {
                        this.systemAccountModal.classList.remove('hidden');
                        this.systemAccountModal.classList.add('flex');
                    }
                }
            });
        }


        
        if (this.btnErrorBackHome) {
            this.btnErrorBackHome.addEventListener('click', () => {
                this.stopPolling();
                this.showScreen('pre-login');
                if (this.btnLogout) this.btnLogout.classList.add('hidden');
            });
        }

        if (this.btnCancelSystemLogin) {
            this.btnCancelSystemLogin.addEventListener('click', () => {
                if (this.systemAccountModal) {
                    this.systemAccountModal.classList.add('hidden');
                    this.systemAccountModal.classList.remove('flex');
                }
            });
        }

        if (this.btnConfirmSystemLogin) {
            this.btnConfirmSystemLogin.addEventListener('click', () => {
                if (this.systemAccountModal) {
                    this.systemAccountModal.classList.add('hidden');
                    this.systemAccountModal.classList.remove('flex');
                }
                const sysId = Config.getSystemClientId();
                if (sysId) {
                    Config.setClientId(sysId);
                    this.updateLoginButtonsState();
                    this.showToast('Conectando via Conta do Sistema...', 'info');
                    SpotifyService.login();
                } else {
                    this.showToast('Nenhum Client ID de sistema configurado.', 'error');
                }
            });
        }

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
        customTooltip.className = 'fixed pointer-events-none z-[100] opacity-0 transition-opacity duration-200 bg-zinc-800 text-white text-xs px-3 py-2 rounded-lg shadow-xl border border-white/10 whitespace-nowrap font-normal';
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

        document.addEventListener('mousemove', (e) => {
            const target = e.target.closest('[data-tooltip-follow]');
            if (target) {
                const text = target.getAttribute('data-tooltip-follow');
                if (text) {
                    customTooltip.textContent = text;
                    customTooltip.style.opacity = '1';
                    
                    const tooltipRect = customTooltip.getBoundingClientRect();
                    let top = e.clientY + 15;
                    let left = e.clientX + 15;
                    if (left + tooltipRect.width > window.innerWidth) left = e.clientX - tooltipRect.width - 10;
                    if (top + tooltipRect.height > window.innerHeight) top = e.clientY - tooltipRect.height - 10;
                    
                    customTooltip.style.top = `${top}px`;
                    customTooltip.style.left = `${left}px`;
                }
            } else if (!tooltipTarget) {
                customTooltip.style.opacity = '0';
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

        this.setupSyncControls();

        const btnChangeSource = document.getElementById('btn-change-source');
        if (btnChangeSource) {
            btnChangeSource.addEventListener('click', async () => {
                const providers = ['apple', 'musixmatch', 'lrclib', 'netease'];
                const currentIndex = providers.indexOf(this.currentLyricsProvider);
                const nextIndex = (currentIndex + 1) % providers.length;
                this.currentLyricsProvider = providers[nextIndex];

                const providerLabels = {
                    'apple': 'Apple',
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

        const handleUserInteraction = (e) => {
            if (this.isProgrammaticScrolling) return;
            if (this.ignoreUserInteractionUntil && Date.now() < this.ignoreUserInteractionUntil) {
                return;
            }
            if (e && e.target) {
                const t = e.target;
                if (
                    t.closest('#btn-floating-toggle') ||
                    t.closest('#btn-recenter') ||
                    t.closest('#btn-recenter-drawer') ||
                    t.closest('#floating-controls-wrapper') ||
                    t.closest('#lyrics-top-menu') ||
                    t.closest('#top-menu') ||
                    t.closest('#trackinfo-box') ||
                    t.closest('button')
                ) {
                    return;
                }
            }
            if (!this.isUserInteracting && this.lyrics.length > 0) {
                this.isUserInteracting = true;

                if (this.btnRecenterTimeoutId) clearTimeout(this.btnRecenterTimeoutId);

                if (this.lyricsContainer) this.lyricsContainer.classList.add('user-scrolling');

                const isSongFinished = this.progressMs >= this.lyrics[this.lyrics.length - 1].timestamp;

                if (this.btnRecenter && !this.pipWindow && !isSongFinished) {
                    if (this.floatingControlsWrapper) {
                        this.floatingControlsWrapper.classList.remove('hidden', 'opacity-0');
                    }
                    this.btnRecenter.classList.remove('hidden', 'pointer-events-none');
                    this.btnRecenter.classList.add('pointer-events-auto');
                    requestAnimationFrame(() => {
                        this.btnRecenter.classList.remove('opacity-0', 'scale-95');
                        this.btnRecenter.classList.add('opacity-100', 'scale-100');
                    });
                }
            }
        };

        const handleRecenter = (e) => {
            if (e) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
            }
            this.isUserInteracting = false;
            this.currentActiveIdsKey = '';
            this.isProgrammaticScrolling = true;
            this.ignoreUserInteractionUntil = Date.now() + 1500;

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
                    this.smoothScrollTo(0);
                }
            } else {
                this.smoothScrollTo(0);
            }
        };

        if (this.btnRecenter) {
            this.btnRecenter.addEventListener('click', handleRecenter);
            this.btnRecenter.addEventListener('touchend', handleRecenter);
        }

        let lastUserScrollTop = window.scrollY;

        window.addEventListener('touchmove', (e) => {
            if (this.isProgrammaticScrolling) return;
            handleUserInteraction(e);
        }, { passive: true });

        window.addEventListener('wheel', (e) => {
            if (this.isProgrammaticScrolling) return;
            handleUserInteraction(e);
        }, { passive: true });

        window.addEventListener('scroll', (e) => {
            this.updateFloatingMenuVisibility();
            if (!this.isProgrammaticScrolling && this.lyrics.length > 0) {
                handleUserInteraction(e);
            }
        }, { passive: true });

        const handleFloatingToggle = (e) => {
            if (e) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
            }
            if (!this.floatingMenuContent) return;
            const isOpen = this.floatingMenuContent.classList.contains('open');
            this.toggleFloatingMenu(!isOpen);
        };

        if (this.btnFloatingToggle) {
            this.btnFloatingToggle.addEventListener('click', handleFloatingToggle);
            this.btnFloatingToggle.addEventListener('touchend', handleFloatingToggle);
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
            if (btn.id !== 'btn-floating-toggle' &&
                btn.id !== 'btn-floating-trackinfo' &&
                btn.id !== 'btn-font-decrease-floating' &&
                btn.id !== 'btn-font-increase-floating' &&
                btn.id !== 'floating-btn-sync-up' &&
                btn.id !== 'floating-btn-sync-down') {
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
                        this.lastUserSeekTime = Date.now();
                        const elapsed = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
                        const currentMs = this.progressMs + elapsed;
                        if (currentMs > 3000) {
                            await this.seekToTime(0);
                        } else {
                            await SpotifyService.previousTrack();
                        }
                    }
                    if (action === 'next') {
                        this.lastUserSeekTime = Date.now();
                        await SpotifyService.nextTrack();
                    }
                    if (action === 'playpause') {
                        this.lastUserSeekTime = Date.now();
                        if (this.isPlaying) {
                            this.isPlaying = false;
                            const elapsed = this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
                            this.progressMs = Math.min(this.progressMs + elapsed + this.syncOffset, this.durationMs);
                            this.lastSyncTime = 0;

                            this.updatePlayPauseUI();
                            this.updateProgressBar(this.progressMs);
                            this.updateLyricsSync(this.progressMs);

                            await SpotifyService.pauseTrack().catch(err => console.error(err));
                        } else {
                            this.isPlaying = true;
                            this.lastSyncTime = Date.now();

                            this.updatePlayPauseUI();
                            await SpotifyService.playTrack().catch(err => console.error(err));
                        }
                    }

                    setTimeout(() => this.pollPlayerState(), 2000);
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

    setupSyncControls() {
        const attachSyncListeners = (prefix) => {
            const btnDown = document.getElementById(`${prefix}btn-sync-down`);
            const btnUp = document.getElementById(`${prefix}btn-sync-up`);
            const btnReset = document.getElementById(`${prefix}btn-sync-reset`);

            if (btnDown) {
                btnDown.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.adjustSyncOffset(-100);
                });
            }
            if (btnUp) {
                btnUp.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.adjustSyncOffset(100);
                });
            }
            if (btnReset) {
                btnReset.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.adjustSyncOffset(0, true);
                });
            }
        };

        attachSyncListeners('');
        attachSyncListeners('floating-');
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

                        const isLightMode = document.body.classList.contains('light-mode');
                        if (this.pipActiveIndexSmooth === undefined || isNaN(this.pipActiveIndexSmooth) || isLightMode) {
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

                            const text = getLineText(lyric, 'original');
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
                                        const bgText = getBgText(lyric);
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
                                linesToDraw[j].stackY = linesToDraw[j - 1].stackY +
                                    (linesToDraw[j - 1].height + linesToDraw[j].height) / 2 +
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

                            // Smoothly animate scale down transition when active lines end (except in light mode)
                            const targetScaleMult = (isItemActive || isLightMode) ? 1.0 : 0.72;
                            if (item.lyric._scaleMult === undefined || isLightMode) {
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

                                        pipCtx.textAlign = 'left';
                                        let currentX = alignRight ? startX - totalLineWidth : startX;
                                        lineSyls.forEach(syl => {
                                            const sylWidth = pipCtx.measureText(syl.text).width;
                                            const isActiveWord = (smoothProgress >= syl.timestamp && smoothProgress < syl.endtime);
                                            const isLightMode = document.body.classList.contains('light-mode');

                                            pipCtx.save();

                                            pipCtx.fillText(syl.text, currentX, startY);
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

                                            pipCtx.textAlign = 'left';
                                            let currentX = alignRight ? startX - totalBgLineWidth : startX;
                                            bgLineSyls.forEach(syl => {
                                                const sylWidth = pipCtx.measureText(syl.text).width;
                                                const isActiveBgWord = (smoothProgress >= syl.timestamp && smoothProgress < syl.endtime);

                                                pipCtx.save();

                                                pipCtx.fillText(syl.text, currentX, bgStartY);
                                                pipCtx.restore();

                                                currentX += sylWidth;
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

                // Inner parallel accent line
                const offset = Math.round(16 * scale);
                pipCtx.beginPath();
                pipCtx.moveTo(blX + offset, blY - handleSize + offset);
                pipCtx.lineTo(blX + offset, blY - offset);
                pipCtx.lineTo(blX + handleSize - offset, blY - offset);
                pipCtx.stroke();

                pipCtx.restore();
            } catch (err) {
                console.error("Erro ao renderizar PiP Canvas:", err);
            }
        };

        const startLoop = () => {
            if (pipAnimationId || pipIntervalId) return;

            // requestAnimationFrame loop for ultra-smooth rendering in active focus
            const run = () => {
                renderPipCanvas();
                pipAnimationId = requestAnimationFrame(run);
            };
            pipAnimationId = requestAnimationFrame(run);

            // setInterval backup loop for background browser throttle (requestAnimationFrame pauses in hidden tabs)
            // 33ms interval guarantees ~30fps rendering even when user navigates away
            pipIntervalId = setInterval(renderPipCanvas, 33);

            // Audio silent loop trick to prevent Android/iOS WebView from pausing canvas drawing when in background
            if (!silentAudio) {
                silentAudio = new Audio();
                // 1-second completely silent base64 MP3 stream
                silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
                silentAudio.loop = true;
            }
            silentAudio.play().catch(() => { });
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

        const startCanvasPip = async () => {
            let handleVisibilityChange = null;
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
                const isMobile = window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent);
                const pipW = isMobile ? 540 : 1080;
                const pipH = isMobile ? 720 : 1440;

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
            if (!('documentPictureInPicture' in window)) {
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
                document.body.classList.add('pip-active');

                const bgClone = document.querySelector('.blur-background-container').cloneNode(true);
                pipWindow.document.body.appendChild(bgClone);

                const originalContainer = document.getElementById('lyrics-container');

                const pipMain = document.createElement('main');
                pipMain.className = 'flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 py-8 relative z-10';

                const placeholder = document.createElement('div');
                placeholder.id = 'pip-placeholder';
                placeholder.className = 'flex-1 flex flex-col justify-center items-center text-white/50 text-center px-4';
                placeholder.style.order = '3';
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
                btnRecenterClone.style.left = '1.5rem';
                btnRecenterClone.style.zIndex = '50';
                btnRecenterClone.style.display = 'flex';
                btnRecenterClone.style.alignItems = 'center';
                btnRecenterClone.style.justifyContent = 'center';
                btnRecenterClone.style.whiteSpace = 'nowrap';
                pipMain.appendChild(btnRecenterClone);

                let pipScrollTimeout;
                const handlePipUserInteraction = () => {
                    this.isUserInteracting = true;
                    if (this.lyricsContainer) this.lyricsContainer.classList.add('user-scrolling');

                    const isSongFinished = this.lyrics.length > 0 && this.progressMs >= this.lyrics[this.lyrics.length - 1].timestamp;
                    if (!isSongFinished) {
                        btnRecenterClone.classList.remove('hidden');
                        pipWindow.requestAnimationFrame(() => {
                            btnRecenterClone.classList.remove('opacity-0', 'scale-95');
                            btnRecenterClone.classList.add('opacity-100', 'scale-100');
                        });
                    }

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
                let isAbsolute = false;
                pipWindow.addEventListener('scroll', () => {
                    const credits = pipWindow.document.getElementById('lyrics-credits-block');
                    if (credits) {
                        const rect = credits.getBoundingClientRect();
                        const threshold = pipWindow.innerHeight - 16;

                        if (rect.top <= threshold) {
                            if (!isAbsolute) {
                                btnRecenterClone.style.position = 'absolute';
                                btnRecenterClone.style.bottom = 'auto';
                                btnRecenterClone.style.top = (credits.offsetTop - btnRecenterClone.offsetHeight - 16) + 'px';
                                isAbsolute = true;
                            }
                        } else {
                            if (isAbsolute) {
                                btnRecenterClone.style.position = 'fixed';
                                btnRecenterClone.style.top = 'auto';
                                btnRecenterClone.style.bottom = '2rem';
                                isAbsolute = false;
                            }
                        }
                    } else if (isAbsolute) {
                        btnRecenterClone.style.position = 'fixed';
                        btnRecenterClone.style.top = 'auto';
                        btnRecenterClone.style.bottom = '2rem';
                        isAbsolute = false;
                    }

                    if (Date.now() - this.lastAutoScrollTime < 800) {
                        return;
                    }
                    handlePipUserInteraction();
                }, { passive: true });

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
                    document.body.classList.remove('pip-active');
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

                setTimeout(() => {
                    this.isUserInteracting = false;
                    this.lastAutoScrollTime = Date.now();
                    if (this.lyricsContainer) this.lyricsContainer.classList.remove('user-scrolling');
                    if (btnRecenterClone) {
                        btnRecenterClone.classList.remove('opacity-100', 'scale-100');
                        btnRecenterClone.classList.add('opacity-0', 'scale-95');
                    }
                    this.updateLyricsSync(this.progressMs);
                }, 150);

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

        this.updateSyncOffsetDisplay();

        this.activeLineId = null;
        if (this.lyricsContainer) {
            const els = this.lyricsContainer.querySelectorAll('.lyric-line, .lyrics-syllable');
            els.forEach(el => el.classList.remove('active', 'passed', 'current'));

            const elapsed = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
            this.updateLyricsSync(this.progressMs + elapsed + this.syncOffset);
        }
    }

    updateSyncOffsetDisplay() {
        const displays = [
            document.getElementById('sync-offset-display'),
            document.getElementById('floating-sync-offset-display')
        ];

        displays.forEach(display => {
            if (display) {
                if (this.syncOffset === 0) {
                    display.textContent = '0.0s';
                    display.classList.remove('text-emerald-400', 'text-amber-400');
                    display.classList.add('text-white/70');
                } else {
                    const sign = this.syncOffset > 0 ? '+' : '';
                    display.textContent = `${sign}${(this.syncOffset / 1000).toFixed(1)}s`;
                    display.classList.remove('text-white/70', 'text-emerald-400', 'text-amber-400');
                    display.classList.add(this.syncOffset > 0 ? 'text-emerald-400' : 'text-amber-400');
                }
            }
        });
    }

    loadSettings() {
        if (this.inputClientId) {
            this.inputClientId.value = localStorage.getItem(Config.CLIENT_ID_KEY) || '';
        }

        // Load Light Mode
        const lightModeActive = localStorage.getItem('lysinc_light_mode') === 'true';
        if (lightModeActive) {
            document.body.classList.add('light-mode');
            if (this.btnLightMode) this.btnLightMode.classList.add('active-light');
        }
    }

    resetReportForm() {
        if (this.reportTitle) this.reportTitle.value = '';
        if (this.reportCategory) this.reportCategory.value = '';
        if (this.reportMessage) this.reportMessage.value = '';
        if (this.reportTermsCheckbox) this.reportTermsCheckbox.checked = false;
        this.hasAcceptedFeedback = false;
        this.updateReportSubmitButtonState();
    }

    updateReportSubmitButtonState() {
        if (this.btnSubmitReport) {
            const isTitleValid = this.reportTitle && this.reportTitle.value.trim().length > 0;
            const isCategoryValid = this.reportCategory && this.reportCategory.value.length > 0;
            const isMessageValid = this.reportMessage && this.reportMessage.value.trim().length > 0;
            
            if (isTitleValid && isCategoryValid && isMessageValid && this.hasAcceptedFeedback) {
                this.btnSubmitReport.disabled = false;
                this.btnSubmitReport.classList.remove('opacity-50', 'pointer-events-none', 'bg-neutral-600', 'text-white/70');
                this.btnSubmitReport.classList.add('bg-emerald-500', 'hover:bg-emerald-400', 'text-black');
            } else {
                this.btnSubmitReport.disabled = true;
                this.btnSubmitReport.classList.add('opacity-50', 'pointer-events-none', 'bg-neutral-600', 'text-white/70');
                this.btnSubmitReport.classList.remove('bg-emerald-500', 'hover:bg-emerald-400', 'text-black');
            }
        }
    }

    updateStep2SaveButtonState() {
        const val = this.inputFlowClientId ? this.inputFlowClientId.value.trim() : '';
        if (val.length > 5 && this.hasAcceptedClientIdTerms) {
            if (this.btnFlowStep2Save) {
                this.btnFlowStep2Save.classList.remove('opacity-50', 'pointer-events-none', 'bg-neutral-600', 'text-white/70');
                this.btnFlowStep2Save.classList.add('bg-emerald-500', 'hover:bg-emerald-400', 'text-black');
                const wrapper = document.getElementById('wrapper-btn-step2-save');
                if (wrapper) wrapper.removeAttribute('data-tooltip-follow');
            }
        } else {
            if (this.btnFlowStep2Save) {
                this.btnFlowStep2Save.classList.add('opacity-50', 'pointer-events-none', 'bg-neutral-600', 'text-white/70');
                this.btnFlowStep2Save.classList.remove('bg-emerald-500', 'hover:bg-emerald-400', 'text-black');
                const wrapper = document.getElementById('wrapper-btn-step2-save');
                if (wrapper) {
                    if (val.length <= 5) wrapper.setAttribute('data-tooltip-follow', 'Você precisa inserir o Client ID.');
                    else if (!this.hasAcceptedClientIdTerms) wrapper.setAttribute('data-tooltip-follow', 'Você precisa aceitar os termos.');
                    else wrapper.setAttribute('data-tooltip-follow', 'Você precisa inserir o Client ID e aceitar os termos.');
                }
            }
        }
    }

    changeLyricsFontSize(delta) {
        this.lyricsFontScale = Math.min(1.8, Math.max(0.7, parseFloat((this.lyricsFontScale + delta).toFixed(1))));
        localStorage.setItem('lysinc_lyrics_font_scale', this.lyricsFontScale);
        document.documentElement.style.setProperty('--lyrics-font-scale', this.lyricsFontScale);
        this.showToast(`Tamanho da fonte: ${Math.round(this.lyricsFontScale * 100)}%`, 'info');
    }

    updateLoginButtonsState() {
        this.updateSettingsModalButtons();
    }

    updateSettingsModalButtons() {
        const clientId = Config.getClientId();
        const sysId = Config.getSystemClientId();
        const isSystemAccount = clientId && sysId && clientId === sysId;

        const copyBtn = document.getElementById('btn-copy-client-id');

        if (clientId) {
            // Idle screen
            if (this.idleBtnRemoveClientId) {
                this.idleBtnRemoveClientId.classList.remove('hidden');
                this.idleBtnRemoveClientId.classList.add('flex');
            }
            if (this.idleBtnAddClientIdSettings) {
                this.idleBtnAddClientIdSettings.classList.add('hidden');
                this.idleBtnAddClientIdSettings.classList.remove('flex');
            }
            if (this.idleInputClientIdReadonly) {
                this.idleInputClientIdReadonly.value = isSystemAccount ? 'Conta do Sistema' : clientId;
            }

            // Settings modal
            if (this.settingsBtnRemoveClientId) {
                this.settingsBtnRemoveClientId.classList.remove('hidden');
                this.settingsBtnRemoveClientId.classList.add('flex');
            }
            if (this.settingsBtnAddClientIdSettings) {
                this.settingsBtnAddClientIdSettings.classList.add('hidden');
                this.settingsBtnAddClientIdSettings.classList.remove('flex');
            }
            if (this.settingsInputClientIdReadonly) {
                this.settingsInputClientIdReadonly.value = isSystemAccount ? 'Conta do Sistema' : clientId;
            }
            if (copyBtn) copyBtn.classList.remove('hidden');
        } else {
            // Idle screen
            if (this.idleBtnRemoveClientId) {
                this.idleBtnRemoveClientId.classList.add('hidden');
                this.idleBtnRemoveClientId.classList.remove('flex');
            }
            if (this.idleBtnAddClientIdSettings) {
                this.idleBtnAddClientIdSettings.classList.remove('hidden');
                this.idleBtnAddClientIdSettings.classList.add('flex');
            }
            if (this.idleInputClientIdReadonly) {
                this.idleInputClientIdReadonly.value = 'Nenhum Client ID cadastrado';
            }

            // Settings modal
            if (this.settingsBtnRemoveClientId) {
                this.settingsBtnRemoveClientId.classList.add('hidden');
                this.settingsBtnRemoveClientId.classList.remove('flex');
            }
            if (this.settingsBtnAddClientIdSettings) {
                this.settingsBtnAddClientIdSettings.classList.remove('hidden');
                this.settingsBtnAddClientIdSettings.classList.add('flex');
            }
            if (this.settingsInputClientIdReadonly) {
                this.settingsInputClientIdReadonly.value = 'Nenhum Client ID cadastrado';
            }
            if (copyBtn) copyBtn.classList.add('hidden');
        }
    }

    openClientIdFlow() {
        if (!this.clientIdFlowModal) return;
        this.clientIdFlowModal.classList.remove('hidden');
        this.clientIdFlowModal.classList.add('flex');
        if (this.flowStep1) this.flowStep1.classList.remove('hidden');
        if (this.flowStep2) this.flowStep2.classList.add('hidden');
        if (this.flowStep3) this.flowStep3.classList.add('hidden');
    }

    closeClientIdFlow() {
        if (!this.clientIdFlowModal) return;
        this.clientIdFlowModal.classList.add('hidden');
        this.clientIdFlowModal.classList.remove('flex');
    }

    async handleRemoveClientId(removeFromGlobal = false) {
        // Fechar o modal de confirmação se estiver aberto
        if (this.confirmRemoveClientIdModal) {
            this.confirmRemoveClientIdModal.classList.add('hidden');
            this.confirmRemoveClientIdModal.classList.remove('flex');
        }
        
        if (removeFromGlobal) {
            await SupabaseService.removeClientId();
            localStorage.removeItem('lysinc_accepted_privacy');
            localStorage.removeItem('lysinc_accepted_client_id_terms');
            this.hasAcceptedPrivacy = false;
            this.hasAcceptedClientIdTerms = false;
            if (this.privacyTermsCheckbox) this.privacyTermsCheckbox.checked = false;
            if (this.step2PrivacyTermsCheckbox) this.step2PrivacyTermsCheckbox.checked = false;
            if (this.btnConnect) {
                this.btnConnect.disabled = true;
                this.btnConnect.classList.add('disabled:bg-neutral-600', 'disabled:text-neutral-400', 'disabled:cursor-not-allowed', 'disabled:pointer-events-none');
                const wrapper = document.getElementById('wrapper-btn-connect');
                if (wrapper) wrapper.setAttribute('data-tooltip-follow', 'Você precisa aceitar os termos primeiro');
            }
        } else {
            Config.setClientId('');
        }
        
        this.updateLoginButtonsState();
        this.toggleSettingsModal(false);
        this.showToast('Client ID removido com sucesso.', 'info');
        
        // Fazer logout para garantir que o estado local está limpo
        setTimeout(() => {
            SpotifyService.logout();
        }, 1500);
    }

    hasLyricsCacheData() {
        const LYRICS_CACHE_PREFIX = 'lysinc_lyrics_';
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(LYRICS_CACHE_PREFIX)) return true;
        }
        return false;
    }

    clearLyricsCache() {
        const LYRICS_CACHE_PREFIX = 'lysinc_lyrics_';
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(LYRICS_CACHE_PREFIX)) keysToRemove.push(key);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    }

    clearAllSiteData() {
        localStorage.clear();
        sessionStorage.clear();
        this.showToast('Todos os dados do site foram apagados. Recarregando...', 'info');
        setTimeout(() => window.location.reload(), 1500);
    }

    updateClearCacheButtonState() {
        if (!this.btnClearCache) return;
        const hasCache = this.hasLyricsCacheData();
        if (hasCache) {
            this.btnClearCache.disabled = false;
            this.btnClearCache.classList.remove('opacity-30', 'cursor-not-allowed');
        } else {
            this.btnClearCache.disabled = true;
            this.btnClearCache.classList.add('opacity-30', 'cursor-not-allowed');
        }
    }

    async updateUserProfile() {

        const profile = await SpotifyService.getUserProfile();
        if (profile) {
            let currentClientId = Config.getClientId();
            const systemId = Config.getSystemClientId();

            if (currentClientId && currentClientId !== systemId) {
                await SupabaseService.saveClientId(currentClientId, profile);
            } else if (profile && profile.id) {
                // Tenta recuperar um Client ID personalizado salvo previamente no Supabase
                let recoveredId = await SupabaseService.getClientId(profile.id);
                if (recoveredId && recoveredId !== systemId && recoveredId !== currentClientId) {
                    Config.setClientId(recoveredId);
                    this.showToast('Seu Client ID foi recuperado com sucesso! Reconectando...', 'success');
                    setTimeout(() => {
                        SpotifyService.logout();
                        SpotifyService.login();
                    }, 2000);
                    return false;
                }
            }

            // Update idle screen
            if (this.idleUserProfileSection) {
                this.idleUserProfileSection.classList.remove('hidden');
                this.idleUserProfileSection.classList.add('flex');
            }
            if (this.idleUserDisplayName) this.idleUserDisplayName.textContent = profile.display_name;
            if (this.idleUserUsername) this.idleUserUsername.textContent = `@${profile.id}`;
            if (this.idleUserAvatar && profile.images && profile.images[0]?.url) {
                this.idleUserAvatar.src = profile.images[0].url;
            }

            // Update settings modal
            if (this.settingsUserProfileSection) {
                this.settingsUserProfileSection.classList.remove('hidden');
                this.settingsUserProfileSection.classList.add('flex');
            }
            if (this.settingsUserDisplayName) this.settingsUserDisplayName.textContent = profile.display_name;
            if (this.settingsUserUsername) this.settingsUserUsername.textContent = `@${profile.id}`;
            if (this.settingsUserAvatar && profile.images && profile.images[0]?.url) {
                this.settingsUserAvatar.src = profile.images[0].url;
            }
        } else {
            if (this.idleUserProfileSection) {
                this.idleUserProfileSection.classList.add('hidden');
                this.idleUserProfileSection.classList.remove('flex');
            }
            if (this.settingsUserProfileSection) {
                this.settingsUserProfileSection.classList.add('hidden');
                this.settingsUserProfileSection.classList.remove('flex');
            }
        }
        return true;
    }

    async toggleSettingsModal(show) {
        if (!this.settingsModal) return;
        if (show) {
            this.settingsModal.classList.remove('hidden');
            this.settingsModal.classList.add('flex');

            this.updateLoginButtonsState();
            await this.updateUserProfile();
        } else {
            this.settingsModal.classList.add('hidden');
            this.settingsModal.classList.remove('flex');
        }
    }

    showScreen(screenName) {
        // Track previous screen if it's not a terms screen
        if (this.currentScreen && this.currentScreen !== 'terms-feedback' && this.currentScreen !== 'terms-privacy' && this.currentScreen !== 'terms-client-id') {
            this.previousScreen = this.currentScreen;
        }
        this.currentScreen = screenName;

        if (this.screenPreLogin) this.screenPreLogin.classList.add('hidden');
        if (this.screenFlowStep1) this.screenFlowStep1.classList.add('hidden');
        if (this.screenFlowStep2) this.screenFlowStep2.classList.add('hidden');
        if (this.screenFlowStep3) this.screenFlowStep3.classList.add('hidden');
        if (this.screenMain) this.screenMain.classList.add('hidden');
        if (this.screenIdle) this.screenIdle.classList.add('hidden');
        if (this.screenError) this.screenError.classList.add('hidden');
        if (this.screenReportError) this.screenReportError.classList.add('hidden');
        if (this.screenTermsFeedback) this.screenTermsFeedback.classList.add('hidden');
        if (this.screenTermsPrivacy) this.screenTermsPrivacy.classList.add('hidden');
        if (this.screenTermsClientId) this.screenTermsClientId.classList.add('hidden');
        if (this.screenSpotifyDetails) this.screenSpotifyDetails.classList.add('hidden');

        if (screenName === 'pre-login') {
            if (this.screenPreLogin) this.screenPreLogin.classList.remove('hidden');
        } else if (screenName === 'flow-step-1') {
            if (this.screenFlowStep1) this.screenFlowStep1.classList.remove('hidden');
        } else if (screenName === 'flow-step-2') {
            if (this.screenFlowStep2) this.screenFlowStep2.classList.remove('hidden');
        } else if (screenName === 'flow-step-3') {
            if (this.screenFlowStep3) this.screenFlowStep3.classList.remove('hidden');
        } else if (screenName === 'main') {
            if (this.screenMain) this.screenMain.classList.remove('hidden');
        } else if (screenName === 'idle') {
            if (this.screenIdle) this.screenIdle.classList.remove('hidden');
        } else if (screenName === 'error') {
            if (this.screenError) this.screenError.classList.remove('hidden');
        } else if (screenName === 'report-error') {
            if (this.screenReportError) this.screenReportError.classList.remove('hidden');
        } else if (screenName === 'terms-feedback') {
            if (this.screenTermsFeedback) this.screenTermsFeedback.classList.remove('hidden');
        } else if (screenName === 'terms-privacy') {
            if (this.screenTermsPrivacy) this.screenTermsPrivacy.classList.remove('hidden');
        } else if (screenName === 'terms-client-id') {
            if (this.screenTermsClientId) this.screenTermsClientId.classList.remove('hidden');
        } else if (screenName === 'spotify-details') {
            if (this.screenSpotifyDetails) this.screenSpotifyDetails.classList.remove('hidden');
        }
        
        if (screenName !== 'main') {
            window.scrollTo(0, 0);
        }
    }

    showErrorScreen(message) {
        if (this.errorScreenMessage) {
            this.errorScreenMessage.textContent = message;
        }
        this.showScreen('error');
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

        if (state && state.isForbidden) {
            this.hasShownForbiddenToast = true;
            this.isPlaying = false;
            this.currentTrackId = null;
            const errorMsg = state.errorReason || 'O Spotify exige conta Premium ou que você adicione seu e-mail no "User Management" do painel de desenvolvedor (se o seu Client ID for novo).';
            this.showErrorScreen(errorMsg);
            return;
        }

        if (state.isEmpty || !state.trackName) {
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
                this.lastSyncTime = Date.now();
                this.progressMs = state.progressMs + safeCompensation;
            } else {
                this.wakeLockManager.release();
                this.progressMs = state.progressMs;
                this.lastSyncTime = 0;
            }
        }
        this.durationMs = state.durationMs;

        this.updatePlayPauseUI();

        const trackChanged = (stateTrackId !== this.currentTrackId);

        if (trackChanged) {
            const isAutoSkip = this.currentTrackId !== null && this.isPlaying;
            this.currentTrackId = stateTrackId;
            this.hasAutoSeekedToFirstLine = false;
            this.adjustSyncOffset(0, true);

            this.progressMs = state.progressMs + safeCompensation;
            this.lastSyncTime = Date.now();

            this.updateTrackDetails(state);
        } else {
            const elapsed = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
            const currentLocalProgress = this.progressMs + elapsed;
            const targetProgress = state.progressMs + safeCompensation;
            const diff = Math.abs(targetProgress - currentLocalProgress);

            if (diff > 400 || !this.isPlaying) {
                this.progressMs = targetProgress;
                this.lastSyncTime = Date.now();
            } else if (diff > 50) {
                this.progressMs += (targetProgress - currentLocalProgress) * 0.3;
            }
        }

        this.showScreen('main');

        if (trackChanged) {
            // Setup marquee only on track change (or resize), and only after screen is visible
            this.setupMarquee(this.trackName);
            this.setupMarquee(this.trackArtists);
            this.setupMarquee(this.trackinfoTitle);
            this.setupMarquee(this.trackinfoArtist);

            await this.loadLyricsForTrack(state);
        }

        if (this.lyrics.length > 0) {
            const elapsed = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
            const currentEstimatedTime = this.progressMs + elapsed + this.syncOffset;
            this.updateLyricsSync(currentEstimatedTime);
        }
    }

    updateTrackDetails(state) {
        this.trackName.textContent = state.trackName;
        this.trackArtists.textContent = state.artists;

        if (this.trackinfoTitle) this.trackinfoTitle.textContent = state.trackName;
        if (this.trackinfoArtist) this.trackinfoArtist.textContent = state.artists;

        this.isExplicit = !!state.explicit;

        if (this.explicitIconHeader) {
            if (state.explicit) {
                this.explicitIconHeader.classList.remove('hidden');
                if (this.explicitIconTrackinfo) this.explicitIconTrackinfo.classList.remove('hidden');
            } else {
                this.explicitIconHeader.classList.add('hidden');
                if (this.explicitIconTrackinfo) this.explicitIconTrackinfo.classList.add('hidden');
            }
        }

        if (state.albumArtUrl) {
            this.albumArt.src = state.albumArtUrl;
            if (this.trackinfoArt) this.trackinfoArt.src = state.albumArtUrl;
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
                            g += data.data[i + 1];
                            b += data.data[i + 2];
                            count++;
                        }
                        if (count > 0) {
                            r = Math.floor((r / count) * 0.4);
                            g = Math.floor((g / count) * 0.4);
                            b = Math.floor((b / count) * 0.4);
                            this.currentAlbumColor = `rgb(${r}, ${g}, ${b})`;
                            document.documentElement.style.setProperty('--album-color', this.currentAlbumColor);
                        }
                    } catch (e) { }
                };
                img.src = state.albumArtUrl;
            } catch (e) { }
        } else {
            this.albumArt.src = '';
            if (this.trackinfoArt) this.trackinfoArt.src = '';
            this.albumArtBlur.style.backgroundImage = 'none';
            this.currentAlbumColor = '#121212';
            document.documentElement.style.setProperty('--album-color', '#121212');
            if (this.pipWindow) {
                const pipBlur = this.pipWindow.document.getElementById('album-art-blur');
                if (pipBlur) pipBlur.style.backgroundImage = 'none';
            }
        }

        // Atualiza a exibição imediata dos metadados com dados do Spotify e MusicBrainz
        this.currentTrackState = state;
        this.updateMetadataFooterUI();

        // Dispara a busca de metadados adicionais no MusicBrainz
        this.fetchAndDisplayMetadata(state);
    }

    async fetchAndDisplayMetadata(state) {
        this.currentMbData = null; // Limpa os dados do MusicBrainz anteriores

        const mbData = await MusicBrainzService.getTrackMetadata(
            state.isrc,
            state.trackName,
            state.artists.split(',')[0].trim() // Pega apenas o primeiro artista para facilitar a busca de fallback
        );

        this.currentMbData = mbData;
        this.updateMetadataFooterUI();
    }

    updateMetadataFooterUI() {
        const pillsContainer = document.getElementById('musicbrainz-pills');
        const copyrightContainer = document.getElementById('musicbrainz-copyright');
        if (!pillsContainer) return;

        const state = this.currentTrackState || {};
        const mbData = this.currentMbData || {};

        const albumName = state.albumName || mbData.albumName;
        const releaseDate = state.releaseDate || mbData.releaseDate;

        let html = '';

        const createPill = (icon, text) => {
            const encodedIcon = encodeURIComponent(icon || '');
            const encodedText = encodeURIComponent(text || '');
            let html = `
                <div class="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white/80 cursor-default select-none max-w-full group">
                    ${icon ? `
                    <div class="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                        ${icon}
                    </div>` : ''}
                    <span class="font-medium truncate min-w-0 metadata-text">${text}</span>
                    <button class="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center shrink-0 ml-1 text-white/80 hover:text-white hidden metadata-more-btn" 
                            onclick="if(window.app) window.app.showMetadataPopup(decodeURIComponent('${encodedIcon}'), decodeURIComponent('${encodedText}'))" 
                            title="Ver completo">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                    </button>
                </div>
            `;
            return html;
        };

        const discIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-emerald-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>`;
        const calendarIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-emerald-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/></svg>`;
        const tagIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-emerald-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 0 1 0 2.828l-7 7a2 2 0 0 1-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>`;
        const writeIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-emerald-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>`;
        const prodIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-emerald-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;
        const shieldIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-emerald-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`;

        // 1. Dados diretos do Spotify (Álbum e Ano de Lançamento)
        if (albumName) {
            html += createPill(discIcon, albumName);
        }
        if (releaseDate) {
            html += createPill(calendarIcon, releaseDate);
        }

        // 2. Metadados complementares exclusivos do MusicBrainz (Gêneros, Compositores, Produtores, Gravadora)
        if (mbData.genres) {
            const genresList = mbData.genres.split(',').map(g => g.trim()).filter(Boolean).join(', ');
            if (genresList) html += createPill(tagIcon, genresList);
        }
        if (mbData.writers) {
            const writersList = mbData.writers.split(',').map(w => w.trim()).filter(Boolean).join(', ');
            if (writersList) html += createPill(writeIcon, writersList);
        }
        if (mbData.producers) {
            const prodList = mbData.producers.split(',').map(p => p.trim()).filter(Boolean).join(', ');
            if (prodList) html += createPill(prodIcon, prodList);
        }
        if (mbData.label) {
            html += createPill(shieldIcon, mbData.label);
        }

        pillsContainer.innerHTML = html;

        if (this.pillResizeObserver) {
            this.pillResizeObserver.disconnect();
        }
        this.pillResizeObserver = new ResizeObserver(() => {
            const texts = pillsContainer.querySelectorAll('.metadata-text');
            texts.forEach(span => {
                const btn = span.nextElementSibling;
                if (btn && btn.classList.contains('metadata-more-btn')) {
                    if (span.scrollWidth > span.clientWidth) {
                        btn.classList.remove('hidden');
                    } else {
                        btn.classList.add('hidden');
                    }
                }
            });
        });
        this.pillResizeObserver.observe(pillsContainer.parentElement);

        if (copyrightContainer) {
            let copyrightHtml = '';
            if (mbData.copyright) copyrightHtml += `© ${mbData.copyright} `;
            if (mbData.phonographicCopyright) copyrightHtml += `℗ ${mbData.phonographicCopyright}`;

            if (copyrightHtml) {
                copyrightContainer.innerHTML = `<div class="w-full text-center mt-4 text-[9px] opacity-50">${copyrightHtml}</div>`;
            } else {
                copyrightContainer.innerHTML = '';
            }
        }

        // Adiciona botão do YouTube se tiver link
        if (mbData.youtubeLink) {
            const ytBtn = document.getElementById('youtube-video-btn');
            if (ytBtn) {
                ytBtn.href = mbData.youtubeLink;
                ytBtn.classList.remove('hidden');
                ytBtn.classList.add('flex');
            }
        }
    }

    setupMarquee(element) {
        if (!element) return;

        const container = element.closest('.flex-1') || element.closest('.overflow-hidden');
        if (!container) return;

        // Ensure the main container clips overflowing content
        container.classList.add('overflow-hidden');

        // Animate the parent wrapper for track-name & trackinfo-title (to include explicit icon), or the element itself for track-artists
        const isTitleElement = (element.id === 'track-name' || element.id === 'trackinfo-title');
        const targetToAnimate = isTitleElement ? element.parentElement : element;

        // Force the element to expand to its true content width so it doesn't wrap or truncate with ellipsis
        targetToAnimate.style.width = 'max-content';
        targetToAnimate.style.maxWidth = 'none';
        targetToAnimate.classList.remove('overflow-hidden');
        element.style.whiteSpace = 'nowrap';
        element.classList.remove('truncate');
        element.style.textOverflow = 'clip';

        // Cancel existing animations
        if (targetToAnimate.marqueeAnim) {
            targetToAnimate.marqueeAnim.cancel();
            targetToAnimate.marqueeAnim = null;
        }
        if (targetToAnimate.marqueeReturnAnim) {
            targetToAnimate.marqueeReturnAnim.cancel();
            targetToAnimate.marqueeReturnAnim = null;
        }
        targetToAnimate.style.transform = 'translateX(0)';

        // Measure true widths
        const containerWidth = container.clientWidth;
        if (containerWidth === 0) return; // Prevent setting up when container is hidden/collapsed
        const textWidth = targetToAnimate.scrollWidth;

        if (textWidth > containerWidth) {
            const scrollDistance = textWidth - containerWidth;
            const pixelsPerSecond = 35; // Smooth reading speed
            const durationMs = (scrollDistance / pixelsPerSecond) * 1000;

            const keyframes = [
                { transform: 'translateX(0)' },
                { transform: `translateX(-${scrollDistance}px)` }
            ];

            const animOptions = {
                duration: durationMs,
                delay: 1500, // Pause before starting
                fill: 'forwards',
                easing: 'linear' // Continuous speed for reading
            };

            targetToAnimate.marqueeAnim = targetToAnimate.animate(keyframes, animOptions);

            targetToAnimate.marqueeAnim.onfinish = () => {
                const returnKeyframes = [
                    { transform: `translateX(-${scrollDistance}px)` },
                    { transform: 'translateX(0)' }
                ];
                // Faster return speed (e.g. 200 pixels per second), min 500ms
                const returnDurationMs = Math.max(500, (scrollDistance / 200) * 1000);

                const returnOptions = {
                    duration: returnDurationMs,
                    delay: 1500, // Pause at the end before returning
                    easing: 'ease-in-out'
                };

                targetToAnimate.marqueeReturnAnim = targetToAnimate.animate(returnKeyframes, returnOptions);
                targetToAnimate.marqueeReturnAnim.onfinish = () => {
                    // Loop animation safely
                    this.setupMarquee(element);
                };
            };
        } else {
            // Fits perfectly, reset
            targetToAnimate.style.transform = 'translateX(0)';
            element.classList.add('truncate');
            element.style.textOverflow = '';
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
            <div class="flex-1 w-full min-h-[50vh] flex flex-col items-center justify-center opacity-50 transition-opacity duration-500 pointer-events-none z-0 mt-8">
                <div class="w-20 h-20 rounded-full flex items-center justify-center bg-white/5 border border-white/10 mb-8 listening-indicator">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div class="text-emerald-400/80 text-lg font-medium tracking-wide text-center px-4">Carregando letras sincronizadas...</div>
            </div>
        `;
        if (this.btnRecenter) {
            this.btnRecenter.classList.add('hidden', 'opacity-0');
        }
        if (this.btnFloatingToggle) {
            this.btnFloatingToggle.classList.remove('opacity-100', 'scale-100', 'w-10', 'mr-3');
            this.btnFloatingToggle.classList.add('hidden', 'opacity-0', 'scale-95', 'w-0', 'border-0', 'px-0', 'mr-0');
        }
        if (this.floatingControlsWrapper) {
            this.floatingControlsWrapper.classList.add('hidden', 'opacity-0');
        }
        const topMenu = document.getElementById('lyrics-top-menu');
        if (topMenu) {
            topMenu.classList.remove('hidden');
            topMenu.classList.add('flex');
        }


        this.currentTrackArtistsRaw = state.artistsRaw || [];
        if (this.currentTrackArtistsRaw.length > 0) {
            // const ids = this.currentTrackArtistsRaw.map(a => a.id).filter(id => id);
            // this.artistImages = await SpotifyService.getArtistsImages(ids);
            this.artistImages = {}; // Spotify API restrita em modo Dev para v1/artists
        } else {
            this.artistImages = {};
        }

        let fetchedLyrics = null;
        try {
            fetchedLyrics = await LyricsService.getLyrics(
                state.trackName,
                state.artists,
                state.albumName,
                state.durationMs,
                this.userForcedProvider ? this.currentLyricsProvider : null,
                state.isrc
            );
        } catch (err) {
            console.error('[LySinc] Erro na busca de letras:', err);
            fetchedLyrics = null;
        }

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

            this.lyrics = this.injectInstrumentalLines(this.lyricsData[this.currentLyricsMode] || this.lyricsData.original);
            this.renderLyrics();

            if (this.currentLyricsMode !== 'original') {
                await this.changeLyricsMode(this.currentLyricsMode);
            }

            if (topMenu) {
                topMenu.classList.remove('hidden');
                topMenu.classList.add('flex');
            }


            this.activeLineId = null;
            this.currentActiveIdsKey = '';
            const elapsed = this.isPlaying && this.lastSyncTime > 0 ? (Date.now() - this.lastSyncTime) : 0;
            const currentProgressMs = this.progressMs + elapsed + this.syncOffset;

            if (this.isPlaying && currentProgressMs > 500) {
                this.seekToTime(currentProgressMs, true).catch(() => {});
            }

            this.updateLyricsSync(currentProgressMs);
        } else {
            this.lyricsData = null;
            this.lyrics = [];
            this.lyricsContainer.innerHTML = `
                <div class="flex-1 w-full min-h-[40vh] flex flex-col items-center justify-center text-center px-4 py-16">
                    <div class="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                        <svg class="w-8 h-8 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                    </div>
                    <div class="text-white/80 text-lg font-medium">Letras não disponíveis para esta música</div>
                    <div class="text-white/40 text-sm mt-1 max-w-sm">Tente selecionar outra música no Spotify para testar a sincronização.</div>
                </div>`;
            if (topMenu) {
                topMenu.classList.remove('hidden');
                topMenu.classList.add('flex');
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
                    text: [{ text: 'Fim', timestamp: lastEndtime + 500, endtime: this.durationMs + 3600000 }],
                    background: false,
                    backgroundText: [],
                    timestamp: lastEndtime + 500,
                    endtime: this.durationMs + 3600000,
                    isWordSynced: true,
                    isFim: true,
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

        let containerWidth = this.lyricsContainer ? this.lyricsContainer.clientWidth : 0;

        if (containerWidth < 300) {
            containerWidth = window.innerWidth >= 768 ? Math.max(500, window.innerWidth * 0.55) : Math.max(300, window.innerWidth - 40);
        }

        const maxWidth = containerWidth - 48;
        return { ctx: this._domCtx, maxWidth: maxWidth > 300 ? maxWidth : 300 };
    }

    renderLyrics(keepScroll = false) {
        const currentScrollY = window.scrollY;
        this.lyricsContainer.innerHTML = '';
        this.lastAutoScrollTime = Date.now();
        if (!keepScroll) {
            // this.scrollToPosition(0); // Removido a pedido do usuário
        }

        // Precalculate word boundaries for syllables to ensure word-level animations
        this.lyrics.forEach(line => {
            const processSyllables = (syls) => {
                let currentWordStart = null;
                let currentWordSyllables = [];
                syls.forEach(syl => {
                    if (currentWordStart === null) currentWordStart = syl.timestamp;
                    currentWordSyllables.push(syl);
                    const hasSpace = syl.text.endsWith(' ') && syl.text !== ' ';
                    if (hasSpace) {
                        const wordEnd = syl.endtime;
                        currentWordSyllables.forEach(s => {
                            s.wordTimestamp = currentWordStart;
                            s.wordEndtime = wordEnd;
                        });
                        currentWordStart = null;
                        currentWordSyllables = [];
                    }
                });
                if (currentWordSyllables.length > 0) {
                    const wordEnd = currentWordSyllables[currentWordSyllables.length - 1].endtime;
                    currentWordSyllables.forEach(s => {
                        s.wordTimestamp = currentWordStart;
                        s.wordEndtime = wordEnd;
                    });
                }
            };

            if (line.isWordSynced && line.text) processSyllables(line.text);
            if (line.isWordSynced && line.backgroundText) processSyllables(line.backgroundText);
        });

        const { ctx: domCtx, maxWidth } = this.getDOMWrapContext();

        this.lyrics.forEach((line) => {
            const isInstrumental = line.isInstrumental || (line.text && line.text.length === 1 && (line.text[0].text.trim() === '♪' || line.text[0].text.trim().includes('♪')));
            if (!line.isFim && !isInstrumental) {
                const mainStr = getLineText(line).trim();
                const bgStr = getBgText(line).trim();
                if (!mainStr && !bgStr) {
                    return; // Descarta entradas de linhas vazias vindas dos servidores para evitar lacunas
                }
            }

            const lineEl = document.createElement('div');
            lineEl.id = `line-${line.id}`;

            let lineClass = 'lyric-line max-md:py-1.5 max-md:my-1 md:py-3 md:my-2';
            if (line.isFim) lineClass += ' is-fim-line';
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

            if (isInstrumental) {
                lineClass += ' instrumental-line';
            }

            lineEl.className = lineClass;

            let touchStartX = 0;
            let touchStartY = 0;
            let touchStartTime = 0;
            let lastTapTime = 0;

            lineEl.addEventListener('touchstart', (evt) => {
                if (evt.touches && evt.touches[0]) {
                    touchStartX = evt.touches[0].clientX;
                    touchStartY = evt.touches[0].clientY;
                    touchStartTime = Date.now();
                }
            }, { passive: true });

            const triggerLineSeek = (evt) => {
                if (evt) {
                    if (evt.cancelable) evt.preventDefault();
                    evt.stopPropagation();
                }
                const firstSyl = line.text[0];
                if (firstSyl) {
                    this.seekToTime(firstSyl.timestamp);
                    this.isUserInteracting = false;
                    this.currentActiveIdsKey = '';
                    if (this.lyricsContainer) this.lyricsContainer.classList.remove('user-scrolling');
                    if (this.btnRecenter) {
                        this.btnRecenter.classList.remove('opacity-100', 'scale-100');
                        this.btnRecenter.classList.add('opacity-0', 'scale-95', 'hidden');
                    }
                }
            };

            lineEl.addEventListener('click', (evt) => {
                if (Date.now() - lastTapTime < 600) return;
                triggerLineSeek(evt);
            });

            lineEl.addEventListener('touchend', (evt) => {
                if (evt.changedTouches && evt.changedTouches[0]) {
                    const endX = evt.changedTouches[0].clientX;
                    const endY = evt.changedTouches[0].clientY;
                    const dist = Math.hypot(endX - touchStartX, endY - touchStartY);
                    const duration = Date.now() - touchStartTime;
                    if (dist < 15 && duration < 500) {
                        lastTapTime = Date.now();
                        triggerLineSeek(evt);
                    }
                }
            }, { passive: false });

            const lineContainer = document.createElement('div');
            lineContainer.className = 'lyrics-line-container';

            const mainVocal = document.createElement('div');
            mainVocal.className = 'main-vocal-container';
            if (isInstrumental) {
                const sylSpan = document.createElement('span');
                sylSpan.className = 'lyrics-syllable instrumental-icon';
                sylSpan.id = `word-${line.id}-0`;
                sylSpan.innerHTML = '&#9834;';
                mainVocal.appendChild(sylSpan);
            } else {
                let domLines = [];

                if (line.isWordSynced) {
                    domLines = line.domWrappedLines || [line.text];
                } else {
                    const lineText = getLineText(line, 'original');
                    const wrappedStrings = wrapText(domCtx, lineText, maxWidth);
                    domLines = groupSyllablesByLines(line.text, wrappedStrings);
                }

                domLines.forEach((domLineSyls, domLineIdx) => {
                    const lineWrapper = document.createElement('span');
                    lineWrapper.className = 'dom-lyric-line-wrapper inline-block max-w-full break-words';

                    domLineSyls.forEach((syl, sylIdx) => {
                        const sylSpan = document.createElement('span');
                        sylSpan.className = 'lyrics-syllable';

                        const originalIndex = line.text.findIndex(s => s.timestamp === syl.timestamp && s.text === syl.text);
                        sylSpan.id = `word-${line.id}-${originalIndex !== -1 ? originalIndex : sylIdx}`;

                        const rawText = syl.text;
                        const cleanText = rawText.replace(/\s+$/, '');

                        sylSpan.textContent = cleanText;

                        if (syl.isGlissando) {
                            sylSpan.classList.add('glissando');
                        }

                        lineWrapper.appendChild(sylSpan);

                        if (syl.text.endsWith(' ') && sylIdx < domLineSyls.length - 1) {
                            lineWrapper.appendChild(document.createTextNode(' '));
                        }
                    });

                    mainVocal.appendChild(lineWrapper);
                    if (domLineIdx < domLines.length - 1) {
                        mainVocal.appendChild(document.createElement('br'));
                    }
                });
            }
            lineContainer.appendChild(mainVocal);

            if (line.backgroundText && line.backgroundText.length > 0) {
                const bgVocal = document.createElement('div');
                bgVocal.className = 'background-vocal-container font-semibold mt-1';

                let bgDomLines = [];
                if (line.isWordSynced) {
                    bgDomLines = line.bgDomWrappedLines || [line.backgroundText];
                } else {
                    const bgText = getLineText(line, 'background');
                    const wrappedBgStrings = wrapText(domCtx, bgText, maxWidth);
                    bgDomLines = groupSyllablesByLines(line.backgroundText, wrappedBgStrings);
                }

                bgDomLines.forEach((bgLineSyls, bgLineIdx) => {
                    const bgLineWrapper = document.createElement('span');
                    bgLineWrapper.className = 'dom-lyric-line-wrapper inline-block max-w-full break-words';

                    bgLineSyls.forEach((syl, sylIdx) => {
                        const sylSpan = document.createElement('span');
                        sylSpan.className = 'lyrics-syllable';

                        const originalIndex = line.backgroundText.findIndex(s => s.timestamp === syl.timestamp && s.text === syl.text);
                        sylSpan.id = `bgword-${line.id}-${originalIndex !== -1 ? originalIndex : sylIdx}`;

                        const rawText = syl.text;
                        const cleanText = rawText.replace(/\s+$/, '');

                        sylSpan.textContent = cleanText;

                        if (syl.isGlissando) {
                            sylSpan.classList.add('glissando');
                        }

                        bgLineWrapper.appendChild(sylSpan);

                        if (syl.text.endsWith(' ') && sylIdx < bgLineSyls.length - 1) {
                            bgLineWrapper.appendChild(document.createTextNode(' '));
                        }
                    });

                    bgVocal.appendChild(bgLineWrapper);
                    if (bgLineIdx < bgDomLines.length - 1) {
                        bgVocal.appendChild(document.createElement('br'));
                    }
                });

                lineContainer.appendChild(bgVocal);
            }

            const hasTranslation = line.translation || line.translationText;
            const hasRomanization = line.romanized || line.romanizedText;

            if (this.currentLyricsMode === 'translation' && hasTranslation) {
                const transEl = document.createElement('div');
                transEl.className = 'lyrics-translation-container';
                transEl.textContent = getLineText(line, 'translation') || line.translation || line.translationText;
                lineContainer.appendChild(transEl);
            } else if (this.currentLyricsMode === 'romanized' && hasRomanization) {
                const romEl = document.createElement('div');
                romEl.className = 'lyrics-romanization-container';
                romEl.textContent = getLineText(line, 'romanized') || line.romanized || line.romanizedText;
                lineContainer.appendChild(romEl);
            }

            lineEl.appendChild(lineContainer);
            this.lyricsContainer.appendChild(lineEl);
        });

        if (this.lyrics.length > 0) {
            const creditsBlock = document.createElement('div');
            creditsBlock.id = 'lyrics-credits-block';
            creditsBlock.className = 'mt-8 mb-16 pt-4 flex flex-col space-y-4 opacity-70 hover:opacity-100 transition-opacity';

            const mainFlex = document.createElement('div');
            mainFlex.className = 'flex flex-wrap gap-3 items-center justify-start max-w-full';
            creditsBlock.appendChild(mainFlex);

            if (this.currentTrackArtistsRaw && this.currentTrackArtistsRaw.length > 0) {
                this.currentTrackArtistsRaw.forEach(artist => {
                    const artistInfo = document.createElement('div');
                    artistInfo.className = 'flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white/80 max-w-full';

                    const imgUrl = this.artistImages && this.artistImages[artist.id];
                    let iconHtml = '';
                    if (imgUrl) {
                        iconHtml = `<img src="${imgUrl}" class="w-5 h-5 rounded-full object-cover shrink-0" alt="${artist.name}">`;
                    } else {
                        iconHtml = `
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-400/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        `;
                    }

                    artistInfo.innerHTML = `
                        ${iconHtml}
                        <span class="font-medium truncate min-w-0">${artist.name}</span>
                    `;
                    mainFlex.appendChild(artistInfo);
                });
            } else if (this.currentTrackArtists) {
                const artistInfo = document.createElement('div');
                artistInfo.className = 'flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white/80 max-w-full';
                artistInfo.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-400/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span class="font-medium truncate min-w-0">${this.currentTrackArtists}</span>
                `;
                mainFlex.appendChild(artistInfo);
            }

            const mbPills = document.createElement('div');
            mbPills.id = 'musicbrainz-pills';
            mbPills.className = 'contents';
            mainFlex.appendChild(mbPills);

            if (this.isExplicit) {
                const explicitInfo = document.createElement('div');
                explicitInfo.className = 'flex items-center bg-white/5 border border-white/10 rounded-full pl-1.5 pr-4 py-1.5 text-sm text-white/80';
                explicitInfo.innerHTML = `
                    <div class="w-5 h-5 rounded-[3px] bg-white/20 flex items-center justify-center text-white text-[11px] font-bold">
                        E
                    </div>
                    <span class="font-medium uppercase tracking-wider text-[11px] ml-2 mt-[1px]">Explícita</span>
                `;
                mainFlex.appendChild(explicitInfo);
            }

            const providerText = this.lyricsData?.source || 'Desconhecida';

            const btnChangeSource = document.createElement('button');
            btnChangeSource.id = 'btn-change-source-inline';
            btnChangeSource.className = 'flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer max-w-full';
            btnChangeSource.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-500/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <span class="font-medium truncate min-w-0">Fonte: ${providerText}</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 ml-1 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
            `;
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
            mainFlex.appendChild(btnChangeSource);

            const btnRestartTrack = document.createElement('button');
            btnRestartTrack.className = 'flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer max-w-full';
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
            mainFlex.appendChild(btnRestartTrack);

            const mbCopyright = document.createElement('div');
            mbCopyright.id = 'musicbrainz-copyright';
            creditsBlock.appendChild(mbCopyright);

            this.lyricsContainer.appendChild(creditsBlock);

            this.updateMusicBrainzUI();
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
            if (this.trackinfoProgress) this.trackinfoProgress.style.width = `${percentage}%`;
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

                let targetY = targetEl.getBoundingClientRect().top + this.getScrollY() - viewportHeight * 0.4 + targetEl.offsetHeight / 2;

                // Red line limit
                const absoluteLineTop = targetEl.getBoundingClientRect().top + this.getScrollY();
                const minViewportTop = window.innerWidth < 768 ? 95 : 140;
                if (targetY > absoluteLineTop - minViewportTop) {
                    targetY = absoluteLineTop - minViewportTop;
                }

                this.smoothScrollTo(Math.max(0, targetY));
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
        this.currentActiveIdsKey = '';
        const absoluteLineTop = this.getAbsoluteOffsetTop(lineElement);
        const height = lineElement.offsetHeight;

        let targetScrollTop = absoluteLineTop - (window.innerHeight * 0.35) + (height / 2);

        // Red line limit
        const minViewportTop = window.innerWidth < 768 ? 95 : 140;
        if (targetScrollTop > absoluteLineTop - minViewportTop) {
            targetScrollTop = absoluteLineTop - minViewportTop;
        }

        this.lastAutoScrollTime = Date.now();

        this.smoothScrollTo(Math.max(0, targetScrollTop));
    }

    smoothScrollTo(target) {
        const targetY = Math.max(0, target);
        this.lastAutoScrollTime = Date.now();
        this.isProgrammaticScrolling = true;

        if (this.progScrollTimeout) clearTimeout(this.progScrollTimeout);
        this.progScrollTimeout = setTimeout(() => {
            this.isProgrammaticScrolling = false;
        }, 850);

        if (this.scrollAnimationId) {
            cancelAnimationFrame(this.scrollAnimationId);
            this.scrollAnimationId = null;
        }

        const win = this.pipWindow || window;
        const startY = win.scrollY || win.pageYOffset || 0;
        const distance = targetY - startY;

        if (Math.abs(distance) < 2) {
            win.scrollTo(0, targetY);
            return;
        }

        const duration = 750;
        const startTime = performance.now();

        const cubicBezier = (t) => {
            const p = 1 - t;
            return 1 - p * p * p;
        };

        const step = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(1, elapsed / duration);
            const ease = cubicBezier(progress);

            win.scrollTo(0, startY + distance * ease);

            if (progress < 1) {
                this.scrollAnimationId = requestAnimationFrame(step);
            } else {
                this.scrollAnimationId = null;
            }
        };

        this.scrollAnimationId = requestAnimationFrame(step);
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

        const hasLyrics = this.lyrics && this.lyrics.length > 0;
        const isPastTop = topMenu.getBoundingClientRect().bottom < 0;

        if (document.body.style.cursor !== 'none' && hasLyrics) {
            wrapper.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            wrapper.classList.add('opacity-100');
            wrapper.style.opacity = '1';
        }

        if (isPastTop && hasLyrics && !this.isLoadingLyrics) {
            if (this.floatingMenuTimeoutId) clearTimeout(this.floatingMenuTimeoutId);

            if (document.body.style.cursor !== 'none') {
                if (btnFloatingToggle.classList.contains('opacity-0') || btnFloatingToggle.classList.contains('hidden')) {
                    btnFloatingToggle.classList.remove('hidden');
                    void btnFloatingToggle.offsetWidth;
                    btnFloatingToggle.classList.remove('opacity-0', 'scale-95', 'w-0', 'border-0', 'px-0', 'mr-0');
                    btnFloatingToggle.classList.add('opacity-100', 'scale-100', 'w-10', 'mr-3');
                }
            }
        } else {
            btnFloatingToggle.classList.remove('opacity-100', 'scale-100', 'w-10', 'mr-3');
            btnFloatingToggle.classList.add('opacity-0', 'scale-95', 'w-0', 'border-0', 'px-0', 'mr-0');
            this.toggleFloatingMenu(false);

            if (this.floatingMenuTimeoutId) clearTimeout(this.floatingMenuTimeoutId);
            this.floatingMenuTimeoutId = setTimeout(() => {
                const currentRect = topMenu.getBoundingClientRect();
                if (currentRect.bottom >= 0 || !hasLyrics || this.isLoadingLyrics) {
                    btnFloatingToggle.classList.add('hidden');
                }
            }, 300);
        }
    }

    toggleFloatingMenu(show) {
        if (!this.floatingMenuContent) return;

        if (this.floatingDrawerTimeoutId) {
            clearTimeout(this.floatingDrawerTimeoutId);
            this.floatingDrawerTimeoutId = null;
        }

        if (show) {
            this.floatingMenuContent.classList.add('open');
            this.floatingMenuContent.classList.remove('closed');
            if (this.floatingMenusWrapper) {
                this.floatingMenusWrapper.classList.add('open');
                this.floatingMenusWrapper.classList.remove('closed');
            }
            if (this.floatingToggleIconMobile) this.floatingToggleIconMobile.classList.add('scale-y-[-1]');
            if (this.floatingToggleIconDesktop) this.floatingToggleIconDesktop.classList.add('scale-x-[-1]');

            if (this.trackinfoBox && localStorage.getItem('lysinc-trackinfo-active') === 'true') {
                if (this.trackinfoBoxDelayId) clearTimeout(this.trackinfoBoxDelayId);
                this.trackinfoBoxDelayId = setTimeout(() => {
                    this.trackinfoBox.classList.add('open');
                    this.trackinfoBox.classList.remove('closed');

                    setTimeout(() => {
                        if (this.trackinfoTitle) this.setupMarquee(this.trackinfoTitle);
                        if (this.trackinfoArtist) this.setupMarquee(this.trackinfoArtist);
                    }, 50);
                }, 150);
            }
            if (localStorage.getItem('lysinc-trackinfo-active') !== 'true') {
                this.floatingDrawerTimeoutId = setTimeout(() => {
                    this.toggleFloatingMenu(false);
                }, 4000);
            }
        } else {
            const trackInfoWasOpen = this.trackinfoBox && this.trackinfoBox.classList.contains('open');

            const closeTray = () => {
                this.floatingMenuContent.classList.remove('open');
                this.floatingMenuContent.classList.add('closed');
                if (this.floatingMenusWrapper) {
                    this.floatingMenusWrapper.classList.remove('open');
                    this.floatingMenusWrapper.classList.add('closed');
                }
                if (this.floatingToggleIconMobile) this.floatingToggleIconMobile.classList.remove('scale-y-[-1]');
                if (this.floatingToggleIconDesktop) this.floatingToggleIconDesktop.classList.remove('scale-x-[-1]');
            };

            if (trackInfoWasOpen) {
                if (this.trackinfoBoxDelayId) clearTimeout(this.trackinfoBoxDelayId);
                this.trackinfoBox.classList.remove('open');
                this.trackinfoBox.classList.add('closed');

                this.trackinfoBoxDelayId = setTimeout(() => {
                    closeTray();
                }, 150);
            } else {
                if (this.trackinfoBox) {
                    this.trackinfoBox.classList.remove('open');
                    this.trackinfoBox.classList.add('closed');
                }
                closeTray();
            }
        }
    }

    updatePlayPauseUI() {
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
    }

    showBalloon(element, text) {
        if (!element) return;
        const balloon = document.createElement('div');
        balloon.className = 'fixed z-[100] bg-zinc-800 text-white text-xs px-3 py-2 rounded-lg shadow-xl border border-white/10 pointer-events-none transition-opacity duration-200 opacity-0';
        balloon.textContent = text;
        document.body.appendChild(balloon);

        const rect = element.getBoundingClientRect();
        
        // Espera renderizar para pegar o tamanho
        requestAnimationFrame(() => {
            const balloonRect = balloon.getBoundingClientRect();
            let top = rect.top - balloonRect.height - 8;
            let left = rect.left + (rect.width / 2) - (balloonRect.width / 2);
            
            if (top < 10) top = rect.bottom + 8;
            if (left < 10) left = 10;
            if (left + balloonRect.width > window.innerWidth - 10) left = window.innerWidth - balloonRect.width - 10;
            
            balloon.style.top = `${top}px`;
            balloon.style.left = `${left}px`;
            balloon.style.opacity = '1';
            let timeoutId = setTimeout(() => {
                removeBalloon();
            }, 3000);

            const removeBalloon = () => {
                balloon.style.opacity = '0';
                setTimeout(() => balloon.remove(), 200);
                document.removeEventListener('click', outsideClickListener);
            };

            const outsideClickListener = (e) => {
                if (e.target !== element && !element.contains(e.target)) {
                    clearTimeout(timeoutId);
                    removeBalloon();
                }
            };

            setTimeout(() => {
                document.addEventListener('click', outsideClickListener);
            }, 100);
        });
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const isFontToast = message.startsWith('Tamanho da fonte:');
        let toast = null;

        if (isFontToast) {
            toast = document.getElementById('toast-font-size');
        }

        if (toast) {
            const textEl = toast.querySelector('.toast-message-text');
            if (textEl) textEl.textContent = message;

            clearTimeout(toast.removeTimeout);
            toast.removeTimeout = setTimeout(() => {
                if (toast.classList.contains('toast-hide')) return;
                toast.classList.add('toast-hide');
                setTimeout(() => toast.remove(), 300);
            }, 4000);
            return;
        }

        toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        if (isFontToast) toast.id = 'toast-font-size';

        const indicator = document.createElement('div');
        indicator.className = 'toast-type-indicator';
        toast.appendChild(indicator);

        const textContainer = document.createElement('div');
        textContainer.className = 'flex-1 text-sm font-medium mr-4 toast-message-text';
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

        toast.removeTimeout = setTimeout(removeToast, 4000);
    }

    showMetadataPopup(iconHtml, text) {
        const existing = document.getElementById('lysinc-metadata-popup');
        if (existing) existing.remove();

        const popupHtml = `
            <div id="lysinc-metadata-popup" class="fixed inset-0 z-[100] flex items-center justify-center p-6 opacity-0 transition-opacity duration-300">
                <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="document.getElementById('lysinc-metadata-popup').classList.add('opacity-0'); setTimeout(() => document.getElementById('lysinc-metadata-popup')?.remove(), 300)"></div>
                <div class="relative bg-[#1e1e1e] border border-white/10 rounded-[24px] shadow-2xl p-6 flex flex-col max-w-md w-full items-center text-center transform scale-95 transition-transform duration-300" id="lysinc-metadata-popup-content">
                    <button class="absolute top-4 right-4 text-white/50 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10" onclick="document.getElementById('lysinc-metadata-popup').classList.add('opacity-0'); setTimeout(() => document.getElementById('lysinc-metadata-popup')?.remove(), 300)">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                    ${iconHtml ? `
                    <div class="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-4 text-emerald-400">
                        ${iconHtml}
                    </div>` : ''}
                    <div class="text-white/90 text-base max-h-[60vh] overflow-y-auto w-full px-2 font-medium" style="word-break: break-word;">
                        ${text}
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', popupHtml);

        requestAnimationFrame(() => {
            const popup = document.getElementById('lysinc-metadata-popup');
            if (popup) {
                popup.classList.remove('opacity-0');
                const content = document.getElementById('lysinc-metadata-popup-content');
                if (content) {
                    content.classList.remove('scale-95');
                    content.classList.add('scale-100');
                }
            }
        });
    }

    // ==========================================
    // SPOTIFY DETAILS PAGES
    // ==========================================

    async openSpotifyDetails(type, id) {
        // Show the screen immediately with loading state
        this.showScreen('spotify-details');
        window.scrollTo(0, 0);

        if (this.detailsLoading) this.detailsLoading.classList.remove('hidden');
        if (this.detailsContent) {
            this.detailsContent.classList.add('hidden');
            this.detailsContent.innerHTML = '';
        }

        // Configure back button label
        const backLabels = { track: 'Voltar', album: 'Voltar', artist: 'Voltar' };
        if (this.detailsBackLabel) this.detailsBackLabel.textContent = backLabels[type] || 'Voltar';

        let html = '';
        try {
            if (type === 'track') {
                const data = await SpotifyService.getTrack(id);
                html = data ? this.renderTrackDetails(data) : this._detailsErrorHtml('Não foi possível carregar os dados da música.');
            } else if (type === 'album') {
                const data = await SpotifyService.getAlbum(id);
                html = data ? this.renderAlbumDetails(data) : this._detailsErrorHtml('Não foi possível carregar os dados do álbum.');
            } else if (type === 'artist') {
                const data = await SpotifyService.getArtist(id);
                html = data ? this.renderArtistDetails(data) : this._detailsErrorHtml('Não foi possível carregar os dados do artista.');
            }
        } catch (e) {
            html = this._detailsErrorHtml('Ocorreu um erro ao carregar as informações.');
        }

        if (this.detailsLoading) this.detailsLoading.classList.add('hidden');
        if (this.detailsContent) {
            this.detailsContent.innerHTML = html;
            this.detailsContent.classList.remove('hidden');

            // Animate popularity bars after render
            requestAnimationFrame(() => {
                const fills = this.detailsContent.querySelectorAll('.details-popularity-fill[data-pop]');
                fills.forEach(el => {
                    el.style.width = el.dataset.pop + '%';
                });
            });
        }
    }

    _detailsErrorHtml(msg) {
        return `<div class="flex flex-col items-center justify-center py-16 space-y-3 text-center px-4">
            <div class="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <p class="text-white/50 text-sm">${msg}</p>
        </div>`;
    }

    _formatMs(ms) {
        if (!ms) return '—';
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    _formatFollowers(n) {
        if (!n) return '—';
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
        if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
        return n.toLocaleString('pt-BR');
    }

    renderTrackDetails(track) {
        const artUrl = track.album?.images?.[0]?.url || '';
        const artists = track.artists?.map(a => a.name).join(', ') || '—';
        const year = track.album?.releaseDate?.substring(0, 4) || '—';
        const duration = this._formatMs(track.durationMs);
        const popPct = track.popularity || 0;
        const embedUrl = `https://open.spotify.com/embed/track/${track.id}?utm_source=generator&theme=0`;

        return `
        <div class="details-hero">
            <div class="details-hero-bg" style="background-image:url('${artUrl}')"></div>
            <img class="details-hero-art" src="${artUrl}" alt="Capa">
            <div class="details-hero-info">
                <span class="details-hero-type">Música</span>
                <h1 class="details-hero-title">${this._esc(track.name)}</h1>
                <p class="details-hero-subtitle">${this._esc(artists)}</p>
                <div class="details-hero-meta">
                    <span>${this._esc(track.album?.name || '—')}</span>
                    <span>•</span>
                    <span>${year}</span>
                    <span>•</span>
                    <span>${duration}</span>
                    ${track.explicit ? '<span>•</span><span>🅴 Explícita</span>' : ''}
                </div>
                <a class="details-open-btn" href="${track.externalUrl || '#'}" target="_blank" rel="noopener">
                    <svg width="14" height="14" viewBox="0 0 352 352" fill="currentColor"><path d="M279.84 156.64C223.52 123.2 129.36 119.68 75.68 136.4C66.88 139.04 58.08 133.76 55.44 125.84C52.8 117.04 58.08 108.24 66 105.6C128.48 87.12 231.44 90.64 296.56 129.36C304.48 133.76 307.12 144.32 302.72 152.24C298.32 158.4 287.76 161.04 279.84 156.64ZM278.08 205.92C273.68 212.08 265.76 214.72 259.6 210.32C212.08 181.28 139.92 172.48 84.48 190.08C77.44 191.84 69.52 188.32 67.76 181.28C66 174.24 69.52 166.32 76.56 164.56C140.8 145.2 220 154.88 274.56 188.32C279.84 190.96 282.48 199.76 278.08 205.92ZM256.96 254.32C253.44 259.6 247.28 261.36 242 257.84C200.64 232.32 148.72 227.04 87.12 241.12C80.96 242.88 75.68 238.48 73.92 233.2C72.16 227.04 76.56 221.76 81.84 220C148.72 205.04 206.8 211.2 252.56 239.36C258.72 242 259.6 249.04 256.96 254.32ZM176 0C78.8 0 0 78.8 0 176C0 273.2 78.8 352 176 352C273.2 352 352 273.2 352 176C352 78.8 273.2 0 176 0Z"/></svg>
                    Abrir no Spotify
                </a>
            </div>
        </div>

        <div class="details-embed-container">
            <iframe src="${embedUrl}" height="152" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
        </div>

        <div class="flex flex-col space-y-2">
            <p class="details-section-header">Detalhes da Faixa</p>
            <div class="details-meta-pills">
                ${track.album?.name ? `<span class="details-meta-pill">💿 ${this._esc(track.album.name)}</span>` : ''}
                ${year !== '—' ? `<span class="details-meta-pill">📅 ${year}</span>` : ''}
                ${track.album?.totalTracks ? `<span class="details-meta-pill">🎵 ${track.album.totalTracks} faixas no álbum</span>` : ''}
                ${track.isrc ? `<span class="details-meta-pill">🔑 ISRC: ${this._esc(track.isrc)}</span>` : ''}
            </div>
        </div>

        <div class="flex flex-col space-y-2">
            <p class="details-section-header">Popularidade</p>
            <div class="flex items-center gap-3">
                <div class="details-popularity-bar flex-1">
                    <div class="details-popularity-fill" style="width:0%" data-pop="${popPct}"></div>
                </div>
                <span class="text-xs text-white/40 font-mono w-8">${popPct}</span>
            </div>
        </div>

        <div class="flex flex-col space-y-2">
            <p class="details-section-header">Artistas</p>
            <div class="details-meta-pills">
                ${(track.artists || []).map(a => `<span class="details-meta-pill cursor-pointer hover:bg-white/10 transition-colors" onclick="window.app.openSpotifyDetails('artist','${a.id}')">🎤 ${this._esc(a.name)}</span>`).join('')}
            </div>
        </div>

        <div class="flex flex-col space-y-2">
            <p class="details-section-header">Álbum</p>
            ${track.album ? `<div class="details-meta-pill w-fit cursor-pointer hover:bg-white/10 transition-colors" onclick="window.app.openSpotifyDetails('album','${track.album.id}')">💿 ${this._esc(track.album.name)}</div>` : ''}
        </div>
        `;
    }

    renderAlbumDetails(album) {
        const artUrl = album.images?.[0]?.url || '';
        const artists = album.artists?.map(a => a.name).join(', ') || '—';
        const year = album.releaseDate?.substring(0, 4) || '—';
        const typeLabel = { album: 'Álbum', single: 'Single', compilation: 'Compilação' }[album.type] || 'Álbum';
        const popPct = album.popularity || 0;
        const embedUrl = `https://open.spotify.com/embed/album/${album.id}?utm_source=generator&theme=0`;
        const currentTrackId = this.currentTrackState?.trackId;

        const trackListHtml = (album.tracks || []).map(t => {
            const isCurrent = t.id === currentTrackId;
            return `<div class="details-track-item${isCurrent ? ' is-current' : ''}">
                <span class="details-track-number">${t.trackNumber}</span>
                <div class="flex flex-col flex-1 min-w-0">
                    <span class="details-track-name">${this._esc(t.name)}${t.explicit ? ' <span class="text-[10px] text-white/30">🅴</span>' : ''}</span>
                    ${t.artists && t.artists !== artists ? `<span class="text-[11px] text-white/30 truncate">${this._esc(t.artists)}</span>` : ''}
                </div>
                <span class="details-track-duration">${this._formatMs(t.durationMs)}</span>
            </div>`;
        }).join('');

        const genresHtml = album.genres?.length
            ? album.genres.map(g => `<span class="details-genre-pill">${this._esc(g)}</span>`).join('')
            : '';

        const copyHtml = (album.copyrights || [])
            .filter((c, i, arr) => arr.findIndex(x => x.text === c.text) === i)
            .map(c => `<span class="text-[11px] text-white/25">${this._esc(c.text)}</span>`)
            .join('');

        return `
        <div class="details-hero">
            <div class="details-hero-bg" style="background-image:url('${artUrl}')"></div>
            <img class="details-hero-art" src="${artUrl}" alt="Capa">
            <div class="details-hero-info">
                <span class="details-hero-type">${typeLabel}</span>
                <h1 class="details-hero-title">${this._esc(album.name)}</h1>
                <p class="details-hero-subtitle">${this._esc(artists)}</p>
                <div class="details-hero-meta">
                    <span>${year}</span>
                    <span>•</span>
                    <span>${album.totalTracks} faixas</span>
                    ${album.label ? `<span>•</span><span>${this._esc(album.label)}</span>` : ''}
                </div>
                <a class="details-open-btn" href="${album.externalUrl || '#'}" target="_blank" rel="noopener">
                    <svg width="14" height="14" viewBox="0 0 352 352" fill="currentColor"><path d="M279.84 156.64C223.52 123.2 129.36 119.68 75.68 136.4C66.88 139.04 58.08 133.76 55.44 125.84C52.8 117.04 58.08 108.24 66 105.6C128.48 87.12 231.44 90.64 296.56 129.36C304.48 133.76 307.12 144.32 302.72 152.24C298.32 158.4 287.76 161.04 279.84 156.64ZM278.08 205.92C273.68 212.08 265.76 214.72 259.6 210.32C212.08 181.28 139.92 172.48 84.48 190.08C77.44 191.84 69.52 188.32 67.76 181.28C66 174.24 69.52 166.32 76.56 164.56C140.8 145.2 220 154.88 274.56 188.32C279.84 190.96 282.48 199.76 278.08 205.92ZM256.96 254.32C253.44 259.6 247.28 261.36 242 257.84C200.64 232.32 148.72 227.04 87.12 241.12C80.96 242.88 75.68 238.48 73.92 233.2C72.16 227.04 76.56 221.76 81.84 220C148.72 205.04 206.8 211.2 252.56 239.36C258.72 242 259.6 249.04 256.96 254.32ZM176 0C78.8 0 0 78.8 0 176C0 273.2 78.8 352 176 352C273.2 352 352 273.2 352 176C352 78.8 273.2 0 176 0Z"/></svg>
                    Abrir no Spotify
                </a>
            </div>
        </div>

        <div class="details-embed-container">
            <iframe src="${embedUrl}" height="352" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
        </div>

        ${genresHtml ? `<div class="flex flex-col space-y-2"><p class="details-section-header">Gêneros</p><div class="flex flex-wrap gap-2">${genresHtml}</div></div>` : ''}

        <div class="flex flex-col space-y-2">
            <p class="details-section-header">Popularidade</p>
            <div class="flex items-center gap-3">
                <div class="details-popularity-bar flex-1">
                    <div class="details-popularity-fill" style="width:0%" data-pop="${popPct}"></div>
                </div>
                <span class="text-xs text-white/40 font-mono w-8">${popPct}</span>
            </div>
        </div>

        <div class="flex flex-col space-y-2">
            <p class="details-section-header">Artistas</p>
            <div class="details-meta-pills">
                ${(album.artists || []).map(a => `<span class="details-meta-pill cursor-pointer hover:bg-white/10 transition-colors" onclick="window.app.openSpotifyDetails('artist','${a.id}')">🎤 ${this._esc(a.name)}</span>`).join('')}
            </div>
        </div>

        ${trackListHtml ? `<div class="flex flex-col space-y-1"><p class="details-section-header">Faixas</p><div class="details-tracklist">${trackListHtml}</div></div>` : ''}

        ${copyHtml ? `<div class="flex flex-col gap-1 pt-2">${copyHtml}</div>` : ''}
        `;
    }

    renderArtistDetails(artist) {
        const artUrl = artist.images?.[0]?.url || artist.images?.[1]?.url || '';
        const followers = this._formatFollowers(artist.followers);
        const popPct = artist.popularity || 0;
        const embedUrl = `https://open.spotify.com/embed/artist/${artist.id}?utm_source=generator&theme=0`;

        const genresHtml = (artist.genres || []).slice(0, 6)
            .map(g => `<span class="details-genre-pill">${this._esc(g)}</span>`)
            .join('');

        const topTracksHtml = (artist.topTracks || []).map((t, i) => `
            <div class="details-top-track">
                ${t.albumArt ? `<img class="details-top-track-art" src="${t.albumArt}" alt="">` : `<div class="details-top-track-art bg-white/5 rounded"></div>`}
                <div class="flex flex-col flex-1 min-w-0">
                    <span class="details-track-name">${this._esc(t.name)}</span>
                    ${t.explicit ? '<span class="text-[10px] text-white/30">🅴 Explícita</span>' : ''}
                </div>
                <span class="details-track-duration">${this._formatMs(t.durationMs)}</span>
            </div>`).join('');

        return `
        <div class="details-hero">
            <div class="details-hero-bg" style="background-image:url('${artUrl}')"></div>
            ${artUrl ? `<img class="details-hero-art is-artist" src="${artUrl}" alt="${this._esc(artist.name)}">` : ''}
            <div class="details-hero-info">
                <span class="details-hero-type">Artista</span>
                <h1 class="details-hero-title">${this._esc(artist.name)}</h1>
                <div class="details-hero-meta">
                    <span>👥 ${followers} seguidores</span>
                </div>
                <a class="details-open-btn" href="${artist.externalUrl || '#'}" target="_blank" rel="noopener">
                    <svg width="14" height="14" viewBox="0 0 352 352" fill="currentColor"><path d="M279.84 156.64C223.52 123.2 129.36 119.68 75.68 136.4C66.88 139.04 58.08 133.76 55.44 125.84C52.8 117.04 58.08 108.24 66 105.6C128.48 87.12 231.44 90.64 296.56 129.36C304.48 133.76 307.12 144.32 302.72 152.24C298.32 158.4 287.76 161.04 279.84 156.64ZM278.08 205.92C273.68 212.08 265.76 214.72 259.6 210.32C212.08 181.28 139.92 172.48 84.48 190.08C77.44 191.84 69.52 188.32 67.76 181.28C66 174.24 69.52 166.32 76.56 164.56C140.8 145.2 220 154.88 274.56 188.32C279.84 190.96 282.48 199.76 278.08 205.92ZM256.96 254.32C253.44 259.6 247.28 261.36 242 257.84C200.64 232.32 148.72 227.04 87.12 241.12C80.96 242.88 75.68 238.48 73.92 233.2C72.16 227.04 76.56 221.76 81.84 220C148.72 205.04 206.8 211.2 252.56 239.36C258.72 242 259.6 249.04 256.96 254.32ZM176 0C78.8 0 0 78.8 0 176C0 273.2 78.8 352 176 352C273.2 352 352 273.2 352 176C352 78.8 273.2 0 176 0Z"/></svg>
                    Abrir no Spotify
                </a>
            </div>
        </div>

        <div class="details-embed-container">
            <iframe src="${embedUrl}" height="352" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
        </div>

        ${genresHtml ? `<div class="flex flex-col space-y-2"><p class="details-section-header">Gêneros</p><div class="flex flex-wrap gap-2">${genresHtml}</div></div>` : ''}

        <div class="flex flex-col space-y-2">
            <p class="details-section-header">Popularidade</p>
            <div class="flex items-center gap-3">
                <div class="details-popularity-bar flex-1">
                    <div class="details-popularity-fill" style="width:0%" data-pop="${popPct}"></div>
                </div>
                <span class="text-xs text-white/40 font-mono w-8">${popPct}</span>
            </div>
        </div>

        ${topTracksHtml ? `<div class="flex flex-col space-y-1"><p class="details-section-header">Top Faixas</p><div class="flex flex-col gap-0.5">${topTracksHtml}</div></div>` : ''}
        `;
    }

    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new LySincApp();
    });
} else {
    window.app = new LySincApp();
}
