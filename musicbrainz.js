/**
 * LySinc - Serviço da API do MusicBrainz
 * Responsável por buscar metadados adicionais das músicas (Compositores, Álbum, Gravadora, etc.)
 */

const MusicBrainzService = {
    PROXY_URL: 'https://lysinc-musicbrainz.disoliveira-dso.workers.dev',
    cache: new Map(),

    async getTrackMetadata(isrc, trackName, artistName) {
        const queryTerm = isrc ? `isrc:${isrc}` : `${artistName} ${trackName}`;
        const cacheKey = queryTerm;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const url = `${this.PROXY_URL}/?q=${encodeURIComponent(queryTerm)}`;
            const response = await fetch(url);
            if (!response.ok) return null;

            const searchData = await response.json();
            if (!searchData || !searchData.recordings || searchData.recordings.length === 0) {
                return null;
            }

            const rec = searchData.recordings[0];
            const writers = new Set();
            const producers = new Set();

            if (rec.relations) {
                rec.relations.forEach(rel => {
                    if (rel.type === 'producer' && rel.artist?.name) {
                        producers.add(rel.artist.name);
                    }
                    if (['writer', 'composer', 'lyricist'].includes(rel.type) && rel.artist?.name) {
                        writers.add(rel.artist.name);
                    }
                });
            }

            const metadata = {
                albumName: rec.releases && rec.releases[0] ? rec.releases[0].title : null,
                releaseDate: rec.releases && rec.releases[0] && rec.releases[0].date ? rec.releases[0].date.substring(0, 4) : null,
                writers: writers.size > 0 ? Array.from(writers).join(', ') : null,
                producers: producers.size > 0 ? Array.from(producers).join(', ') : null,
                label: null,
                genres: rec.genres && rec.genres.length > 0 ? rec.genres.map(g => g.name).join(', ') : null
            };

            this.cache.set(cacheKey, metadata);
            return metadata;
        } catch (error) {
            return null;
        }
    }
};

export default MusicBrainzService;
