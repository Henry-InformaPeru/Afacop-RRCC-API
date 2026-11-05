import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient } from "../config/redis.js";


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
// FABRICADOR DE REDIS STORE
//
// Si Redis no está disponible o falla, express-rate-limit
// continuará operando gracias a passOnStoreError: true.
// ==================================================

function crearRedisStore(prefix) {
  try {
    const redis = getRedisClient();

    return new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: `gestion-api:rl:${prefix}:`,
    });
  } catch (error) {
    console.warn(
      `[RATE LIMIT] No se pudo inicializar RedisStore para ${prefix}, usando memoria.`,
      error.message
    );
    return undefined;
  }
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

    store:
      crearRedisStore("ip"),

    passOnStoreError:
      true,

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

    store:
      crearRedisStore("cuenta"),

    passOnStoreError:
      true,

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

    store:
      crearRedisStore("consulta"),

    passOnStoreError:
      true,

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
// Control distribuido mediante Redis (INCR / DECR).
// Si Redis no está disponible, realiza fallback
// automático a Map en memoria de Node.js.
// ==================================================

const consultasActivas =
  new Map();

const MAX_CONCURRENTES_POR_TOKEN =
  3;


// ==================================================
// MIDDLEWARE DE CONCURRENCIA
// ==================================================

export async function limitarConsultasConcurrentes(
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
  // GESTIÓN CON REDIS
  // ------------------------------------------------

  try {
    const redis = getRedisClient();
    const redisKey = `gestion-api:concurrencia:token:${idToken}`;

    const actuales =
      await redis.incr(redisKey);

    // Si es la primera consulta activa, establecer TTL de seguridad (60 seg)
    // para evitar bloqueos permanentes en caso de caída inesperada.
    if (actuales === 1) {
      await redis.expire(redisKey, 60);
    }

    if (actuales > MAX_CONCURRENTES_POR_TOKEN) {
      await redis.decr(redisKey);

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

    let liberado = false;

    async function liberarRedis() {
      if (liberado) return;
      liberado = true;

      try {
        const val = await redis.decr(redisKey);
        if (val <= 0) {
          await redis.del(redisKey);
        }
      } catch (err) {
        console.warn(
          "[REDIS CONCURRENCY] Error liberando slot:",
          err.message
        );
      }
    }

    res.once("finish", liberarRedis);
    res.once("close", liberarRedis);

    return next();

  } catch (errorRedis) {

    // ------------------------------------------------
    // FALLBACK A MEMORIA LOCAL SI REDIS NO RESPONDE
    // ------------------------------------------------

    console.warn(
      "[REDIS CONCURRENCY] Usando fallback a memoria:",
      errorRedis.message
    );

    const actuales =
      consultasActivas.get(
        idToken
      ) || 0;

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

    consultasActivas.set(
      idToken,
      actuales + 1
    );

    let liberadoMemoria =
      false;

    function liberarMemoria() {

      if (liberadoMemoria) {
        return;
      }

      liberadoMemoria =
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

    res.once(
      "finish",
      liberarMemoria
    );

    res.once(
      "close",
      liberarMemoria
    );

    return next();
  }
}
