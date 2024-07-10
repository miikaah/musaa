import bodyParser from "body-parser";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

export const app = express();

app.use(express.json());
app.use(cors({ origin: "*" }));
app.use(compression());
app.use(cookieParser());
app.use(bodyParser.urlencoded());
