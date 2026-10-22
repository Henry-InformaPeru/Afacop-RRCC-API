import "dotenv/config";

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();

const PORT =
  Number(process.env.PORT) || 3000;


// --------------------------------------------------
// SEGURIDAD
// --------------------------------------------------

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(
  express.json({
    limit: "20kb",
  })
);


// --------------------------------------------------
// RATE LIMIT
// --------------------------------------------------

const consultaLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});


// --------------------------------------------------
// ARCHIVOS DE LA LANDING
// --------------------------------------------------

app.use(
  express.static("public")
);


// --------------------------------------------------
// VALIDAR DNI
// --------------------------------------------------

function validarDni(dni) {

  if (!/^\d{8}$/.test(dni)) {

    const error =
      new Error(
        "El DNI debe contener exactamente 8 dígitos."
      );

    error.statusCode = 400;
    error.code = "INVALID_DNI";

    throw error;
  }
}


// --------------------------------------------------
// CONSULTAR API RRCC EXISTENTE
// --------------------------------------------------

async function consultarRRCC(dni) {

  const baseUrl =
    String(
      process.env.RRCC_API_URL || ""
    )
      .trim()
      .replace(/\/+$/, "");

  const apiKey =
    String(
      process.env.RRCC_API_KEY || ""
    ).trim();


  if (!baseUrl || !apiKey) {

    const error =
      new Error(
        "Falta configurar RRCC_API_URL o RRCC_API_KEY."
      );

    error.statusCode = 500;

    throw error;
  }


  const url =
    `${baseUrl}/v1/rrcc/evaluar/${encodeURIComponent(dni)}`;


  const response =
    await fetch(
      url,
      {
        method: "GET",

        headers: {
          "Accept": "application/json",
          "x-api-key": apiKey,
        },

        signal:
          AbortSignal.timeout(20000),
      }
    );


  const texto =
    await response.text();

  let data;

  try {

    data =
      texto
        ? JSON.parse(texto)
        : {};

  } catch {

    data = {
      error:
        "La API RRCC devolvió una respuesta inválida.",
    };

  }


  return {
    status: response.status,
    data,
  };
}


// --------------------------------------------------
// ENDPOINT PARA LA LANDING
// --------------------------------------------------

app.post(
  "/api/consulta",
  consultaLimiter,
  async (req, res) => {

    try {

      const dni =
        String(
          req.body?.dni ?? ""
        ).trim();


      validarDni(dni);


      const resultado =
        await consultarRRCC(dni);


      return res
        .status(resultado.status)
        .json(resultado.data);

    } catch (error) {

      console.error(
        "Error consultando RRCC:",
        error
      );


      return res
        .status(
          error.statusCode || 502
        )
        .json({
          error:
            error.message ||
            "No se pudo realizar la consulta.",

          code:
            error.code ||
            "RRCC_CONNECTION_ERROR",
        });

    }

  }
);


// --------------------------------------------------
// CONSULTA DIRECTA POR URL
// --------------------------------------------------

app.get(
  "/consulta/:dni",
  consultaLimiter,
  async (req, res) => {

    try {

      const dni =
        String(
          req.params.dni ?? ""
        ).trim();


      validarDni(dni);


      const resultado =
        await consultarRRCC(dni);


      return res
        .status(resultado.status)
        .json(resultado.data);

    } catch (error) {

      console.error(
        "Error consultando RRCC:",
        error
      );


      return res
        .status(
          error.statusCode || 502
        )
        .json({
          error:
            error.message ||
            "No se pudo realizar la consulta.",

          code:
            error.code ||
            "RRCC_CONNECTION_ERROR",
        });

    }

  }
);


// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get(
  "/health",
  (req, res) => {

    return res.status(200).json({
      status: "ok",
      service: "rrcc-consulta-web",
      timestamp:
        new Date().toISOString(),
    });

  }
);


// --------------------------------------------------
// SERVIDOR
// --------------------------------------------------

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Consulta RRCC Web ejecutándose en http://localhost:${PORT}`
    );

  }
);