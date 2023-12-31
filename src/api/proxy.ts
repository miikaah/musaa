import { Request, Response } from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { TokenExpiredError } from "jsonwebtoken";
import { app } from "../express";
import * as Crypto from "../cryptography";
import * as Jwt from "../jwt";
import { exec } from "child_process";

const { NODE_ENV = "", MUSA_BASE_URL = "", SALT = "" } = process.env;

const loginHtmlTemplate = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Musa - Login</title>
    <style>
      :root {
        --font-size-md: 18px;
        --font-size-sm: 16px;
        --font-size-xs: 14px;
        --font-size-xxs: 12px;
        --color-white: #fbfbfb;
        --color-black: #000;
      }

      html {
        overflow: hidden;
        color: var(--color-white);
        background: rgb(33, 37, 43);
      }
      
      * {
        box-sizing: border-box;
      }
      
      body {
        margin: 0;
        padding: 0;
        font-family: Verdana, Tahoma, sans-serif;
        -webkit-font-smoothing: antialiased;
      }

      h1 {
        margin: 0 0 20px 0;
      }

      button {
        color: inherit;
        background-color: transparent;
        border: 0;
        padding: 0;
        cursor: pointer;
        font-family: Verdana, Tahoma, sans-serif;
        -webkit-font-smoothing: antialiased;
        padding: 12px;
        border-radius: 3px;
        font-weight: bold;
        background-color: rgb(117, 53, 151);
        color: var(--color-white);
      }

      input {
        padding: 10px 30px;
        font-size: var(--font-size-md);
      }

      form {
        display: flex;
        flex-direction: column;
        max-width: 420px;
        margin: 100px auto;
        justify-content: center;
        background-color: rgb(33, 115, 126);
        padding: 40px 40px 50px;
        border-radius: 6px;
      }

      form > input {
        margin-bottom: 8px;
      }

      form > button {
        margin-top: 10px;
      }
    </style>
  </head>

  <body>
    <form id="loginForm" action="/login" method="POST">
      <h1>Musa</h1>

      <input type="text" id="username" name="username" placeholder="Username" required>
      <input type="password" id="pw" placeholder="Password" required>
      <input type="hidden" id="password" name="password">

      <button type="button" onclick="submitLoginForm()">Login</button>
    </form>
    <script>
      async function deriveKeyFromPassword(
        password,
      ) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        const saltBuffer = encoder.encode("{{SALT}}");
        const iterations = 999666;
        const keyLength = 32;
        const hashFunction = "SHA-256";

        const derivedKeyBuffer = await crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: saltBuffer,
            iterations,
            hash: { name: hashFunction },
          },
          await crypto.subtle.importKey("raw", passwordBuffer, "PBKDF2", false, [
            "deriveBits",
            "deriveKey"
          ]),
          { name: "AES-GCM", length: keyLength * 8 },
          true,
          ["encrypt", "decrypt"],
        );
      
        const derivedKeyArray = new Uint8Array(
          await crypto.subtle.exportKey("raw", derivedKeyBuffer),
        );
        const derivedKeyHex = Array.from(derivedKeyArray)
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      
        return derivedKeyHex;
      };

      async function submitLoginForm() {
        try {
          const username = document.getElementById('username').value;
          const password = document.getElementById('pw').value;
      
          const pw = await deriveKeyFromPassword(password);
      
          document.getElementById('password').value = pw;
          document.getElementById('pw').value = "";

          document.getElementById('loginForm').submit();
        } catch (error) {
          console.error('Error:', error);
        }
      }
    </script>
  </body>
</html>
`;

const allowListForFiles = ["manifest.json", "favicon.ico"];
const loginHtml = loginHtmlTemplate.replace("{{SALT}}", SALT);
const users: Record<string, { password: string; salt: string }> = JSON.parse(
  fs.readFileSync(
    NODE_ENV !== "production"
      ? "users.json"
      : path.join(__dirname, "users.json"),
    "utf-8",
  ),
);

const isUserAllowed = (username: string, password: string): boolean => {
  const user = users[username];
  if (!user) {
    return false;
  }

  return Boolean(
    user.salt &&
      user.password &&
      password &&
      Crypto.hashPassword(user.salt, password) === user.password,
  );
};

const storeJwtsToCookies = (res: Response, username: string) => {
  res.cookie(
    "musaAccessToken",
    Crypto.encrypt(Jwt.createAccessToken({ username })),
    {
      httpOnly: true,
    },
  );
  res.cookie(
    "musaRefreshToken",
    Crypto.encrypt(Jwt.createRefreshToken({ username })),
    {
      httpOnly: true,
    },
  );
};

// This is for debugging fly.io cpu usage bug
const outputPsAux = (res?: Response) => {
  exec("ps aux", (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing ps command: ${error.message}`);
      return;
    }

    if (stderr) {
      console.error(`ps command stderr: ${stderr}`);
      return;
    }

    if (res) {
      res.status(200).send(stdout);
      return;
    }

    console.log(`ps command output:\n${stdout}`);
  });
};

setInterval(
  () => {
    console.log("~6 minute interval ps aux");
    outputPsAux();
  },
  60_000 * 6 + 15_000,
);

app.use(
  "/(.*)",
  async (
    req: Request<
      { id: string },
      unknown,
      { username: string; password: string; salt: string }
    >,
    res,
  ) => {
    if (req.originalUrl === "/login") {
      try {
        const { username, password } = req.body;

        if (!isUserAllowed(username, password)) {
          res.status(401).send(loginHtml);
          return;
        }

        storeJwtsToCookies(res, username);
        res.status(200).redirect("/");
        return;
      } catch (error) {
        console.error("Failed during login", error);

        res.status(401).send(loginHtml);
        return;
      }
    }

    const { musaAccessToken, musaRefreshToken } = req.cookies;
    const accessTokenString =
      musaAccessToken && Crypto.decrypt(musaAccessToken);
    const refreshTokenString =
      musaRefreshToken && Crypto.decrypt(musaRefreshToken);

    let accessToken: Jwt.TokenPayload = { username: "" };
    let refreshToken: Jwt.TokenPayload = { username: "" };

    const isAllowed = allowListForFiles.some((file) => {
      return req.originalUrl.includes(file);
    });

    if (!isAllowed) {
      if (!musaAccessToken) {
        res.status(401).send(loginHtml);
        return;
      }

      try {
        accessToken = Jwt.verifyJwtToken(accessTokenString) as Jwt.TokenPayload;
      } catch (error) {
        if (error instanceof TokenExpiredError) {
          // accessToken expired check refreshToken
          try {
            refreshToken = Jwt.verifyJwtToken(
              refreshTokenString,
            ) as Jwt.TokenPayload;

            console.log("Creating new access and refresh tokens");
            storeJwtsToCookies(res, refreshToken.username);
          } catch (error) {
            console.error("Invalid refresh token", error);

            res.status(401).send(loginHtml);
            return;
          }
        } else {
          console.error("Invalid access token", error);

          res.status(401).send(loginHtml);
          return;
        }
      }
    }

    if (req.originalUrl === "/heartbeat") {
      console.log("Received heartbeat");
      outputPsAux(res);
      return;
    }

    const body = JSON.stringify(req.body);
    const url = `${MUSA_BASE_URL}${req.originalUrl}`;

    // Create options for the outgoing request
    const options: http.RequestOptions = {
      method: req.method,
      headers: {
        ...req.headers,
        "content-length": req.body ? Buffer.byteLength(body) : 0,
        "x-musa-proxy-username": accessToken.username ?? "",
      },
    };

    const outgoingRequest = http.request(url, options, (proxyRes) => {
      // Forward the response headers
      res.set(proxyRes.headers);
      // Forward status code (enables caching for the browser)
      res.status(proxyRes.statusCode ?? 200);
      res.statusMessage = proxyRes.statusMessage ?? "";

      // Pipe the response from the target endpoint to the original response
      proxyRes.pipe(res);

      proxyRes.on("error", (err) => {
        console.error(`Error during proxyRes: ${err.message}`);
        res.status(500).send("Internal Server Error");

        outputPsAux();
      });
    });

    // Forward the request body to the target endpoint
    if (req.body) {
      outgoingRequest.write(body);
    }

    outgoingRequest.on("error", (err) => {
      console.error(`Error making proxy request: ${err.message}`);
      res.status(500).send("Internal Server Error");

      outputPsAux();
    });

    // End the request to the target endpoint
    outgoingRequest.end();
  },
);
