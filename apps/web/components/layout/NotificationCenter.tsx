import React from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useShell } from '../../contexts/ShellContext';

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
};

const TONES = {
  info: 'border-blue-200 bg-blue-50 text-blue-950',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  error: 'border-red-200 bg-red-50 text-red-950',
};

const NotificationCenter: React.FC = () => {
  const { notifications, dismissNotification } = useShell();
  if (notifications.length === 0) return null;

  return (
    <div aria-live="polite" aria-relevant="additions" className="fixed right-4 top-20 z-50 grid w-[min(24rem,calc(100vw-2rem))] gap-3">
      {notifications.map((notification) => {
        const Icon = ICONS[notification.tone];
        return (
          <section key={notification.id} role={notification.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-4 shadow-lg ${TONES[notification.tone]}`}>
            <div className="flex items-start gap-3">
              <Icon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold">{notification.title}</h2>
                {notification.message ? <p className="mt-1 text-sm opacity-85">{notification.message}</p> : null}
              </div>
              <button type="button" onClick={() => dismissNotification(notification.id)} className="rounded p-1 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-current" aria-label={`Dismiss ${notification.title}`}>
                <X size={16} />
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default NotificationCenter;
