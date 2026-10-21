-- ==========================================================
-- proteger_solicitudes.sql — Las solicitudes, sus notas y los perfiles solo los ve el personal del panel
-- ==========================================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de setup_asignacion_casos.sql (usa es_personal_panel()).
-- Es seguro repetirlo.
--
-- Por qué: en TODO_EN_UNO.sql las políticas de solicitudes, notas_solicitud y perfiles solo exigen "tener sesión"
-- (USING (true)). Cualquier persona que se registre en IMMUJEL puede, llamando a la API directamente (el panel solo se
-- protege en la pantalla), leer la cédula, el teléfono, el correo y la descripción de TODAS las solicitudes, las notas
-- internas y los datos de todas las cuentas, y también modificar solicitudes ajenas. Son datos de mujeres en situación de
-- vulnerabilidad: este script exige ser personal del panel (rol admin o asesora) para eso:
--
--   · solicitudes: ver y actualizar → personal del panel. Crear sigue abierto (formulario público, con o sin sesión).
--   · notas_solicitud: ver y crear → personal del panel.
--   · perfiles: cada cuenta ve su propia fila; el personal del panel ve todas.
--
-- No debería romper nada de lo que hace el sitio hoy: el formulario solo inserta (sin leer), y el panel y el dashboard
-- los usa únicamente personal del panel. Si algo dejara de verse, el final del script trae cómo deshacerlo.
--
-- Solo se reemplazan las políticas con los nombres de TODO_EN_UNO.sql. Si en tu proyecto hubiera otras políticas abiertas
-- creadas a mano, seguirían vigentes: la consulta final las lista para que las revises.

-- ===== solicitudes =====
DROP POLICY IF EXISTS "solicitudes_select_auth" ON public.solicitudes;
DROP POLICY IF EXISTS "solicitudes_select_panel" ON public.solicitudes;
CREATE POLICY "solicitudes_select_panel" ON public.solicitudes
  FOR SELECT TO authenticated
  USING ((SELECT public.es_personal_panel()));

DROP POLICY IF EXISTS "solicitudes_update_auth" ON public.solicitudes;
DROP POLICY IF EXISTS "solicitudes_update_panel" ON public.solicitudes;
CREATE POLICY "solicitudes_update_panel" ON public.solicitudes
  FOR UPDATE TO authenticated
  USING ((SELECT public.es_personal_panel()))
  WITH CHECK ((SELECT public.es_personal_panel()));

-- ===== notas_solicitud =====
DROP POLICY IF EXISTS "notas_solicitud_select_auth" ON public.notas_solicitud;
DROP POLICY IF EXISTS "notas_solicitud_select_panel" ON public.notas_solicitud;
CREATE POLICY "notas_solicitud_select_panel" ON public.notas_solicitud
  FOR SELECT TO authenticated
  USING ((SELECT public.es_personal_panel()));

DROP POLICY IF EXISTS "notas_solicitud_insert_auth" ON public.notas_solicitud;
DROP POLICY IF EXISTS "notas_solicitud_insert_panel" ON public.notas_solicitud;
CREATE POLICY "notas_solicitud_insert_panel" ON public.notas_solicitud
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.es_personal_panel()));

-- ===== perfiles =====
DROP POLICY IF EXISTS "perfiles_select_auth" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_propia_o_panel" ON public.perfiles;
CREATE POLICY "perfiles_select_propia_o_panel" ON public.perfiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.es_personal_panel()));

-- Para deshacer (vuelve a dejar leer y editar a cualquier cuenta con sesión; no lo recomiendo):
--   DROP POLICY "solicitudes_select_panel" ON public.solicitudes;
--   CREATE POLICY "solicitudes_select_auth" ON public.solicitudes FOR SELECT TO authenticated USING (true);
--   DROP POLICY "solicitudes_update_panel" ON public.solicitudes;
--   CREATE POLICY "solicitudes_update_auth" ON public.solicitudes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
--   DROP POLICY "notas_solicitud_select_panel" ON public.notas_solicitud;
--   CREATE POLICY "notas_solicitud_select_auth" ON public.notas_solicitud FOR SELECT TO authenticated USING (true);
--   DROP POLICY "notas_solicitud_insert_panel" ON public.notas_solicitud;
--   CREATE POLICY "notas_solicitud_insert_auth" ON public.notas_solicitud FOR INSERT TO authenticated WITH CHECK (true);
--   DROP POLICY "perfiles_select_propia_o_panel" ON public.perfiles;
--   CREATE POLICY "perfiles_select_auth" ON public.perfiles FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';

-- Verificación: políticas que quedan en estas tablas. Debe haber, para solicitudes, el INSERT de anon y de authenticated
-- (formulario público) más las de panel; ninguna otra con condición "true" que permita leer o editar a cualquier cuenta.
SELECT tablename AS tabla, policyname AS politica, cmd AS comando, roles::text AS roles, COALESCE(qual, '(sin USING)') AS condicion
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('solicitudes', 'notas_solicitud', 'perfiles')
 ORDER BY tablename, cmd, policyname;
