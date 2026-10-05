process.env.DATABASE_URL ||= "postgresql://localhost/unit_test_unused";
const assert = require('assert');
const prisma = require('../src/config/prisma');
const obligations = require('../src/services/customerPaymentObligation.service');
const jobs = require('../src/services/job.service');
const notices = require('../src/services/notification.service');
const events = require('../src/services/notificationEvents.service');
const { isConfirmationDeadlineReached } = require('../src/utils/completionDeadline.util');
(async () => {
  for (const snapshot of [null, 'INVALID', 'TWO_PAYMENT_50_50', 'SINGLE_PAYMENT_UPFRONT', 'SINGLE_PAYMENT_ON_COMPLETION']) {
    for (const progress of ['NONE', 'FIRST_PAID', null]) {
      assert.strictEqual(jobs.completionBalanceStillDue({paymentModeSnapshot:snapshot, paymentProgress:progress}, {}), true);
    }
    assert.strictEqual(jobs.completionBalanceStillDue({paymentModeSnapshot:snapshot, paymentProgress:'FULLY_PAID'}, {}), false);
  }
  assert.strictEqual(jobs.completionBalanceStillDue({legacyEscrowV2:true}, {}), false);
  assert.strictEqual(jobs.completionBalanceStillDue({}, {courierFlow:true}), false);
  for (const deadline of [null, 'invalid', '2099-01-01']) {
    assert.strictEqual(isConfirmationDeadlineReached({status:'IN_PROGRESS'}, {statusOverride:'AWAITING_CONFIRMATION', confirmationDeadlineAt:deadline}), false);
  }
  const originals = [];
  const mock = (object, key, value) => { originals.push(() => {object[key] = value;}); object[key] = value; };
  let rows = [], openCase = false;
  let user = {id:'customer', role:'CUSTOMER', blocked:false, marketplaceRestricted:false, marketplaceRestrictedReason:null};
  const past = new Date(Date.now() - 1000), future = new Date(Date.now() + 86400000);
  const row = {id:'debt', jobId:'job', status:'DUE', amount:50, restrictionStartsAt:past, dueAt:future, job:{status:'IN_PROGRESS',paymentProgress:'FIRST_PAID'}};
  try {
    mock(prisma.customerPaymentObligation, 'findMany', async () => rows);
    mock(prisma.jobDispute, 'findFirst', async () => openCase ? {id:'case'} : null);
    mock(prisma.user, 'findUnique', async () => user);
    mock(prisma.user, 'updateMany', async ({where,data}) => {
      if (where.marketplaceRestrictedReason && where.marketplaceRestrictedReason !== user.marketplaceRestrictedReason) return {count:0};
      Object.assign(user,data); return {count:1};
    });
    mock(prisma.auditLog, 'create', async () => ({}));
    rows = [row];
    for (const guard of [obligations.assertCustomerMarketplaceSpendAllowed, obligations.assertCustomerCanStartPaidTransaction]) {
      await assert.rejects(guard('customer'), e => e.statusCode === 403);
    }
    assert.strictEqual(user.marketplaceRestricted, false, 'guard must enforce before worker updates flag');
    assert.strictEqual(await obligations.customerHasQualifyingUnpaidObligation('customer', prisma, past), true);
    rows = [{...row,restrictionStartsAt:null,dueAt:past}];
    await assert.rejects(obligations.assertCustomerMarketplaceSpendAllowed('customer'), e => e.statusCode === 403);
    rows = [{...row,job:{...row.job,paymentProgress:'FULLY_PAID'}}];
    await obligations.assertCustomerMarketplaceSpendAllowed('customer');
    rows = [{...row,status:'PAUSED'}];
    assert.strictEqual(await obligations.customerHasQualifyingUnpaidObligation('customer'), false);
    rows = [row]; openCase = true;
    assert.strictEqual(await obligations.customerHasQualifyingUnpaidObligation('customer'), false);
    openCase = false; rows = [];
    for (const reason of ['fraud investigation', null]) {
      user = {...user,marketplaceRestricted:true,marketplaceRestrictedReason:reason};
      assert.strictEqual(await obligations.clearCustomerMarketplaceRestrictionIfClear('customer'), false);
      assert.strictEqual(user.marketplaceRestricted, true);
      await assert.rejects(obligations.assertCustomerMarketplaceSpendAllowed('customer'), e => e.statusCode === 403);
    }
    user.marketplaceRestrictedReason = obligations.MARKETPLACE_RESTRICT_REASON;
    rows = [row];
    assert.strictEqual(await obligations.clearCustomerMarketplaceRestrictionIfClear('customer'), false);
    rows = [];
    assert.strictEqual(await obligations.clearCustomerMarketplaceRestrictionIfClear('customer'), true);
    const worker = require('../src/jobs/customerPaymentObligation.job');
    mock(globalThis, '__elofixPgPool', {connect:async()=>{throw new Error('injected pool failure');}});
    assert.strictEqual((await worker.processCustomerPaymentObligations()).skipped, true);
    globalThis.__elofixPgPool = {connect:async()=>({
      query:async()=>({rows:[{locked:true}]}),release:()=>{},
    })};
    worker.resetObligationCursorForTests();
    assert.strictEqual((await worker.processCustomerPaymentObligations()).skipped, false, 'worker must recover after failed lock acquisition');
    const originalJob = {id:'job',status:'IN_PROGRESS',paymentProgress:'FULLY_PAID',meta:{statusOverride:'AWAITING_CONFIRMATION',confirmationDeadlineAt:past.toISOString()}};
    mock(prisma.job, 'findUnique', async () => originalJob);
    mock(prisma, '$transaction', async fn => fn({
      job:{findUnique:async()=>({...originalJob,meta:{...originalJob.meta,confirmationDeadlineAt:future.toISOString()}})},
    }));
    assert.strictEqual(await jobs.systemCompleteJobAfterDeadline('job'), null);
    let persisted = null, deliveries = 0;
    const tx = {
      notification:{upsert:async({create})=>persisted || (persisted={...create,createdAt:new Date()})},
      notificationDeliveryOutbox:{create:async()=>{deliveries++; return {}; }},
      user:{findMany:async()=>[]},
    };
    const notice = {userId:'customer',jobId:'job',dedupeKey:'window',message:'expired'};
    await notices.addNotificationInTransaction(tx,notice);
    await notices.addNotificationInTransaction(tx,notice);
    assert.strictEqual(deliveries,1,'retry must not enqueue duplicate delivery');
    persisted = null;
    tx.notificationDeliveryOutbox.create = async () => {throw new Error('outbox unavailable');};
    await assert.rejects(notices.addNotificationInTransaction(tx,notice), /outbox unavailable/);
    persisted = null;
    await assert.rejects(events.notifyConfirmationWindowExpired({customerId:'customer',jobId:'job'},tx), /outbox unavailable/);
  } finally { originals.reverse().forEach(restore => restore()); }
  console.log('completionWindowSafety.test.js passed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
