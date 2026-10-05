import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readInput } from './supply-http';
describe('supply mutation request security', () => {
 it('rejects another browser origin', async () => { const request = new Request('http://localhost/api/supplies/invoices', { method: 'POST', headers: { origin: 'https://attacker.example' }, body: '{}' }); await expect(readInput(request,z.object({}))).rejects.toThrow('INVALID_ORIGIN'); });
 it('bounds the actual body when Content-Length is absent', async () => { const request = new Request('http://localhost/api/supplies/invoices', { method: 'POST', body: 'x'.repeat(65537) }); await expect(readInput(request,z.object({}))).rejects.toThrow('INPUT_TOO_LARGE'); });
 it('does not process malformed JSON', async () => { await expect(readInput(new Request('http://localhost/api/supplies', { method:'POST', body:'{' }),z.object({}))).rejects.toThrow('INPUT_INVALID'); });
});
