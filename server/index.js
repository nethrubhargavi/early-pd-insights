const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 4000;

const voiceDir = path.join(__dirname, 'voice');
const uploadsDir = path.join(voiceDir, 'uploads');
if (!fs.existsSync(voiceDir)) fs.mkdirSync(voiceDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // preserve extension
    const ext = path.extname(file.originalname) || '.wav';
    cb(null, `upload_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

app.use(express.json());

app.post('/api/predict-voice', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;

  // Call Python wrapper (use PYTHON env var if set, otherwise fallback to 'python')
  const pythonExec = process.env.PYTHON || 'python';
  console.log('Using Python executable:', pythonExec);
  const py = spawn(pythonExec, ['predict_wrapper.py', filePath], { cwd: voiceDir });

  let stdout = '';
  let stderr = '';

  py.stdout.on('data', (data) => {
    stdout += data.toString();
  });
  py.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  py.on('close', (code) => {
    if (code !== 0) {
      console.error('predict_wrapper exited with code', code);
      console.error(stderr);
      return res.status(500).json({ error: 'Prediction failed', details: stderr });
    }

    try {
      // Expect JSON object on last line of stdout
      const lines = stdout.trim().split(/\r?\n/);
      const last = lines[lines.length - 1];
      const output = JSON.parse(last);
      return res.json(output);
    } catch (err) {
      console.error('Failed to parse python output', err);
      console.error('stdout:', stdout);
      return res.status(500).json({ error: 'Invalid prediction output', details: stdout });
    }
  });
});

// Biomarker analysis endpoint
app.post('/api/analyze-biomarkers', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;

  // Call Python biomarker analyzer
  const pythonExec = process.env.PYTHON || 'python';
  console.log('Analyzing biomarkers from file:', filePath);
  const py = spawn(pythonExec, ['biomarker_analyzer.py', filePath]);

  let stdout = '';
  let stderr = '';

  py.stdout.on('data', (data) => {
    stdout += data.toString();
  });
  py.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  py.on('close', (code) => {
    // Clean up uploaded file after analysis
    fs.unlink(filePath, (err) => {
      if (err) console.error('Failed to delete temp file:', err);
    });

    if (code !== 0) {
      console.error('biomarker_analyzer exited with code', code);
      console.error(stderr);
      return res.status(500).json({ error: 'Analysis failed', details: stderr });
    }

    try {
      // Expect JSON object on stdout
      const lines = stdout.trim().split(/\r?\n/);
      const last = lines[lines.length - 1];
      const output = JSON.parse(last);
      return res.json(output);
    } catch (err) {
      console.error('Failed to parse biomarker analyzer output', err);
      console.error('stdout:', stdout);
      return res.status(500).json({ error: 'Invalid analysis output', details: stdout });
    }
  });
});

// Cleanup endpoint to delete uploaded files for a session
app.delete('/api/cleanup/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  // Delete all files matching session pattern in uploads directory
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      console.error('Error reading uploads directory:', err);
      return res.status(500).json({ error: 'Failed to read uploads directory' });
    }

    // Delete files that match the session pattern (uploaded by this session)
    // For now, we delete all uploaded files; in future could store session_id in filename
    let deletedCount = 0;
    files.forEach((file) => {
      const filePath = path.join(uploadsDir, file);
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(`Failed to delete file ${file}:`, err);
        } else {
          console.log(`Deleted file: ${file}`);
          deletedCount++;
        }
      });
    });

    res.json({ success: true, message: `Cleanup complete` });
  });
});

app.listen(PORT, () => {
  console.log(`Voice prediction server listening on http://localhost:${PORT}`);
});
