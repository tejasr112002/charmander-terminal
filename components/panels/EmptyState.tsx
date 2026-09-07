import s from "./panels.module.css";

export function EmptyState({ text, testId }: { text: string; testId?: string }) {
  return (
    <div className={s.empty} data-testid={testId ?? "empty-state"}>
      {text}
    </div>
  );
}
