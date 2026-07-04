-- ==========================================================
-- MIGRACIONES COMPLETAS IMMUJEL
-- Ejecutar TODO en orden en Supabase SQL Editor (Ctrl+Enter)
-- ==========================================================

-- ==========================================================
-- 1. PERFILES
-- ==========================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'perfiles' AND column_name = 'created_at') THEN
    ALTER TABLE perfiles ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- Permitir registro de nuevas usuarias (INSERT anónimo y autenticado)
DROP POLICY IF EXISTS "perfiles_insert_anon" ON perfiles;
CREATE POLICY "perfiles_insert_anon" ON perfiles
  FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "perfiles_insert_auth" ON perfiles;
CREATE POLICY "perfiles_insert_auth" ON perfiles
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Permitir lectura a cualquier usuario autenticado
DROP POLICY IF EXISTS "perfiles_select" ON perfiles;
CREATE POLICY "perfiles_select" ON perfiles
  FOR SELECT TO authenticated
  USING (true);

-- Permitir actualización a autenticados (cambio de roles)
DROP POLICY IF EXISTS "perfiles_update" ON perfiles;
CREATE POLICY "perfiles_update" ON perfiles
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ==========================================================
-- 2. SOLICITUDES
-- ==========================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'solicitudes' AND column_name = 'tipo_asesoria') THEN
    ALTER TABLE solicitudes ADD COLUMN tipo_asesoria TEXT CHECK (tipo_asesoria IN ('juridica', 'psicologica', 'social', 'general'));
  END IF;
END $$;

-- Permitir que cualquier persona envíe una solicitud desde el formulario público
DROP POLICY IF EXISTS "solicitudes_insert_anon" ON solicitudes;
CREATE POLICY "solicitudes_insert_anon" ON solicitudes
  FOR INSERT TO anon
  WITH CHECK (true);

-- Admin/Asesoras pueden ver solicitudes
DROP POLICY IF EXISTS "solicitudes_select" ON solicitudes;
CREATE POLICY "solicitudes_select" ON solicitudes
  FOR SELECT TO authenticated
  USING (true);

-- Admin/Asesoras pueden crear solicitudes (nueva asesoría manual)
DROP POLICY IF EXISTS "solicitudes_insert_auth" ON solicitudes;
CREATE POLICY "solicitudes_insert_auth" ON solicitudes
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Admin/Asesoras pueden actualizar estado y asignación
DROP POLICY IF EXISTS "solicitudes_update" ON solicitudes;
CREATE POLICY "solicitudes_update" ON solicitudes
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ==========================================================
-- 3. NOTAS_SOLICITUD
-- ==========================================================
DROP POLICY IF EXISTS "notas_solicitud_insert" ON notas_solicitud;
CREATE POLICY "notas_solicitud_insert" ON notas_solicitud
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "notas_solicitud_select" ON notas_solicitud;
CREATE POLICY "notas_solicitud_select" ON notas_solicitud
  FOR SELECT TO authenticated
  USING (true);

-- ==========================================================
-- 4. PUBLICACIONES
-- ==========================================================
-- Corregir columnas a JSONB si fueron creadas como TEXT anteriormente
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'publicaciones' AND column_name = 'imagenes' AND data_type = 'text') THEN
    ALTER TABLE publicaciones ALTER COLUMN imagenes TYPE JSONB USING imagenes::jsonb;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'publicaciones' AND column_name = 'pdfs' AND data_type = 'text') THEN
    ALTER TABLE publicaciones ALTER COLUMN pdfs TYPE JSONB USING pdfs::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'publicaciones' AND column_name = 'imagenes') THEN
    ALTER TABLE publicaciones ADD COLUMN imagenes JSONB DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'publicaciones' AND column_name = 'pdfs') THEN
    ALTER TABLE publicaciones ADD COLUMN pdfs JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Convertir URLs sueltas en arrays JSONB (tanto para TEXT como JSONB mal formados)
UPDATE publicaciones SET imagenes = to_jsonb(ARRAY[imagenes::text])
  WHERE imagen_url IS NOT NULL AND imagen_url != ''
  AND (imagenes IS NULL OR imagenes::text = '' OR (imagenes::text NOT LIKE '[%' AND LENGTH(imagenes::text) > 0));

UPDATE publicaciones SET pdfs = to_jsonb(ARRAY[pdfs::text])
  WHERE pdf_url IS NOT NULL AND pdf_url != ''
  AND (pdfs IS NULL OR pdfs::text = '' OR (pdfs::text NOT LIKE '[%' AND LENGTH(pdfs::text) > 0));

-- Fallback: migrar desde imagen_url/pdf_url
UPDATE publicaciones SET imagenes = to_jsonb(ARRAY[imagen_url])
  WHERE imagen_url IS NOT NULL AND imagen_url != ''
  AND (imagenes IS NULL OR jsonb_array_length(imagenes) = 0 OR imagenes::text = '[]');

UPDATE publicaciones SET pdfs = to_jsonb(ARRAY[pdf_url])
  WHERE pdf_url IS NOT NULL AND pdf_url != ''
  AND (pdfs IS NULL OR jsonb_array_length(pdfs) = 0 OR pdfs::text = '[]');

UPDATE publicaciones SET imagenes = '[]'::jsonb WHERE imagenes IS NULL OR imagenes::text = '';
UPDATE publicaciones SET pdfs = '[]'::jsonb WHERE pdfs IS NULL OR pdfs::text = '';

-- Público puede ver SOLO publicaciones publicadas (para semanario.html, noticiero.html, index.html)
DROP POLICY IF EXISTS "publicaciones_select_anon" ON publicaciones;
CREATE POLICY "publicaciones_select_anon" ON publicaciones
  FOR SELECT TO anon
  USING (publicado = true);

-- Admin/Asesoras pueden ver TODAS (incluyendo borradores)
DROP POLICY IF EXISTS "publicaciones_select_auth" ON publicaciones;
CREATE POLICY "publicaciones_select_auth" ON publicaciones
  FOR SELECT TO authenticated
  USING (true);

-- Admin/Asesoras pueden crear
DROP POLICY IF EXISTS "publicaciones_insert" ON publicaciones;
CREATE POLICY "publicaciones_insert" ON publicaciones
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Admin/Asesoras pueden actualizar
DROP POLICY IF EXISTS "publicaciones_update" ON publicaciones;
CREATE POLICY "publicaciones_update" ON publicaciones
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Admin/Asesoras pueden eliminar
DROP POLICY IF EXISTS "publicaciones_delete" ON publicaciones;
CREATE POLICY "publicaciones_delete" ON publicaciones
  FOR DELETE TO authenticated
  USING (true);

-- ==========================================================
-- 5. STORAGE (subida de archivos al CMS)
-- ==========================================================
-- Anónimo: solo lectura de imágenes y PDFs públicos
DROP POLICY IF EXISTS "anon_select_publicacion_imagenes" ON storage.objects;
CREATE POLICY "anon_select_publicacion_imagenes" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'publicacion-imagenes');

DROP POLICY IF EXISTS "anon_select_publicacion_pdfs" ON storage.objects;
CREATE POLICY "anon_select_publicacion_pdfs" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'publicacion-pdfs');

-- Autenticados: pueden subir y eliminar archivos en los buckets del CMS
DROP POLICY IF EXISTS "auth_insert_publicacion_imagenes" ON storage.objects;
CREATE POLICY "auth_insert_publicacion_imagenes" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'publicacion-imagenes');

DROP POLICY IF EXISTS "auth_insert_publicacion_pdfs" ON storage.objects;
CREATE POLICY "auth_insert_publicacion_pdfs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'publicacion-pdfs');

DROP POLICY IF EXISTS "auth_delete_publicacion_imagenes" ON storage.objects;
CREATE POLICY "auth_delete_publicacion_imagenes" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'publicacion-imagenes');

DROP POLICY IF EXISTS "auth_delete_publicacion_pdfs" ON storage.objects;
CREATE POLICY "auth_delete_publicacion_pdfs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'publicacion-pdfs');

-- ==========================================================
-- VERIFICACIÓN: muestra todas las políticas creadas
-- ==========================================================
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename IN ('perfiles','solicitudes','notas_solicitud','publicaciones')
   OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY tablename, policyname;

-- Mostrar resumen de políticas por tabla
SELECT tablename, 
  string_agg(DISTINCT cmd, ', ') as operations,
  string_agg(DISTINCT r, ', ') as roles
FROM pg_policies, LATERAL unnest(roles) AS r
WHERE tablename IN ('perfiles','solicitudes','notas_solicitud','publicaciones')
   OR (schemaname = 'storage' AND tablename = 'objects')
GROUP BY tablename
ORDER BY tablename;
