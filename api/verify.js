import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(req, res) {
  // 1. Only accept secure POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { certificateId } = req.body;

  if (!certificateId) {
    return res.status(400).json({ success: false, message: 'Please enter a Certificate ID.' });
  }

  try {
    // 2. Safely locate and parse the hidden database.json inside the Vercel lambda
    const filePath = join(process.cwd(), 'api', 'database.json');
    const rawData = readFileSync(filePath, 'utf8');
    const db = JSON.parse(rawData);

    // 3. Standardize the input (strips accidental spaces, ignores Upper/Lower case typing)
    const cleanId = certificateId.trim().toUpperCase();
    const studentRecord = db[cleanId];

    if (studentRecord) {
      return res.status(200).json({ 
        success: true, 
        data: studentRecord 
      });
    } else {
      return res.status(404).json({ 
        success: false, 
        message: 'Record not found. This Certificate ID does not exist in Dhanamanjuri University CR&PC archives.' 
      });
    }

  } catch (error) {
    console.error("Database read error:", error);
    return res.status(500).json({ success: false, message: 'Internal Server Error.' });
  }
}