import sql from "mssql";

const sqlServerConfig = {
  server: process.env.SQL_HOST,

  port: Number(
    process.env.SQL_PORT || 1433
  ),

  database:
    process.env.SQL_DATABASE ||
    "Buscador",

  user:
    process.env.SQL_USER,

  password:
    process.env.SQL_PASSWORD,

  options: {
    encrypt:
      String(
        process.env.SQL_ENCRYPT ??
        "false"
      ).toLowerCase() === "true",

    trustServerCertificate:
      String(
        process.env.SQL_TRUST_SERVER_CERTIFICATE ??
        "true"
      ).toLowerCase() === "true",
  },

  pool: {
    max: 10,
    min: 1,
    idleTimeoutMillis: 30000,
  },

  connectionTimeout: 10000,
  requestTimeout: 15000,
};

let poolPromise = null;

export async function getSqlPool() {
  if (!poolPromise) {
    const pool =
      new sql.ConnectionPool(
        sqlServerConfig
      );

    poolPromise = pool
      .connect()
      .catch(error => {
        poolPromise = null;
        throw error;
      });
  }

  return poolPromise;
}

export { sql };