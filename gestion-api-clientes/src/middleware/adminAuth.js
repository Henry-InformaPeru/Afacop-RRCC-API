import crypto from "node:crypto";

export function adminAuth(req, res, next) {
  const expected =
    String(
      process.env.ADMIN_API_KEY || ""
    ).trim();

  const received =
    String(
      req.get("x-admin-key") || ""
    ).trim();

  if (!expected || !received) {
    return res.status(401).json({
      success: false,
      error: "No autorizado.",
      code: "INVALID_ADMIN_KEY",
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
      success: false,
      error: "No autorizado.",
      code: "INVALID_ADMIN_KEY",
    });
  }

  const valid =
    crypto.timingSafeEqual(
      expectedBuffer,
      receivedBuffer
    );

  if (!valid) {
    return res.status(401).json({
      success: false,
      error: "No autorizado.",
      code: "INVALID_ADMIN_KEY",
    });
  }

  next();
}