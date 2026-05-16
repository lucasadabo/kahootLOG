import { useEffect, useState, useRef, useCallback } from "react";
import { HelpCircle, CheckCircle2, XCircle, Clock } from "lucide-react";
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
  playerId: string;
  questionId: string;
  skipNextTurn: boolean;
  venceu: boolean;
  timeout?: boolean;
}

interface AdminQuestionOverlayProps {
  gameId: string;
  players: { id: string; nickname: string }[];
  onAdvanceTurn?: () => Promise<void> | void;
}

// Sound effect for forklift movement (engine + chime)
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
  const [tempoTotal, setTempoTotal] = useState<number>(0);
  const [tempoRestante, setTempoRestante] = useState<number | null>(null);

  const onAdvanceTurnRef = useRef(onAdvanceTurn);
  const playersRef = useRef(players);
  const timerIntervalRef = useRef<number | null>(null);
  onAdvanceTurnRef.current = onAdvanceTurn;
  playersRef.current = players;

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTempoRestante(null);
  }, []);

  const resetOverlay = useCallback(() => {
    setVisible(false);
    setCurrentQuestion(null);
    setRoundResult(null);
    setDiceValue(null);
    setCurrentPlayerName("");
    setTempoTotal(0);
    stopTimer();
  }, [stopTimer]);

  const persistRound = useCallback(async (result: RoundResult) => {
    if (result.skipNextTurn) {
      const { error: skipError } = await gameSupabase
        .from("jogadores")
        .update({ pular_turno: true })
        .eq("id", result.playerId);

      console.log("[AdminOverlay] update pular_turno:", { playerId: result.playerId, error: skipError });

      if (!skipError) {
        const { data: skipCheck, error: skipCheckError } = await gameSupabase
          .from("jogadores")
          .select("pular_turno")
          .eq("id", result.playerId)
          .single();
        console.log("[AdminOverlay] verify pular_turno:", { data: skipCheck, error: skipCheckError });
      }
    }

    const { error: updateError } = await gameSupabase
      .from("jogadores")
      .update({ posicao: result.posicao_depois })
      .eq("id", result.playerId);

    console.log("[AdminOverlay] update posicao jogador:", {
      playerId: result.playerId,
      posicao: result.posicao_depois,
      error: updateError,
    });

    if (updateError) {
      throw updateError;
    }

    const { data: playerCheck, error: playerCheckError } = await gameSupabase
      .from("jogadores")
      .select("posicao")
      .eq("id", result.playerId)
      .single();
    console.log("[AdminOverlay] verify posicao jogador:", { data: playerCheck, error: playerCheckError });

    const { error: rodadaError } = await gameSupabase.from("rodadas").insert({
      jogo_id: gameId,
      jogador_id: result.playerId,
      pergunta_id: result.questionId,
      dado: result.dado,
      acertou: result.acertou,
      posicao_antes: result.posicao_antes,
      posicao_depois: result.posicao_depois,
      evento: result.evento,
    });

    console.log("[AdminOverlay] insert rodada:", { playerId: result.playerId, error: rodadaError });

    if (!rodadaError) {
      const { data: rodadaCheck, error: rodadaCheckError } = await gameSupabase
        .from("rodadas")
        .select("id, jogador_id, posicao_antes, posicao_depois")
        .eq("jogador_id", result.playerId)
        .eq("pergunta_id", result.questionId)
        .order("created_at", { ascending: false })
        .limit(1);
      console.log("[AdminOverlay] verify rodada:", { data: rodadaCheck, error: rodadaCheckError });
    }

    if (result.venceu) {
      const { error: gameError } = await gameSupabase
        .from("jogos")
        .update({ status: "finalizado" })
        .eq("id", gameId);

      console.log("[AdminOverlay] update jogo finalizado:", { gameId, error: gameError });

      if (!gameError) {
        const { data: gameCheck, error: gameCheckError } = await gameSupabase
          .from("jogos")
          .select("status")
          .eq("id", gameId)
          .single();
        console.log("[AdminOverlay] verify jogo finalizado:", { data: gameCheck, error: gameCheckError });
      }
    }
  }, [gameId]);

  const continueRoundRef = useRef<(result: RoundResult) => Promise<void>>();

  const runContinue = useCallback(async (result: RoundResult) => {
    if (continuing) return;
    setContinuing(true);

    const broadcastTurnAdvanced = () => {
      const ch = gameSupabase.channel(`admin-overlay-${gameId}`);
      ch.send({ type: "broadcast", event: "turn_advanced", payload: {} });
    };

    try {
      resetOverlay();
      await persistRound(result);
      const shouldAnimateMovement = result.acertou && result.posicao_depois > result.posicao_antes;
      if (shouldAnimateMovement) {
        playMovementSound();
        await new Promise((r) => setTimeout(r, 2500));
      }
      await onAdvanceTurnRef.current?.();
      broadcastTurnAdvanced();
    } catch (error) {
      console.error("[AdminOverlay] erro ao concluir rodada:", error);
    } finally {
      setContinuing(false);
    }
  }, [continuing, gameId, persistRound, resetOverlay]);
  continueRoundRef.current = runContinue;

  const handleContinue = async () => {
    if (!roundResult) return;
    await runContinue(roundResult);
  };

  useEffect(() => {
    const channel = gameSupabase
      .channel(`admin-overlay-${gameId}`)
      .on("broadcast", { event: "question_started" }, (payload) => {
        const msg = payload.payload as {
          playerId: string;
          pergunta: Pergunta;
          dado: number;
          tempo?: number;
        };
        setCurrentQuestion(msg.pergunta);
        setCurrentPlayerName(playersRef.current.find((p) => p.id === msg.playerId)?.nickname ?? "Jogador");
        setDiceValue(msg.dado);
        setRoundResult(null);
        setContinuing(false);
        setVisible(true);

        const tempo = msg.tempo ?? 0;
        setTempoTotal(tempo);
        stopTimer();
        if (tempo > 0) {
          setTempoRestante(tempo);
          timerIntervalRef.current = window.setInterval(() => {
            setTempoRestante((prev) => {
              if (prev === null) return null;
              if (prev <= 1) {
                if (timerIntervalRef.current) {
                  window.clearInterval(timerIntervalRef.current);
                  timerIntervalRef.current = null;
                }
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
      })
      .on("broadcast", { event: "question_answered" }, (payload) => {
        const msg = payload.payload as RoundResult;
        setRoundResult(msg);
        setVisible(true);
        setContinuing(false);
        stopTimer();
      })
      .subscribe();

    return () => {
      stopTimer();
      gameSupabase.removeChannel(channel);
    };
  }, [gameId, stopTimer]);

  if (!visible || !currentQuestion) return null;

  const timerLow = tempoRestante !== null && tempoRestante <= 10;

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

          {/* Countdown */}
          {tempoRestante !== null && !roundResult && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-colors ${
              timerLow
                ? "bg-destructive/10 border-destructive/50 animate-pulse"
                : "bg-accent/10 border-accent/30"
            }`}>
              <Clock className={`w-5 h-5 ${timerLow ? "text-destructive" : "text-accent"}`} />
              <span className={`font-display font-bold text-2xl ${timerLow ? "text-destructive" : "text-accent"}`}>
                {tempoRestante}s
              </span>
            </div>
          )}
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
              {tempoTotal > 0 && (
                <p className="text-xs text-muted-foreground font-body mt-2">
                  Tempo limite: {tempoTotal}s
                </p>
              )}
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
                    {roundResult.timeout
                      ? `${roundResult.nickname} não respondeu a tempo! ⏱️`
                      : `${roundResult.nickname} errou! ❌`}
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
                {continuing ? "Avançando..." : "Próxima pergunta"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
