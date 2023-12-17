import { Request } from "express";
import http from "http";
import { app } from "../express";

const { MUSA_BASE_URL = "", PASSWORD } = process.env;

const loginHtml = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Musa Login</title>
  </head>

  <body>
    <form action="/login" method="POST">
      <label for="password">Password:</label>
      <input type="password" id="password" name="password" placeholder="Password" required>

      <button type="submit">Login</button>
    </form>
  </body>
</html>
`;

const allowListForFiles = ["manifest.json", "favicon.ico"];

app.use(
  "/(.*)",
  async (req: Request<{ id: string }, unknown, { password: string }>, res) => {
    if (req.originalUrl === "/login") {
      const password = req.body.password;

      if (!password || password !== PASSWORD) {
        res.status(401).send(loginHtml);
        return;
      }

      res.cookie("musaPassword", password, { httpOnly: true });
      res.status(200).redirect("/");
      return;
    }

    const isAllowed = allowListForFiles.some((file) => {
      return req.originalUrl.includes(file);
    });
    const password = req.cookies.musaPassword;
    if (!isAllowed && (!password || password !== PASSWORD)) {
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
        "x-musa-proxy": "yes",
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
