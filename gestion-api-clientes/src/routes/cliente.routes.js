import {
  Router,
} from "express";


import {
  clientTokenAuth,
} from "../middleware/clientToken.js";


import {
  clientBasicAuth,
} from "../middleware/clientBasicAuth.js";


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


import {
  reservarCredito,
} from "../services/creditos.service.js";


import {
  registrarConsumo,
} from "../services/consumos.service.js";


import {
  consultarSueldos,
} from "../services/sueldos.service.js";


import {
  consultarFallecidos,
} from "../services/fallecidos.service.js";


import {
  consultarTelefonos,
} from "../services/telefonos.service.js";



const router =
  Router();



// ==================================================
// UTILIDADES
// ==================================================

/**
 * POST:
 * {
 *   "tipoDocumento": "DNI",
 *   "documento": "16680268"
 * }
 *
 * GET:
 * ?tipoDocumento=DNI&documento=16680268
 */
function obtenerDatosEntrada(
  req
) {

  if (
    req.method === "GET"
  ) {

    return {

      tipoDocumento:
        req.query?.tipoDocumento,

      documento:
        req.query?.documento,

    };
  }


  return {

    tipoDocumento:
      req.body?.tipoDocumento,

    documento:
      req.body?.documento,

  };
}



/**
 * Evita que navegador, proxy o Cloudflare
 * almacenen respuestas de consultas.
 */
function aplicarNoCache(
  res
) {

  res.set({

    "Cache-Control":
      "no-store, no-cache, must-revalidate, private",

    Pragma:
      "no-cache",

    Expires:
      "0",

    "Surrogate-Control":
      "no-store",

  });
}



// ==================================================
// CONSULTAR CUENTA / SALDOS
//
// Esta ruta continúa utilizando Bearer Token.
// Es utilizada por el portal.
// ==================================================

router.get(

  "/cuenta",

  clienteIpLimiter,

  clientTokenAuth,

  cuentaTokenLimiter,


  async (
    req,
    res
  ) => {

    aplicarNoCache(
      res
    );


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


          // ==========================================
          // TOTAL GENERAL
          // ==========================================

          creditos: {

            disponibles:
              cliente.creditosDisponibles,

            totalAsignado:
              cliente.totalAsignado,

            totalConsumido:
              cliente.totalConsumido,

          },


          // ==========================================
          // SALDOS POR SERVICIO
          // ==========================================

          creditosPorServicio:
            cliente.creditosPorServicio,

        },

      });
  }

);



// ==================================================
// PROCESAR CONSULTA RRCC
//
// Esta función es compartida por:
//
// POST -> Portal
// GET  -> API comercial
// ==================================================

async function procesarConsultaRRCC(
  req,
  res
) {

  aplicarNoCache(
    res
  );


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
    // 1. OBTENER DATOS
    //
    // GET  -> req.query
    // POST -> req.body
    // ==============================================

    const entrada =
      obtenerDatosEntrada(
        req
      );


    // ==============================================
    // 2. VALIDAR DOCUMENTO
    //
    // Documento inválido:
    // NO consume crédito.
    // NO llama RRCC.
    // ==============================================

    datosConsulta =
      validarDocumento(
        entrada.tipoDocumento,
        entrada.documento
      );


    // ==============================================
    // 3. RESERVAR 1 CRÉDITO RRCC
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
    // 4. CONSULTAR RRCC
    //
    // Desde este punto el crédito
    // ya fue consumido.
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
    // 5. CONSULTA EXITOSA
    // ==============================================

    if (
      rrcc.ok
    ) {

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
          rrcc.status ||
          200,

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
    // 6. SIN DATOS / ERROR RRCC
    //
    // La consulta ya fue ejecutada.
    // Por lo tanto consume crédito.
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

      });


  } catch (
    error
  ) {

    const duracionMs =
      Date.now() -
      inicio;


    console.error(
      "Error realizando consulta RRCC:",
      error
    );


    // ==============================================
    // ERROR DESPUÉS DE RESERVAR
    //
    // Si el crédito ya fue reservado,
    // NO se devuelve.
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
          "ERROR registrando consumo RRCC:",
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



// ==================================================
// RRCC - POST
//
// PORTAL WEB
//
// Autenticación:
// Authorization: Bearer <token>
//
// Datos:
// BODY JSON
// ==================================================

router.post(

  "/consulta",

  clienteIpLimiter,

  clientTokenAuth,

  consultaTokenLimiter,

  limitarConsultasConcurrentes,

  procesarConsultaRRCC

);



// ==================================================
// RRCC - GET
//
// API COMERCIAL
//
// Autenticación:
// Authorization: Basic <credencial>
//
// Ejemplo:
//
// GET
// /api/cliente/consulta
// ?tipoDocumento=DNI
// &documento=16680268
// ==================================================

router.get(

  "/consulta",

  clienteIpLimiter,

  clientBasicAuth,

  consultaTokenLimiter,

  limitarConsultasConcurrentes,

  procesarConsultaRRCC

);



// ==================================================
// PROCESAR CONSULTA SUELDOS
//
// Esta función es compartida por:
//
// POST -> Portal
// GET  -> API comercial
// ==================================================

async function procesarConsultaSueldos(
  req,
  res
) {

  aplicarNoCache(
    res
  );


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
    // 1. OBTENER DATOS
    //
    // GET  -> req.query
    // POST -> req.body
    // ==============================================

    const entrada =
      obtenerDatosEntrada(
        req
      );


    // ==============================================
    // 2. VALIDAR DOCUMENTO
    //
    // Documento inválido:
    // NO consume crédito.
    // ==============================================

    datosConsulta =
      validarDocumento(
        entrada.tipoDocumento,
        entrada.documento
      );


    // ==============================================
    // 3. RESERVAR 1 CRÉDITO SUELDOS
    // ==============================================

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
    // 4. CONSULTAR SUELDOS
    //
    // Desde este punto el crédito
    // ya fue consumido.
    // ==============================================

    const sueldos =
      await consultarSueldos({

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
    // 5. CONSULTA EXITOSA
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
          datosConsulta
            .tipoDocumento,

        documento:
          datosConsulta
            .documento,

        servicio:
          "SUELDOS",

        creditosConsumidos:
          1,

        estado:
          "EXITOSA",

        httpStatus:
          sueldos.status ||
          200,

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
          sueldos.status ||
          200
        )
        .json({

          success:
            true,

          data:
            sueldos.data,

        });
    }


    // ==============================================
    // 6. SIN DATOS / ERROR
    //
    // La consulta ya fue ejecutada.
    // Por lo tanto consume crédito.
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
        datosConsulta
          .tipoDocumento,

      documento:
        datosConsulta
          .documento,

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
        sueldos.status ||
        500
      )
      .json({

        success:
          false,

        error:
          mensaje,

        code:
          codigo,

      });


  } catch (
    error
  ) {

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
    // Si ya se reservó crédito,
    // NO se devuelve.
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
            "SUELDOS",

          creditosConsumidos:
            1,

          estado:
            "ERROR",

          httpStatus:
            error.statusCode ||
            500,

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



// ==================================================
// SUELDOS - POST
//
// PORTAL WEB
//
// Autenticación:
// Authorization: Bearer <token>
//
// Datos:
// BODY JSON
// ==================================================

router.post(

  "/sueldos",

  clienteIpLimiter,

  clientTokenAuth,

  consultaTokenLimiter,

  limitarConsultasConcurrentes,

  procesarConsultaSueldos

);



// ==================================================
// SUELDOS - GET
//
// API COMERCIAL
//
// Autenticación:
// Authorization: Basic <credencial>
//
// Ejemplo:
//
// GET
// /api/cliente/sueldos
// ?tipoDocumento=DNI
// &documento=16680268
// ==================================================

router.get(

  "/sueldos",

  clienteIpLimiter,

  clientBasicAuth,

  consultaTokenLimiter,

  limitarConsultasConcurrentes,

  procesarConsultaSueldos

);



// ==================================================
// PROCESAR CONSULTA FALLECIDOS
//
// Esta función es compartida por:
//
// POST -> Portal
// GET  -> API comercial
// ==================================================

async function procesarConsultaFallecidos(
  req,
  res
) {

  aplicarNoCache(
    res
  );


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
    // 1. OBTENER DATOS
    // ==============================================

    const entrada =
      obtenerDatosEntrada(
        req
      );


    // ==============================================
    // 2. VALIDAR DOCUMENTO
    // ==============================================

    datosConsulta =
      validarDocumento(
        entrada.tipoDocumento,
        entrada.documento
      );


    // ==============================================
    // 3. RESERVAR 1 CRÉDITO FALLECIDOS
    // ==============================================

    reserva =
      await reservarCredito({

        idCliente:
          cliente.idCliente,

        idToken:
          cliente.idToken,

        servicio:
          "FALLECIDOS",

      });


    // ==============================================
    // 4. CONSULTAR FALLECIDOS
    // ==============================================

    const fallecidos =
      await consultarFallecidos({

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
    // 5. CONSULTA EXITOSA
    // ==============================================

    if (
      fallecidos.ok
    ) {

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
          "FALLECIDOS",

        creditosConsumidos:
          1,

        estado:
          "EXITOSA",

        httpStatus:
          fallecidos.status ||
          200,

        mensaje:
          "Consulta de fallecidos procesada correctamente.",

        ipOrigen:
          req.ip,

        duracionMs,

      });


      consumoRegistrado =
        true;


      return res
        .status(
          fallecidos.status ||
          200
        )
        .json({

          success:
            true,

          data:
            fallecidos.data,

        });
    }


    // ==============================================
    // 6. SIN DATOS / ERROR
    // ==============================================

    const estado =
      fallecidos.status === 404

        ? "SIN_DATOS"

        : "ERROR";


    const mensaje =
      fallecidos.data?.error ||
      fallecidos.data?.message ||
      fallecidos.data?.mensaje ||
      (
        fallecidos.status === 404

          ? "No se encontró información de fallecimiento para el documento consultado."

          : "La consulta de fallecidos fue procesada con error."
      );


    const codigo =
      fallecidos.data?.code ||
      (
        fallecidos.status === 404

          ? "FALLECIDOS_SIN_DATOS"

          : "FALLECIDOS_ERROR"
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
        "FALLECIDOS",

      creditosConsumidos:
        1,

      estado,

      httpStatus:
        fallecidos.status,

      mensaje,

      ipOrigen:
        req.ip,

      duracionMs,

    });


    consumoRegistrado =
      true;


    return res
      .status(
        fallecidos.status ||
        500
      )
      .json({

        success:
          false,

        error:
          mensaje,

        code:
          codigo,

      });


  } catch (
    error
  ) {

    const duracionMs =
      Date.now() -
      inicio;


    console.error(
      "Error realizando consulta de fallecidos:",
      error
    );


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
            "FALLECIDOS",

          creditosConsumidos:
            1,

          estado:
            "ERROR",

          httpStatus:
            error.statusCode ||
            500,

          mensaje:
            error.message ||
            "Error procesando la consulta de fallecidos.",

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
          "ERROR registrando consumo de fallecidos:",
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



// ==================================================
// FALLECIDOS - POST
//
// PORTAL WEB
//
// Autenticación:
// Authorization: Bearer <token>
//
// Datos:
// BODY JSON
// ==================================================

router.post(
  "/fallecidos",

  clienteIpLimiter,

  clientTokenAuth,

  consultaTokenLimiter,

  limitarConsultasConcurrentes,

  procesarConsultaFallecidos
);



// ==================================================
// FALLECIDOS - GET
//
// API COMERCIAL
//
// Autenticación:
// Authorization: Basic <credencial>
//
// Ejemplo:
//
// GET
// /api/cliente/fallecidos
// ?tipoDocumento=DNI
// &documento=08526314
// ==================================================

router.get(
  "/fallecidos",

  clienteIpLimiter,

  clientBasicAuth,

  consultaTokenLimiter,

  limitarConsultasConcurrentes,

  procesarConsultaFallecidos
);



// ==================================================
// PROCESAR CONSULTA TELÉFONOS
//
// Esta función es compartida por:
//
// POST -> Portal
// GET  -> API comercial
// ==================================================

async function procesarConsultaTelefonos(
  req,
  res
) {

  aplicarNoCache(
    res
  );


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
    // 1. OBTENER DATOS
    // ==============================================

    const entrada =
      obtenerDatosEntrada(
        req
      );


    // ==============================================
    // 2. VALIDAR DOCUMENTO
    // ==============================================

    datosConsulta =
      validarDocumento(
        entrada.tipoDocumento,
        entrada.documento
      );


    // ==============================================
    // 3. RESERVAR 1 CRÉDITO TELÉFONOS
    // ==============================================

    reserva =
      await reservarCredito({

        idCliente:
          cliente.idCliente,

        idToken:
          cliente.idToken,

        servicio:
          "TELEFONOS",

      });


    // ==============================================
    // 4. CONSULTAR TELÉFONOS
    // ==============================================

    const telefonos =
      await consultarTelefonos({

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
    // 5. CONSULTA EXITOSA
    // ==============================================

    if (
      telefonos.ok
    ) {

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
          "TELEFONOS",

        creditosConsumidos:
          1,

        estado:
          "EXITOSA",

        httpStatus:
          telefonos.status ||
          200,

        mensaje:
          "Consulta de teléfonos procesada correctamente.",

        ipOrigen:
          req.ip,

        duracionMs,

      });


      consumoRegistrado =
        true;


      return res
        .status(
          telefonos.status ||
          200
        )
        .json({

          success:
            true,

          data:
            telefonos.data,

        });
    }


    // ==============================================
    // 6. SIN DATOS / ERROR
    // ==============================================

    const estado =
      telefonos.status === 404

        ? "SIN_DATOS"

        : "ERROR";


    const mensaje =
      telefonos.data?.error ||
      telefonos.data?.message ||
      telefonos.data?.mensaje ||
      telefonos.error ||
      (
        telefonos.status === 404

          ? "No se encontró información de teléfonos para el documento consultado."

          : "La consulta de teléfonos fue procesada con error."
      );


    const codigo =
      telefonos.data?.code ||
      telefonos.code ||
      (
        telefonos.status === 404

          ? "TELEFONOS_SIN_DATOS"

          : "TELEFONOS_ERROR"
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
        "TELEFONOS",

      creditosConsumidos:
        1,

      estado,

      httpStatus:
        telefonos.status,

      mensaje,

      ipOrigen:
        req.ip,

      duracionMs,

    });


    consumoRegistrado =
      true;


    return res
      .status(
        telefonos.status ||
        500
      )
      .json({

        success:
          false,

        error:
          mensaje,

        code:
          codigo,

      });


  } catch (
    error
  ) {

    const duracionMs =
      Date.now() -
      inicio;


    console.error(
      "Error realizando consulta de teléfonos:",
      error
    );


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
            "TELEFONOS",

          creditosConsumidos:
            1,

          estado:
            "ERROR",

          httpStatus:
            error.statusCode ||
            500,

          mensaje:
            error.message ||
            "Error procesando la consulta de teléfonos.",

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
          "ERROR registrando consumo de teléfonos:",
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



// ==================================================
// TELÉFONOS - POST
//
// PORTAL WEB
//
// Autenticación:
// Authorization: Bearer <token>
//
// Datos:
// BODY JSON
// ==================================================

router.post(
  "/telefonos",

  clienteIpLimiter,

  clientTokenAuth,

  consultaTokenLimiter,

  limitarConsultasConcurrentes,

  procesarConsultaTelefonos
);



// ==================================================
// TELÉFONOS - GET
//
// API COMERCIAL
//
// Autenticación:
// Authorization: Basic <credencial>
//
// Ejemplo:
//
// GET
// /api/cliente/telefonos
// ?tipoDocumento=DNI
// &documento=25485119
// ==================================================

router.get(
  "/telefonos",

  clienteIpLimiter,

  clientBasicAuth,

  consultaTokenLimiter,

  limitarConsultasConcurrentes,

  procesarConsultaTelefonos
);



export default router;