import assert from 'node:assert/strict';
import { buildAdminDashboard, chatTrainingExamplesForClient, createChatTranscript, createFeedbackReport, feedbackReportsForClient, formatFeedbackReportEmail, updateChatTranscriptReviewInState, updateFeedbackReportInState } from '../lib/shared.js';
import { createD1LikeStorage } from '../lib/storage.js';

try {
  const storage = createD1LikeStorage(null, { allowInMemory: true });
  const created = createFeedbackReport({
    type: 'bug',
    message: 'CREATE ORDER does not do anything on mobile after login.'
  }, {
    reporterLogin: 'tester',
    pagePath: '/order',
    currentTab: 'work',
    source: 'qa'
  });

  assert.equal(created.type, 'bug');
  assert.equal(created.status, 'open');
  assert.equal(created.reporterLogin, 'tester');
  assert.equal(created.context.pagePath, '/order');
  assert.ok(created.title.includes('CREATE ORDER'));

  const email = formatFeedbackReportEmail(created);
  assert.equal(email.to, 'support@aiagent-marketplace.net');
  assert.equal(email.from, 'support@aiagent-marketplace.net');
  assert.ok(email.subject.includes('CAIt Report Issue'));
  assert.ok(email.raw.includes('Report ID:'));
  const bulkCreatedAt = new Date(Date.parse(created.createdAt) - (24 * 60 * 60 * 1000)).toISOString();
  const followupCreatedAt = new Date(Date.parse(created.createdAt) + 1000).toISOString();

  await storage.mutate(async (draft) => {
    if (!Array.isArray(draft.feedbackReports)) draft.feedbackReports = [];
    draft.feedbackReports.unshift(created);
    if (!Array.isArray(draft.chatTranscripts)) draft.chatTranscripts = [];
    draft.chatTranscripts.unshift(createChatTranscript({
      prompt: 'hi cait',
      answer: 'Hi. What would you like to do?',
      answerKind: 'assist',
      sessionId: 'guest_session_1'
    }, {
      loggedIn: false,
      authProvider: 'guest',
      now: created.createdAt
    }));
    draft.chatTranscripts.unshift(createChatTranscript({
      prompt: 'Need pricing details',
      answer: 'Pricing depends on scope and provider usage.',
      answerKind: 'assist',
      sessionId: 'guest_session_1'
    }, {
      loggedIn: false,
      authProvider: 'guest',
      now: followupCreatedAt
    }));
    draft.chatTranscripts.unshift(createChatTranscript({
      prompt: 'Prepare a market research order',
      answer: 'Task: research\nGoal: prepare a market research order\nDeliver: concise summary',
      answerKind: 'assist',
      sessionId: 'member_session_1'
    }, {
      loggedIn: true,
      authProvider: 'google-oauth',
      login: 'yasuikunihiro@gmail.com',
      now: created.createdAt
    }));
    draft.chatTranscripts.unshift(createChatTranscript({
      prompt: 'Include competitor shortlist',
      answer: 'Please confirm target market and 3 closest competitors first.',
      answerKind: 'assist',
      sessionId: 'member_session_1'
    }, {
      loggedIn: true,
      authProvider: 'google-oauth',
      login: 'yasuikunihiro@gmail.com',
      now: followupCreatedAt
    }));
    draft.accounts.unshift({
      id: 'acct_tester',
      login: 'tester@example.com',
      profile: { displayName: 'Tester' },
      billing: { depositBalance: 20 },
      payout: {},
      stripe: {},
      apiAccess: { orderKeys: [] },
      githubAppAccess: { repos: [] },
      createdAt: created.createdAt,
      updatedAt: created.createdAt
    });
    for (let index = 0; index < 620; index += 1) {
      draft.chatTranscripts.unshift(createChatTranscript({
        prompt: `bulk transcript ${index}`,
        answer: 'Handled in QA',
        answerKind: 'assist'
      }, {
        loggedIn: false,
        authProvider: 'guest',
        now: bulkCreatedAt
      }));
    }
  });

  const state = await storage.getState();
  assert.equal(state.feedbackReports.length, 1);

  const updated = updateFeedbackReportInState(state, created.id, { status: 'resolved' }, { login: 'owner' });
  assert.equal(updated.status, 'resolved');
  assert.equal(updated.reviewedBy, 'owner');
  assert.ok(updated.reviewedAt);

  const clientReports = feedbackReportsForClient(state, 10);
  assert.equal(clientReports.length, 1);
  assert.equal(clientReports[0].id, created.id);
  assert.equal(clientReports[0].status, 'resolved');
  assert.equal(clientReports[0].reviewedBy, 'owner');

  const transcriptToReview = state.chatTranscripts.find((item) => item.prompt === 'Prepare a market research order');
  assert.ok(transcriptToReview, 'expected a logged-in transcript to review');
  const reviewingTranscript = updateChatTranscriptReviewInState(state, transcriptToReview.id, {
    reviewStatus: 'reviewing',
    expectedHandling: 'Ask one focused clarifying question, then prepare the research draft.',
    improvementNote: 'Avoid restating internal routing details.'
  }, { login: 'reviewer@example.com' });
  assert.equal(reviewingTranscript.reviewStatus, 'reviewing');
  assert.equal(reviewingTranscript.reviewedBy, 'reviewer@example.com');
  assert.equal(reviewingTranscript.expectedHandling, 'Ask one focused clarifying question, then prepare the research draft.');
  assert.equal(reviewingTranscript.improvementNote, 'Avoid restating internal routing details.');
  assert.ok(reviewingTranscript.reviewedAt);

  const fixedTranscript = updateChatTranscriptReviewInState(state, transcriptToReview.id, {
    reviewStatus: 'fixed'
  }, { login: 'reviewer@example.com' });
  assert.equal(fixedTranscript.reviewStatus, 'fixed');
  const trainingExamples = chatTrainingExamplesForClient(state, 10);
  assert.equal(trainingExamples.length, 1);
  assert.equal(trainingExamples[0].id, transcriptToReview.id);
  assert.equal(trainingExamples[0].targetOutput.expectedHandling, 'Ask one focused clarifying question, then prepare the research draft.');
  assert.equal(trainingExamples[0].targetOutput.improvementNote, 'Avoid restating internal routing details.');

  const adminDashboard = buildAdminDashboard(state, { operator: 'yasuikunihiro@gmail.com' });
  assert.equal(adminDashboard.summary.accounts.total, 1);
  assert.equal(adminDashboard.summary.reports.total, 1);
  assert.equal(adminDashboard.summary.chats.total, 622);
  assert.equal(adminDashboard.summary.chats.turnsTotal, 624);
  assert.equal(adminDashboard.summary.chats.mine, 1);
  assert.equal(adminDashboard.summary.chats.guestUnknown, 621);
  assert.equal(adminDashboard.chatHandling.handledNonMine, 1);
  assert.equal(adminDashboard.chatHandling.needsReviewNonMine, 620);
  assert.equal(adminDashboard.chats.length, 300);
  assert.equal(adminDashboard.chats[0].sessionId, 'member_session_1');
  assert.equal(adminDashboard.chats[0].turnCount, 2);
  assert.equal(adminDashboard.chats[1].sessionId, 'guest_session_1');
  assert.equal(adminDashboard.chats[1].turnCount, 2);
  assert.ok(adminDashboard.chats.slice(2).every((chat) => String(chat.prompt || '').startsWith('bulk transcript ')));
  assert.equal(adminDashboard.chatHandling.byStatus.faq_answered, 1);
  assert.equal(adminDashboard.chatHandling.byStatus.needs_review, 620);
  assert.equal(adminDashboard.accounts[0].login, 'tester@example.com');
  const groupedDashboard = buildAdminDashboard({
    ...state,
    chatTranscripts: state.chatTranscripts.filter((chat) => ['guest_session_1', 'member_session_1'].includes(chat.sessionId))
  }, { operator: 'nobody@example.com' });
  const groupedGuest = groupedDashboard.chats.find((chat) => chat.sessionId === 'guest_session_1');
  assert.ok(groupedGuest);
  assert.equal(groupedGuest.turnCount, 2);
  assert.equal(groupedGuest.handlingStatus, 'faq_answered');
  const groupedMember = groupedDashboard.chats.find((chat) => chat.sessionId === 'member_session_1');
  assert.ok(groupedMember);
  assert.equal(groupedMember.turnCount, 2);
  assert.equal(groupedMember.handlingStatus, 'clarified');

  console.log('feedback qa passed');
} finally {
}
