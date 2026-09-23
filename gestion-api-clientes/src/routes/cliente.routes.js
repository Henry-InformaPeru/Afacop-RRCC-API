import {Router,} from "express";

import {clientTokenAuth,} from "../middleware/clientToken.js";

import {consultarRRCC, validarDocumento,} from "../services/consulta.service.js";

import {reservarCredito, revertirCredito,} from "../services/creditos.service.js";

import {registrarConsumo,} from "../services/consumos.service.js";


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

    let reserva =
      null;

    let creditoRevertido =
      false;

    try {

      // ----------------------------------------------
      // 1. VALIDAR DOCUMENTO
      // ----------------------------------------------

      const datosConsulta =
        validarDocumento(
          req.body?.tipoDocumento,
          req.body?.documento
        );


      // ----------------------------------------------
      // 2. RESERVAR 1 CRÉDITO
      // ----------------------------------------------

      reserva =
        await reservarCredito({
          idCliente:
            cliente.idCliente,

          idToken:
            cliente.idToken,
        });


      // ----------------------------------------------
      // 3. CONSULTAR RRCC
      // ----------------------------------------------

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
        Date.now() - inicio;


      // ----------------------------------------------
      // 4. CONSULTA EXITOSA
      // ----------------------------------------------

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


        return res
            .status(200)
            .json({
                success: true,

                data:
                rrcc.data?.data ??
                rrcc.data,
            });
        }


      // ----------------------------------------------
      // 5. RRCC NO DEVOLVIÓ RESULTADO EXITOSO
      // ----------------------------------------------

      const reversion =
        await revertirCredito({
        idCliente:
            cliente.idCliente,

        idMovimientoOriginal:
            reserva.idMovimiento,
        });

        creditoRevertido =
        true;


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
          0,

        estado:
          rrcc.status === 404
            ? "SIN_DATOS"
            : "ERROR",

        httpStatus:
          rrcc.status,

        mensaje:
          rrcc.data?.error ||
          "Consulta no procesada.",

        ipOrigen:
          req.ip,

        duracionMs,
      });


      return res
        .status(rrcc.status)
        .json({
            success: false,

            data:
            rrcc.data,
        });


    } catch (error) {

      // ----------------------------------------------
      // SI YA SE RESERVÓ Y AÚN NO SE REVERTIÓ,
      // DEVOLVER EL CRÉDITO
      // ----------------------------------------------

      if (
        reserva &&
        !creditoRevertido
      ) {

        try {

          await revertirCredito({
            idCliente:
              cliente.idCliente,

            idMovimientoOriginal:
              reserva.idMovimiento,
          });

          creditoRevertido =
            true;

        } catch (
          errorReversion
        ) {

          console.error(
            "ERROR CRÍTICO revirtiendo crédito:",
            errorReversion
          );
        }
      }


      console.error(
        "Error realizando consulta:",
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


export default router;