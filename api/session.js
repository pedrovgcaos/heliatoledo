import { isAdmin, isConfigured } from './_lib/auth.js';
import { send } from './_lib/http.js';
import { useBlob } from './_lib/store.js';
import { emailConfigured } from './_lib/email.js';

export default function handler(req, res) {
  send(res, 200, {
    admin: isAdmin(req),
    configured: isConfigured(),
    storage: useBlob() ? 'blob' : 'local',
    email: emailConfigured(),
  }, { 'Cache-Control': 'no-store' });
}
