import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './storageService';

// Memory cache for Google OAuth Access Token
let cachedAccessToken: string | null = null;

export const getGoogleAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const setGoogleAccessToken = (token: string | null): void => {
  cachedAccessToken = token;
};

// Initialize Google Auth Provider with all requested Workspace scopes
export const getGoogleAuthProvider = (): GoogleAuthProvider => {
  const provider = new GoogleAuthProvider();
  
  // Google Drive
  provider.addScope('https://www.googleapis.com/auth/drive');
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  provider.addScope('https://www.googleapis.com/auth/drive.readonly');
  
  // Google Calendar
  provider.addScope('https://www.googleapis.com/auth/calendar');
  provider.addScope('https://www.googleapis.com/auth/calendar.events');
  
  // Gmail
  provider.addScope('https://mail.google.com/');
  provider.addScope('https://www.googleapis.com/auth/gmail.modify');
  provider.addScope('https://www.googleapis.com/auth/gmail.compose');
  provider.addScope('https://www.googleapis.com/auth/gmail.send');
  
  // Google Docs
  provider.addScope('https://www.googleapis.com/auth/documents');
  
  // Google Chat
  provider.addScope('https://www.googleapis.com/auth/chat.spaces');
  provider.addScope('https://www.googleapis.com/auth/chat.messages');
  
  // Google Forms
  provider.addScope('https://www.googleapis.com/auth/forms.body');
  
  // Contacts / People API
  provider.addScope('https://www.googleapis.com/auth/contacts');
  
  return provider;
};

// Handle Google Sign-In and fetch the Google OAuth access token
export const connectGoogleWorkspace = async (): Promise<{ token: string; user: any } | null> => {
  if (!auth) {
    throw new Error('Auth is not initialized.');
  }
  
  const provider = getGoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No access token returned from Google Sign-In.');
    }
    
    cachedAccessToken = credential.accessToken;
    return {
      token: cachedAccessToken,
      user: result.user,
    };
  } catch (error) {
    console.error('Failed to connect Google Workspace:', error);
    throw error;
  }
};

// Generic Google API fetcher helper
const googleApiFetch = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const token = getGoogleAccessToken();
  if (!token) {
    throw new Error('Google Workspace is not connected. Please connect first.');
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(endpoint, { ...options, headers });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody?.error?.message || `Google API Error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
};

// Drive API
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
}

export const listDriveFiles = async (mimeTypeQuery?: string): Promise<DriveFile[]> => {
  const q = mimeTypeQuery ? `q=${encodeURIComponent(mimeTypeQuery)}` : '';
  const url = `https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType,webViewLink,modifiedTime)&pageSize=20&${q}`;
  const data = await googleApiFetch<{ files: DriveFile[] }>(url);
  return data.files || [];
};

export const uploadDriveFile = async (name: string, content: string, mimeType: string = 'text/plain'): Promise<DriveFile> => {
  const metadata = { name, mimeType };
  
  // Use simple upload endpoint with boundary
  const boundary = 'foo_bar_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  
  const body = 
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n` +
    content +
    closeDelimiter;

  const token = getGoogleAccessToken();
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.statusText}`);
  }

  return res.json() as Promise<DriveFile>;
};

// Calendar API
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink?: string;
}

export const listCalendarEvents = async (): Promise<CalendarEvent[]> => {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?orderBy=startTime&singleEvents=true&maxResults=20&timeMin=${encodeURIComponent(new Date().toISOString())}`;
  const data = await googleApiFetch<{ items: CalendarEvent[] }>(url);
  return data.items || [];
};

export const createCalendarEvent = async (event: Omit<CalendarEvent, 'id' | 'htmlLink'>): Promise<CalendarEvent> => {
  return googleApiFetch<CalendarEvent>('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });
};

// Gmail API
export interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  subject?: string;
  from?: string;
  date?: string;
}

export const listGmailMessages = async (): Promise<GmailMessage[]> => {
  const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10';
  const listData = await googleApiFetch<{ messages?: { id: string; threadId: string }[] }>(url);
  if (!listData.messages) return [];

  // Fetch snippets and headers for each message
  const messages = await Promise.all(
    listData.messages.map(async (msg) => {
      try {
        const detail = await googleApiFetch<{ id: string; threadId: string; snippet: string; payload?: { headers: { name: string; value: string }[] } }>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
        );
        const headers = detail.payload?.headers || [];
        const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value;
        const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value;
        const date = headers.find((h) => h.name.toLowerCase() === 'date')?.value;
        
        return {
          id: detail.id,
          threadId: detail.threadId,
          snippet: detail.snippet,
          subject,
          from,
          date,
        };
      } catch {
        return { id: msg.id, threadId: msg.threadId, snippet: 'Failed to load details' };
      }
    })
  );

  return messages;
};

export const sendGmailMessage = async (to: string, subject: string, body: string): Promise<any> => {
  // Construct raw rfc822 email
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const emailLines = [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ];
  
  const rawEmail = btoa(unescape(encodeURIComponent(emailLines.join('\r\n'))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return googleApiFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw: rawEmail }),
  });
};

// Docs API
export interface GoogleDoc {
  documentId: string;
  title: string;
}

export const createGoogleDoc = async (title: string): Promise<GoogleDoc> => {
  return googleApiFetch<GoogleDoc>('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
};

// Chat API
export interface ChatSpace {
  name: string;
  displayName: string;
  type: string;
}

export const listChatSpaces = async (): Promise<ChatSpace[]> => {
  const data = await googleApiFetch<{ spaces?: ChatSpace[] }>('https://chat.googleapis.com/v1/spaces');
  return data.spaces || [];
};

// Forms API
export interface GoogleForm {
  formId: string;
  info: { title: string; description?: string };
  responderUri?: string;
}

export const createGoogleForm = async (title: string): Promise<GoogleForm> => {
  return googleApiFetch<GoogleForm>('https://forms.googleapis.com/v1/forms', {
    method: 'POST',
    body: JSON.stringify({ info: { title } }),
  });
};

// Contacts API
export interface GoogleContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export const listGoogleContacts = async (): Promise<GoogleContact[]> => {
  interface Connection {
    resourceName: string;
    names?: { displayName: string }[];
    emailAddresses?: { value: string }[];
    phoneNumbers?: { value: string }[];
  }
  
  const url = 'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=20';
  const data = await googleApiFetch<{ connections?: Connection[] }>(url);
  if (!data.connections) return [];

  return data.connections.map((conn) => ({
    id: conn.resourceName,
    name: conn.names?.[0]?.displayName || 'Unnamed Contact',
    email: conn.emailAddresses?.[0]?.value,
    phone: conn.phoneNumbers?.[0]?.value,
  }));
};
