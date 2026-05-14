import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { generateObject } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

const EXTRACT_PROMPT = `Read this session transcript. Extract ONLY information worth remembering for FUTURE sessions weeks/months from now.

Rules:
- Do NOT include balances, account totals, transaction amounts, or anything that will be stale in 3 days. Those come from tools, not memory.
- Do include savings targets, budget rules the user agreed to, named goals, recurring concerns (e.g. "tends to overspend on food delivery").
- Keep facts atomic and self-contained.
- Always return a JSON object with "new_facts" (array of strings, can be empty) and "summary" (string, can be empty).`;

const schema = z.object({
  new_facts: z.array(z.string()),
  summary: z.string(),
});

export const Route = createFileRoute("/api/extract-memory")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { transcript } = (await request.json()) as { transcript: string };
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-2.5-flash");

        try {
          const { object } = await generateObject({
            model,
            schema,
            messages: [
              { role: "system", content: EXTRACT_PROMPT },
              { role: "user", content: transcript || "(empty transcript)" },
            ],
          });
          return Response.json(object);
        } catch (err) {
          // Fallback: ask for JSON as plain text and parse defensively.
          try {
            const { generateText } = await import("ai");
            const { text } = await generateText({
              model,
              messages: [
                { role: "system", content: EXTRACT_PROMPT + "\nReturn ONLY raw JSON, no markdown." },
                { role: "user", content: transcript || "(empty transcript)" },
              ],
            });
            const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
            const start = cleaned.search(/[\{]/);
            const end = cleaned.lastIndexOf("}");
            const json = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : "{}";
            const parsed = schema.parse(JSON.parse(json));
            return Response.json(parsed);
          } catch (inner) {
            const message =
              inner instanceof Error ? inner.message : err instanceof Error ? err.message : "Extract error";
            return new Response(JSON.stringify({ error: message }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }
        }
      },
    },
  },
});
