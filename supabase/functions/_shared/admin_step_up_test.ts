import { assertEquals } from 'jsr:@std/assert';
import { adminStepUpFailure } from './admin_step_up.ts';

Deno.test('any admin may perform sensitive actions after a recent sign-in without MFA', () => {
  assertEquals(adminStepUpFailure({ email: 'crzzphillip@gmail.com', auth_time: 9_500 }, 10_000), null);
  assertEquals(adminStepUpFailure({ email: 'another-admin@example.com', aal: 'aal1', auth_time: 9_500 }, 10_000), null);
});

Deno.test('admins must sign in again after the recent-auth window', () => {
  assertEquals(adminStepUpFailure({ email: 'another-admin@example.com', auth_time: 9_000 }, 10_000), 'recent_auth_required');
});

Deno.test('missing or future authentication timestamps do not pass step-up', () => {
  assertEquals(adminStepUpFailure({ email: 'another-admin@example.com', aal: 'aal2' }, 10_000), 'recent_auth_required');
  assertEquals(adminStepUpFailure({ email: 'another-admin@example.com', auth_time: 10_001 }, 10_000), 'recent_auth_required');
});
