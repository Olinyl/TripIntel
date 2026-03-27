"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, MessageCircle, SendHorizontal, X } from "lucide-react";

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

interface AITravelAssistantWidgetProps {
  title?: string;
  initialPrompt?: string;
  context?: AssistantContext;
}

const DEFAULT_GREETING =
  "I can help with route trade-offs, connection risk, and baggage questions.";

export function AITravelAssistantWidget({
  title = "TripIntel AI",
  initialPrompt = DEFAULT_GREETING,
  context,
}: AITravelAssistantWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
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
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen && (
        <section className="mb-3 w-[92vw] max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-3 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md border border-zinc-700 p-1 text-zinc-300 transition-colors hover:border-zinc-500"
              aria-label="Close chat"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[92%] rounded-lg px-2.5 py-2 text-xs leading-relaxed ${
                  message.role === "user"
                    ? "ml-auto bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-100"
                }`}
              >
                {message.text}
              </div>
            ))}
            {isLoading && (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-2 text-xs text-zinc-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking...
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="mt-2 space-y-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask anything about this trip"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
            />
            <div className="flex items-center justify-between gap-2">
              {errorMessage ? (
                <p className="text-xs text-red-300">{errorMessage}</p>
              ) : (
                <span className="text-[11px] text-zinc-500">Press Enter to send</span>
              )}
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
                <SendHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition-colors hover:bg-indigo-500"
      >
        <MessageCircle className="h-4 w-4" />
        {isOpen ? "Hide Chat" : "Ask AI"}
      </button>
    </div>
  );
}
