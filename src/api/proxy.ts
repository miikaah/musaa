import { Request, Response } from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { TokenExpiredError } from "jsonwebtoken";
import { app } from "../express";
import * as Crypto from "../cryptography";
import * as Jwt from "../jwt";
import crypto from "crypto";

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
    const id = getId();
    // if (!req.headers["range"]) {
    //   console.log(`Request ${id} ${req.method} ${req.originalUrl}`);
    //   // Close should always be called
    //   req.addListener("close", () => {
    //     console.log(
    //       `Request ${id} closed ${res.statusCode} ${req.originalUrl}`,
    //     );
    //   });
    // }

    // if (req.headers["range"]) {
    //   // It's useful to see the range being requested for partial content
    //   console.log(`Request ${id}`, req.headers.range);
    // }

    // res.addListener("close", () => {
    //   console.log(`Response ${id} closed ${res.statusCode} ${req.originalUrl}`);
    // });

    // Express default timeout is 5 minutes
    res.setTimeout(40_000, () => {
      // console.log(`Request ${id} timed out ${req.originalUrl}`);
      res.status(408).end();
    });

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
      res.status(200).send();
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
        "x-musa-proxy-request-id": id,
      },
    };

    const outgoingRequest = http.request(url, options, (incomingMessage) => {
      if (res.headersSent) {
        console.error(
          `Response ${id} already sent. Not proxying so that server doesn't crash.`,
        );
        req.destroy();
        outgoingRequest.destroy();
        return;
      }
      // Forward the response headers
      res.set(incomingMessage.headers);
      // Forward status code (enables caching for the browser)
      res.status(incomingMessage.statusCode ?? 200);
      res.statusMessage = incomingMessage.statusMessage ?? "";

      // Express default timeout is 5 minutes
      incomingMessage.setTimeout(30_000, () => {
        // console.log(`Proxy Response ${id} timed out ${req.originalUrl}`);
        // NOTE: Nuking the request here closes everything correctly
        outgoingRequest.destroy();
      });

      // incomingMessage.on("error", (err) => {
      //   console.log(`Proxy Response ${id} errored ${err.message}`);
      // });

      // incomingMessage.on("close", () => {
      //   console.log(
      //     `Proxy Response ${id} closed ${res.statusCode} ${req.originalUrl}`,
      //   );
      // });

      res.addListener("close", () => {
        outgoingRequest.destroy();
      });

      // Pipe the response from the target endpoint to the original response
      incomingMessage.pipe(res);
    });

    // Forward the request body to the target endpoint
    if (req.body) {
      outgoingRequest.write(body);
    }

    outgoingRequest.on("error", (err) => {
      console.error(`Proxy Request ${id} errored ${err.message}`);
      if (!res.headersSent) {
        res.status(500).send("Internal Server Error");
      }
    });

    // outgoingRequest.on("close", () => {
    //   console.error(
    //     `Proxy Request ${id} closed ${res.statusCode} ${req.originalUrl}`,
    //   );
    // });

    // End the request to the target endpoint
    outgoingRequest.end();
  },
);

function getId(): string {
  const randomBuffer = crypto.randomBytes(16);
  const sha256Hash = crypto.createHash("sha256");
  sha256Hash.update(randomBuffer);

  const hexHash = sha256Hash.digest("hex");
  const md5Hash = crypto.createHash("md5");
  md5Hash.update(hexHash);

  return md5Hash.digest("hex").substring(0, 9);
}
