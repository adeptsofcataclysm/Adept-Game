import { isVideoUrl, resolveQuizAssetUrl } from "@/lib/quizMedia";

/** Question/answer pane: video or image from a trimmed relative or absolute URL. */
export function QuizMediaView({ url }: { url: string }) {
  if (!url) return null;
  const src = resolveQuizAssetUrl(url);
  return (
    <div className="adepts-question-modal__media-wrap">
      {isVideoUrl(url) ? (
        <video
          className="adepts-question-modal__media"
          src={src}
          controls
          autoPlay
          playsInline
          preload="auto"
          onLoadedData={(e) => {
            (e.currentTarget as HTMLVideoElement).play().catch(() => {});
          }}
        />
      ) : (
        <img
          className="adepts-question-modal__media adepts-question-modal__media--img"
          src={src}
          alt=""
          draggable={false}
        />
      )}
    </div>
  );
}
