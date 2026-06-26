/**
 * LySinc - Serviço de Busca e Parsing de Letras
 */

const LyricsService = {
    // Banco de dados simulado (Mocks) para testes offline ou demonstrações imediatas
    MOCK_LYRICS: {
        // Exemplo: Shape of You - Ed Sheeran
        "shape_of_you": {
            trackName: "Shape of You",
            artistName: "Ed Sheeran",
            syncedLyrics: `[00:00.00] <00:00.00> Club <00:00.20> isn't <00:00.40> the <00:00.60> best <00:00.80> place <00:01.00> to <00:01.20> find <00:01.40> a <00:01.60> lover
[00:01.90] <00:01.90> So <00:02.10> the <00:02.30> bar <00:02.50> is <00:02.70> where <00:02.90> I <00:03.10> go
[00:03.50] <00:03.50> Me <00:03.70> and <00:03.90> my <00:04.10> friends <00:04.30> at <00:04.50> the <00:04.70> table <00:04.90> doing <00:05.10> shots
[00:05.30] <00:05.30> Drinking <00:05.50> fast <00:05.70> and <00:05.90> then <00:06.10> we <00:06.30> talk <00:06.50> slow
[00:06.80] <00:06.80> And <00:07.00> you <00:07.20> come <00:07.40> over <00:07.60> and <00:07.80> start <00:08.00> up <00:08.20> a <00:08.40> conversation <00:08.60> with <00:08.80> just <00:09.00> me
[00:09.20] <00:09.20> And <00:09.40> trust <00:09.60> me <00:09.80> I'll <00:10.00> give <00:10.20> it <00:10.40> a <00:10.60> chance
[00:10.80] <00:10.80> Now <00:11.00> take <00:11.20> my <00:11.40> hand, <00:11.60> stop, <00:11.80> put <00:12.00> "The <00:12.20> Man" <00:12.40> on <00:12.60> the <00:12.80> jukebox
[00:13.00] <00:13.00> And <00:13.20> then <00:13.40> we <00:13.60> start <00:13.80> to <00:14.00> dance, <00:14.20> and <00:14.40> now <00:14.60> I'm <00:14.80> singing <00:15.00> like
[00:15.20] <00:15.20> Girl, <00:15.40> you <00:15.60> know <00:15.80> I <00:16.00> want <00:16.20> your <00:16.40> love
[00:16.70] <00:16.70> Your <00:16.90> love <00:17.10> was <00:17.30> handmade <00:17.50> for <00:17.70> somebody <00:17.90> like <00:18.10> me
[00:18.30] <00:18.30> Come <00:18.50> on <00:18.70> now, <00:18.90> follow <00:19.10> my <00:19.30> lead
[00:19.60] <00:19.60> I <00:19.80> may <00:20.00> be <00:20.20> crazy, <00:20.40> don't <00:20.60> mind <00:20.80> me
[00:21.00] <00:21.00> Say, <00:21.20> boy, <00:21.40> let's <00:21.60> not <00:21.80> talk <00:22.00> too <00:22.20> much
[00:22.40] <00:22.40> Grab <00:22.60> on <00:22.80> my <00:23.00> waist <00:23.20> and <00:23.40> put <00:23.60> that <00:23.80> body <00:24.00> on <00:24.20> me
[00:24.40] <00:24.40> Come <00:24.60> on <00:24.80> now, <00:25.00> follow <00:25.20> my <00:25.40> lead
[00:25.60] <00:25.60> Come, <00:25.80> come <00:26.00> on <00:26.20> now, <00:26.40> follow <00:26.60> my <00:26.80> lead
[00:27.10] <00:27.10> I'm <00:27.30> in <00:27.50> love <00:27.70> with <00:27.90> the <00:28.10> shape <00:28.30> of <00:28.50> you
[00:28.80] <00:28.80> We <00:29.00> push <00:29.20> and <00:29.40> pull <00:29.60> like <00:29.80> a <00:30.00> magnet <00:30.20> do
[00:30.50] <00:30.50> Although <00:30.70> my <00:30.90> heart <00:31.10> is <00:31.30> falling <00:31.50> too
[00:31.90] <00:31.90> I'm <00:32.10> in <00:32.30> love <00:32.50> with <00:32.70> your <00:32.90> body`
        }
    },

    // Busca letras na Lrclib API por título e artista
    async fetchFromLrcLib(trackName, artistName, albumName, durationMs) {
        try {
            const queryParams = new URLSearchParams({
                track_name: trackName,
                artist_name: artistName
            });
            if (albumName) queryParams.append('album_name', albumName);
            if (durationMs) queryParams.append('duration', Math.round(durationMs / 1000).toString());

            const response = await fetch(`https://lrclib.net/api/get?${queryParams.toString()}`);
            if (!response.ok) {
                if (response.status === 404) {
                    console.log('Letras não encontradas na Lrclib');
                    return null;
                }
                throw new Error('Falha na resposta do Lrclib');
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erro ao buscar letras da API Lrclib:', error);
            return null;
        }
    },

    // Retorna as letras (reais ou simuladas) de acordo com os dados da faixa
    async getLyrics(trackName, artistName, albumName, durationMs) {
        // Tenta buscar no mock local primeiro se for um dos nossos testes conhecidos
        const mockKey = `${trackName}_${artistName}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        for (const key of Object.keys(this.MOCK_LYRICS)) {
            if (trackName.toLowerCase().includes(key.replace(/_/g, ' ')) || mockKey.includes(key)) {
                console.log('Usando letra simulada (Mock) para:', trackName);
                return this.parseLrc(this.MOCK_LYRICS[key].syncedLyrics, durationMs);
            }
        }

        // Tenta buscar na Lrclib
        const lrclibData = await this.fetchFromLrcLib(trackName, artistName, albumName, durationMs);
        if (lrclibData && lrclibData.syncedLyrics) {
            console.log('Letras sincronizadas obtidas com sucesso da Lrclib');
            return this.parseLrc(lrclibData.syncedLyrics, durationMs);
        }

        // Se falhar, e tiver apenas plain lyrics, mostra as plain lyrics não sincronizadas
        if (lrclibData && lrclibData.plainLyrics) {
            console.log('Letras estáticas (Plain) obtidas da Lrclib');
            return this.parsePlainLyrics(lrclibData.plainLyrics);
        }

        // Caso não ache nada, retorna nulo para que o app exiba que não há letras disponíveis
        return null;
    },

    // Converte timestamp string [mm:ss.xx] ou <mm:ss.xx> em milissegundos
    parseTimestamp(timeStr) {
        const cleaned = timeStr.replace(/[\[\]<>]/g, '').trim();
        const parts = cleaned.split(':');
        if (parts.length < 2) return 0;
        
        const minutes = parseInt(parts[0], 10);
        const secondsAndMs = parts[1].split('.');
        const seconds = parseInt(secondsAndMs[0], 10);
        let ms = 0;
        
        if (secondsAndMs.length > 1) {
            const msStr = secondsAndMs[1].padEnd(3, '0').slice(0, 3);
            ms = parseInt(msStr, 10);
        }
        
        return (minutes * 60 + seconds) * 1000 + ms;
    },

    // Processa o formato de letra estática
    parsePlainLyrics(plainText) {
        return plainText.split('\n').map((lineText, index) => {
            const cleanText = lineText.trim();
            // Cria linhas artificiais espaçadas a cada 4 segundos apenas para exibição
            return {
                id: index,
                startTime: index * 4000,
                endTime: (index + 1) * 4000,
                text: cleanText,
                words: [{
                    text: cleanText,
                    startTime: index * 4000,
                    endTime: (index + 1) * 4000
                }],
                isStatic: true
            };
        });
    },

    // Converte letras LRC (incluindo marcações palavra a palavra opcionais)
    parseLrc(lrcText, totalDurationMs = 0) {
        const lines = lrcText.split('\n');
        const parsedLines = [];

        // Regex para extrair a marcação de tempo da linha inteira, ex: [01:23.45]
        const lineTimeRegex = /^\[(\d+:\d+(?:\.\d+)?)\]/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const match = lineTimeRegex.exec(line);
            
            if (match) {
                const startTime = this.parseTimestamp(match[1]);
                let lineTextContent = line.replace(lineTimeRegex, '').trim();

                // Regex para checar se a linha possui tags de palavra por palavra, ex: <00:12.34> palavra
                const wordTagRegex = /<(\d+:\d+(?:\.\d+)?)>\s*([^\s<>]+)/g;
                let wordMatches = [...lineTextContent.matchAll(wordTagRegex)];
                
                let words = [];

                if (wordMatches.length > 0) {
                    // Possui marcação detalhada palavra por palavra
                    for (let j = 0; j < wordMatches.length; j++) {
                        const wordStart = this.parseTimestamp(wordMatches[j][1]);
                        const wordText = wordMatches[j][2];
                        
                        // O tempo final da palavra atual é o início da próxima ou +1s
                        let wordEnd = wordStart + 1000;
                        if (j < wordMatches.length - 1) {
                            wordEnd = this.parseTimestamp(wordMatches[j + 1][1]);
                        }

                        words.push({
                            text: wordText,
                            startTime: wordStart,
                            endTime: wordEnd
                        });
                    }
                    
                    // Remove as tags para obter o texto limpo da linha
                    lineTextContent = lineTextContent.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
                } else {
                    // Formato tradicional linha por linha.
                    // Faremos uma divisão e simulação linear das palavras da linha para ter efeito de preenchimento fluido!
                    const rawWords = lineTextContent.split(/\s+/);
                    words = rawWords.map((wordText) => ({
                        text: wordText,
                        startTime: 0, // Será calculado dinamicamente no pós-processamento
                        endTime: 0
                    }));
                }

                parsedLines.push({
                    id: parsedLines.length,
                    startTime: startTime,
                    endTime: 0, // Será calculado em relação à próxima linha
                    text: lineTextContent,
                    words: words,
                    hasDetailedWords: wordMatches.length > 0
                });
            }
        }

        // Pós-processamento para definir os tempos finais de cada linha e de palavras
        for (let i = 0; i < parsedLines.length; i++) {
            const currentLine = parsedLines[i];
            
            // O tempo final da linha é o início da próxima ou o final da música (ou +5s se indefinido)
            let nextLineStart = currentLine.startTime + 5000;
            if (i < parsedLines.length - 1) {
                nextLineStart = parsedLines[i + 1].startTime;
            } else if (totalDurationMs > currentLine.startTime) {
                nextLineStart = totalDurationMs;
            }
            currentLine.endTime = nextLineStart;

            // Se as palavras foram simuladas (não tinham tags explícitas), distribui o tempo linearmente
            if (!currentLine.hasDetailedWords && currentLine.words.length > 0) {
                const duration = currentLine.endTime - currentLine.startTime;
                // Deixa uma pequena folga no final da frase para respirar
                const activeDuration = duration * 0.9; 
                const wordDuration = activeDuration / currentLine.words.length;

                currentLine.words.forEach((word, idx) => {
                    word.startTime = Math.round(currentLine.startTime + (idx * wordDuration));
                    word.endTime = Math.round(word.startTime + wordDuration);
                });
            }
        }

        // Ordena por tempo de início para garantir consistência
        return parsedLines.sort((a, b) => a.startTime - b.startTime);
    }
};

export default LyricsService;
