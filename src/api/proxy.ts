import { Request } from "express";
import { app } from "../express";

app.get("/", async (_req: Request<{ id: string }>, res) => {
  res.status(200).json({ message: "Ok" });
});
