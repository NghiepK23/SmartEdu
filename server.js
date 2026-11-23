import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "media-src 'self' blob: https:",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com blob:",
    "form-action 'self'",
    "frame-ancestors 'self' https://aistudio.google.com https://*.aistudio.google.com https://*.googleusercontent.com http://localhost:* http://127.0.0.1:*",
  ].join('; '),
};

function isCompressibleContentType(ct) {
  if (!ct) return false;
  const mime = String(ct).split(';')[0].trim().toLowerCase();
  return mime.startsWith('text/')
    || mime === 'application/javascript'
    || mime === 'application/json'
    || mime === 'application/xml'
    || mime === 'image/svg+xml';
}

function chooseEncoding(acceptEncoding) {
  const raw = String(acceptEncoding || '').toLowerCase();
  if (!raw) return '';
  if (/\bbr\b/.test(raw) && !/\bbr\s*;\s*q=0(?:\.0+)?\b/.test(raw)) return 'br';
  if (/\bgzip\b/.test(raw) && !/\bgzip\s*;\s*q=0(?:\.0+)?\b/.test(raw)) return 'gzip';
  return '';
}

function compressionMiddleware(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const enc = chooseEncoding(req.headers['accept-encoding']);
  if (!enc) return next();

  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  let decided = false;
  let zstream = null;
  let waitZDrain = false;
  let downstreamPaused = false;

  function appendVaryAcceptEncoding() {
    const prev = res.getHeader('Vary');
    if (!prev) { res.setHeader('Vary', 'Accept-Encoding'); return; }
    const list = String(prev).split(',').map((s) => s.trim().toLowerCase());
    if (!list.includes('accept-encoding')) res.setHeader('Vary', `${prev}, Accept-Encoding`);
  }

  function decide(firstChunkLength) {
    decided = true;
    appendVaryAcceptEncoding();
    if (req.method === 'HEAD') return;
    if (res.statusCode < 200 || res.statusCode >= 300 || res.statusCode === 204) return;
    if (res.getHeader('Content-Encoding') || res.getHeader('Content-Range')) return;
    if (!isCompressibleContentType(res.getHeader('Content-Type'))) return;
    const declaredLen = Number(res.getHeader('Content-Length'));
    if (Number.isFinite(declaredLen) && declaredLen < 512) return;
    if (firstChunkLength !== null && firstChunkLength < 512) return;

    res.removeHeader('Content-Length');
    res.setHeader('Content-Encoding', enc);
    const etag = res.getHeader('ETag');
    if (etag && !String(etag).includes(`-${enc}`)) {
      const s = String(etag);
      res.setHeader('ETag', s.endsWith('"') ? `${s.slice(0, -1)}-${enc}"` : `${s}-${enc}`);
    }

    zstream = enc === 'br'
      ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
      : zlib.createGzip({ level: 6 });

    zstream.on('data', (chunk) => {
      if (!origWrite(chunk)) {
        downstreamPaused = true;
        zstream.pause();
        res.once('drain', () => {
          downstreamPaused = false;
          zstream.resume();
        });
      }
    });
    zstream.on('drain', () => {
      if (waitZDrain && !downstreamPaused) {
        waitZDrain = false;
        res.emit('drain');
      }
    });
    zstream.on('end', () => origEnd());
    zstream.on('error', () => origEnd());
  }

  res.write = function (chunk, encoding, cb) {
    if (!decided) decide(null);
    if (zstream) {
      const ok = zstream.write(chunk, encoding, cb);
      if (!ok) waitZDrain = true;
      return ok;
    }
    return origWrite(chunk, encoding, cb);
  };

  res.end = function (chunk, encoding, cb) {
    if (!decided) {
      const len = chunk == null ? 0 : (Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), encoding));
      decide(len);
    }
    if (zstream) {
      if (typeof chunk === 'function') { cb = chunk; chunk = undefined; }
      if (typeof encoding === 'function') { cb = encoding; encoding = undefined; }
      if (typeof cb === 'function') zstream.once('end', cb);
      if (chunk !== undefined) zstream.end(chunk, encoding);
      else zstream.end();
      return res;
    }
    return origEnd(chunk, encoding, cb);
  };

  next();
}

export function createApp(options = {}) {
  const rootDir = options.rootDir || __dirname;
  const distDir = path.join(rootDir, 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const useDist = options.serveSource === true
    ? false
    : (options.serveSource === false ? true : (process.env.EDUCMIND_SERVE_SOURCE !== '1' && fs.existsSync(distIndex)));

  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    next();
  });
  app.use(compressionMiddleware);

  // Provide a safe empty fallback if gitignored local override file is absent
  app.get('/js/00-environment.local.js', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const localPath = path.join(rootDir, 'js', '00-environment.local.js');
    if (fs.existsSync(localPath)) return res.sendFile(localPath);
    res.type('application/javascript').send('// No local environment overrides\n');
  });

  if (useDist) {
    app.use('/js/vendor', express.static(path.join(distDir, 'js', 'vendor'), { etag: true, maxAge: '7d' }));
    app.use('/assets', express.static(path.join(distDir, 'assets'), {
      etag: true,
      setHeaders(res, filePath) {
        const base = path.basename(filePath);
        if (/\.[a-f0-9]{8,}\.(css|js)$/i.test(base)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      },
    }));
  } else {
    app.use('/js/vendor', express.static(path.join(rootDir, 'js', 'vendor'), { etag: true, maxAge: '7d' }));
    app.use('/assets', express.static(path.join(rootDir, 'assets'), { etag: true, maxAge: '1h' }));
    app.use('/css', express.static(path.join(rootDir, 'css'), { etag: true, maxAge: '1h' }));
    app.use('/js', express.static(path.join(rootDir, 'js'), { etag: true, maxAge: '1h' }));
  }

  app.use('/tests', express.static(path.join(rootDir, 'tests'), { etag: true, maxAge: 0 }));

  const htmlEntry = useDist ? distIndex : path.join(rootDir, 'index.html');
  app.get(['/', '/index.html'], (_req, res) => {
    res.sendFile(htmlEntry, { headers: { 'Cache-Control': 'no-cache' } });
  });

  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  app.use((req, res) => {
    if (req.method === 'GET' && req.accepts('html') && !path.extname(req.path)) {
      return res.sendFile(htmlEntry, { headers: { 'Cache-Control': 'no-cache' } });
    }
    res.status(404).end();
  });

  return app;
}

if (process.env.EDUCMIND_NO_LISTEN !== '1') {
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = '0.0.0.0';
  const app = createApp();
  app.listen(PORT, HOST, () => {
    console.log(`EducMind static server listening on http://${HOST}:${PORT}`);
  });
}
