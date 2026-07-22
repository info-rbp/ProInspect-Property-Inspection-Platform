import React from 'react';
import { AlertTriangle, Inbox, LoaderCircle, LockKeyhole } from 'lucide-react';

interface AsyncStateProps {
  title: string;
  message?: string;
  action?: React.ReactNode;
}

const StateFrame: React.FC<AsyncStateProps & { icon: React.ReactNode }> = ({ icon, title, message, action }) => (
  <section className="grid min-h-56 place-items-center rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center" role="status">
    <div className="max-w-md">
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-gray-100 text-gray-700">{icon}</div>
      <h2 className="text-base font-bold text-gray-950">{title}</h2>
      {message ? <p className="mt-2 text-sm text-gray-600">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  </section>
);

export const LoadingState: React.FC<Partial<AsyncStateProps>> = ({ title = 'Loading', message = 'Retrieving the latest information.' }) => (
  <StateFrame title={title} message={message} icon={<LoaderCircle className="animate-spin" size={22} aria-hidden="true" />} />
);

export const EmptyState: React.FC<AsyncStateProps> = (props) => <StateFrame {...props} icon={<Inbox size={22} aria-hidden="true" />} />;
export const PermissionDeniedState: React.FC<Partial<AsyncStateProps>> = ({ title = 'Permission denied', message = 'Your active role does not allow access to this section.', action }) => (
  <StateFrame title={title} message={message} action={action} icon={<LockKeyhole size={22} aria-hidden="true" />} />
);
export const ErrorState: React.FC<AsyncStateProps> = (props) => <StateFrame {...props} icon={<AlertTriangle size={22} aria-hidden="true" />} />;
