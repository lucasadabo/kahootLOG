import { useState } from "react";
import { Gamepad2 } from "lucide-react";

interface JoinFormProps {
  onJoin: (pin: string, nickname: string) => void;
  error: string;
  loading: boolean;
}

export function JoinForm({ onJoin, error, loading }: JoinFormProps) {
  const [pin, setPin] = useState("");
  const [nickname, setNickname] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length === 6 && nickname.trim()) {
      onJoin(pin, nickname);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 animate-float">
            <Gamepad2 className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold text-primary text-glow">
            QuizGame
          </h1>
          <p className="text-muted-foreground font-body">
            Digite o PIN e entre na partida!
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="PIN do jogo"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full h-16 text-center text-3xl font-display font-bold tracking-[0.5em] rounded-xl bg-card border-2 border-border text-foreground placeholder:text-muted-foreground placeholder:tracking-normal placeholder:text-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <input
              type="text"
              maxLength={20}
              placeholder="Seu nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full h-14 text-center text-xl font-display rounded-xl bg-card border-2 border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm text-center font-body animate-bounce-in">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pin.length !== 6 || !nickname.trim() || loading}
            className="w-full h-16 rounded-xl bg-primary text-primary-foreground text-xl font-display font-bold shadow-[var(--shadow-glow)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="animate-pulse-slow">Entrando...</span>
            ) : (
              "Entrar no jogo 🚀"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
