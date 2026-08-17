/**
 * LySinc - Serviço da API do MusicBrainz
 * Responsável por buscar metadados adicionais das músicas (Compositores, Álbum, Gravadora, etc.)
 */

const MusicBrainzService = {
    PROXY_URL: 'https://lysinc-musicbrainz.disoliveira-dso.workers.dev',
    cache: new Map(),

    async getTrackMetadata(isrc, trackName, artistName) {
        if (!trackName && !artistName && !isrc) return null;

        const cleanTrack = trackName ? trackName.replace(/[\(\[\-].*$/, '').trim() : '';
        const cleanArtist = artistName ? artistName.split(',')[0].trim() : '';
        
        let queryTerm = isrc ? `isrc:${isrc}` : `recording:"${cleanTrack || trackName}" AND artist:"${cleanArtist || artistName}"`;
        const cacheKey = isrc || `${cleanTrack}-${cleanArtist}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            let searchData = null;

            // 1. Tenta buscar pela proxy do Worker
            try {
                let url = `${this.PROXY_URL}/?q=${encodeURIComponent(queryTerm)}`;
                let response = await fetch(url);
                searchData = response.ok ? await response.json() : null;
            } catch (e) {}

            // 2. Fallback: se a busca por ISRC ou Lucene estrita não retornou nada, tenta busca textual mais ampla
            if (!searchData || !searchData.recordings || searchData.recordings.length === 0) {
                const fallbackQuery = `${cleanArtist} ${cleanTrack}`.trim();
                if (fallbackQuery) {
                    try {
                        let url = `${this.PROXY_URL}/?q=${encodeURIComponent(fallbackQuery)}`;
                        let response = await fetch(url);
                        searchData = response.ok ? await response.json() : null;
                    } catch (e) {}
                }
            }

            // 3. Fallback direto à API oficial do MusicBrainz caso a proxy falhe
            if (!searchData || !searchData.recordings || searchData.recordings.length === 0) {
                const directQuery = isrc ? `isrc:${isrc}` : `recording:"${cleanTrack || trackName}" AND artist:"${cleanArtist || artistName}"`;
                try {
                    const mbUrl = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(directQuery)}&fmt=json`;
                    const res = await fetch(mbUrl, {
                        headers: { 'User-Agent': 'LySinc/4.6.0 ( https://github.com/disoliveiradso/LySinc )' }
                    });
                    if (res.ok) {
                        searchData = await res.json();
                    }
                } catch (e) {}
            }

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
