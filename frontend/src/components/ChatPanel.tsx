import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Role } from "@/sessionTypes";


const PARTICIPANT_COLORS = [
  "#a78bfa",
  "#fb923c",
  "#34d399",
  "#f472b6",
  "#60a5fa",
  "#f87171",
  "#2dd4bf",
  "#c084fc",
  "#4ade80",
  "#e879f9",
];

const HOST_COLOR = "#facc15";
const HOST_FONT_SIZE = 16;
const OTHER_FONT_SIZE = 14;

const EMOJIS = [
  "🦝",
  "😀",
  "😅",
  "😂",
  "🤣",
  "🥰",
  "😘",
  "🤩",
  "🥳",
  "🤯",
  "🥶",
  "🤓",
  "😎",
  "😱",
  "🤑",
  "😻",
  "🙀",
  "😽",
  "👍",
  "👎",
  "🤟",
  "👌",
  "🫶",
  "🖕",
  "🫵",
  "🏆",
  "🎁",
  "🪙",
  "💰",
  "🪅",
  "🎊",
  "🎉",
  "❤️",
  "💖",
  "❤️‍🔥",
  "🔥",
];

function getNickColor(nick: string, role: Role): string {
  if (role === "host") return HOST_COLOR;
  let hash = 0;
  for (let i = 0; i < nick.length; i++) {
    hash = (hash << 5) - hash + nick.charCodeAt(i);
    hash |= 0;
  }
  return PARTICIPANT_COLORS[Math.abs(hash) % PARTICIPANT_COLORS.length];
}

export type ChatMessage = {
  id: string;
  fromDisplayName: string;
  fromRole: Role;
  text: string;
};

export type ChatPanelProps = {
  messages: ChatMessage[];
  /** When false, empty state explains that history is unavailable until the socket connects. */
  connected?: boolean;
  value: string;
  onChange: (next: string) => void;
  /** Called with trimmed text; panel clears the draft after this returns. */
  onSendMessage: (text: string) => void;
};

export function ChatPanel({ messages, connected = true, value, onChange, onSendMessage }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [messages]);

  const handleSend = () => {
    const t = value.trim();
    if (!t) return;
    onSendMessage(t);
    onChange("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    if (!input) {
      onChange(value + emoji);
      return;
    }
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      const pos = start + emoji.length;
      input.setSelectionRange(pos, pos);
      input.focus();
    });
  };

  return (
    <div className="chat-panel">
      <div className="chat-panel__head">
        <h2 className="chat-panel__title">Чат</h2>
      </div>

      <div ref={scrollRef} className="chat-panel__scroll">
        {messages.length === 0 ? (
          <p className="chat-panel__empty">
            {!connected
              ? "Нет соединения с сервером — сообщения появятся после подключения."
              : "Пока нет сообщений. Пеши исчо!!."}
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className="chat-panel__line"
              style={{ fontSize: msg.fromRole === "host" ? HOST_FONT_SIZE : OTHER_FONT_SIZE }}
            >
              <span style={{ color: getNickColor(msg.fromDisplayName, msg.fromRole), fontWeight: 600 }}>
                {msg.fromDisplayName}:
              </span>{" "}
              <span className="chat-panel__line-text">{msg.text}</span>
            </div>
          ))
        )}
      </div>

      {pickerOpen ? (
        <div className="chat-panel__emoji-sheet">
          <div className="chat-panel__emoji-grid">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="chat-panel__emoji-cell"
                onClick={() => insertEmoji(emoji)}
                style={{ fontSize: 18 }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="chat-panel__bar">
        <input
          ref={inputRef}
          type="text"
          className="chat-panel__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Пиши сюдой..."
        />
        <button
          type="button"
          className={`chat-panel__emoji-toggle${pickerOpen ? " chat-panel__emoji-toggle--open" : ""}`}
          onClick={() => setPickerOpen((o) => !o)}
          title="Смайлики"
          style={{ fontSize: 16 }}
        >
          🙂
        </button>
        <button type="button" className="chat-panel__send" onClick={handleSend}>
          {">"}
        </button>
      </div>
    </div>
  );
}
