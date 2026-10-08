"""
Photo Organizer
Uses Claude's vision API to categorize and label photos into descriptive folders.
Designed for Windows. Processes each source folder independently.

Usage:
    python organizer.py                    # Organize photos
    python organizer.py --dry-run          # Preview without moving
    python organizer.py --config my.yaml   # Use custom config file
    python organizer.py --estimate         # Estimate API cost, move nothing

Requires:
    pip install anthropic pillow pyyaml pillow-heif
"""

import os
import sys
import json
import time
import base64
import argparse
import logging
import re
from io import BytesIO
from pathlib import Path

import yaml
import anthropic
from PIL import Image

# Try to load HEIC/HEIF support — optional
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    HEIC_SUPPORTED = True
except ImportError:
    HEIC_SUPPORTED = False

# ============================================================
# Defaults (overridden by config.yaml)
# ============================================================

DEFAULT_CONFIG_PATH = Path(__file__).parent / "config.yaml"

DEFAULT_CATEGORIES = [
    "People", "Groups", "Selfies", "Kids", "Landscapes", "Nature",
    "Pets", "Food", "Events", "Work", "Screenshots", "Documents",
    "Memes", "Art", "Vehicles", "Buildings", "Other",
]

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".heic", ".heif", ".bmp", ".tiff", ".tif",
}

# Extensions the Claude API accepts directly
API_SUPPORTED = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


# ============================================================
# Config loading
# ============================================================

def load_config(config_path):
    """Load and validate the YAML config file."""
    path = Path(config_path)
    if not path.exists():
        logging.warning(f"Config not found at {path}, using defaults.")
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def get_setting(config, *keys, default=None):
    """Drill into nested config keys, returning default if missing."""
    node = config
    for key in keys:
        if isinstance(node, dict):
            node = node.get(key)
        else:
            return default
        if node is None:
            return default
    return node


# ============================================================
# Image handling
# ============================================================

def prepare_image(filepath, max_dim=768):
    """
    Load an image, convert to JPEG if needed, resize, and return
    (base64_data, media_type). Returns (None, None) on failure.
    """
    try:
        img = Image.open(filepath)
    except Exception as e:
        logging.error(f"Cannot open {filepath.name}: {e}")
        return None, None

    # Convert palette / RGBA / other modes to RGB for JPEG output
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Resize if larger than max_dim on either side
    w, h = img.size
    if max(w, h) > max_dim:
        ratio = max_dim / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    # Encode as JPEG
    buffer = BytesIO()
    img.save(buffer, format="JPEG", quality=85)
    b64 = base64.standard_b64encode(buffer.getvalue()).decode("utf-8")
    return b64, "image/jpeg"


def estimate_image_tokens(filepath, max_dim=768):
    """Rough token estimate for an image. Used for cost estimation."""
    try:
        img = Image.open(filepath)
        w, h = img.size
        if max(w, h) > max_dim:
            ratio = max_dim / max(w, h)
            w, h = int(w * ratio), int(h * ratio)
        # Anthropic's rough formula: (w * h) / 750
        return max(int((w * h) / 750), 85)
    except Exception:
        return 1000  # fallback estimate


# ============================================================
# Claude API interaction
# ============================================================

def build_prompt(categories):
    """Build the classification prompt."""
    cat_list = ", ".join(categories)
    return (
        "Categorize this photo. Respond with ONLY a JSON object, no markdown, "
        "no explanation.\n\n"
        "Fields:\n"
        '- "category": one of [' + cat_list + "]\n"
        '- "description": 2-5 word description for a filename '
        "(lowercase, underscores, no extension)\n"
        '- "people_count": number of people visible (0 if none)\n\n'
        "Example: "
        '{"category": "Landscapes", "description": "sunset_over_mountain_lake", '
        '"people_count": 0}'
    )


def classify_photo(client, filepath, categories, config):
    """
    Send a photo to Claude and get back its category and description.
    Returns dict with category, description, people_count — or None on failure.
    """
    model = get_setting(config, "api", "model", default="claude-haiku-5-5")
    max_tokens = get_setting(config, "api", "max_tokens", default=150)
    max_dim = get_setting(config, "images", "max_dimension", default=768)

    b64_data, media_type = prepare_image(filepath, max_dim)
    if b64_data is None:
        return None

    prompt = build_prompt(categories)

    try:
        message = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": b64_data,
                            },
                        },
                        {
                            "type": "text",
                            "text": prompt,
                        },
                    ],
                }
            ],
        )

        raw = message.content[0].text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)

        result = json.loads(raw)

        # Validate category
        if result.get("category") not in categories:
            result["category"] = "Other"

        return result

    except json.JSONDecodeError:
        logging.error(f"Bad JSON from API for {filepath.name}: {raw}")
        return None
    except anthropic.RateLimitError:
        logging.warning("Rate limited — waiting 30s...")
        time.sleep(30)
        return classify_photo(client, filepath, categories, config)
    except Exception as e:
        logging.error(f"API error for {filepath.name}: {e}")
        return None


# ============================================================
# File operations
# ============================================================

def sanitize_filename(description, max_length=60):
    """Clean a description string into a safe filename stem."""
    # Keep only alphanumeric, underscores, hyphens
    clean = re.sub(r"[^a-z0-9_\-]", "_", description.lower().strip())
    # Collapse multiple underscores
    clean = re.sub(r"_+", "_", clean).strip("_")
    return clean[:max_length] if clean else "photo"


def move_or_copy_file(src, dest_dir, new_stem, move=True):
    """
    Move or copy src into dest_dir with the new stem, preserving extension.
    Handles duplicate names. Returns the final destination path.
    """
    ext = src.suffix.lower()
    # Normalize extension for common variants
    if ext in (".jpeg",):
        ext = ".jpg"
    elif ext in (".tiff",):
        ext = ".tif"
    elif ext in (".heif",):
        ext = ".heic"

    dest = dest_dir / f"{new_stem}{ext}"

    # Handle duplicates
    counter = 1
    while dest.exists():
        dest = dest_dir / f"{new_stem}_{counter}{ext}"
        counter += 1

    dest_dir.mkdir(parents=True, exist_ok=True)

    if move:
        import shutil
        shutil.move(str(src), str(dest))
    else:
        import shutil
        shutil.copy2(str(src), str(dest))

    return dest


# ============================================================
# Main organizer logic
# ============================================================

def collect_images(folder, extensions):
    """Gather all image files in a folder (non-recursive)."""
    images = []
    folder = Path(folder)
    if not folder.exists():
        logging.error(f"Folder not found: {folder}")
        return images

    for item in sorted(folder.iterdir()):
        if item.is_file() and item.suffix.lower() in extensions:
            # Skip files already in a category subfolder
            images.append(item)
    return images


def estimate_cost(images, config):
    """Estimate the API cost for a set of images."""
    max_dim = get_setting(config, "images", "max_dimension", default=768)
    total_input_tokens = 0
    for img_path in images:
        total_input_tokens += estimate_image_tokens(img_path, max_dim)
    # Add ~50 tokens per image for the text prompt
    total_input_tokens += len(images) * 50
    # Output: ~40 tokens per response (short JSON)
    total_output_tokens = len(images) * 40

    # Haiku 5.5 pricing
    model = get_setting(config, "api", "model", default="claude-haiku-5-5")
    if "haiku" in model.lower():
        input_cost_per_m = 0.10
        output_cost_per_m = 0.50
    elif "sonnet" in model.lower():
        input_cost_per_m = 3.00
        output_cost_per_m = 15.00
    else:
        # Default to sonnet-ish pricing as safe estimate
        input_cost_per_m = 3.00
        output_cost_per_m = 15.00

    input_cost = (total_input_tokens / 1_000_000) * input_cost_per_m
    output_cost = (total_output_tokens / 1_000_000) * output_cost_per_m

    return {
        "images": len(images),
        "input_tokens": total_input_tokens,
        "output_tokens": total_output_tokens,
        "input_cost": input_cost,
        "output_cost": output_cost,
        "total_cost": input_cost + output_cost,
        "model": model,
    }


def organize_folder(folder_path, config, client, dry_run=False):
    """Process a single source folder."""
    folder = Path(folder_path).expanduser().resolve()
    categories = get_setting(config, "categories", default=DEFAULT_CATEGORIES)
    extensions = set(
        get_setting(config, "images", "extensions", default=list(IMAGE_EXTENSIONS))
    )
    do_move = get_setting(config, "organize", "move_files", default=True)
    do_rename = get_setting(config, "organize", "rename_files", default=True)
    max_name_len = get_setting(config, "organize", "max_name_length", default=60)
    delay = get_setting(config, "organize", "delay_between_calls", default=0.3)

    if not HEIC_SUPPORTED:
        heic_exts = {".heic", ".heif"}
        if extensions & heic_exts:
            logging.warning(
                "HEIC support unavailable (install pillow-heif). "
                "Skipping .heic/.heif files."
            )
            extensions -= heic_exts

    images = collect_images(folder, extensions)
    if not images:
        logging.info(f"  No images found in {folder}")
        return {"processed": 0, "skipped": 0, "errors": 0}

    logging.info(f"  Found {len(images)} images")

    stats = {"processed": 0, "skipped": 0, "errors": 0}

    for i, img_path in enumerate(images, 1):
        label = f"[{i}/{len(images)}]"
        logging.info(f"  {label} Analyzing {img_path.name}...")

        result = classify_photo(client, img_path, categories, config)

        if result is None:
            logging.error(f"  {label} Failed — skipping")
            stats["errors"] += 1
            continue

        category = result.get("category", "Other")
        description = result.get("description", img_path.stem)

        if do_rename:
            new_stem = sanitize_filename(description, max_name_len)
        else:
            new_stem = img_path.stem

        dest_dir = folder / category
        action = "Move" if do_move else "Copy"

        if dry_run:
            logging.info(
                f"  {label} [DRY RUN] {action}: {img_path.name} "
                f"→ {category}/{new_stem}{img_path.suffix.lower()}"
            )
            stats["processed"] += 1
        else:
            try:
                final_dest = move_or_copy_file(
                    img_path, dest_dir, new_stem, move=do_move
                )
                logging.info(
                    f"  {label} {action}d: {img_path.name} → "
                    f"{category}/{final_dest.name}"
                )
                stats["processed"] += 1
            except Exception as e:
                logging.error(f"  {label} Error moving {img_path.name}: {e}")
                stats["errors"] += 1

        # Rate limit pause
        if delay > 0 and i < len(images):
            time.sleep(delay)

    return stats


# ============================================================
# Entry point
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Organize photos using Claude's vision API."
    )
    parser.add_argument(
        "--config",
        type=str,
        default=str(DEFAULT_CONFIG_PATH),
        help="Path to config.yaml (default: config.yaml next to this script)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would happen without moving/copying files",
    )
    parser.add_argument(
        "--estimate",
        action="store_true",
        help="Estimate API cost and exit (no files touched)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show extra detail",
    )

    args = parser.parse_args()

    # Logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Load config
    config = load_config(args.config)
    source_folders = get_setting(config, "source_folders", default=[])

    if not source_folders:
        logging.error(
            "No source_folders defined in config. "
            "Edit config.yaml and add your photo folder paths."
        )
        sys.exit(1)

    # Resolve paths
    resolved = []
    for f in source_folders:
        p = Path(f).expanduser().resolve()
        if p.exists():
            resolved.append(p)
        else:
            logging.warning(f"Folder not found, skipping: {f}")

    if not resolved:
        logging.error("None of the source folders exist.")
        sys.exit(1)

    # Estimate mode
    if args.estimate:
        extensions = set(
            get_setting(config, "images", "extensions", default=list(IMAGE_EXTENSIONS))
        )
        all_images = []
        for folder in resolved:
            all_images.extend(collect_images(folder, extensions))

        if not all_images:
            logging.info("No images found across all source folders.")
            sys.exit(0)

        est = estimate_cost(all_images, config)
        logging.info("=== Cost Estimate ===")
        logging.info(f"Images:        {est['images']}")
        logging.info(f"Model:         {est['model']}")
        logging.info(f"Input tokens:  ~{est['input_tokens']:,}")
        logging.info(f"Output tokens: ~{est['output_tokens']:,}")
        logging.info(f"Input cost:    ${est['input_cost']:.4f}")
        logging.info(f"Output cost:   ${est['output_cost']:.4f}")
        logging.info(f"Total cost:    ${est['total_cost']:.4f}")
        sys.exit(0)

    # Verify API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logging.error(
            "ANTHROPIC_API_KEY environment variable not set. "
            "Set it before running:\n"
            '  set ANTHROPIC_API_KEY=sk-ant-...\n'
            "Or add it permanently via System > Environment Variables."
        )
        sys.exit(1)

    client = anthropic.Anthropic()

    # Run
    mode_label = "DRY RUN" if args.dry_run else "LIVE"
    logging.info(f"=== Photo Organizer [{mode_label}] ===")
    if not HEIC_SUPPORTED:
        logging.info("(HEIC support: not installed — run: pip install pillow-heif)")
    logging.info("")

    total_stats = {"processed": 0, "skipped": 0, "errors": 0}

    for folder in resolved:
        logging.info(f"Processing: {folder}")
        stats = organize_folder(folder, config, client, dry_run=args.dry_run)
        for key in total_stats:
            total_stats[key] += stats[key]
        logging.info("")

    logging.info("=== Summary ===")
    logging.info(
        f"Processed: {total_stats['processed']}  "
        f"Skipped: {total_stats['skipped']}  "
        f"Errors: {total_stats['errors']}"
    )

    if args.dry_run and total_stats["processed"] > 0:
        logging.info("(No files were moved — run without --dry-run to execute)")


if __name__ == "__main__":
    main()
