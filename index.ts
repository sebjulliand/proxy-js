import http from "http";
import httpProxy from "http-proxy";
import net from "net";
import os from "os";

const missingEnv = ['proxyPort', 'proxyTarget']
  .filter(key => process.env[key] === undefined || process.env[key] === "")
  .join(", ");

if (missingEnv) {
  console.error(`Missing env variables: ${missingEnv}`);
  process.exit(1);
}

if (process.env.proxyUser && !process.env.proxyPassword) {
  console.error(`proxyUser is defined but proxyPassword is missing`);
  process.exit(2);
}

// Valid credentials
const validUsername = process.env.proxyUser;
const validPassword = process.env.proxyPassword;

// HTTP target
const proxy = httpProxy.createProxyServer({
  target: process.env.proxyTarget,
  changeOrigin: true,
});

// Main HTTP server
const server = http.createServer((req, res) => {
  const authHeader = req.headers["proxy-authorization"];
  const now = new Date().toISOString();
  console.log(`[${now}] 🌐 New request : ${req.method} ${req.url}`);
  if (validUsername && !authHeader) {
    console.log(`[${now}] ❌ Missing authentication`);
    res.writeHead(407, { "Proxy-Authenticate": 'Basic realm="Proxy"' });
    res.end("Proxy Authentication Required");
    return;
  }
  else if (authHeader) {
    const base64Credentials = authHeader.split(" ")[1];
    const credentials = Buffer.from(base64Credentials, "base64").toString(
      "utf-8"
    );
    const [username, password] = credentials.split(":");
    console.log(`[${now}] 🔑 Connection attempt of ${username}`);
    if (username !== validUsername || password !== validPassword) {
      console.log(`[${now}] ❌ Access denied for ${username}`);
      res.writeHead(403);
      res.end("Access Denied");
      return;
    }
    console.log(`[${now}] ✅ Authentication successful, redirecting...`);
  }
  else {
    console.log(`[${now}] ✅ Redirecting...`);
  }

  proxy.web(req, res, {}, err => {
    console.error(`[${now}] ⚠️ HTTP proxy error :`, err.message);
    res.writeHead(500);
    res.end("Internal Server Error");
  });
});
// Gestion du HTTPS via CONNECT (tunneling)
server.on("connect", (req, clientSocket, head) => {
  const now = new Date().toISOString();
  const authHeader = req.headers["proxy-authorization"];
  console.log(`[${now}] 🔌 CONNECT request on ${req.url}`);
  if (validUsername && !authHeader) {
    console.log(`[${now}] ❌ Missing authentication (CONNECT)`);
    clientSocket.write(
      'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Proxy"\r\n\r\n'
    );
    clientSocket.destroy();
    return;
  }
  else if (authHeader) {
    const base64Credentials = authHeader.split(" ")[1];
    const credentials = Buffer.from(base64Credentials, "base64").toString(
      "utf-8"
    );
    const [username, password] = credentials.split(":");
    if (username !== validUsername || password !== validPassword) {
      console.log(`[${now}] ❌ Forbidden access for ${username} (CONNECT)`);
      clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      clientSocket.destroy();
      return;
    }
  }

  if (req.url) {
    const [host, port] = req.url.split(":");
    const serverSocket = net.connect(Number(port) || 443, host, () => {
      console.log(`[${now}] 🔁 HTTPS tunnel established on ${host}:${port}`);
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });
    serverSocket.on("error", (err) => {
      console.error(`[${now}] ❌ HTTPS tunneling error :`, err.message);
      clientSocket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      clientSocket.destroy();
    });
  }
});

// Lancement du proxy
const PORT = Number(process.env.proxyPort);
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Proxy listening on http://${os.hostname()}:${PORT} targetting ${process.env.proxyTarget}${validUsername ? " (🔑 requires authentication)" : ""}`);
});