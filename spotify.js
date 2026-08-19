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
        let clientId = Config.getClientId();
        if (!clientId) {
            clientId = Config.getSystemClientId();
            if (!clientId) {
                window.showToast('Por favor, configure o Spotify Client ID antes de conectar.', 'error');
                return;
            }
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
        if (urlParams.get('error')) {
            const errorMsg = urlParams.get('error');
            console.error('Erro retornado pelo Spotify:', errorMsg);
            if (errorMsg === 'access_denied') {
                window.showToast('Acesso negado pelo Spotify. Verifique se o seu e-mail está cadastrado no painel de desenvolvedores.', 'error');
            } else {
                window.showToast(`Erro do Spotify: ${errorMsg}`, 'error');
            }
            Config.setClientId(''); // Clear the client ID since it's invalid or user denied
            const cleanUrl = Config.getRedirectUri();
            window.history.replaceState({}, document.title, cleanUrl);
            return false;
        }

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
                    Config.setClientId('');
                }
            }
        }
        return this.isAuthenticated();
    },

    // Obtém tokens iniciais através do Authorization Code
    async fetchToken(code, codeVerifier) {
        let clientId = Config.getClientId();
        if (!clientId) clientId = Config.getSystemClientId();
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
        let clientId = Config.getClientId();
        if (!clientId) clientId = Config.getSystemClientId();
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
        localStorage.removeItem('lysinc_accepted_privacy');
        localStorage.removeItem('lysinc_accepted_client_id_terms');
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
            const requestTime = Date.now();
            let response = await fetch('https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 204) {
                // Tenta fallback no endpoint do player completo caso o /currently-playing não responda
                try {
                    response = await fetch('https://api.spotify.com/v1/me/player?additional_types=track,episode', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                } catch (e) { }
            }

            if (response.status === 204) {
                // Nada tocando
                return { isPlaying: false, isEmpty: true };
            }

            if (response.status === 403) {
                let errorMsg = '';
                try {
                    const errData = await response.json();
                    if (errData.error && errData.error.message) {
                        errorMsg = errData.error.message;
                    }
                } catch (e) { }

                let finalMsg = '';
                if (this.currentUserProfile && this.currentUserProfile.product !== 'premium') {
                    finalMsg = 'Sua conta do Spotify é Gratuita (Free). O Spotify exige uma assinatura Premium para que o LySinc acesse a reprodução atual.';
                } else if (Config.getClientId() !== Config.getSystemClientId()) {
                    finalMsg = 'Você não adicionou o seu e-mail do Spotify na aba "User Management" do seu Client ID no painel de desenvolvedor. Isso é obrigatório para contas Premium.';
                } else {
                    finalMsg = 'Sua conta não tem autorização ou o Client ID está em Development Mode e você não está na lista branca.';
                }

                console.warn('[LySinc] Spotify API 403 Forbidden:', finalMsg);
                return { isForbidden: true, errorReason: finalMsg };
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
                requestTime: requestTime,
                trackId: data.item?.id,
                trackName: data.item?.name,
                artists: data.item?.artists?.map(a => a.name).join(', ') || '',
                artistsRaw: data.item?.artists?.map(a => ({ id: a.id, name: a.name })) || [],
                albumName: data.item?.album?.name,
                albumId: data.item?.album?.id || null,
                albumArtUrl: data.item?.album?.images?.[0]?.url || '',
                releaseDate: data.item?.album?.release_date ? data.item.album.release_date.substring(0, 4) : null,
                durationMs: data.item?.duration_ms,
                isrc: data.item?.external_ids?.isrc,
                explicit: data.item?.explicit
            };
        } catch (error) {
            console.error('Erro ao buscar atualmente tocando:', error);
            return null;
        }
    },

    // Pula para a próxima música manualmente
    async nextTrack() {
        const token = await this.getValidToken();
        if (!token) return;
        try {
            await fetch('https://api.spotify.com/v1/me/player/next', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (error) {
            console.error('Erro ao avançar música:', error);
        }
    },

    // Volta para a música anterior manualmente
    async previousTrack() {
        const token = await this.getValidToken();
        if (!token) return;
        try {
            await fetch('https://api.spotify.com/v1/me/player/previous', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (error) {
            console.error('Erro ao voltar música:', error);
        }
    },

    // Inicia a reprodução
    async playTrack() {
        const token = await this.getValidToken();
        if (!token) return;
        try {
            await fetch('https://api.spotify.com/v1/me/player/play', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (error) {
            console.error('Erro ao dar play:', error);
        }
    },

    // Pausa a reprodução
    async pauseTrack() {
        const token = await this.getValidToken();
        if (!token) return;
        try {
            await fetch('https://api.spotify.com/v1/me/player/pause', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (error) {
            console.error('Erro ao pausar:', error);
        }
    },

    // Busca as imagens de perfil para uma lista de IDs de artistas
    async getArtistsImages(artistIds) {
        if (!artistIds || artistIds.length === 0) return {};
        const token = await this.getValidToken();
        if (!token) return {};

        try {
            const idsStr = artistIds.join(',');
            const response = await fetch(`https://api.spotify.com/v1/artists?ids=${idsStr}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) return {};
            const data = await response.json();

            const imageMap = {};
            if (data.artists) {
                data.artists.forEach(artist => {
                    if (artist && artist.images && artist.images.length > 0) {
                        // Pega a menor imagem para otimizar o carregamento do balão
                        imageMap[artist.id] = artist.images[artist.images.length - 1].url;
                    }
                });
            }
            return imageMap;
        } catch (error) {
            console.error('Erro ao buscar imagens dos artistas:', error);
            return {};
        }
    },

    // Busca dados do perfil do usuário logado no Spotify (Nome, Usuário, Email, Avatar)
    async getUserProfile() {
        const token = await this.getValidToken();
        if (!token) return null;

        try {
            const response = await fetch('https://api.spotify.com/v1/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) return null;
            const data = await response.json();
            const profile = {
                id: data.id,
                display_name: data.display_name || data.id,
                email: data.email || null,
                images: data.images || [],
                product: data.product
            };
            this.currentUserProfile = profile;
            return profile;
        } catch (error) {
            console.error('[LySinc 2.0] Erro ao buscar perfil do Spotify:', error);
            return null;
        }
    },

    // Auxiliar: Sanitiza e extrai ID limpo do Spotify
    _cleanId(id) {
        if (!id || typeof id !== 'string') return '';
        return id.replace(/^spotify:(track|album|artist):/, '').trim();
    },

    // Busca dados completos de uma faixa pelo ID ou Nome
    async getTrack(trackId) {
        const token = await this.getValidToken();
        if (!token || !trackId) return null;
        const cleanId = this._cleanId(trackId);

        try {
            let data = null;
            if (cleanId) {
                try {
                    const response = await fetch(`https://api.spotify.com/v1/tracks/${cleanId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (response.ok) data = await response.json();
                } catch (e) { }
            }
            if (!data) {
                try {
                    const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(trackId)}&type=track&limit=1`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (searchRes.ok) {
                        const searchData = await searchRes.json();
                        data = searchData.tracks?.items?.[0] || null;
                    }
                } catch (e) { }
            }
            if (!data) return null;
            const result = {
                id: data.id,
                name: data.name,
                artists: data.artists?.map(a => ({ id: a.id, name: a.name })) || [],
                album: {
                    id: data.album?.id,
                    name: data.album?.name,
                    releaseDate: data.album?.release_date,
                    totalTracks: data.album?.total_tracks,
                    type: data.album?.album_type,
                    images: data.album?.images || []
                },
                durationMs: data.duration_ms,
                explicit: data.explicit,
                popularity: data.popularity !== undefined ? Number(data.popularity) : 0,
                isrc: data.external_ids?.isrc,
                previewUrl: data.preview_url,
                externalUrl: data.external_urls?.spotify,
                copyrights: []
            };

            // Tenta buscar o album completo para obter os copyrights
            if (data.album?.id) {
                try {
                    const albumRes = await fetch(`https://api.spotify.com/v1/albums/${data.album.id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (albumRes.ok) {
                        const albumData = await albumRes.json();
                        result.copyrights = albumData.copyrights || [];
                    }
                } catch (e) { }
            }
            return result;
        } catch (e) {
            return null;
        }
    },

    // Busca dados completos de um álbum pelo ID ou Nome
    async getAlbum(albumId) {
        const token = await this.getValidToken();
        if (!token || !albumId) return null;
        const cleanId = this._cleanId(albumId);

        try {
            let data = null;
            if (cleanId) {
                try {
                    const response = await fetch(`https://api.spotify.com/v1/albums/${cleanId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (response.ok) data = await response.json();
                } catch (e) { }
            }
            if (!data) {
                try {
                    const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(albumId)}&type=album&limit=1`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (searchRes.ok) {
                        const searchData = await searchRes.json();
                        data = searchData.albums?.items?.[0] || null;
                    }
                } catch (e) { }
            }
            if (!data) return null;
            return {
                id: data.id,
                name: data.name,
                artists: data.artists?.map(a => ({ id: a.id, name: a.name })) || [],
                releaseDate: data.release_date,
                totalTracks: data.total_tracks,
                type: data.album_type,
                label: data.label,
                popularity: data.popularity !== undefined ? Number(data.popularity) : 0,
                copyrights: data.copyrights || [],
                genres: data.genres || [],
                images: data.images || [],
                tracks: data.tracks?.items?.map(t => ({
                    id: t.id,
                    name: t.name,
                    trackNumber: t.track_number,
                    durationMs: t.duration_ms,
                    explicit: t.explicit,
                    artists: t.artists?.map(a => a.name).join(', ')
                })) || [],
                externalUrl: data.external_urls?.spotify
            };
        } catch (e) {
            return null;
        }
    },

    // Busca dados completos de um artista pelo ID ou Nome
    async getArtist(artistId) {
        const token = await this.getValidToken();
        if (!token || !artistId) return null;
        const cleanId = this._cleanId(artistId);

        try {
            let artist = null;

            // 1. Tenta buscar diretamente pelo ID do Spotify
            if (cleanId) {
                try {
                    const artistRes = await fetch(`https://api.spotify.com/v1/artists/${cleanId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (artistRes.ok) {
                        artist = await artistRes.json();
                    }
                } catch (e) { }
            }

            // 2. Se a busca por ID falhar (ou retornar vazio), tenta via Search API
            if (!artist) {
                try {
                    const searchArtistRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artistId)}&type=artist&limit=1`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (searchArtistRes.ok) {
                        const searchData = await searchArtistRes.json();
                        artist = searchData.artists?.items?.[0] || null;
                    }
                } catch (e) { }
            }

            // Se ainda não tiver artista (API oficial bloqueada com 429, etc), cria um objeto básico para tentar via Pathfinder
            if (!artist && cleanId) {
                artist = { id: cleanId, name: 'Carregando...', followers: { total: 0 }, popularity: 0 };
            } else if (!artist) {
                return null;
            }

            // 3. Fallback de Segurança: Se a API retornou o artista mas omitiu seguidores/popularidade (anomalia de token), busca pelo nome pra preencher
            let followersCount = artist.followers?.total !== undefined ? Number(artist.followers.total) : (Number(artist.followers) || 0);
            let popularityVal = artist.popularity !== undefined ? Number(artist.popularity) : 0;

            if ((followersCount === 0 || popularityVal === 0) && artist.name && artist.name !== 'Carregando...') {
                try {
                    const fallbackRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent('"' + artist.name + '"')}&type=artist&limit=1`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (fallbackRes.ok) {
                        const fallbackData = await fallbackRes.json();
                        const found = fallbackData.artists?.items?.[0];
                        if (found) {
                            if (followersCount === 0) {
                                followersCount = found.followers?.total !== undefined ? Number(found.followers.total) : (Number(found.followers) || 0);
                            }
                            if (popularityVal === 0) {
                                popularityVal = found.popularity !== undefined ? Number(found.popularity) : 0;
                            }
                        }
                    }
                } catch (e) { }
            }

            if (isNaN(followersCount)) followersCount = 0;
            if (isNaN(popularityVal)) popularityVal = 0;

            let topTracks = [];
            let albums = [];

            const SPOTIFY_PROXY = 'https://lysinc-spotify-scraper.disoliveira-dso.workers.dev/spotify/pathfinder/';
            try {
                const operationName = 'queryArtistOverview';
                const sha256Hash = 'ae0e2958a4ab645b35ca19ac04d0495ae12d9c5d7b7286217674801a9aab281a';
                const variables = JSON.stringify({ "uri": `spotify:artist:${artist.id}`, "locale": "", "includePrerelease": false });
                const extensions = JSON.stringify({ "persistedQuery": { "version": 1, "sha256Hash": sha256Hash } });

                const params = new URLSearchParams({
                    operationName: operationName,
                    variables: variables,
                    extensions: extensions
                });

                const pfRes = await fetch(`${SPOTIFY_PROXY}?${params.toString()}`);
                if (pfRes.ok) {
                    const pfData = await pfRes.json();
                    const overview = pfData.data?.artistUnion;
                    if (overview && overview.profile) {
                        if (artist.name === 'Carregando...') {
                            artist.name = overview.profile.name || artist.name;
                        }
                        artist.biography = overview.profile?.biography?.text || '';
                        artist.worldRank = overview.stats?.worldRank || 0;
                        artist.monthlyListeners = overview.stats?.monthlyListeners || 0;

                        if (overview.visuals?.avatarImage?.sources?.length > 0) {
                            if (!artist.images || artist.images.length === 0) {
                                artist.images = [{ url: overview.visuals.avatarImage.sources[0].url }];
                            }
                        }

                        if (artist.biography && !artist.biography.includes('Tradução') && /[a-zA-Z]/.test(artist.biography)) {
                            try {
                                const trRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t&q=${encodeURIComponent(artist.biography)}`);
                                if (trRes.ok) {
                                    const trData = await trRes.json();
                                    let translatedText = '';
                                    if (trData && trData[0]) {
                                        trData[0].forEach(part => {
                                            if (part[0]) translatedText += part[0];
                                        });
                                    }
                                    if (translatedText) artist.biography = translatedText;
                                }
                            } catch (e) { }
                        }

                        if (overview.discography) {
                            const disco = overview.discography;

                            if (disco.topTracks && disco.topTracks.items) {
                                const trackIds = [];
                                topTracks = disco.topTracks.items.map(item => {
                                    const t = item.track || {};
                                    const id = t.id || t.uri?.split(':').pop();
                                    if (id) trackIds.push(id);
                                    const images = t.albumOfTrack?.coverArt?.sources || [];
                                    return {
                                        id: id,
                                        name: t.name || '',
                                        albumArt: images[0]?.url || images[1]?.url || images[2]?.url || '', 
                                        durationMs: t.duration?.totalMilliseconds || 0,
                                        explicit: t.contentRating?.label === 'EXPLICIT'
                                    };
                                }).slice(0, 10);
                            }

                            const parseReleases = (nodeList, type) => {
                                if (!nodeList || !nodeList.items) return [];
                                return nodeList.items.map(group => {
                                    const rel = group.releases?.items?.[0];
                                    if (!rel) return null;
                                    const images = rel.coverArt?.sources || [];
                                    return {
                                        id: rel.id || rel.uri?.split(':').pop(),
                                        name: rel.name || '',
                                        art: images[0]?.url || images[1]?.url || images[2]?.url || '',
                                        releaseDate: rel.date?.year ? rel.date.year.toString() : '',
                                        type: type
                                    };
                                }).filter(Boolean);
                            };

                            albums = [...parseReleases(disco.albums, 'album'), ...parseReleases(disco.singles, 'single')];
                        }
                    }
                }
            } catch (e) { }

            // Último recurso: MusicBrainz para pegar pelo menos o nome, caso Pathfinder falhe ou não retorne nome
            if (artist.name === 'Carregando...') {
                try {
                    const mbRes = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${artist.id}&fmt=json`, {
                        headers: { 'User-Agent': 'LySinc/1.0' }
                    });
                    if (mbRes.ok) {
                        const mbData = await mbRes.json();
                        const mbArtist = mbData.artists?.[0];
                        if (mbArtist) {
                            artist.name = mbArtist.name;
                        }
                    }
                } catch (e) { }
            }

            return {
                id: artist.id,
                name: artist.name !== 'Carregando...' ? artist.name : 'Artista Desconhecido',
                followers: followersCount,
                popularity: popularityVal,
                genres: artist.genres || [],
                images: artist.images || [],
                externalUrl: artist.external_urls?.spotify || '',
                topTracks: topTracks,
                albums: albums,
                biography: artist.biography || '',
                worldRank: artist.worldRank || 0,
                monthlyListeners: artist.monthlyListeners || 0
            };
        } catch (e) {
            return null;
        }
    }
};

export default SpotifyService;
