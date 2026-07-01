/**
 * LySinc - Serviço de Busca e Parsing de Letras (Baseado no am-lyrics-main)
 */

const GOOGLE_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  FETCH_TIMEOUT_MS: 6000,
};

// Classe para tradução e romanização usando a API livre do Google Translate
class GoogleService {
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static fetchWithTimeout(url, timeoutMs = GOOGLE_CONFIG.FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
  }

  static isPurelyLatinScript(text) {
    return /^[\u0000-\u007F\u0080-\u00FF\u0100-\u017F\u0180-\u024F]*$/.test(text);
  }

  static async translate(textOrArray, targetLang) {
    if (!textOrArray || (Array.isArray(textOrArray) && textOrArray.length === 0)) {
      return Array.isArray(textOrArray) ? [] : '';
    }

    const isArray = Array.isArray(textOrArray);
    const texts = isArray ? textOrArray : [textOrArray];

    const nonEmptyIndices = [];
    const textsToTranslate = [];

    texts.forEach((t, i) => {
      if (t && t.trim()) {
        nonEmptyIndices.push(i);
        textsToTranslate.push(t);
      }
    });

    if (textsToTranslate.length === 0) {
      return isArray ? texts : texts[0];
    }

    const BATCH_SIZE_CHARS = 1500;
    const translatedResults = new Array(textsToTranslate.length).fill('');

    let currentBatch = [];
    let currentBatchIndices = [];
    let currentBatchLength = 0;

    const processBatch = async (batch, indices) => {
      if (batch.length === 0) return;
      const joinedText = batch.join('\n');

      let attempt = 0;
      let success = false;

      while (attempt < GOOGLE_CONFIG.MAX_RETRIES && !success) {
        try {
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(joinedText)}`;
          const response = await GoogleService.fetchWithTimeout(url);
          if (!response.ok) throw new Error(`Status ${response.status}`);
          const data = await response.json();

          const fullTranslation = data?.[0]?.map((seg) => seg?.[0]).join('') || '';
          const lines = fullTranslation.split('\n');

          indices.forEach((originalIdx, i) => {
            if (i < lines.length) {
              translatedResults[originalIdx] = lines[i];
            } else {
              translatedResults[originalIdx] = batch[i];
            }
          });

          success = true;
        } catch (e) {
          attempt += 1;
          if (attempt < GOOGLE_CONFIG.MAX_RETRIES) {
            await GoogleService.delay(GOOGLE_CONFIG.RETRY_DELAY_MS * 2 ** (attempt - 1));
          } else {
            indices.forEach((originalIdx, i) => {
              translatedResults[originalIdx] = batch[i];
            });
          }
        }
      }
    };

    for (let i = 0; i < textsToTranslate.length; i += 1) {
      const text = textsToTranslate[i];
      if (currentBatchLength + text.length > BATCH_SIZE_CHARS) {
        await processBatch(currentBatch, currentBatchIndices);
        currentBatch = [];
        currentBatchIndices = [];
        currentBatchLength = 0;
      }
      currentBatch.push(text);
      currentBatchIndices.push(i);
      currentBatchLength += text.length;
    }

    if (currentBatch.length > 0) {
      await processBatch(currentBatch, currentBatchIndices);
    }

    const finalArray = [...texts];
    nonEmptyIndices.forEach((realIdx, mappedIdx) => {
      finalArray[realIdx] = translatedResults[mappedIdx];
    });

    return isArray ? finalArray : finalArray[0];
  }

  static async romanize(originalLyrics) {
    const lines = Array.isArray(originalLyrics)
      ? originalLyrics
      : originalLyrics.data || originalLyrics.content || [];

    if (!lines || lines.length === 0)
      return Array.isArray(originalLyrics) ? originalLyrics : [];

    const isWordSynced = lines.some(
      (l) => l.isWordSynced !== false && Array.isArray(l.text) && l.text.length > 1
    );

    if (isWordSynced) {
      return this.romanizeWordSynced(lines);
    }

    return this.romanizeLineSynced(lines);
  }

  static async romanizeWordSynced(lines) {
    return Promise.all(
      lines.map(async (line) => {
        if (!line.text || !Array.isArray(line.text) || line.text.length === 0 || line.romanizedText)
          return line;

        const fullText = line.text.map((s) => s.text).join('');
        const [romanizedFullLine] = await this.romanizeTexts([fullText]);

        const newSyllabus = line.text.map((s) => ({
          ...s,
          romanizedText: s.romanizedText,
        }));

        return {
          ...line,
          text: newSyllabus,
          romanizedText: romanizedFullLine || '',
        };
      })
    );
  }

  static async romanizeLineSynced(lines) {
    const linesToRomanize = lines.map((line) => {
      if (line.romanizedText) {
        return '';
      }
      if (Array.isArray(line.text) && line.text.length > 0) {
        return line.text.map((s) => s.text).join('');
      }
      return '';
    });

    const romanizedLines = await this.romanizeTexts(linesToRomanize);

    return lines.map((line, index) => ({
      ...line,
      romanizedText: romanizedLines[index] || '',
    }));
  }

  static async romanizeTexts(texts) {
    const contextText = texts.join(' ');

    if (GoogleService.isPurelyLatinScript(contextText)) {
      return texts;
    }

    const romanizedTexts = [];

    for (const text of texts) {
      if (!text || GoogleService.isPurelyLatinScript(text)) {
        romanizedTexts.push(text);
      } else {
        let attempt = 0;
        let success = false;
        let lastError = null;

        while (attempt < GOOGLE_CONFIG.MAX_RETRIES && !success) {
          try {
            const romanizeUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(text)}`;
            const response = await GoogleService.fetchWithTimeout(romanizeUrl);
            const data = await response.json();
            const romanized = data?.[0]?.[0]?.[3] || text;

            romanizedTexts.push(romanized);
            success = true;
          } catch (error) {
            lastError = error;
            console.warn(`GoogleService: Error romanizing text "${text}"`, error);
            attempt += 1;
            if (attempt < GOOGLE_CONFIG.MAX_RETRIES) {
              await GoogleService.delay(GOOGLE_CONFIG.RETRY_DELAY_MS * 2 ** (attempt - 1));
            }
          }
        }

        if (!success) {
          romanizedTexts.push(text);
        }
      }
    }

    return romanizedTexts;
  }
}

const KPOE_SERVERS = [
  'https://lyricsplus.binimum.org',
  'https://lyricsplus.atomix.one',
  'https://lyricsplus-seven.vercel.app',
  'https://lyricsplus.prjktla.workers.dev',
  'https://lyrics-plus-backend.vercel.app',
];
const DEFAULT_KPOE_SOURCE_ORDER = 'apple,musixmatch,qq';
const GENIUS_WORKER_URL = 'https://fetch-genius.samidy.workers.dev/';
const FETCH_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

const LyricsService = {
  toMilliseconds(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num) || Number.isNaN(num)) {
      return fallback;
    }
    if (!Number.isInteger(num)) {
      return Math.round(num * 1000);
    }
    return Math.max(0, Math.round(num));
  },

  parseQueryMetadata(rawQuery) {
    const trimmed = rawQuery?.trim();
    if (!trimmed) return null;

    const result = {};
    const hyphenSplit = trimmed.split(/\s[-–—]\s/);
    if (hyphenSplit.length >= 2) {
      const [rawTitle, ...rest] = hyphenSplit;
      const rawArtist = rest.join(' - ');
      const titleCandidate = rawTitle.trim();
      const artistCandidate = rawArtist.trim();
      if (titleCandidate && artistCandidate) {
        result.title = titleCandidate;
        result.artist = artistCandidate;
        return result;
      }
    }

    const bySplit = trimmed.split(/\s+[bB]y\s+/);
    if (bySplit.length === 2) {
      const [maybeTitle, maybeArtist] = bySplit.map(part => part.trim());
      if (maybeTitle && maybeArtist) {
        result.title = maybeTitle;
        result.artist = maybeArtist;
        return result;
      }
    }

    return null;
  },

  async searchLyricsPlusCatalog(searchTerm) {
    const trimmedQuery = searchTerm?.trim();
    if (!trimmedQuery) return null;

    for (const base of KPOE_SERVERS) {
      const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
      const url = `${normalizedBase}/v1/songlist/search?q=${encodeURIComponent(trimmedQuery)}`;

      try {
        const response = await fetchWithTimeout(url);
        if (response.ok) {
          const payload = await response.json();
          let results = [];
          if (Array.isArray(payload?.results)) {
            results = payload.results;
          } else if (Array.isArray(payload)) {
            results = payload;
          }

          if (results.length > 0) {
            const primary = results.find(item => item?.id && item.id.appleMusic);
            return primary ?? results[0];
          }
        }
      } catch (error) {
        // Ignore and try next server
      }
    }
    return null;
  },

  async resolveSongMetadata(songTitle, songArtist, songAlbum, durationMs, musicId, isrc, query) {
    const metadata = {
      title: songTitle?.trim() ?? '',
      artist: songArtist?.trim() ?? '',
      album: songAlbum?.trim() || undefined,
      durationMs: undefined,
    };

    if (typeof durationMs === 'number' && durationMs > 0) {
      metadata.durationMs = durationMs;
    }

    let appleId = musicId;
    let catalogIsrc = isrc;

    if (query && (!metadata.title || !metadata.artist || !metadata.album)) {
      const parsed = this.parseQueryMetadata(query);
      if (parsed) {
        if (!metadata.title && parsed.title) metadata.title = parsed.title;
        if (!metadata.artist && parsed.artist) metadata.artist = parsed.artist;
        if (!metadata.album && parsed.album) metadata.album = parsed.album;
      }
    }

    if (query && (!metadata.title || !metadata.artist)) {
      const catalogResult = await this.searchLyricsPlusCatalog(query);
      if (catalogResult) {
        if (!metadata.title && catalogResult.title) metadata.title = catalogResult.title;
        if (!metadata.artist && catalogResult.artist) metadata.artist = catalogResult.artist;
        if (!metadata.album && catalogResult.album) metadata.album = catalogResult.album;
        if (metadata.durationMs == null && typeof catalogResult.durationMs === 'number' && catalogResult.durationMs > 0) {
          metadata.durationMs = catalogResult.durationMs;
        }
        if (!appleId && catalogResult.id?.appleMusic) appleId = catalogResult.id.appleMusic;
        if (!catalogIsrc && catalogResult.isrc) catalogIsrc = catalogResult.isrc;
      }
    }

    const trimmedTitle = metadata.title?.trim() ?? '';
    const trimmedArtist = metadata.artist?.trim() ?? '';
    const trimmedAlbum = metadata.album?.trim();
    const sanitizedDuration = typeof metadata.durationMs === 'number' && Number.isFinite(metadata.durationMs) && metadata.durationMs > 0
      ? Math.round(metadata.durationMs)
      : undefined;

    const finalMetadata = trimmedTitle && trimmedArtist
      ? {
          title: trimmedTitle,
          artist: trimmedArtist,
          album: trimmedAlbum || undefined,
          durationMs: sanitizedDuration,
        }
      : undefined;

    return {
      metadata: finalMetadata,
      appleId,
      catalogIsrc,
    };
  },

  parseLrcSubtitles(lrc) {
    if (!lrc || typeof lrc !== 'string') return [];

    const lines = [];
    const rawLines = lrc.split('\n');
    const parsed = [];

    for (const raw of rawLines) {
      const match = raw.match(/^\[(\d{1,3}):(\d{2})\.(\d{1,3})\]\s?(.*)$/);
      if (!match) continue;

      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fractionStr = match[3];
      let ms = 0;
      if (fractionStr.length === 1) {
        ms = parseInt(fractionStr, 10) * 100;
      } else if (fractionStr.length === 2) {
        ms = parseInt(fractionStr, 10) * 10;
      } else if (fractionStr.length === 3) {
        ms = parseInt(fractionStr, 10);
      }
      const timestamp = (minutes * 60 + seconds) * 1000 + ms;
      const text = match[4] || '';
      parsed.push({ timestamp, text });
    }

    for (let i = 0; i < parsed.length; i += 1) {
      const { timestamp, text } = parsed[i];
      const endtime = i + 1 < parsed.length ? parsed[i + 1].timestamp : timestamp + 5000;

      if (!text.trim()) continue;

      const syllable = {
        text,
        part: false,
        timestamp,
        endtime,
        lineSynced: true,
      };

      lines.push({
        id: i,
        text: [syllable],
        background: false,
        backgroundText: [],
        oppositeTurn: false,
        timestamp,
        endtime,
        isWordSynced: false,
      });
    }

    return lines;
  },

  calculateLineAlignments(lineSingers, agentTypes) {
    const lineSideAssignments = new Array(lineSingers.length).fill(undefined);
    let currentSideIsLeft = true;
    let lastPersonSingerId = null;
    let rightCount = 0;
    let totalCount = 0;

    lineSingers.forEach((singerId, index) => {
      let sideClass;
      if (singerId) {
        let type = agentTypes[singerId];
        if (!type) {
          if (singerId === 'v1000') {
            type = 'group';
          } else if (singerId === 'v2000') {
            type = 'other';
          } else {
            type = 'person';
          }
        }

        if (type === 'group') {
          sideClass = 'start';
        } else {
          if (lastPersonSingerId === null) {
            currentSideIsLeft = type !== 'other';
          } else if (singerId !== lastPersonSingerId) {
            currentSideIsLeft = !currentSideIsLeft;
          }
          sideClass = currentSideIsLeft ? 'start' : 'end';
          lastPersonSingerId = singerId;
        }
      }

      if (sideClass) {
        totalCount += 1;
        if (sideClass === 'end') rightCount += 1;
      }
      lineSideAssignments[index] = sideClass;
    });

    if (totalCount > 0 && Math.round((rightCount / totalCount) * 100) >= 85) {
      const flip = (s) => {
        if (s === 'start') return 'end';
        if (s === 'end') return 'start';
        return s;
      };
      for (let i = 0; i < lineSideAssignments.length; i += 1) {
        lineSideAssignments[i] = flip(lineSideAssignments[i]);
      }
    }
    return lineSideAssignments;
  },

  parseTTML(ttmlString) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(ttmlString, 'text/xml');

      const translations = {};
      const transliterations = {};
      const agentMap = {};

      const agents = doc.getElementsByTagName('ttm:agent');
      for (let i = 0; i < agents.length; i += 1) {
        const agent = agents[i];
        const id = agent.getAttribute('xml:id');
        const type = agent.getAttribute('type');
        if (id && type) {
          agentMap[id] = type;
        }
      }

      const translationNodes = doc.getElementsByTagName('translation');
      for (let i = 0; i < translationNodes.length; i += 1) {
        const texts = translationNodes[i].getElementsByTagName('text');
        for (let j = 0; j < texts.length; j += 1) {
          const textNode = texts[j];
          const key = textNode.getAttribute('for');
          if (key && textNode.textContent) {
            translations[key] = textNode.textContent;
          }
        }
      }

      const timeToMs = (timeStr) => {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        let seconds = 0;
        if (parts.length === 2) {
          seconds = parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
        } else if (parts.length === 3) {
          seconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
        } else {
          seconds = parseFloat(parts[0]);
        }
        return Math.round(seconds * 1000);
      };

      const transliterationNodes = doc.getElementsByTagName('transliteration');
      for (let i = 0; i < transliterationNodes.length; i += 1) {
        const texts = transliterationNodes[i].getElementsByTagName('text');
        for (let j = 0; j < texts.length; j += 1) {
          const textNode = texts[j];
          const key = textNode.getAttribute('for');
          if (!key) continue;

          const spans = Array.from(textNode.getElementsByTagName('span')).filter(span => span.getAttribute('begin'));

          if (spans.length > 0) {
            const syllabus = [];
            let fullText = '';
            for (let k = 0; k < spans.length; k += 1) {
              const span = spans[k];
              const begin = span.getAttribute('begin');
              const end = span.getAttribute('end');
              let spanText = span.textContent || '';
              const nextNode = span.nextSibling;
              if (nextNode && nextNode.nodeType === 3 && /^\s/.test(nextNode.textContent || '') && !spanText.endsWith(' ')) {
                spanText += ' ';
              }
              if (spanText.trim() === '') continue;

              syllabus.push({
                time: timeToMs(begin),
                duration: timeToMs(end) - timeToMs(begin),
                text: spanText,
              });
              fullText += spanText;
            }
            transliterations[key] = { text: fullText.trim(), syllabus };
          } else if (textNode.textContent) {
            transliterations[key] = {
              text: textNode.textContent.trim().replace(/\s+/g, ' '),
            };
          }
        }
      }

      const lines = [];
      const pNodes = doc.getElementsByTagName('p');

      const lineSingers = [];
      for (let i = 0; i < pNodes.length; i += 1) {
        lineSingers.push(pNodes[i].getAttribute('ttm:agent') || undefined);
      }
      const alignments = this.calculateLineAlignments(lineSingers, agentMap);

      for (let i = 0; i < pNodes.length; i += 1) {
        const p = pNodes[i];
        const key = p.getAttribute('itunes:key');
        const beginMs = timeToMs(p.getAttribute('begin'));
        const endMs = timeToMs(p.getAttribute('end'));

        let songPart;
        if (p.parentNode && p.parentNode.tagName === 'div') {
          songPart = p.parentNode.getAttribute('itunes:songPart') || undefined;
        }

        const mainSyllables = [];
        const bgSyllables = [];

        const spans = p.getElementsByTagName('span');
        if (spans.length > 0) {
          for (let j = 0; j < spans.length; j += 1) {
            const span = spans[j];

            if (span.getAttribute('ttm:role') === 'x-bg') {
              const bgInnerSpans = span.getElementsByTagName('span');
              for (let k = 0; k < bgInnerSpans.length; k += 1) {
                const bgSpan = bgInnerSpans[k];
                let bgText = bgSpan.textContent || '';
                const nextNode = bgSpan.nextSibling;
                if (nextNode && nextNode.nodeType === 3 && /^\s/.test(nextNode.textContent || '') && !bgText.endsWith(' ')) {
                  bgText += ' ';
                }
                bgSyllables.push({
                  text: bgText,
                  timestamp: timeToMs(bgSpan.getAttribute('begin')),
                  endtime: timeToMs(bgSpan.getAttribute('end')),
                  part: false,
                });
              }
              continue;
            }

            if (span.parentNode && span.parentNode.getAttribute?.('ttm:role') === 'x-bg') {
              continue;
            }

            let text = span.textContent || '';
            const nextNode = span.nextSibling;
            if (nextNode && nextNode.nodeType === 3 && /^\s/.test(nextNode.textContent || '') && !text.endsWith(' ')) {
              text += ' ';
            }
            mainSyllables.push({
              text,
              timestamp: timeToMs(span.getAttribute('begin')),
              endtime: timeToMs(span.getAttribute('end')),
              part: false,
            });
          }
        } else {
          mainSyllables.push({
            text: p.textContent?.trim() || '',
            timestamp: beginMs,
            endtime: endMs,
            part: false,
            lineSynced: true,
          });
        }

        const alignment = alignments[i];
        const lineTransliterationItem = key ? transliterations[key] : undefined;

        if (lineTransliterationItem && mainSyllables.length > 1 && spans.length > 0) {
          if (lineTransliterationItem.syllabus && lineTransliterationItem.syllabus.length === mainSyllables.length) {
            mainSyllables.forEach((syl, mapIdx) => {
              syl.romanizedText = lineTransliterationItem.syllabus[mapIdx].text;
            });
          } else {
            const lineTransliteration = lineTransliterationItem.text;
            const romanWords = lineTransliteration.split(/\s+/).filter(Boolean);

            const syllableGroups = [];
            for (let si = 0; si < mainSyllables.length; si += 1) {
              if (mainSyllables[si].part && syllableGroups.length > 0) {
                syllableGroups[syllableGroups.length - 1].push(si);
              } else {
                syllableGroups.push([si]);
              }
            }

            const isCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(mainSyllables.map(s => s.text).join(''));

            if (romanWords.length === syllableGroups.length) {
              syllableGroups.forEach((group, gi) => {
                mainSyllables[group[0]].romanizedText = romanWords[gi];
              });
            } else if (romanWords.length === mainSyllables.length) {
              mainSyllables.forEach((syl, mapIdx) => {
                syl.romanizedText = romanWords[mapIdx];
              });
            } else if (isCJK) {
              let romanIdx = 0;
              for (const group of syllableGroups) {
                const syl = mainSyllables[group[0]];
                const sylText = group.map(gIndex => mainSyllables[gIndex].text).join('');
                const validChars = sylText.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7afA-Za-z0-9]/g) || [];
                const needed = validChars.length;
                if (needed > 0 && romanIdx < romanWords.length) {
                  syl.romanizedText = romanWords.slice(romanIdx, romanIdx + needed).join(' ');
                  romanIdx += needed;
                }
              }
            }
          }
        }

        lines.push({
          id: i,
          text: mainSyllables,
          background: bgSyllables.length > 0,
          backgroundText: bgSyllables,
          timestamp: beginMs,
          endtime: endMs,
          isWordSynced: spans.length > 0,
          alignment,
          songPart,
          translation: key ? translations[key] : undefined,
          romanizedText: lineTransliterationItem?.text,
          oppositeTurn: alignment === 'end',
        });
      }

      return lines;
    } catch (e) {
      console.error('Failed to parse TTML', e);
      return null;
    }
  },

  convertKPoeLyrics(payload) {
    if (!payload) return null;

    let rawLyrics = null;
    if (Array.isArray(payload?.lyrics)) {
      rawLyrics = payload.lyrics;
    } else if (Array.isArray(payload?.data?.lyrics)) {
      rawLyrics = payload.data.lyrics;
    } else if (Array.isArray(payload?.data)) {
      rawLyrics = payload.data;
    }

    if (!rawLyrics || rawLyrics.length === 0) return null;

    const sanitizedEntries = rawLyrics.filter((item) => Boolean(item));
    const lines = [];
    const isLineType = payload.type === 'Line' || payload.type === 'line';

    const agentTypes = {};
    if (payload.metadata?.agents) {
      Object.entries(payload.metadata.agents).forEach(([key, agent]) => {
        const mappedKey = agent.alias || key;
        agentTypes[mappedKey] = agent.type;
      });
    }

    const lineSingers = sanitizedEntries.map((entry) => entry.element?.singer);
    const alignments = this.calculateLineAlignments(lineSingers, agentTypes);

    for (let i = 0; i < sanitizedEntries.length; i += 1) {
      const entry = sanitizedEntries[i];
      const start = this.toMilliseconds(entry.time);
      const duration = this.toMilliseconds(entry.duration);

      const alignment = alignments[i];
      const lineText = typeof entry.text === 'string' ? entry.text : '';
      const lineStart = this.toMilliseconds(entry.time);
      const lineDuration = this.toMilliseconds(entry.duration);
      const explicitEnd = this.toMilliseconds(entry.endTime);
      const lineEnd = explicitEnd || lineStart + (lineDuration || 0);

      let syllabus = [];
      if (Array.isArray(entry.syllabus)) {
        syllabus = entry.syllabus.filter((s) => Boolean(s));
      } else if (Array.isArray(entry.words)) {
        syllabus = entry.words.filter((s) => Boolean(s));
      }

      const mainSyllables = [];
      const backgroundSyllables = [];

      if (!isLineType && syllabus.length > 0) {
        for (const syl of syllabus) {
          const sylStart = this.toMilliseconds(syl.time, lineStart);
          const sylDuration = this.toMilliseconds(syl.duration);
          const sylEnd = sylDuration === 0 && syllabus.length === 1 ? lineEnd : sylStart + sylDuration;

          const syllable = {
            text: typeof syl.text === 'string' ? syl.text : '',
            part: Boolean(syl.part),
            timestamp: sylStart,
            endtime: sylEnd,
          };

          if (syl.isBackground) {
            backgroundSyllables.push(syllable);
          } else {
            mainSyllables.push(syllable);
          }
        }
      }

      if (mainSyllables.length === 0 && lineText) {
        mainSyllables.push({
          text: lineText,
          part: false,
          timestamp: lineStart,
          endtime: lineEnd || lineStart,
          lineSynced: isLineType,
        });
      }

      const hasWordSync = mainSyllables.length > 0 || backgroundSyllables.length > 0;

      const { transliteration } = entry;
      let romanizedTextFromPayload;

      if (transliteration) {
        romanizedTextFromPayload = transliteration.text;
        if (Array.isArray(transliteration.syllabus) && transliteration.syllabus.length === mainSyllables.length) {
          transliteration.syllabus.forEach((s, idx) => {
            mainSyllables[idx].romanizedText = s.text;
          });
        }
      }

      const translationText = entry.translation?.text;

      const lineResult = {
        id: i,
        text: mainSyllables,
        background: backgroundSyllables.length > 0,
        backgroundText: backgroundSyllables,
        oppositeTurn: alignment === 'end' || (Array.isArray(entry.element) ? entry.element.includes('opposite') || entry.element.includes('right') : false),
        timestamp: lineStart,
        endtime: start + duration,
        isWordSynced: isLineType ? false : hasWordSync,
        alignment,
        songPart: entry.element?.songPart,
        romanizedText: romanizedTextFromPayload,
        translation: translationText,
      };

      lines.push(lineResult);
    }

    return lines;
  },

  getRankForCollected(sourceLabel, parsedLines) {
    const lower = sourceLabel.toLowerCase();
    const hasWordSync = parsedLines.some(line => line.text && Array.isArray(line.text) && line.text.length > 1);
    const isUnsynced = parsedLines.length > 0 && parsedLines.every(line => line.timestamp === 0 && line.endtime === 0);
    const isQQ = lower.includes('qq') || lower.includes('lyricsplus');

    if (lower.includes('apple') && hasWordSync) return 1;
    if (isQQ && hasWordSync) return 2;
    if (lower.includes('musixmatch') && hasWordSync) return 3;
    if (lower.includes('tidal') && hasWordSync) return 4;
    if (lower.includes('lrclib') && hasWordSync) return 5;
    if (hasWordSync) return 6;

    if (lower.includes('apple') && !hasWordSync && !isUnsynced) return 7;
    if (isQQ && !hasWordSync && !isUnsynced) return 8;
    if (lower.includes('musixmatch') && !hasWordSync && !isUnsynced) return 9;
    if (lower.includes('tidal') && !hasWordSync && !isUnsynced) return 10;
    if (lower.includes('lrclib') && !hasWordSync && !isUnsynced) return 11;
    if (!hasWordSync && !isUnsynced) return 12;

    if (lower.includes('apple') && isUnsynced) return 13;
    if (isQQ && isUnsynced) return 14;
    if (lower.includes('musixmatch') && isUnsynced) return 15;
    if (lower.includes('tidal') && isUnsynced) return 16;
    if (lower.includes('lrclib') && isUnsynced) return 17;
    if (lower.includes('genius')) return 18;

    return 20;
  },

  mergeAndSortSources(collectedSources) {
    const uniqueSourcesMap = new Map();

    for (const source of collectedSources) {
      const normalizedSource = source.source.toLowerCase().includes('lyricsplus') ? 'QQ' : source.source;

      if (!uniqueSourcesMap.has(normalizedSource)) {
        uniqueSourcesMap.set(normalizedSource, {
          ...source,
          source: normalizedSource,
        });
      }
    }

    return Array.from(uniqueSourcesMap.values()).sort(
      (a, b) => this.getRankForCollected(a.source, a.lines) - this.getRankForCollected(b.source, b.lines)
    );
  },

  async fetchLyricsFromYouLyPlus(title, artist, isrc, metadata = {}) {
    if ((!title || !artist) && !isrc) return [];

    const params = new URLSearchParams();
    if (title) params.append('title', title);
    if (artist) params.append('artist', artist);
    if (isrc) params.append('isrc', isrc);

    if (metadata.album) {
      params.append('album', metadata.album);
    }

    if (metadata.durationMs && metadata.durationMs > 0) {
      params.append('duration', Math.round(metadata.durationMs / 1000).toString());
    }

    const allResults = [];

    // Tenta BiniLyrics cache API primeiro
    try {
      let cacheData = null;

      if (isrc) {
        try {
          const isrcUrl = `https://lyrics-api.binimum.org/?isrc=${encodeURIComponent(isrc)}`;
          const isrcRes = await fetchWithTimeout(isrcUrl);
          if (isrcRes.ok) {
            const data = await isrcRes.json();
            if (data.results && data.results.length > 0) {
              cacheData = data;
            }
          }
        } catch (isrcErr) {}
      }

      if (!cacheData && title && artist) {
        const cacheParams = new URLSearchParams({ track: title, artist });
        if (metadata.album) cacheParams.append('album', metadata.album);
        if (metadata.durationMs && metadata.durationMs > 0) {
          cacheParams.append('duration', Math.round(metadata.durationMs / 1000).toString());
        }

        const cacheUrl = `https://lyrics-api.binimum.org/?${cacheParams.toString()}`;
        const cacheRes = await fetchWithTimeout(cacheUrl);
        if (cacheRes.ok) {
          cacheData = await cacheRes.json();
        }
      }

      if (cacheData && cacheData.results && cacheData.results.length > 0) {
        const result = cacheData.results[0];
        if (result.timing_type === 'word' && result.lyricsUrl) {
          const ttmlRes = await fetchWithTimeout(result.lyricsUrl);
          if (ttmlRes.ok) {
            const ttmlText = await ttmlRes.text();
            const lines = this.parseTTML(ttmlText);
            if (lines && lines.length > 0) {
              allResults.push({ lines, source: 'BiniLyrics' });
              return allResults;
            }
          }
        } else {
          // Fallback lyricsplus
          const fallbackParams = new URLSearchParams(params);
          const fallbackUrl = `https://lyricsplus.binimum.org/v2/lyrics/get?${fallbackParams.toString()}`;
          try {
            const fallbackRes = await fetchWithTimeout(fallbackUrl);
            if (fallbackRes.ok) {
              const payload = await fallbackRes.json();
              const lines = this.convertKPoeLyrics(payload);
              const hasWordSync = lines?.some(line => line.text && Array.isArray(line.text) && line.text.length > 1);
              if (lines && lines.length > 0 && hasWordSync) {
                const sourceLabel = payload?.metadata?.source || payload?.metadata?.provider || 'LyricsPlus (KPoe)';
                allResults.push({ lines, source: sourceLabel });
                return allResults;
              }
            }
          } catch (fallbackError) {}

          if (result.lyricsUrl) {
            const ttmlRes = await fetchWithTimeout(result.lyricsUrl);
            if (ttmlRes.ok) {
              const ttmlText = await ttmlRes.text();
              const lines = this.parseTTML(ttmlText);
              if (lines && lines.length > 0) {
                allResults.push({ lines, source: 'BiniLyrics' });
                return allResults;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Cache API failed', e);
    }

    const shuffledServers = [...KPOE_SERVERS].sort(() => Math.random() - 0.5).slice(0, 3);

    // Busca paralela com timeout reduzido de 3000ms para acelerar o carregamento
    const fetchPromises = shuffledServers.map(async (base) => {
      const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
      const url = `${normalizedBase}/v2/lyrics/get?${params.toString()}`;
      try {
        const response = await fetchWithTimeout(url, {}, 3000);
        if (response.ok) {
          const payload = await response.json();
          if (payload) {
            const lines = this.convertKPoeLyrics(payload);
            if (lines && lines.length > 0) {
              const sourceLabel = payload?.metadata?.source || payload?.metadata?.provider || 'LyricsPlus (KPoe)';
              return { lines, source: sourceLabel };
            }
          }
        }
      } catch (err) {}
      return null;
    });

    const results = await Promise.all(fetchPromises);
    results.forEach(res => {
      if (res) {
        allResults.push(res);
      }
    });

    const hasHighRankResult = allResults.some(r => this.getRankForCollected(r.source, r.lines) <= 2);
    if (!hasHighRankResult) {
      try {
        const fallbackParams = new URLSearchParams(params);
        const url = `https://lyricsplus.binimum.org/v2/lyrics/get?${fallbackParams.toString()}`;
        const response = await fetchWithTimeout(url);
        if (response.ok) {
          const payload = await response.json();
          if (payload) {
            const lines = this.convertKPoeLyrics(payload);
            const sourceLabel = payload?.metadata?.source || payload?.metadata?.provider || 'LyricsPlus (KPoe)';
            const hasWordSync = lines?.some(line => line.text && Array.isArray(line.text) && line.text.length > 1);
            if (lines && lines.length > 0 && hasWordSync) {
              allResults.push({ lines, source: sourceLabel });
            }
          }
        }
      } catch (error) {}
    }

    return allResults;
  },

  async fetchLyricsFromLrclib(metadata) {
    const title = metadata.title?.trim();
    const artist = metadata.artist?.trim();
    if (!title || !artist) return null;

    try {
      const searchQuery = `${artist} ${title}`;
      const params = new URLSearchParams({ q: searchQuery });
      const response = await fetchWithTimeout(`https://lrclib.net/api/search?${params.toString()}`);

      if (!response.ok) return null;
      const results = await response.json();
      if (!Array.isArray(results) || results.length === 0) return null;

      const withSynced = results.find(r => r.syncedLyrics && typeof r.syncedLyrics === 'string');
      const bestMatch = withSynced || results[0];

      if (bestMatch.syncedLyrics) {
        const lines = this.parseLrcSubtitles(bestMatch.syncedLyrics);
        if (lines.length > 0) {
          return { lines, source: 'LRCLIB' };
        }
      }

      if (bestMatch.plainLyrics && typeof bestMatch.plainLyrics === 'string') {
        const plainLines = bestMatch.plainLyrics.split('\n').filter(l => l.trim());
        if (plainLines.length > 0) {
          const lines = plainLines.map((text) => ({
            text: [{ text, part: false, timestamp: 0, endtime: 0 }],
            background: false,
            backgroundText: [],
            oppositeTurn: false,
            timestamp: 0,
            endtime: 0,
            isWordSynced: false,
          }));
          return { lines, source: 'LRCLIB (unsynced)' };
        }
      }
    } catch {}
    return null;
  },

  // Removed fetchLyricsFromGenius

  // Traduz um array de lines usando GoogleService
  async translateLyrics(lines) {
    if (!lines || lines.length === 0) return [];
    try {
      const textsToTranslate = lines.map(line => line.text.map(s => s.text).join(''));
      const translatedBatch = await GoogleService.translate(textsToTranslate, 'pt');

      return lines.map((line, idx) => {
        const transText = translatedBatch[idx] || line.text.map(s => s.text).join('');
        return {
          ...line,
          translation: transText
        };
      });
    } catch (error) {
      console.error('Falha ao traduzir letras:', error);
      return lines;
    }
  },

  // Romaniza um array de lines usando GoogleService
  async romanizeLyrics(lines) {
    if (!lines || lines.length === 0) return [];
    try {
      const romanized = await GoogleService.romanize(lines);
      return romanized;
    } catch (error) {
      console.error('Falha ao romanizar letras:', error);
      return lines;
    }
  },

  async getLyrics(trackName, artistName, albumName, durationMs, provider = 'betterlyrics') {
    const resolved = await this.resolveSongMetadata(trackName, artistName, albumName, durationMs, null, null, `${artistName} - ${trackName}`);
    const metadata = resolved.metadata || { title: trackName, artist: artistName, album: albumName, durationMs };

    const collectedSources = [];

    // 1. Sempre busca da base Apple / LyricsPlus (que tem word-sync)
    const youLyResults = await this.fetchLyricsFromYouLyPlus(metadata.title, metadata.artist, resolved.catalogIsrc, metadata);
    if (youLyResults && youLyResults.length > 0) {
      collectedSources.push(...youLyResults);
    }

    // Prioriza busca palavra-por-palavra (ignora LRCLIB se já tivermos letras sincronizadas por palavra)
    const hasWordSync = collectedSources.some(src => 
      src.lines && src.lines.some(line => line.text && Array.isArray(line.text) && line.text.length > 1)
    );

    if (!hasWordSync) {
      // 2. Só busca do LRCLIB (geralmente line-sync) se não tivermos encontrado palavra-por-palavra
      const lrclibResult = await this.fetchLyricsFromLrclib(metadata);
      if (lrclibResult && lrclibResult.lines.length > 0) {
        collectedSources.push(lrclibResult);
      }
    }

    // Fontes baseadas em Genius removidas a pedido do usuário

    if (collectedSources.length > 0) {
      const sortedSources = this.mergeAndSortSources(collectedSources);
      const bestSource = sortedSources[0];

      return {
        original: bestSource.lines,
        translation: null,
        romanized: null,
        source: bestSource.source,
        availableSources: sortedSources
      };
    }

    return null;
  }
};

export default LyricsService;
