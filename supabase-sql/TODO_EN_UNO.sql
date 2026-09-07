-- ==========================================================
-- TODO_EN_UNO.sql — Ejecutar COMPLETO en Supabase SQL Editor
-- Orden correcto: migraciones → RLS → perfiles → storage
-- ==========================================================

-- ==========================================================
-- PARTE 1: MIGRACIONES DE ESQUEMA
-- ==========================================================

-- 1a. Columna created_at en perfiles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'perfiles' AND column_name = 'created_at') THEN
    ALTER TABLE perfiles ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- 1b. Columna tipo_asesoria en solicitudes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'solicitudes' AND column_name = 'tipo_asesoria') THEN
    ALTER TABLE solicitudes ADD COLUMN tipo_asesoria TEXT CHECK (tipo_asesoria IN ('juridica', 'psicologica', 'social', 'general'));
  END IF;
END $$;

-- 1c. Columnas JSONB en publicaciones
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'publicaciones' AND column_name = 'imagenes' AND data_type = 'text') THEN
    EXECUTE 'ALTER TABLE publicaciones ALTER COLUMN imagenes TYPE JSONB USING CASE WHEN imagenes IS NULL OR imagenes = '''' THEN ''[]''::jsonb WHEN imagenes::text ~ ''^\[.*\]$'' THEN imagenes::jsonb ELSE to_jsonb(imagenes) END';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'publicaciones' AND column_name = 'pdfs' AND data_type = 'text') THEN
    EXECUTE 'ALTER TABLE publicaciones ALTER COLUMN pdfs TYPE JSONB USING CASE WHEN pdfs IS NULL OR pdfs = '''' THEN ''[]''::jsonb WHEN pdfs::text ~ ''^\[.*\]$'' THEN pdfs::jsonb ELSE to_jsonb(pdfs) END';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'publicaciones' AND column_name = 'imagenes') THEN
    ALTER TABLE publicaciones ADD COLUMN imagenes JSONB DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'publicaciones' AND column_name = 'pdfs') THEN
    ALTER TABLE publicaciones ADD COLUMN pdfs JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- 1d. Migrar URLs sueltas a arrays JSONB
UPDATE publicaciones
SET imagenes = to_jsonb(ARRAY[imagen_url])
WHERE imagen_url IS NOT NULL
  AND (imagenes IS NULL OR jsonb_array_length(imagenes) = 0);

UPDATE publicaciones
SET pdfs = to_jsonb(ARRAY[pdf_url])
WHERE pdf_url IS NOT NULL
  AND (pdfs IS NULL OR jsonb_array_length(pdfs) = 0);

UPDATE publicaciones SET imagenes = '[]'::jsonb WHERE imagenes IS NULL;
UPDATE publicaciones SET pdfs = '[]'::jsonb WHERE pdfs IS NULL;

-- 1e. Columna actualizado_en
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'publicaciones' AND column_name = 'updated_at') THEN
    ALTER TABLE publicaciones ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- ==========================================================
-- PARTE 2: ROW LEVEL SECURITY (políticas de acceso)
-- ==========================================================

-- 2a. PERFILES
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perfiles_select_auth" ON perfiles;
CREATE POLICY "perfiles_select_auth" ON perfiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "perfiles_insert_anon" ON perfiles;
CREATE POLICY "perfiles_insert_anon" ON perfiles
  FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "perfiles_insert_auth" ON perfiles;
CREATE POLICY "perfiles_insert_auth" ON perfiles
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "perfiles_update_auth" ON perfiles;
CREATE POLICY "perfiles_update_auth" ON perfiles
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2b. SOLICITUDES
ALTER TABLE public.solicitudes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "solicitudes_insert_anon" ON solicitudes;
CREATE POLICY "solicitudes_insert_anon" ON solicitudes
  FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "solicitudes_select_auth" ON solicitudes;
CREATE POLICY "solicitudes_select_auth" ON solicitudes
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "solicitudes_insert_auth" ON solicitudes;
CREATE POLICY "solicitudes_insert_auth" ON solicitudes
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "solicitudes_update_auth" ON solicitudes;
CREATE POLICY "solicitudes_update_auth" ON solicitudes
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2c. NOTAS_SOLICITUD
ALTER TABLE public.notas_solicitud ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notas_solicitud_select_auth" ON notas_solicitud;
CREATE POLICY "notas_solicitud_select_auth" ON notas_solicitud
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "notas_solicitud_insert_auth" ON notas_solicitud;
CREATE POLICY "notas_solicitud_insert_auth" ON notas_solicitud
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2d. PUBLICACIONES
ALTER TABLE public.publicaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "publicaciones_select_anon" ON publicaciones;
CREATE POLICY "publicaciones_select_anon" ON publicaciones
  FOR SELECT TO anon
  USING (publicado = true);

DROP POLICY IF EXISTS "publicaciones_select_auth" ON publicaciones;
CREATE POLICY "publicaciones_select_auth" ON publicaciones
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "publicaciones_insert_auth" ON publicaciones;
CREATE POLICY "publicaciones_insert_auth" ON publicaciones
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "publicaciones_update_auth" ON publicaciones;
CREATE POLICY "publicaciones_update_auth" ON publicaciones
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "publicaciones_delete_auth" ON publicaciones;
CREATE POLICY "publicaciones_delete_auth" ON publicaciones
  FOR DELETE TO authenticated
  USING (true);

-- ==========================================================
-- PARTE 3: SINCRONIZAR perfiles DESDE auth.users
-- ==========================================================

-- 3a. Crear perfiles para usuarios que no tienen
INSERT INTO public.perfiles (id, email, nombre_completo, nombre_usuario, rol, telefono, created_at)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', 'Sin nombre'),
  COALESCE(au.raw_user_meta_data->>'user_name', split_part(au.email, '@', 1)),
  'usuaria',
  COALESCE(au.raw_user_meta_data->>'phone', ''),
  COALESCE(au.created_at, now())
FROM auth.users au
LEFT JOIN public.perfiles p ON p.id = au.id
WHERE p.id IS NULL;

-- 3b. Asegurar que el admin tenga rol admin (cambia el email si usas otro)
UPDATE public.perfiles
SET rol = 'admin'
WHERE email = 'jdbr0505@gmail.com' OR nombre_usuario = 'Jdbr0505';

-- 3c. Ver resultado
SELECT id, email, nombre_completo, nombre_usuario, rol FROM public.perfiles ORDER BY creado_en DESC;

-- ==========================================================
-- PARTE 4: TRIGGER para futuros registros (auth.users → perfiles)
-- ==========================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre_completo, nombre_usuario, email, telefono, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'user_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'usuaria'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ==========================================================
-- PARTE 5: STORAGE POLICIES (subida de imágenes/PDFs)
-- ==========================================================

-- Bucket: publicacion-imagenes
DROP POLICY IF EXISTS "storage_select_anon_imagenes" ON storage.objects;
CREATE POLICY "storage_select_anon_imagenes" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'publicacion-imagenes');

DROP POLICY IF EXISTS "storage_insert_auth_imagenes" ON storage.objects;
CREATE POLICY "storage_insert_auth_imagenes" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'publicacion-imagenes');

DROP POLICY IF EXISTS "storage_delete_auth_imagenes" ON storage.objects;
CREATE POLICY "storage_delete_auth_imagenes" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'publicacion-imagenes');

-- Bucket: publicacion-pdfs
DROP POLICY IF EXISTS "storage_select_anon_pdfs" ON storage.objects;
CREATE POLICY "storage_select_anon_pdfs" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'publicacion-pdfs');

DROP POLICY IF EXISTS "storage_insert_auth_pdfs" ON storage.objects;
CREATE POLICY "storage_insert_auth_pdfs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'publicacion-pdfs');

DROP POLICY IF EXISTS "storage_delete_auth_pdfs" ON storage.objects;
CREATE POLICY "storage_delete_auth_pdfs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'publicacion-pdfs');

-- ==========================================================
-- VERIFICACIÓN FINAL
-- ==========================================================
SELECT '✅ ESQUEMA' AS paso, COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('perfiles','solicitudes','notas_solicitud','publicaciones')
UNION ALL
SELECT '✅ RLS ACTIVO', COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('perfiles','solicitudes','notas_solicitud','publicaciones') AND rowsecurity = true
UNION ALL
SELECT '✅ PERFILES', COUNT(*) FROM perfiles
UNION ALL
SELECT '✅ SOLICITUDES', COUNT(*) FROM solicitudes
UNION ALL
SELECT '✅ PUBLICACIONES', COUNT(*) FROM publicaciones
UNION ALL
SELECT '✅ TRIGGER', COUNT(*) FROM information_schema.triggers WHERE trigger_name = 'on_auth_user_created';
