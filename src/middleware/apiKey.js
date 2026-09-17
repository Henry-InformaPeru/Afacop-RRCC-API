import crypto from "node:crypto";

export function apiKeyMiddleware(req, res, next) {
  const expected =
    process.env.RRCC_API_KEY;

  const received =
    req.get("x-api-key");

  if (!expected || !received) {
    return res.status(401).json({
      error: "No autorizado.",
      code: "INVALID_API_KEY",
    });
  }

  const expectedBuffer =
    Buffer.from(expected);

  const receivedBuffer =
    Buffer.from(received);

  if (
    expectedBuffer.length !==
    receivedBuffer.length
  ) {
    return res.status(401).json({
      error: "No autorizado.",
      code: "INVALID_API_KEY",
    });
  }

  const isValid =
    crypto.timingSafeEqual(
      expectedBuffer,
      receivedBuffer
    );

  if (!isValid) {
    return res.status(401).json({
      error: "No autorizado.",
      code: "INVALID_API_KEY",
    });
  }

  next();
}