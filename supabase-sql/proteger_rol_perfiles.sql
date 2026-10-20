-- ==========================================================
-- proteger_rol_perfiles.sql — Solo una administradora puede dar o cambiar roles
-- ==========================================================
-- Ejecutar en el SQL Editor de Supabase. Es seguro repetirlo. Recomendado ejecutarlo junto con setup_asignacion_casos.sql.
--
-- Por qué: en TODO_EN_UNO.sql la política "perfiles_update_auth" deja que CUALQUIER cuenta con sesión modifique CUALQUIER
-- fila de perfiles. Eso incluye la columna rol: una usuaria cualquiera podría ponerse rol 'admin' llamando a la API
-- directamente (la pantalla lo oculta, la base de datos no lo impide). Con ese rol saltaría también las reglas de
-- asignación de casos y de personal. Este script cierra ese hueco sin tocar lo demás:
--
--   · Una cuenta nueva solo puede crearse con rol 'usuaria' (o sin rol, que equivale a lo mismo).
--   · Cambiar el rol de una fila existente solo puede hacerlo una administradora.
--   · Lo que no llega por la API pública (SQL Editor, service_role, el trigger de registro on_auth_user_created)
--     no se restringe.
--   · Editar nombre, teléfono u otros datos del perfil sigue funcionando como siempre.

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin');
$$;

REVOKE ALL ON FUNCTION public.es_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.proteger_rol_perfiles()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Solo se vigila a quien llega por la API pública (rol anon o authenticated).
  IF COALESCE(auth.jwt() ->> 'role', '') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.rol, 'usuaria') = 'usuaria' THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.rol IS NOT DISTINCT FROM OLD.rol THEN
    RETURN NEW;
  END IF;

  IF public.es_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Solo una administradora puede dar o cambiar roles.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_rol_insert ON public.perfiles;
CREATE TRIGGER trg_proteger_rol_insert
  BEFORE INSERT ON public.perfiles
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_rol_perfiles();

DROP TRIGGER IF EXISTS trg_proteger_rol_update ON public.perfiles;
CREATE TRIGGER trg_proteger_rol_update
  BEFORE UPDATE OF rol ON public.perfiles
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_rol_perfiles();

-- Verificación: deben aparecer los dos triggers.
SELECT tgname AS trigger_de_proteccion
  FROM pg_trigger
 WHERE tgrelid = 'public.perfiles'::regclass
   AND tgname IN ('trg_proteger_rol_insert', 'trg_proteger_rol_update');
