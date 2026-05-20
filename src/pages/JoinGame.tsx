import { useState, useEffect } from "react";
import { gameSupabase } from "@/lib/gameSupabase";
import { JoinForm } from "@/components/game/JoinForm";
import { WaitingLobby } from "@/components/game/WaitingLobby";
import { GamePlay } from "@/components/game/GamePlay";

function generateRandomColor(): string {
  const colors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
    "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
    "#BB8FCE", "#85C1E9", "#F8C471", "#82E0AA",
    "#F1948A", "#AED6F1", "#D7BDE2", "#A3E4D7",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function isGameStarted(status: string) {
  return status === "em_andamento" || status === "playing" || status === "finalizado" || status === "finished";
}

export default function JoinGame() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
  const saved = sessionStorage.getItem("quizgame_session");
  if (!saved) return;
  try {
    const { gameId: gId, playerId: pId, nickname: nick } = JSON.parse(saved);
    if (gId && pId && nick) {
      setGameId(gId);
      setPlayerId(pId);
      setNickname(nick);
    }
  } catch (_) {
    sessionStorage.removeItem("quizgame_session");
  }
}, []);

  // Poll game status directly in JoinGame once we have a gameId
  useEffect(() => {
    if (!gameId || gameStarted) return;

    const checkStatus = async () => {
      const { data, error } = await gameSupabase
        .from("jogos")
        .select("status")
        .eq("id", gameId)
        .single();

      console.log("[JoinGame] poll status:", { data, error });

      if (!error && data && isGameStarted(data.status)) {
        console.log("[JoinGame] Game started! Transitioning to GamePlay...");
        setGameStarted(true);
      }
    };

    checkStatus();
    const interval = window.setInterval(checkStatus, 1500);
    return () => window.clearInterval(interval);
  }, [gameId, gameStarted]);

  const handleJoin = async (pin: string, nick: string) => {
    setError("");
    setLoading(true);

    try {
      const { data: jogo, error: jogoError } = await gameSupabase
        .from("jogos")
        .select("id, status")
        .eq("pin", pin)
        .maybeSingle();

      console.log("[JoinGame] PIN lookup SELECT:", { pin, jogo, jogoError });

      if (jogoError) throw jogoError;
      if (!jogo) {
        setError("PIN inválido! Verifique e tente novamente.");
        return;
      }

      // ✅ FIX: calcula ordem_turno ANTES do INSERT para late joiners
      let ordemTurno: number | null = null;
      if (isGameStarted(jogo.status)) {
        const { data: ordens } = await gameSupabase
          .from("jogadores")
          .select("ordem_turno")
          .eq("jogo_id", jogo.id)
          .not("ordem_turno", "is", null);

        const maxOrdem = ordens && ordens.length > 0
          ? Math.max(...ordens.map((j: any) => j.ordem_turno))
          : 0;

        ordemTurno = maxOrdem + 1;
        console.log("[JoinGame] Late joiner, ordem_turno calculada:", ordemTurno);
      }

      const { data: insertData, error: insertError } = await gameSupabase
        .from("jogadores")
        .insert({
          jogo_id: jogo.id,
          nickname: nick.trim(),
          cor_empilhadeira: generateRandomColor(),
          // ✅ inclui ordem_turno direto no INSERT quando for late joiner
          ...(ordemTurno !== null ? { ordem_turno: ordemTurno } : {}),
        })
        .select("id")
        .single();

      console.log("[JoinGame] jogador INSERT:", { insertData, insertError, ordemTurno });

      if (insertError || !insertData) {
        console.error("[JoinGame] jogador INSERT ERROR:", insertError);
        if (insertError?.code === "23505") {
          setError("Esse nickname já está em uso! Escolha outro.");
        } else {
          setError("Erro ao entrar no jogo. Tente novamente.");
        }
        return;
      }

      setGameId(jogo.id);
      setPlayerId(insertData.id);
      setNickname(nick.trim());
      sessionStorage.setItem("quizgame_session", JSON.stringify({
  gameId: jogo.id,
  playerId: insertData.id,
  nickname: nick.trim(),
}));

      if (isGameStarted(jogo.status)) {
        console.log("[JoinGame] Late joiner — game already started, going to GamePlay");
        setGameStarted(true);
      }
    } catch (err) {
      console.error("[JoinGame] Error:", err);
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (gameId && playerId && gameStarted) {
    return <GamePlay gameId={gameId} playerId={playerId} nickname={nickname} />;
  }

  if (gameId && playerId) {
    return (
      <WaitingLobby
        gameId={gameId}
        nickname={nickname}
        onGameStart={() => setGameStarted(true)}
      />
    );
  }

  return <JoinForm onJoin={handleJoin} error={error} loading={loading} />;
}
