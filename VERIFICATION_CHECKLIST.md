# Biomarker Feature - Verification Checklist

## Pre-Deployment Verification

### Backend Setup
- [ ] `server/biomarker_analyzer.py` created with all biomarker patterns
- [ ] `server/index.js` updated with `/api/analyze-biomarkers` endpoint
- [ ] `server/biomarker_requirements.txt` created with all dependencies
- [ ] Tesseract OCR installed on development machine
- [ ] Python script tested locally: `python biomarker_analyzer.py test.pdf`

### Database
- [ ] Migration file created: `supabase/migrations/20251206_add_biomarker_analysis.sql`
- [ ] New columns added to `uploaded_reports` table:
  - [ ] `biomarker_analysis JSONB`
  - [ ] `biomarker_risk TEXT CHECK (biomarker_risk IN ('low', 'moderate', 'high'))`

### Frontend Updates
- [ ] `src/pages/Upload.tsx` calls biomarker endpoint on upload
- [ ] Biomarker scores stored to database
- [ ] `src/pages/tests/Results.tsx` fetches biomarker data
- [ ] Results page displays biomarker card when available
- [ ] Weights update dynamically (35/25/25/15 with biomarkers vs 40/30/30 without)
- [ ] Final risk recalculated with biomarker inclusion

### Documentation
- [ ] `BIOMARKER_SETUP.md` created at project root
- [ ] `server/BIOMARKER_FEATURE.md` created with feature details
- [ ] `IMPLEMENTATION_SUMMARY.md` created with overview

## Installation Verification

### Step 1: Python Dependencies
```bash
cd server
pip install -r biomarker_requirements.txt
```
- [ ] pytesseract installed
- [ ] Pillow installed
- [ ] pandas installed
- [ ] PyPDF2 installed
- [ ] pdfplumber installed

**Verify**: `pip list | findstr pytesseract Pillow pandas PyPDF2 pdfplumber`

### Step 2: Tesseract OCR
```bash
tesseract --version
```
- [ ] Tesseract installed and in PATH
- [ ] Version output shows (should be 5.x or higher)

**If not in PATH, update biomarker_analyzer.py**:
```python
import pytesseract
pytesseract.pytesseract.pytesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
```

### Step 3: Database Migration
- [ ] Connect to Supabase
- [ ] Run migration or execute SQL manually
- [ ] Verify columns exist: 
  ```sql
  SELECT column_name, data_type FROM information_schema.columns 
  WHERE table_name='uploaded_reports';
  ```

## Functional Testing

### Test 1: File Upload & Analysis
- [ ] Start backend: `node server/index.js` (should not error)
- [ ] Upload a test report (PDF/Image/CSV)
- [ ] Check server logs for: `Analyzing biomarkers from file`
- [ ] Verify response contains biomarkers array
- [ ] Verify database stores biomarker_analysis JSON

### Test 2: Biomarker Detection
**Test with this CSV content** (save as test.csv):
```
Biomarker,Value,Unit
TSH,3.5,mg/dL
Vitamin D,35,ng/ml
B12,450,pg/dL
```

Expected: 
- [ ] TSH detected as normal (3.5 in 0.4-4.0)
- [ ] Vitamin D detected as normal (35 in 30-50)
- [ ] B12 detected as normal (450 in 200-900)
- [ ] Assessment: risk="low", score=20

### Test 3: Abnormal Values Detection
**Test with this CSV content** (save as test_abnormal.csv):
```
Biomarker,Value,Unit
TSH,0.1,mg/dL
B12,100,pg/dL
Folate,1.0,ng/dL
```

Expected:
- [ ] TSH detected as low (0.1 < 0.4)
- [ ] B12 detected as low (100 < 200)
- [ ] Folate detected as low (1.0 < 2.0)
- [ ] Assessment: risk="moderate", abnormal_count=3

### Test 4: Results Page Integration
- [ ] Complete a full screening (hand/voice/facial)
- [ ] Go to Results page
- [ ] Verify results show without biomarkers (original weights 40/30/30)
- [ ] Upload a report with abnormal values
- [ ] Refresh Results page
- [ ] Verify:
  - [ ] Biomarker score card appears
  - [ ] Final risk updated
  - [ ] Weights changed to 35/25/25/15
  - [ ] New final score = (hand×0.35 + voice×0.25 + facial×0.25 + biomarker×0.15)

### Test 5: Multiple File Formats
- [ ] Test with PDF report
- [ ] Test with JPEG image of lab report (OCR)
- [ ] Test with PNG image (OCR)
- [ ] Test with CSV data
- [ ] Test with Word document

Expected: All formats should extract biomarkers correctly

### Test 6: Edge Cases
- [ ] Upload blank PDF: `{"error": "No biomarkers found"}`
- [ ] Upload image with low quality: Should attempt OCR, may return partial results
- [ ] Upload file > 10MB: Should reject with size error
- [ ] Upload unsupported format (.txt, .xlsx): Should reject

## UI/UX Verification

### Results Page Changes
- [ ] When no biomarkers: Only 3 module cards (Hand/Voice/Facial)
- [ ] When biomarkers present: 4 module cards including "Lab Biomarkers"
- [ ] Biomarker card shows:
  - [ ] Score progress bar (0-100)
  - [ ] Risk badge (Low/Moderate/High)
  - [ ] Numeric score
  - [ ] Weight notation (15%)
- [ ] Fusion Weights section updates:
  - [ ] Shows 35% for Tremor (when biomarkers)
  - [ ] Shows 25% for Voice (when biomarkers)
  - [ ] Shows 25% for Facial (when biomarkers)
  - [ ] Shows 15% for Biomarkers (when biomarkers)

### Upload Page
- [ ] Accepts: PDF, JPG, PNG, CSV, DOCX
- [ ] Rejects: TXT, EXE, etc.
- [ ] File size validation works
- [ ] Drag-and-drop works
- [ ] Success toast shows after upload
- [ ] Uploaded file appears in list with score

## Performance & Logging

### Server Logs
- [ ] Check for errors during biomarker analysis
- [ ] Verify temporary files are deleted
- [ ] No memory leaks from multiple uploads

**Expected log entries**:
```
Using Python executable: python
Analyzing biomarkers from file: C:\...\upload_1234567890.pdf
Deleted file: upload_1234567890.pdf
```

### Response Times
- [ ] PDF analysis: < 5 seconds
- [ ] Image OCR: < 10 seconds (depends on quality)
- [ ] CSV parsing: < 1 second

## Rollback Plan

If issues found:
- [ ] Database migration can be reversed (remove added columns)
- [ ] Backend endpoint can be disabled (comment out in index.js)
- [ ] Frontend still works without biomarkers (graceful degradation)

## Post-Deployment

- [ ] Monitor error logs for first week
- [ ] Test with real medical reports (various lab formats)
- [ ] Gather user feedback
- [ ] Document any unsupported formats
- [ ] Plan for biomarker pattern updates if needed

## Sign-Off

- [ ] All tests passed: _____ (date)
- [ ] Ready for production: _____ (yes/no)
- [ ] Notes: _________________________________

---

## Quick Debug Commands

```powershell
# Test Python script directly
cd server
python biomarker_analyzer.py "path/to/report.pdf"

# Verify Python dependencies
pip list | findstr pytesseract Pillow pandas

# Check Tesseract installation
where tesseract
tesseract --version

# Test server endpoint (requires curl or Postman)
curl -X POST -F "file=@test.pdf" http://localhost:4000/api/analyze-biomarkers

# Check database columns
# In Supabase console, run:
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name='uploaded_reports' 
ORDER BY ordinal_position;
```

## Common Issues & Quick Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Tesseract not found | Not installed or not in PATH | Install via choco or add to PATH |
| No biomarkers detected | OCR quality too low | Use higher resolution image |
| Server 500 on upload | Missing Python dependency | Run pip install -r biomarker_requirements.txt |
| Results not updating | Old browser cache | Clear cache or Ctrl+Shift+Del |
| Database error | Migration not applied | Run SQL manually from migration file |
| Biomarker score not showing | Old session data | Upload new report after schema update |
