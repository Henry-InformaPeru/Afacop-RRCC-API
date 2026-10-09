export function superAdminAuth(
  req,
  res,
  next
) {

  // --------------------------------------------------
  // adminSessionAuth debe ejecutarse antes.
  // --------------------------------------------------

  if (!req.admin) {

    return res
      .status(401)
      .json({

        success:
          false,

        error:
          "Debe iniciar sesión.",

        code:
          "ADMIN_SESSION_REQUIRED",
      });
  }


  // --------------------------------------------------
  // SOLO SUPERADMIN
  // --------------------------------------------------

  if (
    req.admin.rol !==
    "SUPERADMIN"
  ) {

    return res
      .status(403)
      .json({

        success:
          false,

        error:
          "No tiene permisos para realizar esta operación.",

        code:
          "SUPERADMIN_REQUIRED",
      });
  }


  return next();
}