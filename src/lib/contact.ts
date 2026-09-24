// Circle's sales line. Local: 0530689203 → international: +966 53 068 9203.
export const PHONE_DISPLAY = "053 068 9203";
export const PHONE_E164 = "+966530689203";

export const whatsappUrl = (message: string) =>
  `https://wa.me/${PHONE_E164.slice(1)}?text=${encodeURIComponent(message)}`;

export const telUrl = `tel:${PHONE_E164}`;
