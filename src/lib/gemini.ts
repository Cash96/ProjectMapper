import { z } from "zod";

const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(
            z.object({
              text: z.string().optional(),
            }),
          ),
        }),
      }),
    )
    .min(1),
});

function extractJsonBlock(payload: string) {
  const fencedMatch = payload.match(/```json\s*([\s\S]*?)```/i);

  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const firstBrace = payload.indexOf("{");
  const lastBrace = payload.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return payload.slice(firstBrace, lastBrace + 1);
  }

  return payload.trim();
}

function findBalancedJsonValue(payload: string) {
  const startIndex = payload.search(/[\[{]/);

  if (startIndex < 0) {
    return null;
  }

  const openingChar = payload[startIndex];
  const closingChar = openingChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < payload.length; index += 1) {
    const char = payload[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === openingChar) {
      depth += 1;
      continue;
    }

    if (char === closingChar) {
      depth -= 1;

      if (depth === 0) {
        return payload.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function parseGeminiJson<T>(payload: string): T {
  const attempts = [
    payload.trim(),
    extractJsonBlock(payload),
    findBalancedJsonValue(payload),
    findBalancedJsonValue(extractJsonBlock(payload)),
  ].filter((attempt): attempt is string => Boolean(attempt && attempt.trim()));

  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch (error) {
      lastError = error;
    }
  }

  const preview = payload.trim().slice(0, 400);
  const reason = lastError instanceof Error ? lastError.message : "Unknown JSON parse failure.";
  throw new Error(`Gemini returned malformed JSON. ${reason} Response preview: ${preview}`);
}

export async function generateGeminiJson<T>(input: {
  model?: string;
  prompt: string;
  schema: z.ZodType<T>;
}) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const candidateModels = input.model
    ? [input.model]
    : ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"];

  let responsePayload: unknown = null;
  let lastError: string | null = null;

  for (const model of candidateModels) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: input.prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
        cache: "no-store",
      },
    );

    if (response.ok) {
      responsePayload = await response.json();
      lastError = null;
      break;
    }

    const errorText = await response.text();
    lastError = `Gemini request failed for ${model}: ${response.status} ${errorText}`;

    if (response.status !== 404) {
      break;
    }
  }

  if (!responsePayload) {
    throw new Error(lastError ?? "Gemini request failed.");
  }

  const parsedResponse = geminiResponseSchema.parse(responsePayload);
  const text = parsedResponse.candidates[0]?.content.parts.map((part) => part.text ?? "").join("\n") ?? "";

  return input.schema.parse(parseGeminiJson<T>(text));
}