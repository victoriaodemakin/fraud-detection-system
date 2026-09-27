"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";

type Kind = "success" | "error" | "info";
interface Toast { id: number; kind: Kind; title: string; body?: string }

const Ctx = createContext<{ push: (kind: Kind, title: string, body?: string) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((kind: Kind, title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, title, body }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4800);
  }, []);

  const icon = (k: Kind) =>
    k === "success" ? <CheckCircle2 size={18} className="text-success" /> : k === "error" ? <AlertTriangle size={18} className="text-danger" /> : <Info size={18} className="text-brand2" />;

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-pop"
            >
              <div className="mt-0.5">{icon(t.kind)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-xs text-muted">{t.body}</p>}
              </div>
              <button className="text-muted hover:text-ink" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} aria-label="Dismiss">
                <X size={15} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const { push } = useContext(Ctx);
  return {
    success: (title: string, body?: string) => push("success", title, body),
    error: (title: string, body?: string) => push("error", title, body),
    info: (title: string, body?: string) => push("info", title, body),
  };
}
