import { Request } from "express";
import http from "http";
import { app } from "../express";
import * as Crypto from "../cryptography";

const {
  MUSA_BASE_URL = "",
  USERNAME,
  PASSWORD,
  SALT = "",
  CIPHER_KEY: key = "",
} = process.env;

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
      <input type="hidden" id="salt" name="salt">

      <button type="button" onclick="submitLoginForm()">Login</button>
    </form>
    <script>
      async function deriveKeyFromPassword(
        password,
        salt,
      ) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        const saltBuffer = encoder.encode(salt);
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
      
          const salt = "{{SALT}}";
          const pw = await deriveKeyFromPassword(password, salt);
      
          document.getElementById('password').value = pw;
          document.getElementById('salt').value = salt;
          
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

const isUserAllowed = (
  username: string,
  salt: string,
  password: string,
): boolean => {
  return Boolean(
    username &&
      username === USERNAME &&
      salt &&
      password &&
      Crypto.hashPassword(salt, password) === PASSWORD,
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
    try {
      if (req.originalUrl === "/login") {
        const { username, password, salt } = req.body;

        if (!isUserAllowed(username, salt, password)) {
          res.status(401).send(loginHtml);
          return;
        }

        res.cookie("musaUsername", Crypto.encrypt(username, key), {
          httpOnly: true,
        });
        res.cookie("musaPassword", Crypto.encrypt(password, key), {
          httpOnly: true,
        });
        res.status(200).redirect("/");
        return;
      }
    } catch (error) {
      console.error("Failed during login", error);

      res.status(401).send(loginHtml);
      return;
    }

    const { musaUsername, musaPassword } = req.cookies;
    const username = musaUsername && Crypto.decrypt(musaUsername, key);
    const password = musaPassword && Crypto.decrypt(musaPassword, key);

    try {
      const isAllowed = allowListForFiles.some((file) => {
        return req.originalUrl.includes(file);
      });

      if (!isAllowed && !isUserAllowed(username, SALT, password)) {
        res.status(401).send(loginHtml);
        return;
      }
    } catch (error) {
      console.error("Failed during authorization", error);

      res.status(401).send(loginHtml);
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
        "x-musa-proxy-username": username ?? "",
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
    });

    // Forward the request body to the target endpoint
    if (req.body) {
      outgoingRequest.write(body);
    }

    outgoingRequest.on("error", (err) => {
      console.error(`Error making proxy request: ${err.message}`);

      res.status(500).send("Internal Server Error");
    });

    // End the request to the target endpoint
    outgoingRequest.end();
  },
);
