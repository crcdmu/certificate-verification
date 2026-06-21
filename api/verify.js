import { readFile } from 'fs/promises';

export default async function handler(req, res) {
  // 1. Catch wrong request types immediately
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { certificateId } = req.body;

  if (!certificateId) {
    return res.status(400).json({ success: false, message: 'Please enter a Certificate ID.' });
  }

  try {
    // CRITICAL FIX: This exact syntax tells Vercel's cloud bundler: 
    // "You are strictly required to bundle database.json into the serverless container."
    const fileUrl = new URL('./database.json', import.meta.url);
    const rawData = await readFile(fileUrl, 'utf8');
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
    // If it ever fails again, this forces Vercel's runtime Logs dashboard to show the exact line number
    console.error("Vercel Cloud Execution Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server configuration error: Unable to load secure records.' 
    });
  }
}
