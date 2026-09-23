import {
  verificarTokenAdministrador,
} from "../services/auth.service.js";


export function adminSessionAuth(
  req,
  res,
  next
) {

  try {

    const token =
      req.cookies?.admin_session;


    if (!token) {
      return res
        .status(401)
        .json({
          success: false,
          error:
            "Debe iniciar sesión.",
          code:
            "ADMIN_SESSION_REQUIRED",
        });
    }


    const payload =
      verificarTokenAdministrador(
        token
      );


    req.admin = {
      idAdmin:
        payload.sub,

      usuario:
        payload.usuario,

      nombre:
        payload.nombre,
    };


    next();

  } catch (error) {

    return res
      .status(
        error.statusCode ||
        401
      )
      .json({
        success: false,

        error:
          error.message,

        code:
          error.code ||
          "INVALID_ADMIN_SESSION",
      });
  }
}