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

  const texto =
    String(valor)
      .trim();

  if (
    !texto ||
    texto.toUpperCase() === "NULL"
  ) {

    return null;
  }

  return texto;
}


// ==================================================
// NORMALIZAR FECHA (YYYY-MM-DD)
// ==================================================

function normalizarFecha(
  valor
) {

  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {

    return null;
  }

  if (valor instanceof Date) {

    return valor
      .toISOString()
      .split("T")[0];
  }

  const texto =
    String(valor)
      .trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {

    return texto.substring(0, 10);
  }

  return texto || null;
}


// ==================================================
// CONSULTAR TELÉFONOS
// ==================================================

export async function consultarTelefonos({

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
  // 2. EXTRAER DOCUMENTO PARA BÚSQUEDA
  //
  // Si tipoDocumento es RUC (11 dígitos) y empieza con 10,
  // el DNI corresponde a los 8 dígitos centrales (pos 2 a 10).
  // Se busca tanto por el RUC completo como por el DNI.
  // ==================================================

  let docSecundario =
    datos.documento;

  if (
    datos.tipoDocumento === "RUC" &&
    datos.documento.startsWith("10")
  ) {

    docSecundario =
      datos.documento.substring(2, 10);
  }


  // ==================================================
  // 3. CONEXIÓN SQL SERVER
  // ==================================================

  const pool =
    await getSqlPool();

  let result;


  try {

    // ==================================================
    // 4. CONSULTAR OPERADOR.MOVILES
    // ==================================================

    result =
      await pool
        .request()
        .input(
          "documento",
          sql.VarChar(30),
          datos.documento
        )
        .input(
          "docSecundario",
          sql.VarChar(30),
          docSecundario
        )
        .query(`
          SELECT
            PERIODO,
            DOCUMENTO,
            APE_PAT,
            APE_MAT,
            PRENOMBRES,
            TELEFONO,
            FECHA_ALTA,
            PLAN_MOVIL,
            MODALIDAD,
            EMPRESA_OPERADORA,
            FECHA_CARGA
          FROM
            Buscador.Operador.Moviles
          WHERE
            DOCUMENTO = @documento
            OR DOCUMENTO = @docSecundario
          ORDER BY
            PERIODO DESC,
            FECHA_ALTA DESC,
            FECHA_CARGA DESC
        `);

  } catch (error) {

    console.error(
      "Error consultando Operador.Moviles:",
      error
    );

    throw crearError(
      "No se pudo consultar el servicio de teléfonos.",
      500,
      "TELEFONOS_QUERY_ERROR"
    );
  }


  // ==================================================
  // 5. SIN INFORMACIÓN
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

      error:
        "No se encontró información de teléfonos para el documento consultado.",

      code:
        "TELEFONOS_SIN_DATOS",
    };
  }


  // ==================================================
  // 6. MAPEAR RESPUESTA
  // ==================================================

  const primerRegistro =
    result.recordset[0];

  const apellidoPaterno =
    normalizarTexto(
      primerRegistro.APE_PAT
    );

  const apellidoMaterno =
    normalizarTexto(
      primerRegistro.APE_MAT
    );

  const nombre =
    normalizarTexto(
      primerRegistro.PRENOMBRES
    );

  const telefonos =
    result.recordset.map(
      (registro) => ({
        periodo:
          normalizarTexto(
            registro.PERIODO
          ),

        telefono:
          normalizarTexto(
            registro.TELEFONO
          ),

        fechaAlta:
          normalizarFecha(
            registro.FECHA_ALTA
          ),

        planMovil:
          normalizarTexto(
            registro.PLAN_MOVIL
          ),

        modalidad:
          normalizarTexto(
            registro.MODALIDAD
          ),

        empresaOperadora:
          normalizarTexto(
            registro.EMPRESA_OPERADORA
          ),
      })
    );


  // ==================================================
  // 7. RESPUESTA EXITOSA
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

      apellidoPaterno,

      apellidoMaterno,

      nombre,

      telefonos,
    },
  };
}
