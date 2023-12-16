import compression from "compression";
import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";

export const app = express();

app.use(express.json());
app.use(cors({ origin: "*" }));
app.use(compression());
app.use(cookieParser());
