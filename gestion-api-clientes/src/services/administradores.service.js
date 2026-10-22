import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";

import {
  crearAdministrador,
} from "./auth.service.js";


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


function normalizarIdAdmin(
  idAdmin
) {

  const id =
    Number(idAdmin);


  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {

    throw crearError(
      "El administrador no es válido.",
      400,
      "INVALID_ADMIN_ID"
    );
  }


  return id;
}


function normalizarRol(
  rol
) {

  rol =
    String(
      rol || ""
    )
      .trim()
      .toUpperCase();


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


  return rol;
}


function normalizarEstado(
  estado
) {

  estado =
    String(
      estado || ""
    )
      .trim()
      .toUpperCase();


  if (
    ![
      "ACTIVO",
      "BLOQUEADO",
    ].includes(estado)
  ) {

    throw crearError(
      "El estado no es válido.",
      400,
      "INVALID_ADMIN_STATUS"
    );
  }


  return estado;
}


function validarEmail(
  email
) {

  email =
    String(
      email || ""
    )
      .trim()
      .toLowerCase();


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
// CREAR ADMINISTRADOR DESDE SUPERADMIN
// ==================================================

export async function crearAdministradorGestion({

  usuario,
  password,
  nombre = null,
  email,
  rol = "ADMIN",

}) {

  email =
    validarEmail(
      email
    );


  rol =
    normalizarRol(
      rol
    );


  return crearAdministrador({

    usuario,
    password,
    nombre,
    email,
    rol,
  });
}


// ==================================================
// LISTAR ADMINISTRADORES
// ==================================================

export async function listarAdministradores({

  page = 1,
  limit = 20,
  search = "",
  rol = "",
  estado = "",

} = {}) {

  page =
    Number(page);


  limit =
    Number(limit);


  if (
    !Number.isInteger(page) ||
    page < 1
  ) {

    page = 1;
  }


  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {

    limit = 20;
  }


  search =
    String(
      search || ""
    ).trim();


  rol =
    String(
      rol || ""
    )
      .trim()
      .toUpperCase();


  estado =
    String(
      estado || ""
    )
      .trim()
      .toUpperCase();


  if (
    rol &&
    ![
      "ADMIN",
      "SUPERADMIN",
    ].includes(rol)
  ) {

    throw crearError(
      "El filtro de rol no es válido.",
      400,
      "INVALID_ADMIN_ROLE"
    );
  }


  if (
    estado &&
    ![
      "ACTIVO",
      "BLOQUEADO",
    ].includes(estado)
  ) {

    throw crearError(
      "El filtro de estado no es válido.",
      400,
      "INVALID_ADMIN_STATUS"
    );
  }


  const offset =
    (page - 1) *
    limit;


  const pool =
    await getSqlPool();


  // --------------------------------------------------
  // TOTAL
  // --------------------------------------------------

  const totalResult =
    await pool
      .request()

      .input(
        "search",
        sql.NVarChar(200),
        `%${search}%`
      )

      .input(
        "rol",
        sql.VarChar(20),
        rol
      )

      .input(
        "estado",
        sql.VarChar(20),
        estado
      )

      .query(`
        SELECT
          COUNT(*) AS TOTAL

        FROM
          GestionAPIClientes.Administradores A

        WHERE
          (
            @search = '%%'

            OR A.USUARIO
              LIKE @search

            OR A.NOMBRE
              LIKE @search

            OR A.EMAIL
              LIKE @search
          )

          AND (
            @rol = ''
            OR A.ROL = @rol
          )

          AND (
            @estado = ''
            OR A.ESTADO = @estado
          )
      `);


  const total =
    Number(
      totalResult
        .recordset[0]
        .TOTAL
    );


  // --------------------------------------------------
  // LISTADO
  // --------------------------------------------------

  const result =
    await pool
      .request()

      .input(
        "search",
        sql.NVarChar(200),
        `%${search}%`
      )

      .input(
        "rol",
        sql.VarChar(20),
        rol
      )

      .input(
        "estado",
        sql.VarChar(20),
        estado
      )

      .input(
        "offset",
        sql.Int,
        offset
      )

      .input(
        "limit",
        sql.Int,
        limit
      )

      .query(`
        SELECT
          A.ID_ADMIN,
          A.USUARIO,
          A.NOMBRE,
          A.EMAIL,
          A.ROL,
          A.ESTADO,
          A.SESSION_VERSION,
          A.FECHA_CREACION,
          A.FECHA_ACTUALIZACION,
          A.ULTIMO_LOGIN

        FROM
          GestionAPIClientes.Administradores A

        WHERE
          (
            @search = '%%'

            OR A.USUARIO
              LIKE @search

            OR A.NOMBRE
              LIKE @search

            OR A.EMAIL
              LIKE @search
          )

          AND (
            @rol = ''
            OR A.ROL = @rol
          )

          AND (
            @estado = ''
            OR A.ESTADO = @estado
          )

        ORDER BY
          A.ID_ADMIN DESC

        OFFSET
          @offset ROWS

        FETCH NEXT
          @limit ROWS ONLY
      `);


  return {

    administradores:
      result.recordset.map(
        (admin) => ({

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

          fechaActualizacion:
            admin.FECHA_ACTUALIZACION,

          ultimoLogin:
            admin.ULTIMO_LOGIN,
        })
      ),

    paginacion: {

      page,
      limit,
      total,

      totalPaginas:
        Math.ceil(
          total /
          limit
        ),
    },
  };
}


// ==================================================
// OBTENER ADMINISTRADOR
// ==================================================

export async function obtenerAdministradorDetalle(
  idAdmin
) {

  idAdmin =
    normalizarIdAdmin(
      idAdmin
    );


  const pool =
    await getSqlPool();


  const result =
    await pool
      .request()

      .input(
        "idAdmin",
        sql.BigInt,
        idAdmin
      )

      .query(`
        SELECT TOP 1
          ID_ADMIN,
          USUARIO,
          NOMBRE,
          EMAIL,
          ROL,
          ESTADO,
          SESSION_VERSION,
          FECHA_CREACION,
          FECHA_ACTUALIZACION,
          ULTIMO_LOGIN

        FROM
          GestionAPIClientes.Administradores

        WHERE
          ID_ADMIN =
            @idAdmin
      `);


  if (
    result.recordset.length === 0
  ) {

    throw crearError(
      "Administrador no encontrado.",
      404,
      "ADMIN_NOT_FOUND"
    );
  }


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

    fechaActualizacion:
      admin.FECHA_ACTUALIZACION,

    ultimoLogin:
      admin.ULTIMO_LOGIN,
  };
}


// ==================================================
// EDITAR DATOS DEL ADMINISTRADOR
//
// No modifica:
// - contraseña
// - rol
// - estado
//
// Esos cambios tienen endpoints separados.
// ==================================================

export async function actualizarAdministrador(
  idAdmin,
  datos = {}
) {

  idAdmin =
    normalizarIdAdmin(
      idAdmin
    );


  const pool =
    await getSqlPool();


  const actualResult =
    await pool
      .request()

      .input(
        "idAdmin",
        sql.BigInt,
        idAdmin
      )

      .query(`
        SELECT TOP 1
          ID_ADMIN,
          USUARIO,
          NOMBRE,
          EMAIL,
          ROL,
          ESTADO,
          SESSION_VERSION

        FROM
          GestionAPIClientes.Administradores

        WHERE
          ID_ADMIN =
            @idAdmin
      `);


  if (
    actualResult.recordset.length ===
    0
  ) {

    throw crearError(
      "Administrador no encontrado.",
      404,
      "ADMIN_NOT_FOUND"
    );
  }


  const actual =
    actualResult.recordset[0];


  let usuario =
    datos.usuario === undefined

      ? actual.USUARIO

      : String(
          datos.usuario || ""
        )
          .trim()
          .toLowerCase();


  let nombre =
    datos.nombre === undefined

      ? actual.NOMBRE

      : (
          datos.nombre

            ? String(
                datos.nombre
              ).trim()

            : null
        );


  let email =
    datos.email === undefined

      ? actual.EMAIL

      : validarEmail(
          datos.email
        );


  if (!usuario) {

    throw crearError(
      "El usuario es obligatorio.",
      400,
      "USER_REQUIRED"
    );
  }


  email =
    validarEmail(
      email
    );


  // --------------------------------------------------
  // USUARIO DUPLICADO
  // --------------------------------------------------

  const usuarioDuplicado =
    await pool
      .request()

      .input(
        "idAdmin",
        sql.BigInt,
        idAdmin
      )

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

          AND ID_ADMIN <>
            @idAdmin
      `);


  if (
    usuarioDuplicado
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
  // EMAIL DUPLICADO
  // --------------------------------------------------

  const emailDuplicado =
    await pool
      .request()

      .input(
        "idAdmin",
        sql.BigInt,
        idAdmin
      )

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

          AND ID_ADMIN <>
            @idAdmin
      `);


  if (
    emailDuplicado
      .recordset
      .length > 0
  ) {

    throw crearError(
      "Ya existe un administrador con ese correo electrónico.",
      409,
      "ADMIN_EMAIL_ALREADY_EXISTS"
    );
  }


  const result =
    await pool
      .request()

      .input(
        "idAdmin",
        sql.BigInt,
        idAdmin
      )

      .input(
        "usuario",
        sql.VarChar(100),
        usuario
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

      .query(`
        UPDATE
          GestionAPIClientes.Administradores

        SET
          USUARIO =
            @usuario,

          NOMBRE =
            @nombre,

          EMAIL =
            @email,

          FECHA_ACTUALIZACION =
            SYSDATETIME()

        OUTPUT
          INSERTED.ID_ADMIN,
          INSERTED.USUARIO,
          INSERTED.NOMBRE,
          INSERTED.EMAIL,
          INSERTED.ROL,
          INSERTED.ESTADO,
          INSERTED.SESSION_VERSION,
          INSERTED.FECHA_ACTUALIZACION

        WHERE
          ID_ADMIN =
            @idAdmin
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

    fechaActualizacion:
      admin.FECHA_ACTUALIZACION,
  };
}


// ==================================================
// CAMBIAR ESTADO
// ==================================================

export async function actualizarEstadoAdministrador({

  idAdmin,
  estado,
  idAdminEjecutor,

}) {

  idAdmin =
    normalizarIdAdmin(
      idAdmin
    );


  idAdminEjecutor =
    normalizarIdAdmin(
      idAdminEjecutor
    );


  estado =
    normalizarEstado(
      estado
    );


  if (
    idAdmin ===
    idAdminEjecutor
  ) {

    throw crearError(
      "No puede bloquear o activar su propia cuenta desde esta operación.",
      400,
      "CANNOT_CHANGE_OWN_STATUS"
    );
  }


  const pool =
    await getSqlPool();


  const transaction =
    new sql.Transaction(
      pool
    );


  try {

    await transaction.begin(
      sql.ISOLATION_LEVEL.SERIALIZABLE
    );


    const actualResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idAdmin",
          sql.BigInt,
          idAdmin
        )

        .query(`
          SELECT
            ID_ADMIN,
            USUARIO,
            ROL,
            ESTADO,
            SESSION_VERSION

          FROM
            GestionAPIClientes.Administradores
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

          WHERE
            ID_ADMIN =
              @idAdmin
        `);


    if (
      actualResult.recordset.length ===
      0
    ) {

      throw crearError(
        "Administrador no encontrado.",
        404,
        "ADMIN_NOT_FOUND"
      );
    }


    const actual =
      actualResult.recordset[0];


    if (
      actual.ESTADO ===
      estado
    ) {

      await transaction.commit();


      return {

        idAdmin:
          actual.ID_ADMIN,

        usuario:
          actual.USUARIO,

        rol:
          actual.ROL,

        estado:
          actual.ESTADO,

        sessionVersion:
          Number(
            actual.SESSION_VERSION
          ),
      };
    }


    // --------------------------------------------------
    // NO DEJAR 0 SUPERADMIN ACTIVOS
    // --------------------------------------------------

    if (
      actual.ROL ===
        "SUPERADMIN" &&
      actual.ESTADO ===
        "ACTIVO" &&
      estado ===
        "BLOQUEADO"
    ) {

      const superAdminsResult =
        await new sql.Request(
          transaction
        )

          .input(
            "idAdmin",
            sql.BigInt,
            idAdmin
          )

          .query(`
            SELECT
              COUNT(*) AS TOTAL

            FROM
              GestionAPIClientes.Administradores
                WITH (
                  UPDLOCK,
                  HOLDLOCK
                )

            WHERE
              ROL =
                'SUPERADMIN'

              AND ESTADO =
                'ACTIVO'

              AND ID_ADMIN <>
                @idAdmin
          `);


      const otrosSuperAdmins =
        Number(
          superAdminsResult
            .recordset[0]
            .TOTAL
        );


      if (
        otrosSuperAdmins === 0
      ) {

        throw crearError(
          "No puede bloquear al último SUPERADMIN activo del sistema.",
          409,
          "LAST_ACTIVE_SUPERADMIN"
        );
      }
    }


    const result =
      await new sql.Request(
        transaction
      )

        .input(
          "idAdmin",
          sql.BigInt,
          idAdmin
        )

        .input(
          "estado",
          sql.VarChar(20),
          estado
        )

        .query(`
          UPDATE
            GestionAPIClientes.Administradores

          SET
            ESTADO =
              @estado,

            SESSION_VERSION =
              CASE
                WHEN @estado = 'BLOQUEADO'
                THEN SESSION_VERSION + 1
                ELSE SESSION_VERSION
              END,

            FECHA_ACTUALIZACION =
              SYSDATETIME()

          OUTPUT
            INSERTED.ID_ADMIN,
            INSERTED.USUARIO,
            INSERTED.ROL,
            INSERTED.ESTADO,
            INSERTED.SESSION_VERSION

          WHERE
            ID_ADMIN =
              @idAdmin
        `);


    await transaction.commit();


    const admin =
      result.recordset[0];


    return {

      idAdmin:
        admin.ID_ADMIN,

      usuario:
        admin.USUARIO,

      rol:
        admin.ROL,

      estado:
        admin.ESTADO,

      sessionVersion:
        Number(
          admin.SESSION_VERSION
        ),
    };


  } catch (error) {

    try {

      await transaction.rollback();

    } catch {

      // La transacción pudo haberse revertido.
    }


    throw error;
  }
}


// ==================================================
// CAMBIAR ROL
// ==================================================

export async function actualizarRolAdministrador({

  idAdmin,
  rol,
  idAdminEjecutor,

}) {

  idAdmin =
    normalizarIdAdmin(
      idAdmin
    );


  idAdminEjecutor =
    normalizarIdAdmin(
      idAdminEjecutor
    );


  rol =
    normalizarRol(
      rol
    );


  // Evitamos que el usuario modifique su propio rol
  // desde el panel.

  if (
    idAdmin ===
    idAdminEjecutor
  ) {

    throw crearError(
      "No puede modificar su propio rol.",
      400,
      "CANNOT_CHANGE_OWN_ROLE"
    );
  }


  const pool =
    await getSqlPool();


  const transaction =
    new sql.Transaction(
      pool
    );


  try {

    await transaction.begin(
      sql.ISOLATION_LEVEL.SERIALIZABLE
    );


    const actualResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idAdmin",
          sql.BigInt,
          idAdmin
        )

        .query(`
          SELECT
            ID_ADMIN,
            USUARIO,
            ROL,
            ESTADO,
            SESSION_VERSION

          FROM
            GestionAPIClientes.Administradores
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

          WHERE
            ID_ADMIN =
              @idAdmin
        `);


    if (
      actualResult.recordset.length ===
      0
    ) {

      throw crearError(
        "Administrador no encontrado.",
        404,
        "ADMIN_NOT_FOUND"
      );
    }


    const actual =
      actualResult.recordset[0];


    if (
      actual.ROL ===
      rol
    ) {

      await transaction.commit();


      return {

        idAdmin:
          actual.ID_ADMIN,

        usuario:
          actual.USUARIO,

        rol:
          actual.ROL,

        estado:
          actual.ESTADO,

        sessionVersion:
          Number(
            actual.SESSION_VERSION
          ),
      };
    }


    // --------------------------------------------------
    // NO DEJAR 0 SUPERADMIN ACTIVOS
    // --------------------------------------------------

    if (
      actual.ROL ===
        "SUPERADMIN" &&
      rol ===
        "ADMIN" &&
      actual.ESTADO ===
        "ACTIVO"
    ) {

      const superAdminsResult =
        await new sql.Request(
          transaction
        )

          .input(
            "idAdmin",
            sql.BigInt,
            idAdmin
          )

          .query(`
            SELECT
              COUNT(*) AS TOTAL

            FROM
              GestionAPIClientes.Administradores
                WITH (
                  UPDLOCK,
                  HOLDLOCK
                )

            WHERE
              ROL =
                'SUPERADMIN'

              AND ESTADO =
                'ACTIVO'

              AND ID_ADMIN <>
                @idAdmin
          `);


      const otrosSuperAdmins =
        Number(
          superAdminsResult
            .recordset[0]
            .TOTAL
        );


      if (
        otrosSuperAdmins === 0
      ) {

        throw crearError(
          "No puede cambiar el rol del último SUPERADMIN activo.",
          409,
          "LAST_ACTIVE_SUPERADMIN"
        );
      }
    }


    const result =
      await new sql.Request(
        transaction
      )

        .input(
          "idAdmin",
          sql.BigInt,
          idAdmin
        )

        .input(
          "rol",
          sql.VarChar(20),
          rol
        )

        .query(`
          UPDATE
            GestionAPIClientes.Administradores

          SET
            ROL =
              @rol,

            SESSION_VERSION =
              SESSION_VERSION + 1,

            FECHA_ACTUALIZACION =
              SYSDATETIME()

          OUTPUT
            INSERTED.ID_ADMIN,
            INSERTED.USUARIO,
            INSERTED.ROL,
            INSERTED.ESTADO,
            INSERTED.SESSION_VERSION

          WHERE
            ID_ADMIN =
              @idAdmin
        `);


    await transaction.commit();


    const admin =
      result.recordset[0];


    return {

      idAdmin:
        admin.ID_ADMIN,

      usuario:
        admin.USUARIO,

      rol:
        admin.ROL,

      estado:
        admin.ESTADO,

      sessionVersion:
        Number(
          admin.SESSION_VERSION
        ),
    };


  } catch (error) {

    try {

      await transaction.rollback();

    } catch {

      // Ya pudo haberse revertido.
    }


    throw error;
  }
}


// ==================================================
// CERRAR TODAS LAS SESIONES
// ==================================================

export async function cerrarSesionesAdministrador({

  idAdmin,
  idAdminEjecutor,

}) {

  idAdmin =
    normalizarIdAdmin(
      idAdmin
    );


  idAdminEjecutor =
    normalizarIdAdmin(
      idAdminEjecutor
    );


  if (
    idAdmin ===
    idAdminEjecutor
  ) {

    throw crearError(
      "Para cerrar su propia sesión utilice la opción Cerrar sesión.",
      400,
      "CANNOT_REVOKE_OWN_SESSIONS"
    );
  }


  const pool =
    await getSqlPool();


  const result =
    await pool
      .request()

      .input(
        "idAdmin",
        sql.BigInt,
        idAdmin
      )

      .query(`
        UPDATE
          GestionAPIClientes.Administradores

        SET
          SESSION_VERSION =
            SESSION_VERSION + 1,

          FECHA_ACTUALIZACION =
            SYSDATETIME()

        OUTPUT
          INSERTED.ID_ADMIN,
          INSERTED.USUARIO,
          INSERTED.ROL,
          INSERTED.ESTADO,
          INSERTED.SESSION_VERSION

        WHERE
          ID_ADMIN =
            @idAdmin
      `);


  if (
    result.recordset.length === 0
  ) {

    throw crearError(
      "Administrador no encontrado.",
      404,
      "ADMIN_NOT_FOUND"
    );
  }


  const admin =
    result.recordset[0];


  return {

    idAdmin:
      admin.ID_ADMIN,

    usuario:
      admin.USUARIO,

    rol:
      admin.ROL,

    estado:
      admin.ESTADO,

    sessionVersion:
      Number(
        admin.SESSION_VERSION
      ),

    message:
      "Las sesiones del administrador fueron invalidadas correctamente.",
  };
}