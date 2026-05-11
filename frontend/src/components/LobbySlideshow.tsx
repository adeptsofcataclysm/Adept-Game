import { useEffect, useState } from "react";
import { getHttpBaseUrl } from "@/wsUrl";

const SLIDE_INTERVAL_MS = 6000;

type LobbySlidesResponse = { slides?: string[] };

function slideSrc(fileName: string): string {
  const enc = encodeURIComponent(fileName);
  return `${getHttpBaseUrl()}/lobby/${enc}`;
}

export function LobbySlideshow() {
  const [slides, setSlides] = useState<string[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`${getHttpBaseUrl()}/api/lobby-slides`);
        const j = (await r.json()) as LobbySlidesResponse;
        const list = Array.isArray(j.slides) ? j.slides.filter((s) => typeof s === "string" && s.length > 0) : [];
        if (!cancelled) {
          setSlides(list);
          setLoadError(!r.ok);
          setListLoaded(true);
          setIndex(0);
        }
      } catch {
        if (!cancelled) {
          setSlides([]);
          setLoadError(true);
          setListLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [slides.length]);

  const current = slides[index] ?? null;
  const placeholderText = !listLoaded
    ? "Загрузка слайдов…"
    : loadError
      ? "Не удалось загрузить список слайдов."
      : slides.length === 0
        ? "Добавьте изображения в backend/data/lobby на сервере."
        : null;

  return (
    <div className="lobby-slideshow card adepts-show-board-card adepts-quiz-theme">
      <div className="lobby-slideshow__frame">
        {current ? (
          <img
            key={current}
            className="lobby-slideshow__img"
            src={slideSrc(current)}
            alt=""
            draggable={false}
          />
        ) : (
          <div className="lobby-slideshow__placeholder">
            <p>{placeholderText}</p>
          </div>
        )}
      </div>
      {slides.length > 1 ? (
        <div className="lobby-slideshow__dots" aria-hidden="true">
          {slides.map((name, i) => (
            <span key={`${i}-${name}`} className={i === index ? "lobby-slideshow__dot is-active" : "lobby-slideshow__dot"} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
