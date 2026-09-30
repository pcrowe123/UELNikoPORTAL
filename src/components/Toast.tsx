// Short messages in the corner: "Saved", "That tile is retired".

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Tone = 'plain' | 'good' | 'bad';

interface Message {
  id: number;
  text: string;
  tone: Tone;
}

interface ToastValue {
  say: (text: string, tone?: Tone) => void;
  good: (text: string) => void;
  bad: (text: string) => void;
}

const Ctx = createContext<ToastValue | null>(null);

/** A failure stays up longer, because it usually needs reading. */
const LIFETIME: Record<Tone, number> = { plain: 3500, good: 3500, bad: 7000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);

  const dismiss = useCallback((id: number) => {
    setMessages((all) => all.filter((m) => m.id !== id));
  }, []);

  const say = useCallback(
    (text: string, tone: Tone = 'plain') => {
      const id = Date.now() + Math.random();
      setMessages((all) => [...all, { id, text, tone }]);
      setTimeout(() => dismiss(id), LIFETIME[tone]);
    },
    [dismiss],
  );

  const value = useMemo<ToastValue>(
    () => ({ say, good: (t) => say(t, 'good'), bad: (t) => say(t, 'bad') }),
    [say],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`toast ${m.tone}`}>
            <span style={{ flex: 1 }}>{m.text}</span>
            <button type="button" onClick={() => dismiss(m.id)} aria-label="Dismiss">
              &times;
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}
