# Registro de funciones — KitchOps

<!-- GENERADO por `npm run generate:function-registry` desde base44/functions/*/function.meta.json.
     No lo edites a mano: edita el function.meta.json y regenera. CI falla si está desactualizado. -->

Módulo 26 del estándar ACACIA: cada función dice para qué existe, quién la llama y cuándo se puede retirar.

16 funciones.

| función | estado | triggers | auth | inquilino | propósito |
|---|---|---|---|---|---|
| [`acaciaControl`](#acaciacontrol) | active | `external:mission-control` | hmac | no | Puente firmado (HMAC con la llave derivada de la app, Módulo 15) por el que Mission Control lee y escribe esta app como servicio: licencias, uso, tickets, sesiones y correos de seguimiento. Ve todos los inquilinos a propósito; las entidades de lectura y escritura las nombra Mission Control en cada llamada (las de abajo son las de su configuración para KitchOps). |
| [`alertas`](#alertas) | active | `frontend` | user | sí | Router de las alertas del inquilino: recalcularlas bajo demanda y marcarlas como leídas. |
| [`business`](#business) | active | `frontend` | user | sí | Router de los datos del propio negocio: perfil, configuración de umbrales y código de invitación. |
| [`complete-onboarding`](#complete-onboarding) | active | `frontend` | user | sí | Alta de una cuenta en un restaurante: crear uno nuevo (queda business_admin, prueba de 30 días) o solicitar unirse con código. Único escritor de role/business_id en el alta. |
| [`delete-account`](#delete-account) | active | `frontend` | user | sí | Zona de peligro (Módulo 7): borra todos los datos del restaurante tras confirmar su nombre exacto. No borra cuentas User; las libera a onboarding. |
| [`gastos`](#gastos) | active | `frontend` | user | sí | Router de escritura de gastos (Gasto) con permiso, inquilino y facturación re-verificados en el servidor. |
| [`generarAlertas`](#generaralertas) | active | **ninguno** | hmac | sí | Barrido "nocturno" de alertas para TODOS los restaurantes, cada uno aislado y con sus umbrales; salta los suspendidos. PERO NADA LO PROGRAMA: medido el 2026-10-14, `base44 functions list` no le muestra automatización, no hay workflow en base44/workflows/ y Mission Control no lo llama. Hoy las alertas sólo se generan con el botón "Recalcular" (alertas.generarAlertasSafe). Decisión pendiente: programarlo o retirarlo. |
| [`health`](#health) | active | **ninguno** | hmac | no | Sonda de salud del Módulo 5: un viaje real al almacén de entidades, con el bearer derivado de la app en x-health-secret. Mission Control NO la usa (sondea con acaciaControl.ping, ver api/_lib/sync/syncHealth.js) y no se encontró ningún monitor externo que la llame: está para una persona o un monitor que todavía no existe. |
| [`ingresos`](#ingresos) | active | `frontend` | user | sí | Router de escritura de cortes de plataformas (IngresoPlataforma); la conciliación del depósito exige Ingresos:conciliar. |
| [`inventario`](#inventario) | active | `frontend` | user | sí | Router de escritura de insumos (InventarioItem); el stock se ajusta por delta, nunca por valor absoluto. |
| [`manage-member`](#manage-member) | active | `frontend` | user | sí | Equipo del restaurante (Cuenta > Equipo): cambiar rol, quitar miembros y decidir solicitudes de unión. Único camino que escribe business_id a quien entra con código. |
| [`permisos`](#permisos) | active | `frontend` | user | sí | Router del perfil de permisos del personal (PermissionProfile). |
| [`proveedores`](#proveedores) | active | `frontend` | user | sí | Router de escritura de proveedores (Proveedor). |
| [`soporte`](#soporte) | active | `frontend` | user | sí | Router de soporte del lado del inquilino (Módulo 8): el ticket se escribe aquí primero y Mission Control lo trae por acaciaControl. |
| [`whatsapp`](#whatsapp) | active | `external:zernio`<br>`external:meta` | hmac | sí | Webhook entrante del agente de WhatsApp: el único endpoint público. Verifica la firma del proveedor antes de leer, responde 2xx de inmediato, reclama el id del evento y resuelve el inquilino por WhatsAppConfig; luego registra gastos, cortes y stock con los mismos permisos que la app. |
| [`whatsappAdmin`](#whatsappadmin) | active | `frontend` | user | sí | Router de la configuración del agente de WhatsApp de cada restaurante: proveedor, números autorizados y mensaje de prueba. |

## acaciaControl

Puente firmado (HMAC con la llave derivada de la app, Módulo 15) por el que Mission Control lee y escribe esta app como servicio: licencias, uso, tickets, sesiones y correos de seguimiento. Ve todos los inquilinos a propósito; las entidades de lectura y escritura las nombra Mission Control en cada llamada (las de abajo son las de su configuración para KitchOps).

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `external:mission-control`
- **Auth:** hmac · **filtra por inquilino:** no
- **Lee:** `AppSession`, `Business`, `Gasto`, `IngresoPlataforma`, `InventarioItem`, `SupportTicket`, `SupportTicketMessage`, `User`
- **Escribe:** `AppSession`, `Business`, `SupportTicket`, `SupportTicketMessage`
- **Pruebas:** —

| acción | propósito | callers |
|---|---|---|
| `emails.sendFollowup` | Envía un correo que Mission Control ya redactó (seguimiento, aviso de alta, aviso de ticket). | `external:mission-control:api/_lib/emailFollowup.js`<br>`external:mission-control:api/_lib/newTenantAlert.js`<br>`external:mission-control:api/_lib/ingestTicket.js` |
| `emails.status` | Historial de correos de un inquilino desde la entidad de bitácora de correo. KitchOps no tiene esa entidad y Mission Control no configura email_log para esta app, así que hoy nadie la llama aquí; el bridge es el mismo archivo en todo el portafolio. | **ninguno** |
| `license.set` | Escribe billing_status, plan y fechas del Business. Único escritor de billing_status (Módulo 1). | `external:mission-control:api/_lib/control/license-action.js`<br>`external:mission-control:api/_lib/control/payment-confirm.js`<br>`external:mission-control:api/cron/license-lifecycle.js`<br>`external:mission-control:api/cron/renewal-reminders.js` |
| `licenses.list` | Lista los Business (la licencia) para el sync de licencias. | `external:mission-control:api/_lib/sync/syncLicenses.js` |
| `ping` | Sonda de salud: Mission Control la usa para la fila diaria de app_health. | `external:mission-control:api/_lib/sync/syncHealth.js` |
| `sessions.list` | Lista AppSession para el panel de sesiones. | `external:mission-control:api/_lib/sync/syncSessions.js`<br>`external:mission-control:api/_lib/control/sessions.js`<br>`external:mission-control:api/_lib/control/session-revoke.js` |
| `sessions.revoke` | Marca sesiones como revocadas (cierre de sesión remoto). | `external:mission-control:api/_lib/control/session-revoke.js` |
| `tenants.contacts` | Resuelve los business_admin de cada Business como destinatarios. | `external:mission-control:api/_lib/emailFollowup.js` |
| `tickets.list` | Lista SupportTicket para el sync diario y para el aviso en tiempo real (ticket-pull, que Soporte.jsx dispara al crear un ticket). | `external:mission-control:api/_lib/sync/syncTickets.js`<br>`external:mission-control:api/_lib/ingest/ticket-pull.js` |
| `tickets.thread` | Mensajes de un ticket (SupportTicketMessage). | `external:mission-control:api/_lib/control/tickets.js` |
| `tickets.update` | Respuesta de soporte y cambio de estado de un ticket. | `external:mission-control:api/_lib/control/tickets.js`<br>`external:mission-control:api/_lib/sweepResolvedTickets.js`<br>`external:mission-control:api/_lib/sync/autoCloseResolved.js` |
| `usage.byTenant` | Cuenta registros por business_id, sin datos del registro. | `external:mission-control:api/_lib/control/usage-by-tenant.js` |
| `usage.summary` | Cuenta registros de Gasto/IngresoPlataforma/InventarioItem como señal de uso. | `external:mission-control:api/_lib/sync/syncUsage.js` |

## alertas

Router de las alertas del inquilino: recalcularlas bajo demanda y marcarlas como leídas.

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `frontend`
- **Auth:** user · **filtra por inquilino:** sí
- **Lee:** `Alerta`, `AppSettings`, `Business`, `Gasto`, `IngresoPlataforma`, `InventarioItem`, `PermissionProfile`
- **Escribe:** `Alerta`, `AuditLog`
- **Pruebas:** `base44/tests/permissions_test.ts`

| acción | propósito | callers |
|---|---|---|
| `generarAlertasSafe` | Botón "Recalcular": corre el motor de alertas sólo para el negocio de quien llama (Alertas:generate). Hoy es la ÚNICA vía por la que se generan alertas: el barrido nocturno generarAlertas no lo programa nada. | `src/pages/Alertas.jsx` |
| `markReadSafe` | Marca una, varias o todas las alertas abiertas como leídas (Alertas:mark_read). | `src/pages/Alertas.jsx`<br>`src/pages/Dashboard.jsx` |

## business

Router de los datos del propio negocio: perfil, configuración de umbrales y código de invitación.

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `frontend`
- **Auth:** user · **filtra por inquilino:** sí
- **Lee:** `AppSettings`, `Business`, `PermissionProfile`
- **Escribe:** `AppSettings`, `AuditLog`, `Business`
- **Pruebas:** `base44/tests/permissions_test.ts`

| acción | propósito | callers |
|---|---|---|
| `rotateInviteCodeSafe` | Rota o desactiva el código de invitación (Cuenta:manage_members). | `src/pages/Cuenta.jsx` |
| `saveAppSettingsSafe` | Crea o actualiza AppSettings (umbrales de alertas) del negocio (Configuracion:edit). | `src/pages/Configuracion.jsx` |
| `updateBusinessSafe` | Edita el perfil del restaurante con lista blanca de campos: nunca toca billing_status ni la licencia (Cuenta:edit_profile). | `src/pages/Cuenta.jsx` |

## complete-onboarding

Alta de una cuenta en un restaurante: crear uno nuevo (queda business_admin, prueba de 30 días) o solicitar unirse con código. Único escritor de role/business_id en el alta.

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `frontend`
- **Auth:** user · **filtra por inquilino:** sí
- **Lee:** `AppSettings`, `Business`, `User`
- **Escribe:** `AppSettings`, `AuditLog`, `Business`, `User`
- **Pruebas:** `base44/tests/join_requests_test.ts`, `base44/tests/trial_days_test.ts`

| acción | propósito | callers |
|---|---|---|
| `cancel` | Retira la solicitud pendiente de quien llama. | `src/pages/Onboarding.jsx` |
| `create` | Crea el Business, siembra AppSettings y deja a quien llama como business_admin (o conserva admin de plataforma). | `src/pages/Onboarding.jsx` |
| `join` | Registra una solicitud pendiente (User.pending_business_id) con el código de invitación; no da acceso. | `src/pages/Onboarding.jsx` |
| `status` | Devuelve la solicitud pendiente de quien llama (sobrevive a recargar). | `src/pages/Onboarding.jsx` |

## delete-account

Zona de peligro (Módulo 7): borra todos los datos del restaurante tras confirmar su nombre exacto. No borra cuentas User; las libera a onboarding.

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `frontend`
- **Auth:** user · **filtra por inquilino:** sí
- **Lee:** `Business`, `User`
- **Escribe:** `Alerta`, `AppSettings`, `AuditLog`, `Business`, `Gasto`, `IngresoPlataforma`, `InventarioItem`, `PermissionProfile`, `Proveedor`, `SupportTicket`, `SupportTicketMessage`, `User`, `WhatsAppConfig`, `WhatsAppConversacion`, `WhatsAppMensaje`
- **Pruebas:** —

| acción | propósito | callers |
|---|---|---|
| `default` | Borra el negocio indicado; sólo su business_admin o el admin de plataforma. | `src/pages/Cuenta.jsx` |

## gastos

Router de escritura de gastos (Gasto) con permiso, inquilino y facturación re-verificados en el servidor.

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `frontend`
- **Auth:** user · **filtra por inquilino:** sí
- **Lee:** `Business`, `Gasto`, `PermissionProfile`
- **Escribe:** `AuditLog`, `Gasto`
- **Pruebas:** `base44/tests/permissions_test.ts`

| acción | propósito | callers |
|---|---|---|
| `createGastoSafe` | Registra un gasto (Gastos:create). | `src/pages/Gastos.jsx` |
| `deleteGastoSafe` | Borra un gasto y deja el registro completo en AuditLog (Gastos:delete). | `src/pages/Gastos.jsx` |
| `updateGastoSafe` | Edita un gasto; facturado y pagado llevan sus propias llaves (Gastos:edit, :mark_facturado, :mark_pagado). | `src/pages/Gastos.jsx` |

## generarAlertas

Barrido "nocturno" de alertas para TODOS los restaurantes, cada uno aislado y con sus umbrales; salta los suspendidos. PERO NADA LO PROGRAMA: medido el 2026-10-14, `base44 functions list` no le muestra automatización, no hay workflow en base44/workflows/ y Mission Control no lo llama. Hoy las alertas sólo se generan con el botón "Recalcular" (alertas.generarAlertasSafe). Decisión pendiente: programarlo o retirarlo.

- **Estado:** active · **creada:** 2026-08-18 · **retirar cuando:** —
- **Triggers:** **ninguno**
- **Auth:** hmac · **filtra por inquilino:** sí
- **Lee:** `Alerta`, `AppSettings`, `Business`, `Gasto`, `IngresoPlataforma`, `InventarioItem`
- **Escribe:** `Alerta`
- **Pruebas:** —

| acción | propósito | callers |
|---|---|---|
| `default` | Recorre los Business y persiste las alertas nuevas de cada uno. Exige el bearer derivado (x-cron-secret o x-health-secret). | **ninguno** |

## health

Sonda de salud del Módulo 5: un viaje real al almacén de entidades, con el bearer derivado de la app en x-health-secret. Mission Control NO la usa (sondea con acaciaControl.ping, ver api/_lib/sync/syncHealth.js) y no se encontró ningún monitor externo que la llame: está para una persona o un monitor que todavía no existe.

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** **ninguno**
- **Auth:** hmac · **filtra por inquilino:** no
- **Lee:** `Business`
- **Escribe:** —
- **Pruebas:** —

| acción | propósito | callers |
|---|---|---|
| `default` | Lee un Business y devuelve status/latency_ms; 503 si el almacén no responde. | **ninguno** |

## ingresos

Router de escritura de cortes de plataformas (IngresoPlataforma); la conciliación del depósito exige Ingresos:conciliar.

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `frontend`
- **Auth:** user · **filtra por inquilino:** sí
- **Lee:** `Business`, `IngresoPlataforma`, `PermissionProfile`
- **Escribe:** `AuditLog`, `IngresoPlataforma`
- **Pruebas:** `base44/tests/permissions_test.ts`

| acción | propósito | callers |
|---|---|---|
| `conciliarIngresoSafe` | Acción estrecha "me depositaron X" con su propia línea de auditoría (Ingresos:conciliar). Sin caller desde que se creó (2026-08-19): la pantalla concilia por updateIngresoSafe. | **ninguno** |
| `createIngresoSafe` | Registra un corte (Ingresos:create). | `src/pages/Ingresos.jsx` |
| `deleteIngresoSafe` | Borra un corte (Ingresos:delete). | `src/pages/Ingresos.jsx` |
| `updateIngresoSafe` | Edita un corte; tocar los campos de depósito exige además Ingresos:conciliar. | `src/pages/Ingresos.jsx` |

## inventario

Router de escritura de insumos (InventarioItem); el stock se ajusta por delta, nunca por valor absoluto.

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `frontend`
- **Auth:** user · **filtra por inquilino:** sí
- **Lee:** `Business`, `InventarioItem`, `PermissionProfile`
- **Escribe:** `AuditLog`, `InventarioItem`
- **Pruebas:** `base44/tests/permissions_test.ts`

| acción | propósito | callers |
|---|---|---|
| `ajustarStockSafe` | Ajusta el stock por delta (Inventario:edit_stock). | `src/pages/Inventario.jsx` |
| `createItemSafe` | Da de alta un insumo (Inventario:create; el costo pide Inventario:edit_costo). | `src/pages/Inventario.jsx` |
| `deleteItemSafe` | Borra un insumo (Inventario:delete). | `src/pages/Inventario.jsx` |
| `updateItemSafe` | Edita un insumo (Inventario:edit_item; el costo pide Inventario:edit_costo). | `src/pages/Inventario.jsx` |

## manage-member

Equipo del restaurante (Cuenta > Equipo): cambiar rol, quitar miembros y decidir solicitudes de unión. Único camino que escribe business_id a quien entra con código.

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `frontend`
- **Auth:** user · **filtra por inquilino:** sí
- **Lee:** `Business`, `User`
- **Escribe:** `AuditLog`, `User`
- **Pruebas:** `base44/tests/join_requests_test.ts`

| acción | propósito | callers |
|---|---|---|
| `approve_request` | Aprueba una solicitud con rol business_admin o staff (nunca admin). | `src/pages/Cuenta.jsx` |
| `change_role` | Cambia el rol de un miembro sin dejar el negocio sin business_admin. | `src/pages/Cuenta.jsx` |
| `list_requests` | Lista las solicitudes pendientes del negocio (sólo email, nombre y fecha). | `src/pages/Cuenta.jsx` |
| `reject_request` | Rechaza una solicitud y la limpia. | `src/pages/Cuenta.jsx` |
| `remove` | Quita a un miembro: limpiar su business_id es la baja. | `src/pages/Cuenta.jsx` |

## permisos

Router del perfil de permisos del personal (PermissionProfile).

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `frontend`
- **Auth:** user · **filtra por inquilino:** sí
- **Lee:** `Business`, `PermissionProfile`
- **Escribe:** `AuditLog`, `PermissionProfile`
- **Pruebas:** `base44/tests/permissions_test.ts`

| acción | propósito | callers |
|---|---|---|
| `savePermissionProfileSafe` | Guarda los overrides de permisos del staff; sólo llaves conocidas (Cuenta:manage_members). | `src/pages/Permisos.jsx` |

## proveedores

Router de escritura de proveedores (Proveedor).

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `frontend`
- **Auth:** user · **filtra por inquilino:** sí
- **Lee:** `Business`, `Gasto`, `PermissionProfile`, `Proveedor`
- **Escribe:** `AuditLog`, `Proveedor`
- **Pruebas:** `base44/tests/permissions_test.ts`

| acción | propósito | callers |
|---|---|---|
| `createProveedorSafe` | Da de alta un proveedor (Proveedores:create). | `src/pages/Proveedores.jsx` |
| `deleteProveedorSafe` | Borra un proveedor, o lo desactiva si tiene gastos registrados (Proveedores:delete). | `src/pages/Proveedores.jsx` |
| `updateProveedorSafe` | Edita un proveedor (Proveedores:edit). | `src/pages/Proveedores.jsx` |

## soporte

Router de soporte del lado del inquilino (Módulo 8): el ticket se escribe aquí primero y Mission Control lo trae por acaciaControl.

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `frontend`
- **Auth:** user · **filtra por inquilino:** sí
- **Lee:** `Business`, `PermissionProfile`, `SupportTicket`
- **Escribe:** `AuditLog`, `SupportTicket`, `SupportTicketMessage`
- **Pruebas:** `base44/tests/permissions_test.ts`

| acción | propósito | callers |
|---|---|---|
| `createTicketSafe` | Crea el ticket y su primer mensaje (Soporte:create). Soporte.jsx avisa después a Mission Control por ticket-pull. | `src/pages/Soporte.jsx` |
| `markThreadReadSafe` | Limpia la marca de "hay respuesta" al abrir el hilo. | `src/pages/Soporte.jsx` |
| `replyTicketSafe` | Respuesta del inquilino; author_role fijo a tenant. | `src/pages/Soporte.jsx` |

## whatsapp

Webhook entrante del agente de WhatsApp: el único endpoint público. Verifica la firma del proveedor antes de leer, responde 2xx de inmediato, reclama el id del evento y resuelve el inquilino por WhatsAppConfig; luego registra gastos, cortes y stock con los mismos permisos que la app.

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `external:zernio`, `external:meta`
- **Auth:** hmac · **filtra por inquilino:** sí
- **Lee:** `Alerta`, `Business`, `Gasto`, `IngresoPlataforma`, `InventarioItem`, `PermissionProfile`, `WhatsAppConfig`, `WhatsAppConversacion`, `WhatsAppEvento`, `WhatsAppMensaje`
- **Escribe:** `AuditLog`, `Gasto`, `IngresoPlataforma`, `InventarioItem`, `WhatsAppConfig`, `WhatsAppConversacion`, `WhatsAppEvento`, `WhatsAppMensaje`
- **Pruebas:** `base44/tests/whatsapp_test.ts`, `base44/tests/permissions_test.ts`

| acción | propósito | callers |
|---|---|---|
| `default` | Un mensaje entrante del proveedor que ese restaurante eligió en WhatsAppConfig (Zernio o Meta Cloud API); el GET de verificación de Meta también entra aquí. | `external:zernio`<br>`external:meta` |

## whatsappAdmin

Router de la configuración del agente de WhatsApp de cada restaurante: proveedor, números autorizados y mensaje de prueba.

- **Estado:** active · **creada:** 2026-08-19 · **retirar cuando:** —
- **Triggers:** `frontend`
- **Auth:** user · **filtra por inquilino:** sí
- **Lee:** `Business`, `PermissionProfile`, `WhatsAppConfig`, `WhatsAppConversacion`
- **Escribe:** `AuditLog`, `WhatsAppConfig`
- **Pruebas:** `base44/tests/permissions_test.ts`

| acción | propósito | callers |
|---|---|---|
| `saveConfigSafe` | Crea o actualiza WhatsAppConfig; rechaza un id de cuenta que ya reclama otro negocio (WhatsApp:configure). | `src/pages/WhatsApp.jsx` |
| `saveNumerosSafe` | Guarda la lista de teléfonos autorizados y su rol (WhatsApp:manage_numbers). | `src/pages/WhatsApp.jsx` |
| `sendTestSafe` | Envía un mensaje de prueba a un número que ya está en la lista (WhatsApp:configure). | `src/pages/WhatsApp.jsx` |
