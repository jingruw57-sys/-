// 文件职责：将程序化场景和 three.js 打包为可直接双击的单个离线 HTML。
import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputDir = path.join(root, 'dist');
const outputFile = path.join(outputDir, '太阳雨渔港_离线版.html');

const result = await build({
  entryPoints: [path.join(root, 'main.js')],
  absWorkingDir: root,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome90', 'edge90', 'firefox90', 'safari15'],
  minify: true,
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});

const sourceHtml = await readFile(path.join(root, 'index.html'), 'utf8');
const license = await readFile(path.join(root, 'node_modules', 'three', 'LICENSE'), 'utf8');
const bundledJs = Buffer.from(result.outputFiles[0].contents, 'utf8')
  .toString()
  .replaceAll(/<\/script/gi, '<\\/script');
const html = sourceHtml
  .replace(/  <script type="importmap">[\s\S]*?<\/script>\s*/i, '')
  .replace(/<script type="module" src="[^"]+"><\/script>/i, () => `<script>${bundledJs}</script>`)
  .replace('<!doctype html>', `<!doctype html>\n<!-- three.js 0.160.0 (MIT License)\n${license.trim()}\n-->`);

if (html.includes('type="importmap"') || html.includes('src="./main.js')) {
  throw new Error('离线 HTML 仍包含外部模块引用');
}
await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, html, 'utf8');
console.log(`生成：${outputFile}`);
console.log(`大小：${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB`);
