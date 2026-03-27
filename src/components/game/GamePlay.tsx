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

  const isMyTurn = currentPlayerId === playerId;

  const fetchGameState = useCallback(async () => {
    const { data: jogoData, error: jogoError } = await gameSupabase
      .from("jogos")
      .select("jogador_atual_id, status")
      .eq("id", gameId)
      .single();

    console.log("[GamePlay] jogo SELECT:", { jogoData, jogoError });

    if (!jogoError && jogoData) {
      setCurrentPlayerId(jogoData.jogador_atual_id);
      setGameStatus(jogoData.status ?? "aguardando");
    }

    const { data: jogadoresData, error: jogadoresError } = await gameSupabase
      .from("jogadores")
      .select("id, nickname, cor_empilhadeira, posicao")
      .eq("jogo_id", gameId)
      .order("created_at", { ascending: true });

    console.log("[GamePlay] jogadores SELECT:", { jogadoresData, jogadoresError });

    if (!jogadoresError && jogadoresData) {
      setPlayers(jogadoresData);
    }
  }, [gameId]);

  useEffect(() => {
    fetchGameState();

    const broadcastChannel = gameSupabase.channel(`admin-broadcast-${gameId}`);
    broadcastChannel.subscribe();
    broadcastChannelRef.current = broadcastChannel;

    const channel = gameSupabase
      .channel(`gameplay-${gameId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jogos", filter: `id=eq.${gameId}` }, (payload) => {
        console.log("[GamePlay] jogos realtime:", payload.new);
        fetchGameState();
        const next = payload.new as { jogador_atual_id: string | null };
        if (next.jogador_atual_id === playerId) {
          setPhase("waiting");
          setDiceValue(null);
          setPergunta(null);
          setSelectedAnswer(null);
          setEventMessage(null);
          setErrorMessage(null);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "jogadores", filter: `jogo_id=eq.${gameId}` }, () => {
        fetchGameState();
      })
      .subscribe((status) => console.log("[GamePlay] subscription:", status));

    return () => {
      if (rollTimeoutRef.current) {
        window.clearTimeout(rollTimeoutRef.current);
      }
      gameSupabase.removeChannel(channel);
      gameSupabase.removeChannel(broadcastChannel);
    };
  }, [gameId, playerId, fetchGameState]);

  const fetchQuestion = async (rolledValue: number) => {
    const { data, error } = await gameSupabase.rpc("pegar_pergunta");
    console.log("[GamePlay] pegar_pergunta RPC:", { data, error });

    if (error || !data || typeof data !== "object" || !("id" in data)) {
      console.error("[GamePlay] pegar_pergunta ERROR:", error, data);
      setErrorMessage("Não foi possível carregar uma pergunta real do banco.");
      setDiceValue(rolledValue);
      rollTimeoutRef.current = window.setTimeout(() => {
        setPhase("waiting");
      }, 1800);
      return;
    }

    const questionId = String((data as { id: string }).id);
    const { data: perguntaData, error: perguntaError } = await gameSupabase
      .from("perguntas")
      .select("id, texto, alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta")
      .eq("id", questionId)
      .single();

    console.log("[GamePlay] pergunta SELECT:", { perguntaData, perguntaError });

    if (perguntaError || !perguntaData) {
      console.error("[GamePlay] pergunta SELECT ERROR:", perguntaError);
      setErrorMessage("A pergunta retornada não foi encontrada no banco.");
      rollTimeoutRef.current = window.setTimeout(() => {
        setPhase("waiting");
      }, 1800);
      return;
    }

    const perguntaObj = {
      id: perguntaData.id,
      texto: perguntaData.texto,
      alternativa_a: perguntaData.alternativa_a,
      alternativa_b: perguntaData.alternativa_b,
      alternativa_c: perguntaData.alternativa_c,
      alternativa_d: perguntaData.alternativa_d,
      resposta_correta: perguntaData.resposta_correta,
    };

    rollTimeoutRef.current = window.setTimeout(() => {
      setPergunta(perguntaObj);
      setPhase("question");

      // Broadcast question to admin (without resposta_correta)
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
  };

  const handleRollDice = async () => {
    setErrorMessage(null);
    setPergunta(null);
    setSelectedAnswer(null);
    setResultMessage("");
    setEventMessage(null);
    if (rollTimeoutRef.current) {
      window.clearTimeout(rollTimeoutRef.current);
    }
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
        console.log("[GamePlay] dado:", finalValue);
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

    console.log("[GamePlay] posição antes SELECT:", { playerBefore, playerBeforeError });

    if (playerBeforeError || !playerBefore) {
      setErrorMessage("Não foi possível confirmar a posição atual no banco.");
      return;
    }

    const { data: fullPergunta, error: fullPerguntaError } = await gameSupabase
      .from("perguntas")
      .select("id, resposta_correta")
      .eq("id", pergunta.id)
      .single();

    console.log("[GamePlay] resposta correta SELECT:", { fullPergunta, fullPerguntaError });

    if (fullPerguntaError || !fullPergunta) {
      setErrorMessage("Não foi possível validar a resposta com a pergunta salva no banco.");
      return;
    }

    const acertou = fullPergunta.resposta_correta.toUpperCase() === answer.toUpperCase();
    console.log("[GamePlay] resposta:", { answer, correta: fullPergunta.resposta_correta, acertou });

    const { error: jogarError } = await gameSupabase.rpc("jogar", {
      p_jogo_id: gameId,
      p_jogador_id: playerId,
      p_dado: diceValue,
      p_acertou: acertou,
      p_pergunta_id: pergunta.id,
    });

    console.log("[GamePlay] jogar RPC:", { jogarError });

    if (jogarError) {
      console.error("[GamePlay] jogar ERROR:", jogarError);
      setResultMessage("❌ Erro ao processar jogada. Tente novamente.");
      setPhase("result");
      return;
    }

    const { data: rodadaCheck, error: rodadaCheckError } = await gameSupabase
      .from("rodadas")
      .select("id, jogo_id, jogador_id, pergunta_id, dado, acertou, posicao_antes, posicao_depois")
      .eq("jogo_id", gameId)
      .eq("jogador_id", playerId)
      .eq("pergunta_id", pergunta.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log("[GamePlay] rodada validation SELECT:", { rodadaCheck, rodadaCheckError });

    if (rodadaCheckError || !rodadaCheck) {
      console.error("[GamePlay] rodada validation ERROR:", rodadaCheckError);
      setErrorMessage("A rodada não foi encontrada no banco após a jogada.");
      return;
    }

    const { data: playerAfter, error: playerAfterError } = await gameSupabase
      .from("jogadores")
      .select("posicao")
      .eq("id", playerId)
      .single();

    console.log("[GamePlay] posição depois SELECT:", { playerAfter, playerAfterError });

    if (playerAfterError || !playerAfter) {
      setErrorMessage("A nova posição do jogador não foi confirmada no banco.");
      return;
    }

    const { data: gameAfter, error: gameAfterError } = await gameSupabase
      .from("jogos")
      .select("status, jogador_atual_id")
      .eq("id", gameId)
      .single();

    console.log("[GamePlay] jogo depois SELECT:", { gameAfter, gameAfterError });

    if (gameAfterError || !gameAfter) {
      setErrorMessage("O estado do jogo não foi confirmado após a jogada.");
      return;
    }

    setResultMessage(
      acertou
        ? `✅ Correto! Você saiu da casa ${rodadaCheck.posicao_antes} e foi para a ${rodadaCheck.posicao_depois}`
        : `❌ Errado! Você permaneceu na casa ${rodadaCheck.posicao_depois}`
    );

    // Broadcast result to admin
    broadcastChannelRef.current?.send({
      type: "broadcast",
      event: "question_answered",
      payload: {
        acertou,
        posicao_antes: rodadaCheck.posicao_antes,
        posicao_depois: rodadaCheck.posicao_depois,
        evento: null,
        dado: diceValue,
        nickname,
      },
    });

    setEventMessage(null);
    if (gameAfter.status === "finalizado") {
      setGameStatus("finalizado");
    }
    setPhase("result");

    if (gameAfter.status !== "finalizado") {
      setTimeout(async () => {
        const { error: turnoError } = await gameSupabase.rpc("proximo_turno", { p_jogo_id: gameId });
        console.log("[GamePlay] proximo_turno RPC:", { turnoError });
      }, 3000);
    }

    fetchGameState();
  };

  const currentPlayer = players.find((p) => p.id === currentPlayerId);
  const winner = players.find((p) => p.posicao >= 42);
  const myPlayer = players.find((p) => p.id === playerId);

  if (gameStatus === "finalizado" && winner) {
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
            <p className="text-center text-muted-foreground font-body text-sm animate-pulse-slow">Próximo turno em instantes...</p>
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