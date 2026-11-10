import { diditVerificationState, isDiditVerificationPending } from './didit.ts';

Deno.test('Didit v3 approval, decline, and pending states are classified safely', () => {
  if (diditVerificationState('Approved') !== 'VERIFIED') throw new Error('Approved state was not recognized.');
  if (diditVerificationState('Declined') !== 'REJECTED') throw new Error('Declined state was not recognized.');
  for (const status of ['Not Started', 'In Progress', 'In Review', 'Not Finished', 'Resubmitted']) {
    if (diditVerificationState(status) !== 'PENDING' || !isDiditVerificationPending(status)) throw new Error(`Pending state was not recognized: ${status}`);
  }
  if (diditVerificationState('unknown provider state') !== null) throw new Error('An unknown provider state was accepted.');
});
