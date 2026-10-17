const request = require('supertest');

const app = require('../app');

describe('Express app basics', () => {
  test('GET /api/health returns service health data', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        uptime: expect.any(Number),
        timestamp: expect.any(String),
      })
    );
  });

  test('Unknown routes return 404 JSON response', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  test('Malformed JSON request body returns 400 JSON response', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"invalid": }');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ error: 'Malformed JSON payload' });
  });
});
