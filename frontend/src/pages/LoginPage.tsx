import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getDisplayName, getOrCreateParticipantId, setDisplayName } from "@/storage";

const OK_TEXT = "★  Добро пожаловать!";

function OkAnimation() {
  return (
    <motion.div className="adepts-login__ok-wrap">
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
          className="adepts-login__ok-char"
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
    <div className="adepts-login adepts-login--player">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="adepts-login__title"
      >
        Самый Душный 3.0
      </motion.div>

      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="adepts-login__form"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== "idle"}
          autoFocus
          placeholder="Введите свой ник"
          maxLength={64}
          className="adepts-login__input"
        />
        <button
          type="submit"
          disabled={status !== "idle"}
          className="adepts-login__submit"
        >
          Войти
        </button>
      </motion.form>

      <div className="adepts-login__status">
        <AnimatePresence mode="wait">
          {status === "ok" && <OkAnimation key="ok" />}
        </AnimatePresence>
      </div>
    </div>
  );
}
