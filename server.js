'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Clean up old jobs on startup
function cleanupOldJobs() {
  try {
    const jobs = fs.readdirSync(UPLOADS_DIR);
    const now = Date.now();
    for (const jobId of jobs) {
      const jobPath = path.join(UPLOADS_DIR, jobId);
      try {
        const stat = fs.statSync(jobPath);
        if (now - stat.mtimeMs > MAX_AGE_MS) {
          fs.rmSync(jobPath, { recursive: true, force: true });
          console.log(`[CLEANUP] Removed old job: ${jobId}`);
        }
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    console.error('[CLEANUP] Error during cleanup:', e.message);
  }
}

cleanupOldJobs();
// Run cleanup every hour
setInterval(cleanupOldJobs, 60 * 60 * 1000);

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Parse multipart form data manually
function parseMultipart(buffer, boundary) {
  const boundaryBuffer = Buffer.from('--' + boundary);
  const results = [];
  let pos = 0;

  while (pos < buffer.length) {
    // Find boundary
    const boundaryPos = indexOf(buffer, boundaryBuffer, pos);
    if (boundaryPos === -1) break;

    pos = boundaryPos + boundaryBuffer.length;

    // Check for end boundary (--)
    if (buffer[pos] === 45 && buffer[pos + 1] === 45) break;

    // Skip \r\n after boundary
    if (buffer[pos] === 13 && buffer[pos + 1] === 10) pos += 2;
    else if (buffer[pos] === 10) pos += 1;

    // Parse headers
    const headers = {};
    while (pos < buffer.length) {
      const lineEnd = indexOf(buffer, Buffer.from('\r\n'), pos);
      if (lineEnd === -1 || lineEnd === pos) {
        pos = lineEnd === pos ? pos + 2 : pos;
        break;
      }
      const line = buffer.slice(pos, lineEnd).toString('utf8');
      pos = lineEnd + 2;
      if (line === '') break;
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        headers[line.slice(0, colonIdx).toLowerCase().trim()] = line.slice(colonIdx + 1).trim();
      }
    }

    // Find next boundary for body end
    const nextBoundary = indexOf(buffer, boundaryBuffer, pos);
    if (nextBoundary === -1) break;

    let bodyEnd = nextBoundary;
    // Remove trailing \r\n before boundary
    if (buffer[bodyEnd - 2] === 13 && buffer[bodyEnd - 1] === 10) bodyEnd -= 2;
    else if (buffer[bodyEnd - 1] === 10) bodyEnd -= 1;

    const body = buffer.slice(pos, bodyEnd);

    // Parse content-disposition
    const disposition = headers['content-disposition'] || '';
    const nameMatch = disposition.match(/name="([^"]+)"/);
    const filenameMatch = disposition.match(/filename="([^"]+)"/);

    results.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: filenameMatch ? filenameMatch[1] : null,
      contentType: headers['content-type'] || 'text/plain',
      data: body,
    });

    pos = nextBoundary;
  }

  return results;
}

function indexOf(buffer, search, start = 0) {
  for (let i = start; i <= buffer.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buffer[i + j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}

// Read body as buffer
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Send JSON response
function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

// Serve static file
function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
  try {
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
}

// Validate job ID (UUID format)
function isValidJobId(jobId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(jobId);
}

// Main request handler
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  console.log(`[SERVER] ${method} ${pathname}`);

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    // GET / → serve index.html
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
      return;
    }

    // GET /public/* → serve static files
    if (method === 'GET' && pathname.startsWith('/public/')) {
      const filePath = path.join(PUBLIC_DIR, pathname.replace('/public/', ''));
      const normalizedPath = path.normalize(filePath);
      if (!normalizedPath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      serveStatic(res, normalizedPath);
      return;
    }

    // POST /api/upload
    if (method === 'POST' && pathname === '/api/upload') {
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(.+)$/);
      if (!boundaryMatch) {
        sendJSON(res, 400, { error: 'No boundary found in content-type' });
        return;
      }

      const boundary = boundaryMatch[1].trim();
      const body = await readBody(req);
      const parts = parseMultipart(body, boundary);

      const filePart = parts.find(p => p.filename);
      if (!filePart) {
        sendJSON(res, 400, { error: 'No file found in upload' });
        return;
      }

      const originalName = filePart.filename;
      const ext = path.extname(originalName).toLowerCase();
      if (!['.csv', '.xls', '.xlsx'].includes(ext)) {
        sendJSON(res, 400, { error: 'Invalid file type. Please upload CSV, XLS, or XLSX.' });
        return;
      }

      // Create job
      const jobId = crypto.randomUUID();
      const jobDir = path.join(UPLOADS_DIR, jobId);
      fs.mkdirSync(jobDir, { recursive: true });

      // Save uploaded file
      const uploadedFilePath = path.join(jobDir, 'input' + ext);
      fs.writeFileSync(uploadedFilePath, filePart.data);

      // Initialize status
      const status = {
        jobId,
        status: 'pending',
        currentStep: 'Job queued, starting pipeline...',
        progress: 0,
        total: 0,
        fileName: originalName,
        startedAt: new Date().toISOString(),
        stats: {
          googleWorkspace: 0,
          nonGoogle: 0,
          catchAll: 0,
          removed: 0,
          disposable: 0,
          fixed: 0,
          needsReview: 0,
          roleBased: 0,
          tradeBased: 0,
        },
        error: null,
        completedAt: null,
        durationMs: null,
      };

      fs.writeFileSync(
        path.join(jobDir, 'status.json'),
        JSON.stringify(status, null, 2)
      );

      // Start pipeline asynchronously
      setImmediate(async () => {
        try {
          const { runPipeline } = require('./lib/pipeline');
          await runPipeline(jobId, uploadedFilePath, jobDir);
        } catch (err) {
          console.error(`[SERVER] Pipeline error for job ${jobId}:`, err);
          try {
            const statusPath = path.join(jobDir, 'status.json');
            const s = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
            s.status = 'error';
            s.error = err.message;
            s.currentStep = 'Pipeline failed';
            fs.writeFileSync(statusPath, JSON.stringify(s, null, 2));
          } catch (_) {}
        }
      });

      sendJSON(res, 200, { jobId });
      return;
    }

    // GET /api/status/:jobId
    const statusMatch = pathname.match(/^\/api\/status\/([^/]+)$/);
    if (method === 'GET' && statusMatch) {
      const jobId = statusMatch[1];
      if (!isValidJobId(jobId)) {
        sendJSON(res, 400, { error: 'Invalid job ID' });
        return;
      }
      const statusPath = path.join(UPLOADS_DIR, jobId, 'status.json');
      if (!fs.existsSync(statusPath)) {
        sendJSON(res, 404, { error: 'Job not found' });
        return;
      }
      const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      sendJSON(res, 200, statusData);
      return;
    }

    // GET /api/download/:jobId
    const downloadMatch = pathname.match(/^\/api\/download\/([^/]+)$/);
    if (method === 'GET' && downloadMatch) {
      const jobId = downloadMatch[1];
      if (!isValidJobId(jobId)) {
        sendJSON(res, 400, { error: 'Invalid job ID' });
        return;
      }
      const resultPath = path.join(UPLOADS_DIR, jobId, 'result.xlsx');
      if (!fs.existsSync(resultPath)) {
        sendJSON(res, 404, { error: 'Result file not found' });
        return;
      }
      const stat = fs.statSync(resultPath);
      const dateStr = new Date().toISOString().split('T')[0];
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="tidymail-results-${dateStr}.xlsx"`,
        'Content-Length': stat.size,
      });
      fs.createReadStream(resultPath).pipe(res);
      return;
    }

    // DELETE /api/job/:jobId
    const deleteMatch = pathname.match(/^\/api\/job\/([^/]+)$/);
    if (method === 'DELETE' && deleteMatch) {
      const jobId = deleteMatch[1];
      if (!isValidJobId(jobId)) {
        sendJSON(res, 400, { error: 'Invalid job ID' });
        return;
      }
      const jobDir = path.join(UPLOADS_DIR, jobId);
      if (fs.existsSync(jobDir)) {
        fs.rmSync(jobDir, { recursive: true, force: true });
      }
      sendJSON(res, 200, { deleted: true });
      return;
    }

    // 404
    res.writeHead(404);
    res.end('Not found');

  } catch (err) {
    console.error('[SERVER] Unhandled error:', err);
    sendJSON(res, 500, { error: 'Internal server error', message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`[SERVER] Tidy Mail running at http://localhost:${PORT}`);
  console.log(`[SERVER] Uploads directory: ${UPLOADS_DIR}`);
});

server.on('error', (err) => {
  console.error('[SERVER] Server error:', err);
});