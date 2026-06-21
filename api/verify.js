import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { certificateId } = req.body;

  if (!certificateId) {
    return res.status(400).json({ success: false, message: 'Please enter a Certificate ID.' });
  }

  try {
    const filePath = join(process.cwd(), 'api', 'database.json');
    const rawData = readFileSync(filePath, 'utf8');
    const db = JSON.parse(rawData);

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