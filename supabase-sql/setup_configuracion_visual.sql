-- ==========================================================
-- CONFIGURACIÓN VISUAL — temas por evento/fecha especial
-- ==========================================================
-- Tabla de una sola fila (fila fija id='global') que controla
-- qué tema estacional se aplica en TODO el sitio para TODAS
-- las visitantes. Se lee sin autenticación (la landing pública
-- necesita saber qué tema pintar antes de que nadie inicie sesión)
-- y solo se escribe desde el panel Admin con rol 'admin'.
--
-- A diferencia de otras tablas del proyecto (donde el RLS solo
-- exige "authenticated"), aquí SÍ se valida el rol admin en la
-- política misma: esta fila cambia la apariencia pública de todo
-- el sitio, así que cualquier cuenta autenticada normal no debe
-- poder tocarla, aunque llame a la API directamente.

CREATE TABLE IF NOT EXISTS public.configuracion_visual (
  id             text PRIMARY KEY DEFAULT 'global',
  modo           text NOT NULL DEFAULT 'automatico'
                   CHECK (modo IN ('automatico', 'manual', 'ninguno')),
  tema_manual    text
                   CHECK (tema_manual IS NULL OR tema_manual IN (
                     'institucional', 'dia-naranja', 'octubre-rosa', 'activismo-16dias'
                   )),
  actualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT configuracion_visual_singleton CHECK (id = 'global')
);

INSERT INTO public.configuracion_visual (id, modo)
VALUES ('global', 'automatico')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.configuracion_visual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "configuracion_visual_select_public" ON configuracion_visual;
CREATE POLICY "configuracion_visual_select_public" ON configuracion_visual
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "configuracion_visual_update_admin" ON configuracion_visual;
CREATE POLICY "configuracion_visual_update_admin" ON configuracion_visual
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin'));

-- No se permite INSERT/DELETE desde el cliente: la fila 'global'
-- ya existe (creada arriba) y es la única que debe existir jamás.

SELECT '✅ configuracion_visual' AS paso, * FROM public.configuracion_visual;
