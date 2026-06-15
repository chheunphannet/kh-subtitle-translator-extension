export interface SubtitleCue {
  id: string;
  startTime: string; // HH:MM:SS.mmm or MM:SS.cs
  endTime: string;
  text: string;
  originalText: string;
  rawHeader?: string; // For formats like ASS
}

// Convert timestamp comma to dot for VTT compatibility
export function srtTimeToVttTime(srtTime: string): string {
  return srtTime.replace(',', '.');
}

// Convert timestamp dot to comma for SRT compatibility
export function vttTimeToSrtTime(vttTime: string): string {
  return vttTime.replace('.', ',');
}

// Helper to format millisecond count to VTT timestamp HH:MM:SS.mmm
export function formatMsToVttTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

// Helper to parse VTT/SRT timestamp to milliseconds
export function parseTimeToMs(timeStr: string): number {
  const normalized = timeStr.replace(',', '.').trim();
  const parts = normalized.split(':');
  
  let hours = 0;
  let minutes = 0;
  let secondsWithMs = '';

  if (parts.length === 3) {
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
    secondsWithMs = parts[2];
  } else if (parts.length === 2) {
    minutes = parseInt(parts[0], 10);
    secondsWithMs = parts[1];
  } else {
    secondsWithMs = parts[0];
  }

  const secParts = secondsWithMs.split('.');
  const seconds = parseInt(secParts[0], 10);
  const ms = secParts[1] ? parseInt(secParts[1].padEnd(3, '0').substring(0, 3), 10) : 0;

  return (hours * 3600000) + (minutes * 60000) + (seconds * 1000) + ms;
}

// ------------------------------------
// SRT Parser & Builder
// ------------------------------------
export function parseSrt(content: string): SubtitleCue[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  const blocks = normalized.split(/\n\n+/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 2) continue;

    let id = '';
    let timeLineIdx = 0;

    if (/^\d+$/.test(lines[0].trim())) {
      id = lines[0].trim();
      timeLineIdx = 1;
    } else {
      id = String(cues.length + 1);
      timeLineIdx = 0;
    }

    const timeLine = lines[timeLineIdx];
    if (!timeLine || !timeLine.includes('-->')) continue;

    const [start, end] = timeLine.split('-->').map(s => s.trim());
    const text = lines.slice(timeLineIdx + 1).join('\n');

    cues.push({
      id,
      startTime: srtTimeToVttTime(start),
      endTime: srtTimeToVttTime(end),
      text: text,
      originalText: text
    });
  }

  return cues;
}

export function buildSrt(cues: SubtitleCue[]): string {
  return cues.map((cue, index) => {
    const start = vttTimeToSrtTime(cue.startTime);
    const end = vttTimeToSrtTime(cue.endTime);
    return `${index + 1}\n${start} --> ${end}\n${cue.text}`;
  }).join('\n\n') + '\n';
}

// ------------------------------------
// VTT Parser & Builder
// ------------------------------------
export function parseVtt(content: string): SubtitleCue[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n');
  const cues: SubtitleCue[] = [];
  
  let isHeader = true;
  let blockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (isHeader) {
      if (line === '' || i === lines.length - 1) {
        isHeader = false;
      }
      continue;
    }

    if (line !== '') {
      blockLines.push(lines[i]); // Keep original casing/spacing of lines
    }

    if (line === '' || i === lines.length - 1) {
      if (blockLines.length > 0) {
        let id = '';
        let timeLineIdx = 0;

        if (!blockLines[0].includes('-->') && blockLines.length > 1) {
          id = blockLines[0].trim();
          timeLineIdx = 1;
        } else {
          id = String(cues.length + 1);
          timeLineIdx = 0;
        }

        const timeLine = blockLines[timeLineIdx];
        if (timeLine && timeLine.includes('-->')) {
          const [start, end] = timeLine.split('-->').map(s => s.trim().split(' ')[0]);
          const text = blockLines.slice(timeLineIdx + 1).join('\n');
          cues.push({
            id,
            startTime: start,
            endTime: end,
            text: text,
            originalText: text
          });
        }
        blockLines = [];
      }
    }
  }

  return cues;
}

export function buildVtt(cues: SubtitleCue[]): string {
  const header = 'WEBVTT\n\n';
  const body = cues.map((cue, index) => {
    return `${cue.id || index + 1}\n${cue.startTime} --> ${cue.endTime}\n${cue.text}`;
  }).join('\n\n');
  return header + body + '\n';
}

// ------------------------------------
// ASS Parser & Builder
// ------------------------------------
// Extracts dialogue lines, parses the start/end times and texts,
// and preserves the non-dialogue headers so we can output a fully working ASS file.
export interface AssFile {
  headers: string[]; // Lines before [Events]
  eventsHeader: string; // "Format: ..."
  cues: SubtitleCue[];
}

export function parseAss(content: string): AssFile {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const headers: string[] = [];
  let eventsHeader = '';
  const cues: SubtitleCue[] = [];
  
  let inEvents = false;
  let formatColumns: string[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.startsWith('[Events]')) {
      inEvents = true;
      headers.push(line);
      continue;
    }

    if (!inEvents) {
      headers.push(line);
      continue;
    }

    if (line.startsWith('Format:')) {
      eventsHeader = line;
      formatColumns = line.replace('Format:', '').split(',').map(s => s.trim());
      continue;
    }

    if (line.startsWith('Dialogue:')) {
      const contentStr = line.substring('Dialogue:'.length).trim();
      const textColIndex = formatColumns.indexOf('Text');
      const startColIndex = formatColumns.indexOf('Start');
      const endColIndex = formatColumns.indexOf('End');
      
      if (textColIndex === -1 || startColIndex === -1 || endColIndex === -1) {
        headers.push(line);
        continue;
      }

      // Split content by comma but limit splits so the text column remains intact
      const parts: string[] = [];
      let remaining = contentStr;
      for (let i = 0; i < textColIndex; i++) {
        const commaIdx = remaining.indexOf(',');
        if (commaIdx === -1) break;
        parts.push(remaining.substring(0, commaIdx).trim());
        remaining = remaining.substring(commaIdx + 1);
      }
      parts.push(remaining.trim());

      const startTimeRaw = parts[startColIndex];
      const endTimeRaw = parts[endColIndex];
      let text = parts[textColIndex] || '';

      if (!startTimeRaw || !endTimeRaw) {
        headers.push(line);
        continue;
      }

      // Save raw header/parts to rebuild it later
      // Replace text index with placeholder
      parts[textColIndex] = '__TEXT_PLACEHOLDER__';
      const rawHeader = 'Dialogue: ' + parts.join(',');

      // Clean ASS override tags (e.g. {\pos(10,10)}) for translation
      // Keep them in originalText so we know if we need to put it back or ignore
      const cleanText = text.replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').replace(/\\n/gi, '\n');

      cues.push({
        id: String(cues.length + 1),
        startTime: assTimeToVttTime(startTimeRaw),
        endTime: assTimeToVttTime(endTimeRaw),
        text: cleanText,
        originalText: text, // Keep original including tags
        rawHeader: rawHeader
      });
    } else {
      headers.push(line);
    }
  }

  return { headers, eventsHeader, cues };
}

export function buildAss(assFile: AssFile): string {
  const output: string[] = [];
  
  // Reconstruct headers
  let eventsIndex = -1;
  for (let i = 0; i < assFile.headers.length; i++) {
    output.push(assFile.headers[i]);
    if (assFile.headers[i].startsWith('[Events]')) {
      eventsIndex = i;
    }
  }

  // Insert events headers
  if (assFile.eventsHeader) {
    // Insert right after [Events]
    const eventsPos = output.indexOf('[Events]');
    if (eventsPos !== -1) {
      output.splice(eventsPos + 1, 0, assFile.eventsHeader);
    } else {
      output.push(assFile.eventsHeader);
    }
  }

  // Add dialogue cues
  for (const cue of assFile.cues) {
    if (cue.rawHeader) {
      // Re-insert translated text into dialogue template
      // If originalText had ASS codes (like \N), convert newlines back
      const formattedText = cue.text.replace(/\n/g, '\\N');
      const dialogueLine = cue.rawHeader.replace('__TEXT_PLACEHOLDER__', formattedText);
      output.push(dialogueLine);
    }
  }

  return output.join('\n');
}

export function generateBasicAss(cues: SubtitleCue[]): string {
  const assHeader = `[Script Info]
Title: Translated Subtitle
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const body = cues.map(cue => {
    const start = vttTimeToAssTime(cue.startTime);
    const end = vttTimeToAssTime(cue.endTime);
    const text = cue.text.replace(/\n/g, '\\N');
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  }).join('\n');

  return `${assHeader}\n${body}\n`;
}

export function generateSubtitleExport(cues: SubtitleCue[], format: string, originalAssFile?: AssFile): { text: string, ext: string } {
  let text = "";
  let ext = format;
  
  if (format === 'ass') {
    if (originalAssFile) {
      originalAssFile.cues = cues;
      text = buildAss(originalAssFile);
    } else {
      text = generateBasicAss(cues);
    }
  } else if (format === 'lrc') {
    text = buildLrc(cues);
  } else if (format === 'srt') {
    text = buildSrt(cues);
  } else {
    text = buildVtt(cues);
    ext = 'vtt';
  }
  
  return { text, ext };
}

function assTimeToVttTime(assTime: string): string {
  const parts = assTime.split(':');
  if (parts.length < 3) return '00:00:00.000';
  
  const hours = parts[0].padStart(2, '0');
  const minutes = parts[1].padStart(2, '0');
  
  const secondsParts = parts[2].split('.');
  const seconds = secondsParts[0].padStart(2, '0');
  const centiseconds = secondsParts[1] || '00';
  const milliseconds = centiseconds.padEnd(3, '0').substring(0, 3);
  
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function vttTimeToAssTime(vttTime: string): string {
  const parts = vttTime.split(':');
  if (parts.length < 3) return '0:00:00.00';

  const hours = parseInt(parts[0], 10); // ASS hours can be single digit
  const minutes = parts[1].padStart(2, '0');
  
  const secondsParts = parts[2].split('.');
  const seconds = secondsParts[0].padStart(2, '0');
  const milliseconds = secondsParts[1] || '000';
  const centiseconds = milliseconds.padEnd(3, '0').substring(0, 2);

  return `${hours}:${minutes}:${seconds}.${centiseconds}`;
}

// ------------------------------------
// LRC Parser & Builder
// ------------------------------------
export function parseLrc(content: string): SubtitleCue[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const cues: SubtitleCue[] = [];
  
  // Format: [mm:ss.xx] lyric text or [mm:ss:xx] lyric text
  const timeRegex = /\[(\d{2}):(\d{2})[.:](\d{2})\]/g;

  for (const line of lines) {
    const text = line.replace(/\[\d{2}:\d{2}[.:]\d{2}\]/g, '').trim();
    if (!text) continue;

    let match;
    // An LRC line can contain multiple timestamps: [00:12.30][01:05.20] lyric text
    timeRegex.lastIndex = 0;
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const centiseconds = parseInt(match[3], 10);
      const ms = (minutes * 60000) + (seconds * 1000) + (centiseconds * 10);
      
      const vttStart = formatMsToVttTime(ms);
      // LRC has no end times, so we define end time as start time + 4 seconds
      const vttEnd = formatMsToVttTime(ms + 4000);

      cues.push({
        id: String(cues.length + 1),
        startTime: vttStart,
        endTime: vttEnd,
        text: text,
        originalText: text
      });
    }
  }

  // Sort cues by start time
  cues.sort((a, b) => parseTimeToMs(a.startTime) - parseTimeToMs(b.startTime));

  // Refine end times to prevent overlapping: end time is start of next cue
  for (let i = 0; i < cues.length - 1; i++) {
    const nextStart = parseTimeToMs(cues[i+1].startTime);
    const currStart = parseTimeToMs(cues[i].startTime);
    if (currStart + 4000 > nextStart) {
      cues[i].endTime = formatMsToVttTime(Math.max(currStart + 500, nextStart - 50));
    }
  }

  return cues;
}

export function buildLrc(cues: SubtitleCue[]): string {
  return cues.map(cue => {
    const parts = cue.startTime.split(':');
    const minutes = String(parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)).padStart(2, '0');
    const secondsParts = parts[2].split('.');
    const seconds = secondsParts[0].padStart(2, '0');
    const milliseconds = secondsParts[1] || '000';
    const centiseconds = milliseconds.padEnd(3, '0').substring(0, 2);
    
    return `[${minutes}:${seconds}.${centiseconds}]${cue.text}`;
  }).join('\n') + '\n';
}

// ------------------------------------
// Mapped languages matching website
// ------------------------------------
export const languagesList = [
  { value: "auto", name: "Auto-Detect (ស្វ័យប្រវត្ត)", nativelabel: "Auto" },
  { value: "km", name: "Khmer (ភាសាខ្មែរ)", nativelabel: "ភាសាខ្មែរ" },
  { value: "en", name: "English (អង់គ្លេស)", nativelabel: "English" },
  { value: "zh", name: "Simplified Chinese (ចិនសាមញ្ញ)", nativelabel: "简体" },
  { value: "zh-hant", name: "Traditional Chinese (ចិនបុរាណ)", nativelabel: "繁體" },
  { value: "ja", name: "Japanese (ជប៉ុន)", nativelabel: "日本語" },
  { value: "ko", name: "Korean (កូរ៉េ)", nativelabel: "한국어" },
  { value: "th", name: "Thai (ថៃ)", nativelabel: "ไทย" },
  { value: "vi", name: "Vietnamese (វៀតណាម)", nativelabel: "Tiếng Việt" },
  { value: "fr", name: "French (បារាំង)", nativelabel: "Français" },
  { value: "de", name: "German (អាល្លឺម៉ង់)", nativelabel: "Deutsch" },
  { value: "es", name: "Spanish (អេស្ប៉ាញ)", nativelabel: "Español" },
  { value: "ru", name: "Russian (រុស្ស៊ី)", nativelabel: "Русский" }
];

export function formatSubtitleText(originalText: string, translatedText: string, format: string): string {
  if (!translatedText) return originalText;
  if (!originalText || translatedText === originalText) return translatedText;
  
  switch (format) {
    case 'bilingual':
    case 'both':
    case 'translation_above':
      return `${translatedText}\n${originalText}`;
    case 'translation_below':
      return `${originalText}\n${translatedText}`;
    case 'translated':
    default:
      return translatedText;
  }
}
