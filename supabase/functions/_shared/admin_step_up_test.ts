import { assertEquals } from 'jsr:@std/assert';
import { adminStepUpFailure } from './admin_step_up.ts';

Deno.test('any admin may perform sensitive actions after a recent sign-in without MFA', () => {
  assertEquals(adminStepUpFailure('1970-01-01T02:38:20.000Z', 10_000_000), null);
});

Deno.test('admins must sign in again after the recent-auth window', () => {
  assertEquals(adminStepUpFailure('1970-01-01T02:30:00.000Z', 10_000_000), 'recent_auth_required');
});

Deno.test('missing or future authentication timestamps do not pass step-up', () => {
  assertEquals(adminStepUpFailure(undefined, 10_000_000), 'recent_auth_required');
  assertEquals(adminStepUpFailure('1970-01-01T02:46:41.000Z', 10_000_000), 'recent_auth_required');
});
