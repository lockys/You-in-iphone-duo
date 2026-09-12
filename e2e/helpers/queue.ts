import { request as httpRequest } from 'node:http';
// Real slow multipart connections hold workers without a mock API.
export async function occupyWorker() {
  const request = httpRequest('http://127.0.0.1:3100/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=queue-test' },
  });
  request.on('error', () => {});
  const started = new Promise<void>((resolve, reject) => {
    request.once('error', reject);
    request.once('response', (response) => {
      response.once('data', () => resolve());
      response.resume();
    });
  });
  request.write(
    '--queue-test\r\nContent-Disposition: form-data; name="file"; filename="slow.mp4"\r\nContent-Type: video/mp4\r\n\r\n',
  );
  try {
    await started;
  } catch (error) {
    request.destroy();
    throw error;
  }
  return () => request.destroy();
}
