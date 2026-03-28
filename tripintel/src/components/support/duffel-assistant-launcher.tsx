"use client";

import { type DetailedHTMLProps, type HTMLAttributes, useEffect, useRef, useState } from "react";

type DuffelAssistantContext = {
  issueType?: "cancellation" | "change" | "other";
  summary?: string;
};

type DuffelAssistantOpenOptions = {
  clientKey: string;
  showMinimiseButton?: boolean;
  context?: DuffelAssistantContext;
};

declare global {
  interface Window {
    openDuffelAssistant?: (options: DuffelAssistantOpenOptions) => void;
  }

  namespace JSX {
    interface IntrinsicElements {
      "duffel-assistant": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & { ref?: any },
        HTMLElement
      >;
    }
  }
}

declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      "duffel-assistant": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & { ref?: any },
        HTMLElement
      >;
    }
  }
}

interface DuffelAssistantLauncherProps {
  userId: string;
  orderId?: string;
  issueType?: "cancellation" | "change" | "other";
  summary?: string;
  className?: string;
}

export function DuffelAssistantLauncher({
  userId,
  orderId,
  issueType,
  summary,
  className,
}: DuffelAssistantLauncherProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [newMessages, setNewMessages] = useState(0);
  const [isMinimised, setIsMinimised] = useState(false);
  const assistantElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const id = "duffel-assistant-script";
    if (document.getElementById(id)) return;

    const script = document.createElement("script");
    script.id = id;
    script.type = "text/javascript";
    script.src = "https://assets.duffel.com/assistant/custom-element.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    function onAssistantMessage(event: MessageEvent) {
      const payload = event.data as { type?: string } | undefined;
      if (!payload || typeof payload.type !== "string") return;

      if (payload.type === "duffel-assistant-new-message") {
        setNewMessages((count) => count + 1);
      }

      if (payload.type === "duffel-assistant-minimise") {
        setIsMinimised(true);
      }
    }

    window.addEventListener("message", onAssistantMessage);
    return () => {
      window.removeEventListener("message", onAssistantMessage);
    };
  }, []);

  async function handleOpenSupport() {
    setErrorMessage("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/assistant/client-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, orderId }),
      });

      const json = (await res.json()) as {
        error?: string;
        componentClientKey?: string;
      };

      if (!res.ok || !json.componentClientKey) {
        setErrorMessage(json.error ?? "Unable to initialize Duffel Assistant.");
        return;
      }

      const assistantContext = issueType || summary
        ? {
            context: {
              issueType,
              summary,
            },
          }
        : {};

      if (typeof window.openDuffelAssistant !== "function") {
        const element = assistantElementRef.current;
        if (!element) {
          setErrorMessage("Duffel Assistant script has not loaded yet. Try again in a second.");
          return;
        }

        element.setAttribute("client-key", json.componentClientKey);
        element.setAttribute("show-minimise-button", "true");
        if (summary) {
          element.setAttribute("summary", summary);
        }
        if (issueType) {
          element.setAttribute("issue-type", issueType);
        }

        element.dispatchEvent(new CustomEvent("duffel-assistant-open"));
        setIsMinimised(false);
        setNewMessages(0);
        return;
      }

      window.openDuffelAssistant({
        clientKey: json.componentClientKey,
        showMinimiseButton: true,
        ...assistantContext,
      });

      setIsMinimised(false);
      setNewMessages(0);
    } catch {
      setErrorMessage("Unable to reach support tools right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <duffel-assistant ref={(element) => { assistantElementRef.current = element; }} />
      <button
        type="button"
        onClick={() => {
          void handleOpenSupport();
        }}
        disabled={isLoading}
        className={className ?? "rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:border-zinc-600 disabled:opacity-40"}
      >
        {isLoading
          ? "Opening Assistant..."
          : isMinimised
            ? "Reopen Duffel Assistant"
            : "Open Duffel Assistant"}
      </button>
      {newMessages > 0 && (
        <p className="text-xs text-emerald-300">
          {newMessages} new support message{newMessages > 1 ? "s" : ""} received.
        </p>
      )}
      {errorMessage && <p className="text-xs text-red-300">{errorMessage}</p>}
    </div>
  );
}
