import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Health Route', () => {
  it('returns health status response with services details', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBeDefined();
    const payload = JSON.parse(response.payload);
    expect(payload).toHaveProperty('status');
    expect(payload).toHaveProperty('services');
    expect(payload.services).toHaveProperty('database');
    expect(payload.services).toHaveProperty('redis');
  });
});
