import Redis from "ioredis";

// ==================================================
// CONFIGURACIÓN DE REDIS
// ==================================================

const REDIS_HOST =
  process.env.REDIS_HOST || "127.0.0.1";

const REDIS_PORT =
  Number(process.env.REDIS_PORT || 6379);

const REDIS_PASSWORD =
  process.env.REDIS_PASSWORD || undefined;

// 15 días por defecto (en segundos: 15 * 24 * 60 * 60 = 1,296,000s)
export const REDIS_CACHE_TTL_SECONDS = Number(
  process.env.REDIS_CACHE_TTL_SECONDS ||
  (Number(process.env.REDIS_CACHE_TTL_DAYS || 15) * 86400)
);

let redisClient = null;
let isConnected = false;

// ==================================================
// OBTENER O INICIALIZAR CLIENTE REDIS (SINGLETON)
// ==================================================

export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: false,
      retryStrategy(times) {
        // Reintento con backoff exponencial máximo de 3 segundos
        const delay = Math.min(times * 300, 3000);
        return delay;
      },
    });

    redisClient.on("connect", () => {
      isConnected = true;
      console.log(`[REDIS] Conectado exitosamente en ${REDIS_HOST}:${REDIS_PORT}`);
    });

    redisClient.on("ready", () => {
      isConnected = true;
    });

    redisClient.on("error", (error) => {
      isConnected = false;
      console.warn(`[REDIS] Advertencia de conexión: ${error.message}`);
    });

    redisClient.on("close", () => {
      isConnected = false;
    });
  }

  return redisClient;
}

// ==================================================
// ESTADO DE DISPONIBILIDAD
// ==================================================

export function isRedisAvailable() {
  return isConnected && redisClient && redisClient.status === "ready";
}

// ==================================================
// HEALTH CHECK DE REDIS
// ==================================================

export async function checkRedisHealth() {
  try {
    const client = getRedisClient();
    const ping = await client.ping();
    const dbsize = await client.dbsize();

    return {
      status: "ok",
      conectado: true,
      ping,
      host: REDIS_HOST,
      port: REDIS_PORT,
      totalKeys: dbsize,
      ttlDiasConfigurado: Math.round(REDIS_CACHE_TTL_SECONDS / 86400),
    };
  } catch (error) {
    return {
      status: "error",
      conectado: false,
      mensaje: error.message,
      host: REDIS_HOST,
      port: REDIS_PORT,
    };
  }
}
