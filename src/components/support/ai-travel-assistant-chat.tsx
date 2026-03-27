"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";

type ChatRole = "assistant" | "user";

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

interface AssistantContext {
  summary?: string;
  issueType?: "cancellation" | "change" | "other";
  orderSnapshot?: unknown;
}

interface AITravelAssistantChatProps {
  title?: string;
  initialPrompt?: string;
  context?: AssistantContext;
}

const DEFAULT_GREETING =
  "I can help with connection risk, baggage expectations, and itinerary trade-offs based on your current booking data.";

export function AITravelAssistantChat({
  title = "AI Travel Assistant",
  initialPrompt = DEFAULT_GREETING,
  context,
}: AITravelAssistantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "seed-assistant",
      role: "assistant",
      text: initialPrompt,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const canSend = useMemo(() => draft.trim().length > 0 && !isLoading, [draft, isLoading]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;

    const question = draft.trim();
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      text: question,
    };

    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setErrorMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          context,
        }),
      });

      const payload = (await response.json()) as { answer?: string; error?: string };

      if (!response.ok || !payload.answer) {
        setErrorMessage(payload.error ?? "The assistant could not answer right now.");
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          text: payload.answer,
        },
      ]);
    } catch {
      setErrorMessage("Unable to contact the assistant right now. Please retry.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
          Context-aware
        </span>
      </div>

      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
              message.role === "user"
                ? "ml-auto bg-indigo-600 text-white"
                : "bg-zinc-800 text-zinc-100"
            }`}
          >
            {message.text}
          </div>
        ))}
        {isLoading && (
          <div className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking through your itinerary...
          </div>
        )}
      </div>

      <form onSubmit={sendMessage} className="mt-3 space-y-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask: Is my connection time in ATL enough?"
          className="min-h-20 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
        />
        <div className="flex items-center justify-between gap-2">
          {errorMessage ? <p className="text-xs text-red-300">{errorMessage}</p> : <span className="text-[11px] text-zinc-500">Grounded in your current order details.</span>}
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
            <SendHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </section>
  );
}
