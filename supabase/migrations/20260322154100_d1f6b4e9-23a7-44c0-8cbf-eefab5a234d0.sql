
-- Create jogos table
CREATE TABLE public.jogos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pin TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create jogadores table
CREATE TABLE public.jogadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jogo_id UUID NOT NULL REFERENCES public.jogos(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  cor_empilhadeira TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(jogo_id, nickname)
);

-- Enable RLS
ALTER TABLE public.jogos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jogadores ENABLE ROW LEVEL SECURITY;

-- Jogos: anyone can read
CREATE POLICY "Anyone can read jogos" ON public.jogos FOR SELECT USING (true);

-- Jogadores: anyone can read and insert (no auth required for game lobby)
CREATE POLICY "Anyone can read jogadores" ON public.jogadores FOR SELECT USING (true);
CREATE POLICY "Anyone can insert jogadores" ON public.jogadores FOR INSERT WITH CHECK (true);

-- Enable realtime for jogadores
ALTER PUBLICATION supabase_realtime ADD TABLE public.jogadores;
