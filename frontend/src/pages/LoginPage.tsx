import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getDisplayName, getOrCreateParticipantId, setDisplayName } from "@/storage";

const OK_TEXT = "★  Добро пожаловать!";

function OkAnimation() {
  return (
    <motion.div
      style={{ display: "flex", justifyContent: "center", gap: 0, overflow: "visible" }}
    >
      {OK_TEXT.split("").map((ch, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: -40, scale: 1.6 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            delay: i * 0.05,
            type: "spring",
            stiffness: 280,
            damping: 14,
          }}
          style={{
            display: "inline-block",
            color: "#2ecc71",
            fontFamily: "monospace",
            fontWeight: 700,
            fontSize: "clamp(16px, 2.5vw, 24px)",
            textShadow: "0 0 16px #2ecc71, 0 0 32px rgba(46,204,113,0.6)",
            whiteSpace: "pre",
          }}
        >
          {ch}
        </motion.span>
      ))}
    </motion.div>
  );
}

export function LoginPage() {
  const [input, setInput] = useState(getDisplayName());
  const [status, setStatus] = useState<"idle" | "ok">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nick = input.trim();
    if (!nick || status !== "idle") return;

    setDisplayName(nick);
    getOrCreateParticipantId();
    setStatus("ok");
    setTimeout(() => {
      navigate("/show");
    }, 1800);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#1a1a2e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "monospace",
        padding: 24,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          fontSize: "clamp(18px, 3.5vw, 32px)",
          fontWeight: 700,
          color: "#f1c40f",
          textShadow: "0 0 18px rgba(241,196,15,0.7)",
          textAlign: "center",
          marginBottom: 36,
          letterSpacing: "1px",
        }}
      >
        Самый Душный 3.0
      </motion.div>

      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          width: "100%",
          maxWidth: 320,
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== "idle"}
          autoFocus
          placeholder="Введите свой ник"
          maxLength={64}
          style={{
            width: "100%",
            padding: "10px 16px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(241,196,15,0.4)",
            borderRadius: 6,
            color: "#fff",
            fontFamily: "monospace",
            fontSize: 16,
            outline: "none",
            textAlign: "center",
            letterSpacing: "2px",
            boxShadow: "0 0 12px rgba(241,196,15,0.1)",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "#f1c40f";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "rgba(241,196,15,0.4)";
          }}
        />
        <button
          type="submit"
          disabled={status !== "idle"}
          style={{
            padding: "8px 32px",
            background: "transparent",
            border: "1px solid #8e44ad",
            borderRadius: 4,
            color: "#c39bd3",
            fontFamily: "monospace",
            fontSize: 12,
            letterSpacing: "3px",
            textTransform: "uppercase",
            cursor: status !== "idle" ? "not-allowed" : "pointer",
            opacity: status !== "idle" ? 0.4 : 1,
            transition: "opacity 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.boxShadow = "0 0 12px rgba(142,68,173,0.6)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.boxShadow = "none";
          }}
        >
          Войти
        </button>
      </motion.form>

      <div
        style={{
          marginTop: 40,
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
          width: "100%",
        }}
      >
        <AnimatePresence mode="wait">
          {status === "ok" && <OkAnimation key="ok" />}
        </AnimatePresence>
      </div>
    </div>
  );
}
