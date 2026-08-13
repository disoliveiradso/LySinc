/**
 * LySinc 2.0 - Configurações Gerais da Aplicação
 */

const Config = {
    // Versão da aplicação
    VERSION: '2.1.5',

    // Chave usada para persistir o Client ID no localStorage
    CLIENT_ID_KEY: 'lysinc_spotify_client_id',

    // Configurações do Supabase (Insira sua URL e Anon Key aqui)
    SUPABASE_URL: 'https://znmquzzdzkprwqngqssh.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_eFn8MqSWi1C2a7eNmPec8g_1FjAyy3T',

    // OPCIONAL: Client ID padrão do sistema para contas pré-cadastradas
    SPOTIFY_CLIENT_ID_B64: 'MDM1MTRkM2RiZWZlNDVmYTlmNWZjOTdiOWUwMjg4YzU=',
    
    // Conta proprietária do sistema (ignora bloqueios de banco de dados e validações RLS)
    SPOTIFY_OWNER_ID: 'disoliveiradso',
    
    // Obtém o Client ID salvo pelo usuário
    getClientId() {
        const customId = localStorage.getItem(this.CLIENT_ID_KEY);
        if (customId && customId.trim()) {
            return customId.trim();
        }
        return '';
    },

    // Obtém o Client ID padrão da Conta do Sistema inserido no código fonte
    getSystemClientId() {
        if (this.SPOTIFY_CLIENT_ID_B64) {
            try {
                return atob(this.SPOTIFY_CLIENT_ID_B64).trim();
            } catch (error) {
                console.error('Erro ao decodificar SPOTIFY_CLIENT_ID_B64:', error);
            }
        }
        return '';
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
        const url = new URL(window.location.href);
        return `${url.origin}${url.pathname}`;
    },
    
    // Escopos necessários para a API do Spotify (inclui user-read-private para perfil)
    SPOTIFY_SCOPES: [
        'user-read-currently-playing',
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-private',
        'user-read-email'
    ].join(' ')
};

export default Config;
