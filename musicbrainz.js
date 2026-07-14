/**
 * LySinc - Serviço da API do MusicBrainz
 * Responsável por buscar metadados adicionais das músicas (Compositores, Álbum, Gravadora, etc.)
 */

const MusicBrainzService = {
    USER_AGENT: 'LySinc/1.0 ( disoliveiradso@github.com )',
    API_BASE: 'https://musicbrainz.org/ws/2',
    
    // Fila para gerenciar requisições e respeitar o Rate Limit de 1 requisição/seg
    requestQueue: [],
    isProcessingQueue: false,
    lastRequestTime: 0,
    RATE_LIMIT_DELAY: 1100, // 1.1s para ter uma margem de segurança

    // Cache em memória
    cache: new Map(),

    /**
     * Adiciona uma requisição à fila para respeitar o Rate Limit
     */
    async enqueueRequest(url) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ url, resolve, reject });
            this.processQueue();
        });
    },

    /**
     * Processa a fila de requisições
     */
    async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const now = Date.now();
            const timeSinceLast = now - this.lastRequestTime;
            
            if (timeSinceLast < this.RATE_LIMIT_DELAY) {
                await new Promise(r => setTimeout(r, this.RATE_LIMIT_DELAY - timeSinceLast));
            }

            const req = this.requestQueue.shift();
            this.lastRequestTime = Date.now();

            try {
                // Alguns navegadores bloqueiam a sobrescrita do User-Agent via fetch
                // Mas tentaremos enviar mesmo assim, e se bloqueado, o fetch prossegue
                const response = await fetch(req.url, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': this.USER_AGENT
                    }
                });

                if (!response.ok) {
                    throw new Error(`Erro MusicBrainz: ${response.status}`);
                }

                const data = await response.json();
                req.resolve(data);
            } catch (error) {
                console.error('Falha na requisição MusicBrainz:', error);
                req.reject(error);
            }
        }

        this.isProcessingQueue = false;
    },

    /**
     * Busca os metadados completos de uma música
     * @param {string} isrc Código ISRC (fornecido pelo Spotify, se disponível)
     * @param {string} trackName Nome da música
     * @param {string} artistName Nome do artista principal
     */
    async getTrackMetadata(isrc, trackName, artistName) {
        // Chave de cache
        const cacheKey = isrc || `${trackName}-${artistName}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            let recordingId = null;

            // 1. Tenta buscar pelo ISRC primeiro
            if (isrc) {
                const searchData = await this.enqueueRequest(`${this.API_BASE}/recording/?query=isrc:${isrc}&fmt=json`);
                if (searchData.recordings && searchData.recordings.length > 0) {
                    recordingId = searchData.recordings[0].id;
                }
            }

            // 2. Fallback: Busca por nome da música e artista se não achou pelo ISRC
            if (!recordingId && trackName && artistName) {
                const query = encodeURIComponent(`recording:"${trackName}" AND artist:"${artistName}"`);
                const searchData = await this.enqueueRequest(`${this.API_BASE}/recording/?query=${query}&fmt=json`);
                if (searchData.recordings && searchData.recordings.length > 0) {
                    recordingId = searchData.recordings[0].id;
                }
            }

            if (!recordingId) {
                return null; // Não encontrou a gravação
            }

            // 3. Busca detalhes da gravação (incluindo relacionamentos de artistas e obras)
            const recordingData = await this.enqueueRequest(
                `${this.API_BASE}/recording/${recordingId}?inc=releases+artist-rels+work-rels&fmt=json`
            );

            // 4. Se tivermos um release, buscamos detalhes dele para obter gravadora e copyright
            let label = '';
            let copyright = '';
            let phonographicCopyright = '';
            let albumName = '';
            let releaseDate = '';

            if (recordingData.releases && recordingData.releases.length > 0) {
                // Pegamos o primeiro lançamento para informações de álbum
                const release = recordingData.releases[0];
                albumName = release.title;
                releaseDate = release.date;

                const releaseId = release.id;
                const releaseData = await this.enqueueRequest(
                    `${this.API_BASE}/release/${releaseId}?inc=labels&fmt=json`
                );

                if (releaseData["label-info"] && releaseData["label-info"].length > 0) {
                    const labelInfo = releaseData["label-info"][0];
                    label = labelInfo.label ? labelInfo.label.name : '';
                }
            }

            // 5. Extrair compositores e produtores dos relacionamentos
            const writers = new Set();
            const producers = new Set();

            if (recordingData.relations) {
                recordingData.relations.forEach(rel => {
                    if (rel.type === 'producer') {
                        producers.add(rel.artist.name);
                    }
                });
            }

            // Relacionamentos da Obra (Work) geralmente contém os compositores (lyricist, composer, writer)
            if (recordingData.relations) {
                const workRelations = recordingData.relations.filter(r => r["target-type"] === 'work');
                for (let wr of workRelations) {
                    if (wr.work && wr.work.id) {
                        const workData = await this.enqueueRequest(`${this.API_BASE}/work/${wr.work.id}?inc=artist-rels&fmt=json`);
                        if (workData.relations) {
                            workData.relations.forEach(rel => {
                                if (['writer', 'composer', 'lyricist'].includes(rel.type)) {
                                    writers.add(rel.artist.name);
                                }
                            });
                        }
                    }
                }
            }

            const metadata = {
                albumName: albumName || null,
                releaseDate: releaseDate ? releaseDate.substring(0, 4) : null,
                writers: writers.size > 0 ? Array.from(writers).join(', ') : null,
                producers: producers.size > 0 ? Array.from(producers).join(', ') : null,
                label: label || null,
                copyright: copyright || null,
                phonographicCopyright: phonographicCopyright || null
            };

            this.cache.set(cacheKey, metadata);
            return metadata;
        } catch (error) {
            console.error('Erro ao processar dados do MusicBrainz', error);
            return null;
        }
    }
};

export default MusicBrainzService;
