-- ==========================================================
-- SQL: Deshabilitar RLS y limpiar políticas para funcionamiento
-- ==========================================================

-- 1. DESHABILITAR RLS EN TABLAS PROBLEMÁTICAS
ALTER TABLE publicaciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes DISABLE ROW LEVEL SECURITY;
ALTER TABLE notas_solicitud DISABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles DISABLE ROW LEVEL SECURITY;

-- 2. ELIMINAR TODAS LAS POLÍTICAS EXISTENTES
DROP POLICY IF EXISTS publicaciones_select_anon ON publicaciones;
DROP POLICY IF EXISTS publicaciones_select_auth ON publicaciones;
DROP POLICY IF EXISTS publicaciones_insert_auth ON publicaciones;
DROP POLICY IF EXISTS publicaciones_update_auth ON publicaciones;
DROP POLICY IF EXISTS publicaciones_delete_auth ON publicaciones;

DROP POLICY IF EXISTS solicitudes_insert_anon ON solicitudes;
DROP POLICY IF EXISTS solicitudes_select_auth ON solicitudes;
DROP POLICY IF EXISTS solicitudes_insert_auth ON solicitudes;
DROP POLICY IF EXISTS solicitudes_update_auth ON solicitudes;

DROP POLICY IF EXISTS notas_solicitud_select_auth ON notas_solicitud;
DROP POLICY IF EXISTS notas_solicitud_insert_auth ON notas_solicitud;

DROP POLICY IF EXISTS perfiles_insert_anon ON perfiles;
DROP POLICY IF EXISTS perfiles_select ON perfiles;
DROP POLICY IF EXISTS perfiles_insert_auth ON perfiles;
DROP POLICY IF EXISTS perfiles_update ON perfiles;

-- 3. CORREGIR COLUMNAS JSONB (si aún están como text)
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

-- 4. MIGRAR URLs sueltas a arrays JSONB
UPDATE publicaciones SET imagenes = to_jsonb(ARRAY[imagen_url])
  WHERE imagen_url IS NOT NULL AND imagen_url != ''
  AND (imagenes IS NULL OR jsonb_array_length(imagenes) = 0);

UPDATE publicaciones SET pdfs = to_jsonb(ARRAY[pdf_url])
  WHERE pdf_url IS NOT NULL AND pdf_url != ''
  AND (pdfs IS NULL OR jsonb_array_length(pdfs) = 0);

UPDATE publicaciones SET imagenes = '[]'::jsonb WHERE imagenes IS NULL;
UPDATE publicaciones SET pdfs = '[]'::jsonb WHERE pdfs IS NULL;

-- 5. MANTENER RLS EN storage.objects para que las imágenes subidas sean accesibles
-- (storage.objects requiere RLS para que anon pueda leer)
