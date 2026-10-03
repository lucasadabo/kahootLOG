import { useNavigate } from "react-router-dom";
import { Shield } from "lucide-react";
import { ForkRunLogo } from "@/components/ForkRunLogo";

export default function Index() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-8 gap-8 sm:gap-10">
      <div className="w-full max-w-xl text-center space-y-4">
        <h1 className="sr-only">Fork Run</h1>
        <ForkRunLogo />
        <p className="text-muted-foreground font-body text-lg">
          Seu conhecimento em movimento.
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
      <footer className="flex flex-col items-center gap-2 pt-2 text-center">
        <p className="font-body text-xs text-muted-foreground">
          Desenvolvido por:
        </p>
        <a
          href="https://www.adabo.com.br"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visitar o site da Adabo (abre em nova aba)"
          className="relative block w-44 rounded-sm transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          <img
            src="/brand/adabo-transparent.png"
            alt="Adabo — logística inteligente"
            width={2172}
            height={724}
            className="h-auto w-full [clip-path:inset(0_66%_0_0)]"
          />
          <img
            src="/brand/adabo-transparent.png"
            alt=""
            aria-hidden="true"
            width={2172}
            height={724}
            className="absolute inset-0 h-auto w-full brightness-0 invert [clip-path:inset(0_0_0_34%)]"
          />
        </a>
      </footer>
    </main>
  );
}
