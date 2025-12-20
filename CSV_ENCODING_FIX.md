# CSV Encoding Error Fix - Null Bytes (0x00)

## Error Message
```
invalid byte sequence for encoding "UTF8": 0x00
```

## What This Means
Your CSV file contains **null bytes** (invisible `0x00` characters) that PostgreSQL cannot store in UTF-8 encoded text fields.

## ✅ FIXED - Automatic Sanitization

I've added automatic sanitization that removes these invalid characters when you upload the CSV file. **Just try uploading again!**

## How the Fix Works

The CSV parser now:
1. ✅ **Removes null bytes** (`\x00`) from all text
2. ✅ **Removes other control characters** that could cause issues
3. ✅ **Preserves valid content** like newlines and tabs
4. ✅ **Trims whitespace** from all fields

## If You Still Get Errors

If the automatic sanitization doesn't work, try these manual fixes:

### Option 1: Re-save in a Text Editor (Recommended)
1. Open your CSV file in **Notepad** (Windows) or **TextEdit** (Mac)
2. Select All (Ctrl+A / Cmd+A)
3. Copy (Ctrl+C / Cmd+C)
4. Create a **new file**
5. Paste (Ctrl+V / Cmd+V)
6. Save as CSV with **UTF-8 encoding**

### Option 2: Use Google Sheets
1. Upload your CSV to **Google Sheets**
2. File → Download → **Comma Separated Values (.csv)**
3. Use the downloaded file

### Option 3: Clean in Excel
1. Open the CSV in Excel
2. File → Save As
3. Choose **CSV UTF-8 (Comma delimited) (.csv)**
4. Save

### Option 4: Use VS Code
1. Open CSV in **VS Code**
2. Bottom right corner → Click encoding → Choose **UTF-8**
3. Save file

## Common Causes of Null Bytes

| Source | Why It Happens |
|--------|----------------|
| **Excel** | Sometimes adds hidden characters when saving |
| **Copy-Paste** | From PDFs or certain websites |
| **Database Export** | Some database tools add null terminators |
| **Text Editors** | Certain editors on Windows |

## Test Your Upload

Try uploading your CSV file again. The sanitization should automatically clean it!

If you still see errors, the error message will now say:
```
Your CSV file contains invalid characters. 
Please re-save your CSV file in UTF-8 encoding without BOM, 
or try copying the data to a new file.
```

## What Gets Removed

The sanitization removes:
- ✅ Null bytes (`\x00`)
- ✅ Control characters (except newlines and tabs)
- ✅ Other invisible characters that cause encoding issues

What's preserved:
- ✅ All your text content
- ✅ Numbers and dates
- ✅ Commas (CSV delimiters)
- ✅ Newlines (row separators)
- ✅ Tabs (if any)

## Files Modified

- ✅ `bulk-upload-form.tsx` - Added `sanitizeString()` function
- ✅ `bulk-create-taskAndSubTask.ts` - Added UTF-8 error handler

## Try It Now! 🚀

Just upload your CSV file again - the sanitization will happen automatically!
