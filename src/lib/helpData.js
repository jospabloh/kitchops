// The user manual, as data.
//
// Kept as a structured array rather than a page of prose so it can be searched,
// deep-linked from the screen it describes, and — the reason that matters —
// reviewed as a list when a feature changes. A manual written as one long
// document goes stale invisibly; a manual written as N entries goes stale
// visibly, because the entry for the thing you changed is right there.
//
// Written for the person who runs the restaurant, not for someone who already
// knows the software: every entry starts from what they're trying to do.

export const MANUAL = [
  {
    id: "empezar",
    titulo: "Empezar",
    entradas: [
      {
        q: "¿Qué hace KitchOps exactamente?",
        a: "Lleva la cuenta de lo que sale (gastos), lo que entra de las plataformas de delivery (cortes), lo que hay en el almacén (inventario) y te avisa cuando algo se sale de lo normal. No es un punto de venta ni un sistema de comandas: es el control de atrás, el que normalmente vive en una libreta o en un Excel.",
      },
      {
        q: "¿Por dónde empiezo?",
        a: "Por los gastos. Captura una semana completa y ya vas a ver a dónde se te va el dinero. Después da de alta tus insumos con su mínimo, para que te avise cuando toque pedir. Los cortes de plataformas los puedes ir metiendo conforme lleguen.",
      },
      {
        q: "¿Puedo tener más de un restaurante?",
        a: "Sí. Cada uno es independiente: sus gastos, su inventario, su equipo. Cambias de uno a otro desde el nombre del negocio, arriba a la izquierda. Los números de uno nunca se mezclan con los del otro.",
      },
      {
        q: "¿Cómo invito a mi equipo?",
        a: "En Cuenta → Equipo hay un código de invitación. Se lo pasas y la persona envía una solicitud; tú la apruebas ahí mismo y eliges su rol (dueño/gerente o personal de cocina). Sin tu aprobación no ve nada. Si el código se te sale de las manos, generas otro y el anterior deja de servir al instante.",
      },
    ],
  },
  {
    id: "gastos",
    titulo: "Gastos",
    entradas: [
      {
        q: "¿Qué cuento como gasto?",
        a: "Todo lo que sale del negocio: la compra de insumos, la luz, la renta, el mantenimiento del refri, la despensa. Si el dinero salió, va aquí.",
      },
      {
        q: "¿Para qué sirve marcar 'facturado' y 'pagado'?",
        a: "Son dos cosas distintas que se confunden seguido. 'Facturado' es que ya tienes la factura — sin ella el gasto no es deducible. 'Pagado' es que ya saldaste ese cargo de la tarjeta. Un gasto puede estar facturado y sin pagar, o pagado y sin factura. KitchOps te avisa de los dos casos.",
      },
      {
        q: "¿Por qué no puedo borrar un gasto?",
        a: "Borrar un gasto cambia los números de una semana que quizá ya reportaste, sin dejar rastro en la pantalla. Por eso sólo el dueño o el gerente puede hacerlo. Si te equivocaste al capturar, edítalo: queda anotado en la Bitácora qué cambió.",
      },
    ],
  },
  {
    id: "cortes",
    titulo: "Cortes de plataformas",
    entradas: [
      {
        q: "¿Qué es un corte?",
        a: "Lo que Rappi, Uber Eats o Didi te reportan que vendiste en la semana. El corte y el depósito no siempre coinciden: entre comisiones, cancelaciones y ajustes, a veces te depositan menos.",
      },
      {
        q: "¿Por qué capturar el corte Y el depósito?",
        a: "Porque la diferencia entre los dos es exactamente lo que te están descontando. Si sólo capturas uno, no hay nada que comparar. Cuando metes los dos, KitchOps te dice al instante si cuadra o si faltó dinero.",
      },
      {
        q: "Todavía no me depositan, ¿qué hago?",
        a: "Captura el corte y deja el depósito vacío. Aparece como pendiente y te lo recuerda hasta que lo registres. No pongas cero: cero significa 'me depositaron nada', que es distinto de 'aún no llega'.",
      },
      {
        q: "¿Qué es el número de semana?",
        a: "Es la semana del año en formato AAAA-SS. La semana 34 de 2026 se escribe 2026-34. KitchOps la calcula sola cuando registras un corte nuevo; sólo cámbiala si estás capturando una semana pasada.",
      },
    ],
  },
  {
    id: "inventario",
    titulo: "Inventario",
    entradas: [
      {
        q: "¿Tengo que capturar todo lo que hay en la cocina?",
        a: "No. Da de alta lo que de verdad te duele que se acabe a media comida: la proteína, lo que más rota, lo caro. Un inventario de 200 cosas que nadie actualiza sirve menos que uno de 15 que sí.",
      },
      {
        q: "¿Qué es el mínimo?",
        a: "La cantidad a partir de la cual quieres que te avise. Ponlo en lo que te alcanza para un par de días, no en cero: si te avisa cuando ya no hay, el aviso llegó tarde. Si lo dejas en 0, ese insumo nunca genera alerta.",
      },
      {
        q: "¿Por qué los botones de + y − y no escribir la cantidad?",
        a: "Porque en una cocina dos personas cuentan al mismo tiempo. Si los dos escriben 'quedan 8', el segundo borra el trabajo del primero. Con + y − cada quien registra lo que movió y las cuentas salen bien. Para un conteo físico completo sí puedes escribir la cantidad, desde Editar.",
      },
    ],
  },
  {
    id: "alertas",
    titulo: "Alertas",
    entradas: [
      {
        q: "¿De dónde salen las alertas?",
        a: "KitchOps revisa cada noche tus gastos, cortes e inventario. Si un proveedor te está cobrando mucho más que el mes pasado, si un depósito no llegó, si un insumo bajó del mínimo o si tienes tickets sin factura, te lo pone aquí.",
      },
      {
        q: "¿Qué quieren decir los colores?",
        a: "Rojo es hoy: te falta dinero o te quedaste sin algo. Amarillo es esta semana: vale la pena verlo antes de que crezca. Verde es un aviso, sin prisa.",
      },
      {
        q: "Marqué una como lista y volvió a aparecer.",
        a: "Porque la causa sigue ahí. Si archivas 'stock bajo: jitomate' pero no compras jitomate, la próxima revisión la vuelve a levantar. Archivar dice 'ya la vi', no 'ya la resolví'.",
      },
      {
        q: "¿Puedo cambiar cuándo me avisa?",
        a: "Sí, en Configuración. Ahí defines a partir de qué porcentaje de aumento te avisa de un gasto y a partir de cuántos pesos marca un depósito faltante en rojo.",
      },
    ],
  },
  {
    id: "whatsapp",
    titulo: "El agente de WhatsApp",
    entradas: [
      {
        q: "¿Qué puedo pedirle?",
        a: 'Registrar gastos ("registra 850 de verduras con La Central"), mover inventario ("saqué 3 kilos de carne"), capturar cortes y preguntarle cómo va la semana. También puedes mandarle la foto de un ticket y él lo lee y lo registra.',
      },
      {
        q: "¿Quién puede escribirle?",
        a: "Sólo los números que tú autorices, en WhatsApp → Quién puede. A cualquier otro le contesta que ese número es sólo para el equipo, y no hace nada más. Es importante: quien esté en esa lista puede registrar gastos desde su celular sin contraseña.",
      },
      {
        q: "¿El agente puede hacer más que la persona en la app?",
        a: "No, y ese es el punto. Cada número de la lista actúa con un rol — personal o dueño — y el agente respeta exactamente los mismos permisos. Si a alguien le quitaste el permiso de borrar gastos, tampoco puede borrarlos pidiéndoselo al agente.",
      },
      {
        q: "¿Cómo sé qué registró?",
        a: "Todo lo que hace queda en la Bitácora, marcado como 'Por WhatsApp' y con el número de quien se lo pidió. En la pestaña Conversaciones ves el mensaje original y qué acciones ejecutó.",
      },
      {
        q: "Se equivocó al capturar un gasto.",
        a: "Edítalo o bórralo desde Gastos, como cualquier otro. Si se equivoca seguido, ayuda mucho llenar 'Lo que debe saber de tu cocina' en la configuración del agente: ahí le explicas cómo le llaman a las cosas en tu negocio.",
      },
    ],
  },
  {
    id: "equipo",
    titulo: "Equipo y permisos",
    entradas: [
      {
        q: "¿Cuál es la diferencia entre dueño y personal?",
        a: "El dueño o gerente ve todo, incluidas las cifras de dinero, y configura el negocio. El personal captura el día a día — gastos, inventario, cortes — pero no ve el resumen financiero ni toca la configuración.",
      },
      {
        q: "Quiero que alguien del personal sí vea los totales.",
        a: "En Permisos puedes darle permisos puntuales sin volverlo dueño. Cada permiso que cambias queda marcado como personalizado, y puedes regresarlo al valor por defecto cuando quieras.",
      },
      {
        q: "Se fue un empleado, ¿qué hago?",
        a: "En Cuenta → Equipo lo quitas. Pierde el acceso de inmediato. Si además estaba autorizado en WhatsApp, quítalo también de esa lista — son dos accesos distintos. Y si tienes dudas de quién más tiene el código de invitación, genera uno nuevo.",
      },
    ],
  },
  {
    id: "cuenta",
    titulo: "Tu cuenta",
    entradas: [
      {
        q: "¿Qué significa 'solo lectura'?",
        a: "Que tu licencia venció. Puedes consultar todo lo tuyo, pero no guardar cambios nuevos. Tus datos siguen completos: en cuanto se reactiva, todo vuelve a funcionar igual.",
      },
      {
        q: "¿Cómo renuevo o cambio de plan?",
        a: "Escríbenos desde Soporte y lo vemos contigo. El estado de la licencia no se cambia desde la app.",
      },
      {
        q: "¿Puedo llevarme mis datos?",
        a: "Sí, cuando quieras. En Cuenta → General, 'Exportar mis datos' te descarga un archivo con todo: gastos, cortes, inventario, proveedores y alertas. Son tuyos.",
      },
      {
        q: "¿Qué pasa si elimino el negocio?",
        a: "Se borra todo el contenido para siempre y no hay forma de recuperarlo. Las cuentas de tu equipo no se eliminan: siguen existiendo y pueden entrar a otros negocios, sólo pierden el acceso a éste. Exporta tus datos antes.",
      },
    ],
  },
];

/** Flattened, lowercased index for the manual's search box. */
export function buscarEnManual(termino) {
  const q = termino.trim().toLowerCase();
  if (!q) return MANUAL;
  return MANUAL.map((seccion) => ({
    ...seccion,
    entradas: seccion.entradas.filter(
      (e) => e.q.toLowerCase().includes(q) || e.a.toLowerCase().includes(q),
    ),
  })).filter((s) => s.entradas.length > 0);
}
