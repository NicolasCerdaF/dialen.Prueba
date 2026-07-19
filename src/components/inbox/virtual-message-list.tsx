import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type VirtualMessage = {
  id: string;
  body: string | null;
  direction: string;
  created_at: string;
  sender_id: string | null;
};

export function VirtualMessageList({ messages }: { messages: VirtualMessage[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 8,
    getItemKey: (i) => messages[i].id,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!messages.length) return;
    virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    // Second pass after row is measured
    const t = setTimeout(() => {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const items = virtualizer.getVirtualItems();

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto px-5 py-4">
      <div
        style={{ height: `${virtualizer.getTotalSize()}px` }}
        className="relative w-full"
      >
        {items.map((vi) => {
          const m = messages[vi.index];
          const fromAi = m.direction === "outbound" && !m.sender_id;
          return (
            <div
              key={vi.key}
              ref={virtualizer.measureElement}
              data-index={vi.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              }}
              className="pb-2"
            >
              <div
                className={cn(
                  "flex",
                  m.direction === "outbound" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm",
                    m.direction === "outbound"
                      ? fromAi
                        ? "bg-primary/85 text-primary-foreground ring-1 ring-primary/40"
                        : "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground",
                  )}
                >
                  {fromAi && (
                    <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase opacity-80">
                      <Sparkles className="h-2.5 w-2.5" /> IA
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className="mt-1 text-[10px] opacity-70">
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
