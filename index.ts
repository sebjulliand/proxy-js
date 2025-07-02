import dotenv from "dotenv";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import morgan from "morgan";
import net from "net";
import os from "os";

dotenv.config({ quiet: true });

const missingEnv = ['proxyPort', 'proxyTarget']
  .filter(key => process.env[key] === undefined || process.env[key] === "")
  .join(", ");

if (missingEnv) {
  console.error(`Missing env variables: ${missingEnv}`);
  process.exit(1);
}

const { proxyPort, proxyTarget, proxyUser, proxyPassword } = process.env;

if (proxyPort && isNaN(Number(proxyPort))) {
  console.error(`${proxyPort} is not a valid port number`);
  process.exit(2);
}

if (proxyUser && !proxyPassword) {
  console.error(`proxyUser is defined but proxyPassword is missing`);
  process.exit(2);
}
const app = express();

// Logging the requests
app.use(morgan("dev"));

let checkAuth = (auth?: string) => true;
if (proxyUser) {
  checkAuth = (auth?: string) => {
    if (auth) {
      const b64auth = (auth || '').split(' ')[1] || ''
      const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':')
      if (login === proxyUser && password === proxyPassword) {
        return true;
      }
      else {
        console.error(`❌ Access denied: invalid user (${login}) or password`);
      }
    }
    else {
      console.error(`❌ Access denied: no basic auth header was received: ${auth || "no authorization header"}`);
    }
    return false;
  }
  app.use('', (req, res, next) => {
    if (checkAuth(req.headers.authorization)) {
      return next();
    }
    else {
      res.sendStatus(403);
    }
  });
}

// Proxy Logic
app.use(
  "/",
  createProxyMiddleware({
    target: proxyTarget,
    changeOrigin: true,
    pathRewrite: {
      "^/": "",
    },
  })
);

app.connect("/", (req, res) => {
  console.log("hello")
  console.log(req)
});

// Starting our Proxy server
const server = app.listen(Number(proxyPort), () => {
  console.log(`Starting Proxy at http://${os.hostname()}:${proxyPort} - redirects to ${proxyTarget}${proxyUser ? " (🔑 Requires authentication)" : ""}`);
});

server.on("connect", (req, clientSocket, head) => {
  if (req.url) {
    console.log(`🔌 CONNECT request on ${req.url}`);
    const authHeader = req.headers["proxy-authorization"];
    if (!authHeader || checkAuth(authHeader)) {
      const [host, port] = req.url.split(":");
      if (host && port) {
        const serverSocket = net.connect(port ? Number(port) : 443, host, () => {
          console.log(`🔁 HTTPS tunnel established on ${host}:${port}`);
          clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          serverSocket.write(head);
          serverSocket.pipe(clientSocket);
          clientSocket.pipe(serverSocket);
        });
        serverSocket.on("error", (err) => {
          console.error(`❌ HTTPS tunneling error :`, err.message);
          clientSocket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
          clientSocket.destroy();
        });
        clientSocket.on("error", (err: any) => {
          if (err.code === "ECONNRESET") {
            console.log("Connection reset by client");
          }
          else {
            throw err;
          }
        })
      }
    }
    else {
      clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      clientSocket.destroy();
    }
  }
});