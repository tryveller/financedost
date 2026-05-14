import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { generateText, tool, stepCountIs, type ModelMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import {
  todayFor,
  getRecentTransactions,
  getAccountBalance,
  getUpcomingBills,
  setReminder,
  type Session,
} from "@/lib/agent-tools";

const USER_PROFILE = {
  name: "Priya Sharma",
  age: 28,
  city: "Bangalore",
  monthly_income_inr: 120000,
  stated_goal: "Save ₹15 lakh in 2 years for a house down payment in Bangalore",
};

type Memory = {
  facts: string[];
  reminders: { date: string; content: string; id: string }[];
  session_log: { date: string; summary: string }[];
};

function memoryBlock(mem: Memory): string {
  if (!mem.facts.length && !mem.reminders.length && !mem.session_log.length) {
    return "(no prior memory — this is the first session)";
  }
  const parts: string[] = [];
  if (mem.facts.length) parts.push("Durable facts about the user:\n- " + mem.facts.join("\n- "));
  if (mem.reminders.length)
    parts.push(
      "Active reminders:\n" + mem.reminders.map((r) => `- ${r.date}: ${r.content}`).join("\n"),
    );
  if (mem.session_log.length)
    parts.push(
      "Past sessions (most recent last):\n" +
        mem.session_log.map((s) => `- ${s.date}: ${s.summary}`).join("\n"),
    );
  return parts.join("\n\n");
}

function systemPrompt(mem: Memory, session: Session): string {
  return `You are Priya's personal financial assistant. Today is ${todayFor(session)}.

User profile:
${JSON.stringify(USER_PROFILE, null, 2)}

What you remember from before:
${memoryBlock(mem)}

Operating rules — follow strictly:
1. NEVER trust balances, transaction history, or upcoming bills from memory or the conversation — they go stale within days. If the user asks anything that depends on "can I afford X", "how much do I have", "what did I spend", or any concrete money decision, you MUST call the relevant tools FIRST in that turn before composing your answer. Do not reason from old numbers.
2. Use tools deliberately. Decide what you need, fetch it, then answer. Don't fetch the same data twice in one turn.
3. Connect new questions to Priya's long-term goal (₹15L house fund in 2 years → ₹62,500/month) when relevant — that's the whole point of remembering.
4. Be concise and direct. Show the numbers you used. No fluff.
5. When the user asks you to remember/schedule something time-bound, call set_reminder. Don't just say "I'll remind you."`;
}

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const body = (await request.json()) as {
          messages: ModelMessage[];
          memory: Memory;
          session: Session;
        };
        const { messages, memory, session } = body;

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-2.5-flash");

        const newReminders: { date: string; content: string; id: string }[] = [];
        const toolEvents: { name: string; args: unknown; result: unknown }[] = [];

        const tools = {
          get_recent_transactions: tool({
            description: "Recent debits/credits. Caller filters by `days` from today.",
            inputSchema: z.object({ days: z.number().int() }),
            execute: async ({ days }) => {
              const result = getRecentTransactions(session);
              toolEvents.push({ name: "get_recent_transactions", args: { days }, result });
              return result;
            },
          }),
          get_account_balance: tool({
            description: "Current live balances across checking/savings/house_fund/mutual_funds.",
            inputSchema: z.object({}),
            execute: async () => {
              const result = getAccountBalance(session);
              toolEvents.push({ name: "get_account_balance", args: {}, result });
              return result;
            },
          }),
          get_upcoming_bills: tool({
            description: "Scheduled bills due in next N days.",
            inputSchema: z.object({ days: z.number().int().optional() }),
            execute: async ({ days }) => {
              const result = getUpcomingBills(session);
              toolEvents.push({ name: "get_upcoming_bills", args: { days }, result });
              return result;
            },
          }),
          set_reminder: tool({
            description: "Schedule a reminder. date is YYYY-MM-DD.",
            inputSchema: z.object({ date: z.string(), content: z.string() }),
            execute: async ({ date, content }) => {
              const result = setReminder(date, content);
              newReminders.push({ date: result.date, content: result.content, id: result.reminder_id });
              toolEvents.push({ name: "set_reminder", args: { date, content }, result });
              return result;
            },
          }),
        };

        try {
          const result = await generateText({
            model,
            system: systemPrompt(memory, session),
            messages,
            tools,
            stopWhen: stepCountIs(50),
          });

          return Response.json({
            text: result.text,
            toolEvents,
            newReminders,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Agent error";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
