/** Database regression: failed notice persistence rolls back stamps and retries once. */
require('dotenv').config();
const assert = require('assert');
const {randomUUID} = require('crypto');
const prisma = require('../src/config/prisma');
const obligations = require('../src/services/customerPaymentObligation.service');
const events = require('../src/services/notificationEvents.service');
const {processCustomerPaymentObligations: tick, resetObligationCursorForTests: reset} = require('../src/jobs/customerPaymentObligation.job');
(async () => {
  if (!process.env.DATABASE_URL) { console.log('completionWindowNoticeRetry.test.js: DB integration skipped'); return; }
  const suffix = randomUUID();
  const customer = await prisma.user.create({data:{email:`notice.${suffix}@example.com`,password:'test',name:'Notice regression',role:'CUSTOMER'}});
  const past = new Date(Date.now()-1000), future = new Date(Date.now()+30*86400000);
  const job = await prisma.job.create({data:{title:'Notice retry',category:'test',location:'test',description:'test',price:100,
    customerId:customer.id,status:'IN_PROGRESS',paymentModeSnapshot:'TWO_PAYMENT_50_50',paymentProgress:'FIRST_PAID',
    meta:{statusOverride:'AWAITING_CONFIRMATION',confirmationDeadlineAt:past.toISOString()}}});
  const originals = {};
  try {
    const row = await obligations.upsertOpenObligation({customerId:customer.id,jobId:job.id,amount:50,dueAt:future,restrictionStartsAt:past,source:'COMPLETION_WORKFLOW'});
    // No worker flag and no unrelated moderation flag: enforce the deadline at the API.
    await assert.rejects(obligations.assertCustomerMarketplaceSpendAllowed(customer.id),e=>e.statusCode===403);
    await assert.rejects(obligations.assertCustomerCanStartPaidTransaction(customer.id),e=>e.statusCode===403);
    for (const [helper,stamp,now] of [
      ['notifyConfirmationWindowExpired','windowExpiredNotifiedAt',new Date()],
      ['notifyAdminCustomerPaymentOverdue','overdueNotifiedAt',new Date(future.getTime()+1000)],
    ]) {
      originals[helper] = events[helper];
      const before = await prisma.notification.count({where:{jobId:job.id}});
      events[helper] = async (...args) => {await originals[helper](...args);throw new Error('injected failure after enqueue');};
      reset(); const failed = await tick({customerId:customer.id,now});
      assert.strictEqual(failed.errors,1);
      const failedRow = await prisma.customerPaymentObligation.findUnique({where:{id:row.id}});
      assert.strictEqual(failedRow[stamp],null,'failed notice must not consume the stamp');
      assert.strictEqual(await prisma.notification.count({where:{jobId:job.id}}),before,'notice writes must roll back');
      events[helper] = originals[helper];
      reset(); const retry = await tick({customerId:customer.id,now});
      assert.strictEqual(retry.errors,0);
      assert.ok((await prisma.customerPaymentObligation.findUnique({where:{id:row.id}}))[stamp]);
      const count = await prisma.notification.count({where:{jobId:job.id}});
      assert.ok(count>before);
      assert.strictEqual(await prisma.notificationDeliveryOutbox.count({where:{notification:{jobId:job.id}}}),count);
      reset();await tick({customerId:customer.id,now});
      assert.strictEqual(await prisma.notification.count({where:{jobId:job.id}}),count,'repeated tick must not duplicate notices');
    }
    await prisma.user.update({where:{id:customer.id},data:{marketplaceRestricted:true,marketplaceRestrictedReason:'fraud investigation'}});
    await obligations.markObligationPaidForJob(job.id);
    await obligations.afterObligationPaid(customer.id);
    assert.strictEqual((await prisma.user.findUnique({where:{id:customer.id}})).marketplaceRestrictedReason,'fraud investigation');
    console.log('completionWindowNoticeRetry.test.js passed');
  } finally {
    for (const [key,value] of Object.entries(originals)) events[key]=value;
    await prisma.notificationDeliveryOutbox.deleteMany({where:{notification:{jobId:job.id}}});
    await prisma.notification.deleteMany({where:{jobId:job.id}});
    await prisma.auditLog.deleteMany({where:{OR:[{entityId:job.id},{userId:customer.id}]}});
    await prisma.customerPaymentObligation.deleteMany({where:{jobId:job.id}});
    await prisma.job.delete({where:{id:job.id}});
    await prisma.user.delete({where:{id:customer.id}});
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
