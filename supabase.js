import Config from './config.js';

/**
 * LySinc 2.0 - Serviço de Integração com o Supabase
 * Gerencia persistência remota e segura dos Client IDs e dados do usuário.
 */
class SupabaseService {
    constructor() {
        this.client = null;
        this.initClient();
    }

    initClient() {
        if (window.supabase && Config.SUPABASE_URL && Config.SUPABASE_ANON_KEY && 
            Config.SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
            try {
                this.client = window.supabase.createClient(Config.SUPABASE_URL, Config.SUPABASE_ANON_KEY);
                console.log('[LySinc 2.0] Cliente Supabase inicializado com sucesso.');
            } catch (err) {
                console.warn('[LySinc 2.0] Erro ao inicializar cliente Supabase:', err);
                this.client = null;
            }
        } else {
            console.log('[LySinc 2.0] Supabase em modo local/fallback (chaves não configuradas ou SDK offline).');
        }
    }

    /**
     * Persiste o Client ID no Supabase (e espelha no localStorage para acesso offline rápido)
     * @param {string} clientId 
     * @param {object} profileData (opcional - e-mail, nome, avatar do Spotify)
     */
    async saveClientId(clientId, profileData = {}) {
        if (!clientId) return false;
        const cleanId = clientId.trim();
        
        // Sempre salva localmente para performance imediata
        Config.setClientId(cleanId);

        if (!this.client) {
            console.log('[LySinc 2.0] Client ID salvo localmente.');
            return true;
        }

        try {
            const payload = {
                client_id: cleanId,
                spotify_user_id: profileData.id || null,
                spotify_display_name: profileData.display_name || null,
                spotify_email: profileData.email || null,
                avatar_url: profileData.images?.[0]?.url || null,
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.client
                .from('user_client_ids')
                .upsert(payload, { onConflict: 'client_id' });

            if (error) {
                console.warn('[LySinc 2.0] Aviso ao salvar no Supabase (salvo no cache local):', error.message);
            } else {
                console.log('[LySinc 2.0] Client ID registrado no banco de dados Supabase:', data);
            }
            return true;
        } catch (err) {
            console.error('[LySinc 2.0] Falha ao comunicar com Supabase:', err);
            return true; // Retorna true pois o fallback no localStorage teve sucesso
        }
    }

    /**
     * Recupera o Client ID do Supabase (ou fallback no localStorage)
     */
    async getClientId(spotifyUserId = null) {
        const localId = Config.getClientId();
        if (!this.client) return localId;

        try {
            if (spotifyUserId) {
                const { data, error } = await this.client
                    .from('user_client_ids')
                    .select('client_id')
                    .eq('spotify_user_id', spotifyUserId)
                    .single();

                if (!error && data?.client_id) {
                    Config.setClientId(data.client_id);
                    return data.client_id;
                }
            }
        } catch (err) {
            console.warn('[LySinc 2.0] Falha na busca no Supabase, usando cache local:', err);
        }

        return localId;
    }

    /**
     * Remove o Client ID do Supabase e do localStorage
     */
    async removeClientId(clientId = null) {
        const targetId = clientId || Config.getClientId();
        
        // Remove do localStorage
        Config.setClientId('');

        if (this.client && targetId) {
            try {
                const { error } = await this.client
                    .from('user_client_ids')
                    .delete()
                    .eq('client_id', targetId);

                if (error) {
                    console.warn('[LySinc 2.0] Erro ao deletar do Supabase:', error.message);
                } else {
                    console.log('[LySinc 2.0] Client ID removido com sucesso do Supabase.');
                }
            } catch (err) {
                console.error('[LySinc 2.0] Erro ao remover do Supabase:', err);
            }
        }
        return true;
    }
}

const supabaseService = new SupabaseService();
export default supabaseService;
