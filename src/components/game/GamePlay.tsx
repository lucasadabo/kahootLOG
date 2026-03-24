import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Trophy, Clock, Zap } from "lucide-react";

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
  const [winnerId, setWinnerId] = useState<string | null>(null);

  const [phase, setPhase] = useState<GamePhase>("waiting");
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [diceAnimating, setDiceAnimating] = useState(false);
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState("");
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMyTurn = currentPlayerId === playerId;

  const fetchGameState = useCallback(async () => {
    const { data: jogoData, error: jogoError } = await supabase
      .from("jogos")
      .select("jogador_atual_id, status")
      .eq("id", gameId)
      .single();

    console.log("[GamePlay] Game state SELECT:", { jogoData, jogoError });

    if (!jogoError && jogoData) {
      setCurrentPlayerId(jogoData.jogador_atual_id);
      setGameStatus(jogoData.status);
      if (jogoData.status === "finalizado") {
        const { data: winner, error: winnerError } = await supabase
          .from("jogadores")
          .select("id")
          .eq("jogo_id", gameId)
          .eq("posicao", 42)
          .maybeSingle();

        console.log("[GamePlay] Winner SELECT:", { winner, winnerError });
        if (winner) setWinnerId(winner.id);
      }
    }

    const { data: jogadoresData, error: jogadoresError } = await supabase
      .from("jogadores")
      .select("id, nickname, cor_empilhadeira, posicao")
      .eq("jogo_id", gameId)
      .order("created_at", { ascending: true });

    console.log("[GamePlay] Players SELECT:", { jogadoresData, jogadoresError });

    if (!jogadoresError && jogadoresData) {
      setPlayers(jogadoresData);
    }
  }, [gameId]);

  useEffect(() => {
    fetchGameState();

    const channel = supabase
      .channel(`gameplay-${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jogos", filter: `id=eq.${gameId}` },
        (payload) => {
          console.log("[GamePlay] jogos UPDATE:", payload.new);
          const g = payload.new as { jogador_atual_id: string; status: string };
          fetchGameState();
          // Reset phase when turn changes to me
          if (g.jogador_atual_id === playerId) {
            setPhase("waiting");
            setDiceValue(null);
            setPergunta(null);
            setSelectedAnswer(null);
            setEventMessage(null);
            setErrorMessage(null);
          } else {
            setPhase("waiting");
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jogadores", filter: `jogo_id=eq.${gameId}` },
        (payload) => {
          console.log("[GamePlay] jogadores realtime:", payload);
          fetchGameState();
        }
      )
      .subscribe((status) => console.log("[GamePlay] subscription:", status));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, playerId, fetchGameState]);

  const handleRollDice = async () => {
    setErrorMessage(null);
    setDiceAnimating(true);
    setPhase("rolling");

    // Animate dice for 1 second
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
        console.log("[GamePlay] Dice rolled:", finalValue);

        fetchQuestion(finalValue);
      }
    }, 100);
  };

  const fetchQuestion = async (rolledValue: number) => {
    const { data, error } = await supabase.rpc("pegar_pergunta");
    console.log("[GamePlay] pegar_pergunta RPC:", { data, error });

    if (error || !data || typeof data !== "object" || !("id" in data)) {
      setErrorMessage("Não foi possível carregar uma pergunta real do banco.");
      setDiceValue(rolledValue);
      setPhase("waiting");
      return;
    }

    const questionId = String((data as { id: string }).id);

    const { data: perguntaData, error: perguntaError } = await supabase
      .from("perguntas")
      .select("id, texto, alternativa_a, alternativa_b, alternativa_c, alternativa_d")
      .eq("id", questionId)
      .single();

    console.log("[GamePlay] Pergunta SELECT:", { perguntaData, perguntaError });

    if (perguntaError || !perguntaData) {
      setErrorMessage("A pergunta retornada não foi encontrada no banco.");
      setPhase("waiting");
      return;
    }

    setPergunta(perguntaData);
    setPhase("question");
  };

  const handleAnswer = async (answer: string) => {
    if (!pergunta || !diceValue) return;
    setSelectedAnswer(answer);
    setErrorMessage(null);

    const { data: playerBefore, error: playerBeforeError } = await supabase
      .from("jogadores")
      .select("posicao")
      .eq("id", playerId)
      .single();

    console.log("[GamePlay] Position before SELECT:", { playerBefore, playerBeforeError });

    if (playerBeforeError || !playerBefore) {
      setErrorMessage("Não foi possível confirmar a posição atual no banco.");
      setPhase("waiting");
      return;
    }

    const posicaoAntes = playerBefore?.posicao ?? 0;

    const { data: fullPergunta, error: fullPerguntaError } = await supabase
      .from("perguntas")
      .select("resposta_correta")
      .eq("id", pergunta.id)
      .single();

    console.log("[GamePlay] Correct answer SELECT:", { fullPergunta, fullPerguntaError });

    if (fullPerguntaError || !fullPergunta) {
      setErrorMessage("Não foi possível validar a resposta com a pergunta salva no banco.");
      setPhase("waiting");
      return;
    }

    const acertou = fullPergunta?.resposta_correta === answer;
    console.log("[GamePlay] Answer:", { answer, correct: fullPergunta?.resposta_correta, acertou });

    const { data: resultado, error } = await supabase.rpc("jogar", {
      p_jogo_id: gameId,
      p_jogador_id: playerId,
      p_dado: diceValue,
      p_acertou: acertou,
      p_pergunta_id: pergunta.id,
    });

    console.log("[GamePlay] jogar result:", { resultado, error });

    if (error) {
      console.error("[GamePlay] jogar ERROR:", error);
      setResultMessage("❌ Erro ao processar jogada. Tente novamente.");
      setPhase("result");
      return;
    }

    const res = resultado as unknown as { nova_posicao: number; evento: string | null; venceu: boolean };

    const { data: rodadaData, error: rodadaError } = await supabase
      .from("rodadas")
      .insert({
        jogo_id: gameId,
        jogador_id: playerId,
        pergunta_id: pergunta.id,
        dado: diceValue,
        acertou,
        posicao_antes: posicaoAntes,
        posicao_depois: res.nova_posicao,
        evento: res.evento,
      })
      .select("id")
      .single();

    console.log("[GamePlay] rodada INSERT:", { rodadaData, rodadaError });

    if (rodadaError || !rodadaData) {
      console.error("[GamePlay] FALHA ao registrar rodada!", rodadaError);
      setErrorMessage("A rodada não foi persistida no banco.");
      setPhase("waiting");
      return;
    } else {
      const { data: rodadaCheck, error: rodadaCheckError } = await supabase
        .from("rodadas")
        .select("id")
        .eq("id", rodadaData.id)
        .single();

      console.log("[GamePlay] rodada VALIDATION SELECT:", { rodadaCheck, rodadaCheckError });

      if (rodadaCheckError || !rodadaCheck) {
        setErrorMessage("A rodada inserida não foi encontrada no banco.");
        setPhase("waiting");
        return;
      }
    }

    const { data: playerAfter, error: playerAfterError } = await supabase
      .from("jogadores")
      .select("posicao")
      .eq("id", playerId)
      .single();

    console.log("[GamePlay] Position after SELECT:", { playerAfter, playerAfterError });

    if (playerAfterError || !playerAfter) {
      setErrorMessage("A nova posição do jogador não foi confirmada no banco.");
      setPhase("waiting");
      return;
    }

    if (acertou) {
      setResultMessage(`✅ Correto! Você avançou ${diceValue} casas → Casa ${res.nova_posicao}`);
    } else {
      setResultMessage(`❌ Errado! Você ficou na casa ${res.nova_posicao}`);
    }

    if (res.evento) {
      setEventMessage(res.evento);
    }

    if (res.venceu) {
      setWinnerId(playerId);
      setGameStatus("finalizado");
    }

    setPhase("result");

    if (!res.venceu) {
      setTimeout(async () => {
        const { error: turnoError } = await supabase.rpc("proximo_turno", { p_jogo_id: gameId });
        console.log("[GamePlay] proximo_turno called", turnoError ? `ERROR: ${turnoError.message}` : "✅ OK");
      }, 3000);
    }
  };

  const currentPlayer = players.find((p) => p.id === currentPlayerId);
  const winner = players.find((p) => p.id === winnerId);
  const myPlayer = players.find((p) => p.id === playerId);

  // Winner screen
  if (gameStatus === "finalizado" && winner) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
        <div className="text-center space-y-6 animate-bounce-in">
          <Trophy className="w-24 h-24 text-primary mx-auto animate-float" />
          <h1 className="text-4xl font-display font-bold text-primary text-glow">
            {winner.id === playerId ? "🎉 Você venceu!" : `🏆 ${winner.nickname} venceu!`}
          </h1>
          <p className="text-muted-foreground font-body text-xl">
            O jogo terminou!
          </p>
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

        {/* Status header */}
        <div className="text-center space-y-2">
          <p className="text-muted-foreground font-body text-sm">
            Você: <span className="text-primary font-bold">{nickname}</span> — Casa{" "}
            <span className="text-accent font-bold">{myPlayer?.posicao ?? 0}</span>
          </p>
          <div className="p-3 rounded-xl bg-card border border-border">
            {isMyTurn ? (
              <p className="text-accent font-display font-bold text-lg flex items-center justify-center gap-2">
                <Zap className="w-5 h-5" /> É a sua vez!
              </p>
            ) : (
              <p className="text-muted-foreground font-body flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" /> Vez de:{" "}
                <span className="text-foreground font-bold">{currentPlayer?.nickname ?? "..."}</span>
              </p>
            )}
          </div>
        </div>

        {/* Dice + Question area */}
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
            <div className={`p-8 rounded-2xl bg-card border-2 border-primary ${diceAnimating ? "animate-pulse" : ""}`}>
              <DiceIcon className="w-24 h-24 text-primary" />
              <p className="text-center font-display font-bold text-3xl text-primary mt-2">
                {diceValue}
              </p>
            </div>
          </div>
        )}

        {phase === "question" && pergunta && (
          <div className="space-y-4 animate-bounce-in">
            <div className="p-4 rounded-xl bg-card border border-border">
              <p className="font-display font-bold text-lg text-foreground text-center">
                {pergunta.texto}
              </p>
            </div>
            <div className="grid gap-3">
              {(["a", "b", "c", "d"] as const).map((letter) => {
                const text = pergunta[`alternativa_${letter}` as keyof Pergunta];
                return (
                  <button
                    key={letter}
                    onClick={() => handleAnswer(letter)}
                    disabled={!!selectedAnswer}
                    className="p-4 rounded-xl bg-card border-2 border-border text-left font-body text-foreground hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="font-display font-bold text-primary mr-2">
                      {letter.toUpperCase()})
                    </span>
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
            <p className="text-center text-muted-foreground font-body text-sm animate-pulse-slow">
              Próximo turno em instantes...
            </p>
          </div>
        )}

        {/* Simple board - all players */}
        <div className="space-y-3">
          <h2 className="font-display font-bold text-foreground text-sm uppercase tracking-wider">
            Tabuleiro
          </h2>
          <div className="space-y-2">
            {players
              .slice()
              .sort((a, b) => b.posicao - a.posicao)
              .map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    p.id === currentPlayerId
                      ? "bg-accent/10 border-accent/30"
                      : "bg-card border-border"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-display font-bold shrink-0"
                    style={{ backgroundColor: p.cor_empilhadeira, color: "#1a1a2e" }}
                  >
                    {p.nickname[0].toUpperCase()}
                  </div>
                  <span className="font-display font-medium text-foreground text-sm truncate flex-1">
                    {p.nickname}
                    {p.id === playerId && (
                      <span className="ml-1 text-xs text-primary">(você)</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="h-2 rounded-full bg-muted overflow-hidden w-20">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(p.posicao / 42) * 100}%`,
                          backgroundColor: p.cor_empilhadeira,
                        }}
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
