#!/usr/bin/env python3
"""
Biomarker analyzer: Extract biomarker values from medical reports (PDF, images, CSV)
and assess whether they fall within normal ranges.
"""

import sys
import json
import re
import os
from pathlib import Path

# Try to import dependencies; provide helpful error messages if missing
try:
    import pytesseract
    from PIL import Image
    import pandas as pd
except ImportError as e:
    print(json.dumps({
        "error": f"Missing dependency: {str(e)}. Please install: pip install pytesseract pillow pandas",
        "biomarkers": []
    }))
    sys.exit(1)

# Try to import pdf handling library
try:
    import PyPDF2
except ImportError:
    try:
        import pdfplumber
    except ImportError:
        pdfplumber = None
    PyPDF2 = None
# Optional: Google GenAI integration. The code will attempt to import and use
# the Google Generative AI Python client if available and if the environment
# variable `GOOGLE_API_KEY` is set. If not available, the analyzer falls back
# to regex-based extraction implemented above.
try:
    import google.generativeai as genai
except Exception:
    genai = None

# Define biomarker normal ranges
BIOMARKER_RANGES = {
    "TSH": {"unit": "mg/dL", "min": 0.4, "max": 4.0, "names": ["TSH", "tsh"]},
    "T3": {"unit": "pg/ml", "min": 2.3, "max": 4.2, "names": ["T3", "t3", "triiodothyronine"]},
    "T4": {"unit": "ng/dL", "min": 0.8, "max": 1.8, "names": ["T4", "t4", "thyroxine"]},
    "B12": {"unit": "pg/dL", "min": 200, "max": 900, "names": ["B12", "b12", "vitamin B12", "cobalamin"]},
    "Folate": {"unit": "ng/dL", "min": 2.0, "max": 5.0, "names": ["Folate", "folate", "folic acid"]},
    "Vitamin D": {"unit": "ng/ml", "min": 30, "max": 50, "names": ["Vitamin D", "vitamin d", "25-OH Vitamin D", "calcitriol"]},
    "Ceruloplasmin": {"unit": "mg/dL", "min": 20, "max": 40, "names": ["Ceruloplasmin", "ceruloplasmin", "serum ceruloplasmin"]},
    "Alpha-synuclein": {"unit": "ng/ml", "min": 1.2, "max": 1.8, "names": ["alpha-synuclein", "α-synuclein", "CSF alpha-synuclein"]},
    "Phospho-tau": {"unit": "pg/ml", "min": 20, "max": 40, "names": ["phospho tau", "phospho-tau", "p-tau", "CSF phospho-tau"]},
    "NFL": {"unit": "pg/ml", "min": 0, "max": 1000, "names": ["NFL", "neurofilament light", "CSF NFL"]},
}

def extract_text_from_pdf(pdf_path):
    """Extract text from PDF file."""
    text = ""
    try:
        if pdfplumber:
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    text += page.extract_text() or ""
        elif PyPDF2:
            with open(pdf_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text()
        else:
            return None
    except Exception as e:
        print(f"Error reading PDF: {e}", file=sys.stderr)
        return None
    return text

def extract_text_from_image(image_path):
    """Extract text from image using OCR."""
    try:
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img)
        return text
    except Exception as e:
        print(f"Error reading image: {e}", file=sys.stderr)
        return None

def parse_csv(csv_path):
    """Parse CSV file and return as text representation."""
    try:
        df = pd.read_csv(csv_path)
        return df.to_string()
    except Exception as e:
        print(f"Error reading CSV: {e}", file=sys.stderr)
        return None

def extract_biomarkers_from_text(text):
    """
    Extract biomarker names and values from text.
    Returns list of found biomarkers with their numeric values only.
    """
    found_biomarkers = []
    
    if not text:
        return found_biomarkers
    
    # Search for each biomarker name and nearby number value
    number_rx = r"([<>]?\s*[0-9]{1,3}(?:[\.,][0-9]+)?)"

    for biomarker_key, info in BIOMARKER_RANGES.items():
        found = False
        for name_variant in info["names"]:
            # Pattern 1: name ... number (within 60 chars)
            pattern1 = re.compile(rf"{re.escape(name_variant)}[\s\S]{{0,60}}?{number_rx}", re.IGNORECASE)
            m1 = pattern1.search(text)
            if m1:
                raw = m1.group(1)
            else:
                # Pattern 2: number ... name (within 20 chars)
                pattern2 = re.compile(rf"{number_rx}[\s\S]{{0,20}}?{re.escape(name_variant)}", re.IGNORECASE)
                m2 = pattern2.search(text)
                raw = m2.group(1) if m2 else None

            if raw:
                # Clean: remove spaces, tabs, normalize decimal
                raw_clean = raw.replace(' ', '').replace('\t', '')
                raw_clean = raw_clean.replace(',', '.')  # normalize comma to dot
                
                # Extract numeric part (remove < or >)
                if raw_clean.startswith('<') or raw_clean.startswith('>'):
                    raw_num = raw_clean[1:]
                else:
                    raw_num = raw_clean

                try:
                    value = float(raw_num)
                    found_biomarkers.append({
                        'name': biomarker_key,
                        'value': value,
                    })
                    found = True
                except Exception:
                    continue
            
            if found:
                break
    
    return found_biomarkers


def genai_extract_biomarkers(text):
    """
    Use Google Generative AI to extract biomarker names and numeric values
    from freeform text. Returns list of {name, value, unit?} dicts.
    Falls back to None if GenAI not configured or call fails.
    """
    if genai is None:
        return None

    api_key = os.environ.get('GOOGLE_API_KEY') or os.environ.get('GENAI_API_KEY')
    if not api_key:
        return None

    try:
        # configure client
        try:
            genai.configure(api_key=api_key)
        except Exception:
            # older/newer clients may differ; ignore if already configured
            pass

        # Build a clear prompt instructing the model to return strict JSON
        biomarker_list = ", ".join(list(BIOMARKER_RANGES.keys()))
        prompt = (
            "Extract the following biomarker names and their numeric values "
            f"from the medical report text. Biomarkers: {biomarker_list}. \n"
            "Return ONLY a JSON array of objects with keys: name, value, unit (optional). "
            "If a biomarker is not present, omit it. Use numeric values only (no text).\n\n"
            "Report text:\n" + text
        )

        # Use chat method where available
        try:
            resp = genai.chat.create(model="gpt-4o-mini", messages=[{"role": "user", "content": prompt}])
            content = resp.choices[0].message.get('content') if hasattr(resp, 'choices') else resp['output'][0]['content']
        except Exception:
            # Try a simpler interface
            resp = genai.generate_text(model="gpt-4o-mini", text=prompt)
            content = resp.text if hasattr(resp, 'text') else str(resp)

        # Find first JSON substring in the response
        m = re.search(r"(\[\s*\{[\s\S]*\}\s*\])", content)
        if not m:
            # If model returned plain JSON, attempt to load directly
            try:
                parsed = json.loads(content)
            except Exception:
                return None
        else:
            try:
                parsed = json.loads(m.group(1))
            except Exception:
                return None

        results = []
        for item in parsed:
            name = item.get('name') or item.get('biomarker')
            val = item.get('value')
            unit = item.get('unit') if 'unit' in item else None
            try:
                if isinstance(val, str):
                    # clean numeric
                    val = val.replace(',', '.').strip()
                val = float(val)
            except Exception:
                continue
            # Normalize name to known key if possible
            key = None
            for k, info in BIOMARKER_RANGES.items():
                if name and name.lower() in [n.lower() for n in info['names']] or (name and name.lower() == k.lower()):
                    key = k
                    break
            results.append({'name': key or name, 'value': val, 'unit': unit})
        return results
    except Exception as e:
        print(f"GenAI extraction failed: {e}", file=sys.stderr)
        return None

def assess_biomarker_risk(biomarkers):
    """
    Assess overall risk based on biomarker findings.
    Returns risk level and score based on how many are abnormal.
    """
    if not biomarkers:
        return {"risk": "low", "score": 0}
    
    # Determine status for each biomarker
    abnormal_count = 0
    high_count = 0
    low_count = 0
    
    for biomarker in biomarkers:
        name = biomarker['name']
        value = biomarker['value']
        
        if name in BIOMARKER_RANGES:
            info = BIOMARKER_RANGES[name]
            if value < info['min']:
                abnormal_count += 1
                low_count += 1
            elif value > info['max']:
                abnormal_count += 1
                high_count += 1
    
    # Assign risk based on number of abnormalities
    if abnormal_count == 0:
        return {"risk": "low", "score": 10}
    elif abnormal_count == 1:
        return {"risk": "moderate", "score": 45}
    elif abnormal_count <= 3:
        return {"risk": "moderate", "score": 55}
    else:
        return {"risk": "high", "score": 75}

def analyze_report(file_path):
    """Main function to analyze a report file. Extracts biomarkers and computes risk."""
    file_ext = Path(file_path).suffix.lower()
    
    text = None
    if file_ext == ".pdf":
        text = extract_text_from_pdf(file_path)
    elif file_ext in [".jpg", ".jpeg", ".png"]:
        text = extract_text_from_image(file_path)
    elif file_ext == ".csv":
        text = parse_csv(file_path)
    else:
        return {"error": f"Unsupported file type: {file_ext}"}
    
    if text is None:
        return {"error": "Failed to extract text from file"}
    
    # Try GenAI extraction first (if configured), then fall back to regex extraction
    biomarkers = None
    try:
        biomarkers = genai_extract_biomarkers(text)
    except Exception:
        biomarkers = None

    if biomarkers is None:
        biomarkers = extract_biomarkers_from_text(text)

    # Assess risk based on biomarkers
    risk_assessment = assess_biomarker_risk(biomarkers)
    
    return {
        "success": True,
        "biomarkers": biomarkers,
        "risk_assessment": risk_assessment
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: biomarker_analyzer.py <file_path>"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    result = analyze_report(file_path)
    print(json.dumps(result))
