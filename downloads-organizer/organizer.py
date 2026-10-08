"""
Downloads Folder Organizer
Sorts files in your Downloads folder into subfolders by type.
Designed for Windows. Runs manually or on a schedule via Task Scheduler.

Usage:
    python organizer.py              # Sorts files, moves them
    python organizer.py --dry-run    # Shows what would happen, moves nothing
    python organizer.py --path "D:\MyDownloads"  # Use a custom folder
"""

import os
import shutil
import argparse
import logging
from pathlib import Path
from datetime import datetime

# ============================================================
# CONFIGURATION — edit these to fit your needs
# ============================================================

# File extension → folder name mapping.
# Add, remove, or rename categories as needed.
# Extensions not listed here go into the UNSORTED_FOLDER.

FILE_CATEGORIES = {
    "PDFs": [".pdf"],
    "Images": [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".svg", ".webp", ".ico", ".heic"],
    "Documents": [".doc", ".docx", ".odt", ".rtf", ".txt", ".md"],
    "Spreadsheets": [".xls", ".xlsx", ".xlsm", ".csv", ".ods", ".tsv"],
    "Presentations": [".ppt", ".pptx", ".odp"],
    "Audio": [".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a"],
    "Video": [".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm", ".m4v"],
    "Archives": [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"],
    "Installers": [".exe", ".msi", ".dmg", ".deb", ".rpm"],
    "Fonts": [".ttf", ".otf", ".woff", ".woff2"],
    "Design": [".psd", ".ai", ".eps", ".indd", ".sketch", ".fig"],
    "Code": [".py", ".js", ".ts", ".html", ".css", ".json", ".xml", ".yml", ".yaml", ".sql", ".sh", ".bat"],
    "Data": [".db", ".sqlite", ".bak", ".dat", ".log"],
}

# Files that don't match any category go here
UNSORTED_FOLDER = "_Unsorted"

# Files/folders to never touch
IGNORE_LIST = [
    "desktop.ini",
    "thumbs.db",
    ".ds_store",
]

# Minimum file age in minutes before organizing (0 = organize immediately)
# Useful to avoid moving files that are still being downloaded
MIN_FILE_AGE_MINUTES = 2

# ============================================================
# END CONFIGURATION
# ============================================================


def get_default_downloads_path():
    """Get the default Downloads folder path for the current OS."""
    home = Path.home()
    downloads = home / "Downloads"
    if downloads.exists():
        return downloads
    # Fallback: just use home directory
    return home


def build_extension_map(categories):
    """Invert the categories dict into extension → folder_name lookup."""
    ext_map = {}
    for folder_name, extensions in categories.items():
        for ext in extensions:
            ext_map[ext.lower()] = folder_name
    return ext_map


def get_file_age_minutes(filepath):
    """Return how many minutes ago the file was last modified."""
    mtime = os.path.getmtime(filepath)
    age_seconds = datetime.now().timestamp() - mtime
    return age_seconds / 60


def should_ignore(filename):
    """Check if a file should be skipped."""
    return filename.lower() in [f.lower() for f in IGNORE_LIST]


def organize(target_dir, dry_run=False):
    """
    Main organizer logic.

    Args:
        target_dir: Path to the folder to organize
        dry_run: If True, only log what would happen without moving files

    Returns:
        dict with counts: moved, skipped, errors
    """
    target_path = Path(target_dir)

    if not target_path.exists():
        logging.error(f"Directory does not exist: {target_path}")
        return {"moved": 0, "skipped": 0, "errors": 1}

    ext_map = build_extension_map(FILE_CATEGORIES)
    stats = {"moved": 0, "skipped": 0, "errors": 0}

    # Only process files directly in the target directory (not subdirectories)
    for item in target_path.iterdir():
        # Skip directories
        if item.is_dir():
            continue

        # Skip ignored files
        if should_ignore(item.name):
            logging.debug(f"Ignored: {item.name}")
            stats["skipped"] += 1
            continue

        # Skip files that are too new (might still be downloading)
        if MIN_FILE_AGE_MINUTES > 0:
            age = get_file_age_minutes(item)
            if age < MIN_FILE_AGE_MINUTES:
                logging.info(f"Too new ({age:.1f} min): {item.name}")
                stats["skipped"] += 1
                continue

        # Determine destination folder
        ext = item.suffix.lower()
        folder_name = ext_map.get(ext, UNSORTED_FOLDER)
        dest_dir = target_path / folder_name
        dest_file = dest_dir / item.name

        # Handle duplicate filenames
        if dest_file.exists():
            stem = item.stem
            counter = 1
            while dest_file.exists():
                dest_file = dest_dir / f"{stem} ({counter}){ext}"
                counter += 1

        # Move or log
        if dry_run:
            logging.info(f"[DRY RUN] {item.name} → {folder_name}/")
            stats["moved"] += 1
        else:
            try:
                dest_dir.mkdir(exist_ok=True)
                shutil.move(str(item), str(dest_file))
                logging.info(f"Moved: {item.name} → {folder_name}/")
                stats["moved"] += 1
            except Exception as e:
                logging.error(f"Failed to move {item.name}: {e}")
                stats["errors"] += 1

    return stats


def main():
    parser = argparse.ArgumentParser(
        description="Organize your Downloads folder by file type."
    )
    parser.add_argument(
        "--path",
        type=str,
        default=None,
        help="Path to organize (default: ~/Downloads)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would happen without moving files"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show extra detail"
    )

    args = parser.parse_args()

    # Set up logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Determine target directory
    target_dir = args.path if args.path else get_default_downloads_path()

    mode_label = "DRY RUN" if args.dry_run else "LIVE"
    logging.info(f"=== Downloads Organizer [{mode_label}] ===")
    logging.info(f"Target: {target_dir}")
    logging.info("")

    stats = organize(target_dir, dry_run=args.dry_run)

    logging.info("")
    logging.info(f"Done. Moved: {stats['moved']}  Skipped: {stats['skipped']}  Errors: {stats['errors']}")

    if args.dry_run and stats["moved"] > 0:
        logging.info("(No files were actually moved — run without --dry-run to execute)")


if __name__ == "__main__":
    main()
