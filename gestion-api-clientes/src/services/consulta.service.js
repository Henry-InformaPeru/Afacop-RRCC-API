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


// --------------------------------------------------
// REORDENAR NOMBRE
// --------------------------------------------------

function reordenarNombre(nombre) {

  nombre =
    String(
      nombre || ""
    )
      .trim()
      .replace(
        /\s+/g,
        " "
      );


  if (!nombre) {

    return nombre;
  }


  const partes =
    nombre.split(" ");


  if (
    partes.length < 3
  ) {

    return nombre;
  }


  const apellidos =
    partes.slice(-2);


  const nombres =
    partes.slice(
      0,
      -2
    );


  return [
    ...apellidos,
    ...nombres,
  ].join(" ");
}


// --------------------------------------------------
// ADAPTAR DATOS RRCC
// --------------------------------------------------

function adaptarDatosRRCC(datos) {

  if (
    !datos ||
    typeof datos !== "object" ||
    Array.isArray(datos)
  ) {

    return datos;
  }


  let rating =
    datos.rating;


  if (
    rating &&
    typeof rating === "object"
  ) {

    rating = {

      NOR:
        rating.normal ??
        rating.NOR ??
        0,

      CPP:
        rating.problemas ??
        rating.CPP ??
        0,

      DEF:
        rating.deficiente ??
        rating.DEF ??
        0,

      DUD:
        rating.dudoso ??
        rating.DUD ??
        0,

      PER:
        rating.perdida ??
        rating.PER ??
        0,

      reportan:
        rating.reportan ??
        rating.reportar ??
        0,
    };
  }


  const deudas =
    Array.isArray(
      datos.deudas
    )

      ? datos.deudas.map(
          (deuda) => {

            const {
              capital,
              codigoEmpresa,
              ...resto
            } = deuda;


            return {
              ...resto,

              saldo:
                capital ??
                deuda.saldo,
            };
          }
        )

      : datos.deudas;


  const lineas =
    Array.isArray(
      datos.lineas
    )

      ? datos.lineas.map(
          (linea) => {

            const {
              codigoEmpresa,
              diferencia,
              consistencia,
              consistente,
              ...resto
            } = linea;


            return resto;
          }
        )

      : datos.lineas;


  return {

    ...datos,

    nombre:
      reordenarNombre(
        datos.nombre
      ),

    rating,

    deudas,

    lineas,
  };
}


// --------------------------------------------------
// ADAPTAR WRAPPER
// --------------------------------------------------

function adaptarRespuestaRRCC(
  respuesta
) {

  if (
    !respuesta ||
    typeof respuesta !== "object"
  ) {

    return respuesta;
  }


  if (
    respuesta.data &&
    typeof respuesta.data ===
      "object" &&
    !Array.isArray(
      respuesta.data
    )
  ) {

    return {

      ...respuesta,

      data:
        adaptarDatosRRCC(
          respuesta.data
        ),
    };
  }


  return adaptarDatosRRCC(
    respuesta
  );
}


// --------------------------------------------------
// VALIDAR DOCUMENTO
// --------------------------------------------------

export function validarDocumento(
  tipoDocumento,
  documento
) {

  tipoDocumento =
    String(
      tipoDocumento || ""
    )
      .trim()
      .toUpperCase();


  documento =
    String(
      documento || ""
    )
      .trim();


  const tiposPermitidos = [
    "DNI",
    "RUC",
    "CE",
    "PASAPORTE",
  ];


  if (
    !tiposPermitidos.includes(
      tipoDocumento
    )
  ) {

    throw crearError(
      "Tipo de documento no válido.",
      400,
      "INVALID_DOCUMENT_TYPE"
    );
  }


  if (!documento) {

    throw crearError(
      "El documento es obligatorio.",
      400,
      "DOCUMENT_REQUIRED"
    );
  }


  if (
    tipoDocumento === "DNI" &&
    !/^\d{8}$/.test(
      documento
    )
  ) {

    throw crearError(
      "El DNI debe contener exactamente 8 dígitos.",
      400,
      "INVALID_DNI"
    );
  }


  if (
    tipoDocumento === "RUC" &&
    !/^\d{11}$/.test(
      documento
    )
  ) {

    throw crearError(
      "El RUC debe contener exactamente 11 dígitos.",
      400,
      "INVALID_RUC"
    );
  }


  if (
    tipoDocumento === "CE" &&
    (
      documento.length < 1 ||
      documento.length > 20 ||
      !/^[A-Za-z0-9]+$/.test(
        documento
      )
    )
  ) {

    throw crearError(
      "El Carnet de Extranjería debe ser alfanumérico y no superar 20 caracteres.",
      400,
      "INVALID_CE"
    );
  }


  if (
    tipoDocumento ===
      "PASAPORTE" &&
    (
      documento.length < 1 ||
      documento.length > 20 ||
      !/^[A-Za-z0-9]+$/.test(
        documento
      )
    )
  ) {

    throw crearError(
      "El pasaporte debe ser alfanumérico y no superar 20 caracteres.",
      400,
      "INVALID_PASSPORT"
    );
  }


  return {
    tipoDocumento,
    documento,
  };
}


// --------------------------------------------------
// CONSULTAR RRCC
// --------------------------------------------------

export async function consultarRRCC({

  tipoDocumento,
  documento,

}) {

  const datos =
    validarDocumento(
      tipoDocumento,
      documento
    );


  const baseUrl =
    String(
      process.env.RRCC_API_URL ||
      ""
    )
      .trim()
      .replace(
        /\/+$/,
        ""
      );


  const apiKey =
    String(
      process.env.RRCC_API_KEY ||
      ""
    )
      .trim();


  if (
    !baseUrl ||
    !apiKey
  ) {

    throw crearError(
      "La conexión con RRCC no está configurada.",
      500,
      "RRCC_NOT_CONFIGURED"
    );
  }


  const url =
    `${baseUrl}/v1/rrcc/evaluar/` +
    encodeURIComponent(
      datos.documento
    );


  let response;


  try {

    response =
      await fetch(
        url,
        {

          method:
            "GET",

          headers: {

            Accept:
              "application/json",

            "x-api-key":
              apiKey,
          },

          signal:
            AbortSignal.timeout(
              20000
            ),
        }
      );


  } catch (error) {

    if (
      error?.name ===
        "TimeoutError" ||
      error?.name ===
        "AbortError"
    ) {

      throw crearError(
        "El servicio RRCC excedió el tiempo de espera.",
        504,
        "RRCC_TIMEOUT"
      );
    }


    throw crearError(
      "No se pudo conectar con el servicio RRCC.",
      502,
      "RRCC_CONNECTION_ERROR"
    );
  }


  const texto =
    await response.text();


  let data;


  try {

    data =
      texto

        ? JSON.parse(
            texto
          )

        : {};


  } catch {

    throw crearError(
      "RRCC devolvió una respuesta inválida.",
      502,
      "RRCC_INVALID_RESPONSE"
    );
  }


  const dataAdaptada =
    response.ok

      ? adaptarRespuestaRRCC(
          data
        )

      : data;


  return {

    status:
      response.status,

    ok:
      response.ok,

    tipoDocumento:
      datos.tipoDocumento,

    documento:
      datos.documento,

    data:
      dataAdaptada,
  };
}