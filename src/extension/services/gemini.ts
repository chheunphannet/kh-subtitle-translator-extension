import { SubtitleCue } from "../parsers";

// Regular expressions matching context translation markers
const MARKER_CLEANUP_RE = /\[\/?(TRANSLATE(_\d+)?|TRANSLTranslate_\d+|CONTEXT)\]/gi;
const NUMBERED_TRANSLATE_RE = /\[TRANSLATE_(\d+)\]([\s\S]*?)\[\/(?:TRANSLATE|TRANSLTranslate)_\d+\]/gi;
const UNNUMBERED_TRANSLATE_RE = /\[TRANSLATE\]([\s\S]*?)\[\/TRANSLATE\]/gi;

function cleanTranslatedContent(content: string): string {
  return content.replace(MARKER_CLEANUP_RE, "").trim();
}

// Extract a clean error message from Gemini API error responses
function parseGeminiError(status: number, rawText: string): string {
  // Helper to extract the first sentence/line of a message to keep it clean
  const cleanMessage = (msg: string): string => {
    let clean = msg.split("\n")[0].trim();
    const firstSentence = clean.split(".")[0].trim();
    if (firstSentence) {
      clean = firstSentence + ".";
    }
    return clean;
  };

  try {
    const json = JSON.parse(rawText);
    
    // 1. Google Gemini error structure: { error: { message: "..." } }
    if (json.error && typeof json.error === "object") {
      const msg = (json.error as any).message;
      if (typeof msg === "string" && msg.trim()) {
        return `Gemini API Error (${status}): ${cleanMessage(msg)}`;
      }
    }

    // 2. { error: "error message string" }
    if (typeof json.error === "string" && json.error.trim()) {
      return `Gemini API Error (${status}): ${cleanMessage(json.error)}`;
    }

    // 3. { message: "error message string" }
    if (typeof json.message === "string" && json.message.trim()) {
      return `Gemini API Error (${status}): ${cleanMessage(json.message)}`;
    }

    // 4. Other keys: "msg", "error_description", "description"
    const keys = ["msg", "error_description", "description"];
    for (const key of keys) {
      if (typeof json[key] === "string" && json[key].trim()) {
        return `Gemini API Error (${status}): ${cleanMessage(json[key])}`;
      }
    }

    // 5. Try to find the first string value in the parsed JSON object
    const findFirstString = (obj: any): string | null => {
      if (typeof obj === "string") return obj;
      if (obj && typeof obj === "object") {
        for (const k of Object.keys(obj)) {
          const val = obj[k];
          if (typeof val === "string" && val.trim()) return val;
          if (val && typeof val === "object") {
            const nested = findFirstString(val);
            if (nested) return nested;
          }
        }
      }
      return null;
    };
    const firstStr = findFirstString(json);
    if (firstStr) {
      return `Gemini API Error (${status}): ${cleanMessage(firstStr)}`;
    }
  } catch (_) {}

  // Fallback: If it starts with JSON syntax, try extracting via regex to find a string message (even if truncated!)
  let cleanText = rawText.trim();
  if (cleanText.startsWith("{") || cleanText.startsWith("[")) {
    // Matches "message": "value" (supports escaped quotes and matches even if truncated)
    const msgRegex = /"message"\s*:\s*"((?:[^"\\]|\\.)*)/i;
    const match = cleanText.match(msgRegex);
    if (match && match[1]) {
      const msgClean = match[1].replace(/\\n/g, " ").replace(/\\"/g, '"').replace(/\\/g, "").trim();
      return `Gemini API Error (${status}): ${cleanMessage(msgClean)}`;
    }

    const errRegex = /"error"\s*:\s*"((?:[^"\\]|\\.)*)/i;
    const matchErr = cleanText.match(errRegex);
    if (matchErr && matchErr[1]) {
      const errClean = matchErr[1].replace(/\\n/g, " ").replace(/\\"/g, '"').replace(/\\/g, "").trim();
      return `Gemini API Error (${status}): ${cleanMessage(errClean)}`;
    }

    // Strip JSON structure completely to avoid displaying brackets/braces/quotes
    cleanText = cleanText.replace(/[{}\[\]":,]/g, " ").replace(/\s+/g, " ").trim();
  }

  const short = cleanText.length > 150 ? cleanText.substring(0, 150) + "..." : cleanText;
  return `Gemini API Error (${status}): ${cleanMessage(short)}`;
}

function extractTranslatedLinesWithNumbers(response: string, expectedCount: number): string[] {
  const results = new Array<string>(expectedCount).fill("");
  NUMBERED_TRANSLATE_RE.lastIndex = 0;
  
  let match: RegExpExecArray | null;
  while ((match = NUMBERED_TRANSLATE_RE.exec(response)) !== null) {
    const idx = Number(match[1]);
    if (idx >= 0 && idx < expectedCount && !results[idx]) {
      results[idx] = cleanTranslatedContent(match[2].trim());
    }
  }

  const successCount = results.filter(Boolean).length;
  if (successCount > 0) {
    return results;
  }

  // Fallback: try unnumbered matching
  return extractTranslatedLines(response, expectedCount);
}

function extractTranslatedLines(response: string, expectedCount: number): string[] {
  UNNUMBERED_TRANSLATE_RE.lastIndex = 0;
  const matches: string[] = [];
  let match;

  while ((match = UNNUMBERED_TRANSLATE_RE.exec(response)) !== null) {
    matches.push(cleanTranslatedContent(match[1].trim()));
  }

  if (matches.length === expectedCount) {
    return matches;
  }

  // Fallback: try line split
  const lines = response
    .split("\n")
    .filter((line) => line.trim())
    .slice(0, expectedCount)
    .map((line) => cleanTranslatedContent(line));

  return lines.length === expectedCount ? lines : new Array(expectedCount).fill("");
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  contextWindow: number;
  contextBatchSize: number;
  delayTime: number;
  useCache: boolean;
  isMature?: boolean;
}

export const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  apiKey: "",
  model: "gemini-3.5-flash",
  temperature: 0.7,
  systemPrompt: "You are a professional subtitle translator. Translate the given text to the target language accurately, maintaining natural dialogue flow and character voices.",
  userPrompt: "Translate this text into ${targetLanguage}:\n\n${content}",
  contextWindow: 100,
  contextBatchSize: 3,
  delayTime: 200,
  useCache: true,
  isMature: false,
};

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 5,
  backoff = 2000
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    // If rate-limited (429) or server error (5xx), retry
    if ((response.status === 429 || response.status >= 500) && retries > 0) {
      console.warn(`API call returned ${response.status}. Retrying in ${backoff}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    return response;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw error;
    }
    if (retries > 0) {
      console.warn(`Fetch error: ${(error as Error).message}. Retrying in ${backoff}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

// Single segment direct translation
export async function translateSingleText(
  text: string,
  targetLanguage: string,
  sourceLanguage: string,
  config: GeminiConfig,
  signal?: AbortSignal
): Promise<string> {
  const { apiKey, model, temperature, systemPrompt, userPrompt, isMature } = config;
  if (!apiKey) throw new Error("Gemini API Key is missing. Configure it in extension settings.");

  const targetLangLabel = targetLanguage === "km" ? "Khmer" : targetLanguage === "zh" ? "Simplified Chinese" : targetLanguage;
  const sourceLangLabel = sourceLanguage === "auto" ? "Detect Language" : sourceLanguage;

  const formattedUserPrompt = userPrompt
    .replace("${targetLanguage}", targetLangLabel)
    .replace("${sourceLanguage}", sourceLangLabel)
    .replace("${content}", text);

  let finalSystemPrompt = systemPrompt;
  if (isMature) {
    finalSystemPrompt += "\n\nCRITICAL: This content contains mature, R-rated, or 18+ themes (violence, profanity, mature humor). You MUST translate these mature elements accurately, preserving the slang, tone, and profanity without censoring or filtering the text.";
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: formattedUserPrompt }] }],
      systemInstruction: { parts: [{ text: finalSystemPrompt }] },
      generationConfig: { temperature },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    }),
    signal
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(parseGeminiError(response.status, errText));
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error("Gemini response truncated - MAX_TOKENS reached.");
  }
  const translated = candidate?.content?.parts?.[0]?.text;
  if (typeof translated !== "string") {
    throw new Error("Invalid response format from Gemini API");
  }

  return translated.trim();
}

// Batch Translation with context
export async function translateBatchWithContext(
  cues: SubtitleCue[],
  targetLanguage: string,
  sourceLanguage: string,
  config: GeminiConfig,
  onProgress: (percent: number) => void,
  onBatchTranslated?: (batchStart: number, batchCues: SubtitleCue[], translatedTexts: string[]) => Promise<void> | void,
  signal?: AbortSignal,
  isTestConnection?: boolean
): Promise<string[]> {
  const { contextWindow, contextBatchSize, delayTime, isMature } = config;
  const contentLines = cues.map(c => c.text);
  const translatedLines = new Array<string>(contentLines.length).fill("");

  const targetLangLabel = targetLanguage === "km" ? "Khmer" : targetLanguage === "zh" ? "Simplified Chinese" : targetLanguage;
  const sourceLangLabel = sourceLanguage === "auto" ? "Detect Language" : sourceLanguage;

  let completedCount = 0;

  // Process cues in batches
  const batchSize = Math.max(1, Math.min(contextWindow, contentLines.length));
  
  // 1. Prepare all batches
  interface BatchInfo {
    index: number;
    batchStart: number;
    batchEnd: number;
    expectedCount: number;
    fullPrompt: string;
  }
  
  const batches: BatchInfo[] = [];
  let batchIdx = 0;
  for (let i = 0; i < contentLines.length; i += batchSize) {
    const batchStart = i;
    const batchEnd = Math.min(i + batchSize, contentLines.length);
    const expectedCount = batchEnd - batchStart;

    // Wrap with context padding (before and after)
    const contextPadding = Math.min(50, Math.max(1, Math.floor(batchSize / 2)));
    const contextStart = Math.max(0, batchStart - contextPadding);
    const contextEnd = Math.min(contentLines.length, batchEnd + contextPadding);

    const contextLines = contentLines.slice(contextStart, contextEnd);
    const targetStartIndex = batchStart - contextStart;
    const targetEndIndex = batchEnd - contextStart;

    // Build marked context prompt
    const contextWithMarkers = contextLines
      .map((line, idx) => {
        if (idx >= targetStartIndex && idx < targetEndIndex) {
          return `[TRANSLATE_${idx - targetStartIndex}]${line}[/TRANSLATE_${idx - targetStartIndex}]`;
        }
        return `[CONTEXT]${line}[/CONTEXT]`;
      })
      .join("\n");

    let basePromptInstructions = `Context: This is part of a subtitle file. Only translate the lines marked with [TRANSLATE_X][/TRANSLATE_X] tags (where X is the line number). Use the [CONTEXT][/CONTEXT] lines for understanding but do not translate them. Maintain the natural flow of dialogue and keep the same numbering in your response.

CRITICAL REQUIREMENTS:
1. You MUST translate ALL ${expectedCount} lines marked with [TRANSLATE_X] tags
2. Do NOT skip any numbers from 0 to ${expectedCount - 1}
3. Keep the exact format: [TRANSLATE_0]translation[/TRANSLATE_0]
4. If a line contains only sounds/exclamations, still translate them appropriately.`;

    if (isMature) {
      basePromptInstructions += "\n5. This content contains mature, R-rated, or 18+ themes (violence, profanity, mature humor). You MUST translate these mature elements accurately, preserving the slang, tone, and profanity without censoring or filtering the text.";
    }

    const fullPrompt = config.userPrompt
      .replace("${targetLanguage}", targetLangLabel)
      .replace("${sourceLanguage}", sourceLangLabel)
      .replace(
        "${content}",
        `${basePromptInstructions}\n\n${contextWithMarkers}`
      );

    batches.push({
      index: batchIdx++,
      batchStart,
      batchEnd,
      expectedCount,
      fullPrompt
    });
  }

  // 2. Process batches concurrently with worker pool
  let nextBatchIndex = 0;
  let activeWorkersError: Error | null = null;

  async function worker() {
    while (nextBatchIndex < batches.length && !activeWorkersError) {
      if (signal?.aborted) throw new Error("Translation aborted by user.");

      const batch = batches[nextBatchIndex++];
      if (!batch) break;

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

        const response = await fetchWithRetry(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: batch.fullPrompt }] }],
              systemInstruction: {
                parts: [{
                  text: isMature
                    ? `${config.systemPrompt}\n\nCRITICAL: This content contains mature, R-rated, or 18+ themes (violence, profanity, mature humor). You MUST translate these mature elements accurately, preserving the slang, tone, and profanity without censoring or filtering the text.`
                    : config.systemPrompt
                }]
              },
              generationConfig: { temperature: config.temperature },
              safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
              ]
            }),
            signal
          },
          isTestConnection ? 0 : 5
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(parseGeminiError(response.status, errText));
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        if (candidate?.finishReason === "MAX_TOKENS") {
          throw new Error("Gemini response truncated - MAX_TOKENS reached.");
        }
        const textResult = candidate?.content?.parts?.[0]?.text;
        if (typeof textResult !== "string") {
          throw new Error("Invalid response format from Gemini API");
        }

        // Extract translated lines
        const translatedBatch = extractTranslatedLinesWithNumbers(textResult, batch.expectedCount);
        
        // Fill in results
        for (let j = 0; j < batch.expectedCount; j++) {
          const idx = batch.batchStart + j;
          translatedLines[idx] = translatedBatch[j] || contentLines[idx];
        }

        // Real-time caching callback
        if (onBatchTranslated) {
          const batchCues = cues.slice(batch.batchStart, batch.batchEnd);
          try {
            await onBatchTranslated(batch.batchStart, batchCues, translatedBatch);
          } catch (cacheErr) {
            console.error("Error writing batch to cache in real-time:", cacheErr);
          }
        }

        completedCount += batch.expectedCount;
        onProgress(Math.floor((completedCount / contentLines.length) * 100));

        // Delay between requests for this worker slot to respect rate limits
        if (delayTime > 0 && nextBatchIndex < batches.length) {
          await new Promise((resolve) => setTimeout(resolve, delayTime));
        }
      } catch (err: any) {
        activeWorkersError = err;
        throw err;
      }
    }
  }

  const concurrency = Math.max(1, contextBatchSize);
  const workers = Array.from({ length: Math.min(concurrency, batches.length) }, worker);
  await Promise.all(workers);

  return translatedLines;
}
