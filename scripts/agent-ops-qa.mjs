import assert from 'node:assert/strict';
import { createD1LikeStorage } from '../lib/storage.js';

const storage = createD1LikeStorage(null);

await storage.replaceState({
  agents: [
    {
      id: 'agent_ops_qa',
      name: 'OPS_QA',
      description: 'Operational QA agent',
      taskTypes: ['ops', 'summary'],
      premiumRate: 0.2,
      basicRate: 0.1,
      successRate: 0.88,
      avgLatencySec: 14,
      online: false,
      token: 'secret',
      earnings: 10,
      owner: 'qa',
      manifestUrl: 'https://example.test/.well-known/agent.json',
      manifestSource: 'qa',
      metadata: {
        manifest: {
          healthcheckUrl: 'https://example.test/api/health',
          jobEndpoint: 'https://example.test/api/jobs'
        }
      },
      verificationStatus: 'verification_failed',
      verificationCheckedAt: '2026-04-05T00:00:00.000Z',
      verificationError: 'Healthcheck failed with status 404',
      verificationDetails: {
        category: 'healthcheck_http',
        code: 'healthcheck_http_error',
        reason: 'Healthcheck failed with status 404',
        healthcheckUrl: 'https://example.test/api/health',
        details: {
          statusCode: 404,
          ownershipChallenge: 'skipped',
          service: null
        }
      },
      createdAt: '2026-04-05T00:00:00.000Z',
      updatedAt: '2026-04-05T00:00:00.000Z'
    }
  ],
  jobs: [],
  events: []
});

const state = await storage.getState();
const agent = state.agents[0];

assert.ok(agent);
assert.equal(agent.verificationStatus, 'verification_failed');
assert.equal(agent.verificationError, 'Healthcheck failed with status 404');
assert.equal(agent.verificationDetails.code, 'healthcheck_http_error');
assert.equal(agent.verificationDetails.category, 'healthcheck_http');
assert.equal(agent.verificationDetails.healthcheckUrl, 'https://example.test/api/health');
assert.equal(agent.verificationDetails.details.statusCode, 404);
assert.equal(agent.online, false);

console.log('agent ops qa passed');
