import { Server } from "http";
import { errorHandler } from "./errorHandler";
import { app } from "./express";

export * from "./api/proxy";
export { app } from "./express";

const { NODE_ENV, PORT = 4242 } = process.env;
const hostname = "0.0.0.0";

let server: Server;

export const start = async () => {
  app.use(errorHandler);

  if (NODE_ENV === "test" && !process.env.FORCE_SERVER_START) {
    return;
  }

  console.log(`\n${new Date().toISOString()}\n`);

  server = app.listen(+PORT, hostname, async () => {
    if (NODE_ENV !== "test") {
      console.log(`Serving http://${hostname}:${PORT}\n`);
    }
  });
};

start();

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");

  server.close(() => {
    console.log("HTTP server closed");
    console.log("Shutting down process");
    process.exit(0);
  });
});
