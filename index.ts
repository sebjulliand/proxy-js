import dotenv from "dotenv";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import morgan from "morgan";
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

if (proxyUser) {
  app.use('', (req, res, next) => {
    if (req.headers.authorization) {
      const b64auth = (req.headers.authorization || '').split(' ')[1] || ''
      const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':')
      if (login === proxyUser && password === proxyPassword) {
        return next();
      }
      else {
        console.error(`❌ Access denied: invalid user (${login}) or password`);
      }
    }
    else {
      console.error(`❌ Access denied: no basic auth header was received: ${req.headers.authorization || "no authorization header"}`);
    }

    res.sendStatus(403);
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

app.connect("/",(req) => console.log(req)
  
);

// Starting our Proxy server
app.listen(Number(proxyPort), () => {
  console.log(`Starting Proxy at http://${os.hostname()}:${proxyPort}/proxy - redirects to ${proxyTarget}${proxyUser ? " (🔑 Requires authentication)" : ""}`);
});