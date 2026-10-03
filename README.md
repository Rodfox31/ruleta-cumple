# 🎡 Ruleta del Cumple

Una ruleta de puntos (del 0 al 10) para proyectar en la tele durante una fiesta. Se dispara desde el celular escaneando un QR.

- **TV:** `index.html`, la ruleta.
- **Celular:** `control.html`, el botón gigante. Se abre solo al escanear el QR de la TV.

## Cómo usarla en la fiesta

1. En la laptop conectada a la tele, abrí la página publicada y hacé **un clic** (eso activa el sonido y la pantalla completa).
2. Escaneá el QR con el celular: se abre el control con el botón **¡GIRAR!**.
3. Al terminar el giro aparece el resultado en la TV y en el celular. **Continuar** cierra la tarjeta para volver a girar.

Se pueden conectar varios celulares a la vez. La laptop y los celulares necesitan internet; conviene que estén en el mismo Wi-Fi.

### Teclas en la TV

| Tecla | Acción |
|---|---|
| `ESPACIO` / `Enter` / flechas / `PgUp` `PgDn` | Girar, o cerrar el resultado (sirve con un presentador inalámbrico) |
| `F` | Pantalla completa |
| `M` | Silenciar |

## Personalizar

Todo lo editable está arriba de todo en `script.js`, marcado con ✏️:

- `TITULO` y `SUBTITULO`: los textos del encabezado.
- `SECTORES`: los números, colores, frases y **chances** de cada tajada. El tamaño de cada tajada es proporcional a sus chances, así que lo que ves es la probabilidad real.
- `GIRO`: la duración y las vueltas.
- `VOLUMEN`: el volumen general.

## Cómo funciona la conexión

No hay servidor propio: la TV y el celular se conectan directo por WebRTC usando [PeerJS](https://peerjs.com/). El servicio gratuito de PeerJS solo se usa para que se encuentren. El código de la sala queda guardado en el navegador de la TV, así que, si se recarga la página, los celulares se reconectan solos.

Si el celular no conecta, revisá que la TV muestre "Listo: esperando celulares". También podés escribir a mano el código que aparece abajo del QR.
