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
  const jsonBlock = extractJsonBlock(text);

  return input.schema.parse(JSON.parse(jsonBlock));
}