import {
  getSqlPool,
} from "../config/sqlserver.js";


export async function obtenerDashboard() {

  const pool =
    await getSqlPool();


  const result =
    await pool
      .request()
      .query(`
        SELECT

          -- CLIENTES
          (
            SELECT COUNT(*)
            FROM GestionAPIClientes.Clientes
          ) AS TOTAL_CLIENTES,

          (
            SELECT COUNT(*)
            FROM GestionAPIClientes.Clientes
            WHERE ESTADO = 'ACTIVO'
          ) AS CLIENTES_ACTIVOS,

          (
            SELECT COUNT(*)
            FROM GestionAPIClientes.Clientes
            WHERE ESTADO = 'BLOQUEADO'
          ) AS CLIENTES_BLOQUEADOS,


          -- TOKENS
          (
            SELECT COUNT(*)
            FROM GestionAPIClientes.Tokens
            WHERE ESTADO = 'ACTIVO'
          ) AS TOKENS_ACTIVOS,


          -- CRÉDITOS
          (
            SELECT
              ISNULL(
                SUM(TOTAL_ASIGNADO),
                0
              )
            FROM GestionAPIClientes.Saldos
          ) AS CREDITOS_ASIGNADOS,

          (
            SELECT
              ISNULL(
                SUM(CREDITOS_DISPONIBLES),
                0
              )
            FROM GestionAPIClientes.Saldos
          ) AS CREDITOS_DISPONIBLES,

          (
            SELECT
              ISNULL(
                SUM(TOTAL_CONSUMIDO),
                0
              )
            FROM GestionAPIClientes.Saldos
          ) AS CREDITOS_CONSUMIDOS,


          -- CONSULTAS
          (
            SELECT COUNT(*)
            FROM GestionAPIClientes.Consumos
          ) AS TOTAL_CONSULTAS,

          (
            SELECT COUNT(*)
            FROM GestionAPIClientes.Consumos
            WHERE ESTADO = 'EXITOSA'
          ) AS CONSULTAS_EXITOSAS,

          (
            SELECT COUNT(*)
            FROM GestionAPIClientes.Consumos
            WHERE ESTADO = 'SIN_DATOS'
          ) AS CONSULTAS_SIN_DATOS,

          (
            SELECT COUNT(*)
            FROM GestionAPIClientes.Consumos
            WHERE ESTADO = 'ERROR'
          ) AS CONSULTAS_ERROR,

          (
            SELECT COUNT(*)
            FROM GestionAPIClientes.Consumos
            WHERE
              CAST(FECHA AS DATE) =
              CAST(SYSDATETIME() AS DATE)
          ) AS CONSULTAS_HOY
      `);


  const datos =
    result.recordset[0];


  return {

    clientes: {
      total:
        Number(
          datos.TOTAL_CLIENTES
        ),

      activos:
        Number(
          datos.CLIENTES_ACTIVOS
        ),

      bloqueados:
        Number(
          datos.CLIENTES_BLOQUEADOS
        ),
    },


    tokens: {
      activos:
        Number(
          datos.TOKENS_ACTIVOS
        ),
    },


    creditos: {
      asignados:
        Number(
          datos.CREDITOS_ASIGNADOS
        ),

      disponibles:
        Number(
          datos.CREDITOS_DISPONIBLES
        ),

      consumidos:
        Number(
          datos.CREDITOS_CONSUMIDOS
        ),
    },


    consultas: {
      total:
        Number(
          datos.TOTAL_CONSULTAS
        ),

      exitosas:
        Number(
          datos.CONSULTAS_EXITOSAS
        ),

      sinDatos:
        Number(
          datos.CONSULTAS_SIN_DATOS
        ),

      errores:
        Number(
          datos.CONSULTAS_ERROR
        ),

      hoy:
        Number(
          datos.CONSULTAS_HOY
        ),
    },
  };
}