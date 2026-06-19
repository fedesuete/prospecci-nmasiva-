import { readFileSync } from 'fs';

const PHONE = '5491168315055';
const API_URL = 'http://testfederico_evolution-api:8080';
const API_KEY = '429683C4C977415CAAFCCE10F7D57E11';
const AUDIO_PATH = '/app/storage/audios/pitch_variante_1.ogg';

async function test() {
  const audioBuffer = readFileSync(AUDIO_PATH);
  const b64 = audioBuffer.toString('base64');

  console.log(`Audio: ${audioBuffer.length} bytes, Base64: ${b64.length} chars`);

  // Test 1: sendWhatsAppAudio con base64 puro
  console.log('\n--- TEST 1: sendWhatsAppAudio base64 puro ---');
  try {
    const r1 = await fetch(`${API_URL}/message/sendWhatsAppAudio/Autoflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: API_KEY },
      body: JSON.stringify({ number: PHONE, audio: b64 }),
    });
    console.log('Status:', r1.status, await r1.text());
  } catch (e) { console.error(e); }

  // Test 2: sendMedia con PTT
  console.log('\n--- TEST 2: sendMedia audio/ptt ---');
  try {
    const r2 = await fetch(`${API_URL}/message/sendMedia/Autoflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: API_KEY },
      body: JSON.stringify({
        number: PHONE,
        mediatype: 'audio',
        mimetype: 'audio/ogg; codecs=opus',
        media: 'data:audio/ogg;base64,' + b64,
        fileName: 'audio.ogg',
      }),
    });
    console.log('Status:', r2.status, await r2.text());
  } catch (e) { console.error(e); }

  // Test 3: sendWhatsAppAudio con data:audio/ogg;base64,
  console.log('\n--- TEST 3: sendWhatsAppAudio data:audio/ogg ---');
  try {
    const r3 = await fetch(`${API_URL}/message/sendWhatsAppAudio/Autoflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: API_KEY },
      body: JSON.stringify({ number: PHONE, audio: 'data:audio/ogg;base64,' + b64 }),
    });
    console.log('Status:', r3.status, await r3.text());
  } catch (e) { console.error(e); }

  // Test 4: sendWhatsAppAudio con data:audio/mp4;base64,
  console.log('\n--- TEST 4: sendWhatsAppAudio data:audio/mp4 ---');
  try {
    const r4 = await fetch(`${API_URL}/message/sendWhatsAppAudio/Autoflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: API_KEY },
      body: JSON.stringify({ number: PHONE, audio: 'data:audio/mp4;base64,' + b64 }),
    });
    console.log('Status:', r4.status, await r4.text());
  } catch (e) { console.error(e); }
}

test();
