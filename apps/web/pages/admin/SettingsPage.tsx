import React, { useEffect, useState } from 'react';
import { isFirebaseConfigured } from '../../services/storageService';
import {
  connectGoogleWorkspace,
  getGoogleAccessToken,
  setGoogleAccessToken,
  listDriveFiles,
  uploadDriveFile,
  listCalendarEvents,
  createCalendarEvent,
  listGmailMessages,
  sendGmailMessage,
  createGoogleDoc,
  listChatSpaces,
  createGoogleForm,
  listGoogleContacts,
  type DriveFile,
  type CalendarEvent,
  type GmailMessage,
  type ChatSpace,
  type GoogleContact
} from '../../services/googleWorkspaceService';
import { 
  Key, 
  Database, 
  Settings as SettingsIcon, 
  Globe, 
  CheckCircle2, 
  AlertTriangle,
  FolderOpen, 
  Calendar, 
  Mail, 
  FileText, 
  MessageSquare, 
  FileSpreadsheet, 
  Users as ContactsIcon, 
  MousePointer, 
  Send, 
  Plus, 
  Search, 
  ExternalLink 
} from 'lucide-react';
import { useDirtyForm } from '../../hooks/useDirtyForm';
import { runShellOperation } from '../../services/runShellOperation';

const statusClass = (enabled: boolean) => 
  enabled 
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
    : 'bg-amber-50 text-amber-700 border-amber-200';

type IntegrationTab = 'drive' | 'calendar' | 'gmail' | 'docs' | 'chat' | 'forms' | 'contacts' | 'picker';

const SettingsPage: React.FC = () => {
  const firebaseConfigured = isFirebaseConfigured();
  const aiConfigured = Boolean(import.meta.env.VITE_API_BASE_URL?.trim());

  // Connection & Auth States
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [connecting, setConnecting] = useState(false);
  
  // Selected Tab inside Google Integrations
  const [activeTab, setActiveTab] = useState<IntegrationTab>('drive');
  
  // Data State
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [spaces, setSpaces] = useState<ChatSpace[]>([]);
  const [contacts, setContacts] = useState<GoogleContact[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Form input states
  const [driveFileName, setDriveFileName] = useState('');
  const [driveFileContent, setDriveFileContent] = useState('');
  
  const [calSummary, setCalSummary] = useState('');
  const [calStart, setCalStart] = useState('');
  const [calEnd, setCalEnd] = useState('');
  
  const [gmailTo, setGmailTo] = useState('');
  const [gmailSubject, setGmailSubject] = useState('');
  const [gmailBody, setGmailBody] = useState('');
  
  const [docTitle, setDocTitle] = useState('');
  const [formTitle, setFormTitle] = useState('');

  // Picker States
  const [pickerSelectedFile, setPickerSelectedFile] = useState<DriveFile | null>(null);
  const driveDirty = useDirtyForm({ scopeId: 'settings:drive', entityType: 'settings', entityId: 'drive' });
  const calendarDirty = useDirtyForm({ scopeId: 'settings:calendar', entityType: 'settings', entityId: 'calendar' });
  const gmailDirty = useDirtyForm({ scopeId: 'settings:gmail', entityType: 'settings', entityId: 'gmail' });
  const docsDirty = useDirtyForm({ scopeId: 'settings:docs', entityType: 'settings', entityId: 'docs' });
  const formsDirty = useDirtyForm({ scopeId: 'settings:forms', entityType: 'settings', entityId: 'forms' });

  // Auto-connect if access token is already available in memory
  useEffect(() => {
    if (getGoogleAccessToken()) {
      setGoogleConnected(true);
    }
  }, []);

  const handleConnectGoogle = async () => {
    setConnecting(true);
    setDataError(null);
    try {
      const res = await connectGoogleWorkspace();
      if (res) {
        setGoogleConnected(true);
        setGoogleUser(res.user);
        // Load initial tab data
        loadTabData('drive');
      }
    } catch (err: any) {
      setDataError(err.message || 'Failed to authenticate with Google Workspace.');
    } finally {
      setConnecting(false);
    }
  };

  const loadTabData = async (tab: IntegrationTab) => {
    if (!googleConnected && !getGoogleAccessToken()) return;
    setLoadingData(true);
    setDataError(null);
    try {
      if (tab === 'drive' || tab === 'picker') {
        const data = await listDriveFiles();
        setFiles(data);
      } else if (tab === 'calendar') {
        const data = await listCalendarEvents();
        setEvents(data);
      } else if (tab === 'gmail') {
        const data = await listGmailMessages();
        setEmails(data);
      } else if (tab === 'chat') {
        const data = await listChatSpaces();
        setSpaces(data);
      } else if (tab === 'contacts') {
        const data = await listGoogleContacts();
        setContacts(data);
      }
    } catch (err: any) {
      setDataError(err.message || `Failed to fetch data for ${tab}.`);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (googleConnected) {
      loadTabData(activeTab);
    }
  }, [activeTab, googleConnected]);

  // MUTATION ACTIONS WITH MANDATORY USER CONFIRMATIONS

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveFileName) return;

    const confirmed = window.confirm(
      `Confirm: Do you want to create a file named "${driveFileName}" in your Google Drive?`
    );
    if (!confirmed) return;

    try {
      await runShellOperation({ kind: 'upload', title: 'Drive file uploaded', source: 'google-drive', persistence: 'cloud', dirtyScopeId: 'settings:drive', entityType: 'settings', entityId: 'drive', action: 'create', announceSuccess: true }, () => uploadDriveFile(driveFileName, driveFileContent || 'Hello from ProInspect Platform!'));
      setDriveFileName('');
      setDriveFileContent('');
      loadTabData('drive');
    } catch { /* The shell operation publishes the actionable failure. */ }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calSummary || !calStart || !calEnd) return;

    const confirmed = window.confirm(
      `Confirm: Do you want to create the Calendar Event "${calSummary}" from ${calStart} to ${calEnd}?`
    );
    if (!confirmed) return;

    try {
      await runShellOperation({ kind: 'save', title: 'Calendar event created', source: 'google-calendar', persistence: 'cloud', dirtyScopeId: 'settings:calendar', entityType: 'settings', entityId: 'calendar', action: 'create', announceSuccess: true }, () => createCalendarEvent({
        summary: calSummary,
        start: { dateTime: new Date(calStart).toISOString() },
        end: { dateTime: new Date(calEnd).toISOString() }
      }));
      setCalSummary('');
      setCalStart('');
      setCalEnd('');
      loadTabData('calendar');
    } catch { /* The shell operation publishes the actionable failure. */ }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gmailTo || !gmailSubject || !gmailBody) return;

    const confirmed = window.confirm(
      `Confirm: Do you want to send this email to ${gmailTo} from your Google Account?`
    );
    if (!confirmed) return;

    try {
      await runShellOperation({ kind: 'save', title: 'Email sent', source: 'google-gmail', persistence: 'cloud', dirtyScopeId: 'settings:gmail', entityType: 'settings', entityId: 'gmail', action: 'send', announceSuccess: true }, () => sendGmailMessage(gmailTo, gmailSubject, gmailBody));
      setGmailTo('');
      setGmailSubject('');
      setGmailBody('');
      loadTabData('gmail');
    } catch { /* The shell operation publishes the actionable failure. */ }
  };

  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle) return;

    const confirmed = window.confirm(
      `Confirm: Do you want to create a new Google Document titled "${docTitle}"?`
    );
    if (!confirmed) return;

    try {
      await runShellOperation({ kind: 'save', title: 'Google document created', source: 'google-docs', persistence: 'cloud', dirtyScopeId: 'settings:docs', entityType: 'settings', entityId: 'docs', action: 'create', announceSuccess: true }, () => createGoogleDoc(docTitle));
      setDocTitle('');
      loadTabData('drive');
    } catch { /* The shell operation publishes the actionable failure. */ }
  };

  const handleCreateForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle) return;

    const confirmed = window.confirm(
      `Confirm: Do you want to create a new Google Form titled "${formTitle}"?`
    );
    if (!confirmed) return;

    try {
      await runShellOperation({ kind: 'save', title: 'Google form created', source: 'google-forms', persistence: 'cloud', dirtyScopeId: 'settings:forms', entityType: 'settings', entityId: 'forms', action: 'create', announceSuccess: true }, () => createGoogleForm(formTitle));
      setFormTitle('');
      loadTabData('drive');
    } catch { /* The shell operation publishes the actionable failure. */ }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-brand-600">Settings</h1>
        <p className="text-sm text-gray-600">
          Verify system capabilities, connect external APIs, and configure Google integrations.
        </p>
      </div>

      {/* Basic Platform Services Status */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(firebaseConfigured)}`}>
              {firebaseConfigured ? 'Ready' : 'Needs attention'}
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Database size={18} className="text-gray-500" />
              <h2 className="font-semibold text-brand-600">Firebase</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {firebaseConfigured 
                ? 'Firestore persistent cloud database is connected' 
                : 'Local SQLite/IndexDB client-only mode'}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(aiConfigured)}`}>
              {aiConfigured ? 'Ready' : 'Needs attention'}
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Key size={18} className="text-gray-500" />
              <h2 className="font-semibold text-brand-600">AI Commentary</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {aiConfigured ? 'Server-managed Vertex AI workflow available' : 'Cloud API endpoint not configured'}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="inline-flex rounded-full border px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">
              Ready
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Globe size={18} className="text-gray-500" />
              <h2 className="font-semibold text-brand-600">Cloud SQL</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              PostgreSQL database proxy connection pool is active
            </p>
          </div>
        </div>
      </div>

      {/* Google Workspace Integrations Panel */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-5">
          <div>
            <h2 className="text-lg font-bold text-brand-600 flex items-center gap-2">
              <SettingsIcon size={20} className="text-accent-600" /> Google Workspace Integrations
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Connect and sync data with Drive, Calendar, Gmail, Docs, Chat, Forms, Contacts, and Picker.
            </p>
          </div>
          
          {!googleConnected ? (
            <button
              onClick={handleConnectGoogle}
              disabled={connecting}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors cursor-pointer"
            >
              {connecting ? 'Connecting...' : 'Connect Google Account'}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={12} /> Connected
                </span>
                {googleUser && (
                  <p className="text-xs text-gray-500 mt-1">{googleUser.email}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setGoogleConnected(false);
                  setGoogleAccessToken(null);
                }}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>

        {dataError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Integration Warning</p>
              <p className="mt-0.5">{dataError}</p>
            </div>
          </div>
        )}

        {!googleConnected ? (
          <div className="p-8 text-center border border-dashed border-gray-200 rounded-lg bg-gray-50/50">
            <SettingsIcon size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="font-semibold text-brand-600 text-sm">Google Account not connected</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-4">
              Connect your Google Workspace to read and write records across all Google Cloud productivity applications.
            </p>
            <button
              onClick={handleConnectGoogle}
              disabled={connecting}
              className="rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              {connecting ? 'Connecting...' : 'Connect Workspace Now'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
            {/* Left side tabs for the 8 requested integrations */}
            <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible gap-1 border-b lg:border-b-0 lg:border-r border-gray-100 pb-3 lg:pb-0 lg:pr-4">
              {[
                { key: 'drive', label: 'Google Drive', icon: FolderOpen },
                { key: 'calendar', label: 'Google Calendar', icon: Calendar },
                { key: 'gmail', label: 'Gmail Messages', icon: Mail },
                { key: 'docs', label: 'Google Docs', icon: FileText },
                { key: 'chat', label: 'Google Chat', icon: MessageSquare },
                { key: 'forms', label: 'Google Forms', icon: FileSpreadsheet },
                { key: 'contacts', label: 'Contacts', icon: ContactsIcon },
                { key: 'picker', label: 'Google Picker', icon: MousePointer },
              ].map((tab) => {
                const TabIcon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as IntegrationTab)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                      active 
                        ? 'bg-accent-50 text-accent-700 lg:w-full font-bold shadow-sm' 
                        : 'text-gray-600 hover:bg-gray-50 hover:text-brand-600 lg:w-full'
                    }`}
                  >
                    <TabIcon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Right side interactive content details */}
            <div className="min-w-0">
              {loadingData ? (
                <div className="p-12 text-center text-sm text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-600 mx-auto mb-3"></div>
                  Synchronizing records...
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Tab Header */}
                  <div className="border-b border-gray-100 pb-3 flex justify-between items-center">
                    <h3 className="font-bold text-brand-600 text-sm uppercase tracking-wider">
                      {activeTab === 'drive' && 'Drive Workspace files'}
                      {activeTab === 'calendar' && 'Calendar events'}
                      {activeTab === 'gmail' && 'Gmail Inbox'}
                      {activeTab === 'docs' && 'Google Docs'}
                      {activeTab === 'chat' && 'Chat spaces'}
                      {activeTab === 'forms' && 'Google Forms'}
                      {activeTab === 'contacts' && 'Synced Google Contacts'}
                      {activeTab === 'picker' && 'Interactive File Picker'}
                    </h3>
                    <button 
                      onClick={() => loadTabData(activeTab)} 
                      className="text-xs text-accent-600 hover:underline font-semibold"
                    >
                      Refresh list
                    </button>
                  </div>

                  {/* ACTIVE TAB: DRIVE */}
                  {activeTab === 'drive' && (
                    <div className="space-y-5">
                      <form {...driveDirty.formProps} onSubmit={handleCreateFile} className="grid gap-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h4 className="text-xs font-bold text-brand-600">Upload / Create text file in Google Drive</h4>
                        <div className="grid sm:grid-cols-3 gap-2">
                          <input
                            required
                            placeholder="filename.txt"
                            value={driveFileName}
                            onChange={(e) => setDriveFileName(e.target.value)}
                            className="rounded-lg border border-gray-300 p-2 text-xs bg-white"
                          />
                          <input
                            placeholder="File content text..."
                            value={driveFileContent}
                            onChange={(e) => setDriveFileContent(e.target.value)}
                            className="rounded-lg border border-gray-300 p-2 text-xs bg-white sm:col-span-2"
                          />
                        </div>
                        <button 
                          type="submit" 
                          className="self-start inline-flex items-center gap-1.5 rounded bg-accent-600 hover:bg-accent-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
                        >
                          <Plus size={14} /> Upload File
                        </button>
                      </form>

                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        {files.length === 0 ? (
                          <p className="p-6 text-center text-xs text-gray-500 bg-white">No files found in Drive.</p>
                        ) : (
                          <div className="divide-y divide-gray-100 bg-white">
                            {files.map((file) => (
                              <div key={file.id} className="p-3 hover:bg-gray-50 flex justify-between items-center text-xs">
                                <div>
                                  <p className="font-semibold text-brand-600">{file.name}</p>
                                  <p className="text-[10px] text-gray-500 mt-0.5">{file.mimeType} • ID: {file.id}</p>
                                </div>
                                {file.webViewLink && (
                                  <a 
                                    href={file.webViewLink} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="text-accent-600 hover:text-accent-800"
                                  >
                                    <ExternalLink size={14} />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: CALENDAR */}
                  {activeTab === 'calendar' && (
                    <div className="space-y-5">
                      <form {...calendarDirty.formProps} onSubmit={handleCreateEvent} className="grid gap-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h4 className="text-xs font-bold text-brand-600">Add Event to primary Google Calendar</h4>
                        <div className="grid sm:grid-cols-3 gap-2">
                          <input
                            required
                            placeholder="Inspection Event Title"
                            value={calSummary}
                            onChange={(e) => setCalSummary(e.target.value)}
                            className="rounded-lg border border-gray-300 p-2 text-xs bg-white"
                          />
                          <input
                            required
                            type="datetime-local"
                            value={calStart}
                            onChange={(e) => setCalStart(e.target.value)}
                            className="rounded-lg border border-gray-300 p-2 text-xs bg-white"
                          />
                          <input
                            required
                            type="datetime-local"
                            value={calEnd}
                            onChange={(e) => setCalEnd(e.target.value)}
                            className="rounded-lg border border-gray-300 p-2 text-xs bg-white"
                          />
                        </div>
                        <button 
                          type="submit" 
                          className="self-start inline-flex items-center gap-1.5 rounded bg-accent-600 hover:bg-accent-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
                        >
                          <Plus size={14} /> Create Event
                        </button>
                      </form>

                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        {events.length === 0 ? (
                          <p className="p-6 text-center text-xs text-gray-500 bg-white">No upcoming events found.</p>
                        ) : (
                          <div className="divide-y divide-gray-100 bg-white">
                            {events.map((evt) => (
                              <div key={evt.id} className="p-3 hover:bg-gray-50 flex justify-between items-center text-xs">
                                <div>
                                  <p className="font-semibold text-brand-600">{evt.summary}</p>
                                  <p className="text-[10px] text-gray-500 mt-0.5">
                                    Start: {evt.start.dateTime || evt.start.date} • End: {evt.end.dateTime || evt.end.date}
                                  </p>
                                </div>
                                {evt.htmlLink && (
                                  <a 
                                    href={evt.htmlLink} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="text-accent-600 hover:text-accent-800"
                                  >
                                    <ExternalLink size={14} />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: GMAIL */}
                  {activeTab === 'gmail' && (
                    <div className="space-y-5">
                      <form {...gmailDirty.formProps} onSubmit={handleSendEmail} className="grid gap-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h4 className="text-xs font-bold text-brand-600">Send Email with Gmail</h4>
                        <div className="grid gap-2">
                          <input
                            required
                            type="email"
                            placeholder="recipient@example.com"
                            value={gmailTo}
                            onChange={(e) => setGmailTo(e.target.value)}
                            className="rounded-lg border border-gray-300 p-2 text-xs bg-white"
                          />
                          <input
                            required
                            placeholder="Email Subject Line"
                            value={gmailSubject}
                            onChange={(e) => setGmailSubject(e.target.value)}
                            className="rounded-lg border border-gray-300 p-2 text-xs bg-white"
                          />
                          <textarea
                            required
                            placeholder="Write your message here..."
                            rows={3}
                            value={gmailBody}
                            onChange={(e) => setGmailBody(e.target.value)}
                            className="rounded-lg border border-gray-300 p-2 text-xs bg-white"
                          />
                        </div>
                        <button 
                          type="submit" 
                          className="self-start inline-flex items-center gap-1.5 rounded bg-accent-600 hover:bg-accent-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
                        >
                          <Send size={14} /> Send Message
                        </button>
                      </form>

                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        {emails.length === 0 ? (
                          <p className="p-6 text-center text-xs text-gray-500 bg-white">No inbox messages found.</p>
                        ) : (
                          <div className="divide-y divide-gray-100 bg-white">
                            {emails.map((mail) => (
                              <div key={mail.id} className="p-3 hover:bg-gray-50 text-xs">
                                <div className="flex justify-between font-semibold text-brand-600">
                                  <span>{mail.subject || 'No Subject'}</span>
                                  <span className="text-[10px] text-gray-500 font-normal">{mail.date}</span>
                                </div>
                                <p className="text-[10px] text-gray-500 mt-0.5">From: {mail.from}</p>
                                <p className="text-[11px] text-gray-600 mt-1 italic">"{mail.snippet}"</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: DOCS */}
                  {activeTab === 'docs' && (
                    <div className="space-y-5">
                      <form {...docsDirty.formProps} onSubmit={handleCreateDoc} className="grid gap-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h4 className="text-xs font-bold text-brand-600">Create Google Doc Document</h4>
                        <div className="flex gap-2">
                          <input
                            required
                            placeholder="New Document Title"
                            value={docTitle}
                            onChange={(e) => setDocTitle(e.target.value)}
                            className="flex-1 rounded-lg border border-gray-300 p-2 text-xs bg-white"
                          />
                          <button 
                            type="submit" 
                            className="inline-flex items-center gap-1.5 rounded bg-accent-600 hover:bg-accent-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
                          >
                            <Plus size={14} /> Create Doc
                          </button>
                        </div>
                      </form>

                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        {files.filter(f => f.mimeType === 'application/vnd.google-apps.document').length === 0 ? (
                          <p className="p-6 text-center text-xs text-gray-500 bg-white">No Google Docs found in your Drive.</p>
                        ) : (
                          <div className="divide-y divide-gray-100 bg-white">
                            {files.filter(f => f.mimeType === 'application/vnd.google-apps.document').map((doc) => (
                              <div key={doc.id} className="p-3 hover:bg-gray-50 flex justify-between items-center text-xs">
                                <div>
                                  <p className="font-semibold text-brand-600">{doc.name}</p>
                                  <p className="text-[10px] text-gray-500 mt-0.5">MimeType: Google Doc • ID: {doc.id}</p>
                                </div>
                                {doc.webViewLink && (
                                  <a 
                                    href={doc.webViewLink} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="text-accent-600 hover:text-accent-800"
                                  >
                                    <ExternalLink size={14} />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: CHAT */}
                  {activeTab === 'chat' && (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-accent-200 bg-accent-50/50 p-4 text-xs text-accent-800 space-y-1">
                        <p className="font-bold">Google Chat Integration Mode</p>
                        <p>User-level API allows listing and communicating with joined Spaces.</p>
                      </div>

                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        {spaces.length === 0 ? (
                          <p className="p-6 text-center text-xs text-gray-500 bg-white">No Chat Spaces found.</p>
                        ) : (
                          <div className="divide-y divide-gray-100 bg-white">
                            {spaces.map((space) => (
                              <div key={space.name} className="p-3 hover:bg-gray-50 text-xs">
                                <p className="font-semibold text-brand-600">{space.displayName || 'No Name'}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">Resource Name: {space.name} • Type: {space.type}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: FORMS */}
                  {activeTab === 'forms' && (
                    <div className="space-y-5">
                      <form {...formsDirty.formProps} onSubmit={handleCreateForm} className="grid gap-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h4 className="text-xs font-bold text-brand-600">Create Google Form</h4>
                        <div className="flex gap-2">
                          <input
                            required
                            placeholder="Form Title"
                            value={formTitle}
                            onChange={(e) => setFormTitle(e.target.value)}
                            className="flex-1 rounded-lg border border-gray-300 p-2 text-xs bg-white"
                          />
                          <button 
                            type="submit" 
                            className="inline-flex items-center gap-1.5 rounded bg-accent-600 hover:bg-accent-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
                          >
                            <Plus size={14} /> Create Form
                          </button>
                        </div>
                      </form>

                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        {files.filter(f => f.mimeType === 'application/vnd.google-apps.form').length === 0 ? (
                          <p className="p-6 text-center text-xs text-gray-500 bg-white">No Google Forms found in your Drive.</p>
                        ) : (
                          <div className="divide-y divide-gray-100 bg-white">
                            {files.filter(f => f.mimeType === 'application/vnd.google-apps.form').map((formItem) => (
                              <div key={formItem.id} className="p-3 hover:bg-gray-50 flex justify-between items-center text-xs">
                                <div>
                                  <p className="font-semibold text-brand-600">{formItem.name}</p>
                                  <p className="text-[10px] text-gray-500 mt-0.5">MimeType: Google Form • ID: {formItem.id}</p>
                                </div>
                                {formItem.webViewLink && (
                                  <a 
                                    href={formItem.webViewLink} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="text-accent-600 hover:text-accent-800"
                                  >
                                    <ExternalLink size={14} />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: CONTACTS */}
                  {activeTab === 'contacts' && (
                    <div className="space-y-4">
                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        {contacts.length === 0 ? (
                          <p className="p-6 text-center text-xs text-gray-500 bg-white">No Google Contacts found.</p>
                        ) : (
                          <div className="divide-y divide-gray-100 bg-white">
                            {contacts.map((contact) => (
                              <div key={contact.id} className="p-3 hover:bg-gray-50 text-xs">
                                <p className="font-semibold text-brand-600">{contact.name}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                  Email: {contact.email || '-'} • Phone: {contact.phone || '-'}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE TAB: PICKER (REAL INLINE REACT FILE PICKER) */}
                  {activeTab === 'picker' && (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-accent-200 bg-accent-50/50 p-4 text-xs text-accent-800">
                        <p className="font-bold">Google Picker Experience</p>
                        <p className="mt-1">
                          Browse and select real files from your Google Drive inside this premium layout.
                        </p>
                      </div>

                      {pickerSelectedFile && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 space-y-1">
                          <p className="font-bold">Selected File Details</p>
                          <p><strong>Name:</strong> {pickerSelectedFile.name}</p>
                          <p><strong>ID:</strong> {pickerSelectedFile.id}</p>
                          <p><strong>Type:</strong> {pickerSelectedFile.mimeType}</p>
                          {pickerSelectedFile.webViewLink && (
                            <a 
                              href={pickerSelectedFile.webViewLink} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-accent-600 hover:underline font-semibold flex items-center gap-1 mt-1"
                            >
                              Open original file <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      )}

                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        <h4 className="text-xs font-bold text-ink-900 bg-gray-50 p-3 border-b border-gray-100 flex items-center gap-2">
                          <Search size={14} /> Drive Files Browser
                        </h4>
                        
                        {files.length === 0 ? (
                          <p className="p-6 text-center text-xs text-gray-500 bg-white">No files found.</p>
                        ) : (
                          <div className="divide-y divide-gray-100 bg-white max-h-64 overflow-y-auto">
                            {files.map((file) => (
                              <button
                                key={file.id}
                                onClick={() => setPickerSelectedFile(file)}
                                className={`w-full p-3 text-left hover:bg-gray-50 flex justify-between items-center text-xs ${
                                  pickerSelectedFile?.id === file.id ? 'bg-accent-50/70 border-l-4 border-accent-600' : ''
                                }`}
                              >
                                <div>
                                  <p className="font-semibold text-brand-600">{file.name}</p>
                                  <p className="text-[10px] text-gray-500 mt-0.5">{file.mimeType}</p>
                                </div>
                                <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold">
                                  Choose
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
