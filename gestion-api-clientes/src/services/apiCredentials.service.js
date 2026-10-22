import crypto from "node:crypto";

import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


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
// CONTEXTO DEL ADMINISTRADOR
// ==================================================

function obtenerContextoAdministrador(
  adminActual
) {

  const idAdmin =
    Number(
      adminActual?.idAdmin
    );

  const rol =
    String(
      adminActual?.rol || ""
    )
      .trim()
      .toUpperCase();


  if (
    !Number.isInteger(idAdmin) ||
    idAdmin <= 0
  ) {

    throw crearError(
      "El administrador no es válido.",
      401,
      "INVALID_ADMIN"
    );
  }


  if (
    ![
      "ADMIN",
      "SUPERADMIN",
    ].includes(rol)
  ) {

    throw crearError(
      "El administrador no tiene un rol válido.",
      403,
      "INVALID_ADMIN_ROLE"
    );
  }


  return {

    idAdmin,

    rol,

    esSuperAdmin:
      rol === "SUPERADMIN",

  };
}


// --------------------------------------------------
// GENERAR CLIENT_ID
// --------------------------------------------------

function generarClientId() {

  const aleatorio =
    crypto
      .randomBytes(12)
      .toString("hex");

  return `sol_cli_${aleatorio}`;
}


// --------------------------------------------------
// GENERAR CLIENT_SECRET
// --------------------------------------------------

function generarClientSecret() {

  const aleatorio =
    crypto
      .randomBytes(32)
      .toString("base64url");

  return `sol_sec_${aleatorio}`;
}


// --------------------------------------------------
// GENERAR SALT
// --------------------------------------------------

function generarSalt() {

  return crypto
    .randomBytes(32)
    .toString("hex")
    .toUpperCase();
}


// --------------------------------------------------
// GENERAR HASH DEL CLIENT_SECRET
// --------------------------------------------------

function generarSecretHash(
  clientSecret,
  salt
) {

  return crypto
    .scryptSync(
      clientSecret,
      salt,
      64
    )
    .toString("hex")
    .toUpperCase();
}


// ==================================================
// CREAR CREDENCIAL API
// ==================================================

export async function crearCredencialApiCliente(
  idCliente,
  adminActual
) {

  const contextoAdmin =
    obtenerContextoAdministrador(
      adminActual
    );


  idCliente =
    Number(idCliente);


  // ------------------------------------------------
  // VALIDAR ID CLIENTE
  // ------------------------------------------------

  if (
    !Number.isInteger(
      idCliente
    ) ||
    idCliente <= 0
  ) {

    throw crearError(
      "El cliente no es válido.",
      400,
      "INVALID_CLIENT"
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


    // ==============================================
    // 1. VERIFICAR CLIENTE + PROPIEDAD
    // ==============================================

    const clienteResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .input(
          "idAdmin",
          sql.BigInt,
          contextoAdmin.idAdmin
        )

        .input(
          "esSuperAdmin",
          sql.Bit,
          contextoAdmin.esSuperAdmin
            ? 1
            : 0
        )

        .query(`
          SELECT
            ID_CLIENTE,
            ESTADO,
            RAZON_SOCIAL,
            NOMBRES,
            APELLIDO_PATERNO,
            APELLIDO_MATERNO,
            ID_ADMIN

          FROM
            GestionAPIClientes.Clientes

          WHERE
            ID_CLIENTE =
              @idCliente

            AND
            (
              @esSuperAdmin = 1

              OR ID_ADMIN =
                @idAdmin
            )
        `);


    if (
      clienteResult
        .recordset
        .length === 0
    ) {

      throw crearError(
        "Cliente no encontrado.",
        404,
        "CLIENT_NOT_FOUND"
      );
    }


    const cliente =
      clienteResult.recordset[0];


    if (
      cliente.ESTADO !==
      "ACTIVO"
    ) {

      throw crearError(
        "El cliente no se encuentra activo.",
        403,
        "CLIENT_NOT_ACTIVE"
      );
    }


    // ==============================================
    // 2. VERIFICAR SI YA TIENE CREDENCIAL
    // ==============================================

    const existenteResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .query(`
          SELECT
            ID_CREDENCIAL,
            CLIENT_ID,
            ESTADO

          FROM
            GestionAPIClientes.ApiCredenciales
            WITH (
              UPDLOCK,
              HOLDLOCK
            )

          WHERE
            ID_CLIENTE =
              @idCliente
        `);


    if (
      existenteResult
        .recordset
        .length > 0
    ) {

      throw crearError(
        "El cliente ya tiene una credencial API.",
        409,
        "API_CREDENTIAL_ALREADY_EXISTS"
      );
    }


    // ==============================================
    // 3. GENERAR CREDENCIALES
    // ==============================================

    const clientId =
      generarClientId();


    const clientSecret =
      generarClientSecret();


    const salt =
      generarSalt();


    const secretHash =
      generarSecretHash(
        clientSecret,
        salt
      );


    // ==============================================
    // 4. INSERTAR CREDENCIAL
    // ==============================================

    const credencialResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .input(
          "clientId",
          sql.VarChar(80),
          clientId
        )

        .input(
          "secretHash",
          sql.Char(128),
          secretHash
        )

        .input(
          "salt",
          sql.Char(64),
          salt
        )

        .query(`
          INSERT INTO
            GestionAPIClientes.ApiCredenciales
          (
            ID_CLIENTE,
            CLIENT_ID,
            CLIENT_SECRET_HASH,
            CLIENT_SECRET_SALT,
            ESTADO
          )

          OUTPUT
            INSERTED.ID_CREDENCIAL,
            INSERTED.ID_CLIENTE,
            INSERTED.CLIENT_ID,
            INSERTED.ESTADO,
            INSERTED.FECHA_CREACION

          VALUES
          (
            @idCliente,
            @clientId,
            @secretHash,
            @salt,
            'ACTIVO'
          )
        `);


    const credencial =
      credencialResult
        .recordset[0];


    await transaction.commit();


    // ==============================================
    // 5. NOMBRE DEL CLIENTE
    // ==============================================

    const nombre =
      cliente.RAZON_SOCIAL ||
      [
        cliente.NOMBRES,
        cliente.APELLIDO_PATERNO,
        cliente.APELLIDO_MATERNO,
      ]
        .filter(Boolean)
        .join(" ");


    // ==============================================
    // IMPORTANTE:
    //
    // CLIENT_SECRET solamente se devuelve aquí.
    // Nunca se guarda en texto plano.
    // ==============================================

    return {

      idCredencial:
        Number(
          credencial.ID_CREDENCIAL
        ),

      idCliente,

      nombre,

      clientId:
        credencial.CLIENT_ID,

      clientSecret,

      estado:
        credencial.ESTADO,

      fechaCreacion:
        credencial.FECHA_CREACION,

    };


  } catch (
    error
  ) {

    try {

      await transaction.rollback();

    } catch {

      // Puede haberse revertido
      // automáticamente.

    }

    throw error;
  }
}


// ==================================================
// REGENERAR CLIENT_SECRET
// ==================================================

export async function regenerarSecretApiCliente(
  idCliente,
  adminActual
) {

  const contextoAdmin =
    obtenerContextoAdministrador(
      adminActual
    );


  idCliente =
    Number(idCliente);


  if (
    !Number.isInteger(
      idCliente
    ) ||
    idCliente <= 0
  ) {

    throw crearError(
      "El cliente no es válido.",
      400,
      "INVALID_CLIENT"
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


    // ==============================================
    // 1. BUSCAR CREDENCIAL + VALIDAR PROPIEDAD
    // ==============================================

    const credencialResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .input(
          "idAdmin",
          sql.BigInt,
          contextoAdmin.idAdmin
        )

        .input(
          "esSuperAdmin",
          sql.Bit,
          contextoAdmin.esSuperAdmin
            ? 1
            : 0
        )

        .query(`
          SELECT
            AC.ID_CREDENCIAL,
            AC.CLIENT_ID,
            AC.ESTADO

          FROM
            GestionAPIClientes.ApiCredenciales AC
            WITH (
              UPDLOCK,
              HOLDLOCK
            )

          INNER JOIN
            GestionAPIClientes.Clientes C

              ON C.ID_CLIENTE =
                 AC.ID_CLIENTE

          WHERE
            AC.ID_CLIENTE =
              @idCliente

            AND
            (
              @esSuperAdmin = 1

              OR C.ID_ADMIN =
                @idAdmin
            )
        `);


    if (
      credencialResult
        .recordset
        .length === 0
    ) {

      throw crearError(
        "El cliente no tiene una credencial API.",
        404,
        "API_CREDENTIAL_NOT_FOUND"
      );
    }


    const credencial =
      credencialResult
        .recordset[0];


    // ==============================================
    // 2. GENERAR NUEVO SECRET
    // ==============================================

    const clientSecret =
      generarClientSecret();


    const salt =
      generarSalt();


    const secretHash =
      generarSecretHash(
        clientSecret,
        salt
      );


    // ==============================================
    // 3. ACTUALIZAR
    //
    // CLIENT_ID se mantiene.
    // Solo cambia CLIENT_SECRET.
    // ==============================================

    const updateResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .input(
          "secretHash",
          sql.Char(128),
          secretHash
        )

        .input(
          "salt",
          sql.Char(64),
          salt
        )

        .input(
          "idAdmin",
          sql.BigInt,
          contextoAdmin.idAdmin
        )

        .input(
          "esSuperAdmin",
          sql.Bit,
          contextoAdmin.esSuperAdmin
            ? 1
            : 0
        )

        .query(`
          UPDATE AC

          SET
            AC.CLIENT_SECRET_HASH =
              @secretHash,

            AC.CLIENT_SECRET_SALT =
              @salt,

            AC.ESTADO =
              'ACTIVO',

            AC.FECHA_ACTUALIZACION =
              SYSUTCDATETIME(),

            AC.FECHA_REVOCACION =
              NULL

          FROM
            GestionAPIClientes.ApiCredenciales AC

          INNER JOIN
            GestionAPIClientes.Clientes C

              ON C.ID_CLIENTE =
                 AC.ID_CLIENTE

          WHERE
            AC.ID_CLIENTE =
              @idCliente

            AND
            (
              @esSuperAdmin = 1

              OR C.ID_ADMIN =
                @idAdmin
            )
        `);


    if (
      updateResult.rowsAffected[0] !==
      1
    ) {

      throw crearError(
        "No fue posible regenerar la credencial API.",
        409,
        "API_CREDENTIAL_REGENERATION_FAILED"
      );
    }


    await transaction.commit();


    // ==============================================
    // SOLO EN ESTE MOMENTO SE MUESTRA EL SECRET
    // ==============================================

    return {

      idCredencial:
        Number(
          credencial.ID_CREDENCIAL
        ),

      idCliente,

      clientId:
        credencial.CLIENT_ID,

      clientSecret,

      estado:
        "ACTIVO",

    };


  } catch (
    error
  ) {

    try {

      await transaction.rollback();

    } catch {

      // Puede haberse revertido.

    }

    throw error;
  }
}


// ==================================================
// CAMBIAR ESTADO DE CREDENCIAL
// ==================================================

export async function cambiarEstadoCredencialApi(
  idCliente,
  estado,
  adminActual
) {

  const contextoAdmin =
    obtenerContextoAdministrador(
      adminActual
    );


  idCliente =
    Number(idCliente);


  estado =
    String(
      estado || ""
    )
      .trim()
      .toUpperCase();


  if (
    !Number.isInteger(
      idCliente
    ) ||
    idCliente <= 0
  ) {

    throw crearError(
      "El cliente no es válido.",
      400,
      "INVALID_CLIENT"
    );
  }


  if (
    ![
      "ACTIVO",
      "BLOQUEADO",
      "REVOCADO",
    ].includes(
      estado
    )
  ) {

    throw crearError(
      "Estado de credencial no válido.",
      400,
      "INVALID_CREDENTIAL_STATUS"
    );
  }


  const pool =
    await getSqlPool();


  const result =
    await pool
      .request()

      .input(
        "idCliente",
        sql.BigInt,
        idCliente
      )

      .input(
        "estado",
        sql.VarChar(20),
        estado
      )

      .input(
        "idAdmin",
        sql.BigInt,
        contextoAdmin.idAdmin
      )

      .input(
        "esSuperAdmin",
        sql.Bit,
        contextoAdmin.esSuperAdmin
          ? 1
          : 0
      )

      .query(`
        UPDATE AC

        SET
          AC.ESTADO =
            @estado,

          AC.FECHA_ACTUALIZACION =
            SYSUTCDATETIME(),

          AC.FECHA_REVOCACION =
            CASE

              WHEN @estado = 'REVOCADO'
                THEN SYSUTCDATETIME()

              ELSE NULL

            END

        OUTPUT
          INSERTED.ID_CREDENCIAL,
          INSERTED.ID_CLIENTE,
          INSERTED.CLIENT_ID,
          INSERTED.ESTADO

        FROM
          GestionAPIClientes.ApiCredenciales AC

        INNER JOIN
          GestionAPIClientes.Clientes C

            ON C.ID_CLIENTE =
               AC.ID_CLIENTE

        WHERE
          AC.ID_CLIENTE =
            @idCliente

          AND
          (
            @esSuperAdmin = 1

            OR C.ID_ADMIN =
              @idAdmin
          )
      `);


  if (
    result
      .recordset
      .length === 0
  ) {

    throw crearError(
      "Credencial API no encontrada.",
      404,
      "API_CREDENTIAL_NOT_FOUND"
    );
  }


  const credencial =
    result.recordset[0];


  return {

    idCredencial:
      Number(
        credencial.ID_CREDENCIAL
      ),

    idCliente:
      Number(
        credencial.ID_CLIENTE
      ),

    clientId:
      credencial.CLIENT_ID,

    estado:
      credencial.ESTADO,

  };
}