# Downloads Folder Organizer

Automatically sorts files in your Downloads folder into subfolders by file type.

## Setup (Windows)

### 1. Install Python
- Download from https://www.python.org/downloads/
- **Check "Add Python to PATH"** during install (important!)
- Verify: open Command Prompt and run `python --version`

### 2. Clone this repo
```
git clone https://github.com/Cjgibbo/claude-code-projects-or-automation-scripts.git
cd claude-code-projects-or-automation-scripts/downloads-organizer
```

### 3. Run it

**Dry run first** (shows what would happen, moves nothing):
```
python organizer.py --dry-run
```

**Run for real:**
```
python organizer.py
```

**Custom folder:**
```
python organizer.py --path "D:\SomeOtherFolder"
```

## File Categories

Files are sorted into these folders (edit `FILE_CATEGORIES` in `organizer.py` to customize):

| Folder         | Extensions                                    |
|----------------|-----------------------------------------------|
| PDFs           | .pdf                                          |
| Images         | .jpg, .jpeg, .png, .gif, .bmp, .svg, etc.    |
| Documents      | .doc, .docx, .txt, .rtf, .md                  |
| Spreadsheets   | .xls, .xlsx, .csv, .tsv                       |
| Presentations  | .ppt, .pptx                                   |
| Audio          | .mp3, .wav, .flac, .aac, etc.                 |
| Video          | .mp4, .avi, .mkv, .mov, etc.                  |
| Archives       | .zip, .rar, .7z, .tar.gz                      |
| Installers     | .exe, .msi                                    |
| Fonts          | .ttf, .otf, .woff                             |
| Design         | .psd, .ai, .eps, .indd                        |
| Code           | .py, .js, .html, .css, .json, etc.            |
| Data           | .db, .sqlite, .log                            |
| _Unsorted      | Everything else                               |

## Schedule It (Optional)

### Using Windows Task Scheduler
1. Open Task Scheduler (search "Task Scheduler" in Start)
2. Click **Create Basic Task**
3. Name it "Downloads Organizer"
4. Set trigger: Daily, or at logon, or whatever frequency you want
5. Action: **Start a Program**
   - Program: `python`
   - Arguments: `C:\path\to\claude-code-projects-or-automation-scripts\downloads-organizer\organizer.py`
6. Done

## Notes

- Only processes files directly in the target folder — does **not** recurse into subfolders
- Files modified less than 2 minutes ago are skipped (avoids grabbing in-progress downloads)
- Duplicate filenames get a `(1)`, `(2)` suffix automatically
- No dependencies beyond Python standard library — no `pip install` needed
