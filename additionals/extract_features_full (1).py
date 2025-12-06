import librosa
import numpy as np
import json
import sys

def extract_features_uci_style(audio_path):
    """
    Extract features similar to the UCI Parkinson's dataset:
    - F0 mean
    - F0 max
    - F0 min
    - Jitter (%)
    - Jitter (abs)
    - RAP jitter
    - PPQ jitter
    - Shimmer %
    - Shimmer (abs)
    - APQ shimmer
    - HNR
    - ... (fill to match ~22 features)
    """

    y, sr = librosa.load(audio_path, sr=None)

    # Fundamental frequency (F0)
    f0, voiced_flag, voiced_probs = librosa.pyin(
        y, fmin=50, fmax=500, sr=sr
    )

    f0_clean = f0[~np.isnan(f0)]
    f0_mean = np.mean(f0_clean)
    f0_std = np.std(f0_clean)

    # Jitter (approximation)
    periods = 1 / f0_clean
    diff_periods = np.abs(np.diff(periods))
    jitter_abs = np.mean(diff_periods)
    jitter_perc = 100 * np.mean(diff_periods / periods[:-1])

    # Shimmer (approx)
    frame_amp = librosa.feature.rms(y=y)[0]
    shimmer_abs = np.mean(np.abs(np.diff(frame_amp)))
    shimmer_perc = 100 * np.mean(np.abs(np.diff(frame_amp) / frame_amp[:-1]))

    # Harmonics-to-noise ratio (HNR)
    S = librosa.stft(y)
    harmonic, percussive = librosa.decompose.hpss(S)
    hnr = 10 * np.log10(np.sum(np.abs(harmonic)) / np.sum(np.abs(percussive)))

    # ---------------------------
    # Build a 22-feature UCI-like vector
    # ---------------------------

    feature_vector = np.array([[
        f0_mean,
        f0_std,
        np.max(f0_clean),
        np.min(f0_clean),

        jitter_perc,
        jitter_abs,

        shimmer_perc,
        shimmer_abs,

        hnr,

        # Additional filler features to reach 22 inputs (model expects 22)
        np.mean(y),
        np.std(y),
        np.max(y),
        np.min(y),
        np.percentile(y, 25),
        np.percentile(y, 50),
        np.percentile(y, 75),
        np.mean(frame_amp),
        np.std(frame_amp),
        np.max(frame_amp),
        np.min(frame_amp),
        np.mean(voiced_probs),
        np.std(voiced_probs)
    ]])

    return feature_vector, {
        "f0_mean": float(f0_mean),
        "f0_std": float(f0_std),
        "jitter_perc": float(jitter_perc),
        "jitter_abs": float(jitter_abs),
        "shimmer_perc": float(shimmer_perc),
        "shimmer_abs": float(shimmer_abs),
        "hnr": float(hnr)
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_features_full.py <audiofile.wav>")
        sys.exit(1)

    audio_file = sys.argv[1]
    fv, summary = extract_features_uci_style(audio_file)

    np.save("user_features_uci.npy", fv)

    with open("user_features_uci.json", "w") as f:
        json.dump(summary, f, indent=4)

    print("Extracted features:")
    print(json.dumps(summary, indent=4))

    print("\nSaved:")
    print("- user_features_uci.npy")
    print("- user_features_uci.json")
