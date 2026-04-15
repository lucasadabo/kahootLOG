import { useEffect, useState, useRef, useCallback } from "react";
import { HelpCircle, CheckCircle2, XCircle } from "lucide-react";
import { gameSupabase } from "@/lib/gameSupabase";

interface Pergunta {
  id: string;
  texto: string;
  alternativa_a: string;
  alternativa_b: string;
  alternativa_c: string;
  alternativa_d: string;
}

interface RoundResult {
  acertou: boolean;
  posicao_antes: number;
  posicao_depois: number;
  evento: string | null;
  dado: number;
  nickname: string;
}

interface AdminQuestionOverlayProps {
  gameId: string;
  players: { id: string; nickname: string }[];
  onAdvanceTurn?: () => Promise<void> | void;
}

// Sound effect for forklift movement
function playMovementSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const duration = 2.5;
    
    // Engine rumble
    const osc1 = audioCtx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(55, audioCtx.currentTime);
    osc1.frequency.linearRampToValueAtTime(80, audioCtx.currentTime + duration);
    
    const gain1 = audioCtx.createGain();
    gain1.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain1.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + duration);
    gain1.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration + 0.3);
    
    osc1.connect(gain1).connect(audioCtx.destination);
    osc1.start();
    osc1.stop(audioCtx.currentTime + duration + 0.3);
    
    // Success chime
    const osc2 = audioCtx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(523, audioCtx.currentTime);
    osc2.frequency.setValueAtTime(659, audioCtx.currentTime + 0.15);
    osc2.frequency.setValueAtTime(784, audioCtx.currentTime + 0.3);
    
    const gain2 = audioCtx.createGain();
    gain2.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain2.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6);
    
    osc2.connect(gain2).connect(audioCtx.destination);
    osc2.start();
    osc2.stop(audioCtx.currentTime + 0.6);
  } catch (e) {
    // Audio not supported
  }
}

export function AdminQuestionOverlay({ gameId, players, onAdvanceTurn }: AdminQuestionOverlayProps) {
  const [currentQuestion, setCurrentQuestion] = useState<Pergunta | null>(null);
  const [currentPlayerName, setCurrentPlayerName] = useState<string>("");
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [visible, setVisible] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [showingMovement, setShowingMovement] = useState(false);

  const onAdvanceTurnRef = useRef(onAdvanceTurn);
  const playersRef = useRef(players);
  onAdvanceTurnRef.current = onAdvanceTurn;
  playersRef.current = players;

  const resetOverlay = useCallback(() => {
    setVisible(false);
    setCurrentQuestion(null);
    setRoundResult(null);
    setDiceValue(null);
    setCurrentPlayerName("");
    setShowingMovement(false);
  }, []);

  const handleContinue = async () => {
    if (!roundResult || continuing) return;
    setContinuing(true);

    if (roundResult.acertou) {
      // Play sound, hide overlay to show movement, then advance turn
      playMovementSound();
      setVisible(false);
      setShowingMovement(true);

      // Wait for animation to play on the board
      await new Promise(r => setTimeout(r, 3000));

      setShowingMovement(false);
      resetOverlay();
      try {
        await onAdvanceTurnRef.current?.();
      } finally {
        setContinuing(false);
      }
    } else {
      // Wrong answer: just advance immediately
      resetOverlay();
      try {
        await onAdvanceTurnRef.current?.();
      } finally {
        setContinuing(false);
      }
    }
  };

  useEffect(() => {
    const channel = gameSupabase
      .channel(`admin-overlay-${gameId}`)
      .on("broadcast", { event: "question_started" }, (payload) => {
        const msg = payload.payload as {
          playerId: string;
          pergunta: Pergunta;
          dado: number;
        };
        setCurrentQuestion(msg.pergunta);
        setCurrentPlayerName(playersRef.current.find((p) => p.id === msg.playerId)?.nickname ?? "Jogador");
        setDiceValue(msg.dado);
        setRoundResult(null);
        setContinuing(false);
        setShowingMovement(false);
        setVisible(true);
      })
      .on("broadcast", { event: "question_answered" }, (payload) => {
        const msg = payload.payload as RoundResult;
        setRoundResult(msg);
        setVisible(true);
        setContinuing(false);
      })
      .subscribe();

    return () => {
      gameSupabase.removeChannel(channel);
    };
  }, [gameId]);

  if (!visible || !currentQuestion) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-2xl mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-primary/10">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-6 h-6 text-primary" />
            <div>
              <p className="font-display font-bold text-lg text-foreground">
                Vez de: {currentPlayerName}
              </p>
              <p className="text-sm text-muted-foreground font-body">
                🎲 Dado: {diceValue}
              </p>
            </div>
          </div>
        </div>

        {/* Question */}
        <div className="p-6 space-y-4">
          <p className="font-display font-bold text-xl text-foreground text-center">
            {currentQuestion.texto}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(["A", "B", "C", "D"] as const).map((letter) => {
              const fieldKey = `alternativa_${letter.toLowerCase()}` as keyof Pergunta;
              return (
                <div
                  key={letter}
                  className="p-4 rounded-xl border border-border bg-background/50 font-body text-foreground"
                >
                  <span className="font-display font-bold text-primary mr-2">{letter})</span>
                  {currentQuestion[fieldKey]}
                </div>
              );
            })}
          </div>

          {/* Waiting or Result */}
          {!roundResult ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground font-body text-lg animate-pulse">
                Aguardando resposta de {currentPlayerName}...
              </p>
            </div>
          ) : (
            <div className={`p-6 rounded-xl text-center space-y-2 animate-in zoom-in-95 duration-300 ${
              roundResult.acertou
                ? "bg-accent/10 border border-accent/30"
                : "bg-destructive/10 border border-destructive/30"
            }`}>
              {roundResult.acertou ? (
                <>
                  <CheckCircle2 className="w-12 h-12 text-accent mx-auto" />
                  <p className="font-display font-bold text-2xl text-accent">
                    {roundResult.nickname} acertou! ✅
                  </p>
                  <p className="text-muted-foreground font-body">
                    Casa {roundResult.posicao_antes} → Casa {roundResult.posicao_depois}
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="w-12 h-12 text-destructive mx-auto" />
                  <p className="font-display font-bold text-2xl text-destructive">
                    {roundResult.nickname} errou! ❌
                  </p>
                  <p className="text-muted-foreground font-body">
                    Permanece na casa {roundResult.posicao_depois}
                  </p>
                </>
              )}
              {roundResult.evento && (
                <p className="text-accent font-display font-bold mt-2">⚡ {roundResult.evento}</p>
              )}
              <button
                onClick={handleContinue}
                disabled={continuing}
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 font-display font-bold text-primary-foreground transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {continuing ? "Movendo empilhadeira..." : "Próxima pergunta"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
