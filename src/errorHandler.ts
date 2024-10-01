import { NextFunction, Request, Response } from "express";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (process.env.NODE_ENV !== "test") {
    console.error(err);
  }

  if (res.headersSent) {
    next();
    return;
  }

  if (
    process.env.NODE_ENV === "production" ||
    process.env.NODE_ENV === "test"
  ) {
    res.status(500).json({ message: "Internal Server Error" });
    return;
  }

  res.status(500).json(err);
};
