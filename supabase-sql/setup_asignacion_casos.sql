-- ==========================================================
-- setup_asignacion_casos.sql — Personal de asesorías y asignación de casos
-- ==========================================================
-- Ejecutar COMPLETO en el SQL Editor de Supabase. Es seguro repetirlo.
--
-- Reglas (las hace cumplir la base de datos, no solo la pantalla):
--   1. Cargos del personal: abogada institucional, abogada comunal, psicóloga y defensora.
--   2. Solo la administradora (perfiles.rol = 'admin') agrega, retira o reincorpora personal.
--   3. Solo la abogada institucional activa puede asignar casos (función asignar_caso).
--      Hay una sola abogada institucional activa a la vez: Dahize Barrada.
--   4. Un caso lleva una o dos personas: responsable y apoyo.
--   5. Nada se borra: retirar a alguien es desactivarla y reasignar un caso libera la asignación anterior,
--      así queda el historial de quién tuvo cada caso y cuándo.
--   6. solicitudes.asignada_a y asignada_por se mantienen al día con el responsable del caso, para que el
--      dashboard (solicitudes por asesora, sin asesora) siga funcionando igual. Solo asignar_caso las cambia:
--      un trigger impide escribirlas directamente (la política abierta de solicitudes lo permitiría).
--   7. Para asignar también hace falta rol Asesora o Admin: una institucional degradada a "usuaria" deja de asignar.
--
-- Después de ejecutarlo:
--   a) La abogada institucional debe tener cuenta en IMMUJEL (Registrarse).
--   b) En el panel: Usuarias → Personal de asesorías → Agregar → su nombre y el cargo "Abogada institucional".
--      Si su rol es "usuaria", el panel ofrece cambiarlo a "asesora" (sin ese rol no puede entrar al panel).
--   c) Con las demás (abogada comunal, psicóloga, defensoras) se repite el paso b.

-- ==========================================================
-- PARTE 1: FUNCIONES DE AYUDA (quién es quién)
-- ==========================================================
-- SECURITY DEFINER para poder consultar perfiles sin tropezar con sus propias políticas de acceso.
-- search_path vacío: todo va con el esquema por delante, así nadie puede "colar" una función homónima.

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.es_personal_panel()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol IN ('admin', 'asesora'));
$$;

-- ==========================================================
-- PARTE 2: PERSONAL DE ASESORÍAS
-- ==========================================================
-- Una fila por persona y cargo. "activa" = forma parte del equipo ahora; retirar es poner activa = false.

CREATE TABLE IF NOT EXISTS public.personal_asesoria (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id    uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  cargo        text NOT NULL
                 CHECK (cargo IN ('abogada_institucional', 'abogada_comunal', 'psicologa', 'defensora')),
  activa       boolean NOT NULL DEFAULT true,
  agregada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agregada_en  timestamptz NOT NULL DEFAULT now(),
  retirada_en  timestamptz
);

-- La misma persona no puede figurar dos veces con el mismo cargo mientras esté activa.
CREATE UNIQUE INDEX IF NOT EXISTS personal_asesoria_cuenta_cargo_activa
  ON public.personal_asesoria (perfil_id, cargo) WHERE activa;

-- Una sola abogada institucional activa.
CREATE UNIQUE INDEX IF NOT EXISTS personal_asesoria_institucional_unica
  ON public.personal_asesoria (cargo) WHERE activa AND cargo = 'abogada_institucional';

CREATE INDEX IF NOT EXISTS personal_asesoria_perfil_idx ON public.personal_asesoria (perfil_id);

-- Quién agregó a la persona sale de la sesión (no se puede falsear), la fecha de retiro se llena sola y la cuenta
-- o el cargo de una fila no se cambian: las asignaciones antiguas apuntan a ella y su historial debe seguir siendo cierto.
CREATE OR REPLACE FUNCTION public.personal_asesoria_antes_de_guardar()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN NEW.agregada_por := auth.uid(); END IF;
    NEW.agregada_en := now();
    NEW.retirada_en := CASE WHEN NEW.activa THEN NULL ELSE now() END;
    RETURN NEW;
  END IF;

  IF NEW.perfil_id IS DISTINCT FROM OLD.perfil_id OR NEW.cargo IS DISTINCT FROM OLD.cargo THEN
    RAISE EXCEPTION 'No se puede cambiar la cuenta ni el cargo: retira a la persona y agrégala de nuevo.';
  END IF;
  NEW.agregada_por := OLD.agregada_por;
  NEW.agregada_en := OLD.agregada_en;
  IF OLD.activa AND NOT NEW.activa THEN
    NEW.retirada_en := now();
  ELSIF NOT OLD.activa AND NEW.activa THEN
    NEW.retirada_en := NULL;
  ELSE
    NEW.retirada_en := OLD.retirada_en;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personal_asesoria_antes_de_guardar ON public.personal_asesoria;
CREATE TRIGGER trg_personal_asesoria_antes_de_guardar
  BEFORE INSERT OR UPDATE ON public.personal_asesoria
  FOR EACH ROW
  EXECUTE FUNCTION public.personal_asesoria_antes_de_guardar();

-- Depende de la tabla anterior, por eso se crea aquí.
CREATE OR REPLACE FUNCTION public.es_abogada_institucional()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personal_asesoria p
     WHERE p.perfil_id = auth.uid() AND p.cargo = 'abogada_institucional' AND p.activa
  );
$$;

-- ==========================================================
-- PARTE 3: ASIGNACIONES DE CASOS (historial incluido)
-- ==========================================================
-- Un caso tiene como máximo dos asignaciones vigentes (liberada_en IS NULL): posición 1 = responsable, 2 = apoyo.
-- La columna solicitud_id toma el mismo tipo que solicitudes.id (uuid o número, según se creó esa tabla).

DO $mig$
DECLARE
  v_tipo text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_tipo
    FROM pg_attribute a
   WHERE a.attrelid = 'public.solicitudes'::regclass
     AND a.attname = 'id'
     AND NOT a.attisdropped;

  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'No se encontró la columna solicitudes.id. ¿Ya existe la tabla solicitudes?';
  END IF;

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS public.asignaciones_caso (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      solicitud_id %s NOT NULL REFERENCES public.solicitudes(id) ON DELETE CASCADE,
      personal_id  uuid NOT NULL REFERENCES public.personal_asesoria(id) ON DELETE CASCADE,
      posicion     smallint NOT NULL CHECK (posicion IN (1, 2)),
      asignada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      asignada_en  timestamptz NOT NULL DEFAULT now(),
      liberada_en  timestamptz,
      liberada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
    )
  $t$, v_tipo);
END
$mig$;

CREATE UNIQUE INDEX IF NOT EXISTS asignaciones_caso_posicion_vigente
  ON public.asignaciones_caso (solicitud_id, posicion) WHERE liberada_en IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS asignaciones_caso_persona_vigente
  ON public.asignaciones_caso (solicitud_id, personal_id) WHERE liberada_en IS NULL;

CREATE INDEX IF NOT EXISTS asignaciones_caso_personal_idx
  ON public.asignaciones_caso (personal_id) WHERE liberada_en IS NULL;

CREATE INDEX IF NOT EXISTS asignaciones_caso_solicitud_idx
  ON public.asignaciones_caso (solicitud_id);

-- ==========================================================
-- PARTE 4: ACCESO (RLS)
-- ==========================================================
-- A diferencia de otras tablas del proyecto (donde basta estar autenticada), aquí SÍ se valida el rol en la política:
-- quien consulte la API directamente tampoco puede saltarse las reglas.
--   · Ver personal y asignaciones: cuentas del panel (admin o asesora).
--   · Agregar, retirar o reincorporar personal: solo admin.
--   · Asignar casos: nadie escribe en asignaciones_caso directamente; solo la función asignar_caso, que exige ser
--     la abogada institucional.
--   · Borrar: nadie desde el cliente (para quitar a alguien se la retira).

ALTER TABLE public.personal_asesoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asignaciones_caso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_asesoria_select_panel" ON public.personal_asesoria;
CREATE POLICY "personal_asesoria_select_panel" ON public.personal_asesoria
  FOR SELECT TO authenticated
  USING ((SELECT public.es_personal_panel()));

DROP POLICY IF EXISTS "personal_asesoria_insert_admin" ON public.personal_asesoria;
CREATE POLICY "personal_asesoria_insert_admin" ON public.personal_asesoria
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.es_admin()));

DROP POLICY IF EXISTS "personal_asesoria_update_admin" ON public.personal_asesoria;
CREATE POLICY "personal_asesoria_update_admin" ON public.personal_asesoria
  FOR UPDATE TO authenticated
  USING ((SELECT public.es_admin()))
  WITH CHECK ((SELECT public.es_admin()));

DROP POLICY IF EXISTS "asignaciones_caso_select_panel" ON public.asignaciones_caso;
CREATE POLICY "asignaciones_caso_select_panel" ON public.asignaciones_caso
  FOR SELECT TO authenticated
  USING ((SELECT public.es_personal_panel()));

-- Permisos de tabla: por defecto Supabase da todo a anon y authenticated; aquí se recorta a lo necesario.
REVOKE ALL ON public.personal_asesoria FROM anon;
REVOKE ALL ON public.asignaciones_caso FROM anon;
REVOKE DELETE, TRUNCATE ON public.personal_asesoria FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.asignaciones_caso FROM authenticated;

-- Las funciones de ayuda las usan las políticas, así que authenticated debe poder ejecutarlas; anon no.
REVOKE ALL ON FUNCTION public.es_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.es_personal_panel() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.es_abogada_institucional() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.es_personal_panel() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.es_abogada_institucional() TO authenticated, service_role;

-- ==========================================================
-- PARTE 5: ASIGNAR UN CASO (única vía de escritura)
-- ==========================================================
-- asignar_caso(solicitud, [personal_1, personal_2]):
--   · exige ser la abogada institucional activa y tener acceso al panel (rol Asesora o Admin);
--   · acepta 0, 1 o 2 personas activas del personal (0 = dejar el caso sin asignar);
--   · libera lo que ya no corresponde y registra lo nuevo, conservando el historial;
--   · deja solicitudes.asignada_a con la cuenta del responsable (posición 1) y asignada_por con quien asignó.
-- La solicitud se recibe como texto para servir tanto si solicitudes.id es uuid como si es numérico.

CREATE OR REPLACE FUNCTION public.asignar_caso(p_solicitud text, p_personal uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_solicitud public.solicitudes.id%TYPE;
  v_ids       uuid[] := '{}';
  v_id        uuid;
  v_activas   integer;
BEGIN
  IF v_uid IS NULL OR NOT public.es_abogada_institucional() OR NOT public.es_personal_panel() THEN
    RAISE EXCEPTION 'Solo la abogada institucional puede asignar casos.' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE: dos asignaciones simultáneas del mismo caso se hacen una detrás de otra, no a la vez.
  SELECT s.id INTO v_solicitud FROM public.solicitudes s WHERE s.id::text = p_solicitud FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud no existe.' USING ERRCODE = 'P0002';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_personal, '{}'::uuid[]) LOOP
    CONTINUE WHEN v_id IS NULL;
    IF v_id = ANY (v_ids) THEN
      RAISE EXCEPTION 'No se puede elegir a la misma persona dos veces.' USING ERRCODE = '22023';
    END IF;
    v_ids := v_ids || v_id;
  END LOOP;

  IF COALESCE(array_length(v_ids, 1), 0) > 2 THEN
    RAISE EXCEPTION 'Un caso admite como máximo dos personas.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_activas FROM public.personal_asesoria p WHERE p.id = ANY (v_ids) AND p.activa;
  IF v_activas <> COALESCE(array_length(v_ids, 1), 0) THEN
    RAISE EXCEPTION 'Una de las personas elegidas no está activa en el personal.' USING ERRCODE = '22023';
  END IF;

  -- Se libera lo vigente que ya no está en la lista nueva (o cambió de posición).
  UPDATE public.asignaciones_caso a
     SET liberada_en = now(), liberada_por = v_uid
   WHERE a.solicitud_id = v_solicitud
     AND a.liberada_en IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM unnest(v_ids) WITH ORDINALITY AS n(pid, pos)
        WHERE n.pid = a.personal_id AND n.pos = a.posicion
     );

  -- Y se registra lo nuevo.
  INSERT INTO public.asignaciones_caso (solicitud_id, personal_id, posicion, asignada_por)
  SELECT v_solicitud, n.pid, n.pos::smallint, v_uid
    FROM unnest(v_ids) WITH ORDINALITY AS n(pid, pos)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.asignaciones_caso a
      WHERE a.solicitud_id = v_solicitud AND a.liberada_en IS NULL
        AND a.personal_id = n.pid AND a.posicion = n.pos
   );

  -- Compatibilidad con el dashboard: el responsable queda en solicitudes.asignada_a.
  UPDATE public.solicitudes s
     SET asignada_a = (SELECT p.perfil_id FROM public.personal_asesoria p WHERE p.id = v_ids[1]),
         asignada_por = v_uid
   WHERE s.id = v_solicitud;
END;
$fn$;

REVOKE ALL ON FUNCTION public.asignar_caso(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asignar_caso(text, uuid[]) TO authenticated;

-- ==========================================================
-- PARTE 6: LAS COLUMNAS ANTIGUAS DE ASIGNACIÓN SOLO LAS TOCA asignar_caso
-- ==========================================================
-- solicitudes.asignada_a y asignada_por alimentan el dashboard. La política abierta de solicitudes (TODO_EN_UNO.sql:
-- insertar sin sesión, actualizar con cualquier cuenta) dejaría escribirlas directamente: saltarse la regla de que solo
-- la abogada institucional asigna, o crear una solicitud que ya nace "asignada" y no aparece en la cola.
-- Se vigila a quien llega por la API pública (rol anon o authenticated). asignar_caso corre con los permisos de su dueño
-- (current_user distinto), así que no le afecta; el SQL Editor y service_role tampoco se restringen.

CREATE OR REPLACE FUNCTION public.proteger_asignacion_solicitud()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.asignada_a := NULL;
    NEW.asignada_por := NULL;
  ELSIF NEW.asignada_a IS DISTINCT FROM OLD.asignada_a OR NEW.asignada_por IS DISTINCT FROM OLD.asignada_por THEN
    RAISE EXCEPTION 'Solo la abogada institucional asigna casos.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_asignacion_solicitud ON public.solicitudes;
CREATE TRIGGER trg_proteger_asignacion_solicitud
  BEFORE INSERT OR UPDATE OF asignada_a, asignada_por ON public.solicitudes
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_asignacion_solicitud();

-- ==========================================================
-- OPCIONAL: dejar lista a la abogada institucional desde aquí
-- ==========================================================
-- Lo normal es hacerlo desde el panel (Usuarias → Personal de asesorías → Agregar). Si prefieres hacerlo en SQL,
-- ella ya debe tener cuenta. Quita los "--" y revisa que el SELECT devuelva UNA sola fila antes de insertar:
--
-- SELECT id, nombre_completo, email, rol FROM public.perfiles WHERE nombre_completo ILIKE '%Dahize%Barrada%';
-- INSERT INTO public.personal_asesoria (perfil_id, cargo)
--   SELECT id, 'abogada_institucional' FROM public.perfiles WHERE nombre_completo ILIKE '%Dahize%Barrada%';
-- UPDATE public.perfiles SET rol = 'asesora' WHERE nombre_completo ILIKE '%Dahize%Barrada%' AND rol = 'usuaria';

-- Que la API (PostgREST) vea de inmediato las tablas y la función nuevas.
NOTIFY pgrst, 'reload schema';

-- ==========================================================
-- VERIFICACIÓN FINAL (debe mostrar: 2 tablas con RLS, 4 funciones, 1 trigger de protección y el personal registrado)
-- ==========================================================
SELECT '✅ TABLAS CON RLS' AS paso, count(*)::text AS resultado
  FROM pg_tables
 WHERE schemaname = 'public' AND tablename IN ('personal_asesoria', 'asignaciones_caso') AND rowsecurity
UNION ALL
SELECT '✅ FUNCIONES', count(*)::text
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname IN ('es_admin', 'es_personal_panel', 'es_abogada_institucional', 'asignar_caso')
UNION ALL
SELECT '✅ PROTECCIÓN DE asignada_a', count(*)::text
  FROM pg_trigger
 WHERE tgrelid = 'public.solicitudes'::regclass AND tgname = 'trg_proteger_asignacion_solicitud'
UNION ALL
SELECT '✅ PERSONAL REGISTRADO', count(*)::text FROM public.personal_asesoria
UNION ALL
SELECT '✅ TIPO DE solicitud_id', format_type(a.atttypid, a.atttypmod)
  FROM pg_attribute a
 WHERE a.attrelid = 'public.asignaciones_caso'::regclass AND a.attname = 'solicitud_id';
