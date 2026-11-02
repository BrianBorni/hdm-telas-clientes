# HDM · Telas para clientes

Catálogo visual de telas HDM. La primera tela publicada es Square; las siguientes se incorporan una por una, con sus imágenes y datos aprobados.

Proyecto estático, sin dependencias, con modo claro y oscuro. Requiere **Node.js 18 o superior** para el servidor local y la compilación. La navegación usa fragmentos de URL, por lo que no necesita un servidor de aplicación.

## Trabajar en local

Desde la carpeta del proyecto:

```bash
npm run dev
```

Abrir `http://localhost:4173`. El servidor entrega los archivos de `public/`; recargar la página después de editar. No hace falta ejecutar `npm install`.

Para elegir puerto o interfaz:

```bash
npm run dev -- --port 3000 --host 0.0.0.0
```

El puerto también puede indicarse con la variable de entorno `PORT`. El argumento `--port` tiene prioridad. El servidor local devuelve un 404 real cuando un archivo no existe.

## Generar la versión publicable

```bash
npm run build
```

El comando valida `public/index.html`, que `public/catalog.json` contenga un arreglo `fabrics`, que sus identificadores sean válidos y únicos, y que las imágenes no estén vacías. Luego copia `public/` a `dist/`. La carpeta `dist/` se regenera en cada compilación y no se guarda en Git.

## Conectar GitHub con Cloudflare Pages

Crear un proyecto de **Pages**, conectar el nuevo repositorio de GitHub y usar estos valores:

| Opción | Valor |
| --- | --- |
| Rama de producción | `main` |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Raíz del repositorio |

Usar una versión de Node compatible con `package.json` (18 o superior). No requiere base de datos, secretos ni variables de aplicación. Después de conectar Pages, los cambios enviados a `main` podrán generar una nueva versión del sitio.

## Editar y agregar telas

Los datos públicos están en **`public/catalog.json`**, dentro del arreglo `fabrics`. Allí se editan nombres, precios, descripciones, características y rutas de imágenes. Los precios se guardan como números en `prices.shirt` y `prices.set`, en pesos argentinos. Mantener la misma estructura del objeto de Square al agregar cada nueva tela.

Para incorporar otra tela:

1. Preparar sus imágenes aprobadas dentro de `public/assets/<id-de-la-tela>/`.
2. Duplicar el objeto de Square en el catálogo y asignarle un identificador único.
3. Completar sus precios, textos y rutas de imágenes. Usar `published: false` mientras se prepara y cambiar a `published: true` cuando esté listo para aparecer en el sitio.
4. Comprobar la tela en local, ejecutar `npm run build` y subir los cambios a GitHub.

La aplicación usa rutas de imágenes relativas al sitio. Evitar espacios y tildes en nombres de archivos; usar minúsculas y guiones.

## Imágenes

Las seis vistas de Square están en `public/assets/square/`:

| Archivo base | Uso |
| --- | --- |
| `trama.webp` | Portada y trama plana |
| `contraluz.webp` | Representación a contraluz |
| `prenda.webp` | Detalle del dobladillo |
| `transpirabilidad.webp` | Representación de ventilación |
| `secado.webp` | Representación de secado rápido |
| `resistencia.webp` | Tela bajo tensión, sin manos y con flechas |

Cada imagen tiene una versión completa de **1536 × 1024**, una variante `-960.webp` de **960 × 640** y otra `-640.webp` de **640 × 427**. Ejemplo: `trama.webp`, `trama-960.webp` y `trama-640.webp`. Conservar esta convención al sumar telas para facilitar la carga de imágenes según la pantalla.

El logo `public/assets/hdm-logo.png` es blanco con fondo transparente; su presentación se adapta al tema mediante CSS.

Las imágenes son **representaciones ilustrativas** realizadas a partir de referencias de la tela. La muestra física es la referencia para evaluar color, transparencia, tacto y elasticidad; los renders no representan mediciones de rendimiento.

## Estructura

```text
public/                 Archivos del sitio y catálogo
  assets/               Logo e imágenes optimizadas
  catalog.json          Datos editables de las telas
scripts/
  serve.mjs             Servidor local
  build.mjs             Validación y copia a dist/
dist/                   Resultado del build, excluido de Git
```
