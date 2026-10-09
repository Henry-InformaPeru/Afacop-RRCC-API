import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


// ==================================================
// UTILIDADES
// ==================================================

function crearError(
  message,
  statusCode,
  code
) {

  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.code =
    code;

  return error;
}


function obtenerContextoAdministrador(
  adminActual
) {

  const idAdmin =
    Number(
      adminActual?.idAdmin
    );


  const rol =
    String(
      adminActual?.rol || ""
    )
      .trim()
      .toUpperCase();


  if (
    !Number.isInteger(idAdmin) ||
    idAdmin <= 0
  ) {

    throw crearError(
      "El administrador no es válido.",
      401,
      "INVALID_ADMIN"
    );
  }


  if (
    ![
      "ADMIN",
      "SUPERADMIN",
    ].includes(rol)
  ) {

    throw crearError(
      "El administrador no tiene un rol válido.",
      403,
      "INVALID_ADMIN_ROLE"
    );
  }


  return {

    idAdmin,

    rol,

    esSuperAdmin:
      rol === "SUPERADMIN",
  };
}


// ==================================================
// DASHBOARD
// ==================================================

export async function obtenerDashboard(
  adminActual
) {

  const contextoAdmin =
    obtenerContextoAdministrador(
      adminActual
    );


  const pool =
    await getSqlPool();


  const result =
    await pool
      .request()

      .input(
        "idAdmin",
        sql.BigInt,
        contextoAdmin.idAdmin
      )

      .input(
        "esSuperAdmin",
        sql.Bit,
        contextoAdmin.esSuperAdmin
          ? 1
          : 0
      )

      .query(`
        SELECT

          -- =========================================
          -- CLIENTES
          -- =========================================

          (
            SELECT
              COUNT(*)

            FROM
              GestionAPIClientes.Clientes C

            WHERE
              (
                @esSuperAdmin = 1
                OR C.ID_ADMIN = @idAdmin
              )
          ) AS TOTAL_CLIENTES,


          (
            SELECT
              COUNT(*)

            FROM
              GestionAPIClientes.Clientes C

            WHERE
              C.ESTADO =
                'ACTIVO'

              AND
              (
                @esSuperAdmin = 1
                OR C.ID_ADMIN = @idAdmin
              )
          ) AS CLIENTES_ACTIVOS,


          (
            SELECT
              COUNT(*)

            FROM
              GestionAPIClientes.Clientes C

            WHERE
              C.ESTADO =
                'BLOQUEADO'

              AND
              (
                @esSuperAdmin = 1
                OR C.ID_ADMIN = @idAdmin
              )
          ) AS CLIENTES_BLOQUEADOS,


          -- =========================================
          -- TOKENS
          -- =========================================

          (
            SELECT
              COUNT(*)

            FROM
              GestionAPIClientes.Tokens T

            INNER JOIN
              GestionAPIClientes.Clientes C
                ON C.ID_CLIENTE =
                   T.ID_CLIENTE

            WHERE
              T.ESTADO =
                'ACTIVO'

              AND
              (
                @esSuperAdmin = 1
                OR C.ID_ADMIN = @idAdmin
              )
          ) AS TOKENS_ACTIVOS,


          -- =========================================
          -- CRÉDITOS
          --
          -- NUEVO MODELO:
          -- Se suman todas las bolsas del cliente:
          -- RRCC + SUELDOS + futuros servicios.
          -- =========================================

          (
            SELECT
              ISNULL(
                SUM(
                  SS.TOTAL_ASIGNADO
                ),
                0
              )

            FROM
              GestionAPIClientes.SaldosServicios SS

            INNER JOIN
              GestionAPIClientes.Clientes C
                ON C.ID_CLIENTE =
                   SS.ID_CLIENTE

            WHERE
              (
                @esSuperAdmin = 1
                OR C.ID_ADMIN = @idAdmin
              )
          ) AS CREDITOS_ASIGNADOS,


          (
            SELECT
              ISNULL(
                SUM(
                  SS.CREDITOS_DISPONIBLES
                ),
                0
              )

            FROM
              GestionAPIClientes.SaldosServicios SS

            INNER JOIN
              GestionAPIClientes.Clientes C
                ON C.ID_CLIENTE =
                   SS.ID_CLIENTE

            WHERE
              (
                @esSuperAdmin = 1
                OR C.ID_ADMIN = @idAdmin
              )
          ) AS CREDITOS_DISPONIBLES,


          (
            SELECT
              ISNULL(
                SUM(
                  SS.TOTAL_CONSUMIDO
                ),
                0
              )

            FROM
              GestionAPIClientes.SaldosServicios SS

            INNER JOIN
              GestionAPIClientes.Clientes C
                ON C.ID_CLIENTE =
                   SS.ID_CLIENTE

            WHERE
              (
                @esSuperAdmin = 1
                OR C.ID_ADMIN = @idAdmin
              )
          ) AS CREDITOS_CONSUMIDOS,


          -- =========================================
          -- CONSULTAS
          -- =========================================

          (
            SELECT
              COUNT(*)

            FROM
              GestionAPIClientes.Consumos CO

            INNER JOIN
              GestionAPIClientes.Clientes C
                ON C.ID_CLIENTE =
                   CO.ID_CLIENTE

            WHERE
              (
                @esSuperAdmin = 1
                OR C.ID_ADMIN = @idAdmin
              )
          ) AS TOTAL_CONSULTAS,


          (
            SELECT
              COUNT(*)

            FROM
              GestionAPIClientes.Consumos CO

            INNER JOIN
              GestionAPIClientes.Clientes C
                ON C.ID_CLIENTE =
                   CO.ID_CLIENTE

            WHERE
              CO.ESTADO =
                'EXITOSA'

              AND
              (
                @esSuperAdmin = 1
                OR C.ID_ADMIN = @idAdmin
              )
          ) AS CONSULTAS_EXITOSAS,


          (
            SELECT
              COUNT(*)

            FROM
              GestionAPIClientes.Consumos CO

            INNER JOIN
              GestionAPIClientes.Clientes C
                ON C.ID_CLIENTE =
                   CO.ID_CLIENTE

            WHERE
              CO.ESTADO =
                'SIN_DATOS'

              AND
              (
                @esSuperAdmin = 1
                OR C.ID_ADMIN = @idAdmin
              )
          ) AS CONSULTAS_SIN_DATOS,


          (
            SELECT
              COUNT(*)

            FROM
              GestionAPIClientes.Consumos CO

            INNER JOIN
              GestionAPIClientes.Clientes C
                ON C.ID_CLIENTE =
                   CO.ID_CLIENTE

            WHERE
              CO.ESTADO =
                'ERROR'

              AND
              (
                @esSuperAdmin = 1
                OR C.ID_ADMIN = @idAdmin
              )
          ) AS CONSULTAS_ERROR,


          (
            SELECT
              COUNT(*)

            FROM
              GestionAPIClientes.Consumos CO

            INNER JOIN
              GestionAPIClientes.Clientes C
                ON C.ID_CLIENTE =
                   CO.ID_CLIENTE

            WHERE
              CAST(
                CO.FECHA AS DATE
              ) =
              CAST(
                SYSDATETIME() AS DATE
              )

              AND
              (
                @esSuperAdmin = 1
                OR C.ID_ADMIN = @idAdmin
              )
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