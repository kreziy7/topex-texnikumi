/**
 * Prerender SPA страниц в статический HTML.
 *
 * Запускается после `vite build`: `node scripts/prerender.mjs`
 * - поднимает `vite preview` (собранный dist)
 * - открывает каждую страницу в headless Chrome
 * - ждёт, пока React отрендерит контент + react-helmet-async обновит <head>
 * - сохраняет финальный HTML в dist/<path>/index.html
 *
 * Итог: Google получает готовый HTML с уникальным title/description/контентом,
 * а не пустой #root.
 *
 * Chrome: используется установленный puppeteer (свой Chromium),
 * fallback — системный google-chrome / CHROME_PATH.
 */

import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const PORT = 4173;

// Статические страницы (все существующие маршруты из AppRouter, без /admin/*, /profile, /login...)
const ROUTES = [
  '/',
  '/courses',
  '/blog',
  '/gallery',
  '/videos',
  '/aloqalar',
  '/vakansiyalar',
  '/imtihon-natijalari',
  '/litsenziya',
  '/narx',
];

const CHROME_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  process.env.CHROME_PATH,
].filter(Boolean);

function findChrome() {
  try {
    const p = puppeteer.executablePath();
    if (p && existsSync(p)) return p;
  } catch {
    /* ignore */
  }
  return CHROME_PATHS.find((p) => p && existsSync(p)) || null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function previewServer() {
  return new Promise((resolve, reject) => {
    const child = exec(`node node_modules/vite/bin/vite.js preview --port ${PORT} --strictPort`, {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'production' },
    });
    let ready = false;
    const timer = setTimeout(() => {
      if (!ready) {
        reject(new Error('vite preview не поднялся за 20s'));
        child.kill('SIGTERM');
      }
    }, 20000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('Local') || String(d).includes('localhost')) {
        ready = true;
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on('exit', () => clearTimeout(timer));
  });
}

async function renderPage(browser, route) {
  const url = `http://localhost:${PORT}${route}`;
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
  );
  // Не ждём networkidle (GA/FB/шрифты держат соединения) — хватает domcontentloaded + проверки контента
  await page.setDefaultNavigationTimeout(30000);

  let html = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Ждём реальный рендер React: #root должен содержать контент (не спиннер)
    let ok = false;
    for (let i = 0; i < 25; i++) {
      const textLen = await page.evaluate(
        () => document.querySelector('#root')?.innerText?.length || 0
      );
      const hasSpinner = await page.evaluate(() =>
        document.querySelector('#root')?.innerHTML?.includes('animate-spin')
      );
      if (textLen > 400 && !hasSpinner) {
        ok = true;
        break;
      }
      await wait(1000);
    }

    if (!ok) {
      console.warn(`  ⚠ ${route}: контент не отрендерился (JS/API?), оставляю SPA fallback`);
      return false;
    }

    // Даём react-helmet-async обновить <head>
    await wait(300);
    html = await page.evaluate(() => '<!DOCTYPE html>\n' + document.documentElement.outerHTML);
  } catch (err) {
    console.warn(`  ⚠ ${route}: ошибка рендера: ${err.message}`);
    return false;
  } finally {
    await page.close();
  }

  const outFile = join(DIST, route === '/' ? 'index.html' : join(route.slice(1), 'index.html'));
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, html, 'utf8');

  const title = html.match(/<title>(.*?)<\/title>/)?.[1] || '—';
  console.log(`  ✔ ${route} -> ${outFile}  [title: ${title.slice(0, 60)}]`);
  return true;
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('✖ Chrome не найден. Установи puppeteer или google-chrome, либо задай CHROME_PATH.');
    process.exit(1);
  }
  console.log(`Chrome: ${chromePath}\nPreview: http://localhost:${PORT}\n`);

  const server = await previewServer();
  try {
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    console.log('Рендер страниц:\n');
    let done = 0;
    for (const route of ROUTES) {
      const ok = await renderPage(browser, route);
      if (ok) done++;
    }
    console.log(`\nГотово: ${done}/${ROUTES.length} страниц в статический HTML`);

    await browser.close();
  } finally {
    server.kill('SIGTERM');
    // vite preview может держать процесс — выходим принудительно
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
