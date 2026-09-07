"use client";

export function navigateBackOrHome() {
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer && referrer.origin === window.location.origin && window.history.length > 1) {
      window.history.back();
      return;
    }
  } catch {
    // Fall through to dashboard home when history is missing or unusable.
  }
  window.location.assign("/");
}

type BackControlProps = {
  label: string;
  visible: boolean;
};

export function BackControl({ label, visible }: BackControlProps) {
  if (!visible) return null;
  return (
    <button type="button" className="secondary-action back-control" onClick={navigateBackOrHome}>
      {label}
    </button>
  );
}
