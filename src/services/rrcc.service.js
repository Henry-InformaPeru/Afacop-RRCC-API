import {
  getRrccPool,
  sql,
} from "../config/sqlserver.js";

export async function evaluarPersona(documento) {
  const documentoNormalizado =
    String(documento ?? "")
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z0-9]{3,20}$/.test(
      documentoNormalizado
    )
  ) {
    const error =
      new Error(
        "El número de documento no tiene un formato válido."
      );

    error.statusCode = 400;
    error.code = "INVALID_DOCUMENT";

    throw error;
  }

  const pool =
    await getRrccPool();

  // --------------------------------------------------
  // 1. CALIFICACIÓN MÁS RECIENTE
  // --------------------------------------------------

  const calificacionResult =
    await pool
      .request()
      .input(
        "documento",
        sql.VarChar(20),
        documentoNormalizado
      )
      .query(`
        SELECT TOP 1
          PERIODO,
          CODIGOSBS,
          DOCUMENTO,

          NOR,
          CPP,
          DEF,
          DUD,
          PER,
          REPORTAN,

          APE_PAT,
          APE_MAT,
          PRI_NOMBRE,
          SEG_NOMBRE,

          FECHA_CARGA

        FROM [RRCC].[Calificacion]

        WHERE DOCUMENTO = @documento

        ORDER BY
          PERIODO DESC,
          FECHA_CARGA DESC
      `);

  const calificacion =
    calificacionResult.recordset[0];

  if (!calificacion) {
    const error =
      new Error(
        "No se encontró información crediticia para el documento consultado."
      );

    error.statusCode = 404;
    error.code = "RRCC_CLIENT_NOT_FOUND";

    throw error;
  }

  // --------------------------------------------------
  // DATOS PRINCIPALES
  // --------------------------------------------------

  const periodo =
    String(
      calificacion.PERIODO ?? ""
    ).trim();

  const codigoSbs =
    String(
      calificacion.CODIGOSBS ?? ""
    ).trim();

  // --------------------------------------------------
  // 2. DEUDAS
  // --------------------------------------------------

  const deudaResult =
    await pool
      .request()
      .input(
        "documento",
        sql.VarChar(20),
        documentoNormalizado
      )
      .input(
        "periodo",
        sql.VarChar(6),
        periodo
      )
      .input(
        "codigoSbs",
        sql.VarChar(20),
        codigoSbs
      )
      .query(`
        SELECT
          PERIODO,
          CODIGOSBS,
          DOCUMENTO,
          RAZONSOCIAL,

          CODIGOEMPRESA,
          ENTIDAD,

          TIPO_DEUDA,
          DIAS,
          CALIFICACION,

          SALDO,

          FECHA_CARGA

        FROM [RRCC].[Deuda]

        WHERE DOCUMENTO = @documento
          AND CODIGOSBS = @codigoSbs
          AND PERIODO = @periodo

        ORDER BY
          ENTIDAD,
          TIPO_DEUDA
      `);

  // --------------------------------------------------
  // 3. LÍNEAS DE CRÉDITO
  // --------------------------------------------------

  const lineasResult =
    await pool
      .request()
      .input(
        "documento",
        sql.VarChar(20),
        documentoNormalizado
      )
      .input(
        "periodo",
        sql.VarChar(6),
        periodo
      )
      .input(
        "codigoSbs",
        sql.VarChar(20),
        codigoSbs
      )
      .query(`
        SELECT
          PERIODO,
          CODIGOSBS,
          DOCUMENTO,
          RAZONSOCIAL,

          CODIGOEMPRESA,
          ENTIDAD,

          TIPO,

          LINEA_CREDITO,
          LINEA_NO_UTILIZADA,
          LINEA_UTILIZADA,

          FECHA_CARGA

        FROM [RRCC].[LineasCredito]

        WHERE DOCUMENTO = @documento
          AND CODIGOSBS = @codigoSbs
          AND PERIODO = @periodo

        ORDER BY ENTIDAD
      `);

  // --------------------------------------------------
  // 4. NOMBRE
  // --------------------------------------------------

  const nombre = [
    calificacion.PRI_NOMBRE,
    calificacion.SEG_NOMBRE,
    calificacion.APE_PAT,
    calificacion.APE_MAT,
  ]
    .filter(Boolean)
    .map(value =>
      String(value).trim()
    )
    .filter(Boolean)
    .join(" ");

  // --------------------------------------------------
  // 5. CALIFICACIÓN
  // --------------------------------------------------

  const rating = {
    normal:
      Number(
        calificacion.NOR ?? 0
      ),

    problemas:
      Number(
        calificacion.CPP ?? 0
      ),

    deficiente:
      Number(
        calificacion.DEF ?? 0
      ),

    dudoso:
      Number(
        calificacion.DUD ?? 0
      ),

    perdida:
      Number(
        calificacion.PER ?? 0
      ),

    reportan:
      Number(
        calificacion.REPORTAN ?? 0
      ),
  };

  // --------------------------------------------------
  // 6. DEUDAS
  // --------------------------------------------------

  const deudas =
    deudaResult.recordset.map(
      deuda => ({
        entidad:
          deuda.ENTIDAD || "",

        tipoDeuda:
          deuda.TIPO_DEUDA || "",

        calificacion:
          deuda.CALIFICACION || "",

        capital:
          Number(
            deuda.SALDO ?? 0
          ),

        dias:
          Number(
            deuda.DIAS ?? 0
          ),

        codigoEmpresa:
          deuda.CODIGOEMPRESA || "",
      })
    );

  // --------------------------------------------------
  // 7. LÍNEAS
  // --------------------------------------------------

  const lineas =
    lineasResult.recordset.map(
      linea => {
        const lineaCredito =
          Number(
            linea.LINEA_CREDITO ?? 0
          );

        const lineaNoUtilizada =
          Number(
            linea.LINEA_NO_UTILIZADA ?? 0
          );

        const lineaUtilizada =
          Number(
            linea.LINEA_UTILIZADA ?? 0
          );

        const porcentajeUtilizado =
          lineaCredito > 0
            ? (
                lineaUtilizada /
                lineaCredito
              ) * 100
            : 0;

        const porcentajeNoUtilizado =
          lineaCredito > 0
            ? (
                lineaNoUtilizada /
                lineaCredito
              ) * 100
            : 0;

        const sumaComponentes =
          lineaUtilizada +
          lineaNoUtilizada;

        const diferencia =
          lineaCredito -
          sumaComponentes;

        const consistente =
          Math.abs(
            diferencia
          ) <= 0.01;

        return {
          entidad:
            linea.ENTIDAD || "",

          tipo:
            linea.TIPO || "",

          lineaCredito,

          lineaUtilizada,

          lineaNoUtilizada,

          porcentajeUtilizado:
            Number(
              porcentajeUtilizado.toFixed(2)
            ),

          porcentajeNoUtilizado:
            Number(
              porcentajeNoUtilizado.toFixed(2)
            ),

          diferencia:
            Number(
              diferencia.toFixed(2)
            ),

          consistente,

          codigoEmpresa:
            linea.CODIGOEMPRESA || "",
        };
      }
    );

  // --------------------------------------------------
  // RESPUESTA
  // --------------------------------------------------

  return {
    documento: documentoNormalizado,
    codigoSbs,
    nombre,
    periodo,

    fechaCarga:
      calificacion.FECHA_CARGA ??
      null,

    rating,
    deudas,
    lineas,
  };
}