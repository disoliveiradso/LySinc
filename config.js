/**
 * LySinc - Configurações Gerais da Aplicação
 */

const Config = {
    // Chave usada para persistir o Client ID no localStorage
    CLIENT_ID_KEY: 'lysinc_spotify_client_id',

    // OPCIONAL: Insira o seu Spotify Client ID codificado em Base64 abaixo.
    // Exemplo: SPOTIFY_CLIENT_ID_B64: 'Y2xpZW50X2lkX2hlcmU='
    // Se deixado em branco, o sistema usará o Client ID configurado no navegador.
    SPOTIFY_CLIENT_ID_B64: 'MDM1MTRkM2RiZWZlNDVmYTlmNWZjOTdiOWUwMjg4YzU=',
    
    // Obtém o Client ID (prioriza o embutido ofuscado em Base64, senão lê do localStorage)
    getClientId() {
        if (this.SPOTIFY_CLIENT_ID_B64) {
            try {
                return atob(this.SPOTIFY_CLIENT_ID_B64).trim();
            } catch (error) {
                console.error('Erro ao decodificar SPOTIFY_CLIENT_ID_B64:', error);
            }
        }
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
