/**
 * LySinc - Serviço de Busca e Parsing de Letras
 * Baseado estritamente no repositório de referência better-lyrics-master
 */

const LyricsService = {
    // Busca letras na Lrclib API de forma tolerante (Search por query)
    async fetchFromLrcLib(trackName, artistName, albumName, durationMs) {
        try {
            const mainArtist = artistName ? artistName.split(/,|\bfeat\b|\bwith\b|\b&\b/i)[0].trim() : '';
            const searchQuery = `${mainArtist} ${trackName}`;
            const params = new URLSearchParams({ q: searchQuery });

            const response = await fetch(`https://lrclib.net/api/search?${params.toString()}`);
            if (!response.ok) {
                return null;
            }
            const results = await response.json();
            if (!Array.isArray(results) || results.length === 0) {
                return null;
            }
            
            // Dá preferência a resultados que contenham letras síncronas
            const withSynced = results.find(r => r.syncedLyrics && typeof r.syncedLyrics === 'string');
            return withSynced || results[0];
        } catch (error) {
            console.error('Erro ao buscar letras na Lrclib API:', error);
            return null;
        }
    },

    // Busca letras no cache da BiniLyrics (Better Lyrics) com higienização de artista principal
    async fetchFromBetterLyrics(trackName, artistName, durationMs) {
        try {
            const mainArtist = artistName ? artistName.split(/,|\bfeat\b|\bwith\b|\b&\b/i)[0].trim() : '';
            const cacheParams = new URLSearchParams({
                track: trackName,
                artist: mainArtist
            });
            if (durationMs) {
                cacheParams.append('duration', Math.round(durationMs / 1000).toString());
            }
            
            const cacheUrl = `https://lyrics-api.binimum.org/?${cacheParams.toString()}`;
            const response = await fetch(cacheUrl);
            if (response.ok) {
                const data = await response.json();
                if (data.results && data.results.length > 0) {
                    const result = data.results[0];
                    if (result.lyricsUrl) {
                        const lyricsRes = await fetch(result.lyricsUrl);
                        if (lyricsRes.ok) {
                            return await lyricsRes.text();
                        }
                    }
                }
            }
            return null;
        } catch (error) {
            console.error('Erro ao buscar no cache Better Lyrics:', error);
            return null;
        }
    },

    // Função unificada de obtenção de letras
    async getLyrics(trackName, artistName, albumName, durationMs, provider = 'betterlyrics') {
        const songDuration = durationMs || 0;
        let originalLrc = null;
        let source = 'Better Lyrics';

        if (provider === 'betterlyrics') {
            const betterLyricsText = await this.fetchFromBetterLyrics(trackName, artistName, durationMs);
            if (betterLyricsText) {
                originalLrc = betterLyricsText;
                source = 'Better Lyrics';
            }
        }

        if (!originalLrc) {
            const lrclibData = await this.fetchFromLrcLib(trackName, artistName, albumName, durationMs);
            if (lrclibData) {
                if (lrclibData.syncedLyrics) {
                    originalLrc = lrclibData.syncedLyrics;
                    source = 'Lrclib API';
                } else if (lrclibData.plainLyrics) {
                    return {
                        original: this.parsePlainLyrics(lrclibData.plainLyrics),
                        translation: null,
                        romanized: null,
                        source: 'Lrclib API (Plain)'
                    };
                }
            }
        }

        if (originalLrc) {
            return {
                original: this.parseLRC(originalLrc, songDuration),
                translation: null,
                romanized: null,
                source: source
            };
        }

        return null;
    },

    // Converte representação de tempo para milissegundos
    parseTime(timeStr) {
        if (!timeStr) return 0;
        if (typeof timeStr === 'number') return timeStr;

        const parts = timeStr.split(':');
        let totalMs = 0;

        try {
            if (parts.length === 1) {
                totalMs = parseFloat(parts[0]) * 1000;
            } else if (parts.length === 2) {
                const minutes = parseInt(parts[0], 10);
                const seconds = parseFloat(parts[1]);
                totalMs = minutes * 60 * 1000 + seconds * 1000;
            } else if (parts.length === 3) {
                const hours = parseInt(parts[0], 10);
                const minutes = parseInt(parts[1], 10);
                const seconds = parseFloat(parts[2]);
                totalMs = hours * 3600 * 1000 + minutes * 60 * 1000 + seconds * 1000;
            }
            return Math.round(totalMs);
        } catch (e) {
            console.error(`Erro ao parsear tempo: ${timeStr}`, e);
            return 0;
        }
    },

    // Parser LRC completo do better-lyrics-master
    parseLRC(lrcText, songDuration) {
        const possibleIdTags = ["ti", "ar", "al", "au", "lr", "length", "by", "offset", "re", "tool", "ve", "#"];
        const TIME_TAG_REGEX = /[\[](\d+:\d+\.\d+)[\]]/g;
        const ENHANCED_WORD_REGEX = /<(\d+:\d+\.\d+)>/g;
        const ID_TAG_REGEX = /^[\[](\w+):(.*)[\]]$/;

        const lines = lrcText.split('\n');
        const result = [];
        const idTags = {};

        lines.forEach(line => {
            line = line.trim();

            const idTagMatch = line.match(ID_TAG_REGEX);
            if (idTagMatch && possibleIdTags.includes(idTagMatch[1])) {
                idTags[idTagMatch[1]] = idTagMatch[2];
                return;
            }

            const timeTags = [];
            let match;
            while ((match = TIME_TAG_REGEX.exec(line)) !== null) {
                timeTags.push(this.parseTime(match[1]));
            }

            if (timeTags.length === 0) return;

            const lyricPart = line.replace(TIME_TAG_REGEX, '').trim();

            const parts = [];
            let lastTime = null;
            let plainText = '';

            const fragments = lyricPart.split(ENHANCED_WORD_REGEX);
            const isMusixmatchStyle = fragments.some(
                (f, i) => i % 2 === 0 && i > 0 && i < fragments.length - 1 && f.length > 0 && f.trim() === ""
            );

            fragments.forEach((fragment, index) => {
                if (index % 2 === 0) {
                    if (isMusixmatchStyle) {
                        const trimmed = fragment.trim();
                        fragment = trimmed === "" && fragment.length > 0 ? " " : trimmed;
                    }
                    plainText += fragment;
                    if (parts.length > 0 && parts[parts.length - 1].startTimeMs) {
                        parts[parts.length - 1].words += fragment;
                    }
                } else {
                    const startTime = this.parseTime(fragment);
                    if (lastTime !== null && parts.length > 0) {
                        parts[parts.length - 1].durationMs = startTime - lastTime;
                    }
                    parts.push({
                        startTimeMs: startTime,
                        words: '',
                        durationMs: 0,
                    });
                    lastTime = startTime;
                }
            });

            const startTime = Math.min(...timeTags);
            const endTime = Math.max(...timeTags);
            const duration = endTime - startTime;

            result.push({
                startTimeMs: startTime,
                words: plainText.trim() || lyricPart.trim(),
                durationMs: duration,
                parts: parts.length > 0 ? parts : undefined,
            });
        });

        result.forEach((lyric, index) => {
            if (index + 1 < result.length) {
                const nextLyric = result[index + 1];
                if (lyric.durationMs === 0) {
                    lyric.durationMs = Math.max(nextLyric.startTimeMs - lyric.startTimeMs, 0);
                }
                if (lyric.parts && lyric.parts.length > 0) {
                    let latestStart = nextLyric.startTimeMs;
                    lyric.parts.forEach(val => {
                        latestStart = Math.max(latestStart, val.startTimeMs);
                    });

                    const lastPartInLyric = lyric.parts[lyric.parts.length - 1];
                    lastPartInLyric.durationMs = Math.max(nextLyric.startTimeMs - lastPartInLyric.startTimeMs, 0);
                    lyric.durationMs = Math.max(latestStart - lyric.startTimeMs, 0);
                }
            } else {
                if (lyric.durationMs === 0) {
                    lyric.durationMs = songDuration - lyric.startTimeMs;
                }
                if (lyric.parts && lyric.parts.length > 0) {
                    const lastPartInLyric = lyric.parts[lyric.parts.length - 1];
                    lastPartInLyric.durationMs = songDuration - lastPartInLyric.startTimeMs;
                }
            }
        });

        if (idTags["offset"]) {
            let offset = Number(idTags["offset"]);
            if (!isNaN(offset)) {
                offset = offset * 1000;
                result.forEach(lyric => {
                    lyric.startTimeMs -= offset;
                    lyric.parts?.forEach(part => {
                        part.startTimeMs -= offset;
                    });
                });
            }
        }

        return result;
    },

    // Parser simples para texto sem formatação síncrona
    parsePlainLyrics(lyricsText) {
        const lyricsArray = [];
        lyricsText.split('\n').forEach(words => {
            lyricsArray.push({
                startTimeMs: 0,
                words: words,
                durationMs: 0,
            });
        });
        return lyricsArray;
    }
};

export default LyricsService;
