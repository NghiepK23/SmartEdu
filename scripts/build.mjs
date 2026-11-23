import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function shortHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 10);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function minifyCss(rawCss) {
  const res = esbuild.transformSync(rawCss, {
    loader: 'css',
    minify: true,
    legalComments: 'none',
    target: 'es2020',
  });
  return res.code;
}

function minifyClassicJs(rawJs) {
  const res = esbuild.transformSync(rawJs, {
    loader: 'js',
    minify: true,
    legalComments: 'none',
    target: 'es2020',
  });
  return res.code;
}

export function runBuild() {
  const indexHtmlPath = path.join(ROOT, 'index.html');
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  const cssRefs = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)">/g)].map((m) => m[1]);
  const scriptRefs = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map((m) => m[1]);

  if (!cssRefs.length) throw new Error('Không tìm thấy tệp CSS nào trong index.html.');
  if (!scriptRefs.length) throw new Error('Không tìm thấy tệp JS nào trong index.html.');

  const envIdx = scriptRefs.indexOf('js/00-environment.local.js');
  if (envIdx < 0) throw new Error('Không tìm thấy mốc js/00-environment.local.js trong index.html.');

  const beforeEnvJs = scriptRefs.slice(0, envIdx).filter((s) => !s.startsWith('js/vendor/'));
  const afterEnvJs = scriptRefs.slice(envIdx + 1).filter((s) => !s.startsWith('js/vendor/'));

  const rawCss = cssRefs
    .map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'))
    .join('\n');
  const rawCore = beforeEnvJs
    .map((rel) => `/* ${rel} */\n` + fs.readFileSync(path.join(ROOT, rel), 'utf8').trim())
    .join('\n;\n') + '\n';
  const rawApp = afterEnvJs
    .map((rel) => `/* ${rel} */\n` + fs.readFileSync(path.join(ROOT, rel), 'utf8').trim())
    .join('\n;\n') + '\n';

  const cssBundle = minifyCss(rawCss);
  const coreBundle = minifyClassicJs(rawCore);
  const appBundle = minifyClassicJs(rawApp);

  const cssName = `app.${shortHash(cssBundle)}.css`;
  const coreName = `core.${shortHash(coreBundle)}.js`;
  const appName = `app.${shortHash(appBundle)}.js`;

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });

  copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
  copyDir(path.join(ROOT, 'js', 'vendor'), path.join(DIST, 'js', 'vendor'));

  const cssOut = path.join(DIST, 'assets', cssName);
  const coreOut = path.join(DIST, 'assets', coreName);
  const appOut = path.join(DIST, 'assets', appName);

  fs.writeFileSync(cssOut, cssBundle, 'utf8');
  fs.writeFileSync(coreOut, coreBundle, 'utf8');
  fs.writeFileSync(appOut, appBundle, 'utf8');

  execFileSync(process.execPath, ['--check', coreOut], { stdio: 'inherit' });
  execFileSync(process.execPath, ['--check', appOut], { stdio: 'inherit' });

  let builtHtml = html;
  let cssReplaced = false;
  builtHtml = builtHtml.replace(/(?:<link\s+rel="stylesheet"\s+href="[^"]+">\s*)+/, () => {
    cssReplaced = true;
    return `<link rel="stylesheet" href="assets/${cssName}">\n`;
  });
  if (!cssReplaced) throw new Error('Không thể thay khối CSS trong index.html.');

  const scriptSectionRe = /<script\s+src="js\/vendor\/supabase-js\.min\.js"><\/script>[\s\S]*?<\/body>/;
  if (!scriptSectionRe.test(builtHtml)) throw new Error('Không thể thay khối JS trong index.html.');
  builtHtml = builtHtml.replace(
    scriptSectionRe,
    [
      `<script src="js/vendor/supabase-js.min.js"></script>`,
      `<script src="assets/${coreName}"></script>`,
      `<script src="js/00-environment.local.js"></script>`,
      `<script src="assets/${appName}"></script>`,
      `</body>`,
    ].join('\n'),
  );

  fs.writeFileSync(path.join(DIST, 'index.html'), builtHtml, 'utf8');

  return {
    cssCount: cssRefs.length,
    jsCount: beforeEnvJs.length + afterEnvJs.length,
    cssFile: `assets/${cssName}`,
    coreFile: `assets/${coreName}`,
    appFile: `assets/${appName}`,
    rawCssBytes: Buffer.byteLength(rawCss),
    rawJsBytes: Buffer.byteLength(rawCore) + Buffer.byteLength(rawApp),
    cssBytes: Buffer.byteLength(cssBundle),
    coreBytes: Buffer.byteLength(coreBundle),
    appBytes: Buffer.byteLength(appBundle),
  };
}

if (path.resolve(process.argv[1] || '') === path.resolve(__filename)) {
  const info = runBuild();
  console.log(
    `EducMind build ready in dist/: ${info.cssCount} CSS -> ${info.cssFile} (${Math.round(info.rawCssBytes / 1024)} -> ${Math.round(info.cssBytes / 1024)} KB), `
    + `${info.jsCount} JS -> ${info.coreFile} + ${info.appFile} (${Math.round(info.rawJsBytes / 1024)} -> ${Math.round((info.coreBytes + info.appBytes) / 1024)} KB).`,
  );
}
