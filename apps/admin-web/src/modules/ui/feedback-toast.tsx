interface FeedbackToastState {
  tone: "success" | "error";
  message: string;
  title?: string;
}

interface FeedbackToastProps {
  feedback: FeedbackToastState | null;
  onClose: () => void;
}

export function FeedbackToast({ feedback, onClose }: FeedbackToastProps) {
  if (!feedback) {
    return null;
  }

  const title =
    feedback.title ?? (feedback.tone === "success" ? "Uspješno spremljeno" : "Nešto nije uspjelo");

  return (
    <div
      className={`feedback-toast feedback-toast--${feedback.tone}`}
      role={feedback.tone === "error" ? "alert" : "status"}
      aria-live={feedback.tone === "error" ? "assertive" : "polite"}
    >
      <div className="feedback-toast__content">
        <p className="feedback-toast__title">{title}</p>
        <p className="feedback-toast__message">{feedback.message}</p>
      </div>
      <button
        className="feedback-toast__close"
        type="button"
        aria-label="Zatvori obavijest"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}
