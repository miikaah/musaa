import * as jwt from "jsonwebtoken";

const secretKey = process.env.JWT_SECRET_KEY;
const issuer = process.env.JWT_ISSUER;

if (!secretKey) {
  throw new Error("Missing JWT_SECRET_KEY env var");
}

if (!issuer) {
  throw new Error("Missing JWT_ISSUER env var");
}

export type TokenPayload = {
  username: string;
};

export const createAccessToken = (payload: TokenPayload) => {
  const options: jwt.SignOptions = {
    expiresIn: "1h",
    issuer,
    audience: issuer,
  };

  return jwt.sign(payload, secretKey, options);
};

export const createRefreshToken = (payload: TokenPayload) => {
  const options: jwt.SignOptions = {
    expiresIn: "90d",
    issuer,
    audience: issuer,
  };

  return jwt.sign(payload, secretKey, options);
};

export const verifyJwtToken = (token: string) => {
  const decoded = jwt.verify(token, secretKey, {
    issuer,
    audience: issuer,
  }) as jwt.JwtPayload;

  return decoded;
};
