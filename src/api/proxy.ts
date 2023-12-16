import { Request } from "express";
import http from "http";
import { app } from "../express";

const { MUSA_BASE_URL = "" } = process.env;

app.use("/(.*)", async (req: Request<{ id: string }>, res) => {
  const body = JSON.stringify(req.body);
  const url = `${MUSA_BASE_URL}${req.originalUrl}`;
  console.log("Calling", req.method, url);

  req.url = url;

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
    console.log("Got response");
    proxyRes.pipe(res);
  });

  if (req.method === "POST" || req.method === "PUT") {
    // Forward the request body to the target endpoint
    if (req.body) {
      outgoingRequest.write(body);
    }
  }

  outgoingRequest.on("error", (err) => {
    console.error(`Error making proxy request: ${err.message}`);

    res.status(500).send("Internal Server Error");
  });

  // End the request to the target endpoint
  outgoingRequest.end();
});
