import ffmpeg from 'fluent-ffmpeg';

// Convierte un archivo de audio (ej: webm grabado en el navegador) a OGG/Opus,
// que es el formato de nota de voz que espera WhatsApp.
export async function convertToOgg(inputPath: string, outputPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec('libopus')
      .audioBitrate('64k')
      .audioChannels(1)
      .format('ogg')
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`Error convirtiendo audio: ${err.message}`)))
      .run();
  });
}
