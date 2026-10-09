import {  Router,} from "express";

import {  clientTokenAuth,} from "../middleware/clientToken.js";

import {
  clienteIpLimiter,
  cuentaTokenLimiter,
  consultaTokenLimiter,
  limitarConsultasConcurrentes,
} from "../middleware/clienteSecurity.js";

import {
  consultarRRCC,
  validarDocumento,
} from "../services/consulta.service.js";

import {  reservarCredito,} from "../services/creditos.service.js";

import {  registrarConsumo,} from "../services/consumos.service.js";

import {  consultarSueldos,} from "../services/sueldos.service.js";


const router =
  Router();


// --------------------------------------------------
// CONSULTAR CUENTA / SALDOS
// --------------------------------------------------

router.get(
  "/cuenta",

  // 1. Protección general
  clienteIpLimiter,

  // 2. Validar token
  clientTokenAuth,

  // 3. Protección por token
  cuentaTokenLimiter,

  async (
    req,
    res
  ) => {

    const cliente =
      req.clienteApi;


    const nombre =
      cliente.razonSocial ||
      [
        cliente.apellidoPaterno,
        cliente.apellidoMaterno,
        cliente.nombres,
      ]
        .filter(Boolean)
        .join(" ");


    return res
      .status(200)
      .json({

        success:
          true,

        data: {

          idCliente:
            cliente.idCliente,

          idToken:
            cliente.idToken,

          nombre,

          tipoDocumento:
            cliente.tipoDocumentoCliente,

          documento:
            cliente.documentoCliente,


          // ============================================
          // TOTAL GENERAL
          // ============================================

          creditos: {

            disponibles:
              cliente.creditosDisponibles,

            totalAsignado:
              cliente.totalAsignado,

            totalConsumido:
              cliente.totalConsumido,

          },


          // ============================================
          // SALDOS POR SERVICIO
          // ============================================

          creditosPorServicio:
            cliente.creditosPorServicio,

        },

      });
  }
);


// --------------------------------------------------
// REALIZAR CONSULTA
// --------------------------------------------------

router.post(
  "/consulta",

  // ------------------------------------------------
  // SEGURIDAD
  //
  // Todo esto ocurre ANTES de reservar crédito.
  // ------------------------------------------------

  clienteIpLimiter,

  clientTokenAuth,

  consultaTokenLimiter,

  limitarConsultasConcurrentes,


  async (
    req,
    res
  ) => {

    const inicio =
      Date.now();


    const cliente =
      req.clienteApi;


    let datosConsulta =
      null;


    let reserva =
      null;


    let consumoRegistrado =
      false;


    try {

      // ==============================================
      // 1. VALIDAR DOCUMENTO
      //
      // Documento inválido:
      // NO consume crédito.
      // NO llama RRCC.
      // ==============================================

      datosConsulta =
        validarDocumento(
          req.body?.tipoDocumento,
          req.body?.documento
        );


      // ==============================================
      // 2. RESERVAR 1 CRÉDITO DE LA BOLSA RRCC
      // ==============================================

      reserva =
      await reservarCredito({

        idCliente:
          cliente.idCliente,

        idToken:
          cliente.idToken,

        servicio:
          "RRCC",

      });


      // ==============================================
      // 3. CONSULTAR RRCC
      //
      // Desde este punto el crédito ya fue consumido.
      // ==============================================

      const rrcc =
        await consultarRRCC({

          tipoDocumento:
            datosConsulta
              .tipoDocumento,

          documento:
            datosConsulta
              .documento,
        });


      const duracionMs =
        Date.now() -
        inicio;


      // ==============================================
      // 4. CONSULTA EXITOSA
      // ==============================================

      if (rrcc.ok) {

        await registrarConsumo({

          idCliente:
            cliente.idCliente,

          idToken:
            cliente.idToken,

          idMovimiento:
            reserva.idMovimiento,

          tipoDocumento:
            datosConsulta
              .tipoDocumento,

          documento:
            datosConsulta
              .documento,

          servicio:
            "RRCC",

          creditosConsumidos:
            1,

          estado:
            "EXITOSA",

          httpStatus:
            rrcc.status,

          mensaje:
            "Consulta procesada correctamente.",

          ipOrigen:
            req.ip,

          duracionMs,
        });


        consumoRegistrado =
          true;


        return res
          .status(
            rrcc.status ||
            200
          )
          .json({

            success:
              true,

            data:
              rrcc.data?.data ??
              rrcc.data,
          });
      }


      // ==============================================
      // 5. RRCC SIN DATOS O ERROR HTTP
      //
      // También consume crédito.
      // ==============================================

      const estado =
        rrcc.status === 404

          ? "SIN_DATOS"

          : "ERROR";


      const mensaje =
        rrcc.data?.error ||
        rrcc.data?.message ||
        rrcc.data?.mensaje ||
        (
          rrcc.status === 404

            ? "No se encontró información para el documento consultado."

            : "La consulta fue procesada con error."
        );


      const codigo =
        rrcc.data?.code ||
        (
          rrcc.status === 404

            ? "SIN_DATOS"

            : "RRCC_ERROR"
        );


      await registrarConsumo({

        idCliente:
          cliente.idCliente,

        idToken:
          cliente.idToken,

        idMovimiento:
          reserva.idMovimiento,

        tipoDocumento:
          datosConsulta
            .tipoDocumento,

        documento:
          datosConsulta
            .documento,

        servicio:
          "RRCC",

        creditosConsumidos:
          1,

        estado,

        httpStatus:
          rrcc.status,

        mensaje,

        ipOrigen:
          req.ip,

        duracionMs,
      });


      consumoRegistrado =
        true;


      return res
        .status(
          rrcc.status ||
          500
        )
        .json({

          success:
            false,

          error:
            mensaje,

          code:
            codigo,

          data:
            rrcc.data,
        });


    } catch (error) {

      const duracionMs =
        Date.now() -
        inicio;


      console.error(
        "Error realizando consulta:",
        error
      );


      // ==============================================
      // ERROR DESPUÉS DE RESERVAR
      //
      // Se registra como ERROR.
      // NO se devuelve el crédito.
      // ==============================================

      if (
        reserva &&
        datosConsulta &&
        !consumoRegistrado
      ) {

        try {

          await registrarConsumo({

            idCliente:
              cliente.idCliente,

            idToken:
              cliente.idToken,

            idMovimiento:
              reserva.idMovimiento,

            tipoDocumento:
              datosConsulta
                .tipoDocumento,

            documento:
              datosConsulta
                .documento,
            
            servicio:
              "RRCC",

            creditosConsumidos:
              1,

            estado:
              "ERROR",

            httpStatus:
              error.statusCode ||
              500,

            mensaje:
              error.message ||
              "Error procesando la consulta.",

            ipOrigen:
              req.ip,

            duracionMs,
          });


          consumoRegistrado =
            true;


        } catch (
          errorRegistro
        ) {

          console.error(
            "ERROR registrando consumo:",
            errorRegistro
          );
        }
      }


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
// CONSULTAR SUELDOS
// ==================================================

router.post(
  "/sueldos",

  // ------------------------------------------------
  // SEGURIDAD
  //
  // Todo ocurre antes de reservar crédito.
  // ------------------------------------------------

  clienteIpLimiter,

  clientTokenAuth,

  consultaTokenLimiter,

  limitarConsultasConcurrentes,


  async (
    req,
    res
  ) => {

    const inicio =
      Date.now();


    const cliente =
      req.clienteApi;


    let datosConsulta =
      null;


    let reserva =
      null;


    let consumoRegistrado =
      false;


    try {

      // ==============================================
      // 1. VALIDAR DOCUMENTO
      //
      // Reutilizamos exactamente las reglas de RRCC.
      //
      // Documento inválido:
      // NO consume crédito.
      // ==============================================

      datosConsulta =
        validarDocumento(
          req.body?.tipoDocumento,
          req.body?.documento
        );


      // 2. RESERVAR 1 CRÉDITO DE LA BOLSA SUELDOS

      reserva =
        await reservarCredito({

          idCliente:
            cliente.idCliente,

          idToken:
            cliente.idToken,

          servicio:
            "SUELDOS",
        });


      // ==============================================
      // 3. CONSULTAR OPERADOR.SUELDOS
      //
      // Desde este punto el crédito ya fue consumido.
      // ==============================================

      const sueldos =
        await consultarSueldos({

          tipoDocumento:
            datosConsulta.tipoDocumento,

          documento:
            datosConsulta.documento,
        });


      const duracionMs =
        Date.now() -
        inicio;


      // ==============================================
      // 4. CONSULTA EXITOSA
      // ==============================================

      if (
        sueldos.ok
      ) {

        await registrarConsumo({

          idCliente:
            cliente.idCliente,

          idToken:
            cliente.idToken,

          idMovimiento:
            reserva.idMovimiento,

          tipoDocumento:
            datosConsulta.tipoDocumento,

          documento:
            datosConsulta.documento,

          servicio:
            "SUELDOS",

          creditosConsumidos:
            1,

          estado:
            "EXITOSA",

          httpStatus:
            sueldos.status || 200,

          mensaje:
            "Consulta de sueldos procesada correctamente.",

          ipOrigen:
            req.ip,

          duracionMs,
        });


        consumoRegistrado =
          true;


        return res
          .status(
            sueldos.status || 200
          )
          .json({

            success:
              true,

            data:
              sueldos.data,
          });
      }


      // ==============================================
      // 5. SIN DATOS / ERROR
      //
      // También consume crédito porque la consulta
      // ya fue ejecutada.
      // ==============================================

      const estado =
        sueldos.status === 404

          ? "SIN_DATOS"

          : "ERROR";


      const mensaje =
        sueldos.data?.error ||
        sueldos.data?.message ||
        sueldos.data?.mensaje ||
        (
          sueldos.status === 404

            ? "No se encontró información de sueldos para el documento consultado."

            : "La consulta de sueldos fue procesada con error."
        );


      const codigo =
        sueldos.data?.code ||
        (
          sueldos.status === 404

            ? "SUELDOS_SIN_DATOS"

            : "SUELDOS_ERROR"
        );


      await registrarConsumo({

        idCliente:
          cliente.idCliente,

        idToken:
          cliente.idToken,

        idMovimiento:
          reserva.idMovimiento,

        tipoDocumento:
          datosConsulta.tipoDocumento,

        documento:
          datosConsulta.documento,

        servicio:
          "SUELDOS",

        creditosConsumidos:
          1,

        estado,

        httpStatus:
          sueldos.status,

        mensaje,

        ipOrigen:
          req.ip,

        duracionMs,
      });


      consumoRegistrado =
        true;


      return res
        .status(
          sueldos.status || 500
        )
        .json({

          success:
            false,

          error:
            mensaje,

          code:
            codigo,

          data:
            sueldos.data,
        });


    } catch (error) {

      const duracionMs =
        Date.now() -
        inicio;


      console.error(
        "Error realizando consulta de sueldos:",
        error
      );


      // ==============================================
      // ERROR DESPUÉS DE RESERVAR
      //
      // No se devuelve el crédito.
      // ==============================================

      if (
        reserva &&
        datosConsulta &&
        !consumoRegistrado
      ) {

        try {

          await registrarConsumo({

            idCliente:
              cliente.idCliente,

            idToken:
              cliente.idToken,

            idMovimiento:
              reserva.idMovimiento,

            tipoDocumento:
              datosConsulta.tipoDocumento,

            documento:
              datosConsulta.documento,

            servicio:
              "SUELDOS",

            creditosConsumidos:
              1,

            estado:
              "ERROR",

            httpStatus:
              error.statusCode || 500,

            mensaje:
              error.message ||
              "Error procesando la consulta de sueldos.",

            ipOrigen:
              req.ip,

            duracionMs,
          });


          consumoRegistrado =
            true;


        } catch (
          errorRegistro
        ) {

          console.error(
            "ERROR registrando consumo de sueldos:",
            errorRegistro
          );
        }
      }


      return res
        .status(
          error.statusCode || 500
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