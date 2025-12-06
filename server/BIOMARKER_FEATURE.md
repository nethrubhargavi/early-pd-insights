# Biomarker Analysis Feature

## Overview

The biomarker analysis feature allows users to upload medical reports (PDF, images, CSV, or Word documents) containing lab results. The system automatically extracts biomarker values and assesses whether they fall within clinical normal ranges.

## Supported Biomarkers

1. **Thyroid Markers**
   - TSH: 0.4-4.0 mg/dL
   - T3: 2.3-4.2 pg/ml
   - T4: 0.8-1.8 ng/dL

2. **Nutritional Status**
   - Vitamin B12: 200-900 pg/dL
   - Folate: 2.0-5.0 ng/dL
   - Vitamin D: 30-50 ng/ml

3. **PD-Related Biomarkers**
   - Serum Ceruloplasmin: 20-40 mg/dL
   - CSF Alpha-synuclein: 1.2-1.8 ng/ml
   - CSF Phospho-tau: 20-40 pg/ml
   - CSF NFL (Neurofilament Light): <1000 pg/ml

## Architecture

### Frontend (React/TypeScript)
- **Upload.tsx**: File upload interface with drag-and-drop support
- Accepts: PDF, JPG, PNG, CSV, DOCX
- Max file size: 10MB
- Calls `/api/analyze-biomarkers` endpoint

### Backend (Node.js/Express)
- **POST /api/analyze-biomarkers**: Processes uploaded files
- Spawns Python biomarker analyzer process
- Returns JSON with extracted biomarkers and risk assessment
- Cleans up temporary uploaded files

### Python Analysis Engine
- **biomarker_analyzer.py**: Main analysis script
- **Features**:
  - PDF text extraction (uses pdfplumber or PyPDF2)
  - Image OCR (uses pytesseract)
  - CSV parsing (pandas)
  - Regex-based biomarker value extraction
  - Clinical range comparison
  - Risk assessment

## Risk Calculation

**Biomarker Risk Assessment**:
- **Low**: All detected biomarkers within normal ranges
- **Moderate**: 1-3 biomarkers abnormal
- **High**: 4+ biomarkers abnormal

**Score Mapping**:
- Low → Score: 0 (20 displayed)
- Moderate → Score: 50
- High → Score: 70 (or higher based on details)

## Final Risk Index Integration

When biomarker reports are uploaded, they are weighted into the overall PD risk assessment:

**With Biomarkers**:
- Hand Tremor: 35%
- Voice Analysis: 25%
- Facial Scan: 25%
- Lab Biomarkers: 15%

**Without Biomarkers** (original):
- Hand Tremor: 40%
- Voice Analysis: 30%
- Facial Scan: 30%

Total Risk Index = 0-100 scale:
- **Low**: 0-40
- **Moderate**: 40-70
- **High**: 70-100

## Installation & Setup

### Python Dependencies

```bash
cd server
pip install -r biomarker_requirements.txt
```

**Additional Requirement**: Tesseract OCR must be installed for image processing:

**Windows**:
```powershell
# Install via chocolatey
choco install tesseract
# Or download installer from: https://github.com/UB-Mannheim/tesseract/wiki
```

**macOS**:
```bash
brew install tesseract
```

**Linux**:
```bash
sudo apt-get install tesseract-ocr
```

### Database Migration

Apply the migration to add biomarker columns:
```bash
# Supabase CLI
supabase migration up
```

Or manually run:
```sql
ALTER TABLE public.uploaded_reports 
ADD COLUMN biomarker_analysis JSONB;

ALTER TABLE public.uploaded_reports 
ADD COLUMN biomarker_risk TEXT CHECK (biomarker_risk IN ('low', 'moderate', 'high'));
```

## Usage Flow

1. **User uploads report**:
   - Navigates to "Medical Reports" page
   - Drags/drops or selects file (PDF/Image/CSV/DOCX)
   - System validates file type and size

2. **Server processes**:
   - POST to `/api/analyze-biomarkers`
   - Python extracts text (OCR for images, PDF parsing for documents)
   - Regex-based biomarker value extraction
   - Clinical range assessment

3. **Results stored**:
   - Biomarker values and assessment saved to database
   - Score computed (0-100)

4. **Results integrated**:
   - Results.tsx fetches latest biomarker report
   - Recalculates final risk with biomarker weighting
   - Displays biomarker score card in breakdown
   - Updates fusion weights to reflect biomarker inclusion

## API Endpoints

### POST /api/analyze-biomarkers
Analyzes uploaded medical report file.

**Request**:
- Body: `multipart/form-data` with file

**Response** (Success):
```json
{
  "success": true,
  "biomarkers": [
    {
      "name": "TSH",
      "value": 2.5,
      "unit": "mg/dL",
      "normal_range": "0.4-4.0",
      "status": "normal"
    },
    {
      "name": "B12",
      "value": 150,
      "unit": "pg/dL",
      "normal_range": "200-900",
      "status": "low"
    }
  ],
  "assessment": {
    "risk": "moderate",
    "score": 50,
    "details": "Low: B12"
  },
  "found_count": 2,
  "abnormal_count": 1
}
```

**Response** (Error):
```json
{
  "error": "Failed to extract text from file"
}
```

## Limitations & Notes

1. **OCR Accuracy**: Image quality affects OCR accuracy. High-quality scans perform better.

2. **Format Variability**: Different lab report formats may not be perfectly parsed. System uses regex patterns and may miss non-standard layouts.

3. **Manual Review**: Always recommend manual review by healthcare professional for critical values.

4. **Optional Feature**: Biomarker reports are optional. Screening works without them.

5. **Privacy**: All files are processed server-side and temporary files are deleted after analysis.

## Future Enhancements

- [ ] Support for more biomarker types
- [ ] Machine learning-based document structure parsing
- [ ] Multi-language OCR support
- [ ] Batch upload processing
- [ ] Historical biomarker trend analysis
- [ ] Integration with EHR systems
