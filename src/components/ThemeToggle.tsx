export type ThemeMode = "light" | "dark";

interface Props {
  theme: ThemeMode;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: Props) {
  const next = theme === "dark" ? "claro" : "escuro";

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={`Ativar modo ${next}`}
      title={`Ativar modo ${next}`}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
    </button>
  );
}
