import { SubtitleCue } from "../parsers";

// Regular expressions matching context translation markers
const MARKER_CLEANUP_RE = /\[\/?(TRANSLATE(_\d+)?|TRANSLTranslate_\d+|CONTEXT)\]/gi;
const NUMBERED_TRANSLATE_RE = /\[TRANSLATE_(\d+)\]([\s\S]*?)\[\/(?:TRANSLATE|TRANSLTranslate)_\d+\]/gi;
const UNNUMBERED_TRANSLATE_RE = /\[TRANSLATE\]([\s\S]*?)\[\/TRANSLATE\]/gi;

function cleanTranslatedContent(content: string): string {
  return content.replace(MARKER_CLEANUP_RE, "").trim();
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
};

// Retry wrapper with exponential backoff for rate limits or network issues
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  backoff = 1000
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
  const { apiKey, model, temperature, systemPrompt, userPrompt } = config;
  if (!apiKey) throw new Error("Gemini API Key is missing. Configure it in extension settings.");

  const targetLangLabel = targetLanguage === "km" ? "Khmer" : targetLanguage === "zh" ? "Simplified Chinese" : targetLanguage;
  const sourceLangLabel = sourceLanguage === "auto" ? "Detect Language" : sourceLanguage;

  const formattedUserPrompt = userPrompt
    .replace("${targetLanguage}", targetLangLabel)
    .replace("${sourceLanguage}", sourceLangLabel)
    .replace("${content}", text);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: formattedUserPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature }
    }),
    signal
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errText}`);
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
  signal?: AbortSignal
): Promise<string[]> {
  const { contextWindow, contextBatchSize, delayTime } = config;
  const contentLines = cues.map(c => c.text);
  const translatedLines = new Array<string>(contentLines.length).fill("");

  const targetLangLabel = targetLanguage === "km" ? "Khmer" : targetLanguage === "zh" ? "Simplified Chinese" : targetLanguage;
  const sourceLangLabel = sourceLanguage === "auto" ? "Detect Language" : sourceLanguage;

  let completedCount = 0;

  // Process cues in batches
  const batchSize = Math.max(1, Math.min(contextWindow, contentLines.length));
  
  for (let i = 0; i < contentLines.length; i += batchSize) {
    if (signal?.aborted) throw new Error("Translation aborted by user.");

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

    const basePromptInstructions = `Context: This is part of a subtitle file. Only translate the lines marked with [TRANSLATE_X][/TRANSLATE_X] tags (where X is the line number). Use the [CONTEXT][/CONTEXT] lines for understanding but do not translate them. Maintain the natural flow of dialogue and keep the same numbering in your response.

CRITICAL REQUIREMENTS:
1. You MUST translate ALL ${expectedCount} lines marked with [TRANSLATE_X] tags
2. Do NOT skip any numbers from 0 to ${expectedCount - 1}
3. Keep the exact format: [TRANSLATE_0]translation[/TRANSLATE_0]
4. If a line contains only sounds/exclamations, still translate them appropriately.`;

    const fullPrompt = config.userPrompt
      .replace("${targetLanguage}", targetLangLabel)
      .replace("${sourceLanguage}", sourceLangLabel)
      .replace(
        "${content}",
        `${basePromptInstructions}\n\n${contextWithMarkers}`
      );

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        systemInstruction: { parts: [{ text: config.systemPrompt }] },
        generationConfig: { temperature: config.temperature }
      }),
      signal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
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
    const translatedBatch = extractTranslatedLinesWithNumbers(textResult, expectedCount);
    
    // Fill in results
    for (let j = 0; j < expectedCount; j++) {
      const idx = batchStart + j;
      translatedLines[idx] = translatedBatch[j] || contentLines[idx]; // Fallback to original on empty
    }

    completedCount += expectedCount;
    onProgress(Math.floor((completedCount / contentLines.length) * 100));

    // Optional delay between batches to respect rate limits
    if (delayTime > 0 && batchEnd < contentLines.length) {
      await new Promise((resolve) => setTimeout(resolve, delayTime));
    }
  }

  return translatedLines;
}
