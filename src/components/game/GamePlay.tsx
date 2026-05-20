import { useEffect, useState, useCallback, useRef } from "react";
import {
  Dice1, Dice2, Dice3, Dice4, Dice5, Dice6,
  Trophy, Clock, Users, CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import { gameSupabase } from "@/lib/gameSupabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlayerState {
  id: string;
  nickname: string;
  cor_empilhadeira: string;
  posicao: number;
  dado_rodada_atual: number | null;
  respondeu_rodada_atual: boolean;
  acertou_rodada_atual: boolean | null;
}

interface Pergunta {
  id: string;
  texto: string;
  alternativa_a: string;
  alternativa_b: string;
  alternativa_c: string;
  alternativa_d: string;
  resposta_correta: string;
}

interface GamePlayProps {
  gameId: string;
  playerId: string;
  nickname: string;
  onGameEnd?: () => void;
}

type FaseRodada = "rolando_dado" | "perguntando" | "respondendo" | "resultado";

const DiceIcons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DiceIcon({ value, className }: { value: number | null; className?: string }) {
  const Icon = value ? DiceIcons[value - 1] : Dice1;
  return <Icon className={className} />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GamePlay({ gameId, playerId, nickname, onGameEnd }: GamePlayProps) {
  // Game state (from DB)
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [gameStatus, setGameStatus] = useState("em_andamento");
  const [faseRodada, setFaseRodada] = useState<FaseRodada>("rolando_dado");
  const [perguntaRodadaId, setPerguntaRodadaId] = useState<string | null>(null);
  const [tempoLimite, setTempoLimite] = useState<number>(0);

  // Local UI state
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [diceAnimating, setDiceAnimating] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tempoRestante, setTempoRestante] = useState<number | null>(null);

  const answeredRef = useRef(false);
  const rolledRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const rollTimeoutRef = useRef<number | null>(null);
  const handleAnswerRef = useRef<(answer: string) => Promise<void>>();
  const selectedCategoriesRef = useRef<string[]>([]);

  // ---------------------------------------------------------------------------
  // DB fetchers
  // ---------------------------------------------------------------------------

  const fetchGameState = useCallback(async () => {
    const { data: jogoData } = await gameSupabase
      .from("jogos")
      .select("status, fase_rodada, pergunta_rodada_id, tempo_limite")
      .eq("id", gameId)
      .single();

    if (jogoData) {
      setGameStatus(jogoData.status ?? "em_andamento");
      setFaseRodada((jogoData.fase_rodada as FaseRodada) ?? "rolando_dado");
      setPerguntaRodadaId(jogoData.pergunta_rodada_id ?? null);
      if (typeof (jogoData as any).tempo_limite === "number") {
        setTempoLimite((jogoData as any).tempo_limite);
      }
    }

    const { data: jogadoresData } = await gameSupabase
      .from("jogadores")
      .select("id, nickname, cor_empilhadeira, posicao, dado_rodada_atual, respondeu_rodada_atual, acertou_rodada_atual")
      .eq("jogo_id", gameId)
      .order("created_at", { ascending: true });

    if (jogadoresData) setPlayers(jogadoresData as PlayerState[]);
  }, [gameId]);

  const fetchPergunta = useCallback(async (id: string) => {
    const { data } = await gameSupabase
      .from("perguntas")
      .select("*")
      .eq("id", id)
      .single();

    if (data) {
      setPergunta({
        id: String(data.id),
        texto: String(data.pergunta ?? ""),
        alternativa_a: String(data.alternativa_a ?? ""),
        alternativa_b: String(data.alternativa_b ?? ""),
        alternativa_c: String(data.alternativa_c ?? ""),
        alternativa_d: String(data.alternativa_d ?? ""),
        resposta_correta: String(data.correta ?? ""),
      });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------------

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTempoRestante(null);
  }, []);

  const startTimer = useCallback((seconds: number) => {
    stopTimer();
    setTempoRestante(seconds);
    timerRef.current = window.setInterval(() => {
      setTempoRestante((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          window.clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopTimer]);

  // Timeout trigger
  useEffect(() => {
    if (tempoRestante === 0 && faseRodada === "perguntando" && !answeredRef.current) {
      answeredRef.current = true;
      handleAnswerRef.current?.("__timeout__");
    }
  }, [tempoRestante, faseRodada]);

  // ---------------------------------------------------------------------------
  // Phase transitions (driven by DB polling)
  // ---------------------------------------------------------------------------

  const prevFaseRef = useRef<FaseRodada | null>(null);
  const prevPerguntaIdRef = useRef<string | null>(null);

  useEffect(() => {
    const faseChanged = prevFaseRef.current !== faseRodada;
    const perguntaChanged = prevPerguntaIdRef.current !== perguntaRodadaId;
    prevFaseRef.current = faseRodada;
    prevPerguntaIdRef.current = perguntaRodadaId;

    if (faseRodada === "rolando_dado" && faseChanged) {
      // New round started — reset everything
      setDiceValue(null);
      setPergunta(null);
      setSelectedAnswer(null);
      setResultMessage(null);
      setEventMessage(null);
      setErrorMessage(null);
      answeredRef.current = false;
      rolledRef.current = false;
      stopTimer();
    }

    if (faseRodada === "perguntando" && perguntaRodadaId && (faseChanged || perguntaChanged)) {
      // Fetch and display the question
      fetchPergunta(perguntaRodadaId);
      answeredRef.current = false;
      if (tempoLimite > 0) startTimer(tempoLimite);
    }
  }, [faseRodada, perguntaRodadaId, tempoLimite, fetchPergunta, stopTimer, startTimer]);

  // ---------------------------------------------------------------------------
  // Subscriptions + polling
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetchGameState();

    // Realtime for game_config broadcast
    const broadcastChannel = gameSupabase
      .channel(`admin-overlay-${gameId}`)
      .on("broadcast", { event: "game_config" }, (payload) => {
        const msg = payload.payload as { categorias?: string[]; tempoResposta?: number };
        if (Array.isArray(msg.categorias)) selectedCategoriesRef.current = msg.categorias;
        if (typeof msg.tempoResposta === "number") setTempoLimite(msg.tempoResposta);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          broadcastChannel.send({ type: "broadcast", event: "request_config", payload: { gameId } });
        }
      });

    // Realtime postgres_changes (best-effort)
    const channel = gameSupabase
      .channel(`gameplay-${gameId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jogos", filter: `id=eq.${gameId}` }, fetchGameState)
      .on("postgres_changes", { event: "*", schema: "public", table: "jogadores", filter: `jogo_id=eq.${gameId}` }, fetchGameState)
      .subscribe();

    // Polling fallback — source of truth
    const poll = window.setInterval(fetchGameState, 1500);

    return () => {
      window.clearInterval(poll);
      if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
      gameSupabase.removeChannel(channel);
      gameSupabase.removeChannel(broadcastChannel);
    };
  }, [gameId, fetchGameState]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleRollDice = async () => {
    if (rolledRef.current) return;
    rolledRef.current = true;
    setErrorMessage(null);
    setDiceAnimating(true);

    // Animate dice
    let count = 0;
    const animInterval = window.setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count >= 10) {
        window.clearInterval(animInterval);
        const finalValue = Math.floor(Math.random() * 6) + 1;
        setDiceValue(finalValue);
        setDiceAnimating(false);

        // Register in DB
        gameSupabase.rpc("registrar_dado", {
          p_jogo_id: gameId,
          p_jogador_id: playerId,
          p_dado: finalValue,
          p_categorias: selectedCategoriesRef.current.length > 0
            ? selectedCategoriesRef.current
            : null,
        }).then(({ error }) => {
          if (error) {
            console.error("[GamePlay] registrar_dado error:", error);
            setErrorMessage("Erro ao registrar dado. Tente novamente.");
            rolledRef.current = false;
          }
          // DB will poll and transition phase automatically
        });
      }
    }, 100);
  };

  const handleAnswer = async (answer: string) => {
    if (!pergunta) return;
    if (answeredRef.current && answer !== "__timeout__") return;
    answeredRef.current = true;
    stopTimer();

    const isTimeout = answer === "__timeout__";
    setSelectedAnswer(isTimeout ? null : answer);
    setErrorMessage(null);

    const { data, error } = await gameSupabase.rpc("registrar_resposta", {
      p_jogo_id: gameId,
      p_jogador_id: playerId,
      p_resposta: answer,
      p_timeout: isTimeout,
    });

    if (error || !data) {
      console.error("[GamePlay] registrar_resposta error:", error);
      setErrorMessage("Erro ao registrar resposta.");
      return;
    }

    const result = data as {
      ok: boolean;
      acertou: boolean;
      venceu: boolean;
      posicao_antes: number;
      posicao_depois: number;
      evento: string | null;
    };

    if (!result.ok) return;

    setResultMessage(
      result.acertou
        ? `✅ Correto! Casa ${result.posicao_antes} → Casa ${result.posicao_depois}`
        : isTimeout
          ? `⏱️ Tempo esgotado! Você ficou na casa ${result.posicao_antes}`
          : `❌ Errado! Você ficou na casa ${result.posicao_antes}`
    );
    setEventMessage(result.evento);
    // Phase will advance to "resultado" via polling when everyone answers
  };

  handleAnswerRef.current = handleAnswer;

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const myPlayer = players.find((p) => p.id === playerId);
  const winner = players.find((p) => p.posicao >= 42);
  const jaRolei = myPlayer?.dado_rodada_atual != null || rolledRef.current;
  const jaRespondi = myPlayer?.respondeu_rodada_atual === true || answeredRef.current;
  const totalJogadores = players.length;
  const jaRolaram = players.filter((p) => p.dado_rodada_atual != null).length;
  const jaResponderam = players.filter((p) => p.respondeu_rodada_atual).length;

  // ---------------------------------------------------------------------------
  // Render: finished
  // ---------------------------------------------------------------------------

  if ((gameStatus === "finalizado" || gameStatus === "finished") && winner) {
    onGameEnd?.();
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
        <div className="text-center space-y-6 animate-bounce-in">
          <Trophy className="w-24 h-24 text-primary mx-auto animate-float" />
          <h1 className="text-4xl font-display font-bold text-primary text-glow">
            {winner.id === playerId ? "🎉 Você venceu!" : `🏆 ${winner.nickname} venceu!`}
          </h1>
          <p className="text-muted-foreground font-body text-xl">O jogo terminou!</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: main
  // ---------------------------------------------------------------------------

  const DiceIconComp = diceValue ? DiceIcons[diceValue - 1] : Dice1;

  return (
    <div className="min-h-screen flex flex-col px-4 py-6">
      <div className="w-full max-w-md mx-auto space-y-6">

        {/* Error */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-center">
            <p className="font-body text-destructive font-medium">{errorMessage}</p>
          </div>
        )}

        {/* Player info */}
        <div className="p-3 rounded-xl bg-card border border-border text-center space-y-1">
          <p className="text-muted-foreground font-body text-sm">
            Você: <span className="text-primary font-bold">{nickname}</span>
            {" — "}Casa <span className="text-accent font-bold">{myPlayer?.posicao ?? 0}</span>
          </p>
        </div>

        {/* ── FASE: rolando_dado ── */}
        {faseRodada === "rolando_dado" && (
          <div className="space-y-4">
            {/* Progresso de quem já rolou */}
            <div className="p-4 rounded-xl bg-card border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground font-body text-sm">
                  <Users className="w-4 h-4" />
                  <span>Rolaram o dado: <strong className="text-foreground">{jaRolaram}/{totalJogadores}</strong></span>
                </div>
                {jaRolaram < totalJogadores && (
                  <span className="text-xs font-body text-muted-foreground animate-pulse">
                    Aguardando...
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-medium border transition-all ${
                      p.dado_rodada_atual != null
                        ? "bg-accent/10 border-accent/30 text-accent"
                        : "bg-card border-border text-muted-foreground"
                    }`}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: p.cor_empilhadeira }}
                    />
                    {p.nickname}
                    {p.dado_rodada_atual != null && (
                      <span className="ml-1 font-bold">🎲{p.dado_rodada_atual}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Dado animado se já rolou */}
            {jaRolei && diceValue && (
              <div className="flex justify-center">
                <div className={`p-8 rounded-2xl bg-card border-2 border-primary transition-all ${diceAnimating ? "animate-pulse scale-105" : ""}`}>
                  <DiceIconComp className="w-20 h-20 text-primary" />
                  <p className="text-center font-display font-bold text-3xl text-primary mt-2">{diceValue}</p>
                  <p className="text-center text-sm text-muted-foreground font-body mt-2">
                    Aguardando todos rolarem...
                  </p>
                </div>
              </div>
            )}

            {/* Botão rolar */}
            {!jaRolei && (
              <div className="flex justify-center">
                <button
                  onClick={handleRollDice}
                  className="flex flex-col items-center gap-3 p-8 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-2xl shadow-[var(--shadow-glow)] hover:scale-[1.05] active:scale-[0.95] transition-all"
                >
                  <Dice1 className="w-16 h-16" />
                  Rolar Dado
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── FASE: perguntando / respondendo ── */}
        {(faseRodada === "perguntando" || faseRodada === "respondendo") && pergunta && (
          <div className="space-y-4 animate-bounce-in">
            {/* Meu dado */}
            {myPlayer?.dado_rodada_atual != null && (
              <div className="flex items-center justify-center gap-3 p-3 rounded-xl bg-card border border-border">
                <DiceIcon value={myPlayer.dado_rodada_atual} className="w-7 h-7 text-primary" />
                <span className="font-display font-bold text-lg text-primary">
                  Seu dado: {myPlayer.dado_rodada_atual}
                </span>
                {jaRespondi && (
                  <span className="ml-2 text-xs font-body text-muted-foreground">(respondido)</span>
                )}
              </div>
            )}

            {/* Timer */}
            {tempoRestante !== null && !jaRespondi && (
              <div className={`p-4 rounded-xl border-2 text-center transition-colors ${
                tempoRestante <= 10
                  ? "bg-destructive/10 border-destructive/50 animate-pulse"
                  : "bg-accent/10 border-accent/30"
              }`}>
                <p className="font-display font-bold text-3xl text-foreground flex items-center justify-center gap-2">
                  <Clock className={`w-7 h-7 ${tempoRestante <= 10 ? "text-destructive" : "text-accent"}`} />
                  {tempoRestante}s
                </p>
              </div>
            )}

            {/* Pergunta */}
            <div className="p-4 rounded-xl bg-card border border-border">
              <p className="font-display font-bold text-lg text-foreground text-center">{pergunta.texto}</p>
            </div>

            {/* Alternativas */}
            {!jaRespondi && (
              <div className="grid gap-3">
                {(["A", "B", "C", "D"] as const).map((letter) => {
                  const text = pergunta[`alternativa_${letter.toLowerCase()}` as keyof Pergunta];
                  return (
                    <button
                      key={letter}
                      onClick={() => handleAnswer(letter)}
                      disabled={!!selectedAnswer || answeredRef.current}
                      className="p-4 rounded-xl bg-card border-2 border-border text-left font-body text-foreground hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="font-display font-bold text-primary mr-2">{letter})</span>
                      {text}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Resultado individual */}
            {jaRespondi && resultMessage && (
              <div className="space-y-3 animate-bounce-in">
                <div className={`p-4 rounded-xl border text-center ${
                  resultMessage.startsWith("✅")
                    ? "bg-accent/10 border-accent/30"
                    : "bg-destructive/10 border-destructive/30"
                }`}>
                  <p className="font-display font-bold text-lg text-foreground">{resultMessage}</p>
                  {eventMessage && (
                    <p className="font-display font-bold text-accent mt-2">⚡ {eventMessage}</p>
                  )}
                </div>
                <div className="flex items-center justify-center gap-2 text-muted-foreground font-body text-sm animate-pulse-slow">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Responderam: {jaResponderam}/{totalJogadores} — aguardando todos...
                </div>
              </div>
            )}

            {/* Aguardando responder (sem resultado ainda) */}
            {jaRespondi && !resultMessage && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground font-body text-sm animate-pulse-slow">
                <Loader2 className="w-4 h-4 animate-spin" />
                Aguardando os outros jogadores...
              </div>
            )}

            {/* Progresso respostas */}
            {jaResponderam > 0 && !jaRespondi && (
              <div className="flex items-center gap-2 text-muted-foreground font-body text-xs justify-center">
                <Users className="w-3.5 h-3.5" />
                {jaResponderam} de {totalJogadores} já responderam
              </div>
            )}
          </div>
        )}

        {/* ── FASE: resultado ── */}
        {faseRodada === "resultado" && (
          <div className="space-y-3 animate-bounce-in">
            {resultMessage ? (
              <div className={`p-4 rounded-xl border text-center ${
                resultMessage.startsWith("✅")
                  ? "bg-accent/10 border-accent/30"
                  : "bg-destructive/10 border-destructive/30"
              }`}>
                <p className="font-display font-bold text-lg text-foreground">{resultMessage}</p>
                {eventMessage && (
                  <p className="font-display font-bold text-accent mt-2">⚡ {eventMessage}</p>
                )}
              </div>
            ) : null}
            <div className="p-4 rounded-xl bg-card border border-border text-center">
              <p className="text-muted-foreground font-body text-sm animate-pulse-slow">
                Aguardando o professor iniciar a próxima rodada...
              </p>
            </div>
          </div>
        )}

        {/* Placar */}
        <div className="space-y-3">
          <h2 className="font-display font-bold text-foreground text-sm uppercase tracking-wider">Placar</h2>
          <div className="space-y-2">
            {players.slice().sort((a, b) => b.posicao - a.posicao).map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 p-3 rounded-xl border bg-card border-border"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-display font-bold shrink-0"
                  style={{ backgroundColor: p.cor_empilhadeira, color: "hsl(var(--background))" }}
                >
                  {p.nickname[0].toUpperCase()}
                </div>
                <span className="font-display font-medium text-foreground text-sm truncate flex-1">
                  {p.nickname}
                  {p.id === playerId && <span className="ml-1 text-xs text-primary">(você)</span>}
                </span>
                {/* Status da rodada */}
                {faseRodada === "rolando_dado" && p.dado_rodada_atual != null && (
                  <span className="text-xs text-accent font-display font-bold">🎲{p.dado_rodada_atual}</span>
                )}
                {(faseRodada === "perguntando" || faseRodada === "respondendo") && (
                  p.respondeu_rodada_atual
                    ? p.acertou_rodada_atual
                      ? <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
                      : <XCircle className="w-4 h-4 text-destructive shrink-0" />
                    : <Loader2 className="w-4 h-4 text-muted-foreground shrink-0 animate-spin" />
                )}
                <div className="flex items-center gap-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden w-20">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(p.posicao / 42) * 100}%`, backgroundColor: p.cor_empilhadeira }}
                    />
                  </div>
                  <span className="text-xs font-display font-bold text-muted-foreground w-8 text-right">
                    {p.posicao}/42
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
