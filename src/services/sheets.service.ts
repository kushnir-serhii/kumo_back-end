import { google } from 'googleapis';
import { env } from '../config/env';

let _sheets: ReturnType<typeof google.sheets> | null = null;

function getSheets() {
  if (!_sheets) {
    if (!env.GOOGLE_SHEETS_CLIENT_EMAIL || !env.GOOGLE_SHEETS_PRIVATE_KEY) {
      throw new Error('Google Sheets credentials not configured');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    _sheets = google.sheets({ version: 'v4', auth });
  }
  return _sheets;
}

interface FeedbackData {
  name?: string;
  rating?: number;
  feedback?: string;
}

export async function appendFeedbackToSheet(data: FeedbackData): Promise<void> {
  if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    throw new Error('Google Sheets spreadsheet ID not configured');
  }

  const sheets = getSheets();
  const ratingLabels = ['Poor', 'Average', 'Great'];

  // Get the first sheet name dynamically
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
  });
  const sheetName = spreadsheet.data.sheets?.[0]?.properties?.title || 'Sheet1';

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${sheetName}!A:D`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [
        [
          data.name || '',
          new Date().toISOString(),
          data.rating !== undefined ? ratingLabels[data.rating] || '' : '',
          data.feedback || '',
        ],
      ],
    },
  });
}
