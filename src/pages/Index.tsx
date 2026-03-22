import { useNavigate } from "react-router-dom";
import { Gamepad2, Shield } from "lucide-react";

export default function Index() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 gap-8">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-primary/10 border border-primary/20 animate-float">
          <Gamepad2 className="w-12 h-12 text-primary" />
        </div>
        <h1 className="text-5xl font-display font-bold text-primary text-glow">
          QuizGame
        </h1>
        <p className="text-muted-foreground font-body text-lg">
          O jogo de quiz mais divertido!
        </p>
      </div>

      <div className="w-full max-w-xs space-y-4">
        <button
          onClick={() => navigate("/join")}
          className="w-full h-16 rounded-xl bg-primary text-primary-foreground text-xl font-display font-bold shadow-[var(--shadow-glow)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
        >
          Entrar no Jogo 🎮
        </button>
        <button
          onClick={() => navigate("/admin")}
          className="w-full h-14 rounded-xl bg-card border-2 border-border text-foreground text-lg font-display font-medium hover:border-primary/40 hover:bg-muted transition-all duration-200 flex items-center justify-center gap-2"
        >
          <Shield className="w-5 h-5" />
          Painel do Professor
        </button>
      </div>
    </div>
  );
}
