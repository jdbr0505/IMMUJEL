-- ==========================================================
-- proteger_rol_perfiles.sql — Cada cuenta edita solo su perfil y solo una administradora da o cambia roles
-- ==========================================================
-- Ejecutar en el SQL Editor de Supabase. Es seguro repetirlo. Recomendado ejecutarlo junto con setup_asignacion_casos.sql.
--
-- Por qué: en TODO_EN_UNO.sql la política "perfiles_update_auth" deja que CUALQUIER cuenta con sesión modifique CUALQUIER
-- fila de perfiles, columna por columna. Eso tiene dos consecuencias graves (la pantalla las oculta, la base de datos no):
--   · Rol: una usuaria cualquiera podría ponerse rol 'admin' llamando a la API directamente.
--   · Identidad: podría cambiar el id de su fila y el de la fila de una administradora para quedar como ella
--     (si perfiles.id no tiene llave foránea a auth.users; el diagnóstico del final lo muestra).
-- Con cualquiera de las dos saltaría las reglas de asignación de casos y de personal. Este script las cierra sin tocar
-- lo demás:
--
--   · Una cuenta nueva solo puede crearse con rol 'usuaria' (o sin rol, que equivale a lo mismo).
--   · Cambiar el rol de una fila existente solo puede hacerlo una administradora.
--   · Cada cuenta solo puede modificar su propia fila (la administradora, cualquiera): no se puede tocar el perfil ajeno
--     ni cambiar el id de una fila para suplantar a otra cuenta.
--   · Lo que no llega por la API pública (SQL Editor, service_role, el trigger de registro on_auth_user_created)
--     no se restringe.
--   · Editar nombre, teléfono u otros datos de tu propio perfil sigue funcionando como siempre (también el registro:
--     Login/signup.js guarda su propia fila).

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

-- Cada cuenta modifica solo su fila; la administradora, cualquiera. USING decide qué filas se pueden tocar y WITH CHECK
-- que la fila resultante siga siendo la propia (así no se puede cambiar el id para suplantar a otra cuenta).
DROP POLICY IF EXISTS "perfiles_update_auth" ON public.perfiles;
CREATE POLICY "perfiles_update_auth" ON public.perfiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.es_admin()))
  WITH CHECK (id = (SELECT auth.uid()) OR (SELECT public.es_admin()));

-- Para deshacer solo la política (vuelve a dejar editar cualquier fila a cualquier cuenta con sesión; no lo recomiendo):
--   DROP POLICY "perfiles_update_auth" ON public.perfiles;
--   CREATE POLICY "perfiles_update_auth" ON public.perfiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Verificación (una sola tabla de resultados, porque el editor solo muestra la última consulta):
--   · 'trigger': deben aparecer trg_proteger_rol_insert y trg_proteger_rol_update.
--   · 'restricción': lo esperable es una llave foránea de id hacia auth.users (FOREIGN KEY (id) REFERENCES auth.users(id)).
--     Si no aparece, la política de arriba es todavía más importante.
SELECT 'trigger' AS tipo, tgname::text AS nombre, '' AS detalle
  FROM pg_trigger
 WHERE tgrelid = 'public.perfiles'::regclass
   AND tgname IN ('trg_proteger_rol_insert', 'trg_proteger_rol_update')
UNION ALL
SELECT 'política', policyname::text, cmd::text
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'perfiles'
UNION ALL
SELECT 'restricción', conname::text, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.perfiles'::regclass
ORDER BY 1, 2;
