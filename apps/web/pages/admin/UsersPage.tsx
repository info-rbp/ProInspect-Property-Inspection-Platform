import React, { useEffect, useMemo, useState } from 'react';
import type { UserInvitation, UserProfile, UserRole, UserWorkloadProjection } from '../../types/platform';
import { commandInvitation, commandUser, createInvitation, listInvitations, listUsers, listWorkload } from '../../services/platform/administrationService';

const ROLES: UserRole[] = ['proinspect_admin', 'operations', 'inspector', 'analyst', 'reviewer', 'property_manager', 'maintenance_coordinator'];

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [workload, setWorkload] = useState<UserWorkloadProjection[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('inspector');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const [nextUsers, nextInvitations, nextWorkload] = await Promise.all([listUsers(), listInvitations(), listWorkload()]);
    setUsers(nextUsers);
    setInvitations(nextInvitations);
    setWorkload(nextWorkload);
  };

  useEffect(() => { load().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))); }, []);
  const workloadByUser = useMemo(() => new Map(workload.map((entry) => [entry.userId, entry])), [workload]);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await createInvitation(email, role); setEmail(''); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  const userCommand = async (user: UserProfile, command: Parameters<typeof commandUser>[1], extra: Record<string, unknown> = {}) => {
    setBusy(true); setError('');
    try { await commandUser(user, command, extra); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  const invitationCommand = async (invitation: UserInvitation, command: 'resend' | 'revoke') => {
    setBusy(true); setError('');
    try { await commandInvitation(invitation, command); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-600">Users and access</h1>
        <p className="text-sm text-gray-600">Invite operators, control roles and account status, and review MFA and workload readiness.</p>
      </div>
      {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <form onSubmit={invite} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_auto]">
        <label className="grid gap-1 text-sm font-medium text-gray-700">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-gray-300 p-2" /></label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">Role<select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="rounded-lg border border-gray-300 p-2">{ROLES.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
        <button disabled={busy} className="self-end rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Invite user</button>
      </form>

      <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">MFA</th><th className="p-3">Workload</th><th className="p-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{users.map((user) => {
            const loadValue = workloadByUser.get(user.id);
            return <tr key={user.id}>
              <td className="p-3"><div className="font-semibold text-brand-600">{user.displayName || 'Unnamed user'}</div><div className="text-gray-500">{user.email}</div></td>
              <td className="p-3"><select value={user.role} disabled={busy} onChange={(event) => userCommand(user, 'change-role', { role: event.target.value })} className="rounded border border-gray-300 p-1">{ROLES.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></td>
              <td className="p-3 capitalize">{user.status}</td>
              <td className="p-3"><div>{user.mfaRequired ? 'Required' : 'Optional'} · {user.mfaEnrolled ? 'Enrolled' : 'Not enrolled'}</div><button disabled={busy} onClick={() => userCommand(user, 'require-mfa', { required: !user.mfaRequired })} className="mt-1 text-xs font-semibold text-accent-600">{user.mfaRequired ? 'Make optional' : 'Require MFA'}</button></td>
              <td className="p-3 text-xs text-gray-600">{loadValue ? <><div>{loadValue.activeJobs} active jobs</div><div>{loadValue.overdueJobs} overdue</div><div>{loadValue.reportsAwaitingAction} reports waiting</div></> : 'No projection'}</td>
              <td className="p-3"><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => userCommand(user, user.status === 'active' ? 'suspend' : 'reactivate')} className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold">{user.status === 'active' ? 'Suspend' : 'Reactivate'}</button><button disabled={busy} onClick={() => userCommand(user, 'revoke-sessions')} className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold">Revoke sessions</button><button disabled={busy} onClick={() => userCommand(user, 'revoke')} className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700">Revoke</button></div></td>
            </tr>;
          })}</tbody>
        </table>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-brand-600">Invitations</h2>
        <div className="mt-3 grid gap-2">{invitations.length ? invitations.map((invitation) => <div key={invitation.id} className="flex flex-col justify-between gap-2 rounded-lg border border-gray-200 p-3 sm:flex-row sm:items-center"><div><div className="font-semibold">{invitation.email}</div><div className="text-xs text-gray-500">{invitation.role.replaceAll('_', ' ')} · {invitation.status} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</div></div><div className="flex gap-2"><button disabled={busy || invitation.status === 'revoked'} onClick={() => invitationCommand(invitation, 'resend')} className="rounded border border-gray-300 px-3 py-1 text-xs font-semibold">Resend</button><button disabled={busy || invitation.status === 'revoked'} onClick={() => invitationCommand(invitation, 'revoke')} className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700">Revoke</button></div></div>) : <p className="text-sm text-gray-500">No invitations.</p>}</div>
      </section>
    </div>
  );
};

export default UsersPage;
