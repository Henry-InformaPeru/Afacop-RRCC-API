import {
  getRedisClient,
  REDIS_CACHE_TTL_SECONDS,
} from "../config/redis.js";

// ==================================================
// PREFIJO GENERAL DE CACHÉ
// ==================================================

const PREFIX_CACHE = "gestion-api:cache";

// ==================================================
// GENERAR CLAVE ÚNICA DE CACHÉ
// ==================================================

export function generarClaveCache(
  servicio,
  tipoDocumento,
  documento
) {
  const s = String(servicio || "")
    .trim()
    .toUpperCase();

  const td = String(tipoDocumento || "")
    .trim()
    .toUpperCase();

  const doc = String(documento || "")
    .trim();

  return `${PREFIX_CACHE}:${s}:${td}:${doc}`;
}

// ==================================================
// OBTENER CONSULTA DESDE CACHÉ
// ==================================================

export async function getCachedConsulta(
  servicio,
  tipoDocumento,
  documento
) {
  try {
    const redis = getRedisClient();
    const key = generarClaveCache(
      servicio,
      tipoDocumento,
      documento
    );

    const data = await redis.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data);
  } catch (error) {
    // Falla controlada: si Redis no responde, registramos advertencia
    // y continuamos directo a SQL Server sin interrumpir el servicio.
    console.warn(
      `[CACHE ERROR] Error leyendo caché para ${servicio} (${tipoDocumento} ${documento}):`,
      error.message
    );
    return null;
  }
}

// ==================================================
// GUARDAR CONSULTA EN CACHÉ (15 DÍAS POR DEFECTO)
// ==================================================

export async function setCachedConsulta(
  servicio,
  tipoDocumento,
  documento,
  data,
  ttlSeconds = REDIS_CACHE_TTL_SECONDS
) {
  try {
    if (!data) {
      return false;
    }

    const redis = getRedisClient();
    const key = generarClaveCache(
      servicio,
      tipoDocumento,
      documento
    );

    const serialized = JSON.stringify(data);

    // EX: tiempo de expiración en segundos (15 días por defecto)
    await redis.set(
      key,
      serialized,
      "EX",
      ttlSeconds
    );

    return true;
  } catch (error) {
    console.warn(
      `[CACHE ERROR] Error guardando en caché para ${servicio} (${tipoDocumento} ${documento}):`,
      error.message
    );
    return false;
  }
}

// ==================================================
// ELIMINAR CONSULTA ESPECÍFICA DE CACHÉ
// ==================================================

export async function deleteCachedConsulta(
  servicio,
  tipoDocumento,
  documento
) {
  try {
    const redis = getRedisClient();
    const key = generarClaveCache(
      servicio,
      tipoDocumento,
      documento
    );

    await redis.del(key);
    return true;
  } catch (error) {
    console.warn(
      `[CACHE ERROR] Error eliminando clave ${servicio}:`,
      error.message
    );
    return false;
  }
}

// ==================================================
// LIMPIAR CACHÉ DE UN SERVICIO COMPLETO
// ==================================================

export async function limpiarCacheServicio(
  servicio
) {
  try {
    const redis = getRedisClient();
    const patron = `${PREFIX_CACHE}:${String(servicio).trim().toUpperCase()}:*`;

    const stream = redis.scanStream({
      match: patron,
      count: 100,
    });

    let totalEliminados = 0;

    for await (const keys of stream) {
      if (keys.length > 0) {
        await redis.del(...keys);
        totalEliminados += keys.length;
      }
    }

    return {
      success: true,
      servicio,
      totalEliminados,
    };
  } catch (error) {
    console.warn(
      `[CACHE ERROR] Error limpiando caché de ${servicio}:`,
      error.message
    );
    return {
      success: false,
      error: error.message,
    };
  }
}
