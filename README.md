# 🎡 Ruleta del Cumple

Una ruleta de puntos (del 0 al 10) para proyectar en la tele durante una fiesta. Se controla desde el celular escaneando un QR.

- **TV:** `index.html`, la ruleta con el historial de tiradas.
- **Celular:** `control.html`, los botones **¡GIRAR!**, **Continuar** y **Salir**. Se abre solo al escanear el QR de la TV.

## Cómo funciona

La pantalla de la TV tiene tres estados:

1. **QR:** espera a que alguien escanee el código. Cuando un celular abre el control, pasa sola al estado 2.
2. **Ruleta:** la rueda grande y, a la derecha, el historial de lo que fue saliendo. El giro se hace desde el celular.
3. **Resultado:** la tarjeta con los puntos y el festejo. Se cierra con **Continuar** en el celular.

Si el celular toca **Salir** o cierra la página, la TV vuelve al QR. Controla un celular a la vez: si otro escanea mientras alguien juega, le aparece "La ruleta está ocupada".

## Antes de empezar

1. En la laptop conectada a la tele, abrí la página publicada y hacé **un clic** en la pantalla. Eso activa el sonido (los navegadores no dejan sonar nada sin un clic) y pone la pantalla completa.
2. La laptop y los celulares necesitan internet; conviene que estén en el mismo Wi-Fi.

### Teclas en la TV

| Tecla | Acción |
|---|---|
| `F` | Pantalla completa |
| `M` | Silenciar |
| `R` | Borrar el historial (pide confirmación) |

## Personalizar

Todo lo editable está arriba de todo en `script.js`, marcado con ✏️:

- `TITULO`: el título de la TV y del celular.
- `SECTORES`: los números, sus frases, colores y **cuántas tajadas** tiene cada uno. Todas las tajadas son del mismo tamaño: más tajadas = más chances. Hoy son 24 (tres 0, tres 1, tres 2, tres 3; dos de cada número del 4 al 8; un 9 y un 10). El programa reparte las tajadas solo, para que los números iguales queden separados.
- `GIRO`: la duración y las vueltas.
- `VOLUMEN`: el volumen general.

El historial queda guardado en el navegador de la TV: si se recarga la página, no se pierde.

## Cómo funciona la conexión

No hay servidor propio: la TV y el celular se mandan mensajes a través de un servidor público de mensajería (MQTT por WebSocket seguro: [EMQX](https://www.emqx.com/en/mqtt/public-mqtt5-broker) y, si ese no anda, [HiveMQ](https://www.hivemq.com/mqtt/public-mqtt-broker/)). El cliente está en `mensajeria.js`, sin librerías externas. Como los mensajes pasan por ese servidor, funciona aunque la TV y el celular estén en redes distintas (por ejemplo, la laptop en Wi-Fi y el celu con datos).

- Si el celular cierra la página o se queda sin señal, el servidor le avisa a la TV y la TV vuelve al QR en menos de un segundo. Cuando el celular vuelve, se reconecta solo.
- El código de la sala queda guardado en el navegador de la TV: si se recarga la página, el celular se reconecta solo.
- El servidor es público: cualquiera que conozca el código de 6 letras podría mandar mensajes a esa sala. Para un cumple alcanza; no lo uses para nada sensible.

Si el celular no conecta, revisá que la TV muestre "Listo: esperando un celular". También podés escribir a mano el código que aparece abajo del QR.

Si cambiás el código, subí el número de versión (`?v=4`) en `index.html` y `control.html` para que los navegadores no usen archivos viejos guardados.
