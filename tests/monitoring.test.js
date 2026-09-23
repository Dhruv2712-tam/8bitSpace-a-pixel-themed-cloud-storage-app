import { describe, expect, it } from 'vitest';
import { stripPrivateErrorData } from '../src/lib/monitoring.js';

describe('Sentry privacy boundary', () => {
  it('removes private account data and OAuth codes from captured errors', () => {
    const event = stripPrivateErrorData({
      request: { url: 'https://app.example/?code=secret' },
      user: { email: 'private@example.com' },
      breadcrumbs: [{ message: 'private-file.pdf' }],
      extra: { file: 'private-file.pdf' },
      contexts: { response: { body: 'private' } },
      tags: { name: 'private' },
      transaction: 'private-file.pdf',
      message: 'private-file.pdf',
      exception: { values: [{
        type: 'TypeError', value: 'private-file.pdf', mechanism: { data: 'private' },
        stacktrace: { frames: [{ filename: 'https://app.example/main.js?code=secret', context_line: 'private', vars: { file: 'private' } }] },
      }] },
    });
    expect(event.exception.values[0].type).toBe('TypeError');
    expect(event.exception.values[0].stacktrace.frames[0].filename).toBe('https://app.example/main.js');
    expect(JSON.stringify(event)).not.toMatch(/private|secret/);
  });
});
