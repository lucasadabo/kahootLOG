import { useEffect, useState, useCallback, useRef } from "react";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Trophy, Clock, Zap } from "lucide-react";
import { gameSupabase } from "@/lib/gameSupabase";

interface PlayerState {
  id: string;
  nickname: string;
  cor_empilhadeira: string;
  posicao: number;
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
}

const DiceIcons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
type GamePhase = "waiting" | "rolling" | "rolled" | "question" | "result";

export function GamePlay({ gameId, playerId, nickname }: GamePlayProps) {
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [gameStatus, setGameStatus] = useState("em_andamento");
  
  const [phase, setPhase] = useState<GamePhase>("waiting");
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [diceAnimating, setDiceAnimating] = useState(false);
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState("");
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rollTimeoutRef = useRef<number | null>(null);
  const broadcastChannelRef = useRef<ReturnType<typeof gameSupabase.channel> | null>(null);
  const prevCurrentPlayerRef = useRef<string | null>(null);

  // Track used question IDs to avoid repetition
  const usedQuestionIdsRef = useRef<Set<string>>(new Set());
  // Selected categories from admin
  const selectedCategoriesRef = useRef<string[]>([]);

  const isMyTurn = currentPlayerId === playerId;

  // Reset phase when turn changes
  useEffect(() => {
    if (prevCurrentPlayerRef.current !== currentPlayerId && currentPlayerId !== null) {
      if (currentPlayerId === playerId) {
        setPhase("waiting");
        setDiceValue(null);
        setPergunta(null);
        setSelectedAnswer(null);
        setEventMessage(null);
        setErrorMessage(null);
        setResultMessage("");
      } else if (phase === "result") {
        setPhase("waiting");
        setDiceValue(null);
        setPergunta(null);
        setSelectedAnswer(null);
        setResultMessage("");
        setEventMessage(null);
      }
    }
    prevCurrentPlayerRef.current = currentPlayerId;
  }, [currentPlayerId, playerId, phase]);

  const fetchGameState = useCallback(async () => {
    const { data: jogoData, error: jogoError } = await gameSupabase
      .from("jogos")
      .select("jogador_atual_id, status")
      .eq("id", gameId)
      .single();

    if (!jogoError && jogoData) {
      setCurrentPlayerId(jogoData.jogador_atual_id);
      setGameStatus(jogoData.status ?? "aguardando");
    }

    const { data: jogadoresData, error: jogadoresError } = await gameSupabase
      .from("jogadores")
      .select("id, nickname, cor_empilhadeira, posicao")
      .eq("jogo_id", gameId)
      .order("created_at", { ascending: true });

    if (!jogadoresError && jogadoresData) {
      setPlayers(jogadoresData);
    }
  }, [gameId]);

  useEffect(() => {
    fetchGameState();

    // Load selected categories from DB
    gameSupabase
      .from("jogos")
      .select("categorias_selecionadas")
      .eq("id", gameId)
      .single()
      .then(({ data }) => {
        if (data && (data as any).categorias_selecionadas) {
          try {
            const cats = JSON.parse((data as any).categorias_selecionadas);
            if (Array.isArray(cats) && cats.length > 0) {
              selectedCategoriesRef.current = cats;
              console.log("[GamePlay] loaded categories from DB:", cats);
            }
          } catch {}
        }
      });

    const broadcastChannel = gameSupabase.channel(`player-broadcast-${gameId}`);
    broadcastChannel.subscribe();
    broadcastChannelRef.current = broadcastChannel;

    const channel = gameSupabase
      .channel(`gameplay-${gameId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jogos", filter: `id=eq.${gameId}` }, () => {
        fetchGameState();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "jogadores", filter: `jogo_id=eq.${gameId}` }, () => {
        fetchGameState();
      })
      .subscribe();

    // Polling fallback every 2s
    const pollInterval = window.setInterval(() => {
      fetchGameState();
    }, 2000);

    return () => {
      if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
      window.clearInterval(pollInterval);
      gameSupabase.removeChannel(channel);
      gameSupabase.removeChannel(broadcastChannel);
    };
  }, [gameId, playerId, fetchGameState]);

  const fetchQuestion = async (rolledValue: number) => {
    try {
      // Build query filtering by categories and excluding used questions
      let query = gameSupabase.from("perguntas").select("*");
      
      const cats = selectedCategoriesRef.current;
      if (cats.length > 0) {
        query = query.in("categoria", cats);
      }

      const usedIds = Array.from(usedQuestionIdsRef.current);
      if (usedIds.length > 0) {
        query = query.not("id", "in", `(${usedIds.join(",")})`);
      }

      const { data, error } = await query;

      let questions = data;

      // If no unused questions left, reset and fetch all
      if (!questions || questions.length === 0) {
        usedQuestionIdsRef.current.clear();
        let resetQuery = gameSupabase.from("perguntas").select("*");
        if (cats.length > 0) {
          resetQuery = resetQuery.in("categoria", cats);
        }
        const { data: resetData } = await resetQuery;
        questions = resetData;
      }

      if (!questions || questions.length === 0) {
        setErrorMessage("Nenhuma pergunta disponível para as categorias selecionadas.");
        setDiceValue(rolledValue);
        rollTimeoutRef.current = window.setTimeout(() => setPhase("waiting"), 1800);
        return;
      }

      // Pick random question
      const randomQ = questions[Math.floor(Math.random() * questions.length)];
      usedQuestionIdsRef.current.add(randomQ.id);

      const perguntaObj: Pergunta = {
        id: String(randomQ.id),
        texto: String(randomQ.pergunta ?? randomQ.texto),
        alternativa_a: String(randomQ.alternativa_a),
        alternativa_b: String(randomQ.alternativa_b),
        alternativa_c: String(randomQ.alternativa_c),
        alternativa_d: String(randomQ.alternativa_d),
        resposta_correta: String(randomQ.correta ?? randomQ.resposta_correta),
      };

      console.log("[GamePlay] pergunta selecionada:", perguntaObj.id, "usadas:", usedQuestionIdsRef.current.size);

      rollTimeoutRef.current = window.setTimeout(() => {
        setPergunta(perguntaObj);
        setPhase("question");

        broadcastChannelRef.current?.send({
          type: "broadcast",
          event: "question_started",
          payload: {
            playerId,
            dado: rolledValue,
            pergunta: {
              id: perguntaObj.id,
              texto: perguntaObj.texto,
              alternativa_a: perguntaObj.alternativa_a,
              alternativa_b: perguntaObj.alternativa_b,
              alternativa_c: perguntaObj.alternativa_c,
              alternativa_d: perguntaObj.alternativa_d,
            },
          },
        });
      }, 1800);
    } catch (err) {
      console.error("[GamePlay] erro ao buscar pergunta:", err);
      setErrorMessage("Erro ao buscar pergunta.");
      setDiceValue(rolledValue);
      rollTimeoutRef.current = window.setTimeout(() => setPhase("waiting"), 1800);
    }
  };

  const handleRollDice = async () => {
    setErrorMessage(null);
    setPergunta(null);
    setSelectedAnswer(null);
    setResultMessage("");
    setEventMessage(null);
    if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
    setDiceAnimating(true);
    setPhase("rolling");

    let count = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count >= 10) {
        clearInterval(interval);
        const finalValue = Math.floor(Math.random() * 6) + 1;
        setDiceValue(finalValue);
        setDiceAnimating(false);
        setPhase("rolled");
        fetchQuestion(finalValue);
      }
    }, 100);
  };

  const handleAnswer = async (answer: string) => {
    if (!pergunta || !diceValue) return;
    setSelectedAnswer(answer);
    setErrorMessage(null);

    const { data: playerBefore, error: playerBeforeError } = await gameSupabase
      .from("jogadores")
      .select("posicao")
      .eq("id", playerId)
      .single();

    if (playerBeforeError || !playerBefore) {
      setErrorMessage("Não foi possível confirmar a posição atual.");
      return;
    }

    const posicaoAntes = playerBefore.posicao;
    const respostaCorreta = pergunta.resposta_correta;
    const acertou = respostaCorreta.toUpperCase() === answer.toUpperCase();

    let novaPosicao = acertou ? posicaoAntes + diceValue : posicaoAntes;
    let evento: string | null = null;

    if (acertou) {
      if (novaPosicao === 10) { novaPosicao -= 2; evento = "Casa 10: Volte 2 casas!"; }
      else if (novaPosicao === 20) { novaPosicao += 1; evento = "Casa 20: Avance +1 casa!"; }
      else if (novaPosicao === 30) { await gameSupabase.from("jogadores").update({ pular_vez: true }).eq("id", playerId); evento = "Casa 30: Perde a próxima vez!"; }
      else if (novaPosicao === 40) { novaPosicao -= 2; evento = "Casa 40: Volte 2 casas!"; }
      if (novaPosicao >= 42) novaPosicao = 42;
    }

    const { error: updateError } = await gameSupabase
      .from("jogadores")
      .update({ posicao: novaPosicao })
      .eq("id", playerId);

    if (updateError) {
      setResultMessage("❌ Erro ao atualizar posição.");
      setPhase("result");
      return;
    }

    await gameSupabase.from("rodadas").insert({
      jogo_id: gameId,
      jogador_id: playerId,
      pergunta_id: pergunta.id,
      dado: diceValue,
      acertou,
      posicao_antes: posicaoAntes,
      posicao_depois: novaPosicao,
      evento,
    });

    const venceu = novaPosicao >= 42;
    if (venceu) {
      await gameSupabase.from("jogos").update({ status: "finalizado" }).eq("id", gameId);
    }

    setResultMessage(
      acertou
        ? `✅ Correto! Você saiu da casa ${posicaoAntes} e foi para a ${novaPosicao}`
        : `❌ Errado! Você permaneceu na casa ${posicaoAntes}`
    );
    setEventMessage(evento);

    broadcastChannelRef.current?.send({
      type: "broadcast",
      event: "question_answered",
      payload: { acertou, posicao_antes: posicaoAntes, posicao_depois: novaPosicao, evento, dado: diceValue, nickname },
    });

    if (venceu) setGameStatus("finalizado");
    setPhase("result");
    fetchGameState();
  };

  const currentPlayer = players.find((p) => p.id === currentPlayerId);
  const winner = players.find((p) => p.posicao >= 42);
  const myPlayer = players.find((p) => p.id === playerId);

  if ((gameStatus === "finalizado" || gameStatus === "finished") && winner) {
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

  const DiceIcon = diceValue ? DiceIcons[diceValue - 1] : Dice1;

  return (
    <div className="min-h-screen flex flex-col px-4 py-6">
      <div className="w-full max-w-md mx-auto space-y-6">
        {errorMessage && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-center">
            <p className="font-body text-destructive font-medium">{errorMessage}</p>
          </div>
        )}

        <div className="text-center space-y-2">
          <p className="text-muted-foreground font-body text-sm">
            Você: <span className="text-primary font-bold">{nickname}</span> — Casa <span className="text-accent font-bold">{myPlayer?.posicao ?? 0}</span>
          </p>
          <div className="p-3 rounded-xl bg-card border border-border">
            {isMyTurn ? (
              <p className="text-accent font-display font-bold text-lg flex items-center justify-center gap-2">
                <Zap className="w-5 h-5" /> É a sua vez!
              </p>
            ) : (
              <p className="text-muted-foreground font-body flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" /> Vez de: <span className="text-foreground font-bold">{currentPlayer?.nickname ?? "..."}</span>
              </p>
            )}
          </div>
        </div>

        {isMyTurn && phase === "waiting" && (
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

        {(phase === "rolling" || phase === "rolled") && (
          <div className="flex justify-center">
            <div className={`p-8 rounded-2xl bg-card border-2 border-primary transition-all duration-500 ${diceAnimating ? "animate-pulse scale-105" : "scale-100"}`}>
              <DiceIcon className="w-24 h-24 text-primary" />
              <p className="text-center font-display font-bold text-3xl text-primary mt-2">{diceValue}</p>
              {!diceAnimating && <p className="text-center text-sm text-muted-foreground font-body mt-3">Valor sorteado — carregando pergunta…</p>}
            </div>
          </div>
        )}

        {phase === "question" && pergunta && (
          <div className="space-y-4 animate-bounce-in">
            <div className="p-4 rounded-xl bg-card border border-border">
              <p className="font-display font-bold text-lg text-foreground text-center">{pergunta.texto}</p>
            </div>
            <div className="grid gap-3">
              {(["A", "B", "C", "D"] as const).map((letter) => {
                const text = pergunta[`alternativa_${letter.toLowerCase()}` as keyof Pergunta];
                return (
                  <button
                    key={letter}
                    onClick={() => handleAnswer(letter)}
                    disabled={!!selectedAnswer}
                    className="p-4 rounded-xl bg-card border-2 border-border text-left font-body text-foreground hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="font-display font-bold text-primary mr-2">{letter})</span>
                    {text}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {phase === "result" && (
          <div className="space-y-3 animate-bounce-in">
            <div className="p-4 rounded-xl bg-card border border-border text-center">
              <p className="font-display font-bold text-lg text-foreground">{resultMessage}</p>
            </div>
            {eventMessage && (
              <div className="p-4 rounded-xl bg-secondary/10 border border-secondary/30 text-center">
                <p className="font-display font-bold text-secondary">⚡ {eventMessage}</p>
              </div>
            )}
            <p className="text-center text-muted-foreground font-body text-sm animate-pulse-slow">Aguardando o professor avançar...</p>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="font-display font-bold text-foreground text-sm uppercase tracking-wider">Tabuleiro</h2>
          <div className="space-y-2">
            {players.slice().sort((a, b) => b.posicao - a.posicao).map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 p-3 rounded-xl border ${p.id === currentPlayerId ? "bg-accent/10 border-accent/30" : "bg-card border-border"}`}
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
                <div className="flex items-center gap-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden w-20">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(p.posicao / 42) * 100}%`, backgroundColor: p.cor_empilhadeira }} />
                  </div>
                  <span className="text-xs font-display font-bold text-muted-foreground w-8 text-right">{p.posicao}/42</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
