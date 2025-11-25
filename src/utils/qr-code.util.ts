import QRCode from "qrcode";

/**
 * Converte a string do QR code do Baileys em uma imagem base64
 * @param qrString - String do QR code retornada pelo Baileys
 * @returns Promise<string> - Data URL da imagem QR code em base64 (data:image/png;base64,...)
 */
export async function convertQRCodeToBase64(
  qrString: string
): Promise<string> {
  try {
    // Converte a string do QR code em uma imagem PNG base64
    const dataUrl = await QRCode.toDataURL(qrString, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 300,
    });

    return dataUrl;
  } catch (error) {
    console.error("[QRCodeUtil] Erro ao converter QR code para base64:", error);
    throw new Error(`Falha ao converter QR code: ${error}`);
  }
}

/**
 * Converte a string do QR code do Baileys em buffer PNG
 * @param qrString - String do QR code retornada pelo Baileys
 * @returns Promise<Buffer> - Buffer da imagem PNG
 */
export async function convertQRCodeToBuffer(qrString: string): Promise<Buffer> {
  try {
    const buffer = await QRCode.toBuffer(qrString, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 300,
    });

    return buffer;
  } catch (error) {
    console.error("[QRCodeUtil] Erro ao converter QR code para buffer:", error);
    throw new Error(`Falha ao converter QR code: ${error}`);
  }
}

