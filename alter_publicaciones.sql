-- Agregar columnas JSONB para múltiples archivos
ALTER TABLE publicaciones ADD COLUMN IF NOT EXISTS imagenes JSONB DEFAULT '"[]"'::jsonb;
ALTER TABLE publicaciones ADD COLUMN IF NOT EXISTS pdfs JSONB DEFAULT '"[]"'::jsonb;

-- Migrar datos existentes a los nuevos arrays
UPDATE publicaciones SET imagenes = to_jsonb(ARRAY[imagen_url]) WHERE imagen_url IS NOT NULL AND imagen_url != '"'''"' AND (imagenes IS NULL OR imagenes = '"[]"'::jsonb OR jsonb_array_length(imagenes) = 0);
UPDATE publicaciones SET pdfs = to_jsonb(ARRAY[pdf_url]) WHERE pdf_url IS NOT NULL AND pdf_url != '"'''"' AND (pdfs IS NULL OR pdfs = '"[]"'::jsonb OR jsonb_array_length(pdfs) = 0);

-- Inicializar vacíos donde sea null
UPDATE publicaciones SET imagenes = '"[]"'::jsonb WHERE imagenes IS NULL;
UPDATE publicaciones SET pdfs = '"[]"'::jsonb WHERE pdfs IS NULL;

SELECT id, titulo, imagenes, pdfs FROM publicaciones ORDER BY id;
