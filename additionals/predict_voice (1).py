# predict_voice.py
# Full pipeline: record -> extract features -> predict using saved model (rfcl_parkinsons.joblib)
# Place this file in the same folder as extract_features_full.py and rfcl_parkinsons.joblib

import os
import sys
import subprocess
import joblib
import numpy as np
import sounddevice as sd
import soundfile as sf
import time

# -------- configuration --------
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))   # script folder
EXTRACTOR_SCRIPT = os.path.join(PROJECT_DIR, "extract_features_full.py")
MODEL_FILE = os.path.join(PROJECT_DIR, "rfcl_parkinsons.joblib")
WAV_FILE = os.path.join(PROJECT_DIR, "user_voice.wav")
FEATURES_NPY = os.path.join(PROJECT_DIR, "user_features_uci.npy")

# ---------- record audio ----------
def record_audio(path=WAV_FILE, duration=5, fs=22050):
    print("🎤 Recording will start in 1 second. Please prepare and then say 'aaaaah' clearly for 5 seconds.")
    time.sleep(1.0)
    try:
        recording = sd.rec(int(duration * fs), samplerate=fs, channels=1, dtype='float32')
        sd.wait()
        sf.write(path, recording, fs)
    except Exception as e:
        raise RuntimeError(f"Recording failed: {e}")
    print(f"Saved recording to: {path}")

# ---------- run extractor script ----------
def run_extractor(extractor_script, wav_path):
    if not os.path.isfile(extractor_script):
        raise FileNotFoundError(f"Extractor script not found: {extractor_script}")
    if not os.path.isfile(wav_path):
        raise FileNotFoundError(f"WAV file not found (cannot extract): {wav_path}")

    print("🔎 Running feature extractor...")
    # call same python interpreter to avoid venv mismatch
    result = subprocess.run([sys.executable, extractor_script, wav_path], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print("Extractor stderr:\n", result.stderr)
        raise RuntimeError("Feature extractor failed — see stdout/stderr above.")
    print("✅ Feature extraction finished.")

# ---------- load model and predict ----------
def predict_from_features(npy_path, model_path):
    if not os.path.isfile(npy_path):
        raise FileNotFoundError(f"Feature vector not found: {npy_path}")
    if not os.path.isfile(model_path):
        raise FileNotFoundError(f"Saved model not found: {model_path}")

    fv = np.load(npy_path)  # shape (1,22)
    print("Loaded feature vector shape:", fv.shape)

    model = joblib.load(model_path)
    print("Loaded model:", model_path)

    # if model is a pipeline, use it directly; otherwise predict
    pred = model.predict(fv)
    return pred

# ---------- Main ----------
def main():
    try:
        # 1) Record voice
        record_audio(path=WAV_FILE, duration=5, fs=22050)

        # 2) Extract features (this will create user_features_uci.npy)
        run_extractor(EXTRACTOR_SCRIPT, WAV_FILE)

        # 3) Load features + model, predict
        pred = predict_from_features(FEATURES_NPY, MODEL_FILE)

        # 4) Show friendly message
        print("Prediction array:", pred)
        if pred[0] == 1:
            print("\n⚠️  Voice pattern suggests possible tremor characteristics.")
        else:
            print("\n✅ Voice pattern appears normal.")
    except Exception as e:
        print("\nERROR:", e)
        print("Check the messages above. Common issues:")
        print("- extractor script missing or errored")
        print("- rfcl_parkinsons.joblib not saved in project folder")
        print("- user_voice.wav unreadable or not present")
        sys.exit(1)

if __name__ == "__main__":
    main()
