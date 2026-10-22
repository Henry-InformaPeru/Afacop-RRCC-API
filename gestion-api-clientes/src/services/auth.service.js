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


// ==================================================
// JWT SECRET
// ==================================================

function obtenerJwtSecret() {

  const secret =
    String(
      process.env.ADMIN_JWT_SECRET ||
      ""
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


// ==================================================
// CREAR ADMINISTRADOR
//
// Por ahora se mantiene para compatibilidad con
// POST /api/admin/auth/crear.
//
// Más adelante la creación normal se moverá a
// SUPERADMIN.
// ==================================================

export async function crearAdministrador({

  usuario,
  password,
  nombre = null,
  email = null,
  rol = "ADMIN",

}) {

  usuario =
    String(
      usuario || ""
    )
      .trim()
      .toLowerCase();


  password =
    String(
      password || ""
    );


  nombre =
    nombre
      ? String(nombre).trim()
      : null;


  email =
    email
      ? String(email)
          .trim()
          .toLowerCase()
      : null;


  rol =
    String(
      rol || "ADMIN"
    )
      .trim()
      .toUpperCase();


  // --------------------------------------------------
  // VALIDACIONES
  // --------------------------------------------------

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


  if (
    ![
      "ADMIN",
      "SUPERADMIN",
    ].includes(rol)
  ) {

    throw crearError(
      "El rol no es válido.",
      400,
      "INVALID_ADMIN_ROLE"
    );
  }


  if (
    email &&
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


  const pool =
    await getSqlPool();


  // --------------------------------------------------
  // VALIDAR USUARIO DUPLICADO
  // --------------------------------------------------

  const duplicadoUsuario =
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
          USUARIO =
            @usuario
      `);


  if (
    duplicadoUsuario
      .recordset
      .length > 0
  ) {

    throw crearError(
      "Ya existe un administrador con ese usuario.",
      409,
      "ADMIN_ALREADY_EXISTS"
    );
  }


  // --------------------------------------------------
  // VALIDAR EMAIL DUPLICADO
  // --------------------------------------------------

  if (email) {

    const duplicadoEmail =
      await pool
        .request()

        .input(
          "email",
          sql.VarChar(150),
          email
        )

        .query(`
          SELECT TOP 1
            ID_ADMIN

          FROM
            GestionAPIClientes.Administradores

          WHERE
            EMAIL =
              @email
        `);


    if (
      duplicadoEmail
        .recordset
        .length > 0
    ) {

      throw crearError(
        "Ya existe un administrador con ese correo electrónico.",
        409,
        "ADMIN_EMAIL_ALREADY_EXISTS"
      );
    }
  }


  // --------------------------------------------------
  // HASH CONTRASEÑA
  // --------------------------------------------------

  const passwordHash =
    await bcrypt.hash(
      password,
      12
    );


  // --------------------------------------------------
  // INSERTAR
  // --------------------------------------------------

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

      .input(
        "email",
        sql.VarChar(150),
        email
      )

      .input(
        "rol",
        sql.VarChar(20),
        rol
      )

      .query(`
        INSERT INTO
          GestionAPIClientes.Administradores
        (
          USUARIO,
          PASSWORD_HASH,
          NOMBRE,
          EMAIL,
          ROL,
          ESTADO,
          SESSION_VERSION
        )

        OUTPUT
          INSERTED.ID_ADMIN,
          INSERTED.USUARIO,
          INSERTED.NOMBRE,
          INSERTED.EMAIL,
          INSERTED.ROL,
          INSERTED.ESTADO,
          INSERTED.SESSION_VERSION,
          INSERTED.FECHA_CREACION

        VALUES
        (
          @usuario,
          @passwordHash,
          @nombre,
          @email,
          @rol,
          'ACTIVO',
          1
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

    email:
      admin.EMAIL,

    rol:
      admin.ROL,

    estado:
      admin.ESTADO,

    sessionVersion:
      Number(
        admin.SESSION_VERSION
      ),

    fechaCreacion:
      admin.FECHA_CREACION,
  };
}


// ==================================================
// LOGIN
// ==================================================

export async function autenticarAdministrador({

  usuario,
  password,

}) {

  usuario =
    String(
      usuario || ""
    )
      .trim()
      .toLowerCase();


  password =
    String(
      password || ""
    );


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
          EMAIL,
          ROL,
          ESTADO,
          SESSION_VERSION

        FROM
          GestionAPIClientes.Administradores

        WHERE
          USUARIO =
            @usuario
      `);


  // --------------------------------------------------
  // USUARIO NO EXISTE
  // --------------------------------------------------

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


  // --------------------------------------------------
  // VALIDAR CONTRASEÑA
  // --------------------------------------------------

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


  // --------------------------------------------------
  // VALIDAR ESTADO
  // --------------------------------------------------

  if (
    admin.ESTADO !==
    "ACTIVO"
  ) {

    throw crearError(
      "El administrador se encuentra bloqueado.",
      403,
      "ADMIN_BLOCKED"
    );
  }


  // --------------------------------------------------
  // VALIDAR ROL
  // --------------------------------------------------

  if (
    ![
      "ADMIN",
      "SUPERADMIN",
    ].includes(
      admin.ROL
    )
  ) {

    throw crearError(
      "El administrador no tiene un rol válido.",
      403,
      "INVALID_ADMIN_ROLE"
    );
  }


  const sessionVersion =
    Number(
      admin.SESSION_VERSION
    );


  if (
    !Number.isInteger(
      sessionVersion
    ) ||
    sessionVersion < 1
  ) {

    throw crearError(
      "La versión de sesión del administrador no es válida.",
      500,
      "INVALID_SESSION_VERSION"
    );
  }


  // --------------------------------------------------
  // ACTUALIZAR ÚLTIMO LOGIN
  // --------------------------------------------------

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
        ID_ADMIN =
          @idAdmin
    `);


  // --------------------------------------------------
  // CREAR JWT
  // --------------------------------------------------

  const tokenSesion =
    jwt.sign(

      {
        usuario:
          admin.USUARIO,

        nombre:
          admin.NOMBRE,

        rol:
          admin.ROL,

        sessionVersion,
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

      email:
        admin.EMAIL,

      rol:
        admin.ROL,

      sessionVersion,
    },
  };
}


// ==================================================
// VERIFICAR JWT
// ==================================================

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