# Biomarker Feature Setup Guide

## Quick Start

### 1. Install Python Dependencies

```powershell
cd server
pip install -r biomarker_requirements.txt
```

### 2. Install Tesseract OCR (Required for image processing)

**Windows** (Recommended: Use Chocolatey):
```powershell
choco install tesseract
```

Or download the installer directly:
- Download from: https://github.com/UB-Mannheim/tesseract/wiki
- Run the installer
- Default installation path: `C:\Program Files\Tesseract-OCR`
- Pytesseract should auto-detect the path

**If auto-detection fails**, set environment variable in Python:
```python
import pytesseract
pytesseract.pytesseract.pytesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
```

### 3. Apply Database Migration

The migration file has been created at:
`supabase/migrations/20251206_add_biomarker_analysis.sql`

**If using Supabase CLI**:
```bash
supabase migration up
```

**If using manual SQL**:
Connect to your Supabase database and run:
```sql
ALTER TABLE public.uploaded_reports 
ADD COLUMN biomarker_analysis JSONB;

ALTER TABLE public.uploaded_reports 
ADD COLUMN biomarker_risk TEXT CHECK (biomarker_risk IN ('low', 'moderate', 'high'));
```

### 4. Start the Application

```powershell
# Terminal 1: Start backend server
cd server
node index.js

# Terminal 2: Start frontend
npm run dev
```

### 5. Test the Feature

1. **Start a screening session** → Complete hand, voice, and facial tests
2. **Go to Results page** → Should show current risk (without biomarkers yet)
3. **Navigate to Medical Reports** → Upload a test report
4. **Sample test formats**:
   - **PDF**: Save a lab report as PDF
   - **Image**: Take a photo of a printed lab report
   - **CSV**: Create a simple CSV like:
     ```
     Biomarker,Value,Unit
     TSH,2.5,mg/dL
     B12,350,pg/dL
     Folate,3.5,ng/dL
     Vitamin D,45,ng/ml
     ```
5. **Monitor server logs** for biomarker extraction output
6. **Re-visit Results page** → Should now show:
   - Lab Biomarkers score card
   - Updated final risk index (adjusted weights)
   - Biomarker-inclusive fusion weights

## File Structure

```
server/
├── index.js                      # Express server with new /api/analyze-biomarkers endpoint
├── biomarker_analyzer.py         # Python script for biomarker extraction & assessment
├── biomarker_requirements.txt     # Python dependencies
└── BIOMARKER_FEATURE.md          # Feature documentation

src/pages/
├── Upload.tsx                    # Updated with biomarker analysis call
└── tests/
    └── Results.tsx               # Updated to fetch & integrate biomarker data

supabase/migrations/
└── 20251206_add_biomarker_analysis.sql  # DB schema additions
```

## Supported Formats

### File Types
- **.pdf**: PDFs are parsed using pdfplumber or PyPDF2
- **.jpg / .png**: Images are processed with Tesseract OCR
- **.csv**: CSV files are parsed and searched for biomarker values
- **.docx**: Word documents (text extracted as plain text)

### Document Layout
The system uses regex patterns to find biomarkers. It looks for:
- Biomarker name (case-insensitive)
- Followed by a numeric value
- Optionally followed by the unit

**Example patterns it finds**:
- `TSH: 2.5 mg/dL`
- `2.5 TSH`
- `Vitamin D - 45 ng/ml`
- `B12=350 pg/dL`

## Troubleshooting

### Issue: "Tesseract not found" error
**Solution**: Install Tesseract or set the path in biomarker_analyzer.py

### Issue: OCR returns gibberish/empty text
**Solution**: 
- Ensure image quality is good (high resolution, clear text)
- Try a different image format
- Manual entry into CSV may be faster for low-quality images

### Issue: Biomarkers not detected in report
**Solution**:
- Biomarker names must match expected names (see list in BIOMARKER_FEATURE.md)
- Check spelling in the report
- Some lab reports use abbreviations—may need pattern updates
- Try uploading as CSV if PDF fails

### Issue: Server returns 500 on upload
**Solution**:
- Check server logs for Python error message
- Ensure Python dependencies installed: `pip list | grep -E "pytesseract|pandas|Pillow|pdfplumber|PyPDF2"`
- Verify file format is valid
- Check file size < 10MB

### Issue: Biomarker scores not appearing on Results page
**Solution**:
- Ensure migration has been applied (check DB schema)
- Verify report was uploaded AFTER completing the screening session
- Try refreshing the page or checking browser console for errors
- Check Supabase logs for DB query errors

## Biomarker Normal Ranges

| Biomarker | Min | Max | Unit | Status if Out of Range |
|-----------|-----|-----|------|----------------------|
| TSH | 0.4 | 4.0 | mg/dL | Abnormal (hyper/hypo) |
| T3 | 2.3 | 4.2 | pg/ml | Abnormal |
| T4 | 0.8 | 1.8 | ng/dL | Abnormal |
| B12 | 200 | 900 | pg/dL | Low/Deficiency |
| Folate | 2.0 | 5.0 | ng/dL | Low/Deficiency |
| Vitamin D | 30 | 50 | ng/ml | Low/High |
| Ceruloplasmin | 20 | 40 | mg/dL | Abnormal (Wilson's) |
| Alpha-synuclein | 1.2 | 1.8 | ng/ml | Abnormal |
| Phospho-tau | 20 | 40 | pg/ml | High (neurodegeneration) |
| NFL | 0 | 1000 | pg/ml | High (neurodegeneration) |

## Risk Scoring Logic

**Abnormal Count → Risk Category**:
- 0 abnormal: **Low** (biomarker_score = 20)
- 1-3 abnormal: **Moderate** (biomarker_score = 50)
- 4+ abnormal: **High** (biomarker_score = 70)

**Final Risk Index** (with biomarkers):
```
finalScore = (hand × 0.35) + (voice × 0.25) + (facial × 0.25) + (biomarker × 0.15)
```

**Risk Category**:
- 0-40: Low
- 40-70: Moderate
- 70-100: High

## Next Steps / Enhancements

- [ ] Add AI model for better document structure parsing
- [ ] Support more biomarker types (e.g., CRP, ESR, uric acid, homocysteine)
- [ ] Implement historical trend analysis (compare reports over time)
- [ ] Add batch upload for multiple reports
- [ ] Multi-language OCR support
- [ ] EHR system integration
