import rateLimit from "express-rate-limit";


// ==================================================
// RESPUESTA 429 UNIFORME
// ==================================================

function responderRateLimit(
  req,
  res
) {

  return res
    .status(429)
    .json({
      success: false,

      error:
        "Demasiadas solicitudes. Intente nuevamente en unos momentos.",

      code:
        "RATE_LIMITED",
    });
}


// ==================================================
// LÍMITE GENERAL POR IP
//
// Protege principalmente contra:
// - bots sin token
// - tokens inválidos
// - ataques masivos al endpoint
//
// Máximo:
// 120 solicitudes / minuto / IP
// ==================================================

export const clienteIpLimiter =
  rateLimit({

    windowMs:
      60 * 1000,

    limit:
      120,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    handler:
      responderRateLimit,
  });


// ==================================================
// LÍMITE PARA CONSULTAR CUENTA
//
// Requiere token válido.
//
// Máximo:
// 60 solicitudes / minuto / token
//
// GET /api/cliente/cuenta
//
// Este endpoint NO consume créditos.
// ==================================================

export const cuentaTokenLimiter =
  rateLimit({

    windowMs:
      60 * 1000,

    limit:
      60,

    standardHeaders:
      true,

    legacyHeaders:
      false,


    keyGenerator:
      (req) => {

        const idToken =
          req.clienteApi?.idToken;


        return `cuenta-token:${idToken}`;
      },


    handler(
      req,
      res
    ) {

      return res
        .status(429)
        .json({

          success: false,

          error:
            "Se alcanzó el límite de consultas de cuenta para este token.",

          code:
            "TOKEN_RATE_LIMITED",
        });
    },
  });


// ==================================================
// LÍMITE DE CONSULTAS RRCC POR TOKEN
//
// Cada token tiene su propio contador.
//
// Máximo:
// 20 consultas / minuto / token
//
// POST /api/cliente/consulta
//
// Si supera el límite:
// HTTP 429
//
// IMPORTANTE:
// El bloqueo ocurre ANTES de reservar crédito.
// Por lo tanto NO consume créditos.
// ==================================================

export const consultaTokenLimiter =
  rateLimit({

    windowMs:
      60 * 1000,

    limit:
      20,

    standardHeaders:
      true,

    legacyHeaders:
      false,


    keyGenerator:
      (req) => {

        const idToken =
          req.clienteApi?.idToken;


        return `consulta-token:${idToken}`;
      },


    handler(
      req,
      res
    ) {

      return res
        .status(429)
        .json({

          success: false,

          error:
            "Se alcanzó el límite de consultas permitido para este token. Intente nuevamente en unos momentos.",

          code:
            "TOKEN_RATE_LIMITED",
        });
    },
  });


// ==================================================
// CONSULTAS SIMULTÁNEAS POR TOKEN
//
// Máximo:
// 3 consultas procesándose al mismo tiempo.
//
// Ejemplo:
//
// Consulta 1 -> entra
// Consulta 2 -> entra
// Consulta 3 -> entra
// Consulta 4 -> 429
//
// IMPORTANTE:
// Esto ocurre ANTES de reservar crédito.
// Una consulta bloqueada NO consume crédito.
//
// NOTA:
// Este control funciona en memoria dentro de esta
// instancia de Node.
//
// Si en el futuro existen varias instancias del
// backend, este contador deberá centralizarse,
// por ejemplo con Redis.
// ==================================================

const consultasActivas =
  new Map();


const MAX_CONCURRENTES_POR_TOKEN =
  3;


// ==================================================
// MIDDLEWARE DE CONCURRENCIA
// ==================================================

export function limitarConsultasConcurrentes(
  req,
  res,
  next
) {

  const idToken =
    String(
      req.clienteApi?.idToken ||
      ""
    );


  // ------------------------------------------------
  // SEGURIDAD ADICIONAL
  // ------------------------------------------------

  if (!idToken) {

    return res
      .status(401)
      .json({

        success: false,

        error:
          "Token de acceso requerido.",

        code:
          "TOKEN_REQUIRED",
      });
  }


  // ------------------------------------------------
  // CONSULTAS ACTUALMENTE PROCESÁNDOSE
  // ------------------------------------------------

  const actuales =
    consultasActivas.get(
      idToken
    ) || 0;


  // ------------------------------------------------
  // SUPERÓ EL MÁXIMO
  // ------------------------------------------------

  if (
    actuales >=
    MAX_CONCURRENTES_POR_TOKEN
  ) {

    return res
      .status(429)
      .json({

        success: false,

        error:
          "El token alcanzó el máximo de consultas simultáneas permitidas.",

        code:
          "TOKEN_CONCURRENCY_LIMITED",
      });
  }


  // ------------------------------------------------
  // REGISTRAR CONSULTA ACTIVA
  // ------------------------------------------------

  consultasActivas.set(
    idToken,
    actuales + 1
  );


  let liberado =
    false;


  // ------------------------------------------------
  // LIBERAR SLOT
  // ------------------------------------------------

  function liberar() {

    if (liberado) {

      return;
    }


    liberado =
      true;


    const cantidad =
      consultasActivas.get(
        idToken
      ) || 0;


    if (
      cantidad <= 1
    ) {

      consultasActivas.delete(
        idToken
      );

    } else {

      consultasActivas.set(
        idToken,
        cantidad - 1
      );
    }
  }


  /*
    finish:
    La respuesta terminó correctamente.

    close:
    El cliente cerró la conexión.

    Escuchamos ambos eventos para evitar
    dejar consultas marcadas como activas.
  */

  res.once(
    "finish",
    liberar
  );


  res.once(
    "close",
    liberar
  );


  return next();
}