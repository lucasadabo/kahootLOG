import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { JoinForm } from "@/components/game/JoinForm";
import { WaitingLobby } from "@/components/game/WaitingLobby";

function generateRandomColor(): string {
  const colors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
    "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
    "#BB8FCE", "#85C1E9", "#F8C471", "#82E0AA",
    "#F1948A", "#AED6F1", "#D7BDE2", "#A3E4D7",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export default function JoinGame() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async (pin: string, nick: string) => {
    setError("");
    setLoading(true);

    try {
      // Find game by PIN
      const { data: jogo, error: jogoError } = await supabase
        .from("jogos")
        .select("id")
        .eq("pin", pin)
        .maybeSingle();

      console.log("[JoinGame] PIN lookup result:", { pin, jogo, jogoError });

      if (jogoError) throw jogoError;
      if (!jogo) {
        setError("PIN inválido! Verifique e tente novamente.");
        setLoading(false);
        return;
      }

      // Insert player
      const { data: insertData, error: insertError } = await supabase
        .from("jogadores")
        .insert({
          jogo_id: jogo.id,
          nickname: nick.trim(),
          cor_empilhadeira: generateRandomColor(),
        })
        .select();

      console.log("[JoinGame] INSERT result:", { insertData, insertError });

      if (insertError) {
        console.error("[JoinGame] INSERT error:", insertError);
        if (insertError.code === "23505") {
          setError("Esse nickname já está em uso! Escolha outro.");
        } else {
          setError("Erro ao entrar no jogo. Tente novamente.");
        }
        setLoading(false);
        return;
      }

      console.log("[JoinGame] Transitioning to lobby for game:", jogo.id);
      setGameId(jogo.id);
      setNickname(nick.trim());
    } catch (err) {
      console.error("[JoinGame] Unexpected error:", err);
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (gameId) {
    return <WaitingLobby gameId={gameId} nickname={nickname} />;
  }

  return <JoinForm onJoin={handleJoin} error={error} loading={loading} />;
}
