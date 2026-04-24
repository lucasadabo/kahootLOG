ALTER TABLE public.jogos
ADD COLUMN IF NOT EXISTS tempo_resposta integer NOT NULL DEFAULT 0;