import {
  Router,
} from "express";

import {
  clientTokenAuth,
} from "../middleware/clientToken.js";

import {
  consultarRRCC,
  validarDocumento,
} from "../services/consulta.service.js";

import {
  reservarCredito,
} from "../services/creditos.service.js";

import {
  registrarConsumo,
} from "../services/consumos.service.js";


const router =
  Router();


// --------------------------------------------------
// CONSULTAR CUENTA / SALDO
// --------------------------------------------------

router.get(
  "/cuenta",
  clientTokenAuth,
  async (req, res) => {

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

        success: true,

        data: {

          idCliente:
            cliente.idCliente,

          nombre,

          tipoDocumento:
            cliente
              .tipoDocumentoCliente,

          documento:
            cliente
              .documentoCliente,

          creditos: {

            disponibles:
              cliente
                .creditosDisponibles,

            totalAsignado:
              cliente
                .totalAsignado,

            totalConsumido:
              cliente
                .totalConsumido,
          },
        },
      });
  }
);


// --------------------------------------------------
// REALIZAR CONSULTA
// --------------------------------------------------

router.post(
  "/consulta",
  clientTokenAuth,
  async (req, res) => {

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
      // Si el documento es inválido:
      // - no se reserva crédito
      // - no se llama a RRCC
      // - no se consume crédito
      // ==============================================

      datosConsulta =
        validarDocumento(
          req.body?.tipoDocumento,
          req.body?.documento
        );


      // ==============================================
      // 2. RESERVAR / DESCONTAR 1 CRÉDITO
      //
      // Si no tiene créditos disponibles,
      // reservarCredito debe lanzar el error
      // correspondiente y NO se llama a RRCC.
      //
      // Desde que esta operación termina
      // correctamente, el crédito se considera
      // consumido.
      //
      // NO HAY REVERSIÓN.
      // ==============================================

      reserva =
        await reservarCredito({

          idCliente:
            cliente.idCliente,

          idToken:
            cliente.idToken,
        });


      // ==============================================
      // 3. CONSULTAR RRCC
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

            success: true,

            data:
              rrcc.data?.data ??
              rrcc.data,
          });
      }


      // ==============================================
      // 5. RRCC RESPONDIÓ SIN RESULTADO
      //    O DEVOLVIÓ ALGÚN ERROR HTTP
      //
      // También consume 1 crédito.
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

        // --------------------------------------------
        // SIN DATOS / ERROR TAMBIÉN CONSUME 1
        // --------------------------------------------

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

          success: false,

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
      // 6. ERROR DESPUÉS DE HABER RESERVADO CRÉDITO
      //
      // Ejemplos:
      // - timeout de RRCC
      // - conexión caída
      // - respuesta inválida
      // - error técnico
      //
      // Como ya se inició una consulta válida,
      // también consume 1 crédito.
      //
      // NO SE REVIERTE.
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


      // ==============================================
      // 7. RESPUESTA DEL ERROR
      // ==============================================

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


export default router;