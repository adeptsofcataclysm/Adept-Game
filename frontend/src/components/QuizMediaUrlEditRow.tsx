type Props = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  isRowUploading: boolean;
  inputsDisabled: boolean;
  fileInputDisabled: boolean;
  hasHostSecret: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
};

export function QuizMediaUrlEditRow({
  label,
  value,
  onValueChange,
  isRowUploading,
  inputsDisabled,
  fileInputDisabled,
  hasHostSecret,
  onFile,
  onClear,
}: Props) {
  return (
    <div className="adepts-question-modal__media-edit-grid">
      <label className="adepts-field">
        <span className="adepts-field__label">{label}</span>
        <input
          className="adepts-field__input"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={inputsDisabled}
          placeholder="/quiz_media/... или https://..."
        />
      </label>
      <div className="adepts-question-modal__upload">
        <label
          className={`adepts-btn adepts-btn--file ${isRowUploading ? "adepts-question-modal__upload--busy" : ""}`}
          title={hasHostSecret ? "Upload image to backend" : "Host secret required for upload"}
        >
          {isRowUploading ? "Загрузка…" : "Загрузить картинку"}
          <input
            type="file"
            accept="image/*"
            disabled={fileInputDisabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              onFile(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="adepts-btn"
          disabled={inputsDisabled}
          onClick={onClear}
          title="Очистить медиа"
        >
          Очистить
        </button>
      </div>
    </div>
  );
}
