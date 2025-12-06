#!/usr/bin/env python3
import os
import sys
import subprocess
import json
import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ADDITIONALS = PROJECT_ROOT / 'additionals'
EXTRACTOR = ADDITIONALS / 'extract_features_full (1).py'
MODEL_FILE = ADDITIONALS / 'rfcl_parkinsons.joblib'
WAV_DEST = ADDITIONALS / 'user_voice.wav'
FEATURES_NPY = ADDITIONALS / 'user_features_uci.npy'
FEATURES_JSON = ADDITIONALS / 'user_features_uci.json'
TRAIN_SCRIPT = ADDITIONALS / 'train_model_wrapper.py'


def ensure_model():
    if MODEL_FILE.exists():
        return True
    # Try to train model
    print('Model not found, training model from CSV...')
    # We'll run a small trainer bundled below if present
    train_script = ADDITIONALS / 'train_model_wrapper.py'
    if train_script.exists():
        result = subprocess.run([sys.executable, str(train_script)], capture_output=True, text=True)
        print(result.stdout)
        if result.returncode != 0:
            print('Trainer stderr:', result.stderr)
            return False
        return MODEL_FILE.exists()
    else:
        # create a simple trainer inline
        print('No trainer script found; creating a simple RF classifier from CSV...')
        trainer = subprocess.run([sys.executable, '-c', TRAIN_INLINE_SCRIPT], capture_output=True, text=True)
        print(trainer.stdout)
        if trainer.returncode != 0:
            print('Inline trainer failed:', trainer.stderr)
            return False
        return MODEL_FILE.exists()


TRAIN_INLINE_SCRIPT = r"""
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
import joblib

p = Path('')
csv_path = p / 'Parkinsons Disease.csv'
if not csv_path.exists():
    print('CSV not found at', csv_path)
    raise SystemExit(1)

df = pd.read_csv(csv_path)
# drop ID column if present
if 'ID' in df.columns:
    df = df.drop(columns=['ID'])
# assume last column 'status' is label (1 or 0)
if 'status' not in df.columns:
    print('status column missing')
    raise SystemExit(1)

X = df.drop(columns=['status']).values
y = df['status'].values
clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(X, y)
joblib.dump(clf, 'rfcl_parkinsons.joblib')
print('Saved rfcl_parkinsons.joblib')
"""


def run_extractor(wav_path):
    # Always extract features for the current upload (don't skip if files exist)
    if not EXTRACTOR.exists():
        raise FileNotFoundError(f'Extractor not found: {EXTRACTOR}')

    # Ensure WAV is in additionals as user_voice.wav
    shutil.copyfile(wav_path, WAV_DEST)
    print('Copied uploaded wav to', WAV_DEST, file=sys.stderr)

    print(f'Running extractor: {EXTRACTOR}', file=sys.stderr)
    res = subprocess.run([sys.executable, str(EXTRACTOR), str(WAV_DEST)], cwd=str(ADDITIONALS), capture_output=True, text=True)
    print('Extractor stdout:', res.stdout, file=sys.stderr)
    if res.returncode != 0:
        print('Extractor stderr:', res.stderr, file=sys.stderr)
        print('Extractor return code:', res.returncode, file=sys.stderr)
        raise RuntimeError(f'Feature extraction failed: {res.stderr}')


def predict():
    if not FEATURES_NPY.exists():
        raise FileNotFoundError('Features .npy not found')
    import numpy as np
    import joblib

    fv = np.load(str(FEATURES_NPY))
    model = joblib.load(str(MODEL_FILE))
    # Use predict_proba when available
    prob = None
    try:
        prob = model.predict_proba(fv)[0]
        # probability of class 1
        p1 = float(prob[1])
        score = round(p1 * 100, 1)
    except Exception:
        pred = model.predict(fv)[0]
        p1 = float(pred)
        score = 80.0 if pred == 1 else 20.0

    # load JSON features if present
    details = {}
    if FEATURES_JSON.exists():
        try:
            with open(str(FEATURES_JSON),'r') as f:
                details = json.load(f)
                print(f'Loaded features from JSON: {details}', file=sys.stderr)
        except Exception as e:
            print(f'Failed to read features JSON: {e}', file=sys.stderr)
            details = {}
    else:
        print(f'Features JSON not found at {FEATURES_JSON}', file=sys.stderr)
    
    # If details are empty, compute basic values from the audio file to avoid always returning same values
    if not details or 'jitter_perc' not in details:
        print('Computing basic audio features as fallback...', file=sys.stderr)
        try:
            import librosa
            import numpy as np
            if os.path.exists(WAV_DEST):
                y, sr = librosa.load(str(WAV_DEST), sr=None)
                f0, voiced_flag, voiced_probs = librosa.pyin(y, fmin=50, fmax=500, sr=sr)
                f0_clean = f0[~np.isnan(f0)]
                
                if len(f0_clean) > 1:
                    periods = 1 / f0_clean
                    diff_periods = np.abs(np.diff(periods))
                    jitter_perc = 100 * np.mean(diff_periods / periods[:-1])
                    
                    frame_amp = librosa.feature.rms(y=y)[0]
                    shimmer_perc = 100 * np.mean(np.abs(np.diff(frame_amp) / frame_amp[:-1]))
                    
                    details['jitter_perc'] = float(jitter_perc)
                    details['shimmer_perc'] = float(shimmer_perc)
                    print(f'Computed fallback features: jitter={jitter_perc:.2f}%, shimmer={shimmer_perc:.2f}%', file=sys.stderr)
        except Exception as e:
            print(f'Fallback feature computation failed: {e}', file=sys.stderr)
            # Use minimal defaults if everything fails
            if 'jitter_perc' not in details:
                details['jitter_perc'] = 0.5
            if 'shimmer_perc' not in details:
                details['shimmer_perc'] = 2.0

    # Clinical thresholds from UCI Parkinson's dataset:
    # Healthy jitter: 0.0039 ± 0.0021 (max ~0.0079)
    # PD jitter: 0.0070 ± 0.0052 (mean ~1.8x higher)
    # Healthy shimmer: 0.0176 ± 0.0055
    # PD shimmer: 0.0337 ± 0.0200 (mean ~1.9x higher)
    #
    # Risk assessment using model score + feature inspection:
    # - High: model score >= 80 OR (jitter > 1.0% AND shimmer > 5.0%)
    # - Moderate: model score >= 50 OR (jitter > 0.75% OR shimmer > 3.5%)
    # - Low: otherwise (healthy baseline)
    
    jitter_perc = details.get('jitter_perc', 0.5)
    shimmer_perc = details.get('shimmer_perc', 2.0)
    
    if score >= 80 or (jitter_perc > 1.0 and shimmer_perc > 5.0):
        risk = 'High'
    elif score >= 50 or (jitter_perc > 0.75 or shimmer_perc > 3.5):
        risk = 'Moderate'
    else:
        risk = 'Low'

    out = {
        'voice_score': score,
        'voice_risk': risk,
        'details': details,
    }
    print(json.dumps(out))
    return out


def main():
    if len(sys.argv) < 2:
        print('Usage: predict_wrapper.py <wavfile>')
        sys.exit(1)
    wav = sys.argv[1]
    if not os.path.exists(wav):
        print('Provided wav not found:', wav)
        sys.exit(1)

    ok = ensure_model()
    if not ok:
        print('Model setup failed')
        sys.exit(1)

    try:
        run_extractor(wav)
        import time
        # Small delay to ensure files are written
        time.sleep(0.5)
        predict()
    except Exception as e:
        print('ERROR:', str(e), file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
