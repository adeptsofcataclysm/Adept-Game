import { useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getDisplayName, getOrCreateParticipantId, setDisplayName, setHostSecret } from "@/storage";
import { buildWsUrl } from "@/wsUrl";

const OK_TEXT = "★  Ладно, заходи!";
const FAIL_TEXT = "✖  Иди нахуй отсюда!";

function OkAnimation() {
  return (
    <motion.div className="adepts-login__ok-wrap">
      {OK_TEXT.split("").map((ch, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: -40, scale: 1.6 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            delay: i * 0.06,
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

function FailAnimation() {
  const shakeX = [0, -14, 18, -22, 16, -10, 20, -16, 8, -6, 0];
  const shakeY = [0, 4, -4, 3, -5, 4, -3, 5, -2, 3, 0];

  return (
    <motion.div
      initial={{ scale: 0, rotate: -8 }}
      animate={{
        scale: [0, 1.35, 1],
        rotate: [-8, 4, 0],
        x: shakeX,
        y: shakeY,
      }}
      transition={{
        scale: { duration: 0.25, times: [0, 0.5, 1] },
        rotate: { duration: 0.25 },
        x: { delay: 0.3, duration: 0.9, ease: "easeOut" },
        y: { delay: 0.3, duration: 0.9, ease: "easeOut" },
      }}
      className="adepts-login__fail-wrap"
    >
      {FAIL_TEXT.split("").map((ch, i) => (
        <motion.span
          key={i}
          animate={{
            opacity: [1, 0.3, 1, 0.6, 1],
            color: ["#e74c3c", "#ff6b6b", "#e74c3c", "#c0392b", "#e74c3c"],
          }}
          transition={{
            delay: 0.25 + i * 0.03,
            duration: 0.4,
            repeat: 2,
            repeatType: "reverse",
          }}
          className="adepts-login__fail-char"
        >
          {ch}
        </motion.span>
      ))}
    </motion.div>
  );
}

function verifyHostLogin(params: {
  showId: string;
  displayName: string;
  participantId: string;
  hostSecret: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const timeoutMs = params.timeoutMs ?? 10_000;
  return new Promise((resolve) => {
    let settled = false;
    const ws = new WebSocket(buildWsUrl(params.showId));

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    const timer = window.setTimeout(() => finish(false), timeoutMs);

    ws.onopen = () => {
      try {
        ws.send(
          JSON.stringify({
            type: "join",
            payload: {
              showId: params.showId,
              role: "host",
              displayName: params.displayName,
              participantId: params.participantId,
              hostSecret: params.hostSecret,
            },
          }),
        );
      } catch {
        finish(false);
      }
    };

    ws.onmessage = (ev) => {
      void (async () => {
        let text: string;
        if (typeof ev.data === "string") text = ev.data;
        else if (ev.data instanceof Blob) text = await ev.data.text();
        else return;
        try {
          const msg = JSON.parse(text) as { type?: string };
          if (msg.type === "snapshot") finish(true);
          else if (msg.type === "error") finish(false);
        } catch {
          /* ignore */
        }
      })();
    };

    ws.onerror = () => finish(false);
    ws.onclose = () => {
      if (!settled) finish(false);
    };
  });
}

export function AdminPage() {
  const showId = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get("showId");
    return q?.trim() || "default";
  }, []);

  const [nick, setNick] = useState(() => getDisplayName());
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying" | "ok" | "fail">("idle");
  const nickRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nickVal = nick.trim();
    const passVal = input.trim();
    if (!nickVal || !passVal || status !== "idle") return;

    setStatus("verifying");
    const participantId = getOrCreateParticipantId();
    const ok = await verifyHostLogin({
      showId,
      displayName: nickVal,
      participantId,
      hostSecret: passVal,
    });

    if (ok) {
      setDisplayName(nickVal);
      setHostSecret(passVal);
      setStatus("ok");
      const search = window.location.search;
      setTimeout(() => {
        navigate(search ? `/show${search}` : "/show");
      }, 2600);
    } else {
      setStatus("fail");
      setTimeout(() => {
        setStatus("idle");
        setInput("");
        inputRef.current?.focus();
      }, 2600);
    }
  }

  const formLocked = status !== "idle";

  return (
    <div className="adepts-login adepts-login--admin">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="adepts-login__title"
      >
        Ты чё, блядь, самый умный?
      </motion.div>

      <motion.form
        onSubmit={(e) => void handleSubmit(e)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="adepts-login__form"
      >
        <input
          ref={nickRef}
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          disabled={formLocked}
          autoFocus
          placeholder="Введите свой ник"
          maxLength={64}
          className="adepts-login__input"
        />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={formLocked}
          type="password"
          placeholder="Введи пароль..."
          className="adepts-login__input"
        />
        <button
          type="submit"
          disabled={formLocked}
          className="adepts-login__submit"
        >
          Ответить
        </button>
      </motion.form>

      <div className="adepts-login__status">
        <AnimatePresence mode="wait">
          {status === "ok" && <OkAnimation key="ok" />}
          {status === "fail" && <FailAnimation key="fail" />}
        </AnimatePresence>
      </div>
    </div>
  );
}
