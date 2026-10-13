# Ficha de Inspección Técnica (PWA) - v1

Aplicación web instalable para levantar **fichas de inspección técnica en campo** y generar un **PDF** con datos generales, fotografías, mapa de ubicación, perímetro y tabla de firmas. Funciona sin conexión. Todo el contenido es genérico: la institución se escribe en cada ficha y no hay referencias a ninguna entidad en particular.

## Cómo se usa

1. **Responsables** (opcional, una sola vez): nombre y cargo. Sirven para llenar la tabla de firmas eligiéndolos de una lista.
2. **Fichas → Nueva ficha**:
   - **Identificación**: institución (obligatoria), dirección/área y unidad (opcionales), **número de ficha** (manual, único), tema y fecha.
   - **Lugar**: Administración Zonal, Parroquia, Barrio y Microcuenca. Se **completan solos** con el centroide del área dibujada (ver más abajo); puedes corregirlos a mano o volver a calcularlos con **"Completar desde el mapa"**.
   - **Área de inspección y mapa**: traza el área con las herramientas de dibujo (arriba a la izquierda) como **rectángulo/cuadrado** o **polígono de varios vértices**, y elige la capa base **Satélite (Esri)** o **Calles (OSM)**. La coordenada **UTM** y el **área** se calculan solas desde el **centroide** del polígono. El **botón de ubicación** (arriba a la izquierda del mapa) lo centra donde estás, solo para orientarte: **no crea ningún punto**.
   - **Objetivo / Antecedentes / Desarrollo de actividades**: texto libre.
   - **Participantes** y **Recomendaciones**: una por línea (el PDF las numera).
   - **Registro fotográfico**: toma fotos con la cámara o agrega varias desde la galería. Cada foto tiene su **descripción** (máx. 90 caracteres, para que quepa en el PDF) y se puede reordenar o borrar.
   - **Firmas de responsabilidad**: elige el responsable en cada fila (Elaboración / Revisado / Aprobado…). Su nombre y cargo se copian; el espacio de firma queda en blanco en el PDF para firmar el impreso.
   - **Guardar** genera la imagen del mapa y abre la ficha, desde donde puedes **Descargar PDF**, **Descargar Word**, **Compartir PDF**, **Compartir Word**, exportar la inspección a GeoJSON, exportar las fotos en ZIP, Editar, Duplicar o Eliminar.
3. **Exportar para SIG**: en la pestaña **Fichas**, "Exportar Inspecciones (GeoJSON)" descarga **todos los polígonos** con los datos de cada levantamiento (ficha, institución, tema, fecha, lugar, coordenada del centroide, área, perímetro y número de fotos). Nombres de campo de hasta 10 caracteres para que no se trunquen al pasar a shapefile.
4. **Respaldo**: exporta/importa fichas y responsables en un `.json` (sin fotografías). Las fotografías se exportan aparte en un `.zip` con un índice CSV.

## El informe: PDF y Word

Cada ficha se puede sacar en **dos formatos**, con los mismos datos, las mismas fotos y el mismo mapa:

| | **PDF** | **Word (.docx)** |
|---|---|---|
| Para qué sirve | Imprimir y firmar a mano | **Editar** antes de firmar |
| Aspecto | Diseño fijo de la ficha | Mismo informe, con estilos reales de Word |
| ¿Se puede editar? | No | Sí: textos, tablas, fotos y encabezado |

- El **Word** usa **Título 1** de verdad en las secciones, así que funciona el **panel de navegación** de Word y se puede reestilizar el documento entero de una vez.
- Incluye **encabezado** con la banda institucional (solo en la primera página), **pie** con la institución, el número de ficha y **"Página X de Y"** automático, y la tabla de firmas repite su cabecera si se parte en dos páginas.
- Se genera **en el teléfono y sin conexión**, sin librerías externas ni servidor: se arma el archivo `.docx` con el mismo empaquetador ZIP que usa la exportación de fotos (`js/zip.js`). Tarda unas centésimas de segundo.
- Los botones **Descargar** guardan el archivo en el teléfono; **Compartir** lo envían por WhatsApp, correo u otra app.

## Lugar automático desde el mapa

Al dibujar o editar el área, la app toma el **centroide** y busca dentro de qué polígono cae, rellenando **Administración Zonal, Parroquia, Barrio y Microcuenca**. Los campos quedan **editables** y hay un botón **"Completar desde el mapa"** para recalcularlos.

- Los polígonos vienen en `datos/lugares.geojson`: Zonales (10), Barrios (1.303) y Microcuencas (31), con la parroquia incluida en cada barrio.
- La consulta es **instantánea** (menos de 0,05 ms) y funciona **sin conexión**, porque el archivo se guarda en la caché de la app.
- Si el centroide cae fuera de las capas (por ejemplo, fuera del DMQ), el campo se deja **vacío** y la app lo avisa: nunca inventa un valor.
- Los nombres se muestran en formato título (`Los Chillos`, `El Dean`, `Río San Pedro`).
- Al **abrir una ficha ya guardada no se sobrescribe** lo que estaba escrito; solo se recalcula cuando tú dibujas o editas el área.

> El archivo de lugares se genera con `_tools/genera_datos_app.py` a partir de las capas de `Capas/`. Si te actualizan esas capas, hay que volver a ejecutarlo.

## Qué va a GitHub y qué queda en el teléfono

| En GitHub Pages (código, público) | En el teléfono (datos, privados) |
|---|---|
| `index.html`, `css/`, `js/`, `lib/` (Leaflet, Leaflet.draw, jsPDF), `icons/`, `sw.js`, `manifest.webmanifest` | Fichas, responsables, fotografías, imágenes de mapa y PDF generados |

GitHub solo entrega la aplicación. Ningún dato sale del teléfono.

## Publicar en GitHub Pages (automático)

Junto a esta carpeta hay un `publicar.bat` (y `publicar.ps1`). Usa el **mismo token de GitHub que "Generar Mapa Web" de GeoMapping Tools** (Administrador de credenciales de Windows) y publica esta app como una subcarpeta `ficha-inspeccion/` de la rama `gh-pages` del repositorio que elijas, sin tocar lo que ya esté ahí.

- Doble clic en `publicar.bat`. La primera vez pregunta el repositorio (existente o nuevo) y lo recuerda en `publicar.config.json`.
- Actualiza solo el número de versión de `sw.js`, sube lo que cambió, borra lo que ya no existe en la carpeta y, si no hay cambios, no crea ningún commit.
- Opciones: `publicar.bat -Simular` (no se conecta), `-Reconfigurar` (otro repositorio), `-GuardarToken` (pegar un token nuevo sin publicar).
- La dirección final queda como `https://USUARIO.github.io/REPOSITORIO/ficha-inspeccion/`.

## Sin internet en campo

- La app **abre y funciona completa**: fichas, responsables, formulario, fotos, Lugar automático y PDF no necesitan red.
- El **mapa base** (satélite o calles) sí necesita internet o teselas guardadas. Sin ellas verás el mapa en gris, pero **puedes dibujar el área igual**, y el PDF sale con la referencia (sin la imagen de fondo).
- Para tener el fondo en campo: con internet, dibuja el área y pulsa **Precargar mapa de la zona**. También se guardan las teselas que ya viste.
- El **botón de ubicación** funciona **sin internet**: usa el GPS del teléfono, no la red.

## Notas

- La app avisa si intentas repetir un número de ficha ya usado (puedes guardar de todos modos).
- Al guardar se **congela una copia** del nombre y cargo de cada responsable dentro de la ficha: si luego editas o borras un responsable, las fichas ya guardadas no cambian.
- Las fotos se redimensionan a 1600 px y comprimen (~250 KB c/u) antes de guardarse.
- **Cálculos sobre el elipsoide WGS84** (no sobre una esfera): coordenadas UTM por series de Krüger, distancias por Vincenty inverso, área por latitud authálica y centroide en un plano métrico local. Validados contra `pyproj` (Karney/GeographicLib) con error inferior a 0.05 mm en coordenadas y distancias, y prácticamente nulo en el área de perímetros de inspección.
- Librerías incluidas localmente: Leaflet 1.9.4, Leaflet.draw 1.0.4, jsPDF 4.2.1.
