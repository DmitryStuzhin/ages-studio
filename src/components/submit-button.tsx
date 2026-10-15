"use client";
import { useFormStatus } from "react-dom";

/** Кнопка отправки формы с индикатором, пока сервер обрабатывает форму. */
export function SubmitButton({ children, className = "btn btn-primary", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} aria-busy={pending || undefined}>{pending && pendingText ? pendingText : children}</button>;
}
