Voice prediction helper

This folder uses the `additionals` files to extract features and train/predict a simple classifier.

Setup (Python):

1. Create a virtualenv and install requirements:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. To train model (if needed) the server will automatically train a RandomForest from `additionals/Parkinsons Disease.csv` if `rfcl_parkinsons.joblib` is missing.

Server (Node):

From `server` folder:

```powershell
npm install
npm start
```

API: POST `/api/predict-voice` (multipart form, field `file`)
Returns JSON: `{ voice_score: number, voice_risk: 'Low'|'Moderate'|'High', details: {...} }`
