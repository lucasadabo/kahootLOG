
CREATE TABLE public.rodadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jogo_id UUID NOT NULL REFERENCES public.jogos(id) ON DELETE CASCADE,
  jogador_id UUID NOT NULL REFERENCES public.jogadores(id) ON DELETE CASCADE,
  pergunta_id UUID NOT NULL REFERENCES public.perguntas(id),
  dado INTEGER NOT NULL,
  acertou BOOLEAN NOT NULL,
  posicao_antes INTEGER NOT NULL,
  posicao_depois INTEGER NOT NULL,
  evento TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rodadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert rodadas" ON public.rodadas FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can read rodadas" ON public.rodadas FOR SELECT TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rodadas;
