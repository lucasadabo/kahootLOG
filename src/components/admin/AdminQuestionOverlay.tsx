import { useEffect, useState, useCallback } from "react";
import { X, HelpCircle, CheckCircle2, XCircle } from "lucide-react";
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
}

export function AdminQuestionOverlay({ gameId, players }: AdminQuestionOverlayProps) {
  const [currentQuestion, setCurrentQuestion] = useState<Pergunta | null>(null);
  const [currentPlayerName, setCurrentPlayerName] = useState<string>("");
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [visible, setVisible] = useState(false);

  const findPlayerName = useCallback((id: string) => {
    return players.find((p) => p.id === id)?.nickname ?? "Jogador";
  }, [players]);

  useEffect(() => {
    const channel = gameSupabase
      .channel(`admin-broadcast-${gameId}`)
      .on("broadcast", { event: "question_started" }, (payload) => {
        const msg = payload.payload as {
          playerId: string;
          pergunta: Pergunta;
          dado: number;
        };
        setCurrentQuestion(msg.pergunta);
        setCurrentPlayerName(findPlayerName(msg.playerId));
        setDiceValue(msg.dado);
        setRoundResult(null);
        setVisible(true);
      })
      .on("broadcast", { event: "question_answered" }, (payload) => {
        const msg = payload.payload as RoundResult;
        setRoundResult(msg);
        setTimeout(() => {
          setVisible(false);
          setCurrentQuestion(null);
          setRoundResult(null);
        }, 4000);
      })
      .subscribe();

    return () => {
      gameSupabase.removeChannel(channel);
    };
  }, [gameId, findPlayerName]);

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
          <button
            onClick={() => { setVisible(false); setCurrentQuestion(null); setRoundResult(null); }}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
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
                ? "bg-green-500/10 border border-green-500/30"
                : "bg-destructive/10 border border-destructive/30"
            }`}>
              {roundResult.acertou ? (
                <>
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                  <p className="font-display font-bold text-2xl text-green-500">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
