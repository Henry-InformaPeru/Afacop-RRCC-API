import crypto from "crypto";
import bcrypt from "bcryptjs";

import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


// ==================================================
// CONFIGURACIÓN
// ==================================================

const RESET_TOKEN_MINUTES = 10;
const PASSWORD_MIN_LENGTH = 8;


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


// ==================================================
// NORMALIZAR EMAIL
// ==================================================

function normalizarEmail(
  email
) {

  return String(
    email || ""
  )
    .trim()
    .toLowerCase();
}


// ==================================================
// VALIDAR EMAIL
// ==================================================

function validarEmail(
  email
) {

  email =
    normalizarEmail(
      email
    );


  if (!email) {

    throw crearError(
      "El correo electrónico es obligatorio.",
      400,
      "EMAIL_REQUIRED"
    );
  }


  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {

    throw crearError(
      "El correo electrónico no es válido.",
      400,
      "INVALID_EMAIL"
    );
  }


  return email;
}


// ==================================================
// VALIDAR NUEVA CONTRASEÑA
// ==================================================

function validarNuevaPassword(
  password
) {

  if (
    typeof password !== "string" ||
    password.length < PASSWORD_MIN_LENGTH
  ) {

    throw crearError(
      "La contraseña debe tener al menos 8 caracteres.",
      400,
      "INVALID_PASSWORD"
    );
  }


  return password;
}


// ==================================================
// GENERAR TOKEN
//
// 32 bytes = 256 bits.
//
// Se convierte a HEX:
// resultado de 64 caracteres.
// ==================================================

function generarTokenReset() {

  return crypto
    .randomBytes(32)
    .toString("hex");
}


// ==================================================
// GENERAR HASH DEL TOKEN
//
// El token original nunca se guarda en SQL Server.
// ==================================================

function obtenerHashToken(
  token
) {

  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}


// ==================================================
// SOLICITAR RECUPERACIÓN
// ==================================================

export async function solicitarRecuperacionPassword({

  email,
  ipSolicitud = null,

}) {

  email =
    validarEmail(
      email
    );


  const pool =
    await getSqlPool();


  // --------------------------------------------------
  // BUSCAR ADMINISTRADOR
  // --------------------------------------------------

  const adminResult =
    await pool
      .request()

      .input(
        "email",
        sql.VarChar(150),
        email
      )

      .query(`
        SELECT TOP 1
          ID_ADMIN,
          USUARIO,
          NOMBRE,
          EMAIL,
          ESTADO

        FROM
          GestionAPIClientes.Administradores

        WHERE
          LOWER(EMAIL) =
            LOWER(@email)
      `);


  // --------------------------------------------------
  // RESPUESTA SEGURA
  //
  // Nunca informamos externamente si:
  // - el correo existe
  // - el usuario está bloqueado
  //
  // Esto evita enumeración de usuarios.
  // --------------------------------------------------

  if (
    adminResult.recordset.length === 0
  ) {

    return {

      encontrado:
        false,

      resetUrl:
        null,
    };
  }


  const admin =
    adminResult.recordset[0];


  if (
    admin.ESTADO !== "ACTIVO"
  ) {

    return {

      encontrado:
        false,

      resetUrl:
        null,
    };
  }


  // --------------------------------------------------
  // GENERAR TOKEN
  // --------------------------------------------------

  const token =
    generarTokenReset();


  const tokenHash =
    obtenerHashToken(
      token
    );


  // --------------------------------------------------
  // TRANSACCIÓN
  // --------------------------------------------------

  const transaction =
    new sql.Transaction(
      pool
    );


  try {

    await transaction.begin();


    // --------------------------------------------------
    // INVALIDAR ENLACES ANTERIORES
    //
    // Si el administrador solicita un nuevo enlace,
    // todos los anteriores quedan inutilizables.
    // --------------------------------------------------

    await new sql.Request(
      transaction
    )

      .input(
        "idAdmin",
        sql.BigInt,
        admin.ID_ADMIN
      )

      .query(`
        UPDATE
          GestionAPIClientes.AdminPasswordResets

        SET
          FECHA_USO =
            SYSDATETIME()

        WHERE
          ID_ADMIN =
            @idAdmin

          AND FECHA_USO
            IS NULL
      `);


    // --------------------------------------------------
    // CREAR NUEVO RESET
    //
    // CODIGO_HASH se utiliza actualmente para guardar
    // el SHA-256 del token.
    //
    // El token original NO se guarda.
    // --------------------------------------------------

    const resetResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idAdmin",
          sql.BigInt,
          admin.ID_ADMIN
        )

        .input(
          "tokenHash",
          sql.VarChar(64),
          tokenHash
        )

        .input(
          "ipSolicitud",
          sql.VarChar(64),
          ipSolicitud
        )

        .query(`
          INSERT INTO
            GestionAPIClientes.AdminPasswordResets
          (
            ID_ADMIN,
            CODIGO_HASH,
            FECHA_CREACION,
            FECHA_EXPIRACION,
            FECHA_USO,
            INTENTOS,
            IP_SOLICITUD
          )

          OUTPUT
            INSERTED.ID_RESET,
            INSERTED.FECHA_EXPIRACION

          VALUES
          (
            @idAdmin,
            @tokenHash,
            SYSDATETIME(),

            DATEADD(
              MINUTE,
              ${RESET_TOKEN_MINUTES},
              SYSDATETIME()
            ),

            NULL,
            0,
            @ipSolicitud
          )
        `);


    await transaction.commit();


    return {

      encontrado:
        true,

      idReset:
        resetResult
          .recordset[0]
          .ID_RESET,

      administrador: {

        idAdmin:
          admin.ID_ADMIN,

        usuario:
          admin.USUARIO,

        nombre:
          admin.NOMBRE,

        email:
          admin.EMAIL,
      },

      // IMPORTANTE:
      // El token solamente se devuelve internamente
      // para que email.service.js pueda construir
      // el enlace.
      token,

      fechaExpiracion:
        resetResult
          .recordset[0]
          .FECHA_EXPIRACION,
    };


  } catch (error) {

    try {

      await transaction.rollback();

    } catch {

      // La transacción pudo haberse revertido
      // automáticamente.
    }


    throw error;
  }
}


// ==================================================
// VALIDAR TOKEN DE RECUPERACIÓN
// ==================================================

export async function validarTokenRecuperacion(
  token
) {

  token =
    String(
      token || ""
    ).trim();


  if (!token) {

    throw crearError(
      "El enlace de recuperación no es válido.",
      400,
      "RESET_TOKEN_REQUIRED"
    );
  }


  const tokenHash =
    obtenerHashToken(
      token
    );


  const pool =
    await getSqlPool();


  // --------------------------------------------------
  // IMPORTANTE:
  //
  // La expiración se calcula en SQL Server.
  //
  // NO usamos:
  // new Date(FECHA_EXPIRACION)
  // Date.now()
  //
  // porque puede existir diferencia entre:
  // - timezone SQL Server
  // - timezone Node.js
  //
  // Tanto la creación como la validación usan
  // SYSDATETIME().
  // --------------------------------------------------

  const result =
    await pool
      .request()

      .input(
        "tokenHash",
        sql.VarChar(64),
        tokenHash
      )

      .query(`
        SELECT TOP 1

          R.ID_RESET,
          R.ID_ADMIN,
          R.FECHA_CREACION,
          R.FECHA_EXPIRACION,
          R.FECHA_USO,

          CASE
            WHEN
              R.FECHA_EXPIRACION <=
              SYSDATETIME()

            THEN 1
            ELSE 0
          END AS EXPIRADO,

          A.USUARIO,
          A.NOMBRE,
          A.EMAIL,
          A.ESTADO

        FROM
          GestionAPIClientes.AdminPasswordResets R

        INNER JOIN
          GestionAPIClientes.Administradores A

            ON A.ID_ADMIN =
               R.ID_ADMIN

        WHERE
          R.CODIGO_HASH =
            @tokenHash

        ORDER BY
          R.ID_RESET DESC
      `);


  // --------------------------------------------------
  // TOKEN NO EXISTE
  // --------------------------------------------------

  if (
    result.recordset.length === 0
  ) {

    throw crearError(
      "El enlace de recuperación no es válido.",
      400,
      "INVALID_RESET_TOKEN"
    );
  }


  const reset =
    result.recordset[0];


  // --------------------------------------------------
  // TOKEN YA UTILIZADO
  // --------------------------------------------------

  if (
    reset.FECHA_USO
  ) {

    throw crearError(
      "El enlace de recuperación ya fue utilizado.",
      400,
      "RESET_TOKEN_USED"
    );
  }


  // --------------------------------------------------
  // TOKEN EXPIRADO
  //
  // SQL Server decide si expiró.
  // --------------------------------------------------

  if (
    Number(
      reset.EXPIRADO
    ) === 1
  ) {

    throw crearError(
      "El enlace de recuperación ha expirado.",
      400,
      "RESET_TOKEN_EXPIRED"
    );
  }


  // --------------------------------------------------
  // ADMINISTRADOR NO ACTIVO
  // --------------------------------------------------

  if (
    reset.ESTADO !== "ACTIVO"
  ) {

    throw crearError(
      "El enlace de recuperación no es válido.",
      400,
      "INVALID_RESET_TOKEN"
    );
  }


  // --------------------------------------------------
  // TOKEN VÁLIDO
  // --------------------------------------------------

  return {

    valido:
      true,

    idReset:
      reset.ID_RESET,

    idAdmin:
      reset.ID_ADMIN,

    email:
      reset.EMAIL,

    fechaExpiracion:
      reset.FECHA_EXPIRACION,
  };
}


// ==================================================
// RESTABLECER CONTRASEÑA
// ==================================================

export async function restablecerPassword({

  token,
  nuevaPassword,

}) {

  token =
    String(
      token || ""
    ).trim();


  nuevaPassword =
    validarNuevaPassword(
      nuevaPassword
    );


  if (!token) {

    throw crearError(
      "El enlace de recuperación no es válido.",
      400,
      "RESET_TOKEN_REQUIRED"
    );
  }


  const tokenHash =
    obtenerHashToken(
      token
    );


  const pool =
    await getSqlPool();


  // --------------------------------------------------
  // TRANSACCIÓN SERIALIZABLE
  //
  // Evita que el mismo token pueda utilizarse
  // simultáneamente en dos solicitudes.
  // --------------------------------------------------

  const transaction =
    new sql.Transaction(
      pool
    );


  try {

    await transaction.begin(
      sql.ISOLATION_LEVEL.SERIALIZABLE
    );


    // --------------------------------------------------
    // BUSCAR Y BLOQUEAR RESET
    //
    // UPDLOCK + HOLDLOCK:
    // evita el uso concurrente del mismo token.
    //
    // EXPIRADO se calcula directamente
    // con el reloj de SQL Server.
    // --------------------------------------------------

    const resetResult =
      await new sql.Request(
        transaction
      )

        .input(
          "tokenHash",
          sql.VarChar(64),
          tokenHash
        )

        .query(`
          SELECT TOP 1

            R.ID_RESET,
            R.ID_ADMIN,
            R.FECHA_EXPIRACION,
            R.FECHA_USO,

            CASE
              WHEN
                R.FECHA_EXPIRACION <=
                SYSDATETIME()

              THEN 1
              ELSE 0
            END AS EXPIRADO,

            A.ESTADO

          FROM
            GestionAPIClientes.AdminPasswordResets R
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

          INNER JOIN
            GestionAPIClientes.Administradores A
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

                ON A.ID_ADMIN =
                   R.ID_ADMIN

          WHERE
            R.CODIGO_HASH =
              @tokenHash

          ORDER BY
            R.ID_RESET DESC
        `);


    // --------------------------------------------------
    // TOKEN NO EXISTE
    // --------------------------------------------------

    if (
      resetResult.recordset.length ===
      0
    ) {

      throw crearError(
        "El enlace de recuperación no es válido.",
        400,
        "INVALID_RESET_TOKEN"
      );
    }


    const reset =
      resetResult.recordset[0];


    // --------------------------------------------------
    // TOKEN YA UTILIZADO
    // --------------------------------------------------

    if (
      reset.FECHA_USO
    ) {

      throw crearError(
        "El enlace de recuperación ya fue utilizado.",
        400,
        "RESET_TOKEN_USED"
      );
    }


    // --------------------------------------------------
    // TOKEN EXPIRADO
    //
    // SQL Server realiza la comparación.
    // --------------------------------------------------

    if (
      Number(
        reset.EXPIRADO
      ) === 1
    ) {

      throw crearError(
        "El enlace de recuperación ha expirado.",
        400,
        "RESET_TOKEN_EXPIRED"
      );
    }


    // --------------------------------------------------
    // ADMINISTRADOR DEBE ESTAR ACTIVO
    // --------------------------------------------------

    if (
      reset.ESTADO !== "ACTIVO"
    ) {

      throw crearError(
        "El enlace de recuperación no es válido.",
        400,
        "INVALID_RESET_TOKEN"
      );
    }


    // --------------------------------------------------
    // GENERAR HASH DE LA NUEVA CONTRASEÑA
    // --------------------------------------------------

    const passwordHash =
      await bcrypt.hash(
        nuevaPassword,
        12
      );


    // --------------------------------------------------
    // CAMBIAR CONTRASEÑA
    //
    // SESSION_VERSION + 1 invalida todas
    // las sesiones anteriores del administrador.
    // --------------------------------------------------

    const adminUpdateResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idAdmin",
          sql.BigInt,
          reset.ID_ADMIN
        )

        .input(
          "passwordHash",
          sql.VarChar(255),
          passwordHash
        )

        .query(`
          UPDATE
            GestionAPIClientes.Administradores

          SET
            PASSWORD_HASH =
              @passwordHash,

            SESSION_VERSION =
              SESSION_VERSION + 1,

            FECHA_ACTUALIZACION =
              SYSDATETIME()

          OUTPUT
            INSERTED.ID_ADMIN,
            INSERTED.SESSION_VERSION

          WHERE
            ID_ADMIN =
              @idAdmin
        `);


    if (
      adminUpdateResult.recordset.length ===
      0
    ) {

      throw crearError(
        "No se pudo actualizar la contraseña.",
        404,
        "ADMIN_NOT_FOUND"
      );
    }


    // --------------------------------------------------
    // MARCAR TOKEN ACTUAL COMO UTILIZADO
    // --------------------------------------------------

    await new sql.Request(
      transaction
    )

      .input(
        "idReset",
        sql.BigInt,
        reset.ID_RESET
      )

      .query(`
        UPDATE
          GestionAPIClientes.AdminPasswordResets

        SET
          FECHA_USO =
            SYSDATETIME()

        WHERE
          ID_RESET =
            @idReset
      `);


    // --------------------------------------------------
    // INVALIDAR CUALQUIER OTRO RESET
    // DEL MISMO ADMINISTRADOR
    // --------------------------------------------------

    await new sql.Request(
      transaction
    )

      .input(
        "idAdmin",
        sql.BigInt,
        reset.ID_ADMIN
      )

      .input(
        "idReset",
        sql.BigInt,
        reset.ID_RESET
      )

      .query(`
        UPDATE
          GestionAPIClientes.AdminPasswordResets

        SET
          FECHA_USO =
            SYSDATETIME()

        WHERE
          ID_ADMIN =
            @idAdmin

          AND ID_RESET <>
            @idReset

          AND FECHA_USO
            IS NULL
      `);


    await transaction.commit();


    return {

      success:
        true,

      message:
        "La contraseña fue restablecida correctamente.",
    };


  } catch (error) {

    try {

      await transaction.rollback();

    } catch {

      // La transacción pudo haberse revertido
      // automáticamente.
    }


    throw error;
  }
}