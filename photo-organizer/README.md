# Photo Organizer

Uses Claude's vision API to sort photos into category folders with descriptive filenames. Each source folder gets its own set of subfolders — nothing gets merged across folders.

## Setup

```
pip install anthropic pillow pyyaml
```

Optional HEIC support (iPhone photos):
```
pip install pillow-heif
```

Your `ANTHROPIC_API_KEY` environment variable must be set.

## Configuration

Edit `config.yaml` to add your photo folders:

```yaml
source_folders:
  - C:\Users\Chris\Pictures\Camera Roll
  - C:\Users\Chris\Pictures\Phone Backup
```

That's the only required change. The rest of the config has sensible defaults.

## Usage

**Preview first (recommended):**
```
python organizer.py --dry-run
```

**Estimate API cost before running:**
```
python organizer.py --estimate
```

**Run it for real:**
```
python organizer.py
```

## What it does

1. Scans each source folder for image files (jpg, png, heic, etc.)
2. Sends each image to Claude Haiku for classification
3. Moves the image into a category subfolder (People, Landscapes, Food, etc.)
4. Renames it with a short description (e.g. `sunset_over_mountain_lake.jpg`)

Result:
```
Camera Roll/
├── People/
│   ├── man_at_work_desk.jpg
│   └── woman_in_garden.jpg
├── Groups/
│   ├── family_at_baseball_game.jpg
│   └── friends_at_restaurant.jpg
├── Landscapes/
│   └── sunset_over_mountain_lake.jpg
├── Food/
│   └── grilled_steak_dinner.jpg
├── Screenshots/
│   └── text_message_conversation.png
└── Other/
    └── abstract_blurry_photo.jpg
```

## Cost

Uses Claude Haiku 5.5 by default — the cheapest model. Rough cost:

| Photos | Estimated cost |
|--------|---------------|
| 100    | ~$0.01        |
| 1,000  | ~$0.10        |
| 10,000 | ~$1.00        |

Run `--estimate` on your actual folders for a real number.

## Options

| Flag | What it does |
|------|-------------|
| `--dry-run` | Shows what would happen, moves nothing |
| `--estimate` | Prints cost estimate and exits |
| `--config path/to/config.yaml` | Use a different config file |
| `--verbose` | Extra logging detail |

## Config reference

See `config.yaml` for all options. Key settings:

- **`categories`** — The folder names Claude sorts into. Add or remove as needed.
- **`organize.move_files`** — `true` moves files, `false` copies them (doubles disk space).
- **`organize.rename_files`** — `true` gives descriptive names, `false` keeps originals.
- **`images.max_dimension`** — Resize before sending to API. Lower = cheaper. 768 is a good balance.
- **`api.model`** — Change to `claude-sonnet-5-5` for better accuracy (costs more).
