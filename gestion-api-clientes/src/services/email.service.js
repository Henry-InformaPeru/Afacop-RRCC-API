import nodemailer from "nodemailer";


// ==================================================
// CONFIGURACIÓN GENERAL
// ==================================================

const IS_PRODUCTION =
  process.env.NODE_ENV === "production";


// ==================================================
// CREAR ERROR CONTROLADO
// ==================================================

function crearError(
  message,
  statusCode = 500,
  code = "EMAIL_ERROR"
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
// ESCAPAR HTML
// ==================================================

function escaparHtml(valor) {

  return String(
    valor || ""
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ==================================================
// URL DEL FRONTEND
// ==================================================

function obtenerFrontendUrl() {

  const baseUrl =
    String(
      process.env.ADMIN_FRONTEND_URL ||
      "http://localhost:5001"
    )
      .trim()
      .replace(/\/+$/, "");


  return baseUrl;
}


// ==================================================
// GENERAR ENLACE DE RECUPERACIÓN
// ==================================================

export function generarUrlRecuperacion(
  token
) {

  if (
    !token ||
    !String(token).trim()
  ) {

    throw crearError(
      "No se recibió el token de recuperación.",
      500,
      "RESET_TOKEN_REQUIRED"
    );
  }


  const baseUrl =
    obtenerFrontendUrl();


  return (
    `${baseUrl}` +
    `/admin/restablecer-password` +
    `?token=${encodeURIComponent(token)}`
  );
}


// ==================================================
// OBTENER CONFIGURACIÓN SMTP
// ==================================================

function obtenerConfiguracionSmtp() {

  const host =
    String(
      process.env.SMTP_HOST ||
      ""
    ).trim();


  const port =
    Number(
      process.env.SMTP_PORT ||
      465
    );


  const user =
    String(
      process.env.SMTP_USER ||
      ""
    ).trim();


  const password =
    process.env.SMTP_PASSWORD ||
    "";


  const secureVariable =
    process.env.SMTP_SECURE;


  // --------------------------------------------------
  // Si SMTP_SECURE está definido, respetamos su valor.
  //
  // Si no está definido:
  // puerto 465 => secure=true
  // otros      => secure=false
  // --------------------------------------------------

  const secure =
    secureVariable !== undefined
      ?
      String(
        secureVariable
      ).toLowerCase() === "true"
      :
      port === 465;


  const requireTlsVariable =
    process.env.SMTP_REQUIRE_TLS;


  // Puerto 465 usa SSL/TLS directo.
  // Puerto 587 normalmente usa STARTTLS.
  const requireTLS =
    !secure &&
    (
      requireTlsVariable !== undefined
        ?
        String(
          requireTlsVariable
        ).toLowerCase() === "true"
        :
        true
    );


  return {

    host,
    port,
    secure,
    requireTLS,
    user,
    password,
  };
}


// ==================================================
// VALIDAR CONFIGURACIÓN SMTP
// ==================================================

function smtpConfigurado(
  configuracion
) {

  return Boolean(
    configuracion.host &&
    configuracion.port &&
    configuracion.user &&
    configuracion.password
  );
}


// ==================================================
// CREAR TRANSPORTER SMTP
// ==================================================

function crearTransporter() {

  const configuracion =
    obtenerConfiguracionSmtp();


  // --------------------------------------------------
  // SMTP NO CONFIGURADO
  // --------------------------------------------------

  if (
    !smtpConfigurado(
      configuracion
    )
  ) {

    // En producción nunca permitimos continuar
    // sin correo configurado.
    if (
      IS_PRODUCTION
    ) {

      throw crearError(
        "El servicio de correo no está configurado.",
        500,
        "EMAIL_SERVICE_NOT_CONFIGURED"
      );
    }


    // En desarrollo todavía permitimos
    // generar el enlace sin enviar correo.
    return null;
  }


  // --------------------------------------------------
  // TRANSPORTER
  // --------------------------------------------------

  return nodemailer.createTransport({

    host:
      configuracion.host,

    port:
      configuracion.port,

    secure:
      configuracion.secure,

    requireTLS:
      configuracion.requireTLS,

    auth: {

      user:
        configuracion.user,

      pass:
        configuracion.password,
    },


    // TLS mínimo permitido.
    tls: {

      minVersion:
        "TLSv1.2",
    },


    // Evita conexiones colgadas indefinidamente.
    connectionTimeout:
      10000,

    greetingTimeout:
      10000,

    socketTimeout:
      15000,
  });
}


// ==================================================
// ENVIAR RECUPERACIÓN DE CONTRASEÑA
// ==================================================

export async function enviarCorreoRecuperacion({

  email,
  nombre,
  token,

}) {

  // --------------------------------------------------
  // VALIDACIONES
  // --------------------------------------------------

  if (
    !email ||
    !String(email).trim()
  ) {

    throw crearError(
      "No se recibió el correo del administrador.",
      500,
      "EMAIL_DESTINATION_REQUIRED"
    );
  }


  if (
    !token ||
    !String(token).trim()
  ) {

    throw crearError(
      "No se recibió el token de recuperación.",
      500,
      "RESET_TOKEN_REQUIRED"
    );
  }


  const destinatario =
    String(
      email
    ).trim();


  const nombreTexto =
    String(
      nombre ||
      ""
    ).trim();


  const nombreHtml =
    escaparHtml(
      nombreTexto
    );


  const resetUrl =
    generarUrlRecuperacion(
      token
    );


  const transporter =
    crearTransporter();


  // ==================================================
  // MODO DESARROLLO SIN SMTP
  // ==================================================

  if (
    !transporter
  ) {

    console.log("");
    console.log(
      "=============================================="
    );

    console.log(
      "RECUPERACIÓN DE CONTRASEÑA - MODO DESARROLLO"
    );

    console.log(
      "=============================================="
    );

    console.log(
      "Destinatario:",
      destinatario
    );

    console.log(
      "Enlace:"
    );

    console.log(
      resetUrl
    );

    console.log(
      "=============================================="
    );

    console.log("");


    return {

      enviado:
        false,

      modoDesarrollo:
        true,

      resetUrl,
    };
  }


  // ==================================================
  // REMITENTE
  // ==================================================

  const from =
    String(
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      ""
    ).trim();


  if (
    !from
  ) {

    throw crearError(
      "No se configuró el remitente del correo.",
      500,
      "EMAIL_FROM_NOT_CONFIGURED"
    );
  }


  // ==================================================
  // CONTENIDO TEXTO
  // ==================================================

  const saludoTexto =
    nombreTexto
      ?
      `Hola ${nombreTexto}.`
      :
      "Hola.";


  const contenidoTexto =
    `
${saludoTexto}

Recibimos una solicitud para restablecer tu contraseña en Gestión API Clientes.

Para crear una nueva contraseña, ingresa al siguiente enlace:

${resetUrl}

Este enlace estará disponible durante 10 minutos y solo podrá utilizarse una vez.

Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña no será modificada.
    `.trim();


  // ==================================================
  // CONTENIDO HTML
  // ==================================================

  const saludoHtml =
    nombreHtml
      ?
      `Hola <strong>${nombreHtml}</strong>.`
      :
      "Hola.";


  const contenidoHtml =
    `
<!DOCTYPE html>

<html lang="es">

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>
    Recuperación de contraseña
  </title>

</head>


<body
  style="
    margin: 0;
    padding: 0;
    background-color: #f4f7fb;
    font-family: Arial, Helvetica, sans-serif;
    color: #172033;
  "
>

  <table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="
      background-color: #f4f7fb;
      padding: 32px 16px;
    "
  >

    <tr>

      <td align="center">

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            max-width: 600px;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #e5e7eb;
          "
        >

          <!-- CABECERA -->

          <tr>

            <td
              style="
                background: #173b68;
                padding: 24px 32px;
              "
            >

              <div
                style="
                  font-size: 22px;
                  font-weight: 700;
                  color: #ffffff;
                "
              >
                Gestión API Clientes
              </div>

            </td>

          </tr>


          <!-- CONTENIDO -->

          <tr>

            <td
              style="
                padding: 32px;
              "
            >

              <h1
                style="
                  margin: 0 0 20px 0;
                  font-size: 24px;
                  color: #111827;
                "
              >
                Restablece tu contraseña
              </h1>


              <p
                style="
                  margin: 0 0 16px 0;
                  font-size: 16px;
                  line-height: 1.6;
                "
              >
                ${saludoHtml}
              </p>


              <p
                style="
                  margin: 0 0 16px 0;
                  font-size: 16px;
                  line-height: 1.6;
                "
              >
                Recibimos una solicitud para
                restablecer tu contraseña en
                <strong>
                  Gestión API Clientes
                </strong>.
              </p>


              <p
                style="
                  margin: 0 0 24px 0;
                  font-size: 16px;
                  line-height: 1.6;
                "
              >
                Presiona el siguiente botón
                para crear una nueva contraseña.
              </p>


              <!-- BOTÓN -->

              <table
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  margin: 0 0 24px 0;
                "
              >

                <tr>

                  <td
                    style="
                      background: #1f4f82;
                      border-radius: 7px;
                    "
                  >

                    <a
                      href="${resetUrl}"
                      style="
                        display: inline-block;
                        padding: 14px 24px;
                        color: #ffffff;
                        text-decoration: none;
                        font-size: 15px;
                        font-weight: 700;
                      "
                    >
                      Restablecer contraseña
                    </a>

                  </td>

                </tr>

              </table>


              <p
                style="
                  margin: 0 0 16px 0;
                  font-size: 14px;
                  line-height: 1.6;
                  color: #475569;
                "
              >

                Este enlace estará disponible durante

                <strong>
                  10 minutos
                </strong>

                y solo podrá utilizarse una vez.

              </p>


              <p
                style="
                  margin: 0;
                  font-size: 14px;
                  line-height: 1.6;
                  color: #475569;
                "
              >

                Si no solicitaste este cambio,
                puedes ignorar este mensaje.
                Tu contraseña permanecerá sin cambios.

              </p>

            </td>

          </tr>


          <!-- FOOTER -->

          <tr>

            <td
              style="
                padding: 20px 32px;
                background: #f8fafc;
                border-top: 1px solid #e5e7eb;
                font-size: 12px;
                line-height: 1.5;
                color: #64748b;
              "
            >

              Este correo fue enviado automáticamente
              por Gestión API Clientes.

              <br>

              No es necesario responder a este mensaje.

            </td>

          </tr>

        </table>

      </td>

    </tr>

  </table>

</body>

</html>
    `.trim();


  // ==================================================
  // ENVÍO SMTP
  // ==================================================

  try {

    const info =
      await transporter.sendMail({

        from,

        to:
          destinatario,

        subject:
          "Recupera tu contraseña - Gestión API Clientes",

        text:
          contenidoTexto,

        html:
          contenidoHtml,
      });


    console.log(
      `[EMAIL] Recuperación enviada a ${destinatario}`
    );


    return {

      enviado:
        true,

      modoDesarrollo:
        false,

      messageId:
        info.messageId,
    };


  }
  catch (error) {

    console.error(
      "[EMAIL] Error enviando recuperación:",
      {
        code:
          error?.code,

        command:
          error?.command,

        responseCode:
          error?.responseCode,

        response:
          error?.response,
      }
    );


    throw crearError(
      "No fue posible enviar el correo de recuperación.",
      500,
      "EMAIL_SEND_FAILED"
    );
  }
}