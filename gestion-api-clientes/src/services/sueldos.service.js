import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";

import {
  validarDocumento,
} from "./consulta.service.js";


// ==================================================
// CREAR ERROR
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


// ==================================================
// NORMALIZAR TEXTO
// ==================================================

function normalizarTexto(
  valor
) {

  if (
    valor === null ||
    valor === undefined
  ) {

    return null;
  }

  return String(valor)
    .trim() || null;
}


// ==================================================
// NORMALIZAR NÚMERO
//
// IMPORTANTE:
// NULL se mantiene como NULL.
// No lo convertimos a 0.
// ==================================================

function normalizarNumero(
  valor
) {

  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {

    return null;
  }

  const numero =
    Number(valor);

  return Number.isFinite(numero)
    ? numero
    : null;
}


// ==================================================
// CONSULTAR SUELDOS
// ==================================================

export async function consultarSueldos({

  tipoDocumento,
  documento,

}) {

  // ==================================================
  // 1. VALIDAR DOCUMENTO
  // ==================================================

  const datos =
    validarDocumento(
      tipoDocumento,
      documento
    );


  // ==================================================
  // 2. CONEXIÓN SQL SERVER
  // ==================================================

  const pool =
    await getSqlPool();

  let result;


  try {

    // ==================================================
    // 3. CONSULTAR OPERADOR.SUELDOS
    // ==================================================

    result =
      await pool
        .request()
        .input(
          "documento",
          sql.VarChar(30),
          datos.documento
        )
        .query(`
          SELECT
            PERIODO,
            DOCUMENTO,
            APENOM,
            RUC,
            EMPRESA,
            RANGO_SUELDO,
            NIVEL_INGRESO,
            SUELDO
          FROM
            Buscador.Operador.Sueldos
          WHERE
            DOCUMENTO =
              @documento
          ORDER BY
            PERIODO DESC,
            FECHA_CARGA DESC,
            ID DESC
        `);

  } catch (error) {

    console.error(
      "Error consultando Operador.Sueldos:",
      error
    );

    throw crearError(
      "No se pudo consultar el servicio de sueldos.",
      500,
      "SUELDOS_QUERY_ERROR"
    );
  }


  // ==================================================
  // 4. SIN INFORMACIÓN
  // ==================================================

  if (
    !result.recordset ||
    result.recordset.length === 0
  ) {

    return {
      status:
        404,

      ok:
        false,

      tipoDocumento:
        datos.tipoDocumento,

      documento:
        datos.documento,

      data: {
        error:
          "No se encontró información de sueldos para el documento consultado.",

        code:
          "SUELDOS_SIN_DATOS",
      },
    };
  }


  // ==================================================
  // 5. MAPEAR PERIODOS Y RESPUESTA AGRUPADA
  // ==================================================

  const primerRegistro =
    result.recordset[0];

  const nombres =
    normalizarTexto(
      primerRegistro.APENOM
    );

  const periodos =
    result.recordset.map(
      (registro) => ({
        periodo:
          normalizarTexto(
            registro.PERIODO
          ),

        ruc:
          normalizarTexto(
            registro.RUC
          ),

        empresa:
          normalizarTexto(
            registro.EMPRESA
          ),

        sueldo:
          normalizarNumero(
            registro.SUELDO
          ),

        rangoSueldo:
          normalizarTexto(
            registro.RANGO_SUELDO
          ),

        nivelIngreso:
          normalizarTexto(
            registro.NIVEL_INGRESO
          ),
      })
    );


  // ==================================================
  // 6. RESPUESTA EXITOSA
  // ==================================================

  return {
    status:
      200,

    ok:
      true,

    tipoDocumento:
      datos.tipoDocumento,

    documento:
      datos.documento,

    data: {
      tipoDocumento:
        datos.tipoDocumento,

      documento:
        datos.documento,

      nombres,

      periodos,
    },
  };
}
