const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 5173);
const ROOT = path.resolve(__dirname);
const PUBLIC_FILES = new Set(["index.html", "styles.css", "story-content.js", "video-manifest.js", "app.js"]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname);
  } catch {
    sendText(res, 400, "Bad request");
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(ROOT, `.${pathname}`);
  const relative = path.relative(ROOT, filePath);
  const publicPath = relative.replaceAll("\\", "/");
  if (relative.startsWith("..") || path.isAbsolute(relative) || !isPublicFile(publicPath)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }

    const headers = {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
    };
    const range = parseRange(req.headers.range, stats.size);
    if (range === false) {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${stats.size}` });
      res.end();
      return;
    }

    const start = range ? range.start : 0;
    const end = range ? range.end : stats.size - 1;
    const status = range ? 206 : 200;
    headers["Content-Length"] = end - start + 1;
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${stats.size}`;
    res.writeHead(status, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath, { start, end }).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Bomb room offline build: http://${HOST}:${PORT}/index.html`);
});

function sendText(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function isPublicFile(relativePath) {
  if (PUBLIC_FILES.has(relativePath)) return true;
  const extension = path.extname(relativePath).toLowerCase();
  if (relativePath.startsWith("assets/video/")) {
    return [".mp4", ".webm", ".jpg", ".jpeg", ".png", ".webp"].includes(extension);
  }
  if (relativePath.startsWith("assets/ui/")) {
    return [".jpg", ".jpeg", ".png", ".webp"].includes(extension);
  }
  return false;
}

function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return false;

  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;
  if (start === null && end === null) return false;
  if (start === null) {
    const suffixLength = Math.min(end, size);
    start = size - suffixLength;
    end = size - 1;
  } else {
    end = end === null ? size - 1 : Math.min(end, size - 1);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return false;
  return { start, end };
}
