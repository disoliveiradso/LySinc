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
     * Envia um relatório de erro para o servidor
     */
    async saveErrorReport(title, category, message, clientId = null) {
        if (!this.client) {
            console.warn('[LySinc 2.0] Não é possível enviar report: Supabase não conectado.');
            return false;
        }
        try {
            const { error } = await this.client
                .from('lysinc_error_reports')
                .insert([
                    { 
                        title: title, 
                        category: category, 
                        message: message, 
                        client_id: clientId || null
                    }
                ]);
            if (error) {
                console.error('[LySinc 2.0] Erro ao salvar report:', error.message);
                return false;
            }
            return true;
        } catch (error) {
            console.error('[LySinc 2.0] Exceção ao salvar report:', error);
            return false;
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
                last_used: new Date().toISOString()
            };
            if (profileData && profileData.id) {
                payload.spotify_user_id = profileData.id;
                // Owner bypass absoluto: nunca escreve no Supabase se for o owner
                if (Config.SPOTIFY_OWNER_ID && profileData.id === Config.SPOTIFY_OWNER_ID) {
                    console.log('[LySinc 2.0] Client ID salvo localmente (Bypass Owner Ativo).');
                    return true;
                }
            }

            const { data, error } = await this.client
                .from('lysinc_user_client_ids')
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
        const fallbackId = Config.getClientId() || Config.getSystemClientId();
        if (!this.client) return fallbackId;

        try {
            if (spotifyUserId) {
                // Owner bypass absoluto: nunca consulta Supabase se for o owner
                if (Config.SPOTIFY_OWNER_ID && spotifyUserId === Config.SPOTIFY_OWNER_ID) {
                    return fallbackId;
                }

                const { data, error } = await this.client
                    .from('lysinc_user_client_ids')
                    .select('client_id')
                    .eq('spotify_user_id', spotifyUserId)
                    .maybeSingle();

                if (error) {
                    return fallbackId;
                }

                if (data?.client_id) {
                    return data.client_id;
                }

                return null;
            }
        } catch (err) {
            console.warn('[LySinc 2.0] Exceção na busca no Supabase (usando fallback):', err);
            return fallbackId;
        }

        return fallbackId;
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
                    .from('lysinc_user_client_ids')
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
