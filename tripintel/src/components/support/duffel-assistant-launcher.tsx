"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    openDuffelAssistant?: (options: {
      clientKey: string;
      showMinimiseButton?: boolean;
      context?: {
        issueType?: "cancellation" | "change" | "other";
        summary?: string;
      };
    }) => void;
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

  async function openAssistant() {
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

      if (typeof window.openDuffelAssistant !== "function") {
        setErrorMessage("Duffel Assistant script has not loaded yet. Try again in a second.");
        return;
      }

      window.openDuffelAssistant({
        clientKey: json.componentClientKey,
        showMinimiseButton: true,
        ...(issueType || summary
          ? {
              context: {
                issueType,
                summary,
              },
            }
          : {}),
      });
    } catch {
      setErrorMessage("Unable to reach support tools right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => {
          void openAssistant();
        }}
        disabled={isLoading}
        className={className ?? "rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:border-zinc-600 disabled:opacity-40"}
      >
        {isLoading ? "Opening Assistant..." : "Open Duffel Assistant"}
      </button>
      {errorMessage && <p className="text-xs text-red-300">{errorMessage}</p>}
    </div>
  );
}
