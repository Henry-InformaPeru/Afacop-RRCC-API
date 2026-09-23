import {
  Router,
} from "express";

import {
  adminSessionAuth,
} from "../middleware/adminSessionAuth.js";

import {
  crearCliente, recargarCreditos, listarClientes,obtenerClienteDetalle,actualizarEstadoCliente
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


const router =
  Router();


router.post(
  "/clientes",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await crearCliente(
          req.body || {}
        );

      return res
        .status(201)
        .json({
          success: true,
          data: resultado,
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
          success: false,

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

router.post(
  "/clientes/:id/creditos",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await recargarCreditos(
          req.params.id,
          req.body?.cantidad
        );

      return res
        .status(200)
        .json({
          success: true,
          data: resultado,
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
          success: false,

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

// --------------------------------------------------
// LISTAR CLIENTES
// --------------------------------------------------

router.get(
  "/clientes",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await listarClientes({
          page:
            req.query.page,

          limit:
            req.query.limit,

          search:
            req.query.search,
        });


      return res
        .status(200)
        .json({
          success: true,
          data: resultado,
        });


    } catch (error) {

      console.error(
        "Error listando clientes:",
        error
      );


      return res
        .status(500)
        .json({
          success: false,
          error:
            "Error interno del servidor.",
          code:
            "INTERNAL_ERROR",
        });
    }
  }
);

// --------------------------------------------------
// DETALLE DE CLIENTE
// --------------------------------------------------

router.get(
  "/clientes/:id",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await obtenerClienteDetalle(
          req.params.id
        );


      return res
        .status(200)
        .json({
          success: true,
          data: resultado,
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
          success: false,

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

// --------------------------------------------------
// BLOQUEAR / ACTIVAR CLIENTE
// --------------------------------------------------

router.patch(
  "/clientes/:id/estado",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await actualizarEstadoCliente(
          req.params.id,
          req.body?.estado
        );


      return res
        .status(200)
        .json({
          success: true,
          data: resultado,
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
          success: false,

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

// --------------------------------------------------
// REGENERAR TOKEN
// --------------------------------------------------

router.post(
  "/clientes/:id/tokens/regenerar",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await regenerarTokenCliente(
          req.params.id,
          req.body?.fechaVencimiento
        );


      return res
        .status(201)
        .json({
          success: true,
          data: resultado,
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
          success: false,

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

// --------------------------------------------------
// DASHBOARD ADMINISTRATIVO
// --------------------------------------------------

router.get(
  "/dashboard",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await obtenerDashboard();


      return res
        .status(200)
        .json({
          success: true,
          data: resultado,
        });


    } catch (error) {

      console.error(
        "Error obteniendo dashboard:",
        error
      );


      return res
        .status(500)
        .json({
          success: false,
          error:
            "Error interno del servidor.",
          code:
            "INTERNAL_ERROR",
        });
    }
  }
);

// --------------------------------------------------
// LISTAR CONSUMOS
// --------------------------------------------------

router.get(
  "/consumos",
  adminSessionAuth,
  async (req, res) => {

    try {

      const resultado =
        await listarConsumos({

          page:
            req.query.page,

          limit:
            req.query.limit,

          search:
            req.query.search,

          estado:
            req.query.estado,
        });


      return res
        .status(200)
        .json({
          success: true,
          data: resultado,
        });


    } catch (error) {

      console.error(
        "Error listando consumos:",
        error
      );


      return res
        .status(500)
        .json({
          success: false,

          error:
            "Error interno del servidor.",

          code:
            "INTERNAL_ERROR",
        });
    }
  }
);

export default router;