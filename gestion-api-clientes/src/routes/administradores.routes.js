import {
  Router,
} from "express";

import {
  adminSessionAuth,
} from "../middleware/adminSessionAuth.js";

import {
  superAdminAuth,
} from "../middleware/superAdminAuth.js";

import {
  crearAdministradorGestion,
  listarAdministradores,
  obtenerAdministradorDetalle,
  actualizarAdministrador,
  actualizarEstadoAdministrador,
  actualizarRolAdministrador,
  cerrarSesionesAdministrador,
} from "../services/administradores.service.js";


const router =
  Router();


// ==================================================
// TODAS LAS RUTAS DE ESTE ARCHIVO SON EXCLUSIVAS
// PARA SUPERADMIN
// ==================================================

router.use(
  adminSessionAuth,
  superAdminAuth
);


// ==================================================
// RESPUESTA DE ERROR
// ==================================================

function responderError(
  res,
  error,
  mensajeInterno =
    "Error interno del servidor."
) {

  return res
    .status(
      error.statusCode ||
      500
    )
    .json({

      success:
        false,

      error:
        error.statusCode
          ? error.message
          : mensajeInterno,

      code:
        error.code ||
        "INTERNAL_ERROR",
    });
}


// ==================================================
// LISTAR ADMINISTRADORES
// ==================================================

router.get(
  "/",

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await listarAdministradores({

          page:
            req.query.page,

          limit:
            req.query.limit,

          search:
            req.query.search,

          rol:
            req.query.rol,

          estado:
            req.query.estado,
        });


      return res
        .status(200)
        .json({

          success:
            true,

          data:
            resultado,
        });


    } catch (error) {

      console.error(
        "Error listando administradores:",
        error
      );


      return responderError(
        res,
        error
      );
    }
  }
);


// ==================================================
// CREAR ADMINISTRADOR
// ==================================================

router.post(
  "/",

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await crearAdministradorGestion({

          usuario:
            req.body?.usuario,

          password:
            req.body?.password,

          nombre:
            req.body?.nombre,

          email:
            req.body?.email,

          rol:
            req.body?.rol ||
            "ADMIN",
        });


      return res
        .status(201)
        .json({

          success:
            true,

          data:
            resultado,
        });


    } catch (error) {

      console.error(
        "Error creando administrador:",
        error
      );


      return responderError(
        res,
        error
      );
    }
  }
);


// ==================================================
// OBTENER ADMINISTRADOR
// ==================================================

router.get(
  "/:id",

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await obtenerAdministradorDetalle(
          req.params.id
        );


      return res
        .status(200)
        .json({

          success:
            true,

          data:
            resultado,
        });


    } catch (error) {

      console.error(
        "Error obteniendo administrador:",
        error
      );


      return responderError(
        res,
        error
      );
    }
  }
);


// ==================================================
// EDITAR ADMINISTRADOR
// ==================================================

router.patch(
  "/:id",

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await actualizarAdministrador(
          req.params.id,
          req.body || {}
        );


      return res
        .status(200)
        .json({

          success:
            true,

          data:
            resultado,
        });


    } catch (error) {

      console.error(
        "Error actualizando administrador:",
        error
      );


      return responderError(
        res,
        error
      );
    }
  }
);


// ==================================================
// ACTIVAR / BLOQUEAR
// ==================================================

router.patch(
  "/:id/estado",

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await actualizarEstadoAdministrador({

          idAdmin:
            req.params.id,

          estado:
            req.body?.estado,

          idAdminEjecutor:
            req.admin.idAdmin,
        });


      return res
        .status(200)
        .json({

          success:
            true,

          data:
            resultado,
        });


    } catch (error) {

      console.error(
        "Error actualizando estado del administrador:",
        error
      );


      return responderError(
        res,
        error
      );
    }
  }
);


// ==================================================
// CAMBIAR ROL
// ==================================================

router.patch(
  "/:id/rol",

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await actualizarRolAdministrador({

          idAdmin:
            req.params.id,

          rol:
            req.body?.rol,

          idAdminEjecutor:
            req.admin.idAdmin,
        });


      return res
        .status(200)
        .json({

          success:
            true,

          data:
            resultado,
        });


    } catch (error) {

      console.error(
        "Error actualizando rol del administrador:",
        error
      );


      return responderError(
        res,
        error
      );
    }
  }
);


// ==================================================
// CERRAR TODAS LAS SESIONES
// ==================================================

router.post(
  "/:id/cerrar-sesiones",

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await cerrarSesionesAdministrador({

          idAdmin:
            req.params.id,

          idAdminEjecutor:
            req.admin.idAdmin,
        });


      return res
        .status(200)
        .json({

          success:
            true,

          data:
            resultado,
        });


    } catch (error) {

      console.error(
        "Error cerrando sesiones del administrador:",
        error
      );


      return responderError(
        res,
        error
      );
    }
  }
);


export default router;