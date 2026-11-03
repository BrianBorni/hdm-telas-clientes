import { cp, lstat, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(projectRoot, 'public');
const destination = join(projectRoot, 'dist');

async function checkCatalogImage(src) {
  if (typeof src !== 'string' || !/^assets\/[a-z0-9/_.-]+\.(?:webp|png|jpe?g)$/i.test(src) || src.split('/').includes('..')) {
    throw new Error(`Ruta de imagen no válida: ${src}`);
  }
  const variants = src.endsWith('.webp')
    ? [src, src.replace(/\.webp$/, '-960.webp'), src.replace(/\.webp$/, '-640.webp')]
    : [src];
  for (const variant of variants) {
    const stats = await lstat(join(source, variant));
    if (!stats.isFile() || stats.size === 0) throw new Error(`Falta la imagen del catálogo: ${variant}`);
  }
}

async function checkSource(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) {
      throw new Error(`No se admiten enlaces simbólicos en public/: ${path}`);
    }
    if (stats.isDirectory()) await checkSource(path);
    else if (!stats.isFile()) throw new Error(`Archivo no admitido: ${path}`);
    else if (stats.size === 0 && /\.(?:webp|png|jpe?g|gif|svg|avif)$/i.test(entry.name)) {
      throw new Error(`La imagen está vacía: ${path}`);
    }
  }
}

try {
  await checkSource(source);
  const html = await readFile(join(source, 'index.html'), 'utf8');
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    throw new Error('public/index.html debe contener un documento HTML con <html> y <body>.');
  }
  const catalog = JSON.parse(await readFile(join(source, 'catalog.json'), 'utf8'));
  if (!catalog || typeof catalog !== 'object' || !Array.isArray(catalog.fabrics)) {
    throw new Error('public/catalog.json debe contener un objeto con un arreglo fabrics.');
  }
  const identifiers = new Set();
  for (const fabric of catalog.fabrics) {
    if (!fabric || typeof fabric.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(fabric.id)) {
      throw new Error('Cada tela necesita un id con letras minúsculas, números o guiones.');
    }
    if (identifiers.has(fabric.id)) throw new Error(`Identificador de tela repetido: ${fabric.id}`);
    identifiers.add(fabric.id);
    if (fabric.published === false) continue;
    if (!Number.isFinite(fabric.prices?.shirt) || !Number.isFinite(fabric.prices?.set)) {
      throw new Error(`Precios no válidos: ${fabric.id}`);
    }
    const images = [fabric.cover, ...[...fabric.gallery, ...fabric.features].flatMap(item => [item.src, ...(item.backlightBase ? [item.backlightBase] : [])])];
    for (const src of new Set(images)) await checkCatalogImage(src);
  }
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
  console.log('Build listo: public/ → dist/');
} catch (error) {
  console.error(`No se pudo generar el sitio: ${error.message}`);
  process.exitCode = 1;
}
