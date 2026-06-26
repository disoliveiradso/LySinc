/**
 * LySinc - Configurações Gerais da Aplicação
 */

const Config = {
    // Chave usada para persistir o Client ID no localStorage
    CLIENT_ID_KEY: 'lysinc_spotify_client_id',
    
    // Obtém o Client ID do localStorage
    getClientId() {
        return localStorage.getItem(this.CLIENT_ID_KEY) || '';
    },
    
    // Salva o Client ID no localStorage
    setClientId(clientId) {
        if (clientId) {
            localStorage.setItem(this.CLIENT_ID_KEY, clientId.trim());
        } else {
            localStorage.removeItem(this.CLIENT_ID_KEY);
        }
    },
    
    // Detecta dinamicamente a URI de redirecionamento para o OAuth do Spotify
    getRedirectUri() {
        // Remove parâmetros de busca (query params) ou fragmentos da URL atual
        const url = new URL(window.location.href);
        return `${url.origin}${url.pathname}`;
    },
    
    // Escopos necessários para a API do Spotify
    SPOTIFY_SCOPES: [
        'user-read-currently-playing',
        'user-read-playback-state'
    ].join(' ')
};

export default Config;
