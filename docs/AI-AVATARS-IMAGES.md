# AI Companion avatars – images (Unsplash & Cloudinary)

## Current setup

Migration **041_ai_avatars.sql** seeds 12 companions with **Unsplash** portrait URLs:

- **Thumbnail**: `?w=180&h=180&fit=crop&crop=faces` (list / cards)
- **Portrait**: `?w=512&h=512&fit=crop&crop=faces` (larger display)

No API key required; Unsplash allows this CDN usage. If you haven’t run 041 yet, run:

```bash
cd tableshare-backend && npm run migrate
```

If **041 already ran** with the old placehold.co URLs, update to Unsplash in one go:

```sql
UPDATE ai_avatars SET
  portrait_url = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=512&h=512&fit=crop&crop=faces',
  thumbnail_url = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=180&h=180&fit=crop&crop=faces'
WHERE avatar_id = 'ava';

UPDATE ai_avatars SET
  portrait_url = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512&h=512&fit=crop&crop=faces',
  thumbnail_url = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=180&h=180&fit=crop&crop=faces'
WHERE avatar_id = 'leo';

-- (repeat for sam, kai, mia, ren, nia, dev, jay, zara, ellis, teo using the URLs from 041_ai_avatars.sql)
```

Or run a single migration file that only does `UPDATE` for existing rows (no new INSERT).

---

## Switching to Cloudinary

Since your images are in **Cloudinary**, you can replace Unsplash URLs with Cloudinary URLs.

### 1. Upload assets in Cloudinary

- For each companion (ava, leo, sam, …), upload:
  - One image (e.g. portrait).
- Optional: create a **thumbnail** transformation (e.g. 180×180, face crop) or upload a separate thumbnail image.

### 2. Get Cloudinary URLs

Typical formats:

- **Default (no transform):**  
  `https://res.cloudinary.com/<cloud_name>/image/upload/<public_id>.jpg`
- **With size/transform:**  
  `https://res.cloudinary.com/<cloud_name>/image/upload/w_180,h_180,c_fill,g_face/<public_id>.jpg`  
  (thumbnail: 180×180, fill, face crop)

Use your **cloud name** and **public_id** for each avatar.

### 3. Update the database

Run one `UPDATE` per avatar (or build a script):

```sql
-- Example: Ava’s thumbnail and portrait from Cloudinary
UPDATE ai_avatars
SET
  thumbnail_url = 'https://res.cloudinary.com/YOUR_CLOUD_NAME/image/upload/w_180,h_180,c_fill,g_face/v123/avatars/ava.jpg',
  portrait_url   = 'https://res.cloudinary.com/YOUR_CLOUD_NAME/image/upload/w_512,h_512,c_fill,g_face/v123/avatars/ava.jpg'
WHERE avatar_id = 'ava';
```

Repeat for: `leo`, `sam`, `kai`, `mia`, `ren`, `nia`, `dev`, `jay`, `zara`, `ellis`, `teo`.

### 4. Optional: one script to update all 12

If you use a naming convention in Cloudinary (e.g. `avatars/ava`, `avatars/leo`, …), you can run:

```sql
UPDATE ai_avatars SET
  thumbnail_url = 'https://res.cloudinary.com/YOUR_CLOUD_NAME/image/upload/w_180,h_180,c_fill,g_face/avatars/' || avatar_id || '.jpg',
  portrait_url  = 'https://res.cloudinary.com/YOUR_CLOUD_NAME/image/upload/w_512,h_512,c_fill,g_face/avatars/' || avatar_id || '.jpg';
```

(Adjust path/extension if your public_ids differ.)

---

## Summary

| Step | Action |
|------|--------|
| 1 | Migration 041 uses Unsplash URLs; run `npm run migrate` if needed. |
| 2 | To fix existing DB: run the `UPDATE` statements above for Unsplash (or re-run 041 if safe). |
| 3 | Upload your 12 portraits to Cloudinary. |
| 4 | Replace `thumbnail_url` and `portrait_url` in `ai_avatars` with your Cloudinary URLs (per-avatar or single script). |

No app code changes are required; the app reads `thumbnail_url` and `portrait_url` from the API.
