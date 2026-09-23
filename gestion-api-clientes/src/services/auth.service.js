import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


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


function obtenerJwtSecret() {

  const secret =
    String(
      process.env.ADMIN_JWT_SECRET || ""
    ).trim();

  if (!secret) {
    throw crearError(
      "ADMIN_JWT_SECRET no está configurado.",
      500,
      "JWT_SECRET_NOT_CONFIGURED"
    );
  }

  return secret;
}


// --------------------------------------------------
// CREAR ADMINISTRADOR
// --------------------------------------------------

export async function crearAdministrador({
  usuario,
  password,
  nombre = null,
}) {

  usuario =
    String(usuario || "")
      .trim()
      .toLowerCase();

  password =
    String(password || "");

  nombre =
    nombre
      ? String(nombre).trim()
      : null;


  if (!usuario) {
    throw crearError(
      "El usuario es obligatorio.",
      400,
      "USER_REQUIRED"
    );
  }


  if (
    !password ||
    password.length < 8
  ) {
    throw crearError(
      "La contraseña debe tener al menos 8 caracteres.",
      400,
      "INVALID_PASSWORD"
    );
  }


  const pool =
    await getSqlPool();


  // Validar duplicado
  const duplicado =
    await pool
      .request()

      .input(
        "usuario",
        sql.VarChar(100),
        usuario
      )

      .query(`
        SELECT TOP 1
          ID_ADMIN

        FROM
          GestionAPIClientes.Administradores

        WHERE
          USUARIO = @usuario
      `);


  if (
    duplicado.recordset.length > 0
  ) {
    throw crearError(
      "Ya existe un administrador con ese usuario.",
      409,
      "ADMIN_ALREADY_EXISTS"
    );
  }


  // Hash de contraseña
  const passwordHash =
    await bcrypt.hash(
      password,
      12
    );


  const result =
    await pool
      .request()

      .input(
        "usuario",
        sql.VarChar(100),
        usuario
      )

      .input(
        "passwordHash",
        sql.VarChar(255),
        passwordHash
      )

      .input(
        "nombre",
        sql.NVarChar(150),
        nombre
      )

      .query(`
        INSERT INTO
          GestionAPIClientes.Administradores
        (
          USUARIO,
          PASSWORD_HASH,
          NOMBRE,
          ESTADO
        )

        OUTPUT
          INSERTED.ID_ADMIN,
          INSERTED.USUARIO,
          INSERTED.NOMBRE,
          INSERTED.ESTADO,
          INSERTED.FECHA_CREACION

        VALUES
        (
          @usuario,
          @passwordHash,
          @nombre,
          'ACTIVO'
        )
      `);


  const admin =
    result.recordset[0];


  return {
    idAdmin:
      admin.ID_ADMIN,

    usuario:
      admin.USUARIO,

    nombre:
      admin.NOMBRE,

    estado:
      admin.ESTADO,

    fechaCreacion:
      admin.FECHA_CREACION,
  };
}


// --------------------------------------------------
// LOGIN
// --------------------------------------------------

export async function autenticarAdministrador({
  usuario,
  password,
}) {

  usuario =
    String(usuario || "")
      .trim()
      .toLowerCase();

  password =
    String(password || "");


  if (
    !usuario ||
    !password
  ) {
    throw crearError(
      "Usuario y contraseña son obligatorios.",
      400,
      "CREDENTIALS_REQUIRED"
    );
  }


  const pool =
    await getSqlPool();


  const result =
    await pool
      .request()

      .input(
        "usuario",
        sql.VarChar(100),
        usuario
      )

      .query(`
        SELECT TOP 1
          ID_ADMIN,
          USUARIO,
          PASSWORD_HASH,
          NOMBRE,
          ESTADO

        FROM
          GestionAPIClientes.Administradores

        WHERE
          USUARIO = @usuario
      `);


  if (
    result.recordset.length === 0
  ) {
    throw crearError(
      "Usuario o contraseña incorrectos.",
      401,
      "INVALID_CREDENTIALS"
    );
  }


  const admin =
    result.recordset[0];


  const passwordValido =
    await bcrypt.compare(
      password,
      admin.PASSWORD_HASH
    );


  if (!passwordValido) {
    throw crearError(
      "Usuario o contraseña incorrectos.",
      401,
      "INVALID_CREDENTIALS"
    );
  }


  if (
    admin.ESTADO !== "ACTIVO"
  ) {
    throw crearError(
      "El administrador se encuentra bloqueado.",
      403,
      "ADMIN_BLOCKED"
    );
  }


  await pool
    .request()

    .input(
      "idAdmin",
      sql.BigInt,
      admin.ID_ADMIN
    )

    .query(`
      UPDATE
        GestionAPIClientes.Administradores

      SET
        ULTIMO_LOGIN =
          SYSDATETIME(),

        FECHA_ACTUALIZACION =
          SYSDATETIME()

      WHERE
        ID_ADMIN = @idAdmin
    `);


  const tokenSesion =
    jwt.sign(
      {
        usuario:
          admin.USUARIO,

        nombre:
          admin.NOMBRE,
      },

      obtenerJwtSecret(),

      {
        subject:
          String(
            admin.ID_ADMIN
          ),

        expiresIn:
          "8h",
      }
    );


  return {
    tokenSesion,

    administrador: {
      idAdmin:
        admin.ID_ADMIN,

      usuario:
        admin.USUARIO,

      nombre:
        admin.NOMBRE,
    },
  };
}


// --------------------------------------------------
// VERIFICAR JWT
// --------------------------------------------------

export function verificarTokenAdministrador(
  token
) {

  try {

    return jwt.verify(
      token,
      obtenerJwtSecret()
    );

  } catch {
    throw crearError(
      "La sesión no es válida o ha expirado.",
      401,
      "INVALID_ADMIN_SESSION"
    );
  }
}