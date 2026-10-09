import {
  Router,
} from "express";

import {
  adminSessionAuth,
} from "../middleware/adminSessionAuth.js";

import {
  crearCliente,
  recargarCreditos,
  listarClientes,
  obtenerClienteDetalle,
  actualizarEstadoCliente,
  asignarAdministradorCliente,
} from "../services/clientes.service.js";

import {
  regenerarTokenCliente,
} from "../services/tokens.service.js";

import {
  obtenerDashboard,
} from "../services/dashboard.service.js";

import {
  listarConsumos,
} from "../services/consumos.service.js";

import {  superAdminAuth,} from "../middleware/superAdminAuth.js";

import {
  crearCredencialApiCliente,
  regenerarSecretApiCliente,
  cambiarEstadoCredencialApi,
} from "../services/apiCredentials.service.js";


const router =
  Router();


// ==================================================
// CREAR CLIENTE
// ==================================================

router.post(
  "/clientes",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await crearCliente(
          req.body || {},
          req.admin
        );


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
        "Error creando cliente:",
        error
      );


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
              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",
        });
    }
  }
);


// ==================================================
// RECARGAR CRÉDITOS
// ==================================================

router.post(
  "/clientes/:id/creditos",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await recargarCreditos(
        req.params.id,
        req.body?.cantidad,
        req.body?.servicio,
        req.admin
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
        "Error recargando créditos:",
        error
      );


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
              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",
        });
    }
  }
);


// ==================================================
// LISTAR CLIENTES
// ==================================================

router.get(
  "/clientes",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await listarClientes(
          {

            page:
              req.query.page,

            limit:
              req.query.limit,

            search:
              req.query.search,
          },

          req.admin
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
        "Error listando clientes:",
        error
      );


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
              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",
        });
    }
  }
);


// ==================================================
// DETALLE DE CLIENTE
// ==================================================

router.get(
  "/clientes/:id",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await obtenerClienteDetalle(
          req.params.id,

          {

            pageConsumos:
              req.query.pageConsumos,

            pageMovimientos:
              req.query.pageMovimientos,
          },

          req.admin
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
        "Error obteniendo cliente:",
        error
      );


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
              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",
        });
    }
  }
);


// ==================================================
// BLOQUEAR / ACTIVAR CLIENTE
// ==================================================

router.patch(
  "/clientes/:id/estado",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await actualizarEstadoCliente(
          req.params.id,
          req.body?.estado,
          req.admin
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
        "Error actualizando estado del cliente:",
        error
      );


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
              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",
        });
    }
  }
);


// ==================================================
// REGENERAR TOKEN
// ==================================================

router.post(
  "/clientes/:id/tokens/regenerar",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await regenerarTokenCliente(
          req.params.id,
          req.body?.fechaVencimiento,
          req.admin
        );


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
        "Error regenerando token:",
        error
      );


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
              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",
        });
    }
  }
);


// ==================================================
// DASHBOARD ADMINISTRATIVO
// ==================================================

router.get(
  "/dashboard",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await obtenerDashboard(
          req.admin
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
        "Error obteniendo dashboard:",
        error
      );


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
              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",
        });
    }
  }
);


// ==================================================
// LISTAR CONSUMOS
// ==================================================

router.get(
  "/consumos",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await listarConsumos(
          {

            page:
              req.query.page,

            limit:
              req.query.limit,

            search:
              req.query.search,

            estado:
              req.query.estado,

            servicio:
              req.query.servicio,
          },

          req.admin
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
        "Error listando consumos:",
        error
      );


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
              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",
        });
    }
  }
);

// ==================================================
// ASIGNAR / REASIGNAR ADMINISTRADOR A CLIENTE
// SOLO SUPERADMIN
// ==================================================

router.patch(
  "/clientes/:id/admin",

  adminSessionAuth,
  superAdminAuth,

  async (req, res) => {

    try {

      const resultado =
        await asignarAdministradorCliente(
          req.params.id,
          req.body?.idAdmin
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
        "Error asignando administrador al cliente:",
        error
      );


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
              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",
        });
    }
  }
);

// ==================================================
// CREAR CREDENCIAL API COMERCIAL
// ==================================================

router.post(
  "/clientes/:id/api-credencial",

  adminSessionAuth,

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await crearCredencialApiCliente(
          req.params.id,
          req.admin
        );


      return res
        .status(201)
        .json({

          success:
            true,

          data:
            resultado,

        });


    } catch (
      error
    ) {

      console.error(
        "Error creando credencial API:",
        error
      );


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

              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",

        });
    }
  }
);


// ==================================================
// REGENERAR CLIENT_SECRET
// ==================================================

router.post(
  "/clientes/:id/api-credencial/regenerar",

  adminSessionAuth,

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await regenerarSecretApiCliente(
          req.params.id,
          req.admin
        );


      return res
        .status(200)
        .json({

          success:
            true,

          data:
            resultado,

        });


    } catch (
      error
    ) {

      console.error(
        "Error regenerando CLIENT_SECRET:",
        error
      );


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

              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",

        });
    }
  }
);


// ==================================================
// CAMBIAR ESTADO CREDENCIAL API
// ==================================================

router.patch(
  "/clientes/:id/api-credencial/estado",

  adminSessionAuth,

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await cambiarEstadoCredencialApi(
          req.params.id,
          req.body?.estado,
          req.admin
        );


      return res
        .status(200)
        .json({

          success:
            true,

          data:
            resultado,

        });


    } catch (
      error
    ) {

      console.error(
        "Error actualizando credencial API:",
        error
      );


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

              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",

        });
    }
  }
);

export default router;