const { google } = require('googleapis');
const path = require('path');

async function inspect() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../../../apps/gateway/google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = '1Pwqx9uTlF3tE3gwJpchjEzly2BGe689vq-U9bPHULsI';

  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetNames = meta.data.sheets.map(s => s.properties.title);
    console.log('--- HOJAS DETECTADAS ---');
    console.log(sheetNames);

    for (const name of sheetNames) {
        console.log(`\n--- LEYENDO HOJA: ${name} ---`);
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${name}!A1:E10`,
        });
        console.log(JSON.stringify(response.data.values, null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

inspect();
