import Config from './config.js';

/**
 * LySinc - Serviço da API do Spotify (OAuth 2.0 PKCE)
 */
const SpotifyService = {
    // Chaves de armazenamento no localStorage
    ACCESS_TOKEN_KEY: 'lysinc_spotify_access_token',
    REFRESH_TOKEN_KEY: 'lysinc_spotify_refresh_token',
    EXPIRES_AT_KEY: 'lysinc_spotify_expires_at',

    // Auxiliar: Gera string aleatória para o PKCE
    generateRandomString(length) {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        const values = crypto.getRandomValues(new Uint8Array(length));
        return Array.from(values).map((x) => possible[x % possible.length]).join('');
    },

    // Auxiliar: Codifica o buffer em Base64URL
    sha256(plain) {
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        return crypto.subtle.digest('SHA-256', data);
    },

    base64urlencode(a) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(a)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    },

    // Inicia o fluxo de login redirecionando para o Spotify
    async login() {
        const clientId = Config.getClientId();
        if (!clientId) {
            window.showToast('Por favor, configure o Spotify Client ID antes de conectar.', 'error');
            return;
        }

        const codeVerifier = this.generateRandomString(64);
        window.sessionStorage.setItem('spotify_code_verifier', codeVerifier);

        const hashed = await this.sha256(codeVerifier);
        const codeChallenge = this.base64urlencode(hashed);

        const params = new URLSearchParams({
            client_id: clientId,
            response_type: 'code',
            redirect_uri: Config.getRedirectUri(),
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            scope: Config.SPOTIFY_SCOPES
        });

        window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
    },

    // Executado no carregamento da página para verificar se há código de callback ou tokens salvos
    async handleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        
        if (code) {
            const codeVerifier = window.sessionStorage.getItem('spotify_code_verifier');
            if (codeVerifier) {
                try {
                    await this.fetchToken(code, codeVerifier);
                    // Limpa os parâmetros da URL de forma elegante
                    const cleanUrl = Config.getRedirectUri();
                    window.history.replaceState({}, document.title, cleanUrl);
                    return true;
                } catch (error) {
                    console.error('Erro ao autenticar com o Spotify:', error);
                    window.showToast('Falha na autenticação com o Spotify. Verifique se o seu Client ID e Redirect URI estão corretos.', 'error');
                }
            }
        }
        return this.isAuthenticated();
    },

    // Obtém tokens iniciais através do Authorization Code
    async fetchToken(code, codeVerifier) {
        const clientId = Config.getClientId();
        const redirectUri = Config.getRedirectUri();

        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
            }),
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error_description || 'Erro ao obter token');
        }

        const data = await response.json();
        this.saveTokens(data);
    },

    // Renova o token de acesso usando o refresh token
    async refreshToken() {
        const clientId = Config.getClientId();
        const refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);

        if (!refreshToken) {
            this.logout();
            return false;
        }

        try {
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: clientId,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                }),
            });

            if (!response.ok) {
                // Se falhar a renovação (ex: revogado), limpa as chaves silenciosamente
                this.clearTokens();
                return false;
            }

            const data = await response.json();
            this.saveTokens(data);
            return true;
        } catch (error) {
            console.error('Erro ao renovar token:', error);
            return false;
        }
    },

    // Salva as credenciais no localStorage
    saveTokens(data) {
        localStorage.setItem(this.ACCESS_TOKEN_KEY, data.access_token);
        if (data.refresh_token) {
            localStorage.setItem(this.REFRESH_TOKEN_KEY, data.refresh_token);
        }
        const expiresAt = Date.now() + (data.expires_in * 1000);
        localStorage.setItem(this.EXPIRES_AT_KEY, expiresAt.toString());
    },

    // Limpa os tokens do localStorage sem forçar reload imediato
    clearTokens() {
        localStorage.removeItem(this.ACCESS_TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
        localStorage.removeItem(this.EXPIRES_AT_KEY);
    },

    // Desconecta o usuário limpando as chaves e recarregando a página
    logout() {
        this.clearTokens();
        window.location.reload();
    },

    // Verifica se o usuário está autenticado e o token está válido (ou tenta renovar)
    async isAuthenticated() {
        const accessToken = localStorage.getItem(this.ACCESS_TOKEN_KEY);
        const expiresAt = localStorage.getItem(this.EXPIRES_AT_KEY);
        const refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);

        // Se não houver token de acesso ou expiração, mas houver refresh_token, tenta renovação silenciosa
        if ((!accessToken || !expiresAt) && refreshToken) {
            console.log('Token de acesso expirado/ausente. Tentando renovação silenciosa com refresh_token...');
            return await this.refreshToken();
        }

        if (!accessToken || !expiresAt) {
            return false;
        }

        // Se o token expira em menos de 1 minuto, renova
        if (Date.now() > (parseInt(expiresAt) - 60000)) {
            console.log('Token expirando em breve. Renovando...');
            return await this.refreshToken();
        }

        return true;
    },

    // Obtém o token de acesso atual de forma segura
    async getValidToken() {
        const authenticated = await this.isAuthenticated();
        if (!authenticated) {
            return null;
        }
        return localStorage.getItem(this.ACCESS_TOKEN_KEY);
    },

    // Consulta o estado do player de reprodução atual no Spotify
    async getCurrentlyPlaying() {
        const token = await this.getValidToken();
        if (!token) return null;

        try {
            const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 204) {
                // Nada tocando
                return { isPlaying: false, isEmpty: true };
            }

            if (response.status === 401) {
                // Token expirado/inválido de repente
                const renewed = await this.refreshToken();
                if (renewed) return this.getCurrentlyPlaying();
                return null;
            }

            if (!response.ok) {
                throw new Error('Falha na resposta do Spotify');
            }

            const data = await response.json();
            return {
                isPlaying: data.is_playing,
                isEmpty: false,
                progressMs: data.progress_ms,
                timestamp: data.timestamp, // timestamp da medição do Spotify
                trackId: data.item?.id,
                trackName: data.item?.name,
                artists: data.item?.artists.map(a => a.name).join(', '),
                albumName: data.item?.album?.name,
                albumArtUrl: data.item?.album?.images[0]?.url || '',
                durationMs: data.item?.duration_ms
            };
        } catch (error) {
            console.error('Erro ao buscar atualmente tocando:', error);
            return null;
        }
    }
};

export default SpotifyService;
